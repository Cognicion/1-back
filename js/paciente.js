import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  obtenerUsuario,
  actualizarUsuario,
  solicitarEliminacionPaciente,
  buscarMedicoPorCorreo,
  otorgarPermisoMedico,
  listarPermisosMedicos,
  cambiarRolPermisoMedico,
  revocarPermisoMedico
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

  document.getElementById("proximaConsulta").textContent =
    datos.proximaConsulta || "Sin programar";

  document.getElementById("telefonoPaciente").innerText =
    datos.telefono || "Sin teléfono";
}

window.mostrarResumen = function() {
  document.getElementById("seccionResumen").style.display = "block";
  document.getElementById("seccionPermisos").style.display = "none";
};

window.mostrarPermisos = async function() {
  document.getElementById("seccionResumen").style.display = "none";
  document.getElementById("seccionPermisos").style.display = "block";

  await cargarPermisosMedicos();
};

async function cargarPermisosMedicos() {
  const contenedor = document.getElementById("listaPermisosMedicos");
  contenedor.innerHTML = "Cargando permisos...";

  const permisos = await listarPermisosMedicos(uidPaciente);

  if (permisos.length === 0) {
    contenedor.innerHTML = `
      <p>No hay médicos con permisos registrados.</p>
    `;
    return;
  }

  contenedor.innerHTML = "";

  for (const permiso of permisos) {
    const medico = await obtenerUsuario(permiso.uid);

    const nombreMedico =
      medico?.nombre ||
      medico?.email ||
      permiso.uid;

    const rolActual = permiso.rolPermiso || "estudiante";

    contenedor.innerHTML += `
      <div class="dato" style="margin-bottom:16px;">
        <strong>${nombreMedico}</strong>
        <br>
        <span>Rol actual: ${rolActual}</span>
        <br><br>

        <select id="rol-${permiso.uid}">
          <option value="tratante" ${rolActual === "tratante" ? "selected" : ""}>Tratante</option>
          <option value="colaborador" ${rolActual === "colaborador" ? "selected" : ""}>Colaborador</option>
          <option value="estudiante" ${rolActual === "estudiante" ? "selected" : ""}>Estudiante</option>
        </select>

        <button onclick="cambiarRolPermiso('${permiso.uid}')">
          Cambiar rol
        </button>

        <button style="background:#8b0000; color:white;" onclick="revocarPermiso('${permiso.uid}')">
          Revocar
        </button>
      </div>
    `;
  }
}

window.agregarPermisoMedico = async function() {
  const correo = document
    .getElementById("correoMedicoPermiso")
    .value
    .trim()
    .toLowerCase();

  const rol = document.getElementById("rolPermisoMedico").value;

  if (!correo) {
    alert("Escribe el correo del médico.");
    return;
  }

  const medico = await buscarMedicoPorCorreo(correo);

  if (!medico) {
    alert("No se encontró un médico registrado con ese correo.");
    return;
  }

  await otorgarPermisoMedico(
    uidPaciente,
    medico.uid,
    rol,
    auth.currentUser.uid
  );

  alert("Permiso otorgado correctamente.");

  document.getElementById("correoMedicoPermiso").value = "";

  await cargarPermisosMedicos();
};

window.cambiarRolPermiso = async function(uidMedico) {
  const nuevoRol = document.getElementById(`rol-${uidMedico}`).value;

  await cambiarRolPermisoMedico(
    uidPaciente,
    uidMedico,
    nuevoRol,
    auth.currentUser.uid
  );

  alert("Rol actualizado.");

  await cargarPermisosMedicos();
};

window.revocarPermiso = async function(uidMedico) {
  const confirmar = confirm("¿Seguro que deseas revocar el acceso de este médico?");

  if (!confirmar) return;

  await revocarPermisoMedico(uidPaciente, uidMedico);

  alert("Permiso revocado.");

  await cargarPermisosMedicos();
};

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

  const nuevoTelefono = prompt("Teléfono:", datos.telefono || "");
  if (nuevoTelefono === null) return;

  const nuevoDiagnostico = prompt("Diagnóstico:", datos.diagnostico || "");
  if (nuevoDiagnostico === null) return;

  const nuevoTratamiento = prompt("Tratamiento:", datos.tratamiento || "");
  if (nuevoTratamiento === null) return;

  const nuevoMedico = prompt("Médico tratante:", datos.medicoTratante || "");
  if (nuevoMedico === null) return;

  const nuevaConsulta = prompt("Última consulta:", datos.ultimaConsulta || "");
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

window.solicitarEliminarPaciente = async function() {
  const confirmar = confirm(
    "¿Deseas suspender este paciente y solicitar eliminación al administrador?"
  );

  if (!confirmar) return;

  try {
    await solicitarEliminacionPaciente(
      uidPaciente,
      auth.currentUser.uid
    );

    alert("Paciente suspendido. Eliminación pendiente de autorización.");

    window.location.href = "medico.html";
  } catch (error) {
    alert(error.message);
  }
};

window.abrirHistoriaClinica = function() {
  if (!uidPaciente) {
    alert("No se encontró el ID del paciente.");
    return;
  }

  window.location.href = `historia.html?id=${uidPaciente}`;
};