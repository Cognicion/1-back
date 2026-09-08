import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createAppointmentService } from '../functions/appointments/service.mjs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, getDoc } = require('firebase/firestore');
const projectId = 'demo-cognicion-agenda';
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required; production prohibited');
const app = initializeApp({ projectId }, 'appointment-tests');
const db = getFirestore(app);
const service = createAppointmentService({ db });
const auth = { uid: 'doctor_test', token: {} };
const doctorUid = auth.uid;
const input = { startDate: '2026-09-07', startTime: '14:00', durationMinutes: 60, patientName: 'Synthetic patient' };
const request = (requestId, extra = {}) => ({ auth, doctorUid, requestId, ...extra });
const policy = { timeZone: 'America/Mexico_City', weeklyHours: { 1: [{ start: '09:00', end: '18:00' }] }, allowReschedule: true, allowCancellation: true };
let env;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
test.beforeEach(async () => {
  await env.clearFirestore();
  await db.doc(`usuarios/${doctorUid}`).set({ rol: 'medico' });
  await db.doc(`appointmentControls/${doctorUid}`).set({ enabled: true, revision: 0, policy });
});
test.after(async () => { await env?.cleanup(); await deleteApp(app); });
const create = (key = 'create', changes = {}) => service.createAppointment(request(key, { input: { ...input, ...changes } }));
test('create persists one canonical appointment and one audit', async () => {
  const result = await create();
  const saved = (await db.doc(`usuarios/${doctorUid}/agenda/${result.appointmentId}`).get()).data();
  assert.equal(saved.fecha, input.startDate);
  assert.equal(saved.temporalModel, 'modern-instant');
  assert.equal(saved.startAt.toDate().toISOString(), '2026-09-07T20:00:00.000Z');
  assert.equal(saved.endAt.toDate().toISOString(), '2026-09-07T21:00:00.000Z');
  assert.equal(saved.patientId, '');
  assert.equal(saved.payment.status, 'not_required');
  assert.equal((await db.collection('auditoria').get()).size, 1);
  const projection = await service.getAppointment({ auth, doctorUid, appointmentId: result.appointmentId });
  assert.equal(projection.patientName, undefined);
});
test('two concurrent creates: exactly one wins', async () => {
  const results = await Promise.allSettled([create('A'), create('B')]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.find((x) => x.status === 'rejected').reason.code, 'conflict');
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).size, 1);
});
test('same idempotency key concurrent and later replay creates only one document', async () => {
  const [a, b] = await Promise.all([create('repeat'), create('repeat')]);
  assert.equal(a.appointmentId, b.appointmentId);
  assert.equal((await create('repeat')).replayed, true);
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).size, 1);
  assert.equal((await db.collection('auditoria').get()).size, 1);
  await assert.rejects(() => create('repeat', { startTime: '16:00' }), { code: 'idempotency-key-reused' });
});
test('adjacency at exact end is allowed', async () => { await create('one', { startTime: '13:00' }); await create('two'); });
test('concurrent reschedules preserve losing appointment and do not duplicate', async () => {
  const a = await create('one', { startTime: '10:00' });
  const b = await create('two', { startTime: '11:00' });
  const results = await Promise.allSettled([a, b].map(({ appointmentId }, index) => service.rescheduleAppointment(request(`move-${index}`, { appointmentId, input: { startTime: '16:00' } }))));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'conflict');
  const saved = await db.collection(`usuarios/${doctorUid}/agenda`).get();
  assert.equal(saved.size, 2);
  assert.equal(saved.docs.filter((item) => item.data().startTime === '16:00').length, 1);
});
test('block and vacation prevent creation', async () => {
  for (const type of ['block', 'vacation']) {
    await db.doc(`usuarios/${doctorUid}/agenda/block`).set({ type, startDate: input.startDate, endDate: input.startDate, allDay: true });
    await assert.rejects(() => create(type), { code: 'conflict' });
  }
});
test('duration cannot exceed working day', async () => await assert.rejects(() => create('long', { durationMinutes: 300 }), { code: 'outside-working-hours' }));
test('reschedule changes same document; cancel frees slot; confirm works', async () => {
  const { appointmentId } = await create();
  const before = (await db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`).get()).data().startAt.toMillis();
  await service.rescheduleAppointment(request('move', { appointmentId, input: { startTime: '15:00' } }));
  assert.notEqual((await db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`).get()).data().startAt.toMillis(), before);
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).size, 1);
  await service.confirmAppointment(request('confirm', { appointmentId }));
  let saved = await service.getAppointment({ auth, doctorUid, appointmentId });
  assert.equal(saved.confirmation.status, 'confirmed');
  await service.cancelAppointment(request('cancel', { appointmentId }));
  saved = await service.getAppointment({ auth, doctorUid, appointmentId });
  assert.equal(saved.status, 'cancelada');
  await create('replacement', { startTime: '15:00' });
});
test('legacy appointment blocks and can be confirmed without destructive migration', async () => {
  await db.doc(`usuarios/${doctorUid}/agenda/old`).set({ pacienteId: '', pacienteNombre: 'Synthetic', fecha: input.startDate, hora: '14:00', estado: 'programada', notas: 'Synthetic preserved text' });
  await assert.rejects(() => create(), { code: 'conflict' });
  await service.confirmAppointment(request('confirm-old', { appointmentId: 'old' }));
  assert.equal((await db.doc(`usuarios/${doctorUid}/agenda/old`).get()).data().notas, 'Synthetic preserved text');
});
test('authorization rejects anonymous, other doctor, patient role and deleting actor', async () => {
  await assert.rejects(() => service.createAppointment({ doctorUid, requestId: 'anonymous', input }), { code: 'unauthenticated' });
  await assert.rejects(() => service.createAppointment(request('other', { doctorUid: 'another', input })), { code: 'permission-denied' });
  await db.doc(`usuarios/${doctorUid}`).set({ rol: 'paciente' });
  await assert.rejects(() => create(), { code: 'permission-denied' });
  await db.doc(`usuarios/${doctorUid}`).set({ rol: 'medico' });
  await db.doc(`accountDeletionTombstones/${doctorUid}`).set({ status: 'deleting' });
  await assert.rejects(() => create(), { code: 'permission-denied' });
});
test('unrelated registered patient cannot be linked', async () => {
  await db.doc('usuarios/unrelated_patient').set({ rol: 'paciente' });
  await assert.rejects(() => create('unrelated', { patientId: 'unrelated_patient' }), { code: 'permission-denied' });
});
test('authorized registered patient can create an appointment through the transaction', async () => {
  await db.doc('usuarios/authorized_patient').set({ rol: 'paciente', creadoPor: doctorUid });
  const result = await create('registered', { patientId: 'authorized_patient', patientName: 'Authorized synthetic patient' });
  const saved = (await db.doc(`usuarios/${doctorUid}/agenda/${result.appointmentId}`).get()).data();
  assert.equal(saved.patientId, 'authorized_patient');
  assert.equal(saved.externalPatient, false);
});
test('payment fields cannot be supplied; required pending payment cannot confirm', async () => {
  await assert.rejects(() => create('forged', { payment: { status: 'paid' } }), { code: 'invalid-input' });
  await db.doc(`appointmentControls/${doctorUid}`).update({ 'policy.payment': { required: true, type: 'deposit', amount: 500, currency: 'MXN' } });
  const { appointmentId } = await create();
  await assert.rejects(() => service.confirmAppointment(request('confirm', { appointmentId })), { code: 'payment-not-verified' });
  const saved = await service.getAppointment({ auth, doctorUid, appointmentId });
  assert.equal(saved.payment.status, 'pending');
  assert.equal(saved.confirmation.status, 'pending');
});
test('inconsistent payment policy aborts atomically', async () => {
  await db.doc(`appointmentControls/${doctorUid}`).update({ 'policy.payment': { required: false, type: 'full', amount: 500, currency: 'MXN' } });
  await assert.rejects(() => create(), { code: 'inconsistent-payment' });
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).size, 0);
  assert.equal((await db.collection('auditoria').get()).size, 0);
});
test('mode disabled refuses transactional service', async () => {
  await db.doc(`appointmentControls/${doctorUid}`).update({ enabled: false });
  await assert.rejects(() => create(), { code: 'transactional-mode-disabled' });
});
test('first transactional appointment activates only this doctor with the explicit legacy-civil compatibility policy', async () => {
  await db.doc(`appointmentControls/${doctorUid}`).delete();
  const result = await create();
  const control = (await db.doc(`appointmentControls/${doctorUid}`).get()).data();
  assert.equal(result.replayed, false);
  assert.equal(control.enabled, true);
  assert.equal(control.policy.availabilityMode, 'legacy-civil');
  assert.equal(control.policy.timeZone, undefined);
});
test('administrative update links an external patient without a second appointment', async () => {
  const { appointmentId } = await create('external');
  await db.doc('usuarios/linked_patient').set({ rol: 'paciente', creadoPor: doctorUid });
  await service.updateAppointment(request('link', { appointmentId, input: { patientId: 'linked_patient', patientName: 'Updated synthetic patient', patientPhone: '', patientEmail: '', description: 'Updated', notas: 'Updated', ubicacion: '', recordatorio: '', seguimiento: '', googleCalendarEventId: '' } }));
  const saved = (await db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`).get()).data();
  assert.equal(saved.patientName, 'Updated synthetic patient');
  assert.equal(saved.patientId, 'linked_patient');
  assert.equal(saved.externalPatient, false);
  assert.equal((await db.collection(`usuarios/${doctorUid}/agenda`).get()).size, 1);
});
test('complete uses the transactional state transition', async () => {
  const { appointmentId } = await create('created-to-complete');
  await service.completeAppointment(request('complete', { appointmentId }));
  const saved = await service.getAppointment({ auth, doctorUid, appointmentId });
  assert.equal(saved.status, 'atendida');
});
test('recurring monthly appointment is created through the transaction and retains the source rule', async () => {
  await db.doc(`appointmentControls/${doctorUid}`).update({ policy: { availabilityMode: 'legacy-civil', allowReschedule: true, allowCancellation: true, payment: { required: false, type: 'none', amount: null, currency: 'MXN' }, remindersEnabled: false } });
  const { appointmentId } = await create('monthly', { startDate: '2026-01-31', endDate: '2026-01-31', recurrence: 'monthly' });
  assert.equal((await db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`).get()).data().recurrence, 'monthly');
});
test('modern recurrent create and reschedule use later virtual intervals transactionally', async () => {
  const series = await create('modern-weekly', { startDate: '2026-01-05', endDate: '2026-01-05', startTime: '09:00', recurrence: 'weekly' });
  await assert.rejects(() => create('later-overlap', { startDate: '2026-01-12', endDate: '2026-01-12', startTime: '09:00' }), { code: 'conflict' });
  await create('later-adjacent', { startDate: '2026-01-12', endDate: '2026-01-12', startTime: '10:00' });
  await service.rescheduleAppointment(request('reschedule-weekly', { appointmentId: series.appointmentId, input: { startDate: '2026-01-05', endDate: '2026-01-05', startTime: '11:00', durationMinutes: 60, recurrence: 'weekly' } }));
  const saved = (await db.doc(`usuarios/${doctorUid}/agenda/${series.appointmentId}`).get()).data();
  assert.equal(saved.startTime, '11:00');
  assert.equal(saved.temporalModel, 'modern-instant');
});
test('administrative read refuses inconsistent historical payment', async () => {
  await db.doc(`usuarios/${doctorUid}/agenda/inconsistent`).set({ type: 'appointment', payment: { required: false, type: 'none', status: 'paid', amount: null, currency: 'MXN', paidAt: 'synthetic' } });
  await assert.rejects(() => service.getAppointment({ auth, doctorUid, appointmentId: 'inconsistent' }), { code: 'inconsistent-payment' });
});
test('Rules: enabled gate blocks ALL client writes, including admin', async () => {
  await db.doc('usuarios/admin_test').set({ rol: 'admin' });
  for (const uid of [doctorUid, 'admin_test']) {
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(client, `usuarios/${doctorUid}/agenda/forged`), { type: 'appointment', fecha: input.startDate }));
  }
  const { appointmentId } = await create();
  const client = env.authenticatedContext(doctorUid).firestore();
  await assertFails(updateDoc(doc(client, `usuarios/${doctorUid}/agenda/${appointmentId}`), { startTime: '16:00' }));
  await assertFails(deleteDoc(doc(client, `usuarios/${doctorUid}/agenda/${appointmentId}`)));
});
test('Rules: enabled appointment gate does not block a non-appointment event', async () => {
  const client = env.authenticatedContext(doctorUid).firestore();
  await assertSucceeds(setDoc(doc(client, `usuarios/${doctorUid}/agenda/nonAppointment`), { type: 'event', startDate: input.startDate }));
  await assertSucceeds(updateDoc(doc(client, `usuarios/${doctorUid}/agenda/nonAppointment`), { title: 'Synthetic event' }));
  await assertFails(updateDoc(doc(client, `usuarios/${doctorUid}/agenda/nonAppointment`), { type: 'appointment' }));
});
test('Rules: legacy CRUD works but payment and internal controls are inaccessible', async () => {
  await db.doc(`appointmentControls/${doctorUid}`).delete();
  const client = env.authenticatedContext(doctorUid).firestore();
  const ref = doc(client, `usuarios/${doctorUid}/agenda/legacy`);
  await assertSucceeds(setDoc(ref, { fecha: input.startDate, estado: 'programada' }));
  await assertSucceeds(updateDoc(ref, { estado: 'atendida' }));
  await assertFails(updateDoc(ref, { payment: { status: 'paid' } }));
  await assertFails(setDoc(doc(client, `usuarios/${doctorUid}/agenda/new`), { confirmation: { status: 'confirmed' } }));
  await assertFails(setDoc(doc(client, `appointmentControls/${doctorUid}`), { enabled: false }));
  await assertFails(getDoc(doc(client, `appointmentControls/${doctorUid}/requests/key`)));
  const other = env.authenticatedContext('stranger').firestore();
  await assertFails(getDoc(doc(other, `usuarios/${doctorUid}/agenda/legacy`)));
  await assertSucceeds(deleteDoc(ref));
});
