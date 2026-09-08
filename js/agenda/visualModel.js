import { getOccurrences } from "../services/agendaRecurrence.js";
import { normalizarEvento, intervaloEvento, canonicalAppointmentInterval, temporalRepresentation } from "../../functions/appointments/domain.mjs";

// These dates are civil calendar labels. UTC is used only for label arithmetic;
// it never assigns an instant or a timezone to a legacy event.
const DAY = 86400000;
const MINUTE = 60000;
export const DEFAULT_TIME_ZONE = "America/Mexico_City";
export const TYPES = Object.freeze({ appointment: "Cita médica", event: "Evento", meeting: "Reunión", academic: "Actividad académica", shift: "Guardia", block: "Bloqueo / No disponible", vacation: "Vacaciones", other: "Otro" });
export const FILTER_GROUPS = Object.freeze({ appointment: Object.freeze(["appointment"]), event: Object.freeze(["event", "meeting", "academic", "other"]), shift: Object.freeze(["shift"]), block: Object.freeze(["block"]), vacation: Object.freeze(["vacation"]) });
export const eventGroup = (type) => Object.keys(FILTER_GROUPS).find((group) => FILTER_GROUPS[group].includes(type)) || "event";

function civilMillis(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date || "")) throw new RangeError("invalid-civil-date");
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new RangeError("invalid-civil-date");
  return value;
}
const civilLabel = (value) => new Date(value).toISOString().slice(0, 10);
const zoneFormatters = new Map();
function formatter(timeZone) {
  const zone = timeZone || DEFAULT_TIME_ZONE;
  if (!zoneFormatters.has(zone)) {
    // Cache a few explicit zones, rather than an unbounded collection of input.
    if (zoneFormatters.size >= 8) zoneFormatters.clear();
    zoneFormatters.set(zone, new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
  }
  return zoneFormatters.get(zone);
}
function zonedParts(value, timeZone) {
  return Object.fromEntries(formatter(timeZone).formatToParts(value).map(({ type, value: part }) => [type, part]));
}
function zonedCivilMillis(value, timeZone) {
  const part = zonedParts(value, timeZone);
  return Date.parse(`${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}Z`);
}
export function todayInZone(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  const part = zonedParts(now, timeZone);
  return `${part.year}-${part.month}-${part.day}`;
}
export const addDays = (date, days) => civilLabel(civilMillis(date) + Number(days) * DAY);
export function addMonths(date, months) {
  const value = new Date(civilMillis(date));
  const anchor = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + Number(months));
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(anchor, lastDay));
  return civilLabel(value.getTime());
}
export function rangeFor(date, view = "week") {
  const day = new Date(civilMillis(date));
  let start = date, end = date;
  if (view === "week") {
    start = addDays(date, -((day.getUTCDay() + 6) % 7));
    end = addDays(start, 6);
  } else if (view === "month") {
    const first = `${date.slice(0, 7)}-01`;
    const next = addMonths(first, 1);
    const last = addDays(next, -1);
    start = addDays(first, -((new Date(civilMillis(first)).getUTCDay() + 6) % 7));
    end = addDays(last, 6 - ((new Date(civilMillis(last)).getUTCDay() + 6) % 7));
  } else if (view === "list") end = addDays(date, 29);
  else if (view !== "day") throw new RangeError("invalid-calendar-view");
  const days = [];
  for (let current = start; current <= end; current = addDays(current, 1)) days.push(current);
  return { start, end, days };
}
export function stepDate(date, view, delta) {
  if (view === "month") return addMonths(date, delta);
  if (!["day", "week", "list"].includes(view)) throw new RangeError("invalid-calendar-view");
  return addDays(date, delta * (view === "week" ? 7 : view === "list" ? 30 : 1));
}
export function dateLabel(date, options = { day: "numeric", month: "long", year: "numeric" }) {
  return new Intl.DateTimeFormat("es-MX", { ...options, timeZone: "UTC" }).format(civilMillis(date));
}

function timestampMillis(value) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  return NaN;
}
function projectedInterval(event, timeZone) {
  if (temporalRepresentation(event) !== "modern-instant") return intervaloEvento(event, { civil: true });
  let startAt = timestampMillis(event.startAt), endAt = timestampMillis(event.endAt);
  if (event.isVirtualOccurrence) {
    // The shared expander intentionally keeps the source fields. Its inherited
    // absolute timestamps still belong to the anchor, not to this occurrence.
    // Reuse the domain conversion in the source IANA zone, only in this view.
    if (!event.timeZone) throw new RangeError("recurrence-timezone-required");
    const candidate = { ...event, recurrence: null, fecha: event.startDate, hora: event.startTime };
    delete candidate.startAt;
    delete candidate.endAt;
    const interval = canonicalAppointmentInterval(candidate, { timeZone: event.timeZone });
    if (!interval) throw new RangeError("recurrence-timezone-required");
    ({ startAt, endAt } = interval);
  }
  return [zonedCivilMillis(startAt, timeZone), zonedCivilMillis(endAt, timeZone)];
}
function invalidSegment(event, range, reason) {
  if (!event.startDate || event.startDate < range.start || event.startDate > range.end) return [];
  return [{ key: `${event.id}@@${event.startDate}`, id: event.parentEventId || event.id, occurrenceId: event.id, date: event.startDate, startMinute: 0, endMinute: 0, allDay: true, continuesBefore: false, continuesAfter: false, event, invalidTime: true, timeWarning: reason || "invalid-event-interval" }];
}

/** Full interval for a contextual detail, before clipping into daily segments.
 * null means its clock representation needs review; do not invent a duration.
 */
export function eventDisplayInterval(raw, timeZone = DEFAULT_TIME_ZONE) {
  const event = normalizarEvento(raw);
  let interval;
  try { interval = projectedInterval(event, timeZone); }
  catch { return null; }
  if (!interval || !Number.isFinite(interval[0]) || !Number.isFinite(interval[1]) || interval[1] <= interval[0]) return null;
  const [start, end] = interval;
  const allDay = Boolean(event.allDay || (temporalRepresentation(event) !== "modern-instant" && !event.startTime));
  const startDate = civilLabel(start), endDate = civilLabel(allDay ? end - 1 : end);
  return {
    startDate, endDate,
    startMinute: allDay ? 0 : (start - civilMillis(startDate)) / MINUTE,
    endMinute: allDay ? 1440 : (end - civilMillis(endDate)) / MINUTE,
    allDay
  };
}

/** A pure view projection. The caller keeps the original documents for commands. */
export function projectEvents(events, range, timeZone = DEFAULT_TIME_ZONE) {
  civilMillis(range.start);
  civilMillis(range.end);
  formatter(timeZone); // A broken display zone must not quietly produce an empty agenda.
  const segments = [];
  for (const raw of events) {
    const source = normalizarEvento(raw);
    const sourceInterval = intervaloEvento(source, { civil: true });
    // Include overnight anchors and long intervals that started before the
    // requested range. The existing expander still owns all recurrence maths.
    const durationDays = sourceInterval ? Math.max(0, Math.ceil((sourceInterval[1] - sourceInterval[0]) / DAY)) : 0;
    const paddedStart = addDays(range.start, -(Math.min(durationDays, 366) + 2));
    const occurrences = getOccurrences(source, paddedStart, addDays(range.end, 2));
    for (const event of occurrences) {
      let interval;
      try { interval = projectedInterval(event, timeZone); }
      catch (error) { segments.push(...invalidSegment(event, range, error?.code || error?.message)); continue; }
      if (!interval || !Number.isFinite(interval[0]) || !Number.isFinite(interval[1]) || interval[1] <= interval[0]) {
        segments.push(...invalidSegment(event, range));
        continue;
      }
      const [start, end] = interval;
      const firstDay = start > civilMillis(range.start) ? civilLabel(start) : range.start;
      const finalDay = end < civilMillis(addDays(range.end, 1)) ? civilLabel(end - 1) : range.end;
      for (let date = firstDay; date <= finalDay; date = addDays(date, 1)) {
        const dayStart = civilMillis(date), dayEnd = dayStart + DAY;
        if (start >= dayEnd || end <= dayStart) continue;
        segments.push({
          key: `${event.id}@@${date}`, id: event.parentEventId || event.id, occurrenceId: event.id, date,
          startMinute: (Math.max(start, dayStart) - dayStart) / MINUTE,
          endMinute: (Math.min(end, dayEnd) - dayStart) / MINUTE,
          allDay: Boolean(event.allDay || (temporalRepresentation(event) !== "modern-instant" && !event.startTime)),
          continuesBefore: start < dayStart, continuesAfter: end > dayEnd,
          event, invalidTime: false
        });
      }
    }
  }
  return segments.sort((a, b) => a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.key.localeCompare(b.key));
}

/** Half-open interval colouring, independently for each connected overlap group. */
export function arrangeOverlaps(segments) {
  const result = segments.map((segment) => ({ ...segment, column: 0, columns: 1 }));
  const dates = new Map();
  result.forEach((segment, index) => {
    if (segment.allDay || segment.invalidTime) return;
    if (!dates.has(segment.date)) dates.set(segment.date, []);
    dates.get(segment.date).push(index);
  });
  for (const indexes of dates.values()) {
    indexes.sort((a, b) => result[a].startMinute - result[b].startMinute || result[a].endMinute - result[b].endMinute || result[a].key.localeCompare(result[b].key));
    let group = [], columns = [], groupEnd = -Infinity;
    const finish = () => {
      for (const index of group) result[index].columns = columns.length;
      group = []; columns = []; groupEnd = -Infinity;
    };
    for (const index of indexes) {
      const segment = result[index];
      if (group.length && segment.startMinute >= groupEnd) finish();
      let column = columns.findIndex((end) => end <= segment.startMinute);
      if (column < 0) column = columns.length;
      columns[column] = segment.endMinute;
      segment.column = column;
      group.push(index);
      groupEnd = Math.max(groupEnd, segment.endMinute);
    }
    if (group.length) finish();
  }
  return result;
}
