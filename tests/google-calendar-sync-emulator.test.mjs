import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GOOGLE_CALENDAR_CLIENT_ID = 'synthetic-client';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'synthetic-secret';
process.env.GOOGLE_CALENDAR_KMS_KEY_NAME = 'projects/demo/locations/global/keyRings/test/cryptoKeys/test';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { createGoogleCalendarRuntime, appointmentSourceVersion } = require('../functions/googleCalendar/runtime');

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required; production prohibited');
const projectId = 'demo-cognicion-agenda';
const app = initializeApp({ projectId }, 'google-calendar-sync-tests');
const db = getFirestore(app);
const uid = 'doctor_google_sync';
const appointmentId = 'appointment_qa';
const scopes = ['https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/calendar.events'];
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let env, clock, events, inserts, mode, runtime;
const now = () => clock;

function appointment(start = '2026-09-09T15:00:00.000Z', status = 'programada') {
  const startMs = Date.parse(start);
  return { type: 'appointment', status, startAt: Timestamp.fromMillis(startMs), endAt: Timestamp.fromMillis(startMs + 3600000), startDate: start.slice(0, 10), startTime: '09:00', durationMinutes: 60, timeZone: 'America/Mexico_City', patientName: 'Synthetic private name', patientPhone: '000', notas: 'private' };
}
async function jobFor(data, suffix = '') {
  const sourceVersion = appointmentSourceVersion(data);
  const id = `${sourceVersion.slice(0, 48)}${suffix}`;
  await db.doc(`googleCalendarSyncJobs/${id}`).set({ professionalUid: uid, appointmentId, sourceVersion, state: 'pending', attemptCount: 0, nextAttemptAt: Timestamp.fromMillis(clock), createdAt: Timestamp.fromMillis(clock), expiresAt: Timestamp.fromMillis(clock + 86400000) });
  return id;
}

test.before(async () => { env = await initializeTestEnvironment({ projectId }); });
test.beforeEach(async () => {
  await env.clearFirestore();
  clock = Date.parse('2026-09-08T20:00:00.000Z'); events = new Map(); inserts = 0; mode = 'ok';
  await db.doc(`usuarios/${uid}`).set({ rol: 'medico' });
  await db.doc(`googleCalendarConnections/${uid}`).set({ encryptedRefreshToken: Buffer.from('ciphertext').toString('base64'), connectionStatus: 'connected', selectedCalendarId: 'primary', scopes, integration: { enabled: true, useForAvailability: true, mirrorAppointments: true } });
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('cloudkms.googleapis.com')) return response(200, { plaintext: Buffer.from('refresh').toString('base64') });
    if (url.includes('oauth2.googleapis.com')) return mode === 'invalid_grant' ? response(400, { error: 'invalid_grant' }) : response(200, { access_token: 'calendar-access', expires_in: 3600 });
    if (url.endsWith('/freeBusy')) return response(200, { calendars: { primary: { busy: [] } } });
    const eventMatch = url.match(/\/events\/([^/?]+)$/);
    if (mode === 'rate-limit') return response(429, { error: { errors: [{ reason: 'rateLimitExceeded' }] } });
    if (options.method === 'POST' && url.endsWith('/events')) {
      const body = JSON.parse(options.body); inserts += 1;
      if (events.has(body.id)) return response(409, { error: { status: 'ALREADY_EXISTS' } });
      events.set(body.id, body); return response(200, body);
    }
    if (options.method === 'PATCH' && eventMatch) {
      const id = decodeURIComponent(eventMatch[1]);
      if (!events.has(id)) return response(404, { error: { status: 'NOT_FOUND' } });
      const body = JSON.parse(options.body); events.set(id, body); return response(200, body);
    }
    if (options.method === 'DELETE' && eventMatch) {
      const id = decodeURIComponent(eventMatch[1]);
      if (!events.has(id)) return response(404, { error: { status: 'NOT_FOUND' } });
      events.delete(id); return response(204);
    }
    throw Error(`unexpected-request:${options.method}:${url}`);
  };
  runtime = createGoogleCalendarRuntime({ db, credential: { getAccessToken: async () => ({ access_token: 'kms-access' }) }, fetchImpl, now });
});
test.after(async () => { await env.cleanup(); await deleteApp(app); });

test('each professional changes only their own integration preferences', async () => {
  const result = await runtime.exports.updateGoogleCalendarSettings.run({ auth: { uid, token: {} }, data: { useForAvailability: true, mirrorAppointments: false } });
  assert.deepEqual(result.integration, { enabled: true, useForAvailability: true, mirrorAppointments: false });
  const saved = (await db.doc(`googleCalendarConnections/${uid}`).get()).data();
  assert.deepEqual(saved.integration, result.integration);
  await assert.rejects(() => runtime.exports.updateGoogleCalendarSettings.run({ auth: null, data: { useForAvailability: true, mirrorAppointments: true } }), error => error.code === 'unauthenticated');
});

test('create and duplicate jobs produce one minimal Google event', async () => {
  const data = appointment();
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  const after = await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).get();
  await runtime.test.enqueueAppointmentChange({ params: { doctorUid: uid, appointmentId }, data: { after, before: { exists: false } } });
  const createdJobs = await db.collection('googleCalendarSyncJobs').get();
  assert.equal(createdJobs.size, 1);
  await runtime.test.processJob(createdJobs.docs[0].id);
  await runtime.test.processJob(await jobFor(data, 'duplicate'));
  assert.equal(events.size, 1);
  assert.equal(inserts, 1);
  const event = [...events.values()][0];
  assert.equal(event.summary, 'Consulta');
  const serialized = JSON.stringify(event);
  for (const forbidden of ['Synthetic private name', 'patientPhone', 'notas']) assert.equal(serialized.includes(forbidden), false);
  const link = (await db.collection('googleCalendarAppointmentLinks').limit(1).get()).docs[0].data();
  assert.equal(link.syncState, 'synced');
});

test('reschedule updates the same event and cancellation removes it', async () => {
  let data = appointment();
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  await runtime.test.processJob(await jobFor(data));
  const originalId = [...events.keys()][0];
  data = appointment('2026-09-09T17:00:00.000Z');
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  await runtime.test.processJob(await jobFor(data));
  assert.deepEqual([...events.keys()], [originalId]);
  assert.equal(events.get(originalId).start.dateTime, '2026-09-09T17:00:00.000Z');
  data = appointment('2026-09-09T17:00:00.000Z', 'cancelada');
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  await runtime.test.processJob(await jobFor(data));
  assert.equal(events.size, 0);
  const link = (await db.collection('googleCalendarAppointmentLinks').limit(1).get()).docs[0].data();
  assert.equal(link.syncState, 'cancelled');
});

test('event-not-found is recreated once for a still active appointment', async () => {
  let data = appointment();
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  await runtime.test.processJob(await jobFor(data));
  events.clear();
  data = appointment('2026-09-09T18:00:00.000Z');
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  await runtime.test.processJob(await jobFor(data));
  assert.equal(events.size, 1);
});

test('429 leaves a bounded retry job and does not report synchronization', async () => {
  const data = appointment();
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  mode = 'rate-limit';
  const id = await jobFor(data);
  await runtime.test.processJob(id);
  const saved = (await db.doc(`googleCalendarSyncJobs/${id}`).get()).data();
  assert.equal(saved.state, 'retry');
  assert.equal(saved.attemptCount, 1);
  assert.ok(saved.nextAttemptAt.toMillis() > clock);
  assert.equal((await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).get()).exists, true);
  assert.equal((await db.collection('googleCalendarAppointmentLinks').limit(1).get()).docs[0].data().syncState, 'retry');
});

test('invalid_grant marks both connection and job for reauthorization', async () => {
  const data = appointment();
  await db.doc(`usuarios/${uid}/agenda/${appointmentId}`).set(data);
  mode = 'invalid_grant';
  const id = await jobFor(data);
  await runtime.test.processJob(id);
  assert.equal((await db.doc(`googleCalendarConnections/${uid}`).get()).data().connectionStatus, 'reauthorization_required');
  assert.equal((await db.doc(`googleCalendarSyncJobs/${id}`).get()).data().state, 'reauthorization_required');
});
