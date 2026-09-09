import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");

if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw Error("Local Firestore emulator required; production prohibited");
let env;
test.before(async () => { env = await initializeTestEnvironment({ projectId: "demo-cognicion-agenda", firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } }); });
test.after(async () => env?.cleanup());
test("OAuth, calendar links and sync jobs are server-only", async () => {
  const client = env.authenticatedContext("doctor_test").firestore();
  for (const path of ["googleCalendarOAuthStates/state", "googleCalendarConnections/doctor_test", "googleCalendarAppointmentLinks/link", "googleCalendarSyncJobs/job"]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { connectionStatus: "connected" }));
  }
});
console.log("google-calendar-oauth-rules.test.mjs loaded");
