import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  listarPacientes
} from "./services/usuarios.js?v=20260826-cuenta-profesional-gratuita-v1";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";

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

  const estadoPlan = document.getElementById("estadoPlanPacientes");
  if (estadoPlan && usuario.planCuentaProfesional === "profesional_gratuito") {
    const limite = Number.isInteger(Number(usuario.limitePacientes))
      ? Number(usuario.limitePacientes)
      : 5;
    const usados = Math.max(0, Number(usuario.pacientesEnCuenta) || 0);
    estadoPlan.hidden = false;
    estadoPlan.textContent = `Cuenta profesional gratuita: ${usados} de ${limite} pacientes utilizados.`;
  }

  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";

  const pacientes = await listarPacientes(user.uid);

  pacientes.forEach((paciente) => {
    const datos = paciente.data();
    const nombrePaciente = obtenerNombrePacienteParaMostrar(datos) || "Sin nombre";

    if (datos.estado === "suspendido" || (datos.estado === "vinculado" && datos.vinculadoA)) {
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
