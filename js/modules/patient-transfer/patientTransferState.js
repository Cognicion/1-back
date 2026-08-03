export const TRANSFER_STATUS = Object.freeze({
  CREATED: "created",
  VALIDATING: "validating",
  EXTRACTING: "extracting",
  ANALYZING: "analyzing",
  AWAITING_REVIEW: "awaiting_review",
  SAVING: "saving",
  PARTIALLY_COMPLETED: "partially_completed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed"
});

const state = {
  status: TRANSFER_STATUS.CREATED,
  files: [],
  groups: [],
  results: [],
  warnings: [],
  transferOperationId: "",
  lastCompletedStage: "",
  patientId: "",
  noteIds: [],
  diagnosisIds: [],
  treatmentIds: [],
  vitalSignIds: [],
  sourceDocumentPath: "",
  isSaving: false
};

export function resetPatientTransferState() {
  state.status = TRANSFER_STATUS.CREATED;
  state.files = [];
  state.groups = [];
  state.results = [];
  state.warnings = [];
  state.transferOperationId = "";
  state.lastCompletedStage = "";
  state.patientId = "";
  state.noteIds = [];
  state.diagnosisIds = [];
  state.treatmentIds = [];
  state.vitalSignIds = [];
  state.sourceDocumentPath = "";
  state.isSaving = false;
  return getPatientTransferState();
}

export function setPatientTransferStatus(status) {
  state.status = status;
  return state.status;
}

export function setPatientTransferFiles(files = []) {
  state.files = files;
  return state.files;
}

export function setPatientTransferGroups(groups = []) {
  state.groups = groups;
  return state.groups;
}

export function setPatientTransferResults(results = []) {
  state.results = results;
  return state.results;
}

export function addPatientTransferWarning(warning = "") {
  if (warning) state.warnings.push(warning);
}

export function setPatientTransferExecutionState(next = {}) {
  const allowed = [
    "transferOperationId", "lastCompletedStage", "patientId", "noteIds",
    "diagnosisIds", "treatmentIds", "vitalSignIds", "sourceDocumentPath", "isSaving"
  ];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(next, key)) state[key] = next[key];
  });
  return getPatientTransferState();
}

export function getPatientTransferState() {
  return {
    status: state.status,
    files: state.files,
    groups: state.groups,
    results: state.results,
    warnings: state.warnings,
    transferOperationId: state.transferOperationId,
    lastCompletedStage: state.lastCompletedStage,
    patientId: state.patientId,
    noteIds: state.noteIds,
    diagnosisIds: state.diagnosisIds,
    treatmentIds: state.treatmentIds,
    vitalSignIds: state.vitalSignIds,
    sourceDocumentPath: state.sourceDocumentPath,
    isSaving: state.isSaving
  };
}
