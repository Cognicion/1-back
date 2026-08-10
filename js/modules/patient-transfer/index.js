import { initializePatientTransfer } from "./patientTransferController.js?v=v163-medications-indications-v1";
// Marcador de cache: patientTransferController.js?v=v163-medications-indications-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
