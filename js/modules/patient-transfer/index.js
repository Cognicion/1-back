import { initializePatientTransfer } from "./patientTransferController.js?v=20260814-medication-name-boundaries-v1";
// Marcador de cache: patientTransferController.js?v=20260814-medication-name-boundaries-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
