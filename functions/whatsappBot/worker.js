const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
const { channelReady, professionalReady, channelAllowsSubject, channelAllowsProfessional, hash } = require('./config');
const { loadDirectory } = require('./directory');
const { transition, fullDate } = require('./machine');
const HOUR = 3600000;
const SEND_PACING_MS = 1000;
const ts = n => Timestamp.fromMillis(n);
const terminal = new Set(['done','expired','blocked','failed','uncertain','cancelled']);
function createWorker({ db, cipher, appointments, transport, now = Date.now, hooks = {} }) {
  const config = async () => (await db.doc('whatsappBotConfig/channel').get()).data();
  const jobRef = id => db.doc(`whatsappBotJobs/${id}`);
  async function finish(id, state, code = null) { await jobRef(id).update({state, code, encrypted:FieldValue.delete()}); }
  async function claim(id) {
    return db.runTransaction(async tx => {
      const ref=jobRef(id), snap=await tx.get(ref), j=snap.data();
      if(!j || terminal.has(j.state) || j.dueAt>now()) return null;
      if(j.expiresAt.toMillis()<=now()) {tx.update(ref,{state:'expired',encrypted:FieldValue.delete()});return null;}
      if(j.state==='sending') {tx.update(ref,{state:'uncertain'});if(j.outboxId)tx.update(db.doc(`whatsappBotOutbox/${j.outboxId}`),{state:'uncertain'});return null;}
      if(j.attempts>=5) {tx.update(ref,{state:'failed',code:'retry-limit'});return null;}
      const lease=randomUUID(); tx.update(ref,{state:'processing',lease,dueAt:now()+300000,attempts:(j.attempts||0)+1});
      return {...j,lease,attempts:(j.attempts||0)+1};
    });
  }
  async function enqueueResponse(tx,id,j,encrypted,meta={}) {
    const out=hash('out:'+id);
    tx.set(db.doc(`whatsappBotOutbox/${out}`),{state:'pending',subject:j.subject,encrypted,phoneNumberId:j.phoneNumberId,wabaId:j.wabaId,expiresAt:ts(now()+86400000),...meta});
    tx.set(jobRef(out),{kind:'send',state:'pending',subject:j.subject,outboxId:out,phoneNumberId:j.phoneNumberId,wabaId:j.wabaId,dueAt:now(),attempts:0,expiresAt:ts(now()+86400000)});
  }
  async function inbound(id,j,c) {
    const message=await cipher.open(j.encrypted,id);
    const ref=db.doc(`whatsappBotSessions/${j.subject}`);
    const recipientRef=db.doc(`whatsappBotRecipients/${j.subject}`);
    const leaseResult=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref); let s=snap.data();
      // Preserve the state that authorized a mutation until that exact job has
      // recovered its transaction receipt and durably committed its response.
      if(s?.pendingJob && s.pendingJob!==id) {
        const pending=(await tx.get(jobRef(s.pendingJob))).data();
        if(pending && !terminal.has(pending.state) && pending.expiresAt.toMillis()>now()) throw Error('session-busy');
        s=null; // failed/expired predecessor: old buttons cannot authorize again
      }
      if(s?.leaseUntil>now() && s.lease!==j.lease) throw Error('session-busy');
      const rateRef=db.doc(`whatsappBotRate/inbound_${j.subject}`), rate=(await tx.get(rateRef)).data()||{};
      const minuteStart=now()-Number(rate.minuteStartedAt||0)<60000?Number(rate.minuteStartedAt):now();
      const day=new Date(now()).toISOString().slice(0,10), sameDay=rate.day===day;
      const minuteCount=(minuteStart===rate.minuteStartedAt?Number(rate.minuteCount||0):0)+1;
      const dayCount=(sameDay?Number(rate.dayCount||0):0)+1;
      if(minuteCount>30||dayCount>500)return {rateLimited:true,session:s};
      tx.set(rateRef,{minuteStartedAt:minuteStart,minuteCount,day,dayCount,expiresAt:ts(now()+2*86400000)});
      tx.set(ref,{...(s||{}),pendingJob:id,lease:j.lease,leaseUntil:now()+300000,expiresAt:ts(now()+HOUR)});
      return {rateLimited:false,session:s};
    });
    if(leaseResult.rateLimited){await finish(id,'blocked','recipient-rate-limit');return;}
    const previous=leaseResult.session;
    try {
      if(previous?.lastAt>message.at) {await finish(id,'done','out-of-order');return;}
      const state = previous?.encrypted && previous.expiresAt.toMillis()>now() ? await cipher.open(previous.encrypted,j.subject) : {};
      const phone=await cipher.seal({phone:message.phone},j.subject);
      await recipientRef.set({phoneNumberId:c.phoneNumberId,phone,lastInboundAt:Math.max(previous?.lastAt||0,message.at),expiresAt:ts(now()+120*86400000)},{merge:true});
      const recipient=(await recipientRef.get()).data();
      const professionals=await loadDirectory({db,channel:c});
      const channel={subject:j.subject,phoneNumberId:c.phoneNumberId,wabaId:c.wabaId};
      const result=await transition({session:state,message,jobId:id,channel:c,recipient,professionals,now:now(),api:{
        list:uid=>appointments.list(channel,uid),
        slots:(uid,date,durationMinutes,excludeId)=>appointments.service.getChannelSlots({channel,doctorUid:uid,date,durationMinutes,excludeId:excludeId||null}),
        consent:async allowed=>{
          await recipientRef.set({consent:allowed,optOut:!allowed,consentAt:ts(now())},{merge:true});
          if(allowed)for(const uid of Object.keys(professionals))if(professionalReady(professionals[uid]))await appointments.scheduleReminders(channel,uid);
        },
        perform:(action,uid,key,input,appointmentId)=>appointments.perform(action,channel,uid,key,input,appointmentId)
      }});
      await hooks.afterAction?.();
      const encrypted=await cipher.seal(result.session,j.subject);
      const out=hash('out:'+id);
      const response=await cipher.seal({phone:message.phone,content:result.content,lastInboundAt:message.at},out);
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data(), work=(await tx.get(jobRef(id))).data();
        const metricReceipt=db.doc(`whatsappBotRate/event_${id}`), metricSeen=(await tx.get(metricReceipt)).exists;
        if(current.lease!==j.lease || work.lease!==j.lease) throw Error('lease-lost');
        tx.set(ref,{encrypted,lastAt:message.at,lease:null,leaseUntil:0,expiresAt:ts(now()+HOUR)});
        if(result.recipientPatch) {
          const patch={...result.recipientPatch};
          if(patch.handoff?.requestedAt)patch.handoff={...patch.handoff,requestedAt:ts(patch.handoff.requestedAt)};
          tx.set(recipientRef,patch,{merge:true});
        }
        if(!metricSeen) {
          const names=[...new Set(['inbound_processed',...(result.events||[])].filter(name=>/^[a-z_]{1,40}$/.test(name)))];
          const increments=Object.fromEntries(names.map(name=>[name,FieldValue.increment(1)]));
          const day=new Date(now()).toISOString().slice(0,10).replaceAll('-','');
          tx.set(db.doc(`whatsappBotRate/metrics_${day}`),{events:increments,updatedAt:ts(now())},{merge:true});
          tx.create(metricReceipt,{events:names,expiresAt:ts(now()+30*86400000)});
        }
        await enqueueResponse(tx,id,j,response,{doctorUid:result.session.doctorUid||null});
        tx.update(jobRef(id),{state:'done',encrypted:FieldValue.delete()});
      });
    } finally {
      await db.runTransaction(async tx=>{const s=(await tx.get(ref)).data(); if(s?.lease===j.lease)tx.update(ref,{lease:null,leaseUntil:0});});
    }
  }
  async function reminderContext(j,c) {
    const p=(await db.doc(`whatsappBotProfessionals/${j.doctorUid}`).get()).data();
    const recipient=(await db.doc(`whatsappBotRecipients/${j.subject}`).get()).data();
    const binding=(await db.doc(`whatsappBotBindings/${j.subject}/whatsappBotAppointmentBindings/${j.appointmentId}`).get()).data();
    const appointment=(await db.doc(`usuarios/${j.doctorUid}/agenda/${j.appointmentId}`).get()).data();
    if(!professionalReady(p)||!p.reminders?.enabled||!recipient?.consent||recipient.optOut||recipient.handoff?.active||binding?.doctorUid!==j.doctorUid||binding.expiresAt.toMillis()<=now()||!channelAllowsProfessional(c,j.doctorUid)||!channelAllowsSubject(c,j.subject)||appointment?.status!=='programada'||appointment.startAt?.toMillis()!==j.expectedStart||j.expectedStart<=now()) return null;
    if(appointment.confirmation?.status==='confirmed' && p.reminders.onlyUnconfirmed) return null;
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:appointment.timeZone,hour:'2-digit',hourCycle:'h23'}).format(now()));
    return {p,recipient,appointment,quiet:hour<p.reminders.startHour||hour>=p.reminders.endHour};
  }
  async function reminder(id,j,c) {
    const ctx=await reminderContext(j,c);
    if(!ctx){await finish(id,'cancelled');return;}
    if(ctx.quiet){await jobRef(id).update({state:'pending',dueAt:now()+HOUR,attempts:0});return;}
    const {p,recipient,appointment}=ctx;
    const text=`Recordatorio de cita: ${fullDate(appointment.startDate,appointment.startTime,appointment.timeZone)}. Escribe menú para gestionar tu cita. Para no recibir recordatorios escribe dejar de recibir recordatorios.`;
    let content={text};
    if(now()-recipient.lastInboundAt>=24*HOUR) {
      const template=p.reminders.template;
      if(!template?.name || !template.language || await transport.templateStatus(c,template.name,template.language)!=='APPROVED') {await finish(id,'blocked','template-not-approved');return;}
      content={template:{name:template.name,language:{code:template.language},components:[{type:'body',parameters:[{type:'text',text:fullDate(appointment.startDate,appointment.startTime,appointment.timeZone)}]}]}};
    }
    const {phone}=await cipher.open(recipient.phone,j.subject), out=hash('out:'+id);
    const encrypted=await cipher.seal({phone,content,lastInboundAt:recipient.lastInboundAt},out);
    await db.runTransaction(async tx=>{
      const work=(await tx.get(jobRef(id))).data(); if(work.lease!==j.lease) throw Error('lease-lost');
      await enqueueResponse(tx,id,j,encrypted,{reminder:{doctorUid:j.doctorUid,appointmentId:j.appointmentId,expectedStart:j.expectedStart}});
      tx.update(jobRef(id),{state:'done'});
    });
  }
  async function send(id,j,c) {
    const ref=db.doc(`whatsappBotOutbox/${j.outboxId}`), out=(await ref.get()).data();
    if(!out || ['accepted','sent','delivered','read','failed','uncertain'].includes(out.state)) {await finish(id,out?.state==='uncertain'?'uncertain':'done');return;}
    if(!channelAllowsSubject(c,j.subject)){await finish(id,'blocked','recipient-not-authorized');return;}
    if(out.doctorUid && (!channelAllowsProfessional(c,out.doctorUid) || !professionalReady((await db.doc(`whatsappBotProfessionals/${out.doctorUid}`).get()).data()))){await finish(id,'blocked','professional-disabled');return;}
    if(out.reminder){const ctx=await reminderContext({...j,...out.reminder},c);if(!ctx){await finish(id,'cancelled');return;}if(ctx.quiet){await jobRef(id).update({state:'pending',dueAt:now()+HOUR,attempts:0});return;}}
    const data=await cipher.open(out.encrypted,j.outboxId);
    if(!data.content.template && now()-data.lastInboundAt>=24*HOUR){await finish(id,'blocked','window-expired');return;}
    if(data.content.template && await transport.templateStatus(c,data.content.template.name,data.content.template.language.code)!=='APPROVED'){await finish(id,'blocked','template-not-approved');return;}
    // Keep conversational pacing transactional, but wait inside this durable
    // trigger invocation. An onCreate trigger cannot rediscover a job merely
    // changed back to pending, and the operational kill switch keeps Scheduler
    // paused during the pilot.
    const sleep=hooks.sleep||((milliseconds)=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
    let allowed=false;
    while(!allowed) {
      const gate=await db.runTransaction(async tx=>{
        const rate=db.doc('whatsappBotRate/channel'), recipientRate=db.doc(`whatsappBotRate/${j.subject}`);
        const a=(await tx.get(rate)).data(), b=(await tx.get(recipientRate)).data();
        const nextAt=Math.max(Number(a?.nextAt||0),Number(b?.nextAt||0));
        if(nextAt>now())return {allowed:false,nextAt};
        tx.set(rate,{nextAt:now()+SEND_PACING_MS});tx.set(recipientRate,{nextAt:now()+SEND_PACING_MS});
        tx.update(jobRef(id),{state:'sending',dueAt:now()+300000});tx.update(ref,{state:'sending'});return {allowed:true,nextAt:0};
      });
      allowed=gate.allowed;
      if(!allowed)await sleep(Math.max(25,gate.nextAt-now()+25));
    }
    await hooks.beforeSend?.();
    const result=await transport.send({channel:c,to:data.phone,content:data.content,correlation:j.outboxId});
    await hooks.afterSend?.();
    await db.runTransaction(async tx=>{
      const current=(await tx.get(ref)).data();
      const delivered=['sent','delivered','read'].includes(current.state);
      tx.update(ref,{state:delivered?current.state:result.state,...(result.messageId?{messageIdHash:hash(result.messageId)}:{}),code:result.code||null});
      if(result.messageId)tx.set(db.doc(`whatsappBotMessageIds/${hash(result.messageId)}`),{outboxId:j.outboxId,expiresAt:ts(now()+7*86400000)});
      tx.update(jobRef(id),{state:result.state==='retry'?'retry':result.state==='uncertain'?'uncertain':'done',dueAt:now()+Math.min(300000,2**j.attempts*10000)});
    });
  }
  async function status(id,j) {
    const data=await cipher.open(j.encrypted,id);
    let outboxId=data.correlation;
    if(!outboxId) outboxId=(await db.doc(`whatsappBotMessageIds/${hash(data.messageId)}`).get()).data()?.outboxId;
    if(!outboxId){await jobRef(id).update({state:'retry',dueAt:now()+10000});return;}
    await db.runTransaction(async tx=>{
      const ref=db.doc(`whatsappBotOutbox/${outboxId}`), d=(await tx.get(ref)).data();
      const rank={pending:0,sending:1,uncertain:1,accepted:2,sent:3,failed:3,delivered:4,read:5};
      if(d && d.phoneNumberId===j.phoneNumberId && d.wabaId===j.wabaId && (!d.messageIdHash||d.messageIdHash===hash(data.messageId)) && (rank[data.status]||0)>(rank[d.state]||0))tx.update(ref,{state:data.status});
      tx.update(jobRef(id),{state:'done',encrypted:FieldValue.delete()});
    });
  }
  async function process(id) {
    const c=await config();
    if(!channelReady(c))return; // kill switch pauses rather than consumes work
    const j=await claim(id);if(!j)return;
    if(j.phoneNumberId!==c.phoneNumberId||j.wabaId!==c.wabaId){await finish(id,'blocked','channel-mismatch');return;}
    try {
      if(j.kind==='inbound')await inbound(id,j,c);
      else if(j.kind==='reminder')await reminder(id,j,c);
      else if(j.kind==='send')await send(id,j,c);
      else if(j.kind==='status')await status(id,j);
      else await finish(id,'blocked','unknown-kind');
    } catch (error) {
      // Never log error objects (could include PHI, URLs or provider bodies).
      const current=(await jobRef(id).get()).data();
      const state=current.state==='sending'?'uncertain':'retry';
      await jobRef(id).update({state,dueAt:now()+Math.min(300000,2**j.attempts*10000),...(error.message==='session-busy'?{attempts:Math.max(0,j.attempts-1)}:{}),code:state==='uncertain'?'send-outcome-unknown':'processing-retry'});
      if(state==='uncertain'&&j.outboxId)await db.doc(`whatsappBotOutbox/${j.outboxId}`).update({state:'uncertain'});
    }
  }
  async function runDue() {
    if(!channelReady(await config()))return;
    const docs=await db.collection('whatsappBotJobs').where('state','in',['pending','retry','processing','sending']).where('dueAt','<=',now()).orderBy('dueAt').limit(40).get();
    for(const doc of docs.docs)await process(doc.id);
  }
  return {process,runDue,reminderContext};
}
module.exports={createWorker};
