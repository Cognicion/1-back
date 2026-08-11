import { initializePatientTransfer } from "./patientTransferController.js?v=v175-medication-administration-schedules-v1";
// Marcador de cache: patientTransferController.js?v=v175-medication-administration-schedules-v1

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
