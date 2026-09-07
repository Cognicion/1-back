import { obtenerFunctions } from "../firebase.js";

let functionsSdkPromise = null;
let commandCallablePromise = null;

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

function createRequestId(prefix = "agenda") {
  const safePrefix = String(prefix || "agenda").replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 32) || "agenda";
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}_${random}`.slice(0, 160);
}

async function getCommandCallable() {
  if (!commandCallablePromise) {
    commandCallablePromise = Promise.all([obtenerFunctions(), getFunctionsSdk()])
      .then(([functions, { httpsCallable }]) => httpsCallable(functions, "manageAppointment", { timeout: 60000 }));
  }
  return commandCallablePromise;
}

export function appointmentErrorCode(error) {
  return String(error?.details?.appointmentCode || error?.code || "internal");
}

export async function executeAppointmentCommand({ action, appointmentId = "", input = {}, settings = undefined, requestId = "" }) {
  const callable = await getCommandCallable();
  const payload = { action, appointmentId: appointmentId || undefined, input, settings, requestId: requestId || createRequestId(`agenda_${action}`) };
  console.debug("[AGENDA_TRACE] adapter→manageAppointment", { action, hasAppointment: Boolean(appointmentId) });
  try {
    const result = await callable(payload);
    console.debug("[AGENDA_TRACE] manageAppointment→adapter", { action, result: result.data?.result || "ok" });
    return result.data || {};
  } catch (error) {
    console.debug("[AGENDA_TRACE] manageAppointment→adapter:error", { action, code: appointmentErrorCode(error) });
    throw error;
  }
}

export { createRequestId };
