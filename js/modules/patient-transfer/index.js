import { initializePatientTransfer } from "./patientTransferController.js?v=20260820-patient-notes-import-v1";
// Marcador de cache: patientTransferController.js?v=20260820-patient-notes-import-v1

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
