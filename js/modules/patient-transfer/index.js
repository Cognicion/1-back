import { initializePatientTransfer } from "./patientTransferController.js?v=20260813-include-all-data-v1";
// Marcador de cache: patientTransferController.js?v=v179-medication-presentation-concentration-ui-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
