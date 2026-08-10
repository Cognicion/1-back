import { initializePatientTransfer } from "./patientTransferController.js?v=v169-analysis-section-v1";
// Marcador de cache: patientTransferController.js?v=v169-analysis-section-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
