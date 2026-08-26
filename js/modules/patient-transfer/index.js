import { initializePatientTransfer } from "./patientTransferController.js?v=20260826-cuenta-profesional-gratuita-v1";
// Marcador de cache: patientTransferController.js?v=20260826-cuenta-profesional-gratuita-v1

export function openPatientTransfer(options = {}) {
  const transfer = initializePatientTransfer();
  transfer.openPatientTransfer(options);
}
