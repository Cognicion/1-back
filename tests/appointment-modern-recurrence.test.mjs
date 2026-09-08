import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalAppointmentInterval, getAvailability } from '../functions/appointments/domain.mjs';
import { getOccurrences } from '../functions/appointments/recurrence.mjs';

const mexicoPolicy = {
  timeZone: 'America/Mexico_City', bookingEnabled: true, slotDurationMinutes: 60,
  weeklySchedule: { monday: [{ start: '09:00', end: '17:00' }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  dateExceptions: [], bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumBookingNoticeMinutes: null, maximumBookingAdvanceDays: 366
};

function modernSeries(changes = {}, policy = mexicoPolicy) {
  const source = {
    id: 'synthetic-series', type: 'appointment', startDate: '2026-01-05', endDate: '2026-01-05',
    startTime: '09:00', durationMinutes: 60, recurrence: 'weekly', timeZone: policy.timeZone,
    ...changes
  };
  return { ...source, ...canonicalAppointmentInterval(source, policy), temporalModel: 'modern-instant' };
}

function canonicalVirtual(occurrence, policy = mexicoPolicy) {
  return canonicalAppointmentInterval({ ...occurrence, recurrence: null, fecha: occurrence.startDate, hora: occurrence.startTime }, policy);
}

test('modern documents retain their canonical consistency guard while virtual weekly occurrences derive their own interval', () => {
  const source = modernSeries();
  assert.throws(() => canonicalAppointmentInterval({ ...source, startAt: source.startAt + 1 }, mexicoPolicy), { code: 'inconsistent-canonical-instant' });

  const [anchor] = getOccurrences(source, '2026-01-05', '2026-01-05');
  const [second] = getOccurrences(source, '2026-01-12', '2026-01-12');
  assert.equal(anchor.temporalModel, 'virtual-occurrence');
  assert.equal(anchor.startAt, undefined);
  assert.equal(anchor.endAt, undefined);
  assert.equal(canonicalVirtual(anchor).startAt, source.startAt);
  assert.equal(second.startDate, '2026-01-12');
  assert.equal(second.startAt, undefined);
  assert.equal(second.endAt, undefined);
  assert.equal(canonicalVirtual(second).startAt, Date.parse('2026-01-12T15:00:00.000Z'));
});

test('biweekly and monthly virtual occurrences preserve their civil rule, duration, and day-31 recovery', () => {
  const biweekly = modernSeries({ recurrence: 'biweekly' });
  const [laterBiweekly] = getOccurrences(biweekly, '2026-01-19', '2026-01-19');
  assert.equal(canonicalVirtual(laterBiweekly).startAt, Date.parse('2026-01-19T15:00:00.000Z'));

  const monthly = modernSeries({ startDate: '2026-01-31', endDate: '2026-01-31', startTime: '09:00', durationMinutes: 90, recurrence: 'monthly' });
  const occurrences = getOccurrences(monthly, '2026-02-01', '2026-05-31');
  assert.deepEqual(occurrences.map(({ startDate, endDate }) => ({ startDate, endDate })), [
    { startDate: '2026-02-28', endDate: '2026-02-28' },
    { startDate: '2026-03-31', endDate: '2026-03-31' },
    { startDate: '2026-04-30', endDate: '2026-04-30' },
    { startDate: '2026-05-31', endDate: '2026-05-31' }
  ]);
  const march = occurrences.find(({ startDate }) => startDate === '2026-03-31');
  const marchInterval = canonicalVirtual(march);
  assert.equal(marchInterval.endAt - marchInterval.startAt, 90 * 60_000);
});

test('a later virtual occurrence blocks overlap and permits only exact [start,end) adjacency', () => {
  const source = modernSeries({ durationMinutes: 60 });
  const overlap = { type: 'appointment', startDate: '2026-01-12', endDate: '2026-01-12', startTime: '09:00', durationMinutes: 60, timeZone: mexicoPolicy.timeZone };
  const adjacent = { ...overlap, startTime: '10:00' };
  assert.equal(getAvailability({ candidate: overlap, events: [source], policy: mexicoPolicy, complete: true }).reason, 'conflict');
  assert.equal(getAvailability({ candidate: adjacent, events: [source], policy: mexicoPolicy, complete: true }).available, true);
});

test('a new modern recurring series validates its bounded horizon without inherited anchor instants', () => {
  const result = getAvailability({ candidate: modernSeries(), events: [], policy: mexicoPolicy, complete: true });
  assert.deepEqual(result, { available: true, reason: 'available-recurring', recurrenceValidationHorizon: 500 });
});

test('legacy recurrent appointments retain civil availability semantics', () => {
  const legacyPolicy = { availabilityMode: 'legacy-civil' };
  const source = { id: 'legacy-series', type: 'appointment', startDate: '2026-01-05', endDate: '2026-01-05', startTime: '09:00', durationMinutes: 60, recurrence: 'weekly' };
  const overlap = { type: 'appointment', startDate: '2026-01-12', endDate: '2026-01-12', startTime: '09:00', durationMinutes: 60 };
  assert.equal(getAvailability({ candidate: overlap, events: [source], policy: legacyPolicy, complete: true }).reason, 'conflict');
});

test('America/Tijuana keeps the recurring wall clock across DST and derives the later instant', () => {
  const tijuanaPolicy = { ...mexicoPolicy, timeZone: 'America/Tijuana' };
  const source = modernSeries({ startDate: '2026-03-02', endDate: '2026-03-02' }, tijuanaPolicy);
  const [afterDst] = getOccurrences(source, '2026-03-09', '2026-03-09');
  assert.equal(source.startAt, Date.parse('2026-03-02T17:00:00.000Z'));
  assert.equal(canonicalVirtual(afterDst, tijuanaPolicy).startAt, Date.parse('2026-03-09T16:00:00.000Z'));
  const overlap = { type: 'appointment', startDate: '2026-03-09', endDate: '2026-03-09', startTime: '09:00', durationMinutes: 60, timeZone: 'America/Tijuana' };
  assert.equal(getAvailability({ candidate: overlap, events: [source], policy: tijuanaPolicy, complete: true }).reason, 'conflict');
});
