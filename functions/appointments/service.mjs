import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { AppointmentError, normalizarEvento, validateCandidate, validateState, transitionAppointment, getAvailability as evaluateAvailability, administrativeAppointment, normalizeAvailabilitySettings, canonicalAppointmentInterval } from './domain.mjs';
const require = createRequire(import.meta.url);
const { isAdmin, isProfessional, assertAuthorizedProfessional } = require('../clinicalAnalytics/access');
const { accountDeletionTombstonePath } = require('../accountSecurity/accountDeletion');
const { Timestamp } = require('firebase-admin/firestore');
const fail = (code) => { throw new AppointmentError(code); };
const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const APPOINTMENT_FIELDS = new Set(['startDate', 'startTime', 'endDate', 'endTime', 'durationMinutes', 'patientId', 'patientName', 'patientPhone', 'patientEmail', 'description', 'notas', 'ubicacion', 'recordatorio', 'seguimiento', 'recurrence', 'googleCalendarEventId']);
const TIME_FIELDS = new Set(['startDate', 'startTime', 'endDate', 'endTime', 'durationMinutes']);
const LEGACY_CIVIL_POLICY = Object.freeze({ availabilityMode: 'legacy-civil', allowReschedule: true, allowCancellation: true, payment: { required: false, type: 'none', amount: null, currency: 'MXN' }, remindersEnabled: false });

/** Shared server domain. Firebase auth comes exclusively from the callable.
 * Channel authorization is injected by the internal adapter, never input data.
 */
export function createAppointmentService({ db, timestamp = () => Timestamp.now(), authorizeChannel = null, onChannelMutation = null }) {
  async function context(tx, auth, doctorUid, channel = null, action = null, appointmentId = null) {
    if (!safeId(doctorUid)) fail('permission-denied');
    if (channel) {
      if (!authorizeChannel || auth) fail('permission-denied');
      await authorizeChannel({ tx, channel, doctorUid, action, appointmentId });
    } else {
      if (!auth?.uid) fail('unauthenticated');
      if (!safeId(auth.uid) || auth.uid !== doctorUid) fail('permission-denied');
    }
    const profile = await tx.get(db.doc(`usuarios/${doctorUid}`));
    const deleting = await tx.get(db.doc(accountDeletionTombstonePath(doctorUid)));
    if (!profile.exists || deleting.exists || (!isProfessional(profile.data()) && !(auth && isAdmin(profile.data(), auth)))) fail('permission-denied');
    const controlRef = db.doc(`appointmentControls/${doctorUid}`);
    const control = await tx.get(controlRef);
    if (control.exists && control.data().enabled !== true) fail('transactional-mode-disabled');
    return { controlRef, control: control.exists ? control.data() : { enabled: true, revision: 0, policy: LEGACY_CIVIL_POLICY }, controlExists: control.exists, profile: profile.data() };
  }
  async function readEvents(tx, doctorUid, candidate, policy) {
    const agenda = db.collection(`usuarios/${doctorUid}/agenda`);
    let canonical = canonicalAppointmentInterval(candidate, policy);
    if (!canonical) {
      const snapshot = await tx.get(agenda.limit(2001));
      if (snapshot.size > 2000) fail('agenda-read-limit');
      return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
    }
    // Modern documents are queried by their canonical half-open interval. Legacy
    // documents are queried in a bounded 366-day civil lookback (the maximum
    // supported event interval) plus all recurrence sources, then deduplicated.
    let endDate = candidate.endDate || candidate.startDate;
    if (candidate.recurrence) {
      const horizon = new Date(`${candidate.startDate}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + Number(policy.maximumBookingAdvanceDays || 366));
      endDate = horizon.toISOString().slice(0, 10);
      // Read the complete validated series horizon, including non-recurrent
      // blockers that begin after the anchor. Expansion itself remains bounded.
      canonical = { ...canonical, endAt: canonical.endAt + (Date.parse(endDate) - Date.parse(candidate.startDate)) + 86400000 };
    }
    const start = new Date(`${candidate.startDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 366);
    const legacyStart = start.toISOString().slice(0, 10);
    const queries = [
      agenda.where('startAt', '<', Timestamp.fromMillis(canonical.endAt)).where('endAt', '>', Timestamp.fromMillis(canonical.startAt)).orderBy('startAt').orderBy('endAt'),
      agenda.where('startDate', '>=', legacyStart).where('startDate', '<=', endDate),
      agenda.where('fecha', '>=', legacyStart).where('fecha', '<=', endDate),
      agenda.where('recurrence', 'in', ['weekly', 'biweekly', 'monthly'])
    ];
    // Firestore transactions require reads to be issued in sequence on some
    // emulator/server combinations; parallel query streams can close a retry.
    const snapshots = [];
    for (const query of queries) snapshots.push(await tx.get(query));
    const documents = new Map();
    snapshots.flatMap((snapshot) => snapshot.docs).forEach((item) => documents.set(item.id, { ...item.data(), id: item.id }));
    if (documents.size > 2000) fail('agenda-read-limit');
    return [...documents.values()];
  }
  function validateInput(input, fields) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !fields.has(key))) fail('invalid-input');
    for (const [key, value] of Object.entries(input)) {
      if (key === 'durationMinutes') { if (!Number.isFinite(value)) fail('invalid-duration'); }
      else if (typeof value !== 'string' || value.length > 4000) fail('invalid-input');
    }
  }
  async function mutate(action, { auth, channel, doctorUid, appointmentId, requestId, input = {} }) {
    if (!safeId(requestId) || !safeId(doctorUid)) fail('invalid-request');
    if (action !== 'create' && !safeId(appointmentId)) fail('invalid-appointment-id');
    validateInput(input, action === 'create' || action === 'reschedule' ? APPOINTMENT_FIELDS : action === 'update' ? new Set([...APPOINTMENT_FIELDS].filter((field) => !TIME_FIELDS.has(field) && field !== 'recurrence')) : new Set());
    if (channel && (input.patientId || input.recurrence || !['create', 'confirm', 'reschedule', 'cancel'].includes(action))) fail('permission-denied');
    if (['create', 'update', 'reschedule'].includes(action) && input.patientId) {
      if (!safeId(input.patientId)) fail('invalid-patient');
      await assertAuthorizedProfessional({ auth }, db, input.patientId);
    }
    const id = action === 'create' ? db.collection(`usuarios/${doctorUid}/agenda`).doc().id : appointmentId;
    const ref = db.doc(`usuarios/${doctorUid}/agenda/${id}`);
    const receiptRef = db.doc(`appointmentControls/${doctorUid}/requests/${digest(`${channel ? 'whatsapp:' + channel.subject : auth?.uid}:${requestId}`)}`);
    const fingerprint = digest(`${action}:${appointmentId || ''}:${canonical(input)}`);
    const auditRef = db.collection('auditoria').doc();
    return db.runTransaction(async (tx) => {
      console.debug('[AGENDA_TRACE] callable→domain', { action, hasAppointment: Boolean(appointmentId) });
      const { controlRef, control, controlExists, profile } = await context(tx, auth, doctorUid, channel, action, appointmentId);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        if (receipt.data().fingerprint !== fingerprint) fail('idempotency-key-reused');
        return { appointmentId: receipt.data().appointmentId, result: 'applied', replayed: true };
      }
      const current = action === 'create' ? null : await tx.get(ref);
      if (current && !current.exists) fail('not-found');
      const previous = current ? normalizarEvento(current.data()) : null;
      if (previous && previous.type !== 'appointment') fail('unsupported-appointment');
      if (channel && previous?.recurrence) fail('unsupported-recurrence');
      if (channel && ['create', 'reschedule'].includes(action)) {
        normalizeAvailabilitySettings(control.policy, { requireBookable: true });
        const duration = input.durationMinutes ?? previous?.durationMinutes;
        if (!channel.professional.services.some(s => s.durationMinutes === duration)) fail('configuration-required');
        if (control.policy.payment?.required) fail('payment-not-configured');
        if (control.policy.externalAvailabilityRequired) fail('external-availability-unavailable');
      }
      const now = timestamp();
      let next;
      if (action === 'create') {
        if (!input.patientId && !input.patientName?.trim()) fail('patient-required');
        const defaults = control.policy?.payment || { required: false, type: 'none', amount: null, currency: 'MXN' };
        const payment = { required: defaults.required, type: defaults.type, amount: defaults.amount, currency: defaults.currency, status: defaults.required ? 'pending' : 'not_required', paidAt: null };
        next = { ...input, type: 'appointment', title: 'Cita médica', endDate: input.endDate || input.startDate, endTime: input.endTime || '', patientId: input.patientId || '', patientName: input.patientName || '', externalPatient: !input.patientId, allDay: false, recurrence: input.recurrence || null, status: 'programada', estado: 'programada', confirmation: { status: 'pending', confirmedAt: null, channel: null }, payment, reminders: { enabled: control.policy?.remindersEnabled === true, lastSentAt: null }, timeZone: control.policy?.timeZone || null, createdAt: now, fechaCreacion: now, creadoPor: channel ? 'whatsapp' : auth.uid };
      } else {
        if (action === 'reschedule' && control.policy?.allowReschedule !== true) fail('reschedule-disabled');
        if (action === 'cancel' && control.policy?.allowCancellation !== true) fail('cancellation-disabled');
        next = action === 'update'
          ? { ...previous, ...input, externalPatient: !Object.prototype.hasOwnProperty.call(input, 'patientId') ? previous.externalPatient : !input.patientId }
          : { ...previous, ...input, ...transitionAppointment(previous, action, now) };
      }
      if (channel && next.confirmation?.channel) next.confirmation.channel = 'whatsapp';
      next.fecha = next.startDate;
      next.hora = next.startTime;
      next.pacienteId = next.patientId;
      next.pacienteNombre = next.patientName;
      next.updatedAt = now;
      next.actualizadoPor = channel ? 'whatsapp' : auth.uid;
      validateState(next);
      if (action === 'create' || action === 'reschedule') {
        validateCandidate(next);
        const temporalCandidate = { ...next }; delete temporalCandidate.startAt; delete temporalCandidate.endAt;
        const canonical = canonicalAppointmentInterval(temporalCandidate, control.policy);
        if (canonical) {
          next.startAt = Timestamp.fromMillis(canonical.startAt);
          next.endAt = Timestamp.fromMillis(canonical.endAt);
          next.timeZone = canonical.timeZone;
          next.temporalModel = 'modern-instant';
        }
        const availability = evaluateAvailability({ candidate: next, events: await readEvents(tx, doctorUid, next, control.policy), policy: control.policy, complete: true, excludeId: action === 'reschedule' ? id : null, now: channel ? now.toMillis() : null });
        if (!availability.available) fail(availability.reason);
        if (channel && (next.startAt.toMillis() <= now.toMillis() || next.startAt.toMillis() > now.toMillis() + Math.min(control.policy.maximumBookingAdvanceDays || 90, 90) * 86400000)) fail('outside-booking-horizon');
      }
      // All readers of availability and all writers share this mutex document.
      // Direct SDK writes MUST be denied by the enabled gate in firestore.rules.
      if (controlExists) tx.update(controlRef, { revision: Number(control.revision || 0) + 1 });
      else tx.create(controlRef, { enabled: true, revision: 1, policy: LEGACY_CIVIL_POLICY, createdAt: now, activatedBy: auth.uid });
      tx.set(ref, next, { merge: true });
      if (channel && onChannelMutation) onChannelMutation({ tx, channel, doctorUid, appointmentId: id, action, next, previous, now });
      tx.create(receiptRef, { fingerprint, appointmentId: id, action, createdAt: now });
      tx.create(auditRef, { accion: `agenda_${action}`, modulo: 'Agenda', usuarioUid: channel ? doctorUid : auth.uid, usuarioRol: profile.rol || 'profesional', descripcion: 'Operación administrativa de agenda.', exito: true, fecha: now, detalles: { actor: channel ? 'channel' : isAdmin(profile, auth) ? 'admin' : 'doctor', canal: channel ? 'whatsapp' : 'web', accion: action, appointmentId: id, resultado: 'applied' } });
      console.debug('[AGENDA_TRACE] transaction→firestore', { action, outcome: 'applied' });
      return { appointmentId: id, result: 'applied', replayed: false };
    });
  }
  return Object.freeze({
    async getChannelSlots({ channel, doctorUid, date, durationMinutes, excludeId = null }) {
      const candidate = { type: 'appointment', startDate: date, endDate: date, startTime: '00:00', endTime: '23:59', durationMinutes };
      return db.runTransaction(async tx => {
        const { control } = await context(tx, null, doctorUid, channel, 'availability', excludeId);
        normalizeAvailabilitySettings(control.policy, { requireBookable: true });
        if (control.policy.payment?.required) fail('payment-not-configured');
        if (control.policy.externalAvailabilityRequired) fail('external-availability-unavailable');
        const events = await readEvents(tx, doctorUid, candidate, control.policy);
        const result = evaluateAvailability({ events, policy: control.policy, complete: true, rangeStart: date, rangeEnd: date, requestedDurationMinutes: durationMinutes, excludeId, now: timestamp().toMillis() });
        if (result.slots) result.slots = result.slots.filter(slot => {
          const interval = canonicalAppointmentInterval({ ...slot, type: 'appointment', endDate: slot.startDate }, control.policy);
          return interval.startAt > timestamp().toMillis() && interval.startAt <= timestamp().toMillis() + Math.min(control.policy.maximumBookingAdvanceDays || 90, 90) * 86400000;
        });
        return result;
      });
    },
    async getAvailabilitySettings({ auth, doctorUid }) {
      return db.runTransaction(async (tx) => {
        const { control } = await context(tx, auth, doctorUid);
        const legacy = control.policy?.availabilityMode === 'legacy-civil';
        return {
          availabilityMode: legacy ? 'legacy-civil' : 'configured',
          settings: legacy ? null : normalizeAvailabilitySettings(control.policy),
          bookingReady: !legacy && (() => { try { normalizeAvailabilitySettings(control.policy, { requireBookable: true }); return true; } catch { return false; } })()
        };
      });
    },
    async updateAvailabilitySettings({ auth, doctorUid, settings }) {
      return db.runTransaction(async (tx) => {
        const { controlRef, control, controlExists } = await context(tx, auth, doctorUid);
        const normalized = normalizeAvailabilitySettings(settings, { requireBookable: false });
        const now = timestamp();
        const policy = { ...(control.policy || LEGACY_CIVIL_POLICY), availabilityMode: 'configured', ...normalized };
        if (controlExists) tx.update(controlRef, { policy, revision: Number(control.revision || 0) + 1, updatedAt: now, updatedBy: auth.uid });
        else tx.create(controlRef, { enabled: true, revision: 1, policy, createdAt: now, activatedBy: auth.uid });
        return { availabilityMode: 'configured', settings: normalized, bookingReady: (() => { try { normalizeAvailabilitySettings(normalized, { requireBookable: true }); return true; } catch { return false; } })() };
      });
    },
    async getAppointment({ auth, doctorUid, appointmentId }) {
      if (!safeId(appointmentId)) fail('invalid-appointment-id');
      return db.runTransaction(async (tx) => {
        await context(tx, auth, doctorUid);
        const snapshot = await tx.get(db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`));
        if (!snapshot.exists) fail('not-found');
        if (normalizarEvento(snapshot.data()).type !== 'appointment') fail('unsupported-appointment');
        validateState(snapshot.data());
        return administrativeAppointment({ ...snapshot.data(), id: snapshot.id });
      });
    },
    async getAvailability({ auth, doctorUid, candidate }) {
      validateInput(candidate, TIME_FIELDS);
      return db.runTransaction(async (tx) => {
        const { control } = await context(tx, auth, doctorUid);
        const requested = { ...candidate, type: 'appointment' };
        return evaluateAvailability({ candidate: requested, events: await readEvents(tx, doctorUid, requested, control.policy), policy: control.policy, complete: true });
      });
    },
    createAppointment: (request) => mutate('create', request),
    updateAppointment: (request) => mutate('update', request),
    confirmAppointment: (request) => mutate('confirm', request),
    cancelAppointment: (request) => mutate('cancel', request),
    rescheduleAppointment: (request) => mutate('reschedule', request),
    completeAppointment: (request) => mutate('complete', request)
  });
}
