import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createAppointmentService } from "../appointments/service.mjs";
const require = createRequire(import.meta.url);
const { validSlug, publicProfile } = require("./model");
const { createPublicDirectoryService } = require("./service");
const { Timestamp } = require("firebase-admin/firestore");
const deny = code => { const e = Error(code); e.code = code; throw e; };
const hash = value => createHash("sha256").update(value).digest("hex");

/** Only a transport adapter: Agenda owns availability, locking and persistence. */
export function createPublicAppointmentAdapter({ db, externalAvailabilityProvider = null, now = Date.now, serviceFactory = createAppointmentService }) {
  const directory = createPublicDirectoryService({ db });
  async function authorizeChannel({ tx, channel, doctorUid, action, appointmentId }) {
    if (channel.kind !== "directory" || appointmentId || !["availability", "create"].includes(action)) deny("permission-denied");
    const user = (await tx.get(db.doc("usuarios/" + doctorUid))).data();
    const services = (await tx.get(db.doc("whatsappBotProfessionals/" + doctorUid))).data();
    const p = publicProfile(user, services);
    const control = (await tx.get(db.doc("appointmentControls/" + doctorUid))).data();
    if (!p || p.profileSlug !== channel.slug || !p.acceptingPatients) deny("permission-denied");
    if (control?.enabled !== true || control.policy?.bookingEnabled !== true) deny("configuration-required");
    const duration = control.policy.slotDurationMinutes;
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) deny("configuration-required");
    channel.professional = { services: [{ durationMinutes: duration }] };
    channel.durationMinutes = duration; channel.timeZone = control.policy.timeZone;
    return {};
  }
  const service = serviceFactory({ db, authorizeChannel, externalAvailabilityProvider, timestamp: () => Timestamp.fromMillis(now()) });
  async function rateLimit(subject, action) {
    const window = Math.floor(now() / (action === "create" ? 3600000 : 60000));
    const ref = db.doc("publicDirectoryRate/" + hash(subject + ":" + action));
    await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data(), count = old?.window === window ? old.count : 0;
      if (count >= (action === "create" ? 6 : 30)) deny("resource-exhausted");
      tx.set(ref, { window, count: count + 1, expiresAt: Timestamp.fromMillis(now() + 7200000) });
    });
  }
  return async function execute({ data = {}, ip = "" }) {
    if (!["slots", "create"].includes(data.action) || !validSlug(data.agendaProfessionalId)) deny("invalid-argument");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || "") || !Number.isFinite(Date.parse(data.date + "T00:00:00Z")) || new Date(data.date + "T00:00:00Z").toISOString().slice(0, 10) !== data.date) deny("invalid-argument");
    if (data.action === "create" && (data.consent !== true || !/^[A-Za-z0-9_-]{16,160}$/.test(data.requestId || "") ||
      typeof data.patientName !== "string" || !data.patientName.trim() || data.patientName.length > 160 ||
      !/^\+?[0-9]{8,15}$/.test(data.patientPhone || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time || ""))) deny("invalid-argument");
    if (!ip) deny("permission-denied");
    await rateLimit(hash(ip), data.action);
    const resolved = await directory.resolve(data.agendaProfessionalId);
    if (!resolved || !resolved.profile.acceptingPatients) deny("not-found");
    const doctorUid = resolved.doctorUid;
    // Request-scoped actor remains stable across network changes on retries.
    const channel = { kind: "directory", subject: hash(data.action === "create" ? data.requestId : ip), slug: data.agendaProfessionalId };
    await db.runTransaction(tx => authorizeChannel({ tx, channel, doctorUid, action: "availability" }));
    if (data.action === "slots") {
      const result = await service.getChannelSlots({ channel, doctorUid, date: data.date, durationMinutes: channel.durationMinutes });
      return { timeZone: channel.timeZone, slots: (result.slots || []).map(slot => ({
        startDate: slot.startDate, startTime: slot.startTime, durationMinutes: slot.durationMinutes || channel.durationMinutes
      })) };
    }
    const result = await service.createAppointment({
      channel, doctorUid, requestId: data.requestId,
      input: { startDate: data.date, startTime: data.time, durationMinutes: channel.durationMinutes,
        patientName: data.patientName.trim(), patientPhone: data.patientPhone }
    });
    return { result: result.result, replayed: result.replayed === true };
  };
}

