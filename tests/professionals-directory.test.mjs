import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { normalizeSearch, generateSlug, validSlug, filterProfessionals, filterOptions, profileSlugFromSearch, agendaUrl } from "../js/services/professionalsDirectoryLogic.js";
import { createPublicAppointmentAdapter } from "../functions/publicDirectory/appointments.mjs";
const require = createRequire(import.meta.url);
const { publicProfile } = require("../functions/publicDirectory/model.js");
const { createPublicDirectoryService } = require("../functions/publicDirectory/service.js");
const profile = { nombre: "Dra. María Pérez", rol: "medico", especialidad: "Psiquiatría", descripcionProfesional: "Biografía pública",
  email: "private@example.invalid", telefono: "private", cedulaProfesional: "license",
  publicDirectory: { publicProfile: true, profileSlug: "maria-perez", featured: true, acceptingPatients: true, clinicalExperience: ["Ansiedad", "TDAH"], populations: ["Adultos"], languages: ["Español"] } };
function database(seed = {}) {
  let data = new Map(Object.entries(seed)), serial = 0;
  const calls = [];
  const snapshot = (path, map = data) => ({ id: path.split("/").at(-1), exists: map.has(path), data: () => map.get(path) });
  function query(path, constraints = [], max = Infinity, cursor = null, ordering = null) {
    const value = (row, field) => field.split(".").reduce((v, k) => v?.[k], row);
    const api = {
      where: (field, op, v) => query(path, [...constraints, [field, op, v]], max, cursor, ordering),
      limit: v => query(path, constraints, v, cursor, ordering),
      orderBy: field => query(path, constraints, max, cursor, field),
      startAfter: v => query(path, constraints, max, v, ordering),
      doc: id => doc(path + "/" + (id || "generated_" + ++serial)),
      async get(map = data) {
        calls.push({ path, constraints, max });
        let entries = [...map].filter(([key, row]) => key.startsWith(path + "/") && key.slice(path.length + 1).indexOf("/") < 0 &&
          constraints.every(([field, op, v]) => {
            const actual = value(row, field);
            return op === "==" ? actual === v : op === ">=" ? actual >= v : op === "<=" ? actual <= v : op === ">" ? actual > v : op === "<" ? actual < v : op === "in" ? v.includes(actual) : false;
          }));
        if (ordering) entries.sort((a, b) => String(value(a[1], ordering)).localeCompare(String(value(b[1], ordering))));
        if (cursor) entries = entries.filter(([, row]) => value(row, ordering) > cursor);
        const docs = entries.slice(0, max).map(([key]) => snapshot(key, map));
        return { docs, size: docs.length, empty: !docs.length };
      }
    }; return api;
  }
  function doc(path) { return { path, id: path.split("/").at(-1), get: async (map = data) => snapshot(path, map) }; }
  return {
    doc, collection: path => query(path), calls, all: () => data,
    async runTransaction(fn) {
      const working = new Map(data);
      const tx = { get: ref => ref.get(working), set: (ref, v, opts) => working.set(ref.path, opts?.merge ? { ...working.get(ref.path), ...v } : v),
        update: (ref, v) => working.set(ref.path, { ...working.get(ref.path), ...v }),
        create: (ref, v) => { assert.equal(working.has(ref.path), false); working.set(ref.path, v); } };
      const result = await fn(tx); data = working; return result;
    }
  };
}
test("normalizes accents, case and repeated whitespace; slug validates parsed URLs", () => {
  assert.equal(normalizeSearch("  PSIQUIATRÍA   Pérez "), "psiquiatria perez");
  assert.equal(generateSlug(" María Pérez "), "maria-perez");
  assert.equal(profileSlugFromSearch("?slug=maria-perez"), "maria-perez");
  for (const s of ["../private", "a/b", "", "x".repeat(65), "María"]) assert.equal(validSlug(s), false);
  assert.equal(profileSlugFromSearch("?slug=%2Fprivate"), null);
});
test("explicit field projection excludes private fields and nested arbitrary properties", () => {
  const p = publicProfile({ ...profile, publicDirectory: { ...profile.publicDirectory, education: [{ title: "Grado", privateEmail: "secret" }] } });
  assert.equal(p.id, "maria-perez"); assert.equal(p.professionalLicense, ""); assert.equal(p.photoUrl, "");
  for (const value of ["private@example.invalid", "privateEmail", '"rol"', '"uid"', '"telefono"']) assert.ok(!JSON.stringify(p).includes(value));
  assert.deepEqual(p.education[0], { title: "Grado", institution: "", year: "", description: "" });
  assert.equal(publicProfile({ ...profile, publicDirectory: {} }), null);
});
test("optional fields and photo publication fail closed", () => {
  assert.equal(publicProfile({ ...profile, fotoProfesional: "javascript:alert(1)", publicDirectory: { ...profile.publicDirectory, publishPhoto: true } }).photoUrl, "");
  const p = publicProfile({ publicDirectory: { publicProfile: true, profileSlug: "optional" } });
  assert.deepEqual(p.education, []); assert.equal(p.displayName, "");
  assert.equal(publicProfile({ ...profile, publicDirectory: { ...profile.publicDirectory, publishLicense: true } }).professionalLicense, "license");
});
test("combined search and all filters exclude unpublished profiles", () => {
  const p = publicProfile(profile);
  assert.equal(filterProfessionals([p, { ...p, publicProfile: false }], "  perez ANSIEDAD", { specialties: "psiquiatria", populations: "adultos", languages: "espanol", acceptingPatients: "true" }).length, 1);
  assert.equal(filterProfessionals([p], "perez", { modalities: "En línea" }).length, 0);
  assert.equal(filterProfessionals([p], "", { acceptingPatients: "false" }).length, 0);
  assert.deepEqual(filterOptions([p, { ...p, languages: ["espanol"] }], "languages"), ["espanol"]);
  assert.equal(agendaUrl(p), "agenda.html?professional=maria-perez");
});
test("configured services and new-patient policy reuse Agenda channel data", () => {
  const p = publicProfile(profile, { acceptsNewPatients: false, services: [{ label: "Consulta", modality: "online", durationMinutes: 60, internal: "secret" }] });
  assert.deepEqual(p.services, ["Consulta"]); assert.deepEqual(p.modalities, ["online"]); assert.equal(p.acceptingPatients, false);
});
test("featured query is bounded, profile resolution rejects missing/duplicate/deleted profiles", async () => {
  const db = database({ "usuarios/doctor": profile });
  const svc = createPublicDirectoryService({ db });
  assert.equal((await svc.execute({ action: "featured" })).professionals.length, 1);
  assert.equal(db.calls[0].max, 4);
  assert.ok(db.calls[0].constraints.some(([key, , value]) => key === "publicDirectory.featured" && value === true));
  assert.equal(await svc.resolve("missing"), null);
  assert.equal((await svc.resolve("maria-perez")).doctorUid, "doctor");
  const duplicate = createPublicDirectoryService({ db: database({ "usuarios/a": profile, "usuarios/b": profile }) });
  assert.equal(await duplicate.resolve("maria-perez"), null);
  assert.equal(await createPublicDirectoryService({ db: database({ "usuarios/a": profile, "accountDeletionTombstones/a": {} }) }).resolve("maria-perez"), null);
});
function appointmentDatabase() {
  return database({ "usuarios/doctor": profile, "appointmentControls/doctor": { enabled: true, revision: 0, policy: {
    timeZone: "America/Mexico_City", bookingEnabled: true, slotDurationMinutes: 60,
    weeklySchedule: { monday: [{ start: "09:00", end: "12:00" }] },
    payment: { required: false, type: "none", amount: null, currency: "MXN" },
    maximumBookingAdvanceDays: 90, minimumBookingNoticeMinutes: 0
  } } });
}
test("public adapter uses real Agenda domain and same appointment receipt on retry", async () => {
  const db = appointmentDatabase(), execute = createPublicAppointmentAdapter({ db, now: () => Date.parse("2026-09-13T12:00:00Z") });
  const input = { agendaProfessionalId: "maria-perez", date: "2026-09-14" };
  const available = await execute({ ip: "test-only", data: { ...input, action: "slots" } });
  assert.ok(available.slots.some(s => s.startTime === "09:00"));
  const data = { ...input, action: "create", time: "09:00", patientName: "Synthetic", patientPhone: "520000000000", consent: true, requestId: "test_request_123456789" };
  assert.equal((await execute({ ip: "test-only", data })).result, "applied");
  assert.equal((await execute({ ip: "changed-network", data })).replayed, true);
  const appointments = [...db.all()].filter(([path]) => path.startsWith("usuarios/doctor/agenda/"));
  assert.equal(appointments.length, 1); assert.equal(appointments[0][1].creadoPor, "public-directory");
  const after = await execute({ ip: "test-only", data: { ...input, action: "slots" } });
  assert.ok(!after.slots.some(s => s.startTime === "09:00"));
  await assert.rejects(execute({ ip: "test-only", data: { ...data, requestId: "second_request_123456" } }));
  assert.equal([...db.all()].filter(([path]) => path.startsWith("usuarios/doctor/agenda/")).length, 1);
});
test("public adapter rejects forged actions, invalid dates and missing consent", async () => {
  const execute = createPublicAppointmentAdapter({ db: appointmentDatabase() });
  await assert.rejects(execute({ ip: "test", data: { action: "cancel", agendaProfessionalId: "maria-perez", date: "2026-09-14" } }), { code: "invalid-argument" });
  await assert.rejects(execute({ ip: "test", data: { action: "slots", agendaProfessionalId: "maria-perez", date: "2026-02-31" } }), { code: "invalid-argument" });
  await assert.rejects(execute({ ip: "test", data: { action: "create", agendaProfessionalId: "maria-perez", date: "2026-09-14" } }), { code: "invalid-argument" });
});
test("unpublished professional cannot expose slots or book", async () => {
  const db = appointmentDatabase();
  db.all().set("usuarios/doctor", { ...profile, publicDirectory: { ...profile.publicDirectory, publicProfile: false } });
  const execute = createPublicAppointmentAdapter({ db });
  await assert.rejects(execute({ ip: "test", data: { action: "slots", agendaProfessionalId: "maria-perez", date: "2026-09-14" } }), { code: "not-found" });
});

