import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario
} from "./services/usuarios.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const parametros = new URLSearchParams(window.location.search);
  const uidPaciente = parametros.get("id");

  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) {
    document.getElementById("nombrePaciente").innerText =
      "Paciente no encontrado";
    return;
  }

  document.getElementById("nombrePaciente").innerText =
    datos.nombre || "Paciente sin nombre";

  document.getElementById("diagnostico").innerText =
    "Diagnóstico: " + (datos.diagnostico || "Sin diagnóstico registrado");

  document.getElementById("tratamiento").innerText =
    "Tratamiento: " + (datos.tratamiento || "Sin tratamiento registrado");

  window.abrirNota = function() {
    window.location.href = "nota.html?id=" + uidPaciente;
  };
});
