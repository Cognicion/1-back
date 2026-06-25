import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  crearPacienteProvisional
} from "./services/usuarios.js";

let uidMedico = "";

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
  const paciente = {
    nombre: document.getElementById("nombre").value,
    fechaNacimiento: document.getElementById("fechaNacimiento").value,
    sexo: document.getElementById("sexo").value,
    curp: document.getElementById("curp").value,
    telefono: document.getElementById("telefono").value,
    email: document.getElementById("email").value,
    estadoCivil: document.getElementById("estadoCivil").value,
    escolaridad: document.getElementById("escolaridad").value,
    ocupacion: document.getElementById("ocupacion").value,
    medicoTratante: document.getElementById("medicoTratante").value,
    diagnostico: document.getElementById("diagnostico").value,
    ultimaConsulta: document.getElementById("ultimaConsulta").value,
    tratamiento: document.getElementById("tratamiento").value,
    observaciones: document.getElementById("observaciones").value,
    creadoPor: uidMedico
  };

  if (!paciente.nombre) {
    alert("Escribe el nombre del paciente");
    return;
  }

  try {
    await crearPacienteProvisional(paciente);

    alert("Paciente creado correctamente");
    window.location.href = "pacientes.html";

  } catch(error) {
    alert("Error: " + error.message);
  }
};
