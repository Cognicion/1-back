const { defineSecret, defineString } = require('firebase-functions/params');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { Timestamp } = require('firebase-admin/firestore');
const { createKmsCipher } = require('./crypto');
const { createWorkPreparer } = require('./ingress');
const { createTransport } = require('./transport');
const { createWorker } = require('./worker');
const { createSettings } = require('./settings');
const { channelReady, hash } = require('./config');
const IDENTITY = defineSecret('WHATSAPP_IDENTITY_KEY');
const ACCESS = defineSecret('WHATSAPP_ACCESS_TOKEN');
const KMS_KEY = defineString('GOOGLE_CALENDAR_KMS_KEY_NAME', { default:'' });
function createBotRuntime({db,credential}) {
  const cipher=createKmsCipher({credential,keyName:()=>KMS_KEY.value()});
  const prepareWork=createWorkPreparer({db,cipher,identityKey:()=>IDENTITY.value()});
  let promise;
  const worker=()=>promise||=(import('./appointments.mjs').then(({createChannelAppointments})=>createWorker({db,cipher,appointments:createChannelAppointments({db}),transport:createTransport({accessToken:()=>ACCESS.value()})})));
  // Runtime region differs from the database region. Firebase resolves the
  // Firestore Eventarc trigger location from the database during deployment.
  const options={region:'us-central1',secrets:[ACCESS],timeoutSeconds:120,memory:'256MiB',maxInstances:2};
  return {
    prepareWork, ingressSecrets:[IDENTITY],
    exports:{
      configureWhatsAppBot:onCall({region:'us-central1',secrets:[IDENTITY,ACCESS],timeoutSeconds:30},async request=>{
        try{return await createSettings({db,identityKey:()=>IDENTITY.value(),transport:createTransport({accessToken:()=>ACCESS.value()})})(request);}catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('internal','Configuración no disponible.');}
      }),
      whatsappBotWorkCreated:onDocumentCreated({...options,document:'whatsappBotJobs/{jobId}',retry:true},async event=>{await (await worker()).process(event.params.jobId);}),
      whatsappBotDrain:onSchedule({...options,schedule:'every 1 minutes',timeZone:'UTC'},async()=>{await (await worker()).runDue();}),
      whatsappBotAppointmentChanged:onDocumentWritten({...options,document:'usuarios/{doctorUid}/agenda/{appointmentId}',retry:true},async event=>{
        const c=(await db.doc('whatsappBotConfig/channel').get()).data();if(!channelReady(c))return;
        const {doctorUid,appointmentId}=event.params;
        const a=(await db.doc(`usuarios/${doctorUid}/agenda/${appointmentId}`).get()).data();
        if(a?.status!=='programada'||!a.startAt||a.recurrence)return;
        const owner=(await db.doc(`whatsappBotAppointmentOwners/${hash(doctorUid+':'+appointmentId)}`).get()).data();
        const p=(await db.doc(`whatsappBotProfessionals/${doctorUid}`).get()).data();
        if(!owner||!p?.enabled||!p.reminders?.enabled)return;
        const startAt=a.startAt.toMillis(), key=hash(`reminder:${owner.subject}:${appointmentId}:${startAt}`);
        await db.runTransaction(async tx=>{const ref=db.doc(`whatsappBotJobs/${key}`);if((await tx.get(ref)).exists)return;tx.create(ref,{kind:'reminder',state:'pending',subject:owner.subject,doctorUid,appointmentId,expectedStart:startAt,phoneNumberId:c.phoneNumberId,wabaId:c.wabaId,dueAt:Math.max(Date.now(),startAt-p.reminders.advanceMinutes*60000),attempts:0,expiresAt:Timestamp.fromMillis(startAt+30*86400000)});});
      })
    }
  };
}
module.exports={createBotRuntime};
