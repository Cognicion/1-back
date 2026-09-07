import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agenda = await readFile(new URL('../js/agenda.js', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../js/services/appointmentCommandService.js', import.meta.url), 'utf8');
const functions = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');

test('Agenda routes all appointment UI actions through the callable adapter', () => {
  assert.match(agenda, /const action = !id \? "create" : cambioHorarioCita\(anterior, datos\) \? "reschedule" : "update"/);
  assert.match(agenda, /datosCitaParaServicio\(datos, action\)/);
  assert.match(agenda, /action === "update" \? CAMPOS_CITA_SERVICIO\.filter/);
  for (const action of ['confirm', 'cancel', 'complete']) assert.match(agenda, new RegExp(`action: ["']${action}["']`));
  assert.match(agenda, /if \(datos\.type === "appointment"\)[\s\S]{0,800}?ejecutarOperacionCita/);
  assert.match(agenda, /e\.type !== "appointment" \? `<button data-eliminar/);
  assert.match(agenda, /data-cancelar/);
});

test('direct Firestore writes remain only in the non-appointment branch', () => {
  const writeBranch = agenda.match(/if \(id\) \{ delete datos\.createdAt[\s\S]{0,700}?await cargarEventos\(\);/);
  assert.ok(writeBranch);
  const preceding = agenda.slice(0, writeBranch.index);
  assert.match(preceding.slice(-700), /if \(datos\.type === "appointment"\)[\s\S]*?return;/);
});

test('adapter obtains an authenticated callable and does not write Firestore', () => {
  assert.match(adapter, /obtenerFunctions/);
  assert.match(adapter, /httpsCallable/);
  assert.match(adapter, /manageAppointment/);
  assert.doesNotMatch(adapter, /addDoc|setDoc|updateDoc|deleteDoc/);
});

test('backend derives doctorUid from verified callable auth', () => {
  assert.match(functions, /doctorUid: request\.auth\.uid/);
  assert.match(functions, /exports\.manageAppointment = onCall/);
});
