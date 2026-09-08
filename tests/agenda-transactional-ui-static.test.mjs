import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agenda = await readFile(new URL('../js/agenda.js', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../js/agenda/workspace.js', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../js/services/appointmentCommandService.js', import.meta.url), 'utf8');
const functions = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');

test('Agenda routes all appointment UI actions through the callable adapter', () => {
  assert.match(agenda, /const action = !id \? "create" : cambioHorarioCita\(anterior, datos\) \? "reschedule" : "update"/);
  assert.match(agenda, /datosCitaParaServicio\(datos, action\)/);
  assert.match(agenda, /action === "update" \? CAMPOS_CITA_SERVICIO\.filter/);
  for (const action of ['confirm', 'cancel', 'complete']) assert.match(agenda, new RegExp(`action: ["']${action}["']`));
  assert.match(agenda, /if \(datos\.type === "appointment"\)[\s\S]*?ejecutarOperacionCita[\s\S]*?return;/);
  assert.match(workspace, /if \(event\.type === "appointment"\)[\s\S]*?action\("cancel", "Cancelar cita"\)[\s\S]*?else actions \+= action\("delete", "Eliminar evento"\)/);
  assert.match(agenda, /if \(action === "delete"\) \{ if \(event\.type !== "appointment"\) await eliminarEvento/);
  assert.doesNotMatch(workspace, /addDoc|setDoc|updateDoc|deleteDoc|executeAppointmentCommand/);
});

test('direct Firestore writes remain only in the non-appointment branch', () => {
  const submit = agenda.slice(agenda.indexOf('form.addEventListener("submit"'), agenda.indexOf('function construirEvento'));
  const firstWrite = submit.indexOf('await updateDoc(');
  assert.ok(firstWrite > 0);
  const preceding = submit.slice(0, firstWrite);
  assert.match(preceding, /if \(datos\.type === "appointment"\)[\s\S]*?await ejecutarOperacionCita[\s\S]*?return;/);
  assert.match(preceding, /original\.type !== datos\.type/);
  assert.match(agenda, /async function eliminarEvento\(id\)[\s\S]*?event\.type === "appointment"\) return;[\s\S]*?await deleteDoc/);
  const commandBranch = agenda.slice(agenda.indexOf('async function ejecutarOperacionCita'), agenda.indexOf('function establecerOperacionPendiente'));
  assert.doesNotMatch(commandBranch, /addDoc|setDoc|updateDoc|deleteDoc/);
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
