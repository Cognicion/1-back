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
  warnings: []
};

export function resetPatientTransferState() {
  state.status = TRANSFER_STATUS.CREATED;
  state.files = [];
  state.groups = [];
  state.results = [];
  state.warnings = [];
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

export function getPatientTransferState() {
  return {
    status: state.status,
    files: state.files,
    groups: state.groups,
    results: state.results,
    warnings: state.warnings
  };
}
