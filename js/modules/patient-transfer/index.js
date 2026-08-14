import { initializePatientTransfer } from "./patientTransferController.js?v=20260813-diagnosis-row-prefix-filter-v2";
// Marcador de cache: patientTransferController.js?v=20260813-diagnosis-row-prefix-filter-v2

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
