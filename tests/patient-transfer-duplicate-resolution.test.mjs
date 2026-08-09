import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandSegmentedDocumentsForPersistence } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import {
  DUPLICATE_DETECTION_STATUS,
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  mapLegacyDuplicateResolution,
  normalizeDuplicateDetectionStatus
} from "../js/modules/patient-transfer/persistence/documentPersistenceEligibility.js";

const eligible = (document, context = {}) => isDocumentEligibleForPersistence(document, context);

assert.equal(normalizeDuplicateDetectionStatus(""), DUPLICATE_DETECTION_STATUS.NONE);
assert.equal(normalizeDuplicateDetectionStatus("posible_duplicado"), DUPLICATE_DETECTION_STATUS.POSSIBLE);
assert.equal(normalizeDuplicateDetectionStatus("exact_duplicate"), DUPLICATE_DETECTION_STATUS.EXACT);
assert.equal(normalizeDuplicateDetectionStatus("operacion_asociada"), DUPLICATE_DETECTION_STATUS.ASSOCIATED_OPERATION);

assert.deepEqual(
  eligible({ duplicateDetectionStatus: "none", duplicateResolution: "create_new", omitted: false }),
  { eligible: true, reason: "eligible", detectionStatus: "none", resolution: "create_new", matchedPatientIdPresent: false },
  "un documento nuevo se crea"
);
assert.equal(eligible({ duplicateDetectionStatus: "posible_duplicado", duplicateResolution: "unresolved" }).reason, "duplicate-resolution-required");
assert.equal(eligible({ duplicateDetectionStatus: "posible_duplicado", duplicateResolution: "create_new" }).eligible, true);
assert.deepEqual(
  eligible({ duplicateDetectionStatus: "duplicado_exacto", duplicateResolution: "associate_existing", matchedPatientId: "patient-anon" }),
  { eligible: true, reason: "eligible", detectionStatus: "duplicado_exacto", resolution: "associate_existing", matchedPatientIdPresent: true },
  "un duplicado exacto puede asociarse explícitamente"
);
assert.equal(eligible({ duplicateDetectionStatus: "duplicado_exacto", duplicateResolution: "omit" }).reason, "omitted");
assert.equal(eligible({ duplicateDetectionStatus: "operacion_asociada", duplicateResolution: "associate_existing", matchedPatientId: "patient-anon" }).eligible, true);
assert.equal(eligible({ duplicateDetectionStatus: "duplicado_exacto", duplicateResolution: "associate_existing" }).reason, "missing-existing-patient");

assert.equal(mapLegacyDuplicateResolution({ action: "create" }), DUPLICATE_RESOLUTION.CREATE_NEW);
assert.equal(mapLegacyDuplicateResolution({ action: "associate" }), DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING);
assert.equal(mapLegacyDuplicateResolution({ action: "omit" }), DUPLICATE_RESOLUTION.OMIT);
assert.equal(mapLegacyDuplicateResolution({ action: "unresolved" }), DUPLICATE_RESOLUTION.UNRESOLVED);
assert.equal(mapLegacyDuplicateResolution({ resolution: "create_new", selectedResolution: "link-existing", action: "create" }), DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING, "la decisión explícita prevalece");

const diagnosis = { id: "dx-1", codes: ["X78", "S517", "S117"] };
const treatment = { id: "tx-1", catalogMedicationId: "catalog-anon", schedule: [{ time: "22:00", quantity: 1, unit: "tableta" }] };
const [brianExpanded] = expandSegmentedDocumentsForPersistence([{
  id: "brian-anon",
  textHash: "hash-anon",
  duplicateStatus: "duplicado_exacto",
  duplicateDetectionStatus: "duplicado_exacto",
  duplicateResolution: "create_new",
  omitted: false,
  noteSegments: [{
    id: "brian-anon-note-1",
    omitted: false,
    sections: {},
    rawText: "",
    blocks: [],
    metadata: {},
    confirmedType: "Nota clínica",
    diagnosisCandidates: [diagnosis],
    treatmentCandidates: [treatment],
    treatmentPlanCandidates: [],
    vitalSignsCandidates: [{ id: "vitals-1" }]
  }]
}]);

assert.equal(eligible(brianExpanded).eligible, true, "Brian puede crear paciente tras decisión explícita");
assert.deepEqual(brianExpanded.diagnosisCandidates[0].codes, diagnosis.codes, "conserva códigos múltiples");
assert.equal(brianExpanded.treatmentCandidates[0].catalogMedicationId, treatment.catalogMedicationId, "conserva catálogo");
assert.deepEqual(brianExpanded.treatmentCandidates[0].schedule, treatment.schedule, "conserva horarios");
assert.equal(brianExpanded.vitalSignsCandidates[0].id, "vitals-1", "conserva signos vitales");
assert.equal(brianExpanded.sourceNoteSegmentId, "brian-anon-note-1", "conserva noteId fuente");

const root = process.cwd();
const repository = readFileSync(join(root, "js/modules/patient-transfer/patientTransferRepository.js"), "utf8");
const controller = readFileSync(join(root, "js/modules/patient-transfer/patientTransferController.js"), "utf8");
const view = readFileSync(join(root, "js/modules/patient-transfer/ui/patientTransferView.js"), "utf8");

assert.match(repository, /status: "blocked"/);
assert.match(repository, /reason: unresolvedDocument\.reason/);
assert.doesNotMatch(repository, /documentsToSave = group\.documents\.filter\(\(item\) => !item\.omitted && item\.duplicateStatus === "nuevo"\)/);
assert.ok(repository.indexOf('operation.data?.status === "completed"') < repository.indexOf('if (effectiveAction === "create")'), "la idempotencia se resuelve antes de crear paciente");
assert.match(repository, /if \(effectiveAction === "create"\)/);
assert.match(repository, /if \(effectiveAction === "associate"\)/);
assert.match(controller, /duplicate-resolution:decision/);
assert.match(repository, /persistence:eligibility/);
assert.match(view, /value="create_new" data-transfer-duplicate-resolution/);
assert.doesNotMatch(view, /data-transfer-action=/);

console.log("patient-transfer-duplicate-resolution.test.mjs OK");
