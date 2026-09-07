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

/** Internal service only. No callable/webhook is exported in this phase.
 * Enable only after the UI transport and deployed Rules use the same gate.
 * auth MUST come from the verified Firebase request, never request.data.
 */
export function createAppointmentService({ db, timestamp = () => Timestamp.now() }) {
  async function context(tx, auth, doctorUid) {
    if (!auth?.uid) fail('unauthenticated');
    if (!safeId(auth.uid) || !safeId(doctorUid) || auth.uid !== doctorUid) fail('permission-denied');
    const profile = await tx.get(db.doc(`usuarios/${auth.uid}`));
    const deleting = await tx.get(db.doc(accountDeletionTombstonePath(auth.uid)));
    if (!profile.exists || deleting.exists || (!isProfessional(profile.data()) && !isAdmin(profile.data(), auth))) fail('permission-denied');
    const controlRef = db.doc(`appointmentControls/${doctorUid}`);
    const control = await tx.get(controlRef);
    if (control.exists && control.data().enabled !== true) fail('transactional-mode-disabled');
    return { controlRef, control: control.exists ? control.data() : { enabled: true, revision: 0, policy: LEGACY_CIVIL_POLICY }, controlExists: control.exists, profile: profile.data() };
  }
  async function readEvents(tx, doctorUid, candidate, policy) {
    const agenda = db.collection(`usuarios/${doctorUid}/agenda`);
    const canonical = canonicalAppointmentInterval(candidate, policy);
    if (!canonical) {
      const snapshot = await tx.get(agenda.limit(2001));
      if (snapshot.size > 2000) fail('agenda-read-limit');
      return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
    }
    // Modern documents are queried by their canonical half-open interval. Legacy
    // documents are queried in a bounded 366-day civil lookback (the maximum
    // supported event interval) plus all recurrence sources, then deduplicated.
    const endDate = candidate.endDate || candidate.startDate;
    const start = new Date(`${candidate.startDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 366);
    const legacyStart = start.toISOString().slice(0, 10);
    const queries = [
      agenda.where('startAt', '<', Timestamp.fromMillis(canonical.endAt)).where('endAt', '>', Timestamp.fromMillis(canonical.startAt)),
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
  async function mutate(action, { auth, doctorUid, appointmentId, requestId, input = {} }) {
    if (!safeId(requestId) || !safeId(doctorUid)) fail('invalid-request');
    if (action !== 'create' && !safeId(appointmentId)) fail('invalid-appointment-id');
    validateInput(input, action === 'create' || action === 'reschedule' ? APPOINTMENT_FIELDS : action === 'update' ? new Set([...APPOINTMENT_FIELDS].filter((field) => !TIME_FIELDS.has(field) && field !== 'recurrence')) : new Set());
    if (['create', 'update', 'reschedule'].includes(action) && input.patientId) {
      if (!safeId(input.patientId)) fail('invalid-patient');
      await assertAuthorizedProfessional({ auth }, db, input.patientId);
    }
    const id = action === 'create' ? db.collection(`usuarios/${doctorUid}/agenda`).doc().id : appointmentId;
    const ref = db.doc(`usuarios/${doctorUid}/agenda/${id}`);
    const receiptRef = db.doc(`appointmentControls/${doctorUid}/requests/${digest(`${auth?.uid}:${requestId}`)}`);
    const fingerprint = digest(`${action}:${appointmentId || ''}:${canonical(input)}`);
    const auditRef = db.collection('auditoria').doc();
    return db.runTransaction(async (tx) => {
      console.debug('[AGENDA_TRACE] callable→domain', { action, hasAppointment: Boolean(appointmentId) });
      const { controlRef, control, controlExists, profile } = await context(tx, auth, doctorUid);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        if (receipt.data().fingerprint !== fingerprint) fail('idempotency-key-reused');
        return { appointmentId: receipt.data().appointmentId, result: 'applied', replayed: true };
      }
      const current = action === 'create' ? null : await tx.get(ref);
      if (current && !current.exists) fail('not-found');
      const previous = current ? normalizarEvento(current.data()) : null;
      if (previous && previous.type !== 'appointment') fail('unsupported-appointment');
      const now = timestamp();
      let next;
      if (action === 'create') {
        if (!input.patientId && !input.patientName?.trim()) fail('patient-required');
        const defaults = control.policy?.payment || { required: false, type: 'none', amount: null, currency: 'MXN' };
        const payment = { required: defaults.required, type: defaults.type, amount: defaults.amount, currency: defaults.currency, status: defaults.required ? 'pending' : 'not_required', paidAt: null };
        next = { ...input, type: 'appointment', title: 'Cita médica', endDate: input.endDate || input.startDate, endTime: input.endTime || '', patientId: input.patientId || '', patientName: input.patientName || '', externalPatient: !input.patientId, allDay: false, recurrence: input.recurrence || null, status: 'programada', estado: 'programada', confirmation: { status: 'pending', confirmedAt: null, channel: null }, payment, reminders: { enabled: control.policy?.remindersEnabled === true, lastSentAt: null }, timeZone: control.policy?.timeZone || null, createdAt: now, fechaCreacion: now, creadoPor: auth.uid };
      } else {
        if (action === 'reschedule' && control.policy?.allowReschedule !== true) fail('reschedule-disabled');
        if (action === 'cancel' && control.policy?.allowCancellation !== true) fail('cancellation-disabled');
        next = action === 'update'
          ? { ...previous, ...input, externalPatient: !Object.prototype.hasOwnProperty.call(input, 'patientId') ? previous.externalPatient : !input.patientId }
          : { ...previous, ...input, ...transitionAppointment(previous, action, now) };
      }
      next.fecha = next.startDate;
      next.hora = next.startTime;
      next.pacienteId = next.patientId;
      next.pacienteNombre = next.patientName;
      next.updatedAt = now;
      next.actualizadoPor = auth.uid;
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
        const availability = evaluateAvailability({ candidate: next, events: await readEvents(tx, doctorUid, next, control.policy), policy: control.policy, complete: true, excludeId: action === 'reschedule' ? id : null });
        if (!availability.available) fail(availability.reason);
      }
      // All readers of availability and all writers share this mutex document.
      // Direct SDK writes MUST be denied by the enabled gate in firestore.rules.
      if (controlExists) tx.update(controlRef, { revision: Number(control.revision || 0) + 1 });
      else tx.create(controlRef, { enabled: true, revision: 1, policy: LEGACY_CIVIL_POLICY, createdAt: now, activatedBy: auth.uid });
      tx.set(ref, next, { merge: true });
      tx.create(receiptRef, { fingerprint, appointmentId: id, action, createdAt: now });
      tx.create(auditRef, { accion: `agenda_${action}`, modulo: 'Agenda', usuarioUid: auth.uid, usuarioRol: profile.rol || 'profesional', descripcion: 'Operación administrativa de agenda.', exito: true, fecha: now, detalles: { actor: isAdmin(profile, auth) ? 'admin' : 'doctor', canal: 'web', accion: action, appointmentId: id, resultado: 'applied' } });
      console.debug('[AGENDA_TRACE] transaction→firestore', { action, outcome: 'applied' });
      return { appointmentId: id, result: 'applied', replayed: false };
    });
  }
  return Object.freeze({
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
