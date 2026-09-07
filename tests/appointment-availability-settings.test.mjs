import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailability, normalizeAvailabilitySettings, canonicalAppointmentInterval, calendarProjection } from '../functions/appointments/domain.mjs';
import { getOccurrences } from '../functions/appointments/recurrence.mjs';

const policy = {
  timeZone: 'America/Mexico_City', bookingEnabled: true, slotDurationMinutes: 60,
  weeklySchedule: { monday: [{ start: '09:00', end: '13:00' }], tuesday: [{ start: '09:00', end: '13:00' }], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  dateExceptions: [], bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumBookingNoticeMinutes: null, maximumBookingAdvanceDays: null
};
const candidate = (date, time, durationMinutes = 60) => ({ type: 'appointment', startDate: date, endDate: date, startTime: time, durationMinutes });

test('accepts IANA timezone and rejects invalid timezone', () => {
  assert.equal(normalizeAvailabilitySettings(policy).timeZone, 'America/Mexico_City');
  assert.throws(() => normalizeAvailabilitySettings({ ...policy, timeZone: 'UTC-6' }), /invalid-timezone/);
});
test('canonical instant is independent of the host timezone and calendar projection excludes PHI', () => {
  const interval = canonicalAppointmentInterval(candidate('2026-09-07', '14:00'), policy);
  assert.equal(new Date(interval.startAt).toISOString(), '2026-09-07T20:00:00.000Z');
  const projection = calendarProjection({ id: 'appointment', startAt: interval.startAt, endAt: interval.endAt, timeZone: interval.timeZone, patientName: 'Must not leave domain', notas: 'Private' });
  assert.deepEqual(projection, { appointmentId: 'appointment', startAt: interval.startAt, endAt: interval.endAt, timeZone: 'America/Mexico_City', title: 'Consulta' });
});
test('supports split and closed weekly days', () => {
  const split = { ...policy, weeklySchedule: { ...policy.weeklySchedule, monday: [{ start: '09:00', end: '12:00' }, { start: '16:00', end: '20:00' }] } };
  assert.equal(getAvailability({ candidate: candidate('2026-09-07', '16:00'), events: [], policy: split, complete: true }).available, true);
  assert.equal(getAvailability({ candidate: candidate('2026-09-09', '09:00'), events: [], policy: split, complete: true }).reason, 'outside-working-hours');
});
test('date exception replaces that day schedule', () => {
  const exception = { ...policy, dateExceptions: [{ date: '2026-09-07', intervals: [{ start: '10:00', end: '11:00' }] }] };
  assert.equal(getAvailability({ candidate: candidate('2026-09-07', '09:00'), events: [], policy: exception, complete: true }).available, false);
  assert.equal(getAvailability({ candidate: candidate('2026-09-07', '10:00'), events: [], policy: exception, complete: true }).available, true);
});
test('slots respect duration, busy events and half-open intervals', () => {
  const slots = getAvailability({ events: [{ id: 'a', ...candidate('2026-09-07', '10:00') }], policy, complete: true, rangeStart: '2026-09-07', rangeEnd: '2026-09-07', requestedDurationMinutes: 120 });
  assert.deepEqual(slots.slots.map((slot) => slot.startTime), ['11:00']);
});
test('external busy intervals compose with Cognición occupancy', () => {
  const external = [{ start: '2026-09-07T15:00:00.000Z', end: '2026-09-07T16:00:00.000Z', source: 'mock-calendar' }];
  const result = getAvailability({ candidate: candidate('2026-09-07', '09:00'), events: [], policy, complete: true, externalBusyIntervals: external });
  assert.equal(result.reason, 'external-busy');
});
test('unbounded recurrence expands only the requested distant window and preserves day 31 anchor', () => {
  const series = { id: 'monthly', startDate: '2020-01-31', endDate: '2020-01-31', recurrence: 'monthly' };
  const occurrences = getOccurrences(series, '2050-02-01', '2050-03-31');
  assert.deepEqual(occurrences.map((item) => item.startDate), ['2050-02-28', '2050-03-31']);
  assert.equal(occurrences.length, 2);
});
test('DST invalid local time fails closed in a DST timezone', () => {
  const dstPolicy = { ...policy, timeZone: 'America/Tijuana', weeklySchedule: { sunday: [{ start: '01:00', end: '04:00' }], monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [] } };
  assert.equal(getAvailability({ candidate: candidate('2026-03-08', '02:00'), events: [], policy: dstPolicy, complete: true }).available, false);
});
