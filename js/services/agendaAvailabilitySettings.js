import { executeAppointmentCommand, appointmentErrorCode } from "./appointmentCommandService.js";

const DIAS_JORNADA = [["monday", "Lunes"], ["tuesday", "Martes"], ["wednesday", "Miércoles"], ["thursday", "Jueves"], ["friday", "Viernes"], ["saturday", "Sábado"], ["sunday", "Domingo"]];

function estado(root, texto) { const el = root.querySelector("[data-availability-status]"); if (el) el.textContent = texto; }
function intervaloHtml(interval = { start: "09:00", end: "17:00" }) { return `<div class="working-interval"><input type="time" data-start value="${interval.start}"><span>–</span><input type="time" data-end value="${interval.end}"><button type="button" data-remove-interval aria-label="Eliminar intervalo">×</button></div>`; }
function agregarRemover(row) { row.querySelector("[data-remove-interval]").addEventListener("click", () => row.remove()); }
function renderizar(root, schedule = {}) {
  const days = root.querySelector("[data-weekly-schedule]"); if (!days) return;
  days.innerHTML = DIAS_JORNADA.map(([key, label]) => `<section class="schedule-day" data-day="${key}"><strong>${label}</strong><div class="working-intervals">${(schedule[key] || []).map(intervaloHtml).join("")}</div><button class="boton-secundario" type="button" data-add-interval>Agregar horario</button></section>`).join("");
  days.querySelectorAll("[data-remove-interval]").forEach((button) => agregarRemover(button.closest(".working-interval")));
  days.querySelectorAll("[data-add-interval]").forEach((button) => button.addEventListener("click", () => { const container = button.closest(".schedule-day").querySelector(".working-intervals"); container.insertAdjacentHTML("beforeend", intervaloHtml()); agregarRemover(container.lastElementChild); }));
}
function leerJornada(root) {
  return Object.fromEntries([...root.querySelectorAll(".schedule-day")].map((day) => [day.dataset.day, [...day.querySelectorAll(".working-interval")].map((row) => ({ start: row.querySelector("[data-start]").value, end: row.querySelector("[data-end]").value }))]));
}

/** UI controller only: persistence and validation remain in manageAppointment. */
export async function initializeAgendaAvailabilitySettings(root) {
  if (!root || root.dataset.availabilityReady === "true") return;
  root.dataset.availabilityReady = "true";
  const form = root.querySelector("form");
  try {
    const result = await executeAppointmentCommand({ action: "availabilitySettings" });
    const settings = result.settings || {};
    root.querySelector("[data-timezone]").value = settings.timeZone || "";
    root.querySelector("[data-booking-enabled]").checked = Boolean(settings.bookingEnabled);
    renderizar(root, settings.weeklySchedule || {});
    estado(root, result.bookingReady ? "Disponible para reservas externas." : "Configura zona horaria y jornada antes de habilitar reservas externas.");
  } catch (error) {
    renderizar(root);
    estado(root, "Aún no hay una configuración de disponibilidad.");
    console.warn("[AGENDA][DISPONIBILIDAD] No se pudo cargar.", { code: appointmentErrorCode(error) });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = root.querySelector("[data-save-availability]");
    const settings = { timeZone: root.querySelector("[data-timezone]").value.trim(), bookingEnabled: root.querySelector("[data-booking-enabled]").checked, weeklySchedule: leerJornada(root), slotDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumBookingNoticeMinutes: null, maximumBookingAdvanceDays: null, dateExceptions: [] };
    button.disabled = true; estado(root, "Guardando disponibilidad…");
    try { const result = await executeAppointmentCommand({ action: "updateAvailabilitySettings", settings }); estado(root, result.bookingReady ? "Disponibilidad guardada y lista para reservas externas." : "Disponibilidad guardada. Falta una jornada válida para reservas externas."); }
    catch (error) { const code = appointmentErrorCode(error); estado(root, code === "invalid-timezone" ? "La zona horaria debe ser un identificador IANA válido." : code.includes("working") || code.includes("schedule") ? "Revisa horarios: inicio antes de fin y sin solapamientos." : "No se pudo guardar la disponibilidad."); console.warn("[AGENDA][DISPONIBILIDAD] Guardado rechazado.", { code }); }
    finally { button.disabled = false; }
  });
}
