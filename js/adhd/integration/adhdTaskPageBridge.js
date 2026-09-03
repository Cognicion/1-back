import {
  normalizeExistingTaskResult,
  parseExistingTaskContext
} from "../adapters/existingTaskAdapters.js";

export const ADHD_TASK_BRIDGE_CHANNEL = "cognicion.adhd.task";
export const ADHD_TASK_BRIDGE_VERSION = "1.0.0";

export const ADHD_TASK_BRIDGE_TYPES = Object.freeze({
  READY: "ready",
  CONFIG: "config",
  RESULT: "result",
  EVENT: "event",
  ERROR: "error",
  CLOSE: "close"
});

const ALLOWED_TYPES = new Set(Object.values(ADHD_TASK_BRIDGE_TYPES));
const SAFE_TOKEN = /^[a-zA-Z0-9_-]{8,160}$/u;
const EMBEDDED_FOCUS_STYLE_ID = "adhd-embedded-task-focus-style";

function enableEmbeddedFocusMode() {
  const documentRef = globalThis.document;
  documentRef?.documentElement?.classList?.add("adhd-embedded-task");
  if (!documentRef?.head || documentRef.getElementById?.(EMBEDDED_FOCUS_STYLE_ID)) return;
  const style = documentRef.createElement("style");
  style.id = EMBEDDED_FOCUS_STYLE_ID;
  style.textContent = `
    html.adhd-embedded-task body > header,
    html.adhd-embedded-task body > nav,
    html.adhd-embedded-task [data-global-app-header],
    html.adhd-embedded-task [data-accesos-rapidos-global],
    html.adhd-embedded-task #reporteGlobalWidget,
    html.adhd-embedded-task #cognicion-biocellular-background {
      display: none !important;
    }
  `;
  documentRef.head.append(style);
}

function clearBootstrapWindowName() {
  try {
    globalThis.name = "";
  } catch (_) {
    // El token ya fue capturado; un entorno restringido puede impedir limpiar window.name.
  }
}

function ownOrigin() {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") throw new TypeError("El puente TDAH requiere un origen web válido.");
  return origin;
}

function assertSameOrigin(origin) {
  const expected = ownOrigin();
  const candidate = new URL(origin, expected).origin;
  if (candidate !== expected) throw new TypeError("postMessage TDAH solo admite el mismo origen.");
  return candidate;
}

function assertToken(value) {
  const token = String(value || "");
  if (!SAFE_TOKEN.test(token)) throw new TypeError("bridgeToken TDAH ausente o inválido.");
  return token;
}

function safePayload(value) {
  if (value === undefined) return null;
  try {
    return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch (_) {
    throw new TypeError("El payload del puente TDAH debe ser serializable.");
  }
}

function envelope(type, token, payload) {
  if (!ALLOWED_TYPES.has(type)) throw new TypeError(`Tipo de mensaje TDAH no permitido: ${type}`);
  return {
    channel: ADHD_TASK_BRIDGE_CHANNEL,
    version: ADHD_TASK_BRIDGE_VERSION,
    type,
    token: assertToken(token),
    payload: safePayload(payload),
    sentAtIso: new Date().toISOString()
  };
}

function validEnvelope(data, token) {
  return Boolean(
    data
    && typeof data === "object"
    && data.channel === ADHD_TASK_BRIDGE_CHANNEL
    && data.version === ADHD_TASK_BRIDGE_VERSION
    && ALLOWED_TYPES.has(data.type)
    && data.token === token
  );
}

function bridgeContext(context) {
  return {
    taskId: context.taskId,
    taskVersion: context.taskVersion || null,
    programId: context.programId || null,
    sessionId: context.sessionId || null,
    evaluationId: context.evaluationId || null,
    goalId: context.goalId || null,
    challengeId: context.challengeId || null,
    attemptId: context.attemptId || null,
    mode: context.mode || "program",
    randomSeed: context.randomSeed ?? null,
    configuration: context.configuration || {}
  };
}

export function createAdhdTaskBridgeHost({
  iframe,
  context,
  targetOrigin = ownOrigin(),
  onReady = () => {},
  onResult = () => {},
  onEvent = () => {},
  onError = () => {},
  onClose = () => {}
}) {
  if (!iframe || typeof iframe !== "object") throw new TypeError("Se requiere el iframe de la tarea TDAH.");
  const origin = assertSameOrigin(targetOrigin);
  const token = assertToken(context?.bridgeToken);
  let active = true;

  const send = (type, payload) => {
    if (!active || !iframe.contentWindow) return false;
    iframe.contentWindow.postMessage(envelope(type, token, payload), origin);
    return true;
  };

  const handleMessage = (event) => {
    if (!active || event.origin !== origin || event.source !== iframe.contentWindow) return;
    if (!validEnvelope(event.data, token)) return;
    const { type, payload } = event.data;
    if (type === ADHD_TASK_BRIDGE_TYPES.READY) {
      send(ADHD_TASK_BRIDGE_TYPES.CONFIG, bridgeContext(context));
      onReady(payload);
    } else if (type === ADHD_TASK_BRIDGE_TYPES.RESULT) {
      onResult(payload);
    } else if (type === ADHD_TASK_BRIDGE_TYPES.EVENT) {
      onEvent(payload);
    } else if (type === ADHD_TASK_BRIDGE_TYPES.ERROR) {
      onError(payload);
    } else if (type === ADHD_TASK_BRIDGE_TYPES.CLOSE) {
      onClose(payload);
    }
  };

  globalThis.addEventListener("message", handleMessage);
  return Object.freeze({
    origin,
    token,
    sendConfig: () => send(ADHD_TASK_BRIDGE_TYPES.CONFIG, bridgeContext(context)),
    sendEvent: (payload) => send(ADHD_TASK_BRIDGE_TYPES.EVENT, payload),
    close: (payload = { reason: "host_closed" }) => send(ADHD_TASK_BRIDGE_TYPES.CLOSE, payload),
    destroy() {
      if (!active) return;
      active = false;
      globalThis.removeEventListener("message", handleMessage);
    }
  });
}

export function createAdhdTaskPageBridge({
  context = parseExistingTaskContext(),
  parentWindow = globalThis.parent,
  targetOrigin = ownOrigin(),
  onConfig = () => {},
  onEvent = () => {},
  onClose = () => {}
} = {}) {
  if (!context) throw new TypeError("La página no contiene contexto de lanzamiento TDAH.");
  if (!parentWindow || parentWindow === globalThis) throw new TypeError("La tarea TDAH debe estar embebida por una página del mismo origen.");
  const origin = assertSameOrigin(targetOrigin);
  const token = assertToken(context.bridgeToken);
  clearBootstrapWindowName();
  let active = true;
  let executionActive = false;
  enableEmbeddedFocusMode();

  const send = (type, payload) => {
    if (!active) return false;
    parentWindow.postMessage(envelope(type, token, payload), origin);
    return true;
  };

  const handleMessage = (event) => {
    if (!active || event.origin !== origin || event.source !== parentWindow) return;
    if (!validEnvelope(event.data, token)) return;
    if (event.data.type === ADHD_TASK_BRIDGE_TYPES.CONFIG) onConfig(event.data.payload);
    if (event.data.type === ADHD_TASK_BRIDGE_TYPES.EVENT) onEvent(event.data.payload);
    if (event.data.type === ADHD_TASK_BRIDGE_TYPES.CLOSE) onClose(event.data.payload);
  };

  const handleIntegrityLoss = (reason) => {
    if (!active || !executionActive) return;
    executionActive = false;
    send(ADHD_TASK_BRIDGE_TYPES.ERROR, {
      code: "task_integrity_interrupted",
      message: `La tarea perdió una condición de aplicación controlada: ${reason}.`,
      interruptionReason: reason
    });
  };
  const handleVisibility = () => {
    if (globalThis.document?.visibilityState === "hidden") handleIntegrityLoss("visibility_hidden");
  };
  const handleBlur = () => handleIntegrityLoss("window_blur");
  const handlePageHide = () => handleIntegrityLoss("page_hidden");
  const handleOrientation = () => handleIntegrityLoss("orientation_changed");

  globalThis.addEventListener("message", handleMessage);
  globalThis.document?.addEventListener?.("visibilitychange", handleVisibility);
  globalThis.addEventListener?.("blur", handleBlur);
  globalThis.addEventListener?.("pagehide", handlePageHide);
  globalThis.addEventListener?.("orientationchange", handleOrientation);
  send(ADHD_TASK_BRIDGE_TYPES.READY, {
    taskId: context.taskId,
    attemptId: context.attemptId,
    capabilities: ["result", "event", "error"]
  });

  return Object.freeze({
    context: bridgeContext(context),
    origin,
    publishResult(rawResult) {
      executionActive = false;
      const normalized = rawResult?.taskId && rawResult?.metrics
        ? rawResult
        : normalizeExistingTaskResult(context.taskId, rawResult, context);
      return send(ADHD_TASK_BRIDGE_TYPES.RESULT, normalized);
    },
    publishEvent(eventType, payload = {}) {
      if (["practice_started", "task_started"].includes(eventType)) executionActive = true;
      if (["practice_completed", "task_completed", "task_interrupted"].includes(eventType)) executionActive = false;
      return send(ADHD_TASK_BRIDGE_TYPES.EVENT, { eventType, payload: safePayload(payload) });
    },
    publishError(error) {
      executionActive = false;
      return send(ADHD_TASK_BRIDGE_TYPES.ERROR, {
        code: String(error?.code || error?.name || "task_error"),
        message: String(error?.message || "Error de tarea").slice(0, 300)
      });
    },
    destroy() {
      if (!active) return;
      active = false;
      globalThis.removeEventListener("message", handleMessage);
      globalThis.document?.removeEventListener?.("visibilitychange", handleVisibility);
      globalThis.removeEventListener?.("blur", handleBlur);
      globalThis.removeEventListener?.("pagehide", handlePageHide);
      globalThis.removeEventListener?.("orientationchange", handleOrientation);
    }
  });
}

export const crearPuenteHostTareaAdhd = createAdhdTaskBridgeHost;
export const crearPuentePaginaTareaAdhd = createAdhdTaskPageBridge;
