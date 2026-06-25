import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  listarPacientes
} from "./services/usuarios.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido al personal médico");
    window.location.href = "dashboard.html";
    return;
  }

  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";

  const pacientes = await listarPacientes();

  pacientes.forEach((paciente) => {
    const datos = paciente.data();

    lista.innerHTML += `
      <div class="tarjeta">
        <div class="nombre">${datos.nombre || "Sin nombre"}</div>
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
