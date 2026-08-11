import { initializePatientTransfer } from "./patientTransferController.js?v=v177-resizable-medication-columns-v1";
// Marcador de cache: patientTransferController.js?v=v177-resizable-medication-columns-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
