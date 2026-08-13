import { initializePatientTransfer } from "./patientTransferController.js?v=20260813-notes-canonical-text-v1";
// Marcador de cache: patientTransferController.js?v=20260813-notes-canonical-text-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
