import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  listarPacientes
} from "./services/usuarios.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || !["medico", "psicologo", "admin"].includes(usuario.rol)) {
  alert("Acceso restringido al personal clinico");
  window.location.href = "dashboard.html";
  return;
}

  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";

  const pacientes = await listarPacientes();

  pacientes.forEach((paciente) => {
    const datos = paciente.data();
    const nombrePaciente = obtenerNombrePacienteParaMostrar(datos) || "Sin nombre";

    if (datos.estado === "suspendido") {
      return;
    }

    lista.innerHTML += `
      <div class="tarjeta">
        <div class="nombre">${nombrePaciente}</div>

        <div class="info">${datos.email || "Sin correo"}</div>

        <div class="info">
          Diagnóstico: ${datos.diagnostico || "Sin diagnóstico registrado"}
        </div>

        <button onclick="window.location.href='paciente.html?id=${paciente.id}'">
          Abrir expediente
        </button>
      </div>
    `;
  });
});
