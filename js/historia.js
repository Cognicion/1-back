import { auth } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  actualizarUsuario
} from "./services/usuarios.js";

import {
  guardarHistoriaClinica,
  obtenerHistoriaClinica
} from "./services/historias.js";

let uidPaciente = null;
let pacienteActual = {};

iniciarMonitoreoSesion("Historia clinica");

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? edad : "";
}

function obtenerFechaNacimiento(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    ""
  );
}

function valorInstitucional(paciente = {}, campo, alternos = []) {
  const institucional = paciente.datosInstitucionales || {};
  const signosVitales = paciente.signosVitales || {};
  const somatometria = paciente.somatometria || {};
  const claves = [campo, ...alternos];

  for (const clave of claves) {
    const valor = paciente[clave] ?? institucional[clave] ?? signosVitales[clave] ?? somatometria[clave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return "";
}

function inferirTipoPaciente(paciente = {}) {
  const tipoGuardado = valorInstitucional(paciente, "tipoPaciente");
  if (tipoGuardado) return tipoGuardado;

  const institucion = valorInstitucional(paciente, "institucionPaciente", ["institucion"]);
  return institucion ? "institucion" : "privada";
}

function campoConRespaldo(datos = {}, paciente = {}, campo, alternos = []) {
  const valorFormulario = datos[campo];
  if (valorFormulario !== undefined && valorFormulario !== null && String(valorFormulario).trim() !== "") {
    return valorFormulario;
  }

  return valorInstitucional(paciente, campo, alternos);
}

function numeroClinico(valor = "") {
  const numero = Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function calcularIMCHistoria() {
  const peso = numeroClinico(document.getElementById("peso")?.value || "");
  const talla = numeroClinico(document.getElementById("talla")?.value || "");
  const campoIMC = document.getElementById("imc");
  if (!campoIMC || !peso || !talla) return;
  campoIMC.value = (peso / (talla * talla)).toFixed(2);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

 if (!usuario || (usuario.rol !== "admin" && !usuarioEsPersonalClinico(usuario.rol))) {
  alert("Acceso restringido al personal clinico");
  window.location.href = "dashboard.html";
  return;
}

  const parametros = new URLSearchParams(window.location.search);
  uidPaciente = parametros.get("id");
  if (!uidPaciente) return;

  await cargarPaciente();
  await cargarHistoria();
});

async function cargarPaciente() {
  const paciente = await obtenerUsuario(uidPaciente);
  if (!paciente) return;
  pacienteActual = paciente;

  document.getElementById("nombrePaciente").textContent =
    obtenerNombrePacienteParaMostrar(paciente) || "Paciente";

  document.getElementById("datosPaciente").textContent =
    `${calcularEdad(obtenerFechaNacimiento(paciente)) || ""} anos`;
}

async function cargarHistoria() {
  const historia = await obtenerHistoriaClinica(uidPaciente);
  const raiz = {
    tipoPaciente: inferirTipoPaciente(pacienteActual),
    institucionPaciente: valorInstitucional(pacienteActual, "institucionPaciente", ["institucion"]),
    servicioInstitucional: valorInstitucional(pacienteActual, "servicioInstitucional", ["servicio"]),
    expediente: valorInstitucional(pacienteActual, "expediente", ["numeroExpediente"]),
    cama: valorInstitucional(pacienteActual, "cama"),
    sexo: valorInstitucional(pacienteActual, "sexo"),
    genero: valorInstitucional(pacienteActual, "genero", ["identidadGenero"]),
    alergias: valorInstitucional(pacienteActual, "alergias"),
    tipoSangre: valorInstitucional(pacienteActual, "tipoSangre"),
    peso: valorInstitucional(pacienteActual, "peso"),
    talla: valorInstitucional(pacienteActual, "talla"),
    imc: valorInstitucional(pacienteActual, "imc"),
    perimetroAbdominal: valorInstitucional(pacienteActual, "perimetroAbdominal"),
    diagnosticoClinico: pacienteActual.datosClinicosResumen?.diagnostico?.texto || pacienteActual.diagnostico?.texto || pacienteActual.diagnostico || "",
    codigoDiagnostico: pacienteActual.datosClinicosResumen?.diagnostico?.codigo || pacienteActual.diagnostico?.codigo || "",
    tratamientoFarmacologico: pacienteActual.datosClinicosResumen?.tratamientoActivo || pacienteActual.tratamiento || ""
  };

  const datos = historia.exists() ? { ...raiz, ...historia.data() } : raiz;

  Object.keys(datos).forEach((campo) => {
    const elemento = document.getElementById(campo);
    if (elemento) elemento.value = datos[campo];
  });
  if (!datos.imc) calcularIMCHistoria();
}

window.guardarHistoria = async () => {
  if (!uidPaciente) {
    alert("No hay paciente seleccionado. Abre esta historia desde el expediente o desde la lista de pacientes.");
    return;
  }

  const datos = {};
  calcularIMCHistoria();
  document.querySelectorAll("input, textarea, select").forEach((campo) => {
    datos[campo.id] = campo.value;
  });

  await guardarHistoriaClinica(uidPaciente, datos);

  const pacienteActual = await obtenerUsuario(uidPaciente);
  const tipoPaciente = datos.tipoPaciente || inferirTipoPaciente(pacienteActual);
  const institucionPaciente = campoConRespaldo(datos, pacienteActual, "institucionPaciente", ["institucion"]);
  const servicioInstitucional = campoConRespaldo(datos, pacienteActual, "servicioInstitucional", ["servicio"]);
  const expediente = campoConRespaldo(datos, pacienteActual, "expediente", ["numeroExpediente"]);
  const cama = campoConRespaldo(datos, pacienteActual, "cama");
  const sexo = campoConRespaldo(datos, pacienteActual, "sexo");
  const genero = campoConRespaldo(datos, pacienteActual, "genero", ["identidadGenero"]);
  const alergias = campoConRespaldo(datos, pacienteActual, "alergias");
  const tipoSangre = campoConRespaldo(datos, pacienteActual, "tipoSangre");
  const peso = campoConRespaldo(datos, pacienteActual, "peso");
  const talla = campoConRespaldo(datos, pacienteActual, "talla");
  const imc = campoConRespaldo(datos, pacienteActual, "imc");
  const perimetroAbdominal = campoConRespaldo(datos, pacienteActual, "perimetroAbdominal");

  await actualizarUsuario(uidPaciente, {
    tipoPaciente,
    institucionPaciente,
    institucion: institucionPaciente,
    servicioInstitucional,
    servicio: servicioInstitucional,
    expediente,
    numeroExpediente: expediente,
    cama,
    sexo,
    genero,
    alergias,
    tipoSangre,
    peso,
    talla,
    imc,
    perimetroAbdominal,
    datosInstitucionales: {
      ...(pacienteActual?.datosInstitucionales || {}),
      tipoPaciente,
      institucionPaciente,
      servicioInstitucional,
      expediente,
      cama,
      sexo,
      genero,
      alergias,
      tipoSangre,
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    signosVitales: {
      ...(pacienteActual?.signosVitales || {}),
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    somatometria: {
      ...(pacienteActual?.somatometria || {}),
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    datosClinicosResumen: {
      ...(pacienteActual?.datosClinicosResumen || {}),
      diagnosticoManualHistoria: datos.diagnosticoClinico || "",
      codigoDiagnosticoHistoria: datos.codigoDiagnostico || "",
      tratamientoHistoria: datos.tratamientoFarmacologico || "",
      fechaActualizacionHistoria: new Date().toISOString()
    }
  });

  const usuario = auth.currentUser;
  const medico = usuario ? await obtenerUsuario(usuario.uid) : null;
  const paciente = pacienteActual || await obtenerUsuario(uidPaciente);

  await registrarEventoAuditoria({
    accion: "guardar_historia_clinica",
    modulo: "Historia clinica",
    descripcion: "El medico guardo historia clinica.",
    usuarioUid: usuario?.uid || "",
    usuarioNombre: medico?.nombre || usuario?.email || "",
    usuarioRol: medico?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: paciente?.nombre || "",
    exito: true,
    detalles: {
      camposRegistrados: Object.values(datos).filter(Boolean).length
    }
  });

  alert("Historia clinica guardada.");
};

window.descargarHistoriaPDF = () => {
  window.print();
};

const tabs = document.querySelectorAll(".tab");
const secciones = document.querySelectorAll(".seccion");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("activo"));
    secciones.forEach((s) => s.classList.remove("activa"));

    tab.classList.add("activo");

    const seccion = document.getElementById(tab.dataset.seccion);
    if (seccion) seccion.classList.add("activa");
  });
});

["peso", "talla"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", calcularIMCHistoria);
  document.getElementById(id)?.addEventListener("change", calcularIMCHistoria);
});
