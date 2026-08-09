import { initializePatientTransfer } from "./patientTransferController.js?v=20260810-vitals-history-write-proof-v1";
// Marcador histórico de cache: patientTransferController.js?v=20260804-segmentation-debug-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
