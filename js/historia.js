import { auth } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

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
  const claves = [campo, ...alternos];

  for (const clave of claves) {
    const valor = paciente[clave] ?? institucional[clave];
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

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido");
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
    paciente.nombre || "Paciente";

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
    diagnosticoClinico: pacienteActual.datosClinicosResumen?.diagnostico?.texto || pacienteActual.diagnostico?.texto || pacienteActual.diagnostico || "",
    codigoDiagnostico: pacienteActual.datosClinicosResumen?.diagnostico?.codigo || pacienteActual.diagnostico?.codigo || "",
    tratamientoFarmacologico: pacienteActual.datosClinicosResumen?.tratamientoActivo || pacienteActual.tratamiento || ""
  };

  const datos = historia.exists() ? { ...raiz, ...historia.data() } : raiz;

  Object.keys(datos).forEach((campo) => {
    const elemento = document.getElementById(campo);
    if (elemento) elemento.value = datos[campo];
  });
}

window.guardarHistoria = async () => {
  if (!uidPaciente) {
    alert("No hay paciente seleccionado. Abre esta historia desde el expediente o desde la lista de pacientes.");
    return;
  }

  const datos = {};
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
    datosInstitucionales: {
      ...(pacienteActual?.datosInstitucionales || {}),
      tipoPaciente,
      institucionPaciente,
      servicioInstitucional,
      expediente,
      cama,
      sexo,
      genero,
      alergias
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
