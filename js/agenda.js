import { auth, db } from "./firebase.js";
import { listarPacientes, obtenerUsuario } from "./services/usuarios.js?v=20260826-cuenta-profesional-gratuita-v1";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { canUseMedicalAgenda } from "./utils/roles.js?v=20260719-admin-universal-modules";
import { expandirEventosAgenda } from "./services/agendaRecurrence.js";
import { executeAppointmentCommand, appointmentErrorCode, createRequestId } from "./services/appointmentCommandService.js";
import { initializeAgendaAvailabilitySettings } from "./services/agendaAvailabilitySettings.js";
import { iniciarConexionGoogleCalendar, obtenerEstadoGoogleCalendar, desconectarGoogleCalendar } from "./services/googleCalendarService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { normalizarEvento, intervaloEvento } from "./services/appointmentService.js";

const TIPO = { appointment: "Cita médica", event: "Evento", meeting: "Reunión", academic: "Actividad académica", shift: "Guardia", block: "Bloqueo / No disponible", vacation: "Vacaciones", other: "Otro" };
const $ = (id) => document.getElementById(id);
let medicoUid = null, pacientes = [], eventos = [], fechaCalendario = new Date();
let operacionCitaActiva = false;
const agendaRef = () => collection(db, "usuarios", medicoUid, "agenda");
const form = $("formCita"), calendario = $("calendario"), lista = $("listaCitas");

iniciarMonitoreoSesion("Agenda");
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || !canUseMedicalAgenda(usuario)) { mostrarBloqueoAgenda("No tienes autorizacion para acceder a este servicio."); return; }
  medicoUid = user.uid; document.body.classList.remove("bloqueado");
  await cargarPacientes(); await cargarEventos(); actualizarCamposPorTipo();
  initializeAgendaAvailabilitySettings($("configuracionAgenda").querySelector("[data-agenda-availability]")).catch((error) => console.warn("[AGENDA][DISPONIBILIDAD] Inicialización pendiente.", { code: appointmentErrorCode(error) }));
  inicializarIntegracionGoogleCalendar();
});

$("abrirConfiguracionAgenda").addEventListener("click", () => { const settings = $("configuracionAgenda"); settings.hidden = false; settings.scrollIntoView({ behavior: "smooth", block: "start" }); });
$("cerrarConfiguracionAgenda").addEventListener("click", () => { $("configuracionAgenda").hidden = true; });

async function inicializarIntegracionGoogleCalendar() {
  const root = $("configuracionAgenda").querySelector("[data-google-calendar-integration]");
  if (!root || root.dataset.ready === "true") return;
  root.dataset.ready = "true";
  const status = root.querySelector("[data-google-calendar-status]");
  const connect = root.querySelector("[data-google-calendar-connect]");
  const disconnect = root.querySelector("[data-google-calendar-disconnect]");
  const render = (data) => {
    const connected = data?.connected === true;
    status.textContent = connected ? "Google Calendar conectado." : data?.status === "reauthorization_required" ? "Google Calendar requiere reconexión." : "Google Calendar no conectado.";
    connect.classList.toggle("oculto", connected); disconnect.classList.toggle("oculto", !connected);
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get("googleCalendar") === "connected") status.textContent = "Conexión completada. Verificando estado…";
  if (params.get("googleCalendar") === "error") status.textContent = params.get("reason") === "access_denied" ? "Conexión cancelada." : "No se pudo conectar Google Calendar.";
  if (params.has("googleCalendar")) window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || "#configuracionAgenda"}`);
  connect.addEventListener("click", async () => { connect.disabled = true; status.textContent = "Conectando…"; try { await iniciarConexionGoogleCalendar(); } catch (error) { status.textContent = "No se pudo iniciar la conexión."; console.warn("[AGENDA][GOOGLE_CALENDAR] Inicio rechazado.", { code: String(error?.code || "internal") }); connect.disabled = false; } });
  disconnect.addEventListener("click", async () => { disconnect.disabled = true; status.textContent = "Desconectando…"; try { await desconectarGoogleCalendar(); render({ connected: false, status: "not_connected" }); } catch (error) { status.textContent = "No se pudo desconectar Google Calendar."; console.warn("[AGENDA][GOOGLE_CALENDAR] Desconexión rechazada.", { code: String(error?.code || "internal") }); } finally { disconnect.disabled = false; } });
  try { render(await obtenerEstadoGoogleCalendar()); } catch (error) { status.textContent = "No se pudo consultar el estado de Google Calendar."; console.warn("[AGENDA][GOOGLE_CALENDAR] Estado no disponible.", { code: String(error?.code || "internal") }); }
}

async function cargarPacientes() {
  const select = $("pacienteCita");
  select.innerHTML = "<option value=\"\">Paciente no registrado / sin paciente</option>";
  try {
    const snap = await listarPacientes(medicoUid, { forzar: true });
    pacientes = snap.docs.map((d) => ({ id: d.id, nombre: obtenerNombrePacienteParaMostrar(d.data()) || "Paciente sin nombre" })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    select.innerHTML += pacientes.map((p) => `<option value="${p.id}">${escaparHTML(p.nombre)}</option>`).join("");
  } catch (error) {
    pacientes = [];
    console.error("Agenda: no se pudieron cargar pacientes registrados.", error);
    select.innerHTML = "<option value=\"\">Paciente no registrado / sin paciente</option><option value=\"\" disabled>No se pudieron cargar pacientes registrados</option>";
  }
}
function rangoVisible() { return { inicio: aFecha(new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), 1)), fin: aFecha(new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 0)) }; }
function rangoConsulta() { const inicio = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() - 1, 1); const fin = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 2, 0); return { inicio: aFecha(inicio), fin: aFecha(fin) }; }
async function cargarEventos() {
  if (!medicoUid) return;
  const { inicio, fin } = rangoConsulta();
  const legacySnap = getDocs(query(agendaRef(), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
  const modernSnap = getDocs(query(agendaRef(), where("startDate", "<=", fin), where("endDate", ">=", inicio)));
  const recurringSnap = getDocs(query(agendaRef(), where("recurrence", "in", ["weekly", "biweekly", "monthly"])));
  const resultados = await Promise.allSettled([legacySnap, modernSnap, recurringSnap]);
  const rechazados = resultados.filter((resultado) => resultado.status === "rejected");
  rechazados.forEach((resultado) => console.error("Agenda: consulta de eventos fallida; se conservarán las consultas disponibles.", resultado.reason));
  const exitosos = resultados.filter((resultado) => resultado.status === "fulfilled").map((resultado) => resultado.value);
  const documentos = new Map();
  exitosos.flatMap((resultado) => resultado.docs).forEach((snapshot) => documentos.set(snapshot.id, { id: snapshot.id, ...snapshot.data() }));
  eventos = [...documentos.values()].map(normalizarEvento); renderizarEventos(); renderizarCalendario();
  if (!exitosos.length) lista.textContent = "No se pudieron cargar los eventos. Revisa la consola y la configuración de Firestore.";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault(); if (!medicoUid) return;
  const id = $("eventoId").value, datos = construirEvento(); if (!datos) return;
  if (datos.type === "appointment") {
    const anterior = id ? eventos.find((evento) => evento.id === id) : null;
    const action = !id ? "create" : cambioHorarioCita(anterior, datos) ? "reschedule" : "update";
    await ejecutarOperacionCita({ action, appointmentId: id, input: datosCitaParaServicio(datos, action), button: $("guardarEvento") });
    return;
  }
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
  lista.innerHTML = ordenados.length ? ordenados.slice(0, 12).map((e) => `<article class="cita tipo-${e.type}"><h3>${escaparHTML(e.title)}</h3><p><strong>${escaparHTML(e.startDate)}${e.allDay ? " · Todo el día" : ` ${escaparHTML(e.startTime)}`}</strong> · ${escaparHTML(TIPO[e.type] || "Evento")}</p>${e.patientName ? `<p>Paciente: ${escaparHTML(e.patientName)}${e.externalPatient ? " · No registrado" : ""}</p>` : ""}${e.description || e.notas ? `<p>${escaparHTML(e.description || e.notas)}</p>` : ""}<p>Estado: ${escaparHTML(e.status)}</p><div class="acciones"><button data-editar="${e.id}">Editar</button>${e.type === "appointment" && e.patientId ? `<button data-ver-paciente="${e.patientId}">Ver paciente</button>` : ""}${e.type === "appointment" && e.status === "programada" && e.confirmation?.status !== "confirmed" ? `<button data-confirmar="${e.id}">Confirmar</button>` : ""}${e.type === "appointment" && e.status === "programada" ? `<button data-completar="${e.id}">Marcar atendida</button><button data-cancelar="${e.id}">Cancelar cita</button>` : ""}${e.type !== "appointment" ? `<button data-eliminar="${e.id}">Eliminar</button>` : ""}</div></article>`).join("") : "Aún no hay eventos en este rango.";
  lista.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => editarEvento(b.dataset.editar))); lista.querySelectorAll("[data-completar]").forEach((b) => b.addEventListener("click", () => marcarAtendida(b.dataset.completar, b))); lista.querySelectorAll("[data-confirmar]").forEach((b) => b.addEventListener("click", () => confirmarCita(b.dataset.confirmar, b))); lista.querySelectorAll("[data-cancelar]").forEach((b) => b.addEventListener("click", () => cancelarCita(b.dataset.cancelar, b))); lista.querySelectorAll("[data-eliminar]").forEach((b) => b.addEventListener("click", () => eliminarEvento(b.dataset.eliminar))); lista.querySelectorAll("[data-ver-paciente]").forEach((b) => b.addEventListener("click", () => { window.location.href = `paciente.html?id=${encodeURIComponent(b.dataset.verPaciente)}`; }));
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
function editarEvento(id) { const e = eventos.find((x) => x.id === id); if (!e) return; abrirNuevoEvento(e.startDate, e.type); $("eventoId").value = e.id; $("eventoEstado").value = e.status || "programada"; $("googleCalendarEventId").value = e.googleCalendarEventId || ""; $("tituloFormulario").textContent = "Editar evento"; $("tituloEvento").value = e.title; $("pacienteCita").value = e.patientId || ""; $("pacienteNombreExterno").value = e.externalPatient ? e.patientName : ""; $("pacienteTelefonoExterno").value = e.patientPhone || ""; $("pacienteCorreoExterno").value = e.patientEmail || ""; $("horaCita").value = e.startTime; $("horaFinEvento").value = e.endTime || ""; $("duracionEvento").value = e.durationMinutes || 60; $("todoElDia").checked = e.allDay; $("fechaFinEvento").value = e.endDate !== e.startDate ? e.endDate : ""; $("ubicacionEvento").value = e.ubicacion || ""; $("recordatorioCita").value = e.recordatorio || ""; $("seguimientoCita").value = e.seguimiento || ""; $("notasCita").value = e.description || e.notas || ""; $("recurrenciaEvento").value = e.recurrence || ""; actualizarCamposPorTipo(); $("cancelarEdicion").classList.remove("oculto"); form.scrollIntoView({ behavior: "smooth", block: "start" }); }
async function marcarAtendida(id, button) { await ejecutarOperacionCita({ action: "complete", appointmentId: id, button }); }
async function confirmarCita(id, button) { await ejecutarOperacionCita({ action: "confirm", appointmentId: id, button }); }
async function cancelarCita(id, button) { if (confirm("¿Cancelar esta cita?")) await ejecutarOperacionCita({ action: "cancel", appointmentId: id, button }); }
async function eliminarEvento(id) { if (!confirm("¿Eliminar este evento?")) return; await deleteDoc(doc(db, "usuarios", medicoUid, "agenda", id)); await registrarEventoAgenda("agenda_event_deleted", "El medico elimino un evento de agenda.", { detalles: { eventoId: id } }); await cargarEventos(); }
const CAMPOS_CITA_SERVICIO = ["startDate", "startTime", "endDate", "endTime", "durationMinutes", "patientId", "patientName", "patientPhone", "patientEmail", "description", "notas", "ubicacion", "recordatorio", "seguimiento", "recurrence", "googleCalendarEventId"];
const CAMPOS_HORARIO_CITA = ["startDate", "startTime", "endDate", "endTime", "durationMinutes", "recurrence"];
function datosCitaParaServicio(datos, action = "create") { const campos = action === "update" ? CAMPOS_CITA_SERVICIO.filter((campo) => !CAMPOS_HORARIO_CITA.includes(campo)) : CAMPOS_CITA_SERVICIO; return Object.fromEntries(campos.map((campo) => [campo, datos[campo] ?? ""])); }
function cambioHorarioCita(anterior, datos) { return CAMPOS_HORARIO_CITA.some((campo) => String(anterior?.[campo] ?? "") !== String(datos[campo] ?? "")); }
function etiquetaOperacionCita(action) { return ({ create: "Guardando…", update: "Guardando…", reschedule: "Reprogramando…", confirm: "Confirmando…", cancel: "Cancelando…", complete: "Actualizando…" })[action] || "Guardando…"; }
function mensajeErrorCita(error) {
  const code = appointmentErrorCode(error);
  const mensajes = {
    conflict: "Ese horario acaba de dejar de estar disponible. La Agenda se actualizó.",
    "permission-denied": "No tienes autorización para modificar esta cita.",
    unauthenticated: "Tu sesión expiró. Inicia sesión nuevamente.",
    "idempotency-key-reused": "Esta solicitud ya fue procesada. Revisa la Agenda actualizada.",
    "payment-not-verified": "La cita requiere un pago verificado antes de confirmarse.",
    "terminal-appointment": "La cita ya no admite esta operación. Revisa su estado actual.",
    "not-found": "La cita ya no existe o fue modificada desde otra sesión.",
    "recurrence-horizon-exceeded": "No fue posible verificar con seguridad esta recurrencia. Revisa la serie.",
    "recurrence-horizon-incomplete": "No fue posible validar la recurrencia completa.",
    "agenda-read-limit": "La agenda requiere revisión antes de registrar más citas.",
    "invalid-interval": "La fecha, hora o duración de la cita no son válidas.",
    "invalid-duration": "La duración de la cita no es válida.",
    "invalid-input": "La información de la cita no es válida.",
    "invalid-state": "La cita cambió de estado. La Agenda se actualizó."
  };
  console.warn("Agenda: operación de cita rechazada.", { action: error?.details?.action || "", code });
  return mensajes[code] || "No fue posible completar la operación. Revisa la Agenda e inténtalo de nuevo.";
}
async function ejecutarOperacionCita({ action, appointmentId = "", input = {}, button = null }) {
  if (operacionCitaActiva) return;
  operacionCitaActiva = true;
  const boton = button || $("guardarEvento");
  const textoOriginal = boton?.textContent || "";
  if (boton) { boton.disabled = true; boton.textContent = etiquetaOperacionCita(action); }
  try {
    console.debug("[AGENDA_TRACE] ui→adapter", { action, hasAppointment: Boolean(appointmentId) });
    await executeAppointmentCommand({ action, appointmentId, input, requestId: createRequestId(`agenda_${action}`) });
    limpiarFormulario();
    await cargarEventos();
    console.debug("[AGENDA_TRACE] firestore→ui", { action, outcome: "refreshed" });
  } catch (error) {
    alert(mensajeErrorCita(error));
    await cargarEventos();
    console.debug("[AGENDA_TRACE] firestore→ui:error", { action, code: appointmentErrorCode(error) });
  } finally {
    operacionCitaActiva = false;
    if (boton?.isConnected) { boton.disabled = false; boton.textContent = textoOriginal; }
  }
}
function limpiarFormulario() { form.reset(); $("eventoId").value = ""; $("googleCalendarEventId").value = ""; $("eventoEstado").value = ""; $("horaCita").disabled = false; $("tituloFormulario").textContent = "Nuevo evento"; $("duracionEvento").value = 60; $("fechaCita").value = aFecha(new Date()); $("cancelarEdicion").classList.add("oculto"); actualizarCamposPorTipo(); }
function actualizarCamposPorTipo() { const esCita = $("tipoEvento").value === "appointment", externo = !$("pacienteCita").value, actual = $("eventoId").value ? eventos.find((e) => e.id === $("eventoId").value) : null; $("campoPaciente").classList.toggle("oculto", !esCita); $("campoPacienteExterno").classList.toggle("oculto", !esCita || !externo); $("datosPacienteExterno").classList.toggle("oculto", !esCita || !externo); $("ayudaVinculacion").classList.toggle("oculto", !esCita || !actual?.externalPatient); $("campoTitulo").classList.toggle("oculto", esCita); }
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
