import { initializePatientTransfer } from "./patientTransferController.js";

export function openPatientTransfer() {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer();
}
