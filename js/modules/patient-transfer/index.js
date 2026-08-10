import { initializePatientTransfer } from "./patientTransferController.js?v=v166-imported-notes-v1";
// Marcador de cache: patientTransferController.js?v=v166-imported-notes-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
