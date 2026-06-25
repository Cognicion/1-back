import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  listarPacientes,
  actualizarUsuario
} from "./services/usuarios.js";

import {
  guardarNota,
  obtenerHistorialNotas
} from "./services/notas.js";

let uidPacienteActual = null;

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

  const parametros = new URLSearchParams(window.location.search);
  uidPacienteActual = parametros.get("id");

  if (uidPacienteActual) {
    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  } else {
    await cargarListaPacientes();
  }
});

async function cargarListaPacientes() {
  const selector = document.getElementById("uidPaciente");

  if (!selector) return;

  const pacientes = await listarPacientes();

  pacientes.forEach((paciente) => {
    const datos = paciente.data();
    const opcion = document.createElement("option");

    opcion.value = paciente.id;
    opcion.textContent = datos.nombre || "Sin nombre";

    selector.appendChild(opcion);
  });

  selector.addEventListener("change", async () => {
    uidPacienteActual = selector.value;

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  });
}

async function cargarPaciente(uidPaciente) {
  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) return;

  const diagnostico = document.getElementById("diagnostico");
  const tratamiento = document.getElementById("tratamiento");
  const medico = document.getElementById("medico");
  const ultimaConsulta = document.getElementById("ultimaConsulta");

  if (diagnostico) diagnostico.value = datos.diagnostico || "";
  if (tratamiento) tratamiento.value = datos.tratamiento || "";
  if (medico) medico.value = datos.medicoTratante || "";
  if (ultimaConsulta) ultimaConsulta.value = datos.ultimaConsulta || "";
}

window.guardarNotaMedica = async function() {
  const selector = document.getElementById("uidPaciente");

  const uidPaciente = uidPacienteActual || selector?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const diagnostico = document.getElementById("diagnostico").value;
  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;

  const subjetivo = document.getElementById("subjetivo").value;
  const objetivo = document.getElementById("objetivo").value;
  const analisis = document.getElementById("analisis").value;
  const plan = document.getElementById("plan").value;

  try {
    await actualizarUsuario(uidPaciente, {
      diagnostico,
      tratamiento,
      medicoTratante: medico,
      ultimaConsulta
    });

    await guardarNota(uidPaciente, {
      autor: medico,
      subjetivo,
      objetivo,
      analisis,
      plan
    });

    alert("Nota médica guardada correctamente");

    await cargarHistorial(uidPaciente);

  } catch(error) {
    alert("Error: " + error.message);
  }
};

async function cargarHistorial(uidPaciente) {
  const contenedor = document.getElementById("historialNotas");

  if (!contenedor) return;

  contenedor.innerHTML = "";

  const notas = await obtenerHistorialNotas(uidPaciente);

  if (notas.empty) {
    contenedor.innerHTML = `
      <p style="color:#999">
        No hay notas registradas
      </p>
    `;
    return;
  }

  notas.forEach((nota) => {
    const datos = nota.data();

    const fecha = new Date(datos.fecha);

    const fechaTexto = fecha.toLocaleDateString("es-MX");

    const horaTexto = fecha.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    });

    contenedor.innerHTML += `
      <details style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:22px;
        margin-bottom:20px;
      ">

        <summary style="
          cursor:pointer;
          font-size:18px;
          font-weight:bold;
          outline:none;
        ">
          ${fechaTexto} · ${horaTexto} · ${datos.autor || "Sin médico"}
        </summary>

        <div style="margin-top:20px;">

          <p><b>Subjetivo:</b><br>${datos.subjetivo || ""}</p>

          <p><b>Objetivo:</b><br>${datos.objetivo || ""}</p>

          <p><b>Análisis:</b><br>${datos.analisis || ""}</p>

          <p><b>Plan:</b><br>${datos.plan || ""}</p>

        </div>

      </details>
    `;
  });
}
