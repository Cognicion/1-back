import { initializePatientTransfer } from "./patientTransferController.js?v=v171-compound-clinical-headings-v1";
// Marcador de cache: patientTransferController.js?v=v171-compound-clinical-headings-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
