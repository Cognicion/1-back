import { initializePatientTransfer } from "./patientTransferController.js?v=v168-institution-hpfba-v1";
// Marcador de cache: patientTransferController.js?v=v168-institution-hpfba-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
