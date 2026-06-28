import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  actualizarUsuario,
  solicitarEliminacionPaciente
} from "./services/usuarios.js";

let uidPaciente = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const parametros = new URLSearchParams(window.location.search);
  uidPaciente = parametros.get("id");

  await cargarDatosPaciente();
});

async function cargarDatosPaciente() {
  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) {
    document.getElementById("nombrePaciente").innerText =
      "Paciente no encontrado";
    return;
  }

  document.getElementById("nombrePaciente").innerText =
    datos.nombre || "Paciente sin nombre";

  document.getElementById("correoPaciente").innerText =
    datos.email || "Sin correo";

  document.getElementById("diagnostico").innerText =
    datos.diagnostico || "Sin diagnóstico registrado";

  document.getElementById("tratamiento").innerText =
    datos.tratamiento || "Sin tratamiento registrado";

  document.getElementById("medicoTratante").innerText =
    datos.medicoTratante || "Sin médico tratante";

  document.getElementById("ultimaConsulta").innerText =
    datos.ultimaConsulta || "Sin fecha";

  document.getElementById("telefonoPaciente").innerText =
    datos.telefono || "Sin teléfono";
}

window.editarNombrePaciente = async function() {
  const nuevoNombre = prompt("Nuevo nombre:");

  if (!nuevoNombre) return;

  await actualizarUsuario(uidPaciente, {
    nombre: nuevoNombre
  });

  await cargarDatosPaciente();

  alert("Nombre actualizado");
};

window.editarDatosPaciente = async function() {
  const datos = await obtenerUsuario(uidPaciente);

  const nuevoTelefono = prompt(
    "Teléfono:",
    datos.telefono || ""
  );

  if (nuevoTelefono === null) return;

  const nuevoDiagnostico = prompt(
    "Diagnóstico:",
    datos.diagnostico || ""
  );

  if (nuevoDiagnostico === null) return;

  const nuevoTratamiento = prompt(
    "Tratamiento:",
    datos.tratamiento || ""
  );

  if (nuevoTratamiento === null) return;

  const nuevoMedico = prompt(
    "Médico tratante:",
    datos.medicoTratante || ""
  );

  if (nuevoMedico === null) return;

  const nuevaConsulta = prompt(
    "Última consulta:",
    datos.ultimaConsulta || ""
  );

  if (nuevaConsulta === null) return;

  await actualizarUsuario(uidPaciente, {
    telefono: nuevoTelefono,
    diagnostico: nuevoDiagnostico,
    tratamiento: nuevoTratamiento,
    medicoTratante: nuevoMedico,
    ultimaConsulta: nuevaConsulta
  });

  await cargarDatosPaciente();

  alert("Datos actualizados");
};

window.abrirNota = function() {
  window.location.href = "nota.html?id=" + uidPaciente;
};

window.solicitarEliminarPaciente = async function(){

  const confirmar = confirm(
    "¿Deseas suspender este paciente y solicitar eliminación al administrador?"
  );

  if(!confirmar) return;

  try{

    await solicitarEliminacionPaciente(
      uidPaciente,
      auth.currentUser.uid
    );

    alert("Paciente suspendido. Eliminación pendiente de autorización.");

    window.location.href = "pacientes.html";

  }catch(error){

    alert(error.message);

  }

};

window.abrirHistoriaClinica = function() {
    const parametros = new URLSearchParams(window.location.search);
    const uidPaciente = parametros.get("id");

    if (!uidPaciente) {
        alert("No se encontró el ID del paciente.");
        return;
    }

    window.location.href = `historia.html?id=${uidPaciente}`;
};