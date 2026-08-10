import { initializePatientTransfer } from "./patientTransferController.js?v=v167-enedina-name-diagnosis-boundaries-v1";
// Marcador de cache: patientTransferController.js?v=v167-enedina-name-diagnosis-boundaries-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
