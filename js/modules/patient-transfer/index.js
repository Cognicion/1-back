import { initializePatientTransfer } from "./patientTransferController.js?v=20260817-medication-fraction-doses-v1";
// Marcador de cache: patientTransferController.js?v=20260817-medication-fraction-doses-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
