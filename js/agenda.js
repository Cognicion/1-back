import { auth, db } from "./firebase.js";
import { listarPacientes, obtenerUsuario } from "./services/usuarios.js?v=20260816-expedientes-cognicion-v1";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { canUseMedicalAgenda } from "./utils/roles.js?v=20260719-admin-universal-modules";
import { expandirEventosAgenda, parsearFechaAgenda } from "./services/agendaRecurrence.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const TIPO = { appointment: "Cita médica", event: "Evento", meeting: "Reunión", academic: "Actividad académica", shift: "Guardia", block: "Bloqueo / No disponible", vacation: "Vacaciones", other: "Otro" };
const $ = (id) => document.getElementById(id);
let medicoUid = null, pacientes = [], eventos = [], fechaCalendario = new Date();
const agendaRef = () => collection(db, "usuarios", medicoUid, "agenda");
const form = $("formCita"), calendario = $("calendario"), lista = $("listaCitas");

iniciarMonitoreoSesion("Agenda");
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || !canUseMedicalAgenda(usuario)) { mostrarBloqueoAgenda("No tienes autorizacion para acceder a este servicio."); return; }
  medicoUid = user.uid; document.body.classList.remove("bloqueado");
  await cargarPacientes(); await cargarEventos(); actualizarCamposPorTipo();
});

async function cargarPacientes() {
  const select = $("pacienteCita");
  select.innerHTML = "<option value=\"\">Paciente no registrado / sin paciente</option>";
  const snap = await listarPacientes(medicoUid, { forzar: true });
  pacientes = snap.docs.map((d) => ({ id: d.id, nombre: obtenerNombrePacienteParaMostrar(d.data()) || "Paciente sin nombre" })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  select.innerHTML += pacientes.map((p) => `<option value="${p.id}">${escaparHTML(p.nombre)}</option>`).join("");
}
function rangoVisible() { return { inicio: aFecha(new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), 1)), fin: aFecha(new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 0)) }; }
function rangoConsulta() { const inicio = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1); const fin = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 2, 0); return { inicio: aFecha(inicio), fin: aFecha(fin) }; }
async function cargarEventos() {
  if (!medicoUid) return;
  const { inicio, fin } = rangoConsulta();
  const legacySnap = getDocs(query(agendaRef(), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
  const modernSnap = getDocs(query(agendaRef(), where("startDate", "<=", fin), where("endDate", ">=", inicio)));
  const recurringSnap = getDocs(query(agendaRef(), where("recurrence", "in", ["weekly", "biweekly", "monthly"])));
  const [legacy, modern, recurring] = await Promise.all([legacySnap, modernSnap, recurringSnap]);
  const documentos = new Map();
  [...legacy.docs, ...modern.docs, ...recurring.docs].forEach((snapshot) => documentos.set(snapshot.id, { id: snapshot.id, ...snapshot.data() }));
  eventos = [...documentos.values()].map(normalizarEvento); renderizarEventos(); renderizarCalendario();
}
function normalizarEvento(raw) {
  const antiguo = !raw.type && (raw.pacienteId !== undefined || raw.tipo !== undefined), type = raw.type || (antiguo ? "appointment" : "event");
  const fecha = raw.startDate || raw.fecha || "";
  return { ...raw, type, title: raw.title || (type === "appointment" ? raw.tipo || "Cita médica" : raw.nombre || TIPO[type] || "Evento"), startDate: fecha, endDate: raw.endDate || fecha, startTime: raw.startTime || raw.hora || "", endTime: raw.endTime || "", patientId: raw.patientId ?? raw.pacienteId ?? "", patientName: raw.patientName ?? raw.pacienteNombre ?? "", externalPatient: Boolean(raw.externalPatient || (raw.pacienteNombre && !raw.pacienteId)), status: raw.status || raw.estado || "programada", allDay: Boolean(raw.allDay), syncStatus: raw.syncStatus || "not_configured" };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault(); if (!medicoUid) return;
  const id = $("eventoId").value, datos = construirEvento(); if (!datos) return;
  if (detectarBloqueo(datos) && datos.type === "appointment" && !confirm("Este horario está marcado como no disponible. ¿Deseas crear la cita de todos modos?")) return;
  if (id) { delete datos.createdAt; delete datos.fechaCreacion; delete datos.creadoPor; await updateDoc(doc(db, "usuarios", medicoUid, "agenda", id), datos); await registrarEventoAgenda("agenda_event_updated", "El medico actualizo un evento de agenda.", { detalles: { eventoId: id, type: datos.type } }); }
  else { const ref = await addDoc(agendaRef(), datos); await registrarEventoAgenda("agenda_event_created", "El medico creo un evento de agenda.", { pacienteUid: datos.patientId, pacienteNombre: datos.patientName, detalles: { eventoId: ref.id, type: datos.type } }); }
  limpiarFormulario(); await cargarEventos();
});
function construirEvento() {
  const type = $("tipoEvento").value, startDate = $("fechaCita").value, allDay = $("todoElDia").checked;
  if (!startDate) { alert("Selecciona una fecha."); return null; }
  const patientId = type === "appointment" ? $("pacienteCita").value : "", externalPatient = type === "appointment" && !patientId && Boolean($("pacienteNombreExterno").value.trim());
  if (type === "appointment" && !patientId && !externalPatient) { alert("Selecciona un paciente registrado o escribe el nombre del paciente no registrado."); return null; }
  const patient = patientId ? pacientes.find((p) => p.id === patientId) : null, endDate = $("fechaFinEvento").value || startDate, startTime = allDay ? "" : $("horaCita").value, endTime = allDay ? "" : $("horaFinEvento").value;
  if (endDate < startDate) { alert("La fecha final no puede ser anterior a la fecha inicial."); return null; }
  if (!allDay && !startTime) { alert("Selecciona una hora de inicio."); return null; }
  if (!allDay && endDate === startDate && endTime && endTime <= startTime) { alert("La hora de finalización debe ser posterior a la hora de inicio."); return null; }
  const patientName = patient?.nombre || (externalPatient ? $("pacienteNombreExterno").value.trim() : "");
  return { type, title: $("tituloEvento").value.trim() || (type === "appointment" ? "Cita médica" : TIPO[type]), fecha: startDate, hora: startTime, startDate, startTime, endDate, endTime, allDay, durationMinutes: allDay ? null : Number($("duracionEvento").value || 60), pacienteId: patientId, pacienteNombre: patientName, patientId, patientName, externalPatient, patientPhone: externalPatient ? $("pacienteTelefonoExterno").value.trim() : "", patientEmail: externalPatient ? $("pacienteCorreoExterno").value.trim() : "", description: $("notasCita").value.trim(), notas: $("notasCita").value.trim(), ubicacion: $("ubicacionEvento").value.trim(), recordatorio: $("recordatorioCita").value.trim(), seguimiento: $("seguimientoCita").value.trim(), status: $("eventoEstado").value || "programada", estado: $("eventoEstado").value || "programada", recurrence: $("recurrenciaEvento").value || null, googleCalendarEventId: $("googleCalendarEventId").value || null, syncStatus: "not_configured", creadoPor: medicoUid, actualizadoPor: medicoUid, fechaCreacion: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function renderizarEventos() {
  const ordenados = [...eventos].sort((a, b) => `${a.startDate} ${a.startTime}`.localeCompare(`${b.startDate} ${b.startTime}`));
  lista.innerHTML = ordenados.length ? ordenados.slice(0, 12).map((e) => `<article class="cita tipo-${e.type}"><h3>${escaparHTML(e.title)}</h3><p><strong>${escaparHTML(e.startDate)}${e.allDay ? " · Todo el día" : ` ${escaparHTML(e.startTime)}`}</strong> · ${escaparHTML(TIPO[e.type] || "Evento")}</p>${e.patientName ? `<p>Paciente: ${escaparHTML(e.patientName)}${e.externalPatient ? " · No registrado" : ""}</p>` : ""}${e.description || e.notas ? `<p>${escaparHTML(e.description || e.notas)}</p>` : ""}<p>Estado: ${escaparHTML(e.status)}</p><div class="acciones"><button data-editar="${e.id}">Editar</button>${e.type === "appointment" && e.patientId ? `<button data-ver-paciente="${e.patientId}">Ver paciente</button>` : ""}${e.type === "appointment" && e.status !== "atendida" ? `<button data-completar="${e.id}">Marcar atendida</button>` : ""}<button data-eliminar="${e.id}">Eliminar</button></div></article>`).join("") : "Aún no hay eventos en este rango.";
  lista.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => editarEvento(b.dataset.editar))); lista.querySelectorAll("[data-completar]").forEach((b) => b.addEventListener("click", () => marcarAtendida(b.dataset.completar))); lista.querySelectorAll("[data-eliminar]").forEach((b) => b.addEventListener("click", () => eliminarEvento(b.dataset.eliminar))); lista.querySelectorAll("[data-ver-paciente]").forEach((b) => b.addEventListener("click", () => { window.location.href = `paciente.html?id=${encodeURIComponent(b.dataset.verPaciente)}`; }));
}
function renderizarCalendario() {
  const anio = fechaCalendario.getFullYear(), mes = fechaCalendario.getMonth(), primerDia = new Date(anio, mes, 1), totalDias = new Date(anio, mes + 1, 0).getDate(), inicio = primerDia.getDay();
  const visible = rangoVisible();
  const eventosRenderizados = expandirEventosAgenda(eventos, visible.inicio, visible.fin);
  $("tituloMes").textContent = primerDia.toLocaleDateString("es-MX", { month: "long", year: "numeric" }); const html = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"].map((n) => `<div class="dia-nombre">${n}</div>`); for (let i = 0; i < inicio; i++) html.push("<div class=\"dia vacio\"></div>");
  for (let dia = 1; dia <= totalDias; dia++) { const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, delDia = eventosRenderizados.filter((e) => fecha >= e.startDate && fecha <= e.endDate); html.push(`<button type="button" class="dia" data-fecha="${fecha}" aria-label="Crear evento el ${fecha}"><strong>${dia}</strong>${delDia.map((e) => `<span class="evento tipo-${e.type}" data-evento="${e.parentEventId || e.id}">${escaparHTML(e.startTime || "Todo el día")} ${escaparHTML(e.title)}</span>`).join("")}</button>`); }
  calendario.innerHTML = html.join(""); calendario.querySelectorAll(".dia[data-fecha]").forEach((d) => d.addEventListener("click", (e) => { if (!e.target.closest("[data-evento]")) abrirNuevoEvento(d.dataset.fecha); })); calendario.querySelectorAll("[data-evento]").forEach((e) => e.addEventListener("click", (ev) => { ev.stopPropagation(); editarEvento(e.dataset.evento); }));
}
function abrirNuevoEvento(fecha = aFecha(new Date()), tipo = "event") { limpiarFormulario(); $("fechaCita").value = fecha; $("tipoEvento").value = tipo; actualizarCamposPorTipo(); form.scrollIntoView({ behavior: "smooth", block: "start" }); $("tituloEvento").focus(); }
function editarEvento(id) { const e = eventos.find((x) => x.id === id); if (!e) return; abrirNuevoEvento(e.startDate, e.type); $("eventoId").value = e.id; $("eventoEstado").value = e.status || "programada"; $("googleCalendarEventId").value = e.googleCalendarEventId || ""; $("tituloFormulario").textContent = "Editar evento"; $("tituloEvento").value = e.title; $("pacienteCita").value = e.patientId || ""; $("pacienteNombreExterno").value = e.externalPatient ? e.patientName : ""; $("pacienteTelefonoExterno").value = e.patientPhone || ""; $("pacienteCorreoExterno").value = e.patientEmail || ""; $("horaCita").value = e.startTime; $("horaFinEvento").value = e.endTime || ""; $("duracionEvento").value = e.durationMinutes || 60; $("todoElDia").checked = e.allDay; $("fechaFinEvento").value = e.endDate !== e.startDate ? e.endDate : ""; $("ubicacionEvento").value = e.ubicacion || ""; $("notasCita").value = e.description || e.notas || ""; $("recurrenciaEvento").value = e.recurrence || ""; actualizarCamposPorTipo(); $("cancelarEdicion").classList.remove("oculto"); form.scrollIntoView({ behavior: "smooth", block: "start" }); }
async function marcarAtendida(id) { await updateDoc(doc(db, "usuarios", medicoUid, "agenda", id), { estado: "atendida", status: "atendida", fechaAtencion: new Date().toISOString(), updatedAt: new Date().toISOString() }); await registrarEventoAgenda("marcar_cita_atendida", "El medico marco una cita como atendida.", { detalles: { eventoId: id } }); await cargarEventos(); }
async function eliminarEvento(id) { if (!confirm("¿Eliminar este evento?")) return; await deleteDoc(doc(db, "usuarios", medicoUid, "agenda", id)); await registrarEventoAgenda("agenda_event_deleted", "El medico elimino un evento de agenda.", { detalles: { eventoId: id } }); await cargarEventos(); }
function limpiarFormulario() { form.reset(); $("eventoId").value = ""; $("googleCalendarEventId").value = ""; $("eventoEstado").value = ""; $("horaCita").disabled = false; $("tituloFormulario").textContent = "Nuevo evento"; $("duracionEvento").value = 60; $("fechaCita").value = aFecha(new Date()); $("cancelarEdicion").classList.add("oculto"); actualizarCamposPorTipo(); }
function actualizarCamposPorTipo() { const esCita = $("tipoEvento").value === "appointment", externo = !$("pacienteCita").value, actual = $("eventoId").value ? eventos.find((e) => e.id === $("eventoId").value) : null; $("campoPaciente").classList.toggle("oculto", !esCita); $("campoPacienteExterno").classList.toggle("oculto", !esCita || !externo); $("datosPacienteExterno").classList.toggle("oculto", !esCita || !externo); $("ayudaVinculacion").classList.toggle("oculto", !esCita || !actual?.externalPatient); $("campoTitulo").classList.toggle("oculto", esCita); }
function intervaloEvento(evento) {
  const startDate = evento.startDate || evento.fecha, endDate = evento.endDate || startDate;
  if (!parsearFechaAgenda(startDate) || !parsearFechaAgenda(endDate)) return null;
  const startTime = evento.allDay || !evento.startTime ? "00:00:00" : `${evento.startTime}:00`;
  const start = new Date(`${startDate}T${startTime}`).getTime();
  let end;
  if (evento.allDay || !evento.startTime || (!evento.endTime && !evento.durationMinutes)) end = new Date(`${endDate}T23:59:59`).getTime();
  else if (evento.endTime) end = new Date(`${endDate}T${evento.endTime}:00`).getTime();
  else end = start + Number(evento.durationMinutes || 60) * 60 * 1000;
  return [start, Math.max(start, end)];
}
function detectarBloqueo(datos) {
  const visible = rangoVisible();
  return expandirEventosAgenda(eventos, visible.inicio, visible.fin).filter((e) => ["block", "vacation"].includes(e.type)).some((bloqueo) => {
    const bloqueador = intervaloEvento(bloqueo), candidato = intervaloEvento(datos);
    return bloqueador && candidato && bloqueador[0] < candidato[1] && bloqueador[1] > candidato[0];
  });
}
function mostrarBloqueoAgenda(mensaje) { document.body.classList.remove("bloqueado"); if (form) form.style.display = "none"; if (lista) lista.innerHTML = `<div class="estado-vacio"><strong>${escaparHTML(mensaje)}</strong></div>`; if (calendario) calendario.innerHTML = ""; }
function aFecha(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function escaparHTML(valor) { return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
async function registrarEventoAgenda(accion, descripcion, opciones = {}) { const medico = await obtenerUsuario(medicoUid); await registrarEventoAuditoria({ accion, modulo: "Agenda", descripcion, usuarioUid: medicoUid, usuarioNombre: medico?.nombre || "", usuarioRol: medico?.rol || "medico", pacienteUid: opciones.pacienteUid || "", pacienteNombre: opciones.pacienteNombre || "", exito: true, detalles: opciones.detalles || {} }); }

$("tipoEvento").addEventListener("change", actualizarCamposPorTipo); $("pacienteCita").addEventListener("change", actualizarCamposPorTipo); $("todoElDia").addEventListener("change", () => { $("horaCita").disabled = $("todoElDia").checked; }); $("nuevoEvento").addEventListener("click", () => abrirNuevoEvento()); $("nuevaCita").addEventListener("click", () => abrirNuevoEvento(aFecha(new Date()), "appointment")); $("cancelarEdicion").addEventListener("click", limpiarFormulario);
$("mesAnterior").addEventListener("click", async () => { fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1); await cargarEventos(); }); $("mesSiguiente").addEventListener("click", async () => { fechaCalendario = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 1); await cargarEventos(); }); $("mesActual").addEventListener("click", async () => { fechaCalendario = new Date(); await cargarEventos(); });
