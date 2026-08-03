export class PatientTransferTimeoutError extends Error {
  constructor(message, stage) {
    super(message);
    this.name = "PatientTransferTimeoutError";
    this.code = "patient-transfer/timeout";
    this.stage = stage;
  }
}

export function withPatientTransferTimeout(promise, milliseconds, stageName) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new PatientTransferTimeoutError(`La etapa ${stageName} excedio el tiempo permitido.`, stageName));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
