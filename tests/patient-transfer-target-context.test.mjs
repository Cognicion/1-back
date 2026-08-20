import assert from "node:assert/strict";
import {
  PATIENT_TRANSFER_MODE,
  lockTransferGroupsToTargetPatient,
  normalizePatientTransferLaunchContext
} from "../js/modules/patient-transfer/patientTransferLaunchContext.js";
import { isDocumentEligibleForPersistence } from "../js/modules/patient-transfer/persistence/documentPersistenceEligibility.js";

const generic = normalizePatientTransferLaunchContext();
assert.equal(generic.mode, PATIENT_TRANSFER_MODE.GENERAL);
assert.equal(generic.targetPatientLocked, false);
assert.equal(generic.targetPatient, null);

const fixed = normalizePatientTransferLaunchContext({
  targetPatient: { id: "  patient-123  ", name: "  Paciente de prueba  " }
});
assert.deepEqual(fixed, {
  mode: PATIENT_TRANSFER_MODE.EXISTING_PATIENT_NOTES,
  targetPatient: { id: "patient-123", name: "Paciente de prueba" },
  targetPatientLocked: true
});

const sourceGroups = [{
  id: "group-1",
  action: "create",
  selectedResolution: "create_new",
  selectedPatientId: "wrong-patient",
  possibleMatches: [{ id: "other-patient" }],
  documents: [{ id: "document-1", duplicateResolution: "unresolved", matchedPatientId: "" }]
}];
const locked = lockTransferGroupsToTargetPatient(sourceGroups, fixed);

assert.notEqual(locked, sourceGroups, "el bloqueo no debe mutar el arreglo fuente");
assert.equal(sourceGroups[0].action, "create", "el grupo fuente debe permanecer intacto");
assert.equal(locked[0].action, "associate");
assert.equal(locked[0].selectedResolution, "associate_existing");
assert.equal(locked[0].selectedPatientId, "patient-123");
assert.equal(locked[0].selectedExistingPatientId, "patient-123");
assert.equal(locked[0].targetPatientLocked, true);
assert.equal(locked[0].skipPatientFieldMerge, true);
assert.deepEqual(locked[0].possibleMatches, []);
assert.equal(locked[0].documents[0].matchedPatientId, "patient-123");
assert.equal(locked[0].documents[0].duplicateResolution, "associate_existing");
assert.deepEqual(isDocumentEligibleForPersistence(locked[0].documents[0], {
  action: locked[0].action,
  selectedResolution: locked[0].selectedResolution,
  matchedPatientId: locked[0].selectedPatientId
}), {
  eligible: true,
  reason: "eligible",
  detectionStatus: "none",
  resolution: "associate_existing",
  matchedPatientIdPresent: true
});

const tamperedReview = [{
  ...locked[0],
  action: "create",
  selectedResolution: "create_new",
  selectedPatientId: "other-patient",
  documents: [{ ...locked[0].documents[0], matchedPatientId: "other-patient" }]
}];
const relocked = lockTransferGroupsToTargetPatient(tamperedReview, fixed);
assert.equal(relocked[0].action, "associate", "la sincronización debe restaurar la asociación fija");
assert.equal(relocked[0].selectedPatientId, "patient-123");
assert.equal(relocked[0].documents[0].matchedPatientId, "patient-123");

assert.equal(lockTransferGroupsToTargetPatient(sourceGroups, generic), sourceGroups, "el panel general conserva su flujo actual");

console.log("patient-transfer-target-context.test.mjs OK");
