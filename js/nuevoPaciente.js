import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  crearPacienteProvisional
} from "./services/usuarios.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

let uidMedico = "";
let medicoActualDatos = {};

iniciarMonitoreoSesion("Nuevo paciente");

function esAnioBisiesto(anio) {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function parsearFechaNacimientoISO(fechaNacimiento) {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaNacimiento || "");
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const fecha = new Date(anio, mes - 1, dia);

  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }

  return { anio, mes, dia };
}

function calcularEdad(fechaNacimiento, fechaReferencia = new Date()) {
  const nacimiento = parsearFechaNacimientoISO(fechaNacimiento);
  if (!nacimiento) return "";

  const hoy = {
    anio: fechaReferencia.getFullYear(),
    mes: fechaReferencia.getMonth() + 1,
    dia: fechaReferencia.getDate()
  };
  let diaCumple = nacimiento.dia;

  if (nacimiento.mes === 2 && nacimiento.dia === 29 && !esAnioBisiesto(hoy.anio)) {
    diaCumple = 28;
  }

  let edad = hoy.anio - nacimiento.anio;
  if (hoy.mes < nacimiento.mes || (hoy.mes === nacimiento.mes && hoy.dia < diaCumple)) {
    edad -= 1;
  }

  return edad >= 0 ? edad : "";
}

function obtenerNombreProfesional(usuario = {}, firebaseUser = null) {
  return (
    usuario.nombreProfesional ||
    usuario.medicoNombre ||
    usuario.nombreCompleto ||
    usuario.nombre ||
    usuario.displayName ||
    firebaseUser?.displayName ||
    ""
  ).trim();
}

function valorEdadManual() {
  return document.getElementById("edadManual")?.value.trim() || "";
}

function ponerAyudaEdad(texto = "Si no hay fecha de nacimiento, puedes escribirla manualmente.") {
  const ayuda = document.getElementById("ayudaEdad");
  if (ayuda) ayuda.textContent = texto;
}

function sincronizarEdadConFecha(origen = "fecha") {
  const fechaInput = document.getElementById("fechaNacimiento");
  const edadInput = document.getElementById("edadManual");
  if (!fechaInput || !edadInput) return;

  const fechaNacimiento = fechaInput.value;
  const edadCalculada = calcularEdad(fechaNacimiento);
  const edadEscrita = Number(edadInput.value);
  const tieneEdadEscrita = edadInput.value.trim() !== "" && Number.isFinite(edadEscrita);
  const fechaCompleta = /^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento);

  if (!fechaNacimiento) {
    ponerAyudaEdad("Edad manual. Si agregas fecha de nacimiento, se validara la coincidencia.");
    return;
  }

  if (!fechaCompleta || edadCalculada === "") {
    ponerAyudaEdad("No se pudo calcular la edad con esa fecha.");
    return;
  }

  if (origen === "edad" && tieneEdadEscrita && edadEscrita !== Number(edadCalculada)) {
    alert("La edad escrita no coincide con la fecha de nacimiento. Se borrara la fecha de nacimiento y se conservara la edad manual.");
    fechaInput.value = "";
    ponerAyudaEdad("Edad manual conservada. La fecha de nacimiento fue borrada por no coincidir.");
    return;
  }

  if (origen === "fecha" || !tieneEdadEscrita) {
    edadInput.value = edadCalculada;
  }
  ponerAyudaEdad(`Edad calculada automaticamente: ${edadCalculada} anos.`);
}

function numeroClinico(valor = "") {
  const numero = Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function calcularIMCNuevoPaciente() {
  const peso = numeroClinico(document.getElementById("peso")?.value || "");
  const talla = numeroClinico(document.getElementById("talla")?.value || "");
  const campoIMC = document.getElementById("imc");

  if (!campoIMC) return "";

  if (!peso || !talla) {
    campoIMC.value = "";
    return "";
  }

  const imc = peso / (talla * talla);
  const imcTexto = imc.toFixed(2);
  campoIMC.value = imcTexto;
  return imcTexto;
}

function obtenerTipoPacienteNuevo() {
  const selector = document.getElementById("tipoPaciente");
  const manual = document.getElementById("tipoPacienteManual");
  const valor = selector?.value || "privada";

  if (valor === "otro") {
    return manual?.value.trim() || "otro";
  }

  return valor;
}

function actualizarVistaTipoPacienteNuevo() {
  const selector = document.getElementById("tipoPaciente");
  const manual = document.getElementById("tipoPacienteManual");
  const esInstitucional = selector?.value === "institucion";
  const esOtro = selector?.value === "otro";

  document.querySelectorAll(".campo-institucional-nuevo").forEach((campo) => {
    campo.classList.toggle("campo-condicional-oculto", !esInstitucional);
  });

  manual?.classList.toggle("campo-condicional-oculto", !esOtro);
}

function obtenerExpedienteCognicion(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return paciente.expedienteCognicion || institucional.expedienteCognicion || "";
}

function normalizarFechaIngreso(valor = "") {
  const limpio = String(valor).trim();
  if (!limpio) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio;

  const coincidencia = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(limpio);
  if (!coincidencia) return limpio;

  const [, dia, mes, anio, hora = "00", minuto = "00"] = coincidencia;
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`;
}

function formatearIngresoVisible(fecha, hora = "") {
  if (!fecha) return "";

  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return fecha;

  return hora ? `${dia}/${mes}/${anio} ${hora}` : `${dia}/${mes}/${anio}`;
}

function abrirSelectorIngresoNuevo() {
  const modal = document.getElementById("modalIngresoNuevo");
  if (!modal) return;

  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarSelectorIngresoNuevo() {
  const modal = document.getElementById("modalIngresoNuevo");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function aplicarIngresoNuevo() {
  const fecha = document.getElementById("ingresoNuevoFecha")?.value || "";
  const hora = document.getElementById("ingresoNuevoHora")?.value || "";

  if (!fecha) {
    alert("Selecciona el dia de ingreso.");
    return;
  }

  document.getElementById("fechaIngreso").value = formatearIngresoVisible(fecha, hora);
  cerrarSelectorIngresoNuevo();
}

function limpiarIngresoNuevo() {
  const input = document.getElementById("fechaIngreso");
  if (input) input.value = "";
  const fecha = document.getElementById("ingresoNuevoFecha");
  const hora = document.getElementById("ingresoNuevoHora");
  if (fecha) fecha.value = "";
  if (hora) hora.value = "";
  cerrarSelectorIngresoNuevo();
}

async function generarExpedienteCognicion() {
  const anio = String(new Date().getFullYear()).slice(-2);
  const snap = await getDocs(collection(db, "usuarios"));
  let consecutivoMayor = 999;

  snap.forEach((docPaciente) => {
    const expediente = obtenerExpedienteCognicion(docPaciente.data());
    const coincidencia = /^C(\d+)-(\d{2})$/.exec(expediente);

    if (!coincidencia || coincidencia[2] !== anio) return;

    consecutivoMayor = Math.max(consecutivoMayor, Number(coincidencia[1]));
  });

  return `C${consecutivoMayor + 1}-${anio}`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uidMedico = user.uid;

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || !["medico", "psicologo", "admin"].includes(usuario.rol)) {
    alert("Acceso restringido al personal clinico");
    window.location.href = "dashboard.html";
    return;
  }

  medicoActualDatos = usuario;
  const nombreProfesional = obtenerNombreProfesional(usuario, user);
  const medicoTratanteInput = document.getElementById("medicoTratante");
  if (medicoTratanteInput && !medicoTratanteInput.value.trim()) {
    medicoTratanteInput.value = nombreProfesional;
    medicoTratanteInput.placeholder = nombreProfesional ? "Médico tratante" : "Configura tu nombre profesional";
  }

document.getElementById("abrirIngresoNuevo")?.addEventListener("click", abrirSelectorIngresoNuevo);
document.getElementById("cerrarIngresoNuevo")?.addEventListener("click", cerrarSelectorIngresoNuevo);
document.getElementById("guardarIngresoNuevo")?.addEventListener("click", aplicarIngresoNuevo);
document.getElementById("limpiarIngresoNuevo")?.addEventListener("click", limpiarIngresoNuevo);
document.getElementById("fechaNacimiento")?.addEventListener("change", () => sincronizarEdadConFecha("fecha"));
document.getElementById("edadManual")?.addEventListener("change", () => sincronizarEdadConFecha("edad"));
document.getElementById("edadManual")?.addEventListener("blur", () => sincronizarEdadConFecha("edad"));
document.getElementById("tipoPaciente")?.addEventListener("change", actualizarVistaTipoPacienteNuevo);
actualizarVistaTipoPacienteNuevo();
["peso", "talla"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", calcularIMCNuevoPaciente);
  document.getElementById(id)?.addEventListener("change", calcularIMCNuevoPaciente);
});
document.getElementById("modalIngresoNuevo")?.addEventListener("click", (e) => {
  if (e.target.id === "modalIngresoNuevo") cerrarSelectorIngresoNuevo();
});

window.guardarPacienteNuevo = async function() {
  sincronizarEdadConFecha("guardar");
  const fechaNacimiento = document.getElementById("fechaNacimiento").value;
  const edadManual = !fechaNacimiento ? valorEdadManual() : "";
  const tipoPaciente = obtenerTipoPacienteNuevo();
  const esInstitucional = tipoPaciente === "institucion";
  const institucionPaciente = esInstitucional ? document.getElementById("institucionPaciente")?.value || "" : "";
  const servicioInstitucional = esInstitucional ? document.getElementById("servicioInstitucional")?.value || "" : "";
  const expediente = esInstitucional ? document.getElementById("expediente")?.value || "" : "";
  const cama = esInstitucional ? document.getElementById("cama")?.value || "" : "";
  const fechaIngreso = esInstitucional ? normalizarFechaIngreso(document.getElementById("fechaIngreso")?.value || "") : "";
  const genero = document.getElementById("genero")?.value || "";
  const alergias = document.getElementById("alergias")?.value || "";
  const tipoSangre = document.getElementById("tipoSangre")?.value || "";
  const peso = document.getElementById("peso")?.value || "";
  const talla = document.getElementById("talla")?.value || "";
  const imc = calcularIMCNuevoPaciente();
  const perimetroAbdominal = document.getElementById("perimetroAbdominal")?.value || "";
  const diasEstancia = document.getElementById("diasEstancia")?.value || "";
  const expedienteCognicion = await generarExpedienteCognicion();
  const signosVitales = {
    peso,
    talla,
    imc,
    perimetroAbdominal
  };
  const somatometria = {
    peso,
    talla,
    imc,
    perimetroAbdominal
  };

  const medicoTratanteNombre = document.getElementById("medicoTratante")?.value.trim() || obtenerNombreProfesional(medicoActualDatos, auth.currentUser);

  const paciente = {
    nombre: document.getElementById("nombre").value,
    expedienteCognicion,
    fechaNacimiento,
    edadManual,
    sexo: document.getElementById("sexo").value,
    genero,
    curp: document.getElementById("curp").value,
    telefono: document.getElementById("telefono").value,
    email: document.getElementById("email").value,
    estadoCivil: document.getElementById("estadoCivil").value,
    escolaridad: document.getElementById("escolaridad").value,
    ocupacion: document.getElementById("ocupacion").value,
    tipoPaciente,
    institucionPaciente,
    institucion: institucionPaciente,
    servicioInstitucional,
    servicio: servicioInstitucional,
    expediente,
    numeroExpediente: expediente,
    cama,
    fechaIngreso,
    alergias,
    tipoSangre,
    peso,
    talla,
    imc,
    perimetroAbdominal,
    signosVitales,
    somatometria,
    diasEstancia,
    datosInstitucionales: {
      nombrePaciente: document.getElementById("nombre").value,
      expedienteCognicion,
      tipoPaciente,
      institucionPaciente,
      servicioInstitucional,
      expediente,
      cama,
      fechaIngreso,
      fechaNacimiento,
      edadManual,
      sexo: document.getElementById("sexo").value,
      genero,
      alergias,
      tipoSangre,
      peso,
      talla,
      imc,
      perimetroAbdominal,
      diasEstancia
    },
    medicoTratante: medicoTratanteNombre,
    medicoTratanteNombre,
    diagnostico: document.getElementById("diagnostico").value,
    ultimaConsulta: document.getElementById("ultimaConsulta").value,
    tratamiento: document.getElementById("tratamiento").value,
    observaciones: document.getElementById("observaciones").value,
    creadoPor: uidMedico,
    ownerUid: uidMedico,
    createdByUid: uidMedico,
    medicoUid: uidMedico,
    medicoTratanteUid: uidMedico,
    medicosAutorizados: Array.from(new Set([uidMedico].filter(Boolean)))
  };

  if (!paciente.nombre) {
    alert("Escribe el nombre del paciente");
    return;
  }

  try {
    const refPaciente = await crearPacienteProvisional(paciente);
    const medico = await obtenerUsuario(uidMedico);

    await registrarEventoAuditoria({
      accion: "crear_paciente_provisional",
      modulo: "Nuevo paciente",
      descripcion: "El medico creo un paciente provisional.",
      usuarioUid: uidMedico,
      usuarioNombre: medico?.nombre || "",
      usuarioRol: medico?.rol || "medico",
      pacienteUid: refPaciente.id,
      pacienteNombre: paciente.nombre || "",
      exito: true,
      detalles: {
        email: paciente.email || "",
        tieneFechaNacimiento: Boolean(paciente.fechaNacimiento)
      }
    });

    alert("Paciente creado correctamente");
    window.location.href = "medico.html";

  } catch(error) {
    alert("Error: " + error.message);
  }
}
})
