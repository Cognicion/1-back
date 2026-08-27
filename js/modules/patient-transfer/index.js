import { initializePatientTransfer } from "./patientTransferController.js?v=20260827-panel-pacientes-fallback-v1";
// Marcador de cache: patientTransferController.js?v=20260827-panel-pacientes-fallback-v1

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
