import { initializePatientTransfer } from "./patientTransferController.js?v=20260814-patient-name-order-v2";
// Marcador de cache: patientTransferController.js?v=20260814-patient-name-order-v2

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
