import { initializePatientTransfer } from "./patientTransferController.js?v=20260816-expedientes-cognicion-v1";
// Marcador de cache: patientTransferController.js?v=20260816-expedientes-cognicion-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
