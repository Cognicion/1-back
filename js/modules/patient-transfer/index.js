import { initializePatientTransfer } from "./patientTransferController.js?v=20260828-diagnosis-versus-v2";
// Marcador de cache: patientTransferController.js?v=20260828-diagnosis-versus-v2

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
