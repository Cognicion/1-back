import { executeAppointmentCommand, appointmentErrorCode } from "./appointmentCommandService.js";

const DIAS_JORNADA = [["monday", "Lunes"], ["tuesday", "Martes"], ["wednesday", "Miércoles"], ["thursday", "Jueves"], ["friday", "Viernes"], ["saturday", "Sábado"], ["sunday", "Domingo"]];
const controllers = new WeakMap();
const escapeAttribute = (value) => String(value ?? "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const clone = (value) => JSON.parse(JSON.stringify(value));

function estado(root, texto) {
  const el = root.querySelector("[data-availability-status]");
  if (el) el.textContent = texto;
}

function intervaloHtml(interval = { start: "09:00", end: "17:00" }, day = "") {
  // The domain accepts 24:00 as an exclusive end. A native time input silently
  // empties that valid value, so the end uses an explicit HH:MM text field.
  return `<div class="working-interval"><input type="time" data-start required aria-label="Inicio del intervalo, ${escapeAttribute(day)}" value="${escapeAttribute(interval.start)}"><span aria-hidden="true">–</span><input type="text" inputmode="numeric" data-end required maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" title="Hora de fin: HH:MM. Para el final del día, 24:00." aria-label="Fin del intervalo, ${escapeAttribute(day)}" value="${escapeAttribute(interval.end)}"><button type="button" data-remove-interval aria-label="Eliminar intervalo de ${escapeAttribute(day)}" title="Eliminar intervalo">×</button></div>`;
}

function actualizarDia(day) {
  const closed = day.querySelector("[data-closed-day]");
  if (closed) closed.hidden = Boolean(day.querySelector(".working-interval"));
}

function renderizar(root, schedule = {}) {
  const days = root.querySelector("[data-weekly-schedule]");
  if (!days) return;
  days.innerHTML = DIAS_JORNADA.map(([key, label]) => {
    const intervals = Array.isArray(schedule[key]) ? schedule[key] : [];
    return `<div class="schedule-day" data-day="${key}" data-day-label="${label}"><strong>${label}</strong><div class="working-intervals"><span data-closed-day${intervals.length ? " hidden" : ""}>Sin intervalos</span>${intervals.map((interval) => intervaloHtml(interval, label)).join("")}</div><button class="boton-secundario" type="button" data-add-interval aria-label="Agregar intervalo a ${label}" title="Agregar intervalo">+</button></div>`;
  }).join("");
}

function leerJornada(root) {
  return Object.fromEntries([...root.querySelectorAll(".schedule-day")].map((day) => [day.dataset.day, [...day.querySelectorAll(".working-interval")].map((row) => ({
    start: row.querySelector("[data-start]").value,
    end: row.querySelector("[data-end]").value.trim()
  }))]));
}

/** UI only: validation and persistence remain in manageAppointment. */
export async function initializeAgendaAvailabilitySettings(root, { initialResult, onSaved, onLoaded, signal } = {}) {
  if (!root || signal?.aborted) return undefined;
  const existing = controllers.get(root);
  if (existing) { await existing.ready; return existing.cleanup; }
  const form = root.querySelector("form");
  if (!form) return undefined;

  let originalSettings = {};
  let loaded = false;
  let busy = false;
  let disposed = false;
  const saveButton = root.querySelector("[data-save-availability]");
  const reloadButton = root.querySelector("[data-reload-availability]");

  function actualizarControles() {
    if (disposed) return;
    form.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = control === reloadButton ? busy : busy || !loaded;
    });
    if (saveButton) saveButton.disabled = busy || !loaded;
    if (reloadButton) reloadButton.disabled = busy;
    root.setAttribute("aria-busy", String(busy));
  }

  function aplicarResultado(result, saved = false) {
    originalSettings = clone(result.settings || {});
    root.querySelector("[data-timezone]").value = originalSettings.timeZone || "";
    root.querySelector("[data-booking-enabled]").checked = Boolean(originalSettings.bookingEnabled);
    renderizar(root, originalSettings.weeklySchedule || {});
    loaded = true;
    root.dataset.availabilityState = "ready";
    estado(root, saved
      ? result.bookingReady ? "Disponibilidad guardada y lista para reservas externas." : "Disponibilidad guardada. Las reservas externas aún no están habilitadas o falta configurar la jornada."
      : result.settings == null ? "Aún no hay una configuración de disponibilidad. Los días sin intervalos permanecerán cerrados."
        : result.bookingReady ? "Disponible para reservas externas." : "Configura zona horaria y jornada antes de habilitar reservas externas.");
  }

  async function cargar(useInitial = false) {
    if (busy || disposed) return;
    busy = true;
    loaded = false;
    root.dataset.availabilityState = "loading";
    estado(root, "Cargando disponibilidad…");
    actualizarControles();
    try {
      const result = useInitial ? await initialResult : await executeAppointmentCommand({ action: "availabilitySettings" });
      if (disposed) return;
      if (!result || !Object.prototype.hasOwnProperty.call(result, "settings")) throw new Error("invalid-settings-response");
      aplicarResultado(result);
      try { await onLoaded?.(result); }
      catch { console.warn("[AGENDA][DISPONIBILIDAD] No se pudo actualizar la vista tras cargar."); }
    } catch (error) {
      if (disposed) return;
      root.dataset.availabilityState = "error";
      const code = appointmentErrorCode(error);
      estado(root, /permission-denied|unauthenticated/u.test(code)
        ? "No autorizado para consultar esta configuración. Comprueba tu sesión y vuelve a cargar."
        : "No se pudo cargar la disponibilidad. Vuelve a cargar antes de guardar; no se ha reemplazado la configuración.");
      console.warn("[AGENDA][DISPONIBILIDAD] No se pudo cargar.", { code });
    } finally {
      busy = false;
      actualizarControles();
    }
  }

  async function guardar(event) {
    event.preventDefault();
    if (busy || !loaded || disposed) return;
    if (form.reportValidity && !form.reportValidity()) return;
    // Keep every unexposed setting (exceptions, buffers, slot length and notice
    // limits). This screen edits only these three fields of the loaded policy.
    const settings = {
      ...clone(originalSettings),
      timeZone: root.querySelector("[data-timezone]").value.trim(),
      bookingEnabled: root.querySelector("[data-booking-enabled]").checked,
      weeklySchedule: leerJornada(root)
    };
    busy = true;
    estado(root, "Guardando disponibilidad…");
    actualizarControles();
    try {
      const result = await executeAppointmentCommand({ action: "updateAvailabilitySettings", settings });
      if (disposed) return;
      aplicarResultado(result, true);
      // The command has committed before notifying presentation. A rendering
      // callback error must never be reported as an unsuccessful domain write.
      try { await onSaved?.(result); }
      catch { console.warn("[AGENDA][DISPONIBILIDAD] No se pudo actualizar la vista tras guardar."); }
    } catch (error) {
      if (disposed) return;
      const code = appointmentErrorCode(error);
      estado(root, code === "invalid-timezone" ? "La zona horaria debe ser un identificador IANA válido."
        : code.includes("working") || code.includes("schedule") ? "Revisa horarios: inicio antes de fin y sin solapamientos."
          : "No se pudo guardar la disponibilidad. Se conservan tus cambios para reintentar.");
      console.warn("[AGENDA][DISPONIBILIDAD] Guardado rechazado.", { code });
    } finally {
      busy = false;
      actualizarControles();
    }
  }

  function intervalClick(event) {
    if (busy || !loaded || disposed) return;
    const button = event.target.closest?.("[data-add-interval], [data-remove-interval]");
    if (!button || !root.contains(button)) return;
    const day = button.closest(".schedule-day");
    if (!day) return;
    if (button.hasAttribute("data-add-interval")) {
      const container = day.querySelector(".working-intervals");
      container.insertAdjacentHTML("beforeend", intervaloHtml(undefined, day.dataset.dayLabel));
      container.lastElementChild.querySelector("[data-start]").focus();
    } else {
      const row = button.closest(".working-interval");
      row?.remove();
      day.querySelector("[data-add-interval]").focus();
    }
    actualizarDia(day);
  }

  const reload = () => cargar();
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    form.removeEventListener("submit", guardar);
    root.removeEventListener("click", intervalClick);
    reloadButton?.removeEventListener("click", reload);
    signal?.removeEventListener("abort", cleanup);
    controllers.delete(root);
    delete root.dataset.availabilityReady;
  };
  const controller = { cleanup, ready: null };
  controllers.set(root, controller);
  root.dataset.availabilityReady = "true";
  form.addEventListener("submit", guardar);
  root.addEventListener("click", intervalClick);
  reloadButton?.addEventListener("click", reload);
  signal?.addEventListener("abort", cleanup, { once: true });
  controller.ready = cargar(initialResult !== undefined);
  await controller.ready;
  return cleanup;
}
