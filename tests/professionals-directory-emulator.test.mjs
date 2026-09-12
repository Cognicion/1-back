import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createPublicAppointmentAdapter } from "../functions/publicDirectory/appointments.mjs";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");
const { createPublicDirectoryService } = require("../functions/publicDirectory/service.js");
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw Error("Local emulator required. Production prohibited.");
const projectId = "demo-cognicion-directory";
const app = initializeApp({ projectId }, "directory-tests"), db = getFirestore(app);
let env;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
test.beforeEach(async () => {
  await env.clearFirestore();
  await db.doc("usuarios/test_doctor").set({
    rol: "medico", nombre: "Synthetic Professional", email: "private@example.invalid",
    publicDirectory: { publicProfile: true, profileSlug: "synthetic-professional", acceptingPatients: true, featured: true }
  });
  await db.doc("appointmentControls/test_doctor").set({ enabled: true, revision: 0, policy: {
    timeZone: "America/Mexico_City", bookingEnabled: true, slotDurationMinutes: 60,
    weeklySchedule: { monday: [{ start: "09:00", end: "12:00" }] },
    payment: { required: false, type: "none", amount: null, currency: "MXN" }, maximumBookingAdvanceDays: 90, minimumBookingNoticeMinutes: 0
  } });
});
test.after(async () => { await env?.cleanup(); await deleteApp(app); });
test("anonymous SDK cannot read users, internal counters or write appointments/profiles", async () => {
  const client = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(client, "usuarios/test_doctor")));
  await assertFails(setDoc(doc(client, "usuarios/test_doctor"), { publicDirectory: { publicProfile: true } }, { merge: true }));
  await assertFails(setDoc(doc(client, "usuarios/test_doctor/agenda/fake"), { startTime: "09:00" }));
  await assertFails(getDoc(doc(client, "publicDirectoryRate/test")));
  await assertFails(setDoc(doc(client, "publicDirectoryRate/test"), { count: 0 }));
  const result = await createPublicDirectoryService({ db }).execute({ action: "featured" });
  assert.equal(result.professionals.length, 1);
  assert.ok(!JSON.stringify(result).includes("private@example.invalid"));
  assert.ok(!JSON.stringify(result).includes("test_doctor"));
});
test("concurrent public reservations share Agenda mutex and produce exactly one appointment", async () => {
  const execute = createPublicAppointmentAdapter({ db, now: () => Date.parse("2026-09-13T12:00:00Z") });
  const base = { action: "create", agendaProfessionalId: "synthetic-professional", date: "2026-09-14", time: "09:00",
    consent: true, patientName: "Synthetic", patientPhone: "520000000000" };
  const results = await Promise.allSettled([
    execute({ ip: "synthetic-one", data: { ...base, requestId: "concurrent_request_one" } }),
    execute({ ip: "synthetic-two", data: { ...base, requestId: "concurrent_request_two" } })
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await db.collection("usuarios/test_doctor/agenda").get()).size, 1);
});

