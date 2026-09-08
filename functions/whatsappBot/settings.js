const { HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = require('firebase-admin/firestore');
const { isProfessional, isAdmin } = require('../clinicalAnalytics/access');
const { channelReady, professionalReady, subjectId, safeId, hash } = require('./config');
const reject = code => { throw new HttpsError(code, 'No se pudo aplicar la configuración del canal.'); };
const appointmentDomain = import('../appointments/domain.mjs');
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function expectedPilot(value = {}) {
  const { professionalUid, pilotPhone, phoneNumberId, wabaId, graphVersion } = value;
  if (!safeId(professionalUid) || !/^\d{8,15}$/.test(pilotPhone || '') || !/^\d{5,30}$/.test(phoneNumberId || '') || !/^\d{5,30}$/.test(wabaId || '') || !/^v\d{2}\.0$/.test(graphVersion || '')) reject('invalid-argument');
  return { professionalUid, pilotPhone, phoneNumberId, wabaId, graphVersion };
}

function expectedService(value = {}) {
  if (!safeId(value.id) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 24 || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 5 || value.durationMinutes > 480) reject('invalid-argument');
  return { id: value.id, label: value.label.trim(), durationMinutes: value.durationMinutes };
}

function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function channelVerification(channel = {}, expected, identityKey) {
  const allowedSubjects = Array.isArray(channel.allowedSubjects) ? channel.allowedSubjects : [];
  const professionalIds = Array.isArray(channel.professionalIds) ? channel.professionalIds : [];
  const expectedSubject = subjectId(identityKey(), expected.phoneNumberId, expected.pilotPhone);
  const phoneNumberMatches = channel.phoneNumberId === expected.phoneNumberId;
  const wabaMatches = channel.wabaId === expected.wabaId;
  const graphVersionMatches = channel.graphVersion === expected.graphVersion;
  const expectedProfessionalIncluded = professionalIds.includes(expected.professionalUid);
  const onlyExpectedProfessional = expectedProfessionalIncluded && professionalIds.length === 1;
  const expectedRecipientIncluded = allowedSubjects.includes(expectedSubject);
  const onlyExpectedRecipient = expectedRecipientIncluded && allowedSubjects.length === 1;
  const configured = Boolean(channel.phoneNumberId);
  const matchesExpectedChannel = configured && phoneNumberMatches && wabaMatches && graphVersionMatches && channel.pilot === true && onlyExpectedProfessional && onlyExpectedRecipient;
  return {
    configured,
    matchesExpectedChannel,
    conflictingConfiguration: configured && !matchesExpectedChannel,
    expectedProfessionalIncluded,
    onlyExpectedProfessional,
    expectedRecipientIncluded,
    authorizedRecipientCount: allowedSubjects.length,
    phoneNumberMatches,
    wabaMatches,
    graphVersionMatches,
    pilot: channel.pilot === true,
    enabled: channel.enabled === true
  };
}

function pilotAvailability(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['timeZone','weeklySchedule','bookingEnabled','slotDurationMinutes','bufferBeforeMinutes','bufferAfterMinutes','minimumBookingNoticeMinutes','maximumBookingAdvanceDays'].includes(key))) reject('invalid-argument');
  if (value.bookingEnabled !== true || !value.weeklySchedule || typeof value.weeklySchedule !== 'object' || WEEKDAYS.some(day => !Array.isArray(value.weeklySchedule[day]))) reject('invalid-argument');
  return value;
}

function disabledReminders(existing = {}) {
  return {
    enabled: false,
    advanceMinutes: Number.isInteger(existing.advanceMinutes) ? existing.advanceMinutes : 1440,
    startHour: Number.isInteger(existing.startHour) ? existing.startHour : 0,
    endHour: Number.isInteger(existing.endHour) ? existing.endHour : 24,
    onlyUnconfirmed: typeof existing.onlyUnconfirmed === 'boolean' ? existing.onlyUnconfirmed : false,
    template: existing.template || null
  };
}

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
    } else if(data.action==='verifyExpectedChannel') {
      if(!admin)reject('permission-denied');
      const expected=expectedPilot(data.expected);
      return channelVerification(channel,expected,identityKey);
    } else if(data.action==='reconcilePilot') {
      if(!admin)reject('permission-denied');
      const expected=expectedPilot(data.expected);
      // A privileged account may verify a channel, but may only reconcile its own
      // professional settings. This prevents an admin token from becoming a
      // cross-professional configuration primitive.
      if(expected.professionalUid!==uid || !isProfessional(profile))reject('permission-denied');
      const service=expectedService(data.service);
      const rawAvailability=pilotAvailability(data.availability);
      const { normalizeAvailabilitySettings }=await appointmentDomain;
      let availability;
      try { availability=normalizeAvailabilitySettings(rawAvailability,{requireBookable:true}); } catch { reject('invalid-argument'); }
      const controlRef=db.doc(`appointmentControls/${uid}`);
      const professionalRef=db.doc(`whatsappBotProfessionals/${uid}`);
      const result=await db.runTransaction(async tx=>{
        const currentChannel=(await tx.get(channelRef)).data()||{};
        const verification=channelVerification(currentChannel,expected,identityKey);
        if(!verification.matchesExpectedChannel) return {...verification,reconciled:false,availabilityConfigured:false,bookingEnabled:false,timeZone:null,serviceQaEnabled:false,remindersEnabled:false,paymentsEnabled:false};
        const controlSnapshot=await tx.get(controlRef);
        const professionalSnapshot=await tx.get(professionalRef);
        const control=controlSnapshot.exists ? controlSnapshot.data()||{} : null;
        let existingAvailability=null;
        if(control) {
          try { existingAvailability=normalizeAvailabilitySettings(control.policy||{}, {requireBookable:true}); } catch { return {...verification,reconciled:false,availabilityConfigured:false,bookingEnabled:false,timeZone:null,serviceQaEnabled:false,remindersEnabled:false,paymentsEnabled:false,availabilityConfigConflict:true}; }
          if(!sameValue(existingAvailability,availability) || control.enabled!==true || control.policy?.payment?.required===true) return {...verification,reconciled:false,availabilityConfigured:false,bookingEnabled:false,timeZone:null,serviceQaEnabled:false,remindersEnabled:false,paymentsEnabled:false,availabilityConfigConflict:true};
        }
        const professional=professionalSnapshot.exists ? professionalSnapshot.data()||{} : {};
        const services=Array.isArray(professional.services) ? professional.services : [];
        const sameId=services.find(item=>item?.id===service.id);
        if(sameId && !sameValue({id:sameId.id,label:sameId.label,durationMinutes:sameId.durationMinutes},service)) return {...verification,reconciled:false,availabilityConfigured:Boolean(existingAvailability),bookingEnabled:Boolean(existingAvailability?.bookingEnabled),timeZone:existingAvailability?.timeZone||null,serviceQaEnabled:false,remindersEnabled:Boolean(professional.reminders?.enabled),paymentsEnabled:false,professionalConfigConflict:true};
        const nextServices=sameId ? services : [...services,service];
        const now=Timestamp.now();
        // The stored channel identity has already matched exactly. Enabling this
        // existing pilot is safe and does not replace its WABA, phone ID, subject
        // hash, recipient allowlist, or professional allowlist.
        if(currentChannel.enabled!==true) tx.update(channelRef,{enabled:true});
        if(!control) tx.create(controlRef,{enabled:true,revision:1,policy:{availabilityMode:'configured',allowReschedule:true,allowCancellation:true,payment:{required:false,type:'none',amount:null,currency:'MXN'},remindersEnabled:false,...availability},createdAt:now,activatedBy:uid});
        const nextProfessional={enabled:true,label:typeof professional.label==='string'&&professional.label.trim()?professional.label.trim():service.label,services:nextServices,reminders:disabledReminders(professional.reminders),updatedAt:now};
        tx.set(professionalRef,nextProfessional,{merge:true});
        return {...verification,enabled:true,reconciled:true,availabilityConfigured:true,bookingEnabled:true,timeZone:availability.timeZone,serviceQaEnabled:true,remindersEnabled:false,paymentsEnabled:false};
      });
      return result;
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
