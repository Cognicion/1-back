import { initializePatientTransfer } from "./patientTransferController.js?v=20260815-medication-full-units-v1";
// Marcador de cache: patientTransferController.js?v=20260815-medication-full-units-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
