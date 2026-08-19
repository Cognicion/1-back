import { initializePatientTransfer } from "./patientTransferController.js?v=20260819-midc-allergy-context-v1";
// Marcador de cache: patientTransferController.js?v=20260819-midc-allergy-context-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
