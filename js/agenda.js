import { auth, db } from "./firebase.js";
import { listarPacientes, obtenerUsuario } from "./services/usuarios.js?v=20260826-cuenta-profesional-gratuita-v1";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { canUseMedicalAgenda } from "./utils/roles.js?v=20260719-admin-universal-modules";
import { executeAppointmentCommand, appointmentErrorCode, createRequestId } from "./services/appointmentCommandService.js";
import { createAgendaWorkspace } from "./agenda/workspace.js";
import { addDays, addMonths, todayInZone, DEFAULT_TIME_ZONE } from "./agenda/visualModel.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { normalizarEvento } from "./services/appointmentService.js";

const TIPO = { appointment: "Cita médica", event: "Evento", meeting: "Reunión", academic: "Actividad académica", shift: "Guardia", block: "Bloqueo / No disponible", vacation: "Vacaciones", other: "Otro" };
const $ = (id) => document.getElementById(id);
let medicoUid = null, pacientes = [], eventos = [];
let operacionCitaActiva = false;
let authGeneration = 0, readGeneration = 0, disposed = false;
let availabilityInitialResult, availabilityResult = null, availabilityState = "loading", availabilityCleanup;
let settingsInitialization = null, googleInitialization = null, googleCleanup = null;
let settingsAbort = new AbortController();
let requestRetry = null;
let editingOriginal = null;
const eventCache = [];
const pendingReads = new Map();
const uiAbort = new AbortController();
const disabledBeforeOperation = new Map();
const agendaRef = () => collection(db, "usuarios", medicoUid, "agenda");
const form = $("formCita");
const workspace = createAgendaWorkspace({
  onRange: (range) => { if (medicoUid) cargarEventos({ range }); },
  onCreate: abrirNuevoEvento,
  onEdit: editarEvento,
  onAction: ejecutarAccionDetalle,
  onSettingsOpen: abrirApartadoConfiguracion,
  onRetry: () => cargarEventos({ force: true })
});

iniciarMonitoreoSesion("Agenda");
const stopAuth = onAuthStateChanged(auth, async (user) => {
  const generation = ++authGeneration;
  medicoUid = null;
  operacionCitaActiva = false;
  disabledBeforeOperation.forEach((disabled, field) => { field.disabled = disabled; });
  disabledBeforeOperation.clear();
  workspace.setBusy(false);
  readGeneration += 1;
  eventCache.length = 0;
  pendingReads.clear();
  eventos = [];
  pacientes = [];
  requestRetry = null;
  editingOriginal = null;
  workspace.closeEditor(); workspace.closeDetail();
  if ($("configuracionAgenda").open) $("configuracionAgenda").close();
  form.reset();
  workspace.setEvents([]);
  workspace.setTimeZone(DEFAULT_TIME_ZONE);
  availabilityCleanup?.();
  settingsAbort.abort();
  settingsAbort = new AbortController();
  googleCleanup?.();
  settingsInitialization = null;
  googleInitialization = null;
  availabilityResult = null;
  availabilityInitialResult = undefined;
  availabilityState = "loading";
  actualizarCamposPorTipo();
  if (!user) { window.location.href = "login.html"; return; }
  try {
    const usuario = await obtenerUsuario(user.uid);
    if (disposed || generation !== authGeneration) return;
    if (!usuario || !canUseMedicalAgenda(usuario)) { mostrarBloqueoAgenda("No tienes autorización para acceder a este servicio."); return; }
    medicoUid = user.uid;
    document.body.classList.remove("bloqueado");
    ["nuevoEvento", "nuevaCita", "abrirConfiguracionAgenda"].forEach((id) => { $(id).disabled = false; });
    availabilityInitialResult = executeAppointmentCommand({ action: "availabilitySettings" });
    availabilityInitialResult.then((result) => {
      if (!disposed && generation === authGeneration) aplicarDisponibilidad(result);
    }).catch((error) => {
      if (disposed || generation !== authGeneration) return;
      availabilityState = "error";
      actualizarCamposPorTipo();
      console.warn("[AGENDA][DISPONIBILIDAD] Zona de agenda pendiente.", { code: appointmentErrorCode(error) });
    });
    await Promise.all([cargarPacientes(generation), cargarEventos()]);
    if (disposed || generation !== authGeneration) return;
    actualizarCamposPorTipo();
    const params = new URLSearchParams(window.location.search);
    if (params.has("googleCalendar")) workspace.openSettings("integrations");
    else if (window.location.hash === "#configuracionAgenda") workspace.openSettings("availability");
  } catch (error) {
    if (disposed || generation !== authGeneration) return;
    mostrarBloqueoAgenda("No se pudo verificar tu acceso a Agenda. Recarga la página para reintentar.");
    console.warn("[AGENDA] Verificación de acceso fallida.", { code: appointmentErrorCode(error) });
  }
});

function aplicarDisponibilidad(result) {
  availabilityResult = result;
  availabilityState = "ready";
  if (result.settings?.timeZone) workspace.setTimeZone(result.settings.timeZone);
  actualizarCamposPorTipo();
}

async function abrirApartadoConfiguracion(section) {
  if (!medicoUid || disposed) return;
  if (section === "integrations") {
    googleInitialization ||= inicializarIntegracionGoogleCalendar();
    await googleInitialization;
    return;
  }
  if (!settingsInitialization) {
    const generation = authGeneration;
    settingsInitialization = import("./services/agendaAvailabilitySettings.js").then(async ({ initializeAgendaAvailabilitySettings }) => {
      if (disposed || generation !== authGeneration) return;
      const cleanup = await initializeAgendaAvailabilitySettings($("configuracionAgenda").querySelector("[data-agenda-availability]"), {
        initialResult: availabilityInitialResult,
        signal: settingsAbort.signal,
        onLoaded: (result) => {
          if (disposed || generation !== authGeneration) return;
          availabilityInitialResult = Promise.resolve(result);
          aplicarDisponibilidad(result);
        },
        onSaved: (result) => {
          if (disposed || generation !== authGeneration) return;
          availabilityInitialResult = Promise.resolve(result);
          aplicarDisponibilidad(result);
        }
      });
      if (disposed || generation !== authGeneration) cleanup?.();
      else availabilityCleanup = cleanup;
    }).catch((error) => {
      settingsInitialization = null;
      console.warn("[AGENDA][DISPONIBILIDAD] Inicialización pendiente.", { code: appointmentErrorCode(error) });
    });
  }
  await settingsInitialization;
}

async function inicializarIntegracionGoogleCalendar() {
  const root = $("configuracionAgenda").querySelector("[data-google-calendar-integration]");
  if (!root) return;
  const generation = authGeneration;
  const status = root.querySelector("[data-google-calendar-status]");
  const connect = root.querySelector("[data-google-calendar-connect]");
  const disconnect = root.querySelector("[data-google-calendar-disconnect]");
  let active = true, pending = false;
  const current = () => active && !disposed && generation === authGeneration;
  const render = (data) => {
    if (!current()) return;
    const connected = data?.connected === true;
    status.textContent = connected ? "Google Calendar conectado." : data?.status === "reauthorization_required" ? "Google Calendar requiere reconexión." : data?.status === "unknown" ? "No se pudo confirmar el estado de Google Calendar." : "Google Calendar no conectado.";
    connect.classList.toggle("oculto", connected); disconnect.classList.toggle("oculto", !connected);
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get("googleCalendar") === "connected") status.textContent = "Conexión completada. Verificando estado…";
  if (params.get("googleCalendar") === "error") status.textContent = params.get("reason") === "access_denied" ? "Conexión cancelada." : "No se pudo conectar Google Calendar.";
  if (params.has("googleCalendar")) window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || "#configuracionAgenda"}`);
  connect.disabled = disconnect.disabled = true;
  try {
    const { iniciarConexionGoogleCalendar, obtenerEstadoGoogleCalendar, desconectarGoogleCalendar } = await import("./services/googleCalendarService.js");
    if (!current()) return;
    const connectHandler = async () => {
      if (pending || !current()) return;
      pending = true; connect.disabled = true; status.textContent = "Conectando…";
      try { await iniciarConexionGoogleCalendar(); }
      catch (error) { if (current()) status.textContent = "No se pudo iniciar la conexión. Puedes reintentar."; console.warn("[AGENDA][GOOGLE_CALENDAR] Inicio rechazado.", { code: String(error?.code || "internal") }); }
      finally { pending = false; if (current()) connect.disabled = false; }
    };
    const disconnectHandler = async () => {
      if (pending || !current()) return;
      pending = true; disconnect.disabled = true; status.textContent = "Desconectando…";
      try { await desconectarGoogleCalendar(); render(await obtenerEstadoGoogleCalendar()); }
      catch (error) { if (current()) status.textContent = "No se pudo confirmar la desconexión. Vuelve a consultar el estado."; console.warn("[AGENDA][GOOGLE_CALENDAR] Desconexión rechazada.", { code: String(error?.code || "internal") }); }
      finally { pending = false; if (current()) disconnect.disabled = false; }
    };
    connect.addEventListener("click", connectHandler);
    disconnect.addEventListener("click", disconnectHandler);
    googleCleanup = () => { active = false; connect.removeEventListener("click", connectHandler); disconnect.removeEventListener("click", disconnectHandler); };
    try { render(await obtenerEstadoGoogleCalendar()); }
    catch (error) { if (current()) status.textContent = "No se pudo consultar el estado de Google Calendar. Cierra y vuelve a abrir Integraciones para reintentar."; googleInitialization = null; googleCleanup(); console.warn("[AGENDA][GOOGLE_CALENDAR] Estado no disponible.", { code: String(error?.code || "internal") }); }
  } catch (error) {
    googleInitialization = null;
    if (current()) status.textContent = "No se pudo cargar la integración. Vuelve a abrir este apartado.";
    console.warn("[AGENDA][GOOGLE_CALENDAR] Integración no disponible.", { code: String(error?.code || "internal") });
  } finally { if (current()) connect.disabled = disconnect.disabled = false; }
}

async function cargarPacientes(generation = authGeneration) {
  const select = $("pacienteCita");
  select.innerHTML = "<option value=\"\">Paciente no registrado / sin paciente</option>";
  try {
    const snap = await listarPacientes(medicoUid, { forzar: true });
    if (disposed || generation !== authGeneration) return;
    pacientes = snap.docs.map((d) => ({ id: d.id, nombre: obtenerNombrePacienteParaMostrar(d.data()) || "Paciente sin nombre" })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    select.innerHTML += pacientes.map((p) => `<option value="${escaparHTML(p.id)}">${escaparHTML(p.nombre)}</option>`).join("");
  } catch (error) {
    if (disposed || generation !== authGeneration) return;
    pacientes = [];
    console.warn("[AGENDA] No se pudieron cargar pacientes registrados.", { code: String(error?.code || "internal") });
    select.innerHTML = "<option value=\"\">Paciente no registrado / sin paciente</option><option value=\"\" disabled>No se pudieron cargar pacientes registrados</option>";
  }
}
function rangoConsulta(range) {
  return { inicio: addMonths(`${range.start.slice(0, 7)}-01`, -1), fin: addDays(addMonths(`${range.end.slice(0, 7)}-01`, 2), -1) };
}
async function cargarEventos({ force = false, range = workspace.range } = {}) {
  if (!medicoUid || disposed) return;
  const generation = ++readGeneration, uid = medicoUid;
  if (force) { eventCache.length = 0; pendingReads.clear(); }
  const cached = eventCache.find((entry) => entry.inicio <= range.start && entry.fin >= range.end);
  if (cached && !force) { eventos = cached.events; workspace.setEvents(eventos); workspace.setStatus(""); return; }
  workspace.setStatus("Cargando calendario…");
  const { inicio, fin } = rangoConsulta(range);
  const key = `${uid}:${inicio}:${fin}`;
  let request = pendingReads.get(key);
  if (!request) {
    // Preserve the existing three read sources. Visual navigation/filtering
    // shares these results and never introduces one query per day or event.
    request = Promise.allSettled([
      Promise.resolve().then(() => getDocs(query(collection(db, "usuarios", uid, "agenda"), where("fecha", ">=", inicio), where("fecha", "<=", fin)))),
      Promise.resolve().then(() => getDocs(query(collection(db, "usuarios", uid, "agenda"), where("startDate", "<=", fin), where("endDate", ">=", inicio)))),
      Promise.resolve().then(() => getDocs(query(collection(db, "usuarios", uid, "agenda"), where("recurrence", "in", ["weekly", "biweekly", "monthly"]))))
    ]);
    pendingReads.set(key, request);
  }
  const resultados = await request;
  if (pendingReads.get(key) === request) pendingReads.delete(key);
  if (disposed || generation !== readGeneration || uid !== medicoUid) return;
  const rejected = resultados.filter((item) => item.status === "rejected");
  rejected.forEach((item) => console.warn("[AGENDA] Lectura incompleta.", { code: String(item.reason?.code || "internal") }));
  const fulfilled = resultados.filter((item) => item.status === "fulfilled");
  const documents = new Map(rejected.length ? eventos.map((event) => [event.id, event]) : []);
  fulfilled.flatMap((item) => item.value.docs).forEach((snapshot) => documents.set(snapshot.id, { ...snapshot.data(), id: snapshot.id }));
  if (fulfilled.length) {
    eventos = [...documents.values()].map(normalizarEvento);
    workspace.setEvents(eventos);
  }
  if (rejected.length) {
    const unauthorized = rejected.some((item) => /permission-denied|unauthenticated/u.test(String(item.reason?.code || "")));
    workspace.setStatus(unauthorized ? "No autorizado para leer todos los eventos. Comprueba tu sesión y reintenta."
      : fulfilled.length ? "Carga incompleta: algunos eventos pueden faltar o no estar actualizados. Reintenta antes de interpretar este rango."
        : "No se pudieron cargar los eventos. Los datos anteriores, si existen, pueden estar desactualizados.", { error: true, retry: true });
    return;
  }
  eventCache.unshift({ inicio, fin, events: eventos });
  eventCache.splice(3);
  workspace.setStatus("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault(); if (!medicoUid || operacionCitaActiva || disposed) return;
  const id = $("eventoId").value, datos = construirEvento(); if (!datos) return;
  const original = id ? editingOriginal || eventos.find((evento) => evento.id === id) : null;
  if (id && (!original || original.type !== datos.type)) { estadoEditor("El tipo de un evento existente no puede cambiarse. Cierra y vuelve a abrir el evento."); return; }
  if (datos.type === "appointment") {
    const anterior = original;
    const action = !id ? "create" : cambioHorarioCita(anterior, datos) ? "reschedule" : "update";
    if (availabilityState !== "ready") { estadoEditor("No se pudo confirmar la zona de Agenda. Abre Configuración y vuelve a cargar la disponibilidad antes de guardar una cita."); return; }
    if (anterior?.allDay && action === "reschedule") { estadoEditor("Esta cita legacy de todo el día admite cambios de datos, pero el servicio actual requiere revisar su horario antes de reprogramarla."); return; }
    if (action === "reschedule" && anterior?.timeZone && availabilityResult?.settings?.timeZone && anterior.timeZone !== availabilityResult.settings.timeZone) {
      estadoEditor(`Esta cita se creó en ${anterior.timeZone} y la jornada actual usa ${availabilityResult.settings.timeZone}. La reprogramación entre zonas requiere revisión del servicio; puedes guardar cambios que no alteren su horario.`);
      return;
    }
    await ejecutarOperacionCita({ action, appointmentId: id, input: datosCitaParaServicio(datos, action), button: $("guardarEvento") });
    return;
  }
  // Appointments return above. The legacy direct transport remains exclusively
  // for non-appointment events; changing the selector cannot bypass this guard.
  const generation = authGeneration, actorUid = medicoUid;
  establecerOperacionPendiente(true);
  estadoEditor("Guardando evento…");
  try {
    let audited;
    if (id) {
      delete datos.createdAt; delete datos.fechaCreacion; delete datos.creadoPor;
      await updateDoc(doc(db, "usuarios", actorUid, "agenda", id), datos);
      if (disposed || generation !== authGeneration) return;
      audited = await registrarEventoAgenda("agenda_event_updated", "El medico actualizo un evento de agenda.", { detalles: { eventoId: id, type: datos.type } });
    } else {
      const ref = await addDoc(agendaRef(), datos);
      if (disposed || generation !== authGeneration) return;
      audited = await registrarEventoAgenda("agenda_event_created", "El medico creo un evento de agenda.", { pacienteUid: datos.patientId, pacienteNombre: datos.patientName, detalles: { eventoId: ref.id, type: datos.type } });
    }
    if (disposed || generation !== authGeneration) return;
    limpiarFormulario(); workspace.closeEditor(); workspace.closeDetail();
    await cargarEventos({ force: true });
    if (!audited) workspace.setStatus("Evento guardado. No se pudo confirmar el registro de auditoría; requiere revisión.", { error: true });
  } catch (error) {
    if (disposed || generation !== authGeneration) return;
    estadoEditor("No se pudo confirmar el guardado. Conservamos tus cambios; revisa la Agenda antes de reintentar.");
    console.warn("[AGENDA] Guardado de evento no confirmado.", { code: String(error?.code || "internal") });
    await cargarEventos({ force: true });
  } finally { if (!disposed && generation === authGeneration) establecerOperacionPendiente(false); }
}, { signal: uiAbort.signal });
function construirEvento() {
  const type = $("tipoEvento").value, startDate = $("fechaCita").value, allDay = $("todoElDia").checked;
  if (!startDate) { alert("Selecciona una fecha."); return null; }
  const patientId = type === "appointment" ? $("pacienteCita").value : "", externalPatient = type === "appointment" && !patientId && Boolean($("pacienteNombreExterno").value.trim());
  if (type === "appointment" && !patientId && !externalPatient) { alert("Selecciona un paciente registrado o escribe el nombre del paciente no registrado."); return null; }
  const patient = patientId ? pacientes.find((p) => p.id === patientId) || (editingOriginal?.patientId === patientId ? { nombre: editingOriginal.patientName } : null) : null, endDate = $("fechaFinEvento").value || startDate, startTime = allDay ? "" : $("horaCita").value, endTime = allDay ? "" : $("horaFinEvento").value;
  if (endDate < startDate) { alert("La fecha final no puede ser anterior a la fecha inicial."); return null; }
  if (!allDay && !startTime) { alert("Selecciona una hora de inicio."); return null; }
  if (!allDay && endDate === startDate && endTime && endTime <= startTime) { alert("La hora de finalización debe ser posterior a la hora de inicio."); return null; }
  const patientName = patient?.nombre || (externalPatient ? $("pacienteNombreExterno").value.trim() : "");
  return { type, title: $("tituloEvento").value.trim() || (type === "appointment" ? "Cita médica" : TIPO[type]), fecha: startDate, hora: startTime, startDate, startTime, endDate, endTime, allDay, durationMinutes: allDay ? null : Number($("duracionEvento").value || 60), pacienteId: patientId, pacienteNombre: patientName, patientId, patientName, externalPatient, patientPhone: externalPatient ? $("pacienteTelefonoExterno").value.trim() : "", patientEmail: externalPatient ? $("pacienteCorreoExterno").value.trim() : "", description: $("notasCita").value.trim(), notas: $("notasCita").value.trim(), ubicacion: $("ubicacionEvento").value.trim(), recordatorio: $("recordatorioCita").value.trim(), seguimiento: $("seguimientoCita").value.trim(), status: $("eventoEstado").value || "programada", estado: $("eventoEstado").value || "programada", recurrence: $("recurrenciaEvento").value || null, googleCalendarEventId: $("googleCalendarEventId").value || null, syncStatus: "not_configured", creadoPor: medicoUid, actualizadoPor: medicoUid, fechaCreacion: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function abrirNuevoEvento({ date = workspace.state.date, time = "09:00", allDay = false, type = "event" } = {}) {
  if (!medicoUid || operacionCitaActiva) return;
  limpiarFormulario();
  $("fechaCita").value = date;
  $("tipoEvento").value = type;
  $("horaCita").value = time;
  $("todoElDia").checked = type !== "appointment" && allDay;
  actualizarCamposPorTipo();
  workspace.openEditor();
  (type === "appointment" ? $("pacienteCita") : $("tituloEvento")).focus();
}
function editarEvento(id) {
  if (!medicoUid || operacionCitaActiva) return;
  const e = eventos.find((x) => x.id === id);
  if (!e) { workspace.setStatus("El evento ya no está disponible. Vuelve a cargar la Agenda.", { error: true, retry: true }); return; }
  if (e.type === "appointment" && e.status !== "programada") { workspace.setStatus("Esta cita ya no admite edición.", { error: true }); return; }
  limpiarFormulario();
  editingOriginal = e;
  $("eventoId").value = e.id;
  $("tipoEvento").value = e.type;
  $("tipoEvento").disabled = true;
  $("fechaCita").value = e.startDate;
  $("eventoEstado").value = e.status || "programada";
  $("googleCalendarEventId").value = e.googleCalendarEventId || "";
  $("tituloFormulario").textContent = "Editar evento";
  $("tituloEvento").value = e.title;
  $("pacienteCita").value = e.patientId || "";
  // A temporarily unavailable patient listing must not unlink the original
  // patient on an otherwise unrelated edit. The original ID is already read
  // through the authorized Agenda source; the domain still checks permission.
  if (e.patientId && !$("pacienteCita").value) {
    const option = document.createElement("option");
    option.value = e.patientId; option.textContent = e.patientName || "Paciente vinculado";
    option.dataset.originalPatient = "true";
    $("pacienteCita").append(option); $("pacienteCita").value = e.patientId;
  }
  $("pacienteNombreExterno").value = e.externalPatient ? e.patientName : "";
  $("pacienteTelefonoExterno").value = e.patientPhone || "";
  $("pacienteCorreoExterno").value = e.patientEmail || "";
  $("horaCita").value = e.startTime;
  $("horaFinEvento").value = e.endTime || "";
  $("duracionEvento").value = e.durationMinutes || 60;
  $("todoElDia").checked = e.allDay;
  $("fechaFinEvento").value = e.endDate !== e.startDate ? e.endDate : "";
  $("ubicacionEvento").value = e.ubicacion || "";
  $("recordatorioCita").value = e.recordatorio || "";
  $("seguimientoCita").value = e.seguimiento || "";
  $("notasCita").value = e.description || e.notas || "";
  $("recurrenciaEvento").value = e.recurrence || "";
  actualizarCamposPorTipo();
  workspace.openEditor();
  $("fechaCita").focus();
}
async function ejecutarAccionDetalle(action, id, button) {
  if (!medicoUid || operacionCitaActiva) return;
  const event = eventos.find((item) => item.id === id);
  if (!event) return;
  if (action === "patient") { if (event.type === "appointment" && event.patientId) window.location.href = `paciente.html?id=${encodeURIComponent(event.patientId)}`; return; }
  if (action === "delete") { if (event.type !== "appointment") await eliminarEvento(id); return; }
  if (event.type !== "appointment" || event.status !== "programada") return;
  if (action === "confirm" && event.confirmation?.status !== "confirmed") await confirmarCita(id, button);
  else if (action === "complete") await marcarAtendida(id, button);
  else if (action === "cancel") await cancelarCita(id, button);
}
async function marcarAtendida(id, button) { await ejecutarOperacionCita({ action: "complete", appointmentId: id, button }); }
async function confirmarCita(id, button) { await ejecutarOperacionCita({ action: "confirm", appointmentId: id, button }); }
async function cancelarCita(id, button) { if (confirm("¿Cancelar esta cita?")) await ejecutarOperacionCita({ action: "cancel", appointmentId: id, button }); }
async function eliminarEvento(id) {
  const event = eventos.find((item) => item.id === id);
  if (!medicoUid || operacionCitaActiva || !event || event.type === "appointment") return;
  if (!confirm("¿Eliminar este evento?")) return;
  const generation = authGeneration, actorUid = medicoUid;
  establecerOperacionPendiente(true);
  try {
    await deleteDoc(doc(db, "usuarios", actorUid, "agenda", id));
    if (disposed || generation !== authGeneration) return;
    const audited = await registrarEventoAgenda("agenda_event_deleted", "El medico elimino un evento de agenda.", { detalles: { eventoId: id } });
    if (disposed || generation !== authGeneration) return;
    workspace.closeDetail();
    await cargarEventos({ force: true });
    if (!audited) workspace.setStatus("Evento eliminado. No se pudo confirmar el registro de auditoría; requiere revisión.", { error: true });
  } catch (error) {
    if (disposed || generation !== authGeneration) return;
    workspace.setStatus("No se pudo confirmar la eliminación. El evento se conserva en la vista hasta recargar.", { error: true, retry: true });
    console.warn("[AGENDA] Eliminación no confirmada.", { code: String(error?.code || "internal") });
  } finally { if (!disposed && generation === authGeneration) establecerOperacionPendiente(false); }
}
const CAMPOS_CITA_SERVICIO = ["startDate", "startTime", "endDate", "endTime", "durationMinutes", "patientId", "patientName", "patientPhone", "patientEmail", "description", "notas", "ubicacion", "recordatorio", "seguimiento", "recurrence", "googleCalendarEventId"];
const CAMPOS_HORARIO_CITA = ["startDate", "startTime", "endDate", "endTime", "durationMinutes", "recurrence"];
function datosCitaParaServicio(datos, action = "create") { const campos = action === "update" ? CAMPOS_CITA_SERVICIO.filter((campo) => !CAMPOS_HORARIO_CITA.includes(campo)) : CAMPOS_CITA_SERVICIO; return Object.fromEntries(campos.map((campo) => [campo, datos[campo] ?? ""])); }
function cambioHorarioCita(anterior, datos) {
  // Legacy all-day appointments can still update descriptive fields. Their
  // disabled clock fields are not a proposal to reinterpret their interval.
  const fields = anterior?.allDay && datos.allDay ? CAMPOS_HORARIO_CITA.filter((field) => !["durationMinutes", "startTime", "endTime"].includes(field)) : CAMPOS_HORARIO_CITA;
  return fields.some((campo) => String(anterior?.[campo] ?? "") !== String(datos[campo] ?? ""));
}
function etiquetaOperacionCita(action) { return ({ create: "Guardando…", update: "Guardando…", reschedule: "Reprogramando…", confirm: "Confirmando…", cancel: "Cancelando…", complete: "Actualizando…" })[action] || "Guardando…"; }
function mensajeErrorCita(error) {
  const code = appointmentErrorCode(error);
  const mensajes = {
    conflict: "Ese horario acaba de dejar de estar disponible. Se conserva el horario original y tus cambios en el editor.",
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
    "invalid-state": "La cita cambió de estado. Revisa su estado antes de reintentar.",
    "outside-working-hours": "El intervalo está fuera de la jornada configurada.",
    "configuration-required": "Configura una zona y jornada válidas antes de reservar.",
    "invalid-timezone": "La zona de Agenda requiere revisión en Configuración.",
    "transactional-mode-disabled": "Las operaciones de citas no están habilitadas para esta cuenta."
  };
  console.warn("Agenda: operación de cita rechazada.", { action: error?.details?.action || "", code });
  return mensajes[code] || "No fue posible completar la operación. Revisa la Agenda e inténtalo de nuevo.";
}
async function ejecutarOperacionCita({ action, appointmentId = "", input = {}, button = null }) {
  if (!medicoUid || operacionCitaActiva || disposed) return;
  const generation = authGeneration;
  const fingerprint = JSON.stringify([medicoUid, action, appointmentId, input]);
  if (requestRetry?.fingerprint !== fingerprint) requestRetry = { fingerprint, requestId: createRequestId(`agenda_${action}`) };
  const requestId = requestRetry.requestId;
  establecerOperacionPendiente(true);
  const boton = button || $("guardarEvento");
  const textoOriginal = boton?.textContent || "";
  if (boton) { boton.disabled = true; boton.textContent = etiquetaOperacionCita(action); }
  estadoEditor(etiquetaOperacionCita(action));
  try {
    console.debug("[AGENDA_TRACE] ui→adapter", { action, hasAppointment: Boolean(appointmentId) });
    await executeAppointmentCommand({ action, appointmentId, input, requestId });
    if (disposed || generation !== authGeneration) return;
    requestRetry = null;
    limpiarFormulario();
    workspace.closeEditor(); workspace.closeDetail();
    await cargarEventos({ force: true });
    console.debug("[AGENDA_TRACE] firestore→ui", { action, outcome: "refreshed" });
  } catch (error) {
    if (disposed || generation !== authGeneration) return;
    const message = mensajeErrorCita(error);
    estadoEditor(message);
    await cargarEventos({ force: true });
    if (!$("editorAgenda").open) {
      workspace.closeDetail();
      workspace.setStatus(message, { error: true, retry: true });
    }
    console.debug("[AGENDA_TRACE] firestore→ui:error", { action, code: appointmentErrorCode(error) });
  } finally {
    if (!disposed && generation === authGeneration) {
      establecerOperacionPendiente(false);
      if (boton?.isConnected) { boton.disabled = false; boton.textContent = textoOriginal; }
      actualizarCamposPorTipo();
    }
  }
}
function establecerOperacionPendiente(value) {
  operacionCitaActiva = value;
  workspace.setBusy(value);
  if (value) {
    form.querySelectorAll("input, select, textarea").forEach((field) => { disabledBeforeOperation.set(field, field.disabled); field.disabled = true; });
  } else {
    disabledBeforeOperation.forEach((disabled, field) => { field.disabled = disabled; });
    disabledBeforeOperation.clear();
    actualizarCamposPorTipo();
  }
}
function estadoEditor(message = "") { $("estadoEditor").textContent = message; }
function limpiarFormulario() {
  form.reset();
  editingOriginal = null;
  $("eventoId").value = "";
  $("googleCalendarEventId").value = "";
  $("eventoEstado").value = "";
  $("tipoEvento").disabled = false;
  $("horaCita").disabled = false;
  $("tituloFormulario").textContent = "Nuevo evento";
  $("duracionEvento").value = 60;
  $("fechaCita").value = todayInZone(workspace.state.timeZone);
  $("pacienteCita").querySelectorAll("[data-original-patient]").forEach((option) => option.remove());
  form.querySelectorAll("details").forEach((details) => { details.open = false; });
  estadoEditor();
  actualizarCamposPorTipo();
}
function actualizarCamposPorTipo() {
  const esCita = $("tipoEvento").value === "appointment", externo = !$("pacienteCita").value;
  const actual = $("eventoId").value ? editingOriginal || eventos.find((e) => e.id === $("eventoId").value) : null;
  $("campoPaciente").classList.toggle("oculto", !esCita);
  $("campoPacienteExterno").classList.toggle("oculto", !esCita || !externo);
  $("datosPacienteExterno").classList.toggle("oculto", !esCita || !externo);
  $("ayudaVinculacion").classList.toggle("oculto", !esCita || !actual?.externalPatient);
  $("campoTitulo").classList.toggle("oculto", esCita);
  const zone = actual?.timeZone || availabilityResult?.settings?.timeZone;
  const journalState = $("estadoJornada");
  if (journalState) journalState.textContent = availabilityState === "loading" ? "Consultando zona y jornada…"
    : availabilityState === "error" ? "No se pudo consultar la jornada. Se muestra una zona provisional; vuelve a cargar Configuración."
      : !availabilityResult?.settings ? "Jornada sin configurar. Se conservan los horarios legacy; esta vista no confirma disponibilidad."
        : availabilityResult.bookingReady ? "Jornada configurada. Toda reserva se valida al guardar." : "La jornada aún no está habilitada para reservas externas.";
  $("zonaEditor").textContent = zone ? `Horarios en ${zone}.${actual?.timeZone && actual.timeZone !== workspace.state.timeZone ? ` La cuadrícula se muestra en ${workspace.state.timeZone}.` : ""}`
    : availabilityState === "error" ? "No se pudo consultar la zona de Agenda. Las citas requieren recargar Configuración."
      : availabilityState === "loading" ? "Consultando la zona de Agenda…" : "Horario civil legacy: se conserva tal como fue registrado; no se asigna otra zona al guardar.";
  $("alcanceRecurrencia").hidden = !actual?.recurrence;
  if (operacionCitaActiva) return;
  $("tipoEvento").disabled = Boolean(actual);
  if (esCita && !actual) $("todoElDia").checked = false;
  $("todoElDia").disabled = esCita;
  const allDay = $("todoElDia").checked;
  $("horaCita").disabled = allDay;
  $("horaFinEvento").disabled = allDay;
  $("duracionEvento").disabled = allDay;
  $("horaCita").required = !allDay;
  $("guardarEvento").disabled = !medicoUid || (esCita && availabilityState !== "ready");
}
function mostrarBloqueoAgenda(mensaje) {
  medicoUid = null;
  document.body.classList.remove("bloqueado");
  workspace.setEvents([]);
  workspace.setStatus(mensaje, { error: true });
  ["nuevoEvento", "nuevaCita", "abrirConfiguracionAgenda", "guardarEvento"].forEach((id) => { $(id).disabled = true; });
  workspace.closeEditor(); workspace.closeDetail();
}
function escaparHTML(valor) { return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
async function registrarEventoAgenda(accion, descripcion, opciones = {}) {
  const actorUid = medicoUid, generation = authGeneration;
  try {
    const medico = await obtenerUsuario(actorUid);
    if (disposed || generation !== authGeneration) return false;
    await registrarEventoAuditoria({ accion, modulo: "Agenda", descripcion, usuarioUid: actorUid, usuarioNombre: medico?.nombre || "", usuarioRol: medico?.rol || "medico", pacienteUid: opciones.pacienteUid || "", pacienteNombre: opciones.pacienteNombre || "", exito: true, detalles: opciones.detalles || {} });
    return true;
  } catch (error) {
    console.warn("[AGENDA] Auditoría de evento no confirmada.", { code: String(error?.code || "internal") });
    return false;
  }
}

for (const id of ["tipoEvento", "pacienteCita", "todoElDia"]) $(id).addEventListener("change", actualizarCamposPorTipo, { signal: uiAbort.signal });
window.addEventListener("hashchange", () => {
  if (medicoUid && window.location.hash === "#configuracionAgenda") workspace.openSettings("availability");
}, { signal: uiAbort.signal });
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  disposed = true;
  authGeneration += 1;
  readGeneration += 1;
  stopAuth();
  availabilityCleanup?.();
  settingsAbort.abort();
  googleCleanup?.();
  uiAbort.abort();
  workspace.destroy();
  eventCache.length = 0;
  pendingReads.clear();
  eventos = [];
  pacientes = [];
  requestRetry = null;
});
