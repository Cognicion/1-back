import { initializePatientTransfer } from "./patientTransferController.js?v=20260830-medication-presentation-bulk-selection-v1";
// Marcador de cache: patientTransferController.js?v=20260830-medication-presentation-bulk-selection-v1

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
