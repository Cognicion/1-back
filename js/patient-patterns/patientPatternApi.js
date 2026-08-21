import { obtenerFunctions } from "../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

let functionsPromise;
const callables = new Map();

async function callable(name) {
  if (!functionsPromise) functionsPromise = obtenerFunctions();
  const functions = await functionsPromise;
  if (!callables.has(name)) callables.set(name, httpsCallable(functions, name));
  return callables.get(name);
}

async function call(name, data = {}) {
  const invoke = await callable(name);
  return (await invoke(data)).data;
}

function patientId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError("PATIENT_PATTERN_PATIENT_REQUIRED");
  return normalized;
}

export async function searchAuthorizedPatternPatients(query = "") {
  const result = await call("searchAuthorizedPatternPatients", { query: String(query || "").trim().slice(0, 120) });
  return Array.isArray(result?.patients) ? result.patients : [];
}

export function loadPatientPatternProfile(value) {
  return call("getPatientPatternProfile", { patientId: patientId(value) });
}

export function refreshPatientPatternProfile(value) {
  return call("refreshPatientPatternProfile", { patientId: patientId(value) });
}

export function reviewPatientPatternResult({
  patientId: value,
  targetType,
  targetId,
  action,
  clinicianValue,
  status,
  itemNumber
} = {}) {
  return call("reviewPatientPatternResult", {
    patientId: patientId(value),
    targetType,
    targetId,
    action,
    ...(clinicianValue !== undefined ? { clinicianValue } : {}),
    ...(status ? { status } : {}),
    ...(itemNumber ? { itemNumber } : {})
  });
}
