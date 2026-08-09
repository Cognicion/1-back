import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  mapLegacyDuplicateResolution
} from "../js/modules/patient-transfer/persistence/documentPersistenceEligibility.js";

const viewSource = readFileSync(join(process.cwd(), "js/modules/patient-transfer/ui/patientTransferView.js"), "utf8");
const controllerSource = readFileSync(join(process.cwd(), "js/modules/patient-transfer/patientTransferController.js"), "utf8");

assert.match(viewSource, /value="associate_existing" data-transfer-duplicate-resolution/);
assert.match(viewSource, /value="create_new" data-transfer-duplicate-resolution/);
assert.match(viewSource, /value="omit" data-transfer-duplicate-resolution/);
assert.doesNotMatch(viewSource, /data-transfer-action=/, "no queda un segundo control de accion para el mismo duplicado");
assert.match(viewSource, /data-transfer-existing="\$\{group\.id\}"/, "se conserva el selector de paciente destino");

assert.equal(
  mapLegacyDuplicateResolution({ selectedResolution: "associate_existing", action: "create" }),
  DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
  "la decision canonica visible prevalece sobre una accion legacy residual"
);
assert.equal(
  mapLegacyDuplicateResolution({ selectedResolution: "create_new", action: "associate" }),
  DUPLICATE_RESOLUTION.CREATE_NEW,
  "cambiar de asociar a crear no conserva la accion legacy"
);

const associationWithoutTarget = isDocumentEligibleForPersistence({}, {
  selectedResolution: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
  action: "associate"
});
assert.deepEqual(
  { eligible: associationWithoutTarget.eligible, reason: associationWithoutTarget.reason },
  { eligible: false, reason: "missing-existing-patient" },
  "asociar requiere seleccionar un paciente destino"
);

const associationWithTarget = isDocumentEligibleForPersistence({ matchedPatientId: "target" }, {
  selectedResolution: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
  action: "associate"
});
assert.equal(associationWithTarget.eligible, true, "asociar con destino queda elegible");

assert.match(
  controllerSource,
  /group\.selectedResolution === DUPLICATE_RESOLUTION\.CREATE_NEW[\s\S]{0,220}some\(\(match\) => \["muy_alta", "alta"\]/,
  "la confirmacion de crear duplicado solo se solicita para create_new"
);
assert.match(controllerSource, /patient-transfer:decision-changed/);
assert.match(controllerSource, /patient-transfer:decision-final/);
assert.match(controllerSource, /patient-transfer:association-target-selected/);

console.log("patient-transfer-canonical-duplicate-decision.test.mjs OK");
