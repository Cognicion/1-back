import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const repository = readFileSync(join(root, "js/modules/patient-transfer/patientTransferRepository.js"), "utf8");

[
  "patient-transfer:vitals-source-real",
  "patient-transfer:vitals-history-before-real",
  "patient-transfer:vitals-history-after-real",
  "patient-transfer:vitals-history-write-not-observed"
].forEach((eventName) => assert.match(repository, new RegExp(eventName), `${eventName} queda instrumentado`));

const saveLoop = repository.indexOf("for (let documentIndex = 0; documentIndex < documentsToSave.length");
const vitalsCall = repository.indexOf("persistImportedVitalSignsForDocument({", saveLoop);
const noteStage = repository.indexOf('stage = "creating_note"', saveLoop);
assert.ok(saveLoop >= 0 && vitalsCall > saveLoop, "el flujo invoca la persistencia aislada de signos vitales");
assert.ok(vitalsCall < noteStage, "los signos vitales se persisten antes de crear o verificar la nota");

const helperStart = repository.indexOf("async function persistImportedVitalSignsForDocument");
const helperEnd = repository.indexOf("function traceTransfer", helperStart);
const helper = repository.slice(helperStart, helperEnd);
const beforeRead = helper.indexOf("const beforeSnap = await getDocFromServer(patientRef)");
const write = helper.indexOf("await setDoc(patientRef, update, { merge: true })");
const afterRead = helper.indexOf("const afterSnap = await getDocFromServer(patientRef)");
assert.ok(beforeRead >= 0 && write > beforeRead && afterRead > write, "la secuencia real es history before -> write awaited -> history after");
assert.match(helper, /sourcePresentAfter && \(historyChanged \|\| sourcePresentBefore\) && currentObserved/, "el exito requiere escritura observada o idempotencia demostrada");
assert.match(helper, /new Error\("No se pudieron confirmar los signos vitales en el expediente\."\)/, "una escritura no observable produce error visible");
assert.match(helper, /const patientRef = doc\(db, "usuarios", patientId\)/, "associate_existing escribe exclusivamente en el patientId destino resuelto");

console.log("patient-transfer-vitals-real-write.test.mjs OK");
