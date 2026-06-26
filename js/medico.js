import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let pacientesGlobal = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await cargarPerfilMedico(user);
  await cargarPacientes();

  document
    .getElementById("buscadorPacientes")
    .addEventListener("input", filtrarPacientes);
});

async function cargarPerfilMedico(user) {
  const correo = user.email;
  document.getElementById("correoMedico").textContent = correo;

  const inicial = correo ? correo.charAt(0).toUpperCase() : "M";
  document.getElementById("avatarMedico").textContent = inicial;

  const refUsuario = doc(db, "usuarios", user.uid);
  const snapUsuario = await getDoc(refUsuario);

  if (snapUsuario.exists()) {
    const datos = snapUsuario.data();

    if (datos.rol !== "medico") {
      alert("Acceso restringido al personal médico");
      window.location.href = "dashboard.html";
      return;
    }

    document.getElementById("nombreMedico").textContent =
      datos.nombre || "Médico sin nombre";
  } else {
    document.getElementById("nombreMedico").textContent = "Médico";
  }
}

async function cargarPacientes() {
  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "Cargando pacientes...";

  const refPacientes = collection(db, "usuarios");
  const snapshot = await getDocs(refPacientes);

  pacientesGlobal = [];

  snapshot.forEach((docPaciente) => {
    const datos = docPaciente.data();

    if (datos.rol === "paciente") {
      pacientesGlobal.push({
        id: docPaciente.id,
        ...datos
      });
    }
  });

  pacientesGlobal.sort((a, b) => {
    const nombreA = (a.nombre || "").toLowerCase();
    const nombreB = (b.nombre || "").toLowerCase();
    return nombreA.localeCompare(nombreB);
  });

  mostrarPacientes(pacientesGlobal);
  calcularEstadisticas(pacientesGlobal);
}

function mostrarPacientes(pacientes) {
  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";

  if (pacientes.length === 0) {
    lista.innerHTML = "<p>No hay pacientes registrados.</p>";
    return;
  }

  pacientes.forEach((paciente) => {
    const nombre = paciente.nombre || "Paciente sin nombre";
    const edad = paciente.edad || "No registrada";

    lista.innerHTML += `
      <div class="fila-paciente">
        <a href="paciente.html?id=${paciente.id}" class="nombre-paciente">
          ${nombre}
        </a>

        <span class="edad-paciente">
          ${edad} años
        </span>
      </div>
    `;
  });
}

function filtrarPacientes() {
  const texto = document
    .getElementById("buscadorPacientes")
    .value
    .toLowerCase();

  const filtrados = pacientesGlobal.filter((paciente) => {
    const nombre = (paciente.nombre || "").toLowerCase();
    return nombre.includes(texto);
  });

  mostrarPacientes(filtrados);
}

function calcularEstadisticas(pacientes) {
  const total = pacientes.length;

  const activos = pacientes.filter(
    (paciente) => paciente.estado !== "pendiente"
  ).length;

  const pendientes = pacientes.filter(
    (paciente) => paciente.estado === "pendiente"
  ).length;

  document.getElementById("totalPacientes").textContent = total;
  document.getElementById("pacientesActivos").textContent = activos;
  document.getElementById("pacientesPendientes").textContent = pendientes;

  // Por ahora queda en 0.
  // Después lo conectamos a una colección de notas clínicas.
  document.getElementById("expedientesHoy").textContent = 0;
}
