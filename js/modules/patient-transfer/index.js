import { initializePatientTransfer } from "./patientTransferController.js?v=v172-diagnostic-entity-boundaries-v1";
// Marcador de cache: patientTransferController.js?v=v172-diagnostic-entity-boundaries-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
