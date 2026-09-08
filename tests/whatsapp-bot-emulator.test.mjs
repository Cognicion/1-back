import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createChannelAppointments} from '../functions/whatsappBot/appointments.mjs';
import {createAppointmentService} from '../functions/appointments/service.mjs';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
const {createWorkPreparer}=require('../functions/whatsappBot/ingress');
const {createWorker}=require('../functions/whatsappBot/worker');
const {createKmsCipher}=require('../functions/whatsappBot/crypto');
const {subjectId,hash}=require('../functions/whatsappBot/config');
const {createEventStore,eventIdHash}=require('../functions/whatsappWebhook/store');
const {createWebhookHandler}=require('../functions/whatsappWebhook/handler');
const {createSettings}=require('../functions/whatsappBot/settings');
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local emulator required; production prohibited');
const projectId='demo-cognicion-bot';
const app=initializeApp({projectId},'bot-tests'),db=getFirestore(app);
const uid='doctor_bot',phone='5215550000001',phone2='5215550000002',identity='synthetic-key-32-bytes-for-tests-only',signing='synthetic-hmac';
const ids={phoneNumberId:'1234567890',wabaId:'9876543210'};
const subject=subjectId(identity,ids.phoneNumberId,phone),subject2=subjectId(identity,ids.phoneNumberId,phone2);
const channel={...ids,subject};
let clock,serial,env,sent,worker,appointments,handler,logs,hooks,templateStatus;
const now=()=>clock;
// Real AES-GCM; fake in-memory KMS. No external requests.
const keys=new Map();
const cipher=createKmsCipher({credential:{getAccessToken:async()=>({access_token:'fake'})},keyName:()=> 'projects/demo/locations/global/keyRings/test/cryptoKeys/test',fetchImpl:async(url,options)=>{
  const b=JSON.parse(options.body);if(url.endsWith(':encrypt')){const id=hash(b.plaintext);keys.set(id,b.plaintext);return {ok:true,json:async()=>({ciphertext:id})};}
  return {ok:true,json:async()=>({plaintext:keys.get(b.ciphertext)})};
}});
const policy={bookingEnabled:true,timeZone:'America/Mexico_City',weeklyHours:Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,[{start:'09:00',end:'18:00'}]])),slotDurationMinutes:60,allowReschedule:true,allowCancellation:true,minimumNoticeMinutes:0,maximumBookingAdvanceDays:90,payment:{required:false,type:'none',amount:null,currency:'MXN'}};
test.before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
test.beforeEach(async()=>{
  await env.clearFirestore();clock=Date.parse('2030-01-07T14:00:00Z');serial=0;sent=[];logs=[];hooks={};templateStatus='APPROVED';
  await db.doc(`usuarios/${uid}`).set({rol:'medico'});
  await db.doc(`appointmentControls/${uid}`).set({enabled:true,revision:0,policy});
  await db.doc('whatsappBotConfig/channel').set({...ids,enabled:true,pilot:true,graphVersion:'v23.0',professionalIds:[uid],allowedSubjects:[subject,subject2]});
  await db.doc(`whatsappBotProfessionals/${uid}`).set({enabled:true,label:'Profesional ficticio',services:[{id:'consulta',label:'Consulta',durationMinutes:60}],reminders:{enabled:true,advanceMinutes:1440,startHour:0,endHour:24,onlyUnconfirmed:false,template:{name:'cita_recordatorio',language:'es_MX'}}});
  appointments=createChannelAppointments({db,now});
  worker=createWorker({db,cipher,appointments,now,hooks,transport:{send:async input=>{sent.push(input);return {state:'accepted',messageId:'wamid.out'+sent.length};},templateStatus:async()=>templateStatus}});
  handler=createWebhookHandler({getVerifyToken:()=> 'test-verify',getAppSecret:()=>signing,recordEvents:createEventStore({db,prepareWork:createWorkPreparer({db,cipher,identityKey:()=>identity,now})}),logger:{info:(...args)=>logs.push(args)},now});
});
test.after(async()=>{await env.cleanup();await deleteApp(app);});
async function receive({text='',choice='',from=phone,id='wamid.test'+(++serial),at=clock,signature=true}={}) {
  const m={id,from,timestamp:String(Math.floor(at/1000)),type:choice?'interactive':'text',...(choice?{interactive:{type:'list_reply',list_reply:{id:choice}}}:{text:{body:text}})};
  const payload={object:'whatsapp_business_account',entry:[{id:ids.wabaId,changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:ids.phoneNumberId},messages:[m]}}]}]};
  const rawBody=Buffer.from(JSON.stringify(payload));let code;
  const response={set(){return this;},status(n){code=n;return this;},send(){return this;},type(){return this;}};
  await handler({method:'POST',rawBody,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',signature?signing:'invalid').update(rawBody).digest('hex')}},response);
  return {key:eventIdHash({messageId:id,eventType:'message'}),code,id};
}
async function say(text='',choice='',options={}) {
  clock+=1000;const r=await receive({text,choice,...options});assert.equal(r.code,200);await worker.process(r.key);
  const work=(await db.doc(`whatsappBotJobs/${r.key}`).get()).data();assert.equal(work?.state,'done',JSON.stringify({state:work?.state,code:work?.code}));
  const out=hash('out:'+r.key),body=(await db.doc(`whatsappBotOutbox/${out}`).get()).data();return {key:r.key,out,...(body?await cipher.open(body.encrypted,out):{})};
}
const choose=(r,title)=>{const c=r.content.choices.find(x=>x.title===title);assert.ok(c,`missing choice ${title}`);return say('',c.id);};
async function review(date='2030-01-08') {
  let r=await say('hola');r=await choose(r,'agendar');r=await choose(r,'Consulta');r=await say(date);r=await say('',r.content.choices[0].id);r=await say('Persona Ficticia');return choose(r,'Autorizar');
}
async function book(date) {const r=await review(date);const result=await choose(r,'Confirmar operación');assert.match(result.content.text,/Cita guardada/);return (await db.collection(`usuarios/${uid}/agenda`).get()).docs[0].id;}

test('signed webhook, durable encryption, conversation and persisted external appointment',async()=>{
  const id=await book();const a=(await db.doc(`usuarios/${uid}/agenda/${id}`).get()).data();
  assert.equal(a.externalPatient,true);assert.equal(a.patientId,'');assert.equal(a.startAt.toDate().toISOString(),'2030-01-08T15:00:00.000Z');
  assert.equal((await db.collection('auditoria').get()).size,1);
  assert.doesNotMatch(JSON.stringify(logs),/Persona|521555|test-verify|synthetic-hmac/);
  assert.doesNotMatch(JSON.stringify((await db.doc(`whatsappBotSessions/${subject}`).get()).data()),/Persona|521555/);
});
test('confirm, reschedule same document, domain cancellation',async()=>{
  const id=await book();let r=await say('confirmar');r=await say('',r.content.choices[0].id);await choose(r,'Confirmar operación');
  assert.equal((await db.doc(`usuarios/${uid}/agenda/${id}`).get()).data().confirmation.status,'confirmed');
  r=await say('reprogramar');r=await say('',r.content.choices[0].id);r=await say('2030-01-09');r=await say('',r.content.choices[0].id);
  assert.equal((await db.doc(`usuarios/${uid}/agenda/${id}`).get()).data().startDate,'2030-01-08');await choose(r,'Confirmar operación');
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,1);assert.equal((await db.doc(`usuarios/${uid}/agenda/${id}`).get()).data().startDate,'2030-01-09');
  r=await say('cancelar');r=await say('',r.content.choices[0].id);await choose(r,'Confirmar operación');assert.equal((await db.doc(`usuarios/${uid}/agenda/${id}`).get()).data().status,'cancelada');
});
test('webhook repetition and historical receipts cannot duplicate jobs',async()=>{
  const r=await receive({text:'hola',id:'wamid.duplicate'});await receive({text:'agendar',id:'wamid.duplicate'});assert.equal((await db.collection('whatsappBotJobs').get()).size,1);
  await worker.process(r.key);await worker.process(r.key);assert.equal((await db.collection('whatsappBotOutbox').get()).size,1);
  const id='wamid.historical',key=eventIdHash({messageId:id,eventType:'message'});await db.doc(`whatsappWebhookEvents/${key}`).set({schemaVersion:1});await receive({id,text:'agendar'});assert.equal((await db.doc(`whatsappBotJobs/${key}`).get()).exists,false);
});
test('invalid HMAC, unauthorized sender and stale Meta samples cannot enqueue',async()=>{
  assert.equal((await receive({text:'hola',signature:false})).code,403);
  await receive({text:'hola',from:'5215550000099'});await receive({text:'hola',at:clock-25*3600000});assert.equal((await db.collection('whatsappBotJobs').get()).size,0);
});
test('ambiguous yes, old buttons, expired buttons and out of order messages do not write',async()=>{
  const first=await say('hola');await say('sí');let r=await say('',first.content.choices[0].id);assert.match(r.content.text,/venció/);
  clock+=16*60000;r=await say('',r.content.choices[0].id);assert.match(r.content.text,/venció/);
  const old=await receive({text:'cancelar',at:clock-60000});await worker.process(old.key);assert.equal((await db.doc(`whatsappBotJobs/${old.key}`).get()).data().code,'out-of-order');
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,0);
});
test('two authorized subjects competing for one slot: one winner, adjacency free',async()=>{
  await say('hola');await say('hola','',{from:phone2});
  const input={startDate:'2030-01-08',startTime:'09:00',durationMinutes:60,patientName:'Ficticio'};
  const results=await Promise.allSettled([channel,{...channel,subject:subject2}].map((c,i)=>appointments.perform('create',c,uid,'race'+i,input)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'conflict');
  const slots=await appointments.service.getChannelSlots({channel,doctorUid:uid,date:input.startDate,durationMinutes:60});
  assert.equal(slots.slots.some(s=>s.startTime==='09:00'),false);assert.equal(slots.slots.some(s=>s.startTime==='10:00'),true);
});
test('another sender cannot list or mutate appointment; no forged auth or internal marker',async()=>{
  const id=await book();await say('hola','',{from:phone2});const stranger={...channel,subject:subject2};
  assert.deepEqual(await appointments.list(stranger,uid),[]);
  await assert.rejects(()=>appointments.perform('cancel',stranger,uid,'foreign',{},id),{code:'permission-denied'});
  const service=createAppointmentService({db});
  await assert.rejects(()=>service.createAppointment({channel,doctorUid:uid,requestId:'fake',input:{patientName:'X'}}),{code:'permission-denied'});
  await assert.rejects(()=>service.createAppointment({auth:{uid,token:{}},doctorUid:uid,requestId:'marker',input:{patientName:'X',isVirtualOccurrence:true}}),{code:'invalid-input'});
});
test('failure after persistence before session commit recovers via same receipt',async()=>{
  const r=await review();hooks.afterAction=()=>{throw Error('synthetic-crash');};clock+=1000;
  const request=await receive({choice:r.content.choices[0].id});await worker.process(request.key);
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,1);assert.equal((await db.doc(`whatsappBotJobs/${request.key}`).get()).data().state,'retry');
  delete hooks.afterAction;clock+=60000;await worker.process(request.key);
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,1);assert.equal((await db.collection('auditoria').get()).size,1);
  assert.equal((await db.doc(`whatsappBotJobs/${request.key}`).get()).data().state,'done');
});

test('later input cannot consume a session while a persisted mutation awaits recovery',async()=>{
  const r=await review();hooks.afterAction=()=>{throw Error('synthetic-crash');};clock+=1000;
  const first=await receive({choice:r.content.choices[0].id});await worker.process(first.key);
  delete hooks.afterAction;clock+=1000;const later=await receive({text:'menu'});await worker.process(later.key);
  assert.equal((await db.doc(`whatsappBotJobs/${later.key}`).get()).data().state,'retry');
  clock+=60000;await worker.process(first.key);await worker.process(later.key);
  assert.equal((await db.doc(`whatsappBotJobs/${first.key}`).get()).data().state,'done');
  assert.equal((await db.doc(`whatsappBotJobs/${later.key}`).get()).data().state,'done');
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,1);
  assert.equal((await db.collection('auditoria').get()).size,1);
});

test('failure before mutation retries safely; stale sending is uncertain without resend',async()=>{
  const r=await review();const original=appointments.perform;appointments.perform=()=>{throw Error('synthetic-unavailable');};
  clock+=1000;const incoming=await receive({choice:r.content.choices[0].id});await worker.process(incoming.key);
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,0);
  appointments.perform=original;clock+=60000;await worker.process(incoming.key);
  assert.equal((await db.collection(`usuarios/${uid}/agenda`).get()).size,1);
  const out=hash('out:'+incoming.key);await db.doc(`whatsappBotJobs/${out}`).update({state:'sending',dueAt:clock-1});
  await db.doc(`whatsappBotOutbox/${out}`).update({state:'sending'});await worker.process(out);
  assert.equal((await db.doc(`whatsappBotOutbox/${out}`).get()).data().state,'uncertain');assert.equal(sent.length,0);
});

test('KMS/persistence failure before ACK returns 503 without technical receipt or work',async()=>{
  const failing=createWebhookHandler({getVerifyToken:()=>'',getAppSecret:()=>signing,recordEvents:createEventStore({db,prepareWork:async()=>{throw Error('kms-unavailable');}}),logger:{info(){}},now});
  const original=handler;handler=failing;
  assert.equal((await receive({text:'hola'})).code,503);handler=original;
  assert.equal((await db.collection('whatsappWebhookEvents').get()).size,0);assert.equal((await db.collection('whatsappBotJobs').get()).size,0);
});

test('delivery status is monotonic, never restarts conversation',async()=>{
  const r=await say('hola');await worker.process(r.out);
  for(const [i,status] of ['delivered','sent','read','failed'].entries()){
    const id='status'+i, encrypted=await cipher.seal({correlation:r.out,messageId:'wamid.out1',status},id);
    await db.doc(`whatsappBotJobs/${id}`).set({kind:'status',state:'pending',encrypted,...ids,dueAt:clock,attempts:0,expiresAt:Timestamp.fromMillis(clock+86400000)});
    await worker.process(id);
  }
  assert.equal((await db.doc(`whatsappBotOutbox/${r.out}`).get()).data().state,'read');
  assert.equal((await db.collection('whatsappBotOutbox').get()).size,1);assert.equal(sent.length,1);
});

test('quiet hours defer reminder; verified template status is reported by real settings handler',async()=>{
  await book();const j=await reminder();await db.doc(`whatsappBotProfessionals/${uid}`).update({'reminders.startHour':20,'reminders.endHour':22});
  await worker.process(j.id);assert.equal((await j.ref.get()).data().state,'pending');assert.equal(sent.length,0);
  const call=createSettings({db,identityKey:()=>identity,transport:{templateStatus:async()=> 'REJECTED'}});
  assert.equal((await call({auth:{uid,token:{}},data:{action:'checkTemplate'}})).templateStatus,'REJECTED');
});
test('lost send acknowledgement becomes uncertain and is not resent',async()=>{
  const r=await say('hola');hooks.afterSend=()=>{throw Error('lost-ack');};await worker.process(r.out);
  assert.equal(sent.length,1);assert.equal((await db.doc(`whatsappBotOutbox/${r.out}`).get()).data().state,'uncertain');
  clock+=360000;await worker.process(r.out);assert.equal(sent.length,1);
});
test('accepted is not delivered; repeated send trigger does not resend',async()=>{
  const r=await say('hola');await worker.process(r.out);await worker.process(r.out);
  assert.equal(sent.length,1);assert.equal((await db.doc(`whatsappBotOutbox/${r.out}`).get()).data().state,'accepted');
});
async function reminder() {const snapshot=await db.collection('whatsappBotJobs').where('kind','==','reminder').get();assert.ok(snapshot.size);const j=snapshot.docs[0];clock=Math.max(clock,j.data().dueAt);return j;}
test('consented reminder within window sends; cancel between enqueue and send prevents it',async()=>{
  const id=await book(),j=await reminder();await worker.process(j.id);const out=hash('out:'+j.id);
  assert.ok((await db.doc(`whatsappBotOutbox/${out}`).get()).exists);
  await appointments.perform('cancel',channel,uid,'cancel-reminder',{},id);await worker.process(out);assert.equal(sent.length,0);assert.equal((await db.doc(`whatsappBotJobs/${out}`).get()).data().state,'cancelled');
});
test('reprogrammed reminder invalidates old interval, opt-out prevents pending send',async()=>{
  const id=await book();const old=await reminder();await appointments.perform('reschedule',channel,uid,'move-reminder',{startDate:'2030-01-09',endDate:'2030-01-09',startTime:'10:00',durationMinutes:60},id);
  await worker.process(old.id);assert.equal((await old.ref.get()).data().state,'cancelled');
  await say('dejar de recibir recordatorios');assert.equal((await db.doc(`whatsappBotRecipients/${subject}`).get()).data().optOut,true);
  const pending=(await db.collection('whatsappBotJobs').where('kind','==','reminder').get()).docs.find(x=>x.id!==old.id);clock=pending.data().dueAt;await worker.process(pending.id);assert.equal((await pending.ref.get()).data().state,'cancelled');
});
for(const status of ['MISSING','REJECTED','PAUSED'])test(`outside window: template ${status} is blocked, never free text`,async()=>{
  await book('2030-01-10');const j=await reminder();templateStatus=status;await worker.process(j.id);assert.equal((await j.ref.get()).data().state,'blocked');assert.equal((await db.doc(`whatsappBotOutbox/${hash('out:'+j.id)}`).get()).exists,false);
});
test('outside window with approved template uses real transport contract',async()=>{
  await book('2030-01-10');const j=await reminder();await worker.process(j.id);await worker.process(hash('out:'+j.id));assert.equal(sent.length,1);assert.equal(sent[0].content.template.name,'cita_recordatorio');
});
test('payment-required cannot reserve or confirm unpaid appointment',async()=>{
  const id=await book();await db.doc(`appointmentControls/${uid}`).update({'policy.payment':{required:true,type:'full',amount:100,currency:'MXN'}});
  await assert.rejects(()=>appointments.service.getChannelSlots({channel,doctorUid:uid,date:'2030-01-09',durationMinutes:60}),{code:'payment-not-configured'});
  await db.doc(`usuarios/${uid}/agenda/${id}`).update({'payment.required':true,'payment.status':'pending'});
  await assert.rejects(()=>appointments.perform('confirm',channel,uid,'unpaid',{},id));
});
test('real civil query, blocks, vacations, missing occupancy source fail closed',async()=>{
  await say('hola');const ref=db.doc(`usuarios/${uid}/agenda/block`);
  for(const type of ['block','vacation']){await ref.set({type,startDate:'2030-01-08',endDate:'2030-01-08',allDay:true});const r=await appointments.service.getChannelSlots({channel,doctorUid:uid,date:'2030-01-08',durationMinutes:60});assert.deepEqual(r.slots,[]);}
  const q=await db.collection(`usuarios/${uid}/agenda`).where('startDate','<=','2030-01-09').where('endDate','>=','2030-01-07').orderBy('startDate').orderBy('endDate').get();assert.equal(q.size,1);
  await ref.set({type:'block',startDate:'2030-01-08',endDate:'2030-01-08',startTime:'invalid'});
  const r=await appointments.service.getChannelSlots({channel,doctorUid:uid,date:'2030-01-08',durationMinutes:60});assert.equal(r.available,false);
});
test('server-only Rules deny reads and writes even authenticated professional',async()=>{
  const client=env.authenticatedContext(uid).firestore();
  for(const name of ['Config','Professionals','Jobs','Sessions','Recipients','Bindings','Outbox','MessageIds','Rate','AppointmentOwners']){
    await assertFails(getDoc(doc(client,`whatsappBot${name}/test`)));await assertFails(setDoc(doc(client,`whatsappBot${name}/test`),{enabled:true}));
  }
});
test('settings persists real configuration and stop; rejects missing auth and admin escalation',async()=>{
  const call=createSettings({db,identityKey:()=>identity}),auth={uid,token:{}};
  await assert.rejects(()=>call({data:{action:'get'}}),{code:'unauthenticated'});
  await assert.rejects(()=>call({auth,data:{action:'configureChannel',channel:{}}}),{code:'permission-denied'});
  const first=await call({auth,data:{action:'get'}});const settings={...first.settings,label:'Nombre actualizado'};
  const saved=await call({auth,data:{action:'save',settings}});assert.equal(saved.settings.label,'Nombre actualizado');
  const stopped=await call({auth,data:{action:'stop'}});assert.equal(stopped.settings.enabled,false);
});

test('admin verifies and idempotently reconciles only an exact pilot channel without disclosing identities',async()=>{
  await db.doc(`usuarios/${uid}`).set({rol:'admin',cedulaProfesional:'synthetic'});
  await db.doc('whatsappBotConfig/channel').set({...ids,enabled:true,pilot:true,graphVersion:'v23.0',professionalIds:[uid],allowedSubjects:[subject]});
  await db.doc(`appointmentControls/${uid}`).delete();
  await db.doc(`whatsappBotProfessionals/${uid}`).delete();
  const call=createSettings({db,identityKey:()=>identity}),auth={uid,token:{}};
  const expected={professionalUid:uid,pilotPhone:phone,phoneNumberId:ids.phoneNumberId,wabaId:ids.wabaId,graphVersion:'v23.0'};
  const availability={timeZone:'America/Mexico_City',bookingEnabled:true,weeklySchedule:Object.fromEntries(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(day=>[day,[{start:'00:00',end:'23:59'}]]))};
  const service={id:'consulta_qa',label:'Consulta QA',durationMinutes:60};
  await assert.rejects(()=>call({data:{action:'verifyExpectedChannel',expected}}),{code:'unauthenticated'});
  await db.doc(`usuarios/${uid}`).set({rol:'medico',roles:['medico']}, {merge:true});
  await assert.rejects(()=>call({auth,data:{action:'verifyExpectedChannel',expected}}),{code:'permission-denied'});
  await assert.rejects(()=>call({auth,data:{action:'reconcilePilot',expected,availability,service}}),{code:'permission-denied'});
  await db.doc(`usuarios/${uid}`).set({rol:'admin',cedulaProfesional:'synthetic'});
  await assert.rejects(()=>call({auth,data:{action:'reconcilePilot',expected:{...expected,professionalUid:'other_doctor'},availability,service}}),{code:'permission-denied'});
  const verified=await call({auth,data:{action:'verifyExpectedChannel',expected}});
  assert.equal(verified.matchesExpectedChannel,true);assert.equal(verified.authorizedRecipientCount,1);
  assert.doesNotMatch(JSON.stringify(verified),new RegExp(`${phone}|${ids.phoneNumberId}|${ids.wabaId}|${subject}`));
  for(const mismatch of [{...expected,wabaId:'1111111111'},{...expected,phoneNumberId:'1111111111'}]){
    const result=await call({auth,data:{action:'verifyExpectedChannel',expected:mismatch}});assert.equal(result.conflictingConfiguration,true);assert.equal(result.matchesExpectedChannel,false);
  }
  await db.doc('whatsappBotConfig/channel').update({professionalIds:[uid,'another_doctor']});
  assert.equal((await call({auth,data:{action:'verifyExpectedChannel',expected}})).conflictingConfiguration,true);
  await db.doc('whatsappBotConfig/channel').update({professionalIds:[uid],allowedSubjects:[subject,subject2]});
  assert.equal((await call({auth,data:{action:'verifyExpectedChannel',expected}})).conflictingConfiguration,true);
  await db.doc('whatsappBotConfig/channel').update({allowedSubjects:[subject],enabled:false});
  const first=await call({auth,data:{action:'reconcilePilot',expected,availability,service}});
  assert.equal(first.reconciled,true);assert.equal(first.remindersEnabled,false);assert.equal(first.paymentsEnabled,false);
  assert.equal((await db.doc('whatsappBotConfig/channel').get()).data().enabled,true);
  const control=(await db.doc(`appointmentControls/${uid}`).get()).data();
  assert.equal(control.policy.bookingEnabled,true);assert.equal(control.policy.timeZone,'America/Mexico_City');
  const professional=(await db.doc(`whatsappBotProfessionals/${uid}`).get()).data();
  assert.deepEqual(professional.services,[service]);assert.equal(professional.enabled,true);assert.equal(professional.reminders.enabled,false);
  const second=await call({auth,data:{action:'reconcilePilot',expected,availability,service}});
  assert.equal(second.reconciled,true);assert.equal((await db.doc('whatsappBotConfig/channel').get()).data().allowedSubjects.length,1);assert.equal((await db.doc('whatsappBotConfig/channel').get()).data().professionalIds.length,1);
});

test('existing appointment requires explicit professional binding; later consent schedules once',async()=>{
  const service=createAppointmentService({db,timestamp:()=>Timestamp.fromMillis(clock)});
  const {appointmentId}=await service.createAppointment({auth:{uid,token:{}},doctorUid:uid,requestId:'web-created',input:{startDate:'2030-01-10',startTime:'09:00',durationMinutes:60,patientName:'Ficticio'}});
  await say('hola');assert.deepEqual(await appointments.list(channel,uid),[]);
  const call=createSettings({db,identityKey:()=>identity});
  await call({auth:{uid,token:{}},data:{action:'linkAppointment',phone,appointmentId,confirm:true}});
  assert.equal((await appointments.list(channel,uid))[0].id,appointmentId);
  let r=await say('recordatorios');await choose(r,'Autorizar');r=await say('recordatorios');await choose(r,'Autorizar');
  assert.equal((await db.collection('whatsappBotJobs').where('kind','==','reminder').get()).size,1);
});
test('ciphertext bound to purpose cannot decrypt in another session',async()=>{
  const encrypted=await cipher.seal({name:'Synthetic'},'first');await assert.rejects(()=>cipher.open(encrypted,'second'));
});
