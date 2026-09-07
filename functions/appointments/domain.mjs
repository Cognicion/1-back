import { getOccurrences, parsearFechaAgenda } from './recurrence.mjs';

export class AppointmentError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new AppointmentError(code); };
const TYPES = { appointment: 'Cita médica', event: 'Evento', meeting: 'Reunión', academic: 'Actividad académica', shift: 'Guardia', block: 'Bloqueo / No disponible', vacation: 'Vacaciones', other: 'Otro' };
export function normalizarEvento(raw) {
  const antiguo = !raw.type && (raw.pacienteId !== undefined || raw.tipo !== undefined);
  const type = raw.type || (antiguo ? 'appointment' : 'event');
  const fecha = raw.startDate || raw.fecha || '';
  return { ...raw, type, title: raw.title || (type === 'appointment' ? raw.tipo || 'Cita médica' : raw.nombre || TYPES[type] || 'Evento'), startDate: fecha, endDate: raw.endDate || fecha, startTime: raw.startTime || raw.hora || '', endTime: raw.endTime || '', patientId: raw.patientId ?? raw.pacienteId ?? '', patientName: raw.patientName ?? raw.pacienteNombre ?? '', externalPatient: Boolean(raw.externalPatient || (raw.pacienteNombre && !raw.pacienteId)), status: raw.status || raw.estado || 'programada', allDay: Boolean(raw.allDay), syncStatus: raw.syncStatus || 'not_configured' };
}

// Civil minutes in one explicitly selected agenda timezone, not UTC instants.
// No dependence on the browser/server operating-system timezone.
const civilDay = (value) => parsearFechaAgenda(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
const minute = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 86400000;

export function isIanaTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}

function normalizeIntervals(intervals) {
  if (!Array.isArray(intervals)) fail('invalid-weekly-schedule');
  const normalized = intervals.map(({ start, end } = {}) => ({ start, end }));
  for (const interval of normalized) {
    if (!validTime(interval.start) || !(validTime(interval.end) || interval.end === '24:00') || minute(interval.start) >= minute(interval.end)) fail('invalid-working-interval');
  }
  normalized.sort((a, b) => minute(a.start) - minute(b.start));
  for (let index = 1; index < normalized.length; index += 1) {
    if (minute(normalized[index].start) < minute(normalized[index - 1].end)) fail('overlapping-working-interval');
  }
  return normalized;
}

/** Normalizes the persisted schedule without using the browser timezone. */
export function normalizeAvailabilitySettings(raw = {}, { requireBookable = false } = {}) {
  const source = raw.availabilitySettings || raw;
  const timeZone = source.timeZone || raw.timeZone || null;
  const weeklySource = source.weeklySchedule || raw.weeklySchedule || source.weeklyHours || raw.weeklyHours || {};
  const weeklySchedule = {};
  for (let index = 0; index < 7; index += 1) {
    const key = WEEKDAYS[index];
    weeklySchedule[key] = normalizeIntervals(weeklySource[key] ?? weeklySource[String(index)] ?? []);
  }
  const dateExceptions = Array.isArray(source.dateExceptions) ? source.dateExceptions.map((exception) => {
    if (!parsearFechaAgenda(exception?.date)) fail('invalid-date-exception');
    return { date: exception.date, intervals: normalizeIntervals(exception.intervals || []) };
  }) : [];
  if (new Set(dateExceptions.map(({ date }) => date)).size !== dateExceptions.length) fail('duplicate-date-exception');
  const settings = {
    timeZone,
    weeklySchedule,
    dateExceptions,
    slotDurationMinutes: Number(source.slotDurationMinutes || 60),
    bookingEnabled: Boolean(source.bookingEnabled),
    bufferBeforeMinutes: Number(source.bufferBeforeMinutes || 0),
    bufferAfterMinutes: Number(source.bufferAfterMinutes || 0),
    minimumBookingNoticeMinutes: source.minimumBookingNoticeMinutes == null ? null : Number(source.minimumBookingNoticeMinutes),
    maximumBookingAdvanceDays: source.maximumBookingAdvanceDays == null ? null : Number(source.maximumBookingAdvanceDays)
  };
  if (settings.timeZone !== null && !isIanaTimeZone(settings.timeZone)) fail('invalid-timezone');
  for (const key of ['slotDurationMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes']) if (!Number.isInteger(settings[key]) || settings[key] < 0 || (key === 'slotDurationMinutes' && settings[key] <= 0)) fail('invalid-availability-setting');
  for (const key of ['minimumBookingNoticeMinutes', 'maximumBookingAdvanceDays']) if (settings[key] !== null && (!Number.isInteger(settings[key]) || settings[key] < 0)) fail('invalid-availability-setting');
  if (requireBookable && (!settings.bookingEnabled || !settings.timeZone || !Object.values(settings.weeklySchedule).some((periods) => periods.length))) fail('configuration-required');
  return settings;
}
export function intervaloEvento(raw, { civil = false } = {}) {
  const e = normalizarEvento(raw);
  const clock = (date, time) => Date.parse(`${date}T${time}${civil ? 'Z' : ''}`);
  const day = parsearFechaAgenda(e.startDate) ? clock(e.startDate, '00:00:00') : NaN;
  const lastDay = civilDay(e.endDate);
  if (!Number.isFinite(day) || !Number.isFinite(lastDay)) return null;
  if (e.startTime && !validTime(e.startTime) || e.endTime && !validTime(e.endTime)) return null;
  const start = clock(e.startDate, e.allDay || !e.startTime ? '00:00:00' : `${e.startTime}:00`);
  let end;
  // Preserve historical UI semantics, including the last second of all-day events.
  if (e.allDay || !e.startTime || (!e.endTime && !e.durationMinutes)) end = clock(e.endDate, '23:59:59');
  else if (e.endTime) end = clock(e.endDate, `${e.endTime}:00`);
  else end = start + Number(e.durationMinutes) * 60000;
  return Number.isFinite(end) ? [start, Math.max(start, end)] : null;
}
export const overlaps = (a, b) => Boolean(a && b && a[0] < b[1] && a[1] > b[0]);
const civilInterval = (raw) => intervaloEvento(raw, { civil: true });

function uniqueZonedInstant(civil, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (instant) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = civil + hours * 3600000;
    offsets.add(wall(probe) - probe);
  }
  const matches = [...offsets].map((offset) => civil - offset).filter((instant) => wall(instant) === civil);
  return matches.length === 1 ? matches[0] : null;
}

function timestampMillis(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && Number.isFinite(value.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return NaN;
}

/** Converts a civil appointment to reproducible absolute instants in its IANA zone. */
export function canonicalAppointmentInterval(raw, policy = {}) {
  const event = validateCandidate(raw);
  if (policy?.availabilityMode === 'legacy-civil' || !policy?.timeZone) return null;
  const settings = normalizeAvailabilitySettings(policy);
  if (event.timeZone && event.timeZone !== settings.timeZone) fail('timezone-mismatch');
  const civil = civilInterval(event);
  const startAt = uniqueZonedInstant(civil[0], settings.timeZone);
  const endAt = uniqueZonedInstant(civil[1], settings.timeZone);
  if (startAt === null || endAt === null || endAt <= startAt) fail('ambiguous-timezone-interval');
  if (raw.startAt !== undefined && timestampMillis(raw.startAt) !== startAt || raw.endAt !== undefined && timestampMillis(raw.endAt) !== endAt) fail('inconsistent-canonical-instant');
  return { startAt, endAt, timeZone: settings.timeZone };
}

export function temporalRepresentation(raw) {
  const startAt = timestampMillis(raw?.startAt), endAt = timestampMillis(raw?.endAt);
  return Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt ? 'modern-instant' : 'legacy-civil';
}

/** Minimal, PHI-free payload for a future calendar provider. */
export function calendarProjection(raw) {
  if (temporalRepresentation(raw) !== 'modern-instant') fail('canonical-instant-required');
  return { appointmentId: raw.id || raw.appointmentId || null, startAt: raw.startAt, endAt: raw.endAt, timeZone: raw.timeZone, title: 'Consulta' };
}

export function appointmentState(raw) {
  const e = normalizarEvento(raw);
  return { status: e.status, confirmation: e.confirmation || { status: 'pending', confirmedAt: null, channel: null }, payment: e.payment || { required: false, type: 'none', status: 'not_required', amount: null, currency: 'MXN', paidAt: null }, reminders: e.reminders || { enabled: false, lastSentAt: null } };
}
export function validateState(raw) {
  const s = appointmentState(raw), p = s.payment, c = s.confirmation;
  if (!['programada', 'atendida', 'cancelada'].includes(s.status)) fail('invalid-status');
  if (raw.estado && raw.status && raw.estado !== raw.status) fail('inconsistent-status');
  if (!['pending', 'confirmed', 'declined', 'expired'].includes(c.status)) fail('invalid-confirmation');
  if (!['not_required', 'pending', 'paid', 'failed', 'refunded'].includes(p.status) || typeof p.required !== 'boolean' || p.currency !== 'MXN') fail('invalid-payment');
  if (!p.required && (p.type !== 'none' || p.status !== 'not_required' || p.amount !== null || p.paidAt !== null)) fail('inconsistent-payment');
  if (p.required && (!['deposit', 'full'].includes(p.type) || !Number.isFinite(p.amount) || p.amount <= 0 || p.status === 'not_required')) fail('inconsistent-payment');
  if ((p.status === 'paid') !== Boolean(p.paidAt) && p.status !== 'refunded') fail('inconsistent-payment-timestamp');
  if ((c.status === 'confirmed') !== Boolean(c.confirmedAt)) fail('inconsistent-confirmation-timestamp');
  if (![null, 'doctor', 'web', 'whatsapp'].includes(c.channel)) fail('invalid-channel');
  if (p.required && c.status === 'confirmed' && p.status !== 'paid') fail('payment-not-verified');
  if (s.status === 'cancelada' && c.status === 'confirmed') fail('inconsistent-cancellation');
  if (typeof s.reminders.enabled !== 'boolean') fail('invalid-reminders');
  return s;
}
export function transitionAppointment(raw, action, now) {
  const s = validateState(raw);
  if (s.status !== 'programada') fail('terminal-appointment');
  if (action === 'confirm') {
    if (s.payment.required && s.payment.status !== 'paid') fail('payment-not-verified');
    if (!['pending', 'confirmed'].includes(s.confirmation.status)) fail('invalid-transition');
    s.confirmation = { status: 'confirmed', confirmedAt: s.confirmation.confirmedAt || now, channel: 'doctor' };
  } else if (action === 'cancel') {
    s.status = 'cancelada';
    s.confirmation = { status: 'declined', confirmedAt: null, channel: 'doctor' };
  } else if (action === 'reschedule') {
    s.confirmation = { status: 'pending', confirmedAt: null, channel: null };
  } else if (action === 'complete') {
    s.status = 'atendida';
  } else fail('invalid-action');
  validateState(s);
  return { ...s, estado: s.status };
}

export function validateCandidate(raw) {
  const e = normalizarEvento(raw), interval = civilInterval(e);
  if (!interval || interval[1] <= interval[0] || e.endDate < e.startDate) fail('invalid-interval');
  if (interval[1] - interval[0] > 366 * 86400000) fail('interval-too-long');
  if (e.type !== 'appointment') fail('unsupported-event-type');
  if (e.recurrence && !['weekly', 'biweekly', 'monthly'].includes(e.recurrence)) fail('invalid-recurrence');
  if (e.allDay || !validTime(e.startTime)) fail('appointment-time-required');
  if (!e.endTime && (!Number.isFinite(e.durationMinutes) || e.durationMinutes <= 0)) fail('invalid-duration');
  if (e.endDate !== e.startDate && !e.endTime) fail('ambiguous-multiday-duration');
  if (raw.fecha && raw.startDate && raw.fecha !== raw.startDate || raw.hora && raw.startTime && raw.hora !== raw.startTime) fail('inconsistent-date-alias');
  return e;
}

function dateForCivilInstant(value) { return new Date(value).toISOString().slice(0, 10); }
function scheduleForDate(settings, date) {
  const exception = settings.dateExceptions.find((item) => item.date === date);
  if (exception) return exception.intervals;
  return settings.weeklySchedule[WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]] || [];
}
function candidateBusyInterval(item, policy) {
  const interval = civilInterval(item);
  if (!interval) return null;
  if (policy?.availabilityMode !== 'legacy-civil') {
    const start = uniqueZonedInstant(interval[0], policy.timeZone);
    const end = uniqueZonedInstant(interval[1], policy.timeZone);
    if (start === null || end === null) return null;
  }
  return interval;
}
function expandedRelevantEvents(events, rangeStart, rangeEnd, excludeId) {
  const result = [];
  for (const item of events.map(normalizarEvento)) {
    if (item.id === excludeId || item.status === 'cancelada' || !(['appointment', 'block', 'vacation'].includes(item.type) || item.blocksAvailability === true)) continue;
    if (item.recurrence && !['weekly', 'biweekly', 'monthly'].includes(item.recurrence)) fail('unsupported-recurrence');
    if (item.recurrence) result.push(...getOccurrences(item, rangeStart, rangeEnd));
    else result.push(item);
  }
  return result;
}

function satisfiesWorkingHours(e, interval, settings) {
  for (let day = civilDay(e.startDate); day < interval[1]; day += DAY_MS) {
    const date = dateForCivilInstant(day);
    const periods = scheduleForDate(settings, date);
    const from = Math.max(day, interval[0]), to = Math.min(day + DAY_MS, interval[1]);
    if (!periods.some(({ start, end }) => day + minute(start) * 60000 <= from && day + minute(end) * 60000 >= to)) return false;
  }
  return true;
}

function normalizedExternalBusy(intervals = []) {
  if (!Array.isArray(intervals)) fail('invalid-external-busy');
  return intervals.map(({ start, end, source = 'external' } = {}) => {
    const startMs = start instanceof Date ? start.getTime() : typeof start === 'number' ? start : Date.parse(start);
    const endMs = end instanceof Date ? end.getTime() : typeof end === 'number' ? end : Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || typeof source !== 'string') fail('invalid-external-busy');
    return { start: startMs, end: endMs, source };
  });
}

// Checks a requested interval. With rangeStart/rangeEnd it additionally returns
// calculated slots; slots are never persisted as appointments.
export function getAvailability({ candidate, events = [], policy = {}, complete = false, excludeId = null, externalBusyIntervals = [], rangeStart = null, rangeEnd = null, requestedDurationMinutes = null, now = null }) {
  if (!candidate && rangeStart && rangeEnd) return getAvailabilitySlots({ events, policy, complete, excludeId, externalBusyIntervals, rangeStart, rangeEnd, requestedDurationMinutes, now });
  const e = validateCandidate(candidate);
  // Legacy Agenda persisted civil date/time fields without a configured IANA zone
  // or working-hours policy. This explicit compatibility mode preserves those
  // semantics while refusing to pretend that an unconfigured schedule exists.
  if (e.recurrence) {
    // A new unbounded series cannot be proven conflict-free forever. Validate a
    // finite booking horizon; every later request is evaluated in its own window.
    const horizonDays = Number(policy?.maximumBookingAdvanceDays || 366);
    const horizonDate = new Date(`${e.startDate}T00:00:00Z`);
    horizonDate.setUTCDate(horizonDate.getUTCDate() + horizonDays);
    const horizon = horizonDate.toISOString().slice(0, 10);
    const occurrences = getOccurrences({ ...e, id: '__candidate__' }, e.startDate, horizon);
    for (const occurrence of occurrences) {
      const result = getAvailability({
        candidate: { ...occurrence, recurrence: null, fecha: occurrence.startDate, hora: occurrence.startTime },
        events,
        policy,
        complete,
        excludeId
      });
      if (!result.available) return result;
    }
    return { available: true, reason: 'available-recurring', recurrenceValidationHorizon: 500 };
  }
  if (!complete) return { available: false, reason: 'incomplete-data' };
  const legacyCivil = policy?.availabilityMode === 'legacy-civil';
  if (!legacyCivil && !policy?.timeZone) return { available: false, reason: 'configuration-required' };
  const settings = legacyCivil ? null : normalizeAvailabilitySettings(policy, { requireBookable: false });
  if (!legacyCivil) {
    try { new Intl.DateTimeFormat('en', { timeZone: policy.timeZone }); } catch { fail('invalid-timezone'); }
    if (e.timeZone && e.timeZone !== policy.timeZone) fail('timezone-mismatch');
  }
  const interval = civilInterval(e);
  let canonical = null;
  if (!legacyCivil) {
    const zonedStart = uniqueZonedInstant(interval[0], policy.timeZone);
    const zonedEnd = uniqueZonedInstant(interval[1], policy.timeZone);
    if (zonedStart === null || zonedEnd === null || zonedEnd - zonedStart !== interval[1] - interval[0]) return { available: false, reason: 'ambiguous-timezone-interval' };
    canonical = canonicalAppointmentInterval(e, policy);
  }
  const duration = (interval[1] - interval[0]) / 60000;
  if (policy.minDurationMinutes && duration < policy.minDurationMinutes || policy.maxDurationMinutes && duration > policy.maxDurationMinutes) return { available: false, reason: 'duration-policy' };
  // Every civil day segment must fit a configured working interval.
  if (!legacyCivil && !satisfiesWorkingHours(e, interval, settings)) return { available: false, reason: 'outside-working-hours' };
  if (!legacyCivil && settings.minimumBookingNoticeMinutes !== null && now !== null) {
    const zonedStart = uniqueZonedInstant(interval[0], settings.timeZone);
    if (zonedStart < Number(now) + settings.minimumBookingNoticeMinutes * 60000) return { available: false, reason: 'minimum-booking-notice' };
  }
  if (events.map(normalizarEvento).some((item) => item.recurrence && !['weekly', 'biweekly', 'monthly'].includes(item.recurrence))) return { available: false, reason: 'unsupported-recurrence' };
  const relevant = expandedRelevantEvents(events, e.startDate, dateForCivilInstant(interval[1]), excludeId);
  for (const item of relevant) {
    const existingInterval = candidateBusyInterval(item, policy);
    if (!existingInterval || existingInterval[1] <= existingInterval[0] || item.endDate < item.startDate) return { available: false, reason: 'invalid-existing-data' };
    if (!legacyCivil && item.timeZone && item.timeZone !== policy.timeZone) return { available: false, reason: 'timezone-mismatch' };
    const storedStart = timestampMillis(item.startAt), storedEnd = timestampMillis(item.endAt);
    const comparison = Number.isFinite(storedStart) && Number.isFinite(storedEnd) && canonical ? [storedStart, storedEnd] : existingInterval;
    const requested = Number.isFinite(storedStart) && Number.isFinite(storedEnd) && canonical ? [canonical.startAt, canonical.endAt] : interval;
    if (overlaps(comparison, requested)) return { available: false, reason: 'conflict' };
  }
  for (const busy of normalizedExternalBusy(externalBusyIntervals)) {
    const zonedStart = legacyCivil ? interval[0] : uniqueZonedInstant(interval[0], settings.timeZone);
    const zonedEnd = legacyCivil ? interval[1] : uniqueZonedInstant(interval[1], settings.timeZone);
    if (zonedStart < busy.end && zonedEnd > busy.start) return { available: false, reason: 'external-busy', source: busy.source };
  }
  return { available: true, reason: 'available', timeZone: legacyCivil ? null : policy.timeZone, availabilityMode: legacyCivil ? 'legacy-civil' : 'configured' };
}

function getAvailabilitySlots({ events, policy, complete, excludeId, externalBusyIntervals, rangeStart, rangeEnd, requestedDurationMinutes, now }) {
  const settings = normalizeAvailabilitySettings(policy, { requireBookable: true });
  if (!complete) return { available: false, reason: 'incomplete-data', slots: [] };
  if (!parsearFechaAgenda(rangeStart) || !parsearFechaAgenda(rangeEnd) || rangeEnd < rangeStart) fail('invalid-availability-range');
  const durationMinutes = Number(requestedDurationMinutes || settings.slotDurationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) fail('invalid-duration');
  // Build the busy index once per requested window. Calling getAvailability for
  // every candidate with the complete event list turns an eight-slot day into
  // eight complete scans of the agenda.
  const occupied = expandedRelevantEvents(events, rangeStart, rangeEnd, excludeId).map((event) => candidateBusyInterval(event, { ...policy, ...settings })).filter(Boolean);
  const external = normalizedExternalBusy(externalBusyIntervals);
  const slots = [];
  for (let day = civilDay(rangeStart); day <= civilDay(rangeEnd); day += DAY_MS) {
    const date = dateForCivilInstant(day);
    for (const period of scheduleForDate(settings, date)) {
      for (let start = minute(period.start); start + durationMinutes <= minute(period.end); start += settings.slotDurationMinutes) {
        const candidate = { type: 'appointment', startDate: date, endDate: date, startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, durationMinutes, timeZone: settings.timeZone };
        const result = getAvailability({ candidate, events: [], policy: { ...policy, ...settings }, complete, excludeId, now });
        const civil = civilInterval(candidate);
        const zonedStart = uniqueZonedInstant(civil[0], settings.timeZone);
        const zonedEnd = uniqueZonedInstant(civil[1], settings.timeZone);
        const busy = occupied.some((interval) => overlaps(interval, civil)) || external.some((interval) => zonedStart < interval.end && zonedEnd > interval.start);
        if (result.available && !busy) slots.push({ startDate: date, startTime: candidate.startTime, durationMinutes, timeZone: settings.timeZone });
      }
    }
  }
  return { available: true, reason: 'available', slots, timeZone: settings.timeZone };
}

// Administrative projection: no patient names, contact data, descriptions or clinical notes.
export function administrativeAppointment(raw) {
  const e = normalizarEvento(raw);
  const { status, confirmation: c, payment: p, reminders: r } = appointmentState(e);
  return { id: e.id, startDate: e.startDate, startTime: e.startTime, endDate: e.endDate, endTime: e.endTime, durationMinutes: e.durationMinutes ?? null, timeZone: e.timeZone ?? null, status,
    confirmation: { status: c.status, confirmedAt: c.confirmedAt, channel: c.channel },
    payment: { required: p.required, type: p.type, status: p.status, amount: p.amount, currency: p.currency, paidAt: p.paidAt },
    reminders: { enabled: r.enabled, lastSentAt: r.lastSentAt } };
}
