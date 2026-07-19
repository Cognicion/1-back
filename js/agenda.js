import { auth, db } from "./firebase.js";
import { listarPacientes, obtenerUsuario } from "./services/usuarios.js?v=20260718-patient-access";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { canUseMedicalAgenda } from "./utils/roles.js?v=20260719-admin-universal-modules";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let medicoUid = null;
let pacientes = [];
let citas = [];
let fechaCalendario = new Date();

const formCita = document.getElementById("formCita");
const pacienteCita = document.getElementById("pacienteCita");
const listaCitas = document.getElementById("listaCitas");
const calendario = document.getElementById("calendario");
const tituloMes = document.getElementById("tituloMes");

iniciarMonitoreoSesion("Agenda");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || !canUseMedicalAgenda(usuario)) {
    mostrarBloqueoAgenda("No tienes autorizacion para acceder a este servicio.");
    return;
  }

  medicoUid = user.uid;
  document.body.classList.remove("bloqueado");
  await cargarPacientes();
  await cargarCitas();
});

async function cargarPacientes() {
  pacienteCita.innerHTML = "<option value=\"\">Cargando pacientes autorizados...</option>";
  const snap = await listarPacientes(medicoUid, { forzar: true });
  const filas = snap.docs.map((docPaciente) => {
    const paciente = docPaciente.data();
    return {
      id: docPaciente.id,
      nombre: obtenerNombrePacienteParaMostrar(paciente) || "Paciente sin nombre"
    };
  });

  pacientes = filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  pacienteCita.innerHTML = pacientes.length
    ? `<option value="">Sin paciente vinculado</option>${pacientes.map((p) => `<option value="${p.id}">${escaparHTML(p.nombre)}</option>`).join("")}`
    : "<option value=\"\">Sin paciente vinculado</option>";
}

async function cargarCitas() {
  if (!medicoUid) return;
  const snap = await getDocs(collection(db, "usuarios", medicoUid, "agenda"));
  citas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => `${a.fecha || ""} ${a.hora || ""}`.localeCompare(`${b.fecha || ""} ${b.hora || ""}`));
  renderizarCitas();
  renderizarCalendario();
}

formCita.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!medicoUid) return;

  const pacienteId = pacienteCita.value || "";
  const paciente = pacienteId ? pacientes.find((p) => p.id === pacienteId) : null;
  const datosCita = {
    pacienteId,
    pacienteNombre: paciente?.nombre || "",
    fecha: document.getElementById("fechaCita").value,
    hora: document.getElementById("horaCita").value,
    tipo: document.getElementById("tipoCita").value,
    recordatorio: document.getElementById("recordatorioCita").value.trim(),
    seguimiento: document.getElementById("seguimientoCita").value.trim(),
    notas: document.getElementById("notasCita").value.trim(),
    estado: "programada",
    creadoPor: medicoUid,
    fechaCreacion: new Date().toISOString()
  };

  await addDoc(collection(db, "usuarios", medicoUid, "agenda"), datosCita);
  await registrarEventoAgenda("crear_cita", "El medico creo una cita en agenda.", {
    pacienteUid: pacienteId,
    pacienteNombre: paciente?.nombre || "",
    detalles: datosCita
  });

  formCita.reset();
  await cargarCitas();
});

function renderizarCitas() {
  if (!citas.length) {
    listaCitas.textContent = "Aun no hay citas programadas.";
    return;
  }

  listaCitas.innerHTML = citas.slice(0, 12).map((cita) => `
    <article class="cita">
      <h3>${escaparHTML(cita.pacienteNombre || "Evento sin paciente vinculado")}</h3>
      <p><strong>${escaparHTML(cita.fecha || "")} ${escaparHTML(cita.hora || "")}</strong> · ${escaparHTML(cita.tipo || "Consulta")}</p>
      <p>Estado: ${escaparHTML(cita.estado || "programada")}</p>
      ${cita.recordatorio ? `<p>Recordatorio: ${escaparHTML(cita.recordatorio)}</p>` : ""}
      ${cita.seguimiento ? `<p>Seguimiento: ${escaparHTML(cita.seguimiento)}</p>` : ""}
      ${cita.notas ? `<p>Notas: ${escaparHTML(cita.notas)}</p>` : ""}
      <div class="acciones">
        <button data-completar="${cita.id}">Marcar atendida</button>
        <button data-eliminar="${cita.id}">Eliminar</button>
      </div>
    </article>
  `).join("");

  listaCitas.querySelectorAll("[data-completar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "usuarios", medicoUid, "agenda", btn.dataset.completar), {
        estado: "atendida",
        fechaAtencion: new Date().toISOString()
      });
      await registrarEventoAgenda("marcar_cita_atendida", "El medico marco una cita como atendida.", {
        detalles: { citaId: btn.dataset.completar }
      });
      await cargarCitas();
    });
  });

  listaCitas.querySelectorAll("[data-eliminar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Eliminar esta cita?")) return;
      await deleteDoc(doc(db, "usuarios", medicoUid, "agenda", btn.dataset.eliminar));
      await registrarEventoAgenda("eliminar_cita", "El medico elimino una cita de agenda.", {
        detalles: { citaId: btn.dataset.eliminar }
      });
      await cargarCitas();
    });
  });
}

function mostrarBloqueoAgenda(mensaje) {
  document.body.classList.remove("bloqueado");
  medicoUid = null;
  pacientes = [];
  citas = [];
  if (formCita) formCita.style.display = "none";
  if (pacienteCita) pacienteCita.innerHTML = "<option value=\"\">Sin acceso</option>";
  if (listaCitas) {
    listaCitas.innerHTML = `
      <div class="estado-vacio">
        <strong>${escaparHTML(mensaje)}</strong>
        <p>Vuelve al panel principal o inicia sesion con una cuenta autorizada.</p>
      </div>
    `;
  }
  if (calendario) calendario.innerHTML = "";
}

function renderizarCalendario() {
  const anio = fechaCalendario.getFullYear();
  const mes = fechaCalendario.getMonth();
  const primerDia = new Date(anio, mes, 1);
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const inicio = primerDia.getDay();
  const nombres = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

  tituloMes.textContent = primerDia.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const html = nombres.map((n) => `<div class="dia-nombre">${n}</div>`);
  for (let i = 0; i < inicio; i++) html.push("<div class=\"dia vacio\"></div>");

  for (let dia = 1; dia <= totalDias; dia++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const eventos = citas.filter((c) => c.fecha === fecha);
    html.push(`
      <div class="dia">
        <strong>${dia}</strong>
        ${eventos.map((e) => `<span class="evento">${escaparHTML(e.hora || "")} ${escaparHTML(e.pacienteNombre || "")}</span>`).join("")}
      </div>
    `);
  }

  calendario.innerHTML = html.join("");
}

document.getElementById("mesAnterior").addEventListener("click", () => {
  fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1);
  renderizarCalendario();
});

document.getElementById("mesSiguiente").addEventListener("click", () => {
  fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 1);
  renderizarCalendario();
});

document.getElementById("mesActual").addEventListener("click", () => {
  fechaCalendario = new Date();
  renderizarCalendario();
});

async function registrarEventoAgenda(accion, descripcion, opciones = {}) {
  const medico = await obtenerUsuario(medicoUid);
  await registrarEventoAuditoria({
    accion,
    modulo: "Agenda",
    descripcion,
    usuarioUid: medicoUid,
    usuarioNombre: medico?.nombre || "",
    usuarioRol: medico?.rol || "medico",
    pacienteUid: opciones.pacienteUid || "",
    pacienteNombre: opciones.pacienteNombre || "",
    exito: true,
    detalles: opciones.detalles || {}
  });
}

function escaparHTML(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
