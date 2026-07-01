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

iniciarMonitoreoSesion("Nuevo paciente");

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";

  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }

  return edad >= 0 ? edad : "";
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

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido al personal médico");
    window.location.href = "dashboard.html";
  }
});

window.guardarPacienteNuevo = async function() {
  const fechaNacimiento = document.getElementById("fechaNacimiento").value;
  const tipoPaciente = document.getElementById("tipoPaciente")?.value || "privada";
  const institucionPaciente = document.getElementById("institucionPaciente")?.value || "";
  const servicioInstitucional = document.getElementById("servicioInstitucional")?.value || "";
  const expediente = document.getElementById("expediente")?.value || "";
  const cama = document.getElementById("cama")?.value || "";
  const fechaIngreso = normalizarFechaIngreso(document.getElementById("fechaIngreso")?.value || "");
  const genero = document.getElementById("genero")?.value || "";
  const alergias = document.getElementById("alergias")?.value || "";
  const diasEstancia = document.getElementById("diasEstancia")?.value || "";
  const expedienteCognicion = await generarExpedienteCognicion();

  const paciente = {
    nombre: document.getElementById("nombre").value,
    expedienteCognicion,
    fechaNacimiento,
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
      sexo: document.getElementById("sexo").value,
      genero,
      alergias,
      diasEstancia
    },
    medicoTratante: document.getElementById("medicoTratante").value,
    diagnostico: document.getElementById("diagnostico").value,
    ultimaConsulta: document.getElementById("ultimaConsulta").value,
    tratamiento: document.getElementById("tratamiento").value,
    observaciones: document.getElementById("observaciones").value,
    
    creadoPor: uidMedico,
    medicoTratanteUid: uidMedico,
    medicosAutorizados: [uidMedico]
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
};
