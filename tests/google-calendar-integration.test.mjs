import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

process.env.GOOGLE_CALENDAR_CLIENT_ID = 'synthetic-client';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'synthetic-secret';
process.env.GOOGLE_CALENDAR_KMS_KEY_NAME = 'projects/demo/locations/global/keyRings/test/cryptoKeys/test';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {
  createCalendarClient,
  googleEventProjection,
  appointmentSourceVersion,
  safeGoogleError
} = require('../functions/googleCalendar/runtime');

const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const connection = {
  encryptedRefreshToken: Buffer.from('ciphertext').toString('base64'),
  connectionStatus: 'connected',
  selectedCalendarId: 'primary',
  scopes: ['https://www.googleapis.com/auth/calendar.freebusy', 'https://www.googleapis.com/auth/calendar.events']
};

test('FreeBusy returns only normalized busy intervals and uses the selected professional calendar', async () => {
  const calls = [];
  const client = createCalendarClient({
    db: { doc: () => ({ set: async () => {} }) },
    credential: { getAccessToken: async () => ({ access_token: 'kms-access' }) },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: String(options.body || '') });
      if (url.includes('cloudkms.googleapis.com')) return response(200, { plaintext: Buffer.from('refresh').toString('base64') });
      if (url.includes('oauth2.googleapis.com')) return response(200, { access_token: 'calendar-access', expires_in: 3600 });
      if (url.endsWith('/freeBusy')) return response(200, { calendars: { primary: { busy: [{ start: '2026-09-09T15:00:00Z', end: '2026-09-09T16:00:00Z' }] } } });
      throw Error('unexpected-request');
    }
  });
  const busy = await client.freeBusy({ uid: 'professional_a', connectionData: connection, calendarId: 'primary', timeMin: '2026-09-09T00:00:00Z', timeMax: '2026-09-10T00:00:00Z', timeZone: 'America/Mexico_City' });
  assert.deepEqual(busy, [{ start: '2026-09-09T15:00:00Z', end: '2026-09-09T16:00:00Z', source: 'google' }]);
  const requestBody = JSON.parse(calls.find(call => call.url.endsWith('/freeBusy')).body);
  assert.deepEqual(requestBody.items, [{ id: 'primary' }]);
  assert.equal(requestBody.timeZone, 'America/Mexico_City');
});

test('FreeBusy retries one temporary provider failure and then succeeds', async () => {
  let freeBusyCalls = 0;
  const client = createCalendarClient({
    db: { doc: () => ({ set: async () => {} }) },
    credential: { getAccessToken: async () => ({ access_token: 'kms-access' }) },
    fetchImpl: async url => {
      if (url.includes('cloudkms.googleapis.com')) return response(200, { plaintext: Buffer.from('refresh').toString('base64') });
      if (url.includes('oauth2.googleapis.com')) return response(200, { access_token: 'calendar-access', expires_in: 3600 });
      if (url.endsWith('/freeBusy')) { freeBusyCalls += 1; return freeBusyCalls === 1 ? response(503, {}) : response(200, { calendars: { primary: { busy: [] } } }); }
      throw Error('unexpected-request');
    }
  });
  assert.deepEqual(await client.freeBusy({ uid: 'professional_a', connectionData: connection, calendarId: 'primary', timeMin: '2026-09-09T00:00:00Z', timeMax: '2026-09-10T00:00:00Z', timeZone: 'America/Mexico_City' }), []);
  assert.equal(freeBusyCalls, 2);
});

test('Google event projection contains no PHI and preserves timezone and recurrence', () => {
  const event = googleEventProjection({
    type: 'appointment', status: 'programada', startAt: Date.parse('2026-09-09T10:00:00Z'), endAt: Date.parse('2026-09-09T11:00:00Z'),
    timeZone: 'America/Mexico_City', recurrence: 'monthly', startDate: '2026-01-31', patientName: 'Synthetic private name', patientPhone: '000', notas: 'private', description: 'private'
  }, 'appointment_qa', 'abcdef012345');
  assert.equal(event.summary, 'Consulta');
  assert.equal(event.start.timeZone, 'America/Mexico_City');
  assert.deepEqual(event.recurrence, ['RRULE:FREQ=MONTHLY;BYMONTHDAY=31', 'RRULE:FREQ=YEARLY;BYMONTH=2,4,6,9,11;BYMONTHDAY=-1']);
  assert.equal(event.extendedProperties.private.cognicionAppointmentId, 'appointment_qa');
  const serialized = JSON.stringify(event);
  for (const forbidden of ['Synthetic private name', 'patientPhone', 'notas', 'description']) assert.equal(serialized.includes(forbidden), false);
});

test('monthly recurrence keeps the day-31 recovery rule without changing ordinary anchors', () => {
  const common = { type: 'appointment', status: 'programada', startAt: Date.parse('2026-01-28T15:00:00Z'), endAt: Date.parse('2026-01-28T16:00:00Z'), timeZone: 'America/Mexico_City', recurrence: 'monthly' };
  assert.deepEqual(googleEventProjection({ ...common, startDate: '2026-01-28' }, 'a', 'abcde').recurrence, ['RRULE:FREQ=MONTHLY;BYMONTHDAY=28']);
  assert.deepEqual(googleEventProjection({ ...common, startDate: '2026-01-30' }, 'b', 'abcdef').recurrence, ['RRULE:FREQ=MONTHLY;BYMONTHDAY=30', 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1']);
});

test('source version ignores PHI but changes with scheduling state', () => {
  const base = { type: 'appointment', status: 'programada', startAt: 1, endAt: 2, timeZone: 'UTC', startDate: '2026-09-09', startTime: '10:00', durationMinutes: 60 };
  assert.equal(appointmentSourceVersion({ ...base, patientName: 'A' }), appointmentSourceVersion({ ...base, patientName: 'B' }));
  assert.notEqual(appointmentSourceVersion(base), appointmentSourceVersion({ ...base, startAt: 3 }));
});

test('rate limits and invalid authorization are classified without provider payloads', () => {
  assert.deepEqual({ code: safeGoogleError(429, {}).code, retryable: safeGoogleError(429, {}).retryable }, { code: 'google-rate-limited', retryable: true });
  assert.equal(safeGoogleError(401, {}).code, 'reauthorization-required');
  assert.equal(safeGoogleError(404, {}).code, 'event-not-found');
});

test('composition keeps Google access server-side and shares the Appointment Service with the bot', async () => {
  const [runtime, service, bot, agendaService] = await Promise.all([
    readFile(new URL('../functions/googleCalendar/runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/appointments/service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../functions/whatsappBot/appointments.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../js/services/googleCalendarService.js', import.meta.url), 'utf8')
  ]);
  assert.match(service, /externalAvailabilityProvider\.getBusy/);
  assert.match(bot, /externalAvailabilityProvider/);
  assert.match(runtime, /googleCalendarSyncJobs/);
  assert.match(runtime, /googleCalendarAppointmentLinks/);
  assert.doesNotMatch(agendaService, /refresh_token|access_token|client_secret/i);
});
