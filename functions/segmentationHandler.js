const crypto = require("crypto");

const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v2_2026-07-18";
const CONVERSATION_SEGMENTATION_SCHEMA_VERSION = "conversation_segmentation_v1";
const DEFAULT_SEGMENTATION_MODEL = "gpt-4.1-mini";
const MAX_TRANSCRIPT_CHARS = 120000;
const PROVIDER_TIMEOUT_MS = 35000;

const CONVERSATION_SEGMENTATION_PROMPT = `
Version del prompt: conversation_segmentation_es_mx_v2_2026-07-18.
Segmenta una transcripcion clinica en espanol, sin redactar nota ni diagnosticos.
Divide solo en turnos conversacionales manejables.
Roles permitidos: clinician, patient, relative, unknown.
Actos permitidos: question, answer, observation, clinical_summary, clinical_assessment, plan, correction, other.
Reglas clave: las preguntas no son sintomas; vincula respuestas breves con su pregunta; no inventes hablantes; conserva negaciones, fechas, dosis y texto original; si dudas usa unknown y requiresReview true; no uses "answer/correction".
Devuelve solo JSON estricto:
{
  "transcriptId": "",
  "segmentationMode": "linguistic",
  "schemaVersion": "conversation_segmentation_v1",
  "utterances": [
    {
      "id": "",
      "sequence": 1,
      "startTime": null,
      "endTime": null,
      "text": "",
      "probableRole": "clinician",
      "speechAct": "question",
      "linkedUtteranceId": null,
      "confidence": null,
      "sourceSegmentIds": [],
      "requiresReview": true
    }
  ],
  "warnings": []
}
`;

const ALLOWED_ROLES = new Set(["clinician", "patient", "relative", "unknown"]);
const ALLOWED_SPEECH_ACTS = new Set([
  "question",
  "answer",
  "observation",
  "clinical_summary",
  "clinical_assessment",
  "plan",
  "correction",
  "other"
]);
const ALLOWED_MODES = new Set(["acoustic", "linguistic", "hybrid", "manual"]);
const ALLOWED_LOCALES = new Set(["es", "es-MX", "es-ES"]);

function sanitizeRequestId(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 96);
}

function createRequestId(clientRequestId = "") {
  return sanitizeRequestId(clientRequestId) || `seg-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function serializeDetails(details = {}) {
  return JSON.parse(JSON.stringify(details, (_key, value) => (value === undefined ? null : value)));
}

function makeCallableError(HttpsErrorClass, code, safeMessage, details = {}) {
  return new HttpsErrorClass(code, safeMessage, serializeDetails({
    requestId: details.requestId || "",
    clientRequestId: details.clientRequestId || details.requestId || "",
    stage: details.stage || "unknown",
    safeMessage,
    retryable: Boolean(details.retryable)
  }));
}

function isCallableError(error) {
  return Boolean(error && typeof error.code === "string" && error.details && error.details.requestId);
}

function safeLog(logger, level, payload) {
  const line = serializeDetails({
    event: "segmentClinicalConversation",
    ...payload
  });
  const log = logger && typeof logger[level] === "function" ? logger[level].bind(logger) : console[level].bind(console);
  log(JSON.stringify(line));
}

function pickTranscript(payload = {}) {
  return String(
    payload.transcript ||
    payload.correctedTranscript ||
    payload.text ||
    payload.confirmedTranscript ||
    ""
  ).trim();
}

function validateInput({ data = {}, auth = null, HttpsErrorClass, requestId }) {
  const stage = "input_validation";
  if (!auth || !auth.uid) {
    throw makeCallableError(HttpsErrorClass, "unauthenticated", "Debes iniciar sesion.", {
      requestId,
      stage
    });
  }
  if (data.userId && data.userId !== auth.uid) {
    throw makeCallableError(HttpsErrorClass, "permission-denied", "La sesion de dictado pertenece a otro usuario.", {
      requestId,
      stage
    });
  }
  const transcript = pickTranscript(data);
  if (!transcript) {
    throw makeCallableError(HttpsErrorClass, "invalid-argument", "No hay transcripcion para segmentar.", {
      requestId,
      stage
    });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw makeCallableError(HttpsErrorClass, "resource-exhausted", "La transcripcion es demasiado extensa para segmentarse en una sola solicitud.", {
      requestId,
      stage,
      retryable: false
    });
  }
  const sourceSegments = Array.isArray(data.sourceSegments)
    ? data.sourceSegments
    : (Array.isArray(data.transcriptSegments) ? data.transcriptSegments : []);
  const locale = ALLOWED_LOCALES.has(data.locale) ? data.locale : "es-MX";
  return {
    transcript,
    transcriptId: String(data.transcriptId || data.transcriptSessionId || ""),
    clientRequestId: sanitizeRequestId(data.clientRequestId || requestId),
    blockId: sanitizeRequestId(data.blockId || ""),
    chunkIndex: Number.isFinite(Number(data.chunkIndex)) ? Number(data.chunkIndex) : null,
    chunkCount: Number.isFinite(Number(data.chunkCount)) ? Number(data.chunkCount) : null,
    sourceSegments,
    locale,
    requestedMode: String(data.requestedMode || "linguistic"),
    contextBefore: String(data.contextBefore || "").slice(0, 600),
    contextAfter: String(data.contextAfter || "").slice(0, 600)
  };
}

function extractJsonFromText(text) {
  const clean = String(text || "").trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch (_error) {
    const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    return JSON.parse(objectMatch[0]);
  }
}

function extractResponseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.json === "string") parts.push(content.json);
    }
  }
  return parts.join("\n").trim();
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : "unknown";
}

function normalizeSpeechAct(value, warnings, utteranceId) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "answer/correction" || raw === "correction/answer") {
    warnings.push({
      code: "normalized_speech_act",
      message: "Se normalizo un acto combinado a correction.",
      utteranceId
    });
    return "correction";
  }
  return ALLOWED_SPEECH_ACTS.has(raw) ? raw : "other";
}

function normalizeSourceSegmentIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item?.id || item || "").trim())
    .filter(Boolean);
}

function normalizeUtterance(utterance, index, warnings) {
  const id = String(utterance?.id || `utt-${index + 1}`).trim() || `utt-${index + 1}`;
  const text = String(utterance?.text || "").trim();
  const confidenceNumber = Number(utterance?.confidence);
  return {
    id,
    sequence: Number.isFinite(Number(utterance?.sequence)) ? Number(utterance.sequence) : index + 1,
    startTime: Number.isFinite(Number(utterance?.startTime)) ? Number(utterance.startTime) : null,
    endTime: Number.isFinite(Number(utterance?.endTime)) ? Number(utterance.endTime) : null,
    text,
    probableRole: normalizeRole(utterance?.probableRole),
    speechAct: normalizeSpeechAct(utterance?.speechAct, warnings, id),
    linkedUtteranceId: utterance?.linkedUtteranceId ? String(utterance.linkedUtteranceId) : null,
    confidence: Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(1, confidenceNumber)) : null,
    sourceSegmentIds: normalizeSourceSegmentIds(utterance?.sourceSegmentIds),
    requiresReview: utterance?.requiresReview !== false
  };
}

function validateProviderResult({ parsed, payload, requestId, HttpsErrorClass }) {
  const stage = "schema_validation";
  if (!parsed || typeof parsed !== "object") {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio un objeto JSON interpretable.", {
      requestId,
      stage,
      retryable: true
    });
  }
  const rawUtterances = Array.isArray(parsed.utterances) ? parsed.utterances : [];
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.map((warning) => {
      if (typeof warning === "string") return { message: warning };
      return {
        code: String(warning?.code || ""),
        message: String(warning?.message || warning?.summary || "Advertencia de segmentacion.")
      };
    })
    : [];
  const utterances = rawUtterances
    .map((utterance, index) => normalizeUtterance(utterance, index, warnings))
    .filter((utterance) => utterance.text);

  if (!utterances.length) {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio turnos conversacionales validos.", {
      requestId,
      stage,
      retryable: true
    });
  }

  return {
    requestId,
    provider: "external",
    mode: ALLOWED_MODES.has(parsed.segmentationMode) ? parsed.segmentationMode : "linguistic",
    transcriptId: String(parsed.transcriptId || payload.transcriptId || ""),
    segmentationMode: ALLOWED_MODES.has(parsed.segmentationMode) ? parsed.segmentationMode : "linguistic",
    schemaVersion: CONVERSATION_SEGMENTATION_SCHEMA_VERSION,
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    utterances: utterances.map((utterance, index) => ({
      ...utterance,
      sequence: index + 1
    })),
    warnings
  };
}

function mapProviderError({ error, HttpsErrorClass, requestId, stage }) {
  if (isCallableError(error)) return error;
  const status = Number(error?.status || error?.code || error?.response?.status);
  const message = String(error?.message || "");
  if (message === "provider_timeout") {
    return makeCallableError(HttpsErrorClass, "deadline-exceeded", "El proveedor tardo demasiado en responder.", {
      requestId,
      stage,
      retryable: true
    });
  }
  if (status === 401 || status === 403) {
    return makeCallableError(HttpsErrorClass, "failed-precondition", "La configuracion del proveedor externo no esta disponible.", {
      requestId,
      stage,
      retryable: false
    });
  }
  if (status === 408 || status === 504) {
    return makeCallableError(HttpsErrorClass, "deadline-exceeded", "El proveedor tardo demasiado en responder.", {
      requestId,
      stage,
      retryable: true
    });
  }
  if (status === 429) {
    return makeCallableError(HttpsErrorClass, "resource-exhausted", "El proveedor externo alcanzo un limite temporal.", {
      requestId,
      stage,
      retryable: true
    });
  }
  if (status >= 500) {
    return makeCallableError(HttpsErrorClass, "unavailable", "El proveedor externo no esta disponible temporalmente.", {
      requestId,
      stage,
      retryable: true
    });
  }
  if (stage === "parse_json") {
    return makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio JSON valido.", {
      requestId,
      stage,
      retryable: true
    });
  }
  return makeCallableError(HttpsErrorClass, "internal", "Error inesperado al segmentar la conversacion.", {
    requestId,
    stage,
    retryable: false
  });
}

async function callProvider({ client, model, providerInput, timeoutMs = PROVIDER_TIMEOUT_MS }) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutHandle;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("provider_timeout"));
        if (controller) controller.abort();
      }, timeoutMs);
    });
    return await Promise.race([
      client.responses.create({
        model,
        instructions: CONVERSATION_SEGMENTATION_PROMPT,
        input: JSON.stringify(providerInput)
      }, {
        signal: controller?.signal,
        timeout: timeoutMs,
        maxRetries: 0
      }),
      timeoutPromise
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runSegmentClinicalConversation({
  data,
  auth,
  apiKey,
  env = process.env,
  OpenAIClass,
  HttpsErrorClass,
  logger = console,
  openaiClient = null,
  timeoutMs = PROVIDER_TIMEOUT_MS
}) {
  const requestId = createRequestId(data?.clientRequestId);
  const startedAt = Date.now();
  let stage = "input_validation";
  let transcriptLength = 0;
  let transcriptHash = "";
  let sourceSegmentCount = 0;
  let chunkCount = 1;
  let blockId = "";
  let model = env.OPENAI_SEGMENTATION_MODEL || env.OPENAI_NOTE_MODEL || DEFAULT_SEGMENTATION_MODEL;

  try {
    const payload = validateInput({ data, auth, HttpsErrorClass, requestId });
    transcriptLength = payload.transcript.length;
    transcriptHash = hashText(payload.transcript);
    sourceSegmentCount = payload.sourceSegments.length;
    chunkCount = payload.chunkCount || 1;
    blockId = payload.blockId;

    stage = "configuration";
    if (!apiKey || typeof apiKey !== "string") {
      throw makeCallableError(HttpsErrorClass, "failed-precondition", "No esta configurado el proveedor externo de segmentacion.", {
        requestId,
        stage,
        retryable: false
      });
    }

    stage = "provider_request";
    safeLog(logger, "info", {
      requestId,
      stage,
      transcriptLength,
      transcriptCharacters: transcriptLength,
      estimatedInputTokens: Math.ceil(transcriptLength / 4),
      transcriptHash,
      sourceSegmentCount,
      chunkCount,
      blockId,
      elapsedMs: Date.now() - startedAt,
      model,
      provider: "openai"
    });

    const client = openaiClient || new OpenAIClass({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0
    });
    const response = await callProvider({
      client,
      model,
      timeoutMs,
      providerInput: {
        transcriptId: payload.transcriptId,
        clientRequestId: payload.clientRequestId,
        blockId: payload.blockId,
        chunkIndex: payload.chunkIndex,
        chunkCount: payload.chunkCount,
        locale: payload.locale,
        requestedMode: payload.requestedMode,
        contextBefore: payload.contextBefore,
        contextAfter: payload.contextAfter,
        transcript: payload.transcript,
        sourceSegments: payload.sourceSegments.map((segment, index) => ({
          id: String(segment?.id || `src-${index + 1}`),
          startTime: Number.isFinite(Number(segment?.startTime)) ? Number(segment.startTime) : null,
          endTime: Number.isFinite(Number(segment?.endTime)) ? Number(segment.endTime) : null,
          text: String(segment?.text || "")
        }))
      }
    });

    stage = "extract_response";
    const outputText = extractResponseText(response);
    if (!outputText) {
      throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio contenido.", {
        requestId,
        stage,
        retryable: true
      });
    }

    stage = "parse_json";
    let parsed;
    try {
      parsed = extractJsonFromText(outputText);
    } catch (error) {
      throw mapProviderError({ error, HttpsErrorClass, requestId, stage });
    }
    if (!parsed) {
      throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio JSON valido.", {
        requestId,
        stage,
        retryable: true
      });
    }

    const result = validateProviderResult({
      parsed,
      payload,
      requestId,
      HttpsErrorClass
    });

    safeLog(logger, "info", {
      requestId,
      stage: "complete",
      durationMs: Date.now() - startedAt,
      elapsedMs: Date.now() - startedAt,
      transcriptLength,
      transcriptCharacters: transcriptLength,
      estimatedInputTokens: Math.ceil(transcriptLength / 4),
      transcriptHash,
      sourceSegmentCount,
      chunkCount,
      blockId,
      utteranceCount: result.utterances.length,
      warningCount: result.warnings.length,
      model,
      provider: "openai"
    });
    return result;
  } catch (error) {
    const mappedError = mapProviderError({ error, HttpsErrorClass, requestId, stage });
    safeLog(logger, "error", {
      requestId,
      stage: mappedError.details?.stage || stage,
      durationMs: Date.now() - startedAt,
      elapsedMs: Date.now() - startedAt,
      transcriptLength,
      transcriptCharacters: transcriptLength,
      estimatedInputTokens: Math.ceil(transcriptLength / 4),
      transcriptHash,
      sourceSegmentCount,
      chunkCount,
      blockId,
      model,
      errorName: error?.name || mappedError?.name || "Error",
      errorCode: error?.code || mappedError?.code || "",
      providerStatus: error?.status || error?.response?.status || null,
      message: error?.message || mappedError?.message || "",
      stack: error?.stack || ""
    });
    throw mappedError;
  }
}

module.exports = {
  CONVERSATION_SEGMENTATION_PROMPT,
  CONVERSATION_SEGMENTATION_PROMPT_VERSION,
  CONVERSATION_SEGMENTATION_SCHEMA_VERSION,
  DEFAULT_SEGMENTATION_MODEL,
  MAX_TRANSCRIPT_CHARS,
  extractJsonFromText,
  extractResponseText,
  validateProviderResult,
  runSegmentClinicalConversation
};
