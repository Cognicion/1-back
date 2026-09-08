import { TYPES, DEFAULT_TIME_ZONE, eventGroup, todayInZone, addDays, addMonths, rangeFor, stepDate, dateLabel, projectEvents, arrangeOverlaps, eventDisplayInterval } from "./visualModel.js";

const $ = (id) => document.getElementById(id);
export const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const timeLabel = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`;
const eventTitle = (event) => event.type === "appointment" ? event.patientName || "Cita médica" : event.title || TYPES[event.type] || "Evento";
const weekDays = ["L", "M", "M", "J", "V", "S", "D"];
const terminal = (event) => ["cancelada", "cancelled", "atendida", "completed"].includes(event.status);

/** UI state only. Documents stay in the existing reader; commands use source IDs. */
export function createAgendaWorkspace({ onRange, onCreate, onEdit, onAction, onSettingsOpen, onRetry } = {}) {
  const mobile = window.matchMedia("(max-width: 760px)");
  let preferredView;
  try { preferredView = localStorage.getItem("cognicion.agenda.view"); } catch { /* Preference storage is optional. */ }
  const state = {
    date: todayInZone(DEFAULT_TIME_ZONE), timeZone: DEFAULT_TIME_ZONE,
    view: ["day", "week", "month", "list"].includes(preferredView) ? preferredView : mobile.matches ? "day" : "week",
    filters: new Set(["appointment", "event", "shift", "block", "vacation"]), selectedEvent: null,
    editor: false, settingsOpen: false
  };
  const abort = new AbortController(), signal = abort.signal;
  const root = $("agendaWorkspace"), calendar = $("calendario");
  let events = [], segments = [], miniMonth = state.date, busy = false, initialized = false;
  let projectedSource = null, projectedRange = "";
  let explicitStatus = "Cargando calendario…", statusOptions = {}, dateChosen = false;
  const openers = new WeakMap();
  const listen = (node, event, handler) => node?.addEventListener(event, handler, { signal });
  const visibleRange = () => rangeFor(state.date, state.view);
  const visibleSegments = () => segments.filter((segment) => state.filters.has(eventGroup(segment.event.type)));
  function closeDialog(dialog) { if (dialog.open) dialog.close(); }
  function openDialog(dialog) {
    if (dialog.open) return;
    openers.set(dialog, document.activeElement);
    dialog.showModal();
  }
  for (const id of ["editorAgenda", "detalleAgenda", "configuracionAgenda"]) {
    const dialog = $(id);
    listen(dialog, "cancel", (event) => { if (busy) event.preventDefault(); });
    listen(dialog, "close", () => {
      if (id === "editorAgenda") state.editor = false;
      if (id === "detalleAgenda") state.selectedEvent = null;
      if (id === "configuracionAgenda") {
        state.settingsOpen = false;
        if (location.hash === "#configuracionAgenda") history.replaceState({}, "", `${location.pathname}${location.search}`);
      }
      const opener = openers.get(dialog);
      const fallback = mobile.matches ? $("alternarSidebar") : $("nuevoEvento");
      if (!document.querySelector(".agenda-dialog[open]")) (opener?.isConnected && opener.getClientRects().length ? opener : fallback).focus({ preventScroll: true });
    });
  }
  function sidebar(open = undefined) {
    if (mobile.matches) {
      const expanded = open ?? !root.classList.contains("sidebar-open");
      root.classList.toggle("sidebar-open", expanded); $("cerrarSidebar").hidden = !expanded;
      $("alternarSidebar").setAttribute("aria-expanded", String(expanded));
      if (expanded) $("nuevoEvento").focus();
    } else {
      root.classList.toggle("sidebar-collapsed", open === undefined ? !root.classList.contains("sidebar-collapsed") : !open);
      $("alternarSidebar").setAttribute("aria-expanded", String(!root.classList.contains("sidebar-collapsed")));
    }
  }
  function create(options = {}) {
    if (busy) return;
    if (mobile.matches) sidebar(false);
    onCreate?.({ date: state.date, time: "09:00", allDay: false, type: "event", ...options });
  }
  function navigate(date, view = state.view) {
    if (busy) return;
    dateChosen = true; state.date = date; state.view = view; miniMonth = date;
    try { localStorage.setItem("cognicion.agenda.view", view); } catch { /* Visual preference only. */ }
    render({ resetScroll: true }); onRange?.(visibleRange());
  }
  function renderMini() {
    const today = todayInZone(state.timeZone), range = visibleRange();
    $("miniMes").textContent = dateLabel(miniMonth, { month: "long", year: "numeric" });
    $("miniCalendario").innerHTML = weekDays.map((label) => `<span class="mini-weekday">${label}</span>`).join("") + rangeFor(miniMonth, "month").days.map((date) => {
      const classes = [date.slice(0, 7) !== miniMonth.slice(0, 7) ? "adjacent" : "", date === today ? "today" : "", date === state.date ? "selected" : "", date >= range.start && date <= range.end ? "in-range" : ""].join(" ");
      return `<button type="button" data-mini-date="${date}" class="${classes}" aria-label="${escapeHTML(dateLabel(date))}" ${date === today ? 'aria-current="date"' : ""} aria-pressed="${date === state.date}" tabindex="${date === state.date || (state.date.slice(0, 7) !== miniMonth.slice(0, 7) && date === `${miniMonth.slice(0, 7)}-01`) ? 0 : -1}">${Number(date.slice(-2))}</button>`;
    }).join("");
  }
  function eventButton(segment, attributes = "", extraClass = "") {
    const label = eventTitle(segment.event), when = segment.invalidTime ? "Revisar horario" : segment.allDay ? "Todo el día" : `${timeLabel(segment.startMinute)}–${timeLabel(segment.endMinute)}`;
    const repeated = segment.event.recurrence ? " · Se repite" : "";
    return `<button type="button" class="calendar-event group-${eventGroup(segment.event.type)} ${terminal(segment.event) ? "cancelled" : ""} ${extraClass}" data-segment="${escapeHTML(segment.key)}" aria-label="${escapeHTML(`${label}, ${TYPES[segment.event.type]}, ${dateLabel(segment.date)}, ${when}${repeated}, ${segment.event.status || "programada"}`)}" title="${escapeHTML(`${when} · ${label}${repeated}`)}" ${attributes}><span class="event-copy">${segment.continuesBefore ? "‹ " : ""}${escapeHTML(label)}${segment.continuesAfter ? " ›" : ""}<small>${escapeHTML(when)}</small></span></button>`;
  }
  function renderTime(range, items) {
    const today = todayInZone(state.timeZone);
    const byDay = new Map(range.days.map((date) => [date, items.filter((segment) => segment.date === date)]));
    const headers = range.days.map((date) => `<div class="day-heading ${date === today ? "is-today" : ""}"><small>${escapeHTML(dateLabel(date, { weekday: "short" }))}</small><button class="day-number" data-open-day="${date}" aria-label="Abrir día ${escapeHTML(dateLabel(date))}">${Number(date.slice(-2))}</button></div>`).join("");
    const allDay = range.days.map((date) => `<div class="all-day-cell">${byDay.get(date).filter((item) => item.allDay).map((item) => eventButton(item, "", "all-day")).join("")}<button class="all-day-create" data-create-date="${date}" data-all-day="true" aria-label="Crear evento de todo el día ${date}">＋</button></div>`).join("");
    const axis = Array.from({ length: 23 }, (_, hour) => `<span class="hour-label" style="top:${(hour + 1) * 64}px">${timeLabel((hour + 1) * 60)}</span>`).join("");
    const columns = range.days.map((date) => {
      const slots = Array.from({ length: 48 }, (_, index) => `<button class="time-slot" type="button" data-create-date="${date}" data-time="${timeLabel(index * 30)}" data-slot="${date}:${index}" tabindex="${date === (range.days.includes(state.date) ? state.date : range.start) && index === 18 ? 0 : -1}" aria-label="Crear evento ${date} a las ${timeLabel(index * 30)}"></button>`).join("");
      const timed = arrangeOverlaps(byDay.get(date).filter((item) => !item.allDay)).map((segment) => {
        const height = (segment.endMinute - segment.startMinute) / 60 * 64;
        return eventButton(segment, `style="top:${segment.startMinute / 60 * 64}px;height:${height}px;left:calc(${segment.column / segment.columns * 100}% + 1px);width:calc(${100 / segment.columns}% - 3px)"`, `timed ${height < 20 ? "short" : ""}`);
      }).join("");
      return `<div class="time-column ${date === today ? "is-today" : ""}" data-column-date="${date}">${slots}${timed}</div>`;
    }).join("");
    return `<div class="time-view ${state.view === "day" ? "day-view" : ""}" style="--days:${range.days.length}"><div class="time-head"><div class="day-headings"><div></div>${headers}</div><div class="all-day-row"><div class="all-day-label">Todo el día</div>${allDay}</div></div><div class="time-columns"><div class="hour-axis">${axis}</div>${columns}</div></div>`;
  }
  function renderMonth(range, items) {
    const today = todayInZone(state.timeZone), weekCount = range.days.length / 7;
    const availableHeight = Math.max(calendar.clientHeight, 480) - 30;
    const capacity = Math.max(1, Math.min(4, Math.floor((availableHeight / weekCount - 40) / 23) - 1));
    let html = '<div class="month-view"><div class="month-weekdays">' + ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => `<span>${day}</span>`).join("") + "</div>";
    for (let index = 0; index < range.days.length; index += 7) {
      const days = range.days.slice(index, index + 7), occupancy = Array.from({ length: capacity }, () => Array(7).fill(false)), hiddenCounts = Array(7).fill(0);
      const weekItems = items.filter((item) => days.includes(item.date)), groups = new Map();
      for (const segment of weekItems) {
        // One band per multi-day occurrence in this week, one source document.
        if (!groups.has(segment.occurrenceId)) groups.set(segment.occurrenceId, []);
        groups.get(segment.occurrenceId).push(segment);
      }
      const bands = [...groups.values()].sort((a, b) => Number(b[0].allDay) - Number(a[0].allDay) || b.length - a.length || a[0].startMinute - b[0].startMinute);
      const cells = days.map((date) => `<div class="month-cell ${date === today ? "is-today" : ""} ${date.slice(0, 7) !== state.date.slice(0, 7) ? "adjacent" : ""}"><button class="month-create" data-create-date="${date}" aria-label="Crear evento el ${escapeHTML(dateLabel(date))}"></button><button class="day-number" data-open-day="${date}" aria-label="Abrir día ${escapeHTML(dateLabel(date))}">${Number(date.slice(-2))}</button></div>`).join("");
      let contents = "";
      for (const band of bands) {
        const first = days.indexOf(band[0].date), last = days.indexOf(band.at(-1).date);
        const lane = occupancy.findIndex((row) => row.slice(first, last + 1).every((taken) => !taken));
        if (lane < 0) { for (const segment of band) hiddenCounts[days.indexOf(segment.date)]++; continue; }
        for (let column = first; column <= last; column++) occupancy[lane][column] = true;
        const segment = band[0], label = `${segment.continuesBefore ? "‹ " : ""}${segment.allDay ? "" : `${timeLabel(segment.startMinute)} `}${eventTitle(segment.event)}${band.at(-1).continuesAfter ? " ›" : ""}`;
        contents += `<button class="calendar-event month-event group-${eventGroup(segment.event.type)} ${terminal(segment.event) ? "cancelled" : ""}" data-segment="${escapeHTML(segment.key)}" style="grid-column:${first + 1}/${last + 2};grid-row:${lane + 1}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${escapeHTML(label)}</button>`;
      }
      hiddenCounts.forEach((count, column) => { if (count) contents += `<button class="more-events" data-more-date="${days[column]}" style="grid-column:${column + 1};grid-row:${capacity + 1}" aria-label="Ver ${count} eventos más el ${days[column]}">+ ${count} más</button>`; });
      html += `<div class="month-week">${cells}<div class="month-event-layer">${contents}</div></div>`;
    }
    return html + "</div>";
  }
  function renderList(range, items) {
    let rows = "";
    for (const date of range.days) {
      const dayItems = items.filter((segment) => segment.date === date);
      if (!dayItems.length) continue;
      rows += `<tr class="list-date"><th colspan="5">${escapeHTML(dateLabel(date, { weekday: "long", day: "numeric", month: "long" }))}</th></tr>`;
      for (const segment of dayItems) rows += `<tr><td>${segment.invalidTime ? "Revisar horario" : segment.allDay ? "Todo el día" : `${timeLabel(segment.startMinute)}<br>${timeLabel(segment.endMinute)}`}</td><td class="list-type">${escapeHTML(TYPES[segment.event.type] || "Evento")}</td><td><button class="list-event-title" data-segment="${escapeHTML(segment.key)}">${escapeHTML(eventTitle(segment.event))}</button>${segment.continuesBefore || segment.continuesAfter ? '<span class="agenda-hint"> · Multidía</span>' : ""}</td><td class="list-state">${escapeHTML(segment.event.status || "programada")}</td><td><button data-segment="${escapeHTML(segment.key)}" aria-label="Detalles y acciones de ${escapeHTML(eventTitle(segment.event))}">Abrir</button></td></tr>`;
    }
    return rows ? `<table class="agenda-list"><colgroup><col style="width:90px"><col class="list-type" style="width:150px"><col><col class="list-state" style="width:115px"><col style="width:84px"></colgroup><thead><tr><th>Hora</th><th class="list-type">Tipo</th><th>Título / paciente</th><th class="list-state">Estado</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-range">No hay eventos visibles en este rango. Esto no confirma disponibilidad para reservar.</p>';
  }
  function updateNow() {
    calendar.querySelectorAll(".now-line").forEach((node) => node.remove());
    const today = todayInZone(state.timeZone), column = calendar.querySelector(`[data-column-date="${today}"]`);
    if (!column) return;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: state.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    const line = document.createElement("div"); line.className = "now-line"; line.style.top = `${(Number(parts.hour) + Number(parts.minute) / 60) * 64}px`; line.setAttribute("aria-label", `Hora actual ${parts.hour}:${parts.minute}`); column.append(line);
  }
  function renderStatus(items = visibleSegments()) {
    const invalid = items.some((item) => item.invalidTime);
    const message = explicitStatus || (invalid ? "Hay eventos cuyo horario requiere revisión. Se conservan visibles en Todo el día." : !items.length ? "No hay eventos visibles en este rango. La disponibilidad se valida al guardar." : "");
    $("estadoCalendario").textContent = message; $("estadoCalendario").classList.toggle("error", Boolean(statusOptions.error)); $("reintentarAgenda").hidden = !statusOptions.retry;
    calendar.querySelectorAll(".empty-range").forEach((node) => { node.hidden = Boolean(explicitStatus); });
  }
  function render({ resetScroll = false } = {}) {
    const started = performance.now(), range = visibleRange(), scroll = calendar.scrollTop;
    const active = document.activeElement, focusData = active?.dataset;
    const focusedKey = ["miniDate", "segment", "slot", "moreDate", "openDay"].find((key) => focusData?.[key]);
    const focusValue = focusedKey ? focusData[focusedKey] : null;
    const projectionKey = `${range.start}/${range.end}/${state.timeZone}`;
    if (events !== projectedSource || projectionKey !== projectedRange) {
      segments = projectEvents(events, range, state.timeZone); projectedSource = events; projectedRange = projectionKey;
    }
    const items = visibleSegments();
    $("vistaAgenda").value = state.view;
    $("tituloMes").textContent = state.view === "month" ? dateLabel(state.date, { month: "long", year: "numeric" }) : state.view === "day" ? dateLabel(state.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : `${dateLabel(range.start, { day: "numeric", month: "short" })} – ${dateLabel(range.end, { day: "numeric", month: "short", year: "numeric" })}`;
    renderMini(); renderStatus(items);
    calendar.innerHTML = state.view === "month" ? renderMonth(range, items) : state.view === "list" ? renderList(range, items) : renderTime(range, items);
    updateNow(); renderStatus(items);
    calendar.scrollTop = resetScroll ? ["week", "day"].includes(state.view) ? 8 * 64 : 0 : scroll;
    if (focusedKey && !active.isConnected) {
      const candidate = [...root.querySelectorAll("button")].find((node) => node.dataset[focusedKey] === focusValue);
      if (candidate) { if (candidate.tabIndex < 0) candidate.tabIndex = 0; candidate.focus({ preventScroll: true }); }
      else calendar.focus({ preventScroll: true });
    }
    // Aggregate timing only; no event IDs, patient information or dates in traces.
    console.debug("[AGENDA_TRACE] render", { view: state.view, segments: items.length, milliseconds: Math.round((performance.now() - started) * 10) / 10 });
  }
  function showDetail(key) {
    if (busy) return;
    const segment = segments.find((item) => item.key === key);
    if (!segment) return;
    const event = segment.event; state.selectedEvent = segment.id;
    $("tituloDetalle").textContent = eventTitle(event);
    const interval = eventDisplayInterval(event, state.timeZone);
    const when = !interval ? "Revisar horario: no se puede representar con seguridad en esta zona." : interval.allDay ? `${dateLabel(interval.startDate)}${interval.startDate !== interval.endDate ? ` – ${dateLabel(interval.endDate)}` : ""} · Todo el día` : `${dateLabel(interval.startDate)} · ${timeLabel(interval.startMinute)} – ${interval.startDate !== interval.endDate ? `${dateLabel(interval.endDate)} · ` : ""}${timeLabel(interval.endMinute)}`;
    const action = (name, label) => `<button data-action="${name}" data-id="${escapeHTML(segment.id)}">${label}</button>`;
    let actions = !terminal(event) || event.type !== "appointment" ? action("edit", "Editar") : "";
    if (event.type === "appointment") {
      if (event.patientId) actions += action("patient", "Ver paciente");
      if (event.status === "programada") {
        if (event.confirmation?.status !== "confirmed") actions += action("confirm", "Confirmar");
        actions += action("complete", "Marcar atendida") + action("cancel", "Cancelar cita");
      }
    } else actions += action("delete", "Eliminar evento");
    $("contenidoDetalle").innerHTML = `<dl class="detail-meta"><dt>Cuándo</dt><dd>${escapeHTML(when)}</dd><dt>Tipo</dt><dd>${escapeHTML(TYPES[event.type] || "Evento")}</dd><dt>Estado</dt><dd>${escapeHTML(event.status || "programada")}</dd><dt>Zona</dt><dd>${escapeHTML(state.timeZone)}${!event.timeZone ? " · Horario civil guardado" : ""}</dd>${event.ubicacion ? `<dt>Ubicación</dt><dd>${escapeHTML(event.ubicacion)}</dd>` : ""}</dl>${event.recurrence ? '<p class="agenda-notice">Evento recurrente. Las acciones afectan al documento original; no hay edición por ocurrencia.</p>' : ""}<div class="detail-actions">${actions}</div><p id="estadoDetalle" class="agenda-notice" role="status"></p>`;
    openDialog($("detalleAgenda"));
  }
  function showDay(date) {
    $("tituloDetalle").textContent = dateLabel(date, { weekday: "long", day: "numeric", month: "long" }); state.selectedEvent = null;
    $("contenidoDetalle").innerHTML = visibleSegments().filter((item) => item.date === date).map((segment) => `<button class="day-event-row" data-segment="${escapeHTML(segment.key)}"><time>${segment.allDay ? "Todo el día" : timeLabel(segment.startMinute)}</time><span class="type-dot group-${eventGroup(segment.event.type)}"></span><span>${escapeHTML(eventTitle(segment.event))}</span></button>`).join("") + `<div class="dialog-actions"><button data-open-day="${date}">Abrir vista Día</button><button data-create-date="${date}">Crear evento</button></div>`;
    openDialog($("detalleAgenda"));
  }
  function selectSettings(section = "availability") {
    document.querySelectorAll("[data-settings-section]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.settingsSection === section)));
    document.querySelectorAll("[data-settings-content]").forEach((node) => { node.hidden = node.dataset.settingsContent !== section; });
    onSettingsOpen?.(section);
  }
  function openSettings(section = "availability") {
    if (busy) return;
    state.settingsOpen = true; openDialog($("configuracionAgenda")); selectSettings(section);
  }
  listen($("alternarSidebar"), "click", () => sidebar());
  listen($("cerrarSidebar"), "click", () => { sidebar(false); $("alternarSidebar").focus(); });
  listen(mobile, "change", () => { root.classList.remove("sidebar-open"); $("cerrarSidebar").hidden = true; $("alternarSidebar").setAttribute("aria-expanded", String(!mobile.matches && !root.classList.contains("sidebar-collapsed"))); });
  listen($("mesActual"), "click", () => navigate(todayInZone(state.timeZone)));
  listen($("mesAnterior"), "click", () => navigate(stepDate(state.date, state.view, -1)));
  listen($("mesSiguiente"), "click", () => navigate(stepDate(state.date, state.view, 1)));
  listen($("vistaAgenda"), "change", (event) => navigate(state.date, event.target.value));
  listen($("miniAnterior"), "click", () => { miniMonth = addMonths(miniMonth, -1); renderMini(); });
  listen($("miniSiguiente"), "click", () => { miniMonth = addMonths(miniMonth, 1); renderMini(); });
  listen($("miniCalendario"), "click", (event) => { const button = event.target.closest("[data-mini-date]"); if (button) { navigate(button.dataset.miniDate); if (mobile.matches) { sidebar(false); $("alternarSidebar").focus(); } } });
  listen($("miniCalendario"), "keydown", (event) => {
    const button = event.target.closest("[data-mini-date]"), change = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!button || change === undefined) return;
    event.preventDefault(); const date = addDays(button.dataset.miniDate, change);
    if (!$(`miniCalendario`).querySelector(`[data-mini-date="${date}"]`)) { miniMonth = date; renderMini(); }
    $("miniCalendario").querySelectorAll("button").forEach((node) => { node.tabIndex = node.dataset.miniDate === date ? 0 : -1; });
    $("miniCalendario").querySelector(`[data-mini-date="${date}"]`)?.focus();
  });
  listen(root, "change", (event) => { const group = event.target.dataset.filterGroup; if (group) { event.target.checked ? state.filters.add(group) : state.filters.delete(group); render(); } });
  listen($("nuevoEvento"), "click", () => create());
  listen($("nuevaCita"), "click", () => create({ type: "appointment" }));
  listen($("reintentarAgenda"), "click", () => onRetry?.());
  listen($("abrirConfiguracionAgenda"), "click", () => openSettings());
  listen($("cerrarConfiguracionAgenda"), "click", () => { if (!busy) closeDialog($("configuracionAgenda")); });
  for (const id of ["cerrarEditorAgenda", "cancelarEdicion"]) listen($(id), "click", () => { if (!busy) closeDialog($("editorAgenda")); });
  listen($("cerrarDetalleAgenda"), "click", () => { if (!busy) closeDialog($("detalleAgenda")); });
  listen($("configuracionAgenda"), "click", (event) => { const button = event.target.closest("[data-settings-section]"); if (button) selectSettings(button.dataset.settingsSection); });
  function handleCalendarClick(event) {
    const target = event.target.closest("button"); if (!target || busy) return;
    if (target.dataset.segment) showDetail(target.dataset.segment);
    else if (target.dataset.moreDate) showDay(target.dataset.moreDate);
    else if (target.dataset.openDay) { closeDialog($("detalleAgenda")); navigate(target.dataset.openDay, "day"); }
    else if (target.dataset.createDate) { closeDialog($("detalleAgenda")); create({ date: target.dataset.createDate, time: target.dataset.time || "09:00", allDay: target.dataset.allDay === "true" }); }
    else if (target.dataset.action === "edit") { const id = target.dataset.id; closeDialog($("detalleAgenda")); onEdit?.(id); }
    else if (target.dataset.action) onAction?.(target.dataset.action, target.dataset.id, target);
  }
  listen(calendar, "click", handleCalendarClick); listen($("contenidoDetalle"), "click", handleCalendarClick);
  listen(calendar, "keydown", (event) => {
    const slot = event.target.closest("[data-slot]"); if (!slot) return;
    const [date, indexString] = slot.dataset.slot.split(":"), index = Number(indexString);
    let nextDate = date, next = index;
    if (event.key === "ArrowDown") next = Math.min(47, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "ArrowLeft") nextDate = addDays(date, -1);
    else if (event.key === "ArrowRight") nextDate = addDays(date, 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 47;
    else return;
    event.preventDefault(); const target = calendar.querySelector(`[data-slot="${nextDate}:${next}"]`);
    if (target) { slot.tabIndex = -1; target.tabIndex = 0; target.focus(); }
  });
  listen(document, "keydown", (event) => {
    if (!root.classList.contains("sidebar-open") || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") { sidebar(false); $("alternarSidebar").focus(); }
    if (event.key === "Tab") {
      const controls = [...$("agendaSidebar").querySelectorAll('button:not([tabindex="-1"]),input')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $("alternarSidebar").setAttribute("aria-expanded", String(!mobile.matches));
  render({ resetScroll: true });
  const timer = window.setInterval(updateNow, 60000);
  let resizeFrame = 0, priorWidth = calendar.clientWidth, priorHeight = calendar.clientHeight;
  const resizeObserver = new ResizeObserver(() => {
    const width = calendar.clientWidth, height = calendar.clientHeight;
    if (width === priorWidth && height === priorHeight) return;
    priorWidth = width; priorHeight = height;
    if (state.view === "month") { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => render()); }
  });
  resizeObserver.observe(calendar);
  return {
    state, get range() { return visibleRange(); },
    setEvents(value) { events = value; initialized = true; explicitStatus = ""; statusOptions = {}; render(); },
    setStatus(message, options = {}) { explicitStatus = message; statusOptions = options; renderStatus(); },
    setTimeZone(zone) {
      const nextToday = todayInZone(zone); if (zone === state.timeZone) return;
      state.timeZone = zone; if (!dateChosen) { state.date = nextToday; miniMonth = nextToday; }
      $("zonaAgenda").textContent = zone; render(); if (initialized) onRange?.(visibleRange());
    },
    openEditor() { state.editor = true; openDialog($("editorAgenda")); },
    closeEditor() { closeDialog($("editorAgenda")); }, closeDetail() { closeDialog($("detalleAgenda")); }, openSettings,
    setBusy(value) { busy = value; root.setAttribute("aria-busy", String(value)); $("guardarEvento").disabled = value; $("cerrarEditorAgenda").disabled = value; $("cancelarEdicion").disabled = value; $("cerrarDetalleAgenda").disabled = value; },
    destroy() { clearInterval(timer); cancelAnimationFrame(resizeFrame); resizeObserver.disconnect(); abort.abort(); }
  };
}
