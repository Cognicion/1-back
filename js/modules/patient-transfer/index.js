import { initializePatientTransfer } from "./patientTransferController.js?v=v170-general-clinical-sections-v1";
// Marcador de cache: patientTransferController.js?v=v170-general-clinical-sections-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
