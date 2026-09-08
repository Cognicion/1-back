import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require("firebase/firestore");
const { createEventStore, eventIdHash } = require("./whatsappWebhook/store.js");
const projectId = "demo-cognicion-whatsapp";
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw Error("Only a local Firestore emulator is permitted; production is prohibited.");
const app = initializeApp({ projectId }, "whatsapp-webhook-tests");
const db = getFirestore(app);
const recordEvents = createEventStore({ db });
const event = { provider: "whatsapp", eventType: "message", messageId: "wamid.synthetic-emulator", messageType: "text", receivedAt: 1_788_912_000_000 };
let env;
setLogLevel("silent");
test.before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8") } });
});
test.beforeEach(async () => { await env.clearFirestore(); });
test.after(async () => { await env?.cleanup(); await deleteApp(app); });

test("Admin SDK persists only the technical receipt under a hash", async () => {
  const [result] = await recordEvents([event]);
  assert.equal(result.recorded, true); assert.equal(result.deduplicated, false);
  const snapshot = await db.collection("whatsappWebhookEvents").get();
  assert.equal(snapshot.size, 1); assert.equal(snapshot.docs[0].id, eventIdHash(event));
  const data = snapshot.docs[0].data();
  assert.deepEqual(Object.keys(data).sort(), ["eventIdHash", "eventType", "messageType", "provider", "receivedAt", "schemaVersion"]);
  assert.equal(data.receivedAt.toMillis(), event.receivedAt);
  assert.equal(JSON.stringify(data).includes(event.messageId), false);
});
test("real concurrent Firestore transactions accept the same message exactly once", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => recordEvents([event])));
  assert.equal(results.flat().filter((r) => r.recorded).length, 1);
  assert.equal(results.flat().filter((r) => r.deduplicated).length, 9);
  assert.equal((await db.collection("whatsappWebhookEvents").get()).size, 1);
});
test("repeated batches preserve the original receipt and each outbound status", async () => {
  const batch = [event, event, ...["sent", "delivered", "read", "failed"].map((status) => ({ ...event, eventType: `status.${status}`, messageType: null }))];
  const first = await recordEvents(batch);
  assert.equal(first.filter((r) => r.recorded).length, 5);
  const retry = await recordEvents(batch.map((e) => ({ ...e, receivedAt: e.receivedAt + 1000 })));
  assert.ok(retry.every((r) => r.deduplicated));
  assert.equal((await db.collection("whatsappWebhookEvents").get()).size, 5);
  assert.equal((await db.doc(`whatsappWebhookEvents/${eventIdHash(event)}`).get()).data().receivedAt.toMillis(), event.receivedAt);
});
for (const role of ["anonymous", "paciente", "medico", "admin"]) {
  test(`Rules deny client read/list for ${role}, including nested documents`, async () => {
    await recordEvents([event]);
    if (role !== "anonymous") await db.doc(`usuarios/synthetic-${role}`).set({ rol: role });
    const client = (role === "anonymous" ? env.unauthenticatedContext() : env.authenticatedContext(`synthetic-${role}`)).firestore();
    await assertFails(getDoc(doc(client, "whatsappWebhookEvents", eventIdHash(event))));
    await assertFails(getDocs(collection(client, "whatsappWebhookEvents")));
    await assertFails(getDoc(doc(client, "whatsappWebhookEvents/example/nested/example")));
  });
  test(`Rules deny client create/update/delete for ${role}`, async () => {
    await recordEvents([event]);
    if (role !== "anonymous") await db.doc(`usuarios/synthetic-${role}`).set({ rol: role });
    const client = (role === "anonymous" ? env.unauthenticatedContext() : env.authenticatedContext(`synthetic-${role}`)).firestore();
    await assertFails(setDoc(doc(client, "whatsappWebhookEvents/new"), { provider: "whatsapp" }));
    await assertFails(updateDoc(doc(client, "whatsappWebhookEvents", eventIdHash(event)), { messageType: "button" }));
    await assertFails(deleteDoc(doc(client, "whatsappWebhookEvents", eventIdHash(event))));
    await assertFails(setDoc(doc(client, "whatsappWebhookEvents/example/nested/example"), { provider: "whatsapp" }));
  });
}
