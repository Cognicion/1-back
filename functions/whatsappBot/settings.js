const { HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = require('firebase-admin/firestore');
const { isProfessional, isAdmin } = require('../clinicalAnalytics/access');
const { channelReady, professionalReady, subjectId, safeId, hash } = require('./config');
const reject = code => { throw new HttpsError(code, 'No se pudo aplicar la configuración del canal.'); };
function createSettings({db,identityKey,transport}) {
  return async request => {
    const uid=request.auth?.uid;
    if(!uid)reject('unauthenticated');
    const profile=(await db.doc(`usuarios/${uid}`).get()).data();
    if(!profile || !(isProfessional(profile)||isAdmin(profile,request.auth)) || (await db.doc(`accountDeletionTombstones/${uid}`).get()).exists)reject('permission-denied');
    const admin=isAdmin(profile,request.auth), data=request.data||{};
    const ref=db.doc(`whatsappBotProfessionals/${uid}`), channelRef=db.doc('whatsappBotConfig/channel');
    let channel=(await channelRef.get()).data()||{};
    let templateStatus='not_checked';
    if(data.action==='checkTemplate') {
      const p=(await ref.get()).data(), t=p?.reminders?.template;
      templateStatus=t && channelReady(channel) && transport ? await transport.templateStatus(channel,t.name,t.language) : 'NOT_CONFIGURED';
    } else if(data.action==='stopChannel') {
      if(!admin)reject('permission-denied');
      await channelRef.set({enabled:false},{merge:true}); channel.enabled=false;
    } else if(data.action==='stop') {await ref.set({enabled:false},{merge:true});}
    else if(data.action==='save') {
      const x=data.settings||{}, r=x.reminders||{};
      if(Object.keys(x).some(k=>!['enabled','label','services','reminders'].includes(k)) || !professionalReady({...x,enabled:true}) || typeof x.label!=='string'||!x.label.trim()||x.label.length>24 || typeof x.enabled!=='boolean')reject('invalid-argument');
      if(x.enabled && (!channel.professionalIds?.includes(uid)||!channelReady(channel)))reject('failed-precondition');
      if(typeof r.enabled!=='boolean'||!Number.isInteger(r.advanceMinutes)||r.advanceMinutes<5||r.advanceMinutes>10080||!Number.isInteger(r.startHour)||!Number.isInteger(r.endHour)||r.startHour<0||r.endHour>24||r.startHour>=r.endHour||typeof r.onlyUnconfirmed!=='boolean')reject('invalid-argument');
      if(r.template && (!/^[a-z0-9_]{1,128}$/.test(r.template.name)||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(r.template.language)))reject('invalid-argument');
      const services=x.services.map(s=>({id:s.id,label:s.label,durationMinutes:s.durationMinutes}));
      const control=(await db.doc(`appointmentControls/${uid}`).get()).data();
      if(x.enabled && (control?.policy?.payment?.required || control?.policy?.bookingEnabled!==true || !control?.policy?.timeZone))reject('failed-precondition');
      await ref.set({enabled:x.enabled,label:x.label.trim(),services,reminders:{enabled:r.enabled,advanceMinutes:r.advanceMinutes,startHour:r.startHour,endHour:r.endHour,onlyUnconfirmed:r.onlyUnconfirmed,template:r.template?{name:r.template.name,language:r.template.language}:null},updatedAt:Timestamp.now()});
    } else if(data.action==='configureChannel') {
      if(!admin)reject('permission-denied');
      const x=data.channel||{};
      if(!channelReady({...x,enabled:true})||typeof x.enabled!=='boolean'||!Array.isArray(x.allowedPhones)||x.allowedPhones.length>10||x.allowedPhones.some(p=>!/^\d{8,15}$/.test(p)))reject('invalid-argument');
      channel={enabled:x.enabled,pilot:true,wabaId:x.wabaId,phoneNumberId:x.phoneNumberId,graphVersion:x.graphVersion,professionalIds:x.professionalIds,allowedSubjects:x.allowedPhones.map(p=>subjectId(identityKey(),x.phoneNumberId,p))};
      await channelRef.set(channel);
    } else if(data.action==='linkAppointment') {
      if(!safeId(data.appointmentId)||!/^\d{8,15}$/.test(data.phone||'')||!channelReady(channel))reject('invalid-argument');
      const subject=subjectId(identityKey(),channel.phoneNumberId,data.phone);
      if(!channel.allowedSubjects?.includes(subject)||data.confirm!==true)reject('failed-precondition');
      const a=(await db.doc(`usuarios/${uid}/agenda/${data.appointmentId}`).get()).data();
      if(a?.type!=='appointment'||a.recurrence||a.status!=='programada')reject('failed-precondition');
      // Explicit professional authorization to one appointment; never phone search.
      const expiresAt=Timestamp.fromMillis(Math.max(Date.now(),a.startAt?.toMillis()||0)+30*86400000);
      const ownerRef=db.doc(`whatsappBotAppointmentOwners/${hash(uid+':'+data.appointmentId)}`);
      await db.runTransaction(async tx=>{
        const owner=(await tx.get(ownerRef)).data();
        if(owner && owner.subject!==subject)reject('failed-precondition');
        tx.set(db.doc(`whatsappBotBindings/${subject}/whatsappBotAppointmentBindings/${data.appointmentId}`),{doctorUid:uid,appointmentId:data.appointmentId,expiresAt});
        tx.set(ownerRef,{subject,expiresAt});
      });
    } else if(data.action!=='get')reject('invalid-argument');
    const settings=(await ref.get()).data()||null;
    return {settings,admin,channel:{configured:Boolean(channel.phoneNumberId),enabled:channel.enabled===true,pilot:true,authorizedRecipientCount:channel.allowedSubjects?.length||0,professionalEnabled:channel.professionalIds?.includes(uid)||false},payment:'not_configured',templateStatus,externalCalendarBusy:false};
  };
}
module.exports={createSettings};
