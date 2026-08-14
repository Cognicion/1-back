import { obtenerFunctions } from "../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_TEXT = 3000;
const FALLBACK_ERROR_CODES = new Set([
  "functions/not-found",
  "functions/unimplemented",
  "not-found",
  "unimplemented"
]);

function normalizedText(value, maxLength = MAX_HISTORY_TEXT) {
  return String(value || "").trim().slice(0, maxLength);
}

function unwrapCallableResult(result) {
  return result?.data && typeof result.data === "object" ? result.data : {};
}

function shouldUseLegacyFallback(error) {
  return FALLBACK_ERROR_CODES.has(String(error?.code || "").toLowerCase());
}

export function createSofiaUnifiedClient({
  functionsFactory = obtenerFunctions,
  callableFactory = httpsCallable
} = {}) {
  let functionsPromise;
  let unifiedCallablePromise;
  let legacyCallablePromise;
  let activePatientId = "";
  let history = [];

  async function getFunctions() {
    if (!functionsPromise) functionsPromise = Promise.resolve(functionsFactory());
    return functionsPromise;
  }

  async function getCallable(name) {
    if (name === "chatSofiaUnified") {
      if (!unifiedCallablePromise) unifiedCallablePromise = getFunctions().then((functions) => callableFactory(functions, name));
      return unifiedCallablePromise;
    }
    if (!legacyCallablePromise) legacyCallablePromise = getFunctions().then((functions) => callableFactory(functions, name));
    return legacyCallablePromise;
  }

  function selectPatient(patientId) {
    const nextPatientId = String(patientId || "").trim();
    if (nextPatientId !== activePatientId) {
      activePatientId = nextPatientId;
      history = [];
    }
  }

  function appendHistory(role, content) {
    const text = normalizedText(content);
    if (!text) return;
    history = [...history, { role, content: text }].slice(-MAX_HISTORY_ITEMS);
  }

  async function ask({ message, patientId = "", pageState = {} } = {}) {
    const normalizedMessage = normalizedText(message, 6000);
    if (!normalizedMessage) throw new TypeError("SOFIA_MESSAGE_REQUIRED");
    selectPatient(patientId);

    try {
      const callable = await getCallable("chatSofiaUnified");
      const result = unwrapCallableResult(await callable({
        mensaje: normalizedMessage,
        patientId: activePatientId || null,
        history,
        pageState
      }));
      appendHistory("user", normalizedMessage);
      appendHistory("assistant", result.respuesta);
      return { ...result, legacyFallback: false };
    } catch (error) {
      if (!shouldUseLegacyFallback(error)) throw error;
      console.warn("[SOFÍA Unified] Orquestador no disponible; se usa el chat anterior.", { code: error?.code || "unknown" });
      const legacyCallable = await getCallable("chatSofia");
      const legacyResult = unwrapCallableResult(await legacyCallable({ mensaje: normalizedMessage }));
      appendHistory("user", normalizedMessage);
      appendHistory("assistant", legacyResult.respuesta);
      return {
        ...legacyResult,
        mode: "legacy",
        toolsUsed: [],
        actions: [],
        clinicalWritesPerformed: false,
        legacyFallback: true
      };
    }
  }

  return {
    ask,
    selectPatient,
    reset() {
      activePatientId = "";
      history = [];
    },
    getState() {
      return { activePatientId, history: history.map((item) => ({ ...item })) };
    }
  };
}

export { shouldUseLegacyFallback };
