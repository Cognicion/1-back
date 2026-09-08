import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createBotRuntime}=require('../functions/whatsappBot/index.js');

test('bot deployment uses supported runtime region and preserves durable trigger contracts',()=>{
  // Discovery only: no handlers, credentials, database reads or secret values.
  const functions=createBotRuntime({db:{},credential:{}}).exports;
  assert.equal(Object.keys(functions).length,4);
  for(const handler of Object.values(functions))assert.deepEqual(handler.__endpoint.region,['us-central1']);
  const work=functions.whatsappBotWorkCreated.__endpoint.eventTrigger;
  assert.equal(work.eventType,'google.cloud.firestore.document.v1.created');
  assert.equal(work.eventFilterPathPatterns.document,'whatsappBotJobs/{jobId}');
  assert.equal(work.retry,true);
  const changed=functions.whatsappBotAppointmentChanged.__endpoint.eventTrigger;
  assert.equal(changed.eventType,'google.cloud.firestore.document.v1.written');
  assert.equal(changed.eventFilterPathPatterns.document,'usuarios/{doctorUid}/agenda/{appointmentId}');
  assert.equal(changed.retry,true);
  const schedule=functions.whatsappBotDrain.__endpoint.scheduleTrigger;
  assert.equal(schedule.schedule,'every 1 minutes');
  assert.equal(schedule.timeZone,'UTC');
});
