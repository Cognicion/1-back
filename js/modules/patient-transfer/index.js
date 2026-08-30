import { initializePatientTransfer } from "./patientTransferController.js?v=20260830-study-diagnosis-medication-dedup-v1";
// Marcador de cache: patientTransferController.js?v=20260830-study-diagnosis-medication-dedup-v1

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
