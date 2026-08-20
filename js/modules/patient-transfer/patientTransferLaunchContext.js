import { DUPLICATE_RESOLUTION } from "./persistence/documentPersistenceEligibility.js";

export const PATIENT_TRANSFER_MODE = Object.freeze({
  GENERAL: "patient_transfer",
  EXISTING_PATIENT_NOTES: "existing_patient_notes"
});

export function normalizePatientTransferLaunchContext(options = {}) {
  const target = options?.targetPatient || {};
  const targetPatientId = String(options?.targetPatientId || target.id || "").trim();
  const targetPatientName = String(options?.targetPatientName || target.name || "").trim();
  const targetPatient = targetPatientId
    ? { id: targetPatientId, name: targetPatientName }
    : null;
  return {
    mode: targetPatient ? PATIENT_TRANSFER_MODE.EXISTING_PATIENT_NOTES : PATIENT_TRANSFER_MODE.GENERAL,
    targetPatient,
    targetPatientLocked: Boolean(targetPatient)
  };
}

export function lockTransferGroupsToTargetPatient(groups = [], context = {}) {
  const normalizedContext = normalizePatientTransferLaunchContext(context);
  if (!normalizedContext.targetPatientLocked) return groups;
  const targetPatient = normalizedContext.targetPatient;

  return groups.map((group) => ({
    ...group,
    action: "associate",
    omitted: false,
    selectedResolution: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
    selectedPatientId: targetPatient.id,
    selectedExistingPatientId: targetPatient.id,
    targetPatient,
    targetPatientLocked: true,
    skipPatientFieldMerge: true,
    candidates: [],
    possibleMatches: [],
    highestMatch: null,
    recommendedResolution: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
    duplicateResolution: {
      ...(group.duplicateResolution && typeof group.duplicateResolution === "object"
        ? group.duplicateResolution
        : {}),
      action: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
      matchedPatientId: targetPatient.id,
      level: "fixed_target"
    },
    documents: (group.documents || []).map((document) => ({
      ...document,
      action: "associate",
      duplicateResolution: DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
      matchedPatientId: targetPatient.id
    }))
  }));
}
