import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAssociationTargetPatientId } from "../js/modules/patient-transfer/persistence/documentPersistenceEligibility.js";

const sourcePatientId = "imported-patient";
const targetPatientId = "existing-patient";
const repository = readFileSync(join(process.cwd(), "js/modules/patient-transfer/patientTransferRepository.js"), "utf8");

assert.equal(
  resolveAssociationTargetPatientId({
    selectedPatientId: targetPatientId,
    selectedExistingPatientId: "",
    matchedPatientId: sourcePatientId
  }),
  targetPatientId,
  "la decisión explícita de asociación prevalece sobre la coincidencia de origen"
);
assert.equal(
  resolveAssociationTargetPatientId({ matchedPatientId: targetPatientId }),
  targetPatientId,
  "la coincidencia es el destino cuando no existe una selección posterior"
);

assert.match(repository, /const targetPatientId = effectiveAction === "associate"/);
assert.match(repository, /transferOperationIdForGroup\(group, targetPatientId\)/);
assert.match(repository, /if \(operation\.data\?\.patientId && effectiveAction !== "associate"\)/);
assert.match(repository, /doc\(db, "usuarios", patientId, "notasMedicas", noteImportKey\)/);
assert.match(repository, /createImportedDiagnoses\(patientId/);
assert.match(repository, /createImportedTreatments\(patientId/);
assert.match(repository, /createImportedIndications\(patientId/);
assert.match(repository, /setDoc\(doc\(db, "usuarios", patientId\), next/);
assert.match(repository, /patient-transfer:association-selected/);
assert.match(repository, /patient-transfer:persistence-target/);

console.log("patient-transfer-association-target.test.mjs OK");
