const { HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = require('firebase-admin/firestore');
const { isProfessional, isAdmin } = require('../clinicalAnalytics/access');
const { channelReady, professionalReady, directoryEntryReady, isPilotChannel, channelAllowsSubject, channelAllowsProfessional, slugReady, subjectId, safeId, hash } = require('./config');
const reject = code => { throw new HttpsError(code, 'No se pudo aplicar la configuración del canal.'); };
const appointmentDomain = import('../appointments/domain.mjs');
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function expectedPilot(value = {}) {
  const { professionalUid, pilotPhone, phoneNumberId, wabaId, graphVersion } = value;
  if (!safeId(professionalUid) || !/^\d{8,15}$/.test(pilotPhone || '') || !/^\d{5,30}$/.test(phoneNumberId || '') || !/^\d{5,30}$/.test(wabaId || '') || !/^v\d{2}\.0$/.test(graphVersion || '')) reject('invalid-argument');
  return { professionalUid, pilotPhone, phoneNumberId, wabaId, graphVersion };
}

function expectedService(value = {}) {
  if (Object.keys(value).some(key=>!['id','label','durationMinutes','modality'].includes(key)) || !safeId(value.id) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 24 || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 5 || value.durationMinutes > 480) reject('invalid-argument');
  if(value.modality!==undefined && (typeof value.modality!=='string'||!value.modality.trim()||value.modality.length>40))reject('invalid-argument');
  return { id: value.id, label: value.label.trim(), durationMinutes: value.durationMinutes, ...(value.modality?{modality:value.modality.trim()}:{}) };
}

function expectedProfessionalSettings(value = {}, pilot = false) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['enabled','label','displayName','specialty','slug','aliases','services','location','acceptsNewPatients','reminders'].includes(key)))reject('invalid-argument');
  const reminders=value.reminders||{};
  if(typeof value.enabled!=='boolean'||typeof value.label!=='string'||!value.label.trim()||value.label.length>24||!Array.isArray(value.services))reject('invalid-argument');
  const services=value.services.map(expectedService);
  if(typeof reminders.enabled!=='boolean'||!Number.isInteger(reminders.advanceMinutes)||reminders.advanceMinutes<5||reminders.advanceMinutes>10080||!Number.isInteger(reminders.startHour)||!Number.isInteger(reminders.endHour)||reminders.startHour<0||reminders.endHour>24||reminders.startHour>=reminders.endHour||typeof reminders.onlyUnconfirmed!=='boolean')reject('invalid-argument');
  if(reminders.template && (!/^[a-z0-9_]{1,128}$/.test(reminders.template.name)||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(reminders.template.language)))reject('invalid-argument');
  const aliases=Array.isArray(value.aliases)?[...new Set(value.aliases.map(alias=>typeof alias==='string'?alias.trim():'').filter(Boolean))]:[];
  const candidate={enabled:value.enabled,label:value.label.trim(),displayName:typeof value.displayName==='string'?value.displayName.trim():value.label.trim(),specialty:typeof value.specialty==='string'?value.specialty.trim():'',slug:typeof value.slug==='string'?value.slug.trim().toLowerCase():'',aliases,services,location:typeof value.location==='string'?value.location.trim():'',acceptsNewPatients:value.acceptsNewPatients!==false,reminders:{enabled:reminders.enabled,advanceMinutes:reminders.advanceMinutes,startHour:reminders.startHour,endHour:reminders.endHour,onlyUnconfirmed:reminders.onlyUnconfirmed,template:reminders.template?{name:reminders.template.name,language:reminders.template.language}:null}};
  if(candidate.displayName.length>80||candidate.specialty.length>80||candidate.location.length>160||aliases.length>12||aliases.some(alias=>alias.length>80))reject('invalid-argument');
  if(!professionalReady({...candidate,enabled:true})||(!pilot&&value.enabled&&(!slugReady(candidate.slug)||!directoryEntryReady(candidate))))reject('invalid-argument');
  return candidate;
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

function createSettings({db,identityKey,transport,cipher=null}) {
  return async request => {
    const uid=request.auth?.uid;
    if(!uid)reject('unauthenticated');
    const profile=(await db.doc(`usuarios/${uid}`).get()).data();
    if(!profile || !(isProfessional(profile)||isAdmin(profile,request.auth)) || (await db.doc(`accountDeletionTombstones/${uid}`).get()).exists)reject('permission-denied');
    const admin=isAdmin(profile,request.auth), data=request.data||{};
    const ref=db.doc(`whatsappBotProfessionals/${uid}`), channelRef=db.doc('whatsappBotConfig/channel');
    let channel=(await channelRef.get()).data()||{};
    let templateStatus='not_checked';
    if(data.action==='listHandoffs') {
      if(!admin||!cipher)reject('permission-denied');
      const snapshot=await db.collection('whatsappBotRecipients').where('handoff.active','==',true).limit(51).get();
      if(snapshot.size>50)reject('resource-exhausted');
      const tickets=[];
      for(const document of snapshot.docs) {
        const recipient=document.data()||{};
        let numberSuffix=null;
        try { const opened=await cipher.open(recipient.phone,document.id);numberSuffix=String(opened.phone||'').slice(-4)||null; } catch {}
        tickets.push({subject:document.id,reason:['user-request','clinical-request','emergency-signal'].includes(recipient.handoff?.reason)?recipient.handoff.reason:'unspecified',requestedAt:recipient.handoff?.requestedAt?.toMillis?.()||null,numberSuffix});
      }
      return {tickets:tickets.sort((left,right)=>(left.requestedAt||0)-(right.requestedAt||0))};
    }
    if(data.action==='checkTemplate') {
      const p=(await ref.get()).data(), t=p?.reminders?.template;
      templateStatus=t && channelReady(channel) && transport ? await transport.templateStatus(channel,t.name,t.language) : 'NOT_CONFIGURED';
    } else if(data.action==='stopChannel') {
      if(!admin)reject('permission-denied');
      await channelRef.set({enabled:false},{merge:true}); channel.enabled=false;
    } else if(data.action==='stop') {await ref.set({enabled:false},{merge:true});}
    else if(data.action==='save') {
      const x=expectedProfessionalSettings(data.settings||{},isPilotChannel(channel));
      if(x.enabled && (!channelReady(channel)||!channelAllowsProfessional(channel,uid)))reject('failed-precondition');
      const control=(await db.doc(`appointmentControls/${uid}`).get()).data();
      if(x.enabled && (control?.policy?.payment?.required || control?.policy?.bookingEnabled!==true || !control?.policy?.timeZone))reject('failed-precondition');
      if(x.slug) {
        const sameSlug=await db.collection('whatsappBotProfessionals').where('slug','==',x.slug).limit(2).get();
        if(sameSlug.docs.some(doc=>doc.id!==uid&&doc.data()?.enabled===true))reject('already-exists');
      }
      await ref.set({...x,updatedAt:Timestamp.now()});
    } else if(data.action==='configureChannel') {
      if(!admin)reject('permission-denied');
      const x=data.channel||{};
      if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(key=>!['enabled','mode','wabaId','phoneNumberId','graphVersion','officialNumberSuffix','professionalIds','allowedPhones'].includes(key))||typeof x.enabled!=='boolean'||!/^\d{5,30}$/.test(x.phoneNumberId||'')||!/^\d{5,30}$/.test(x.wabaId||'')||!/^v\d{2}\.0$/.test(x.graphVersion||''))reject('invalid-argument');
      const mode=x.mode==='production'?'production':x.mode==='pilot'?'pilot':null;
      if(!mode)reject('invalid-argument');
      if(mode==='pilot') {
        if(!Array.isArray(x.professionalIds)||!Array.isArray(x.allowedPhones)||x.allowedPhones.length<1||x.allowedPhones.length>10||x.allowedPhones.some(p=>!/^\d{8,15}$/.test(p)))reject('invalid-argument');
        channel={enabled:x.enabled,mode:'pilot',pilot:true,wabaId:x.wabaId,phoneNumberId:x.phoneNumberId,graphVersion:x.graphVersion,professionalIds:x.professionalIds,allowedSubjects:x.allowedPhones.map(p=>subjectId(identityKey(),x.phoneNumberId,p))};
        if(x.enabled&&!channelReady(channel))reject('invalid-argument');
      } else {
        if(!/^\d{4}$/.test(x.officialNumberSuffix||'')||!transport?.inspectChannel)reject('invalid-argument');
        const inspected=await transport.inspectChannel(x);
        if(!inspected.verified||inspected.numberSuffix!==x.officialNumberSuffix)reject('failed-precondition');
        channel={enabled:x.enabled,mode:'production',pilot:false,wabaId:x.wabaId,phoneNumberId:x.phoneNumberId,graphVersion:x.graphVersion,officialNumberSuffix:x.officialNumberSuffix,assetVerified:true,assetVerifiedAt:Timestamp.now(),verifiedName:inspected.verifiedName||'',qualityRating:inspected.qualityRating||'UNKNOWN',platformType:inspected.platformType||'UNKNOWN',phoneStatus:inspected.phoneStatus||'UNKNOWN',subscribed:inspected.subscribed===true};
        if(x.enabled&&!channelReady(channel))reject('failed-precondition');
      }
      await channelRef.set(channel);
    } else if(data.action==='inspectChannel') {
      if(!admin||!transport?.inspectChannel)reject('permission-denied');
      const target=data.channel||channel;
      const inspected=await transport.inspectChannel(target);
      return {verified:inspected.verified===true,code:inspected.code||'UNKNOWN',numberSuffix:inspected.numberSuffix||null,verifiedName:inspected.verifiedName||null,qualityRating:inspected.qualityRating||'UNKNOWN',platformType:inspected.platformType||'UNKNOWN',phoneStatus:inspected.phoneStatus||'UNKNOWN',accountReviewStatus:inspected.accountReviewStatus||'UNKNOWN',businessVerificationStatus:inspected.businessVerificationStatus||'UNKNOWN',subscribed:inspected.subscribed===true};
    } else if(data.action==='subscribeChannel') {
      if(!admin||data.confirm!=='SUBSCRIBE_OFFICIAL_CHANNEL'||!transport?.inspectChannel||!transport?.subscribeApp)reject('permission-denied');
      const inspected=await transport.inspectChannel(channel);
      if(channel.mode!=='production'||channel.pilot!==false||!/^\d{5,30}$/.test(channel.phoneNumberId||'')||!/^\d{5,30}$/.test(channel.wabaId||'')||!/^v\d{2}\.0$/.test(channel.graphVersion||'')||!inspected.verified||inspected.numberSuffix!==channel.officialNumberSuffix)reject('failed-precondition');
      const subscription=await transport.subscribeApp(channel);
      if(!subscription.ok)reject('unavailable');
      await channelRef.set({subscribed:true,subscribedAt:Timestamp.now()},{merge:true}); channel.subscribed=true;
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
      // Match Appointment Service's own-account authorization: a persisted
      // administrator is accepted even when its sole role is administrative.
      // The admin guard above remains mandatory for this channel operation.
      if(expected.professionalUid!==uid)reject('permission-denied');
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
      const recipient=(await db.doc(`whatsappBotRecipients/${subject}`).get()).data();
      if(!channelAllowsSubject(channel,subject)||(!isPilotChannel(channel)&&recipient?.phoneNumberId!==channel.phoneNumberId)||data.confirm!==true)reject('failed-precondition');
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
    } else if(data.action==='resolveHandoff') {
      if(!admin||!/^[a-f0-9]{64}$/.test(data.subject||'')||data.confirm!==true)reject('permission-denied');
      const recipientRef=db.doc(`whatsappBotRecipients/${data.subject}`), recipient=(await recipientRef.get()).data();
      if(!recipient?.handoff?.active)reject('failed-precondition');
      await recipientRef.set({handoff:{active:false,resolvedAt:Timestamp.now(),resolvedBy:uid}},{merge:true});
    } else if(data.action!=='get')reject('invalid-argument');
    const settings=(await ref.get()).data()||null;
    const pilot=isPilotChannel(channel);
    return {settings,admin,channel:{configured:Boolean(channel.phoneNumberId),enabled:channel.enabled===true,mode:pilot?'pilot':'production',pilot,numberSuffix:channel.officialNumberSuffix||null,assetVerified:channel.assetVerified===true,subscribed:channel.subscribed===true,authorizedRecipientCount:pilot?channel.allowedSubjects?.length||0:null,professionalEnabled:channelAllowsProfessional(channel,uid)&&settings?.enabled===true},payment:'not_configured',templateStatus,externalCalendarBusy:false};
  };
}
module.exports={createSettings};
