import { initializePatientTransfer } from "./patientTransferController.js?v=20260818-diagnoses-studies-v1";
// Marcador de cache: patientTransferController.js?v=20260818-diagnoses-studies-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
