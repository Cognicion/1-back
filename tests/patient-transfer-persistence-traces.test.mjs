import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const controller = read("js/modules/patient-transfer/patientTransferController.js");
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const panel = read("js/medico.js");

assert.match(controller, /\[patient-transfer\] save-result/);
for (const field of [
  "groupId",
  "documentsReceived",
  "eligibleDocuments",
  "omittedDocuments",
  "duplicateExcludedDocuments",
  "duplicateStatuses",
  "patientCreated",
  "patientIdPresent"
]) {
  assert.match(controller, new RegExp(`${field}:`), `save-result conserva ${field}`);
}

assert.match(repository, /\[patient-transfer\] patient-created/);
assert.match(repository, /groupId: group\.id/);
assert.match(repository, /patientIdPresent: true/);
assert.doesNotMatch(repository, /\[patient-transfer\] patient-created[\s\S]{0,120}\n\s*patientId,/, "patient-created no imprime el ID");

assert.match(controller, /\[patient-transfer\] completed-event/);
for (const field of ["patientIdsCount", "createdCount", "associatedCount", "operationIdPresent"]) {
  assert.match(controller, new RegExp(`${field}:`), `completed-event conserva ${field}`);
}

for (const trace of ["refresh-start", "query-result", "patient-filtered", "patient-rendered"]) {
  assert.match(panel, new RegExp(`\\[medical-panel\\] ${trace}`), `el Panel conserva ${trace}`);
}

console.log("patient-transfer-persistence-traces.test.mjs OK");
