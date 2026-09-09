import { createAppointmentService } from '../appointments/service.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Timestamp } = require('firebase-admin/firestore');
const { channelReady, professionalReady, hash, safeId } = require('./config');
const deny = code => { const e = Error(code); e.code = code; throw e; };
export function createChannelAppointments({ db, now = Date.now, externalAvailabilityProvider = null }) {
  const authorizeChannel = async ({ tx, channel, doctorUid, action, appointmentId }) => {
    if (!/^[a-f0-9]{64}$/.test(channel?.subject || '') || !['create','confirm','reschedule','cancel','availability'].includes(action)) deny('permission-denied');
    const c = (await tx.get(db.doc('whatsappBotConfig/channel'))).data();
    const p = (await tx.get(db.doc(`whatsappBotProfessionals/${doctorUid}`))).data();
    const r = (await tx.get(db.doc(`whatsappBotRecipients/${channel.subject}`))).data();
    const profile = (await tx.get(db.doc(`usuarios/${doctorUid}`))).data();
    const deleting = (await tx.get(db.doc(`accountDeletionTombstones/${doctorUid}`))).exists;
    const { isAdmin, isProfessional } = require('../clinicalAnalytics/access');
    // Production channel professionals must retain a clinical role. The
    // explicitly configured QA pilot may also use its persisted administrator
    // identity; channel/professional/recipient bindings below still scope every
    // operation to this one pilot.
    const profileAuthorized = isProfessional(profile) || (c?.pilot === true && isAdmin(profile));
    if (!profile || !profileAuthorized || deleting) deny('permission-denied');
    if (!channelReady(c) || !professionalReady(p) || !c.professionalIds.includes(doctorUid) || !c.allowedSubjects?.includes(channel.subject) || c.phoneNumberId !== channel.phoneNumberId || c.wabaId !== channel.wabaId || !r || r.phoneNumberId !== c.phoneNumberId) deny('permission-denied');
    if (appointmentId) {
      if (!safeId(appointmentId)) deny('permission-denied');
      const binding = (await tx.get(db.doc(`whatsappBotBindings/${channel.subject}/whatsappBotAppointmentBindings/${appointmentId}`))).data();
      if (!binding || binding.doctorUid !== doctorUid || binding.expiresAt.toMillis() <= now()) deny('permission-denied');
    }
    channel.professional = p; channel.recipient = r;
    return { profileAuthorized: true };
  };
  const service = createAppointmentService({ db, timestamp: () => Timestamp.fromMillis(now()), authorizeChannel, externalAvailabilityProvider,
    onChannelMutation({ tx, channel, doctorUid, appointmentId, action, next, previous }) {
      const startAt = next.startAt?.toMillis();
      const expiresAt = Timestamp.fromMillis(Math.max(now(), startAt || now()) + 30 * 86400000);
      tx.set(db.doc(`whatsappBotBindings/${channel.subject}/whatsappBotAppointmentBindings/${appointmentId}`), { doctorUid, appointmentId, expiresAt });
      tx.set(db.doc(`whatsappBotAppointmentOwners/${hash(doctorUid+':'+appointmentId)}`), {subject:channel.subject,expiresAt});
      const reminders = channel.professional.reminders;
      if ((action==='create'||action==='reschedule'&&previous?.startAt?.toMillis()!==startAt) && reminders?.enabled && channel.recipient.consent === true && !channel.recipient.optOut && startAt) {
        const key = hash(`reminder:${channel.subject}:${appointmentId}:${startAt}`);
        tx.set(db.doc(`whatsappBotJobs/${key}`), { kind: 'reminder', state: 'pending', subject: channel.subject, doctorUid, appointmentId, expectedStart: startAt, phoneNumberId: channel.phoneNumberId, wabaId: channel.wabaId, dueAt: Math.max(now(), startAt - reminders.advanceMinutes * 60000), attempts: 0, expiresAt });
      }
    }
  });
  return {
    service,
    async scheduleReminders(channel,doctorUid) {
      const bindings=await db.collection(`whatsappBotBindings/${channel.subject}/whatsappBotAppointmentBindings`).limit(51).get();
      if(bindings.size>50)deny('too-many-appointments');
      for(const b of bindings.docs) {
        if(b.data().doctorUid!==doctorUid||b.data().expiresAt.toMillis()<=now())continue;
        await db.runTransaction(async tx=>{
          await authorizeChannel({tx,channel,doctorUid,action:'availability',appointmentId:b.id});
          const a=(await tx.get(db.doc(`usuarios/${doctorUid}/agenda/${b.id}`))).data();
          const r=channel.professional.reminders,startAt=a?.startAt?.toMillis();
          if(!r?.enabled||!channel.recipient.consent||channel.recipient.optOut||a?.status!=='programada'||a.recurrence||!(startAt>now()))return;
          const key=hash(`reminder:${channel.subject}:${b.id}:${startAt}`),ref=db.doc(`whatsappBotJobs/${key}`);
          if((await tx.get(ref)).exists)return;
          tx.create(ref,{kind:'reminder',state:'pending',subject:channel.subject,doctorUid,appointmentId:b.id,expectedStart:startAt,phoneNumberId:channel.phoneNumberId,wabaId:channel.wabaId,dueAt:Math.max(now(),startAt-r.advanceMinutes*60000),attempts:0,expiresAt:Timestamp.fromMillis(startAt+30*86400000)});
        });
      }
    },
    async list(channel, doctorUid) {
      return db.runTransaction(async tx => {
        await authorizeChannel({ tx, channel, doctorUid, action: 'availability' });
        const refs = await tx.get(db.collection(`whatsappBotBindings/${channel.subject}/whatsappBotAppointmentBindings`).limit(51));
        if (refs.size > 50) deny('too-many-appointments');
        const result = [];
        for (const ref of refs.docs) {
          const b = ref.data();
          if (b.doctorUid !== doctorUid || b.expiresAt.toMillis() <= now()) continue;
          const doc = await tx.get(db.doc(`usuarios/${doctorUid}/agenda/${ref.id}`));
          const d = doc.data();
          if (d?.type === 'appointment' && d.status === 'programada' && !d.recurrence && d.startAt?.toMillis() > now()) result.push({ id: ref.id, startDate: d.startDate, startTime: d.startTime, durationMinutes: d.durationMinutes, timeZone: d.timeZone, confirmation: d.confirmation?.status });
        }
        return result.sort((a,b) => (a.startDate+a.startTime).localeCompare(b.startDate+b.startTime)).slice(0,10);
      });
    },
    async perform(action, channel, doctorUid, requestId, input, appointmentId) {
      const methods = { create: 'createAppointment', confirm: 'confirmAppointment', cancel: 'cancelAppointment', reschedule: 'rescheduleAppointment' };
      if (!methods[action]) deny('permission-denied');
      return service[methods[action]]({ channel, doctorUid, requestId, input, appointmentId });
    }
  };
}
