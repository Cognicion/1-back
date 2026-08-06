import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  mapLegacyDuplicateResolution
} from "../js/modules/patient-transfer/persistence/documentPersistenceEligibility.js";

const controller = readFileSync(join(process.cwd(), "js/modules/patient-transfer/patientTransferController.js"), "utf8");

assert.match(
  controller,
  /addEventListener\("click", handleConfirmTransferClick\)/,
  "Confirmar traspaso registra un listener estable"
);
assert.match(
  controller,
  /async function handleConfirmTransferClick[\s\S]*await saveReviewedTransfer\(\)/,
  "el clic invoca y espera saveReviewedTransfer"
);
assert.match(controller, /\[patient-transfer\] confirm-click/, "el clic deja una traza sanitizada");
assert.match(controller, /\[patient-transfer\] save-review-enter/, "el guardado registra su entrada");
assert.match(controller, /\[patient-transfer\] review-synced/, "la revisión registra el resumen de resoluciones");
assert.match(controller, /\[patient-transfer\] save-blocked/, "los bloqueos dejan razón visible");
assert.match(
  controller,
  /duplicate-resolution:decision[\s\S]*action:[\s\S]*matchedPatientIdPresent:/,
  "la decisión registra acción y solo la presencia del paciente asociado"
);
assert.match(
  controller,
  /save-already-in-progress[\s\S]*showPatientTransferError/,
  "el primer retorno por guardado activo ya no es silencioso"
);
assert.match(
  controller,
  /handleConfirmTransferClick[\s\S]*catch \(error\)[\s\S]*setTransferSavingState\(false\)[\s\S]*showPatientTransferError/,
  "un error previo a persistencia restaura el botón y se muestra"
);

assert.equal(
  mapLegacyDuplicateResolution({ action: "create" }),
  DUPLICATE_RESOLUTION.CREATE_NEW,
  "action=create se convierte en create_new"
);

const brian = isDocumentEligibleForPersistence({
  duplicateDetectionStatus: "duplicado_exacto",
  duplicateResolution: "unresolved",
  action: "create",
  omitted: false
});
assert.equal(brian.resolution, DUPLICATE_RESOLUTION.CREATE_NEW, "Brian conserva la decisión visible de crear");
assert.equal(brian.eligible, true, "Brian continúa a persistencia con create_new");

const unresolved = isDocumentEligibleForPersistence({
  duplicateDetectionStatus: "duplicado_exacto",
  duplicateResolution: "unresolved",
  action: "unresolved",
  omitted: false
});
assert.equal(unresolved.eligible, false);
assert.equal(unresolved.reason, "duplicate-resolution-required");

const association = isDocumentEligibleForPersistence({
  duplicateDetectionStatus: "duplicado_exacto",
  duplicateResolution: "associate_existing",
  matchedPatientId: "existing-patient",
  omitted: false
});
assert.equal(association.eligible, true, "la asociación resuelta sigue siendo elegible");
assert.equal(association.resolution, DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING);

console.log("patient-transfer-confirm-action.test.mjs OK");
