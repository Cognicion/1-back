import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandSegmentedDocumentsForPersistence } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";

const source = {
  id: "doc-anon",
  textHash: "hash-anon",
  duplicateStatus: "exact_duplicate",
  omitted: false,
  action: "create",
  include: true,
  noteSegments: [{
    id: "doc-anon-note-1",
    omitted: false,
    sections: {},
    rawText: "",
    blocks: [],
    metadata: {},
    confirmedType: "Nota clínica",
    diagnosisCandidates: [],
    treatmentCandidates: [],
    treatmentPlanCandidates: [],
    vitalSignsCandidates: []
  }]
};

const [expanded] = expandSegmentedDocumentsForPersistence([source]);
assert.equal(expanded.duplicateStatus, "exact_duplicate", "la expansión conserva duplicateStatus");
assert.equal(expanded.omitted, false, "la expansión conserva omitted");
assert.equal(expanded.action, "create", "la expansión conserva action");
assert.equal(expanded.include, true, "la expansión conserva include");

const root = process.cwd();
const controller = readFileSync(join(root, "js/modules/patient-transfer/patientTransferController.js"), "utf8");
const repository = readFileSync(join(root, "js/modules/patient-transfer/patientTransferRepository.js"), "utf8");

assert.match(controller, /persistence-audit:analyzed-groups/);
assert.match(controller, /persistence-audit:expanded-documents/);
assert.match(controller, /persistence-audit:before-save/);
assert.match(repository, /persistence-audit:before-filter/);
assert.match(repository, /persistence-audit:after-filter/);
assert.match(repository, /persistence-audit:document-skipped/);
assert.match(repository, /skipReason: item\.reason/);
assert.match(repository, /isDocumentEligibleForPersistence/);
assert.match(controller, /No se creó ningún paciente ni ninguna nota\. Revise la resolución de duplicados\./);
assert.match(controller, /const failedResult = results\.find\(\(item\) => item\.status === "failed" && item\.error\)/);
assert.match(controller, /const noPersistenceResult = !failedResult/);
assert.match(controller, /if \(failedResult\?\.error\) showPatientTransferError\(failedResult\.error\)/);

console.log("patient-transfer-persistence-audit.test.mjs OK");
