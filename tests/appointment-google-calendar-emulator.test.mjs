import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAppointmentService } from '../functions/appointments/service.mjs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required; production prohibited');
const projectId = 'demo-cognicion-agenda';
const app = initializeApp({ projectId }, 'appointment-google-tests');
const db = getFirestore(app);
const doctorUid = 'doctor_google';
const auth = { uid: doctorUid, token: {} };
const policy = { timeZone: 'America/Mexico_City', bookingEnabled: true, weeklyHours: { 3: [{ start: '09:00', end: '12:00' }] }, slotDurationMinutes: 60, allowReschedule: true, allowCancellation: true };
let env;

test.before(async () => { env = await initializeTestEnvironment({ projectId }); });
test.beforeEach(async () => {
  await env.clearFirestore();
  await db.doc(`usuarios/${doctorUid}`).set({ rol: 'medico' });
  await db.doc(`appointmentControls/${doctorUid}`).set({ enabled: true, revision: 0, policy });
});
test.after(async () => { await env.cleanup(); await deleteApp(app); });

test('FreeBusy removes an occupied slot and preserves half-open adjacency', async () => {
  const provider = {
    isRequired: async () => true,
    getBusy: async () => [{ start: '2026-09-09T15:00:00.000Z', end: '2026-09-09T16:00:00.000Z', source: 'google' }]
  };
  const service = createAppointmentService({ db, externalAvailabilityProvider: provider });
  const result = await service.getAvailability({ auth, doctorUid, candidate: { startDate: '2026-09-09', startTime: '09:00', durationMinutes: 60 } });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'external-busy');
  const adjacent = await service.getAvailability({ auth, doctorUid, candidate: { startDate: '2026-09-09', startTime: '10:00', durationMinutes: 60 } });
  assert.equal(adjacent.available, true);
});

test('Google failure fails closed and does not persist a new appointment', async () => {
  const provider = { isRequired: async () => true, getBusy: async () => { const error = Error('provider-details-not-exposed'); error.code = 'google-temporarily-unavailable'; throw error; } };
  const service = createAppointmentService({ db, externalAvailabilityProvider: provider });
  await assert.rejects(() => service.createAppointment({ auth, doctorUid, requestId: 'google-failure', input: { startDate: '2026-09-09', startTime: '10:00', durationMinutes: 60, patientName: 'Synthetic' } }), { code: 'external-availability-unavailable' });
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).empty, true);
});

test('disabled Google integration does not change Cognición availability', async () => {
  let queried = false;
  const provider = { isRequired: async () => false, getBusy: async () => { queried = true; return []; } };
  const service = createAppointmentService({ db, externalAvailabilityProvider: provider });
  const result = await service.getAvailability({ auth, doctorUid, candidate: { startDate: '2026-09-09', startTime: '10:00', durationMinutes: 60 } });
  assert.equal(result.available, true);
  assert.equal(queried, false);
});

test('an unauthorized professional is rejected before querying Google', async () => {
  let queried = false;
  const provider = { isRequired: async () => { queried = true; return true; }, getBusy: async () => [] };
  const service = createAppointmentService({ db, externalAvailabilityProvider: provider });
  await assert.rejects(() => service.getAvailability({ auth, doctorUid: 'professional_b', candidate: { startDate: '2026-09-09', startTime: '10:00', durationMinutes: 60 } }), { code: 'permission-denied' });
  assert.equal(queried, false);
});
