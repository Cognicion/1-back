import { initializePatientTransfer } from "./patientTransferController.js?v=v174-plan-hierarchy-dedup-v1";
// Marcador de cache: patientTransferController.js?v=v174-plan-hierarchy-dedup-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
