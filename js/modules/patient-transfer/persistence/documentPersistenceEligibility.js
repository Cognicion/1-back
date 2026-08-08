export const DUPLICATE_DETECTION_STATUS = Object.freeze({
  NONE: "none",
  POSSIBLE: "posible_duplicado",
  EXACT: "duplicado_exacto",
  ASSOCIATED_OPERATION: "operacion_asociada"
});

export const DUPLICATE_RESOLUTION = Object.freeze({
  CREATE_NEW: "create_new",
  ASSOCIATE_EXISTING: "associate_existing",
  OMIT: "omit",
  UNRESOLVED: "unresolved"
});

export function normalizeDuplicateDetectionStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["", "none", "nuevo"].includes(normalized)) return DUPLICATE_DETECTION_STATUS.NONE;
  if (["posible_duplicado", "duplicate_in_batch"].includes(normalized)) return DUPLICATE_DETECTION_STATUS.POSSIBLE;
  if (["duplicado_exacto", "exact_duplicate"].includes(normalized)) return DUPLICATE_DETECTION_STATUS.EXACT;
  if (normalized === "operacion_asociada") return DUPLICATE_DETECTION_STATUS.ASSOCIATED_OPERATION;
  return DUPLICATE_DETECTION_STATUS.POSSIBLE;
}

export function mapLegacyDuplicateResolution({
  resolution = "",
  selectedResolution = "",
  action = "",
  omitted = false
} = {}) {
  if (omitted || action === "omit") return DUPLICATE_RESOLUTION.OMIT;
  const selectedValue = String(selectedResolution || "").trim().toLowerCase();
  if (["create_new", "create-new"].includes(selectedValue)) return DUPLICATE_RESOLUTION.CREATE_NEW;
  if (["associate_existing", "link-existing"].includes(selectedValue)) return DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING;
  if (selectedValue === "omit") return DUPLICATE_RESOLUTION.OMIT;
  if (action === "create") return DUPLICATE_RESOLUTION.CREATE_NEW;
  if (action === "associate") return DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING;
  const value = String(resolution || "").trim().toLowerCase();
  if (["create_new", "create-new"].includes(value)) return DUPLICATE_RESOLUTION.CREATE_NEW;
  if (["associate_existing", "link-existing"].includes(value)) return DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING;
  if (value === "omit") return DUPLICATE_RESOLUTION.OMIT;
  if (value === "unresolved") return DUPLICATE_RESOLUTION.UNRESOLVED;
  return DUPLICATE_RESOLUTION.UNRESOLVED;
}

export function resolveAssociationTargetPatientId({
  selectedPatientId = "",
  selectedExistingPatientId = "",
  matchedPatientId = ""
} = {}) {
  return [selectedPatientId, selectedExistingPatientId, matchedPatientId]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";
}

export function isDocumentEligibleForPersistence(document = {}, context = {}) {
  const detectionStatus = normalizeDuplicateDetectionStatus(
    document.duplicateDetectionStatus ?? document.duplicateStatus
  );
  const resolution = mapLegacyDuplicateResolution({
    resolution: document.duplicateResolution,
    selectedResolution: context.selectedResolution,
    action: document.action ?? context.action,
    omitted: Boolean(document.omitted || context.omitted)
  });
  const matchedPatientId = document.matchedPatientId || context.matchedPatientId || "";

  if (document.omitted || context.omitted || resolution === DUPLICATE_RESOLUTION.OMIT) {
    return { eligible: false, reason: "omitted", detectionStatus, resolution, matchedPatientIdPresent: Boolean(matchedPatientId) };
  }
  if (resolution === DUPLICATE_RESOLUTION.UNRESOLVED) {
    return { eligible: false, reason: "duplicate-resolution-required", detectionStatus, resolution, matchedPatientIdPresent: Boolean(matchedPatientId) };
  }
  if (resolution === DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING && !matchedPatientId) {
    return { eligible: false, reason: "missing-existing-patient", detectionStatus, resolution, matchedPatientIdPresent: false };
  }
  if ([DUPLICATE_RESOLUTION.CREATE_NEW, DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING].includes(resolution)) {
    return { eligible: true, reason: "eligible", detectionStatus, resolution, matchedPatientIdPresent: Boolean(matchedPatientId) };
  }
  return { eligible: false, reason: "invalid-resolution", detectionStatus, resolution, matchedPatientIdPresent: Boolean(matchedPatientId) };
}
