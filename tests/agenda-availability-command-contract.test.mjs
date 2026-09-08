import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('disponibilidad conserva el contrato entre UI, callable y servicio local', async () => {
  const [controller, adapter, index, service] = await Promise.all([
    read('js/services/agendaAvailabilitySettings.js'),
    read('js/services/appointmentCommandService.js'),
    read('functions/index.js'),
    read('functions/appointments/service.mjs')
  ]);
  assert.match(controller, /action: "updateAvailabilitySettings"/);
  assert.match(controller, /timeZone:/);
  assert.match(controller, /weeklySchedule:/);
  assert.match(controller, /bookingEnabled:/);
  assert.match(adapter, /settings/);
  assert.match(index, /updateAvailabilitySettings: "updateAvailabilitySettings"/);
  assert.match(index, /service\.updateAvailabilitySettings\(\{ auth: request\.auth, doctorUid: request\.auth\.uid, settings: data\.settings \|\| \{\} \}\)/);
  assert.match(service, /async updateAvailabilitySettings\(\{ auth, doctorUid, settings \}\)/);
});
