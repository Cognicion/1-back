import { initializePatientTransfer } from "./patientTransferController.js?v=20260811-ssri-interactions-v1";
// Marcador de cache: patientTransferController.js?v=v179-medication-presentation-concentration-ui-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
