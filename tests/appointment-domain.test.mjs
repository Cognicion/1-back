import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEvento, intervaloEvento, overlaps, getAvailability, appointmentState, validateState, transitionAppointment, administrativeAppointment } from '../functions/appointments/domain.mjs';
import { expandirRecurrencia } from '../js/services/agendaRecurrence.js';
const candidate = { type: 'appointment', startDate: '2026-09-07', startTime: '14:00', durationMinutes: 60 };
const policy = { timeZone: 'America/Mexico_City', weeklyHours: { 1: [{ start: '09:00', end: '18:00' }] } };
const available = (events = [], changes = {}) => getAvailability({ candidate, events, policy, complete: true, ...changes });
test('valid requested slot', () => assert.equal(available().available, true));
test('appointment conflict', () => assert.equal(available([{ ...candidate, id: 'other' }]).reason, 'conflict'));
test('[start,end) permits exact adjacency', () => assert.equal(available([{ ...candidate, startTime: '13:00' }]).available, true));
test('blocks and vacations', () => {
  for (const type of ['block', 'vacation']) assert.equal(available([{ ...candidate, type }]).reason, 'conflict');
});
test('duration and endTime precedence', () => {
  assert.equal(available([{ ...candidate, startTime: '13:30' }]).available, false);
  assert.equal(available([{ ...candidate, startTime: '13:00', endTime: '14:00', durationMinutes: 180 }]).available, true);
  assert.throws(() => available([], { candidate: { ...candidate, durationMinutes: -1 } }));
});
test('reschedule excludes same document only', () => assert.equal(available([{ ...candidate, id: 'self' }], { excludeId: 'self' }).available, true));
test('cancel frees slot and rejects later confirmation', () => {
  const canceled = { ...candidate, ...transitionAppointment(candidate, 'cancel', 'now') };
  assert.equal(available([canceled]).available, true);
  assert.throws(() => transitionAppointment(canceled, 'confirm', 'now'), /terminal/);
});
test('confirm retains lifecycle state and uses confirmation', () => {
  const confirmed = transitionAppointment(candidate, 'confirm', 'now');
  assert.equal(confirmed.status, 'programada');
  assert.equal(confirmed.confirmation.status, 'confirmed');
});
test('legacy appointment is normalized without mutation', () => {
  const old = { pacienteId: 'synthetic', fecha: '2026-09-07', hora: '14:00', estado: 'programada' };
  assert.equal(normalizarEvento(old).type, 'appointment');
  assert.equal(appointmentState(old).payment.status, 'not_required');
  assert.equal(old.payment, undefined);
  assert.equal(available([old]).reason, 'conflict');
});
test('monthly 31 retains anchor including leap February', () => {
  const occurrences = expandirRecurrencia({ ...candidate, id: 'series', startDate: '2028-01-31', endDate: '2028-01-31', recurrence: 'monthly' }, '2028-02-01', '2028-05-31');
  assert.deepEqual(occurrences.map((x) => x.startDate), ['2028-02-29', '2028-03-31', '2028-04-30', '2028-05-31']);
});
test('payment paid without requirement is inconsistent', () => assert.throws(() => validateState({ ...candidate, payment: { ...appointmentState(candidate).payment, status: 'paid', paidAt: 'now' } }), /inconsistent-payment/));
test('required pending payment cannot confirm', () => assert.throws(() => transitionAppointment({ ...candidate, payment: { required: true, type: 'deposit', status: 'pending', amount: 500, currency: 'MXN', paidAt: null } }, 'confirm', 'now'), /payment-not-verified/));
test('configuration and incomplete reads fail closed', () => {
  assert.equal(available([], { complete: false }).reason, 'incomplete-data');
  assert.equal(available([], { policy: {} }).reason, 'configuration-required');
  assert.equal(available([], { candidate: { ...candidate, startTime: '17:30' } }).reason, 'outside-working-hours');
});
test('shifts remain nonblocking unless explicitly configured', () => {
  assert.equal(available([{ ...candidate, type: 'shift' }]).available, true);
  assert.equal(available([{ ...candidate, type: 'shift', blocksAvailability: true }]).available, false);
});
test('long recurring block beginning before visible month', () => {
  assert.equal(available([{ type: 'vacation', id: 'long', startDate: '2026-07-01', endDate: '2026-09-09', allDay: true, recurrence: 'monthly' }]).reason, 'conflict');
});
test('overnight appointment conflicts on next day', () => assert.equal(available([{ ...candidate, startDate: '2026-09-06', endDate: '2026-09-06', startTime: '23:00', durationMinutes: 960 }]).reason, 'conflict'));
test('unknown recurrence and invalid date do not imply availability', () => {
  assert.equal(available([{ ...candidate, recurrence: 'daily' }]).reason, 'unsupported-recurrence');
  assert.equal(available([{ ...candidate, startDate: 'invalid' }]).reason, 'invalid-existing-data');
});
test('administrative projection excludes free text and nested extra data', () => {
  const result = administrativeAppointment({ ...candidate, id: 'test', notas: 'PRIVATE', patientName: 'PRIVATE', confirmation: { ...appointmentState(candidate).confirmation, notes: 'PRIVATE' } });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('interval remains half open independent of timezone', () => assert.equal(overlaps(intervaloEvento(candidate), intervaloEvento({ ...candidate, startTime: '15:00' })), false));
test('legacy civil policy preserves historical conflict behavior without inventing a work schedule', () => {
  const legacy = { availabilityMode: 'legacy-civil' };
  assert.equal(getAvailability({ candidate, events: [], policy: legacy, complete: true }).available, true);
  assert.equal(getAvailability({ candidate, events: [{ ...candidate, id: 'occupied' }], policy: legacy, complete: true }).reason, 'conflict');
});
test('recurring appointment validates 500 occurrences and preserves monthly day 31 anchoring', () => {
  const recurring = { ...candidate, startDate: '2026-01-31', endDate: '2026-01-31', recurrence: 'monthly' };
  assert.equal(getAvailability({ candidate: recurring, events: [], policy: { availabilityMode: 'legacy-civil' }, complete: true }).reason, 'available-recurring');
});
test('complete is a terminal transition', () => {
  const completed = transitionAppointment(candidate, 'complete', 'now');
  assert.equal(completed.status, 'atendida');
  assert.throws(() => transitionAppointment(completed, 'cancel', 'now'), /terminal/);
});
test('DST nonexistent and repeated local times fail closed', () => {
  for (const [startDate, startTime] of [['2026-03-08', '02:30'], ['2026-11-01', '01:30']]) {
    assert.equal(available([], { candidate: { ...candidate, startDate, startTime }, policy: { timeZone: 'America/New_York', weeklyHours: { 0: [{ start: '00:00', end: '24:00' }] } } }).reason, 'ambiguous-timezone-interval');
  }
});
