const crypto = require("crypto");

const NOTE_PROMPT_VERSION = "psychiatric_voice_note_es_mx_v1";
const NOTE_SCHEMA_VERSION = "voice_note_evolution_v1";
const DEFAULT_NOTE_MODEL = "gpt-4.1-mini";
const PROVIDER_TIMEOUT_MS = 65000;
const MAX_UTTERANCES = 220;
const MAX_UTTERANCE_CHARS = 1800;
const MAX_TOTAL_CHARS = 60000;

const NOTE_PROMPT = `
Version del prompt: psychiatric_voice_note_es_mx_v1.
Eres un asistente especializado en documentacion psiquiatrica institucional en espanol de Mexico.

Recibiras una segmentacion conversacional revisada con roles y actos comunicativos. Usa esa segmentacion como fuente principal; no vuelvas a segmentar toda la entrevista.

Genera exclusivamente la seccion evolution para una nota psiquiatrica. No generes examen mental, analisis ni plan.

Reglas clinicas:
- Redacta en tercera persona, con lenguaje medico formal e institucional.
- Usa datos administrativos del patientContext como prioridad para nombre, edad, sexo, servicio, encuentro, dia de estancia y criterio.
- No infieras sexo por nombre.
- No inventes informacion ni completes hallazgos normales.
- Conserva negaciones, temporalidad, procedencia e incertidumbre.
- No conviertas preguntas del profesional en sintomas.
- No copies intervenciones del profesional.
- No conviertas "valorar" en "iniciar".
- No conviertas antecedentes o tratamientos previos en acciones actuales.
- No incluyas indicaciones, ordenes medicas, analisis diagnostico extenso ni examen mental detallado.
- No emitas texto fuera del JSON.

Estilo de evolution:
- Entre tres y cinco parrafos narrativos, sin subtitulos internos y sin listas.
- Inicio con nombre, sexo, edad, dia de estancia, servicio y criterio solo si estan disponibles.
- Describe brevemente el abordaje, lugar, posicion, aceptacion, cooperacion y conducta general si fueron documentados.
- Integra evolucion de sintomas relevantes, riesgo referido, red de apoyo, respuesta/adherencia referidas, consumo si aparece y eventualidades medicas.
- Cierra con sueno, alimentacion, diuresis, evacuaciones, sintomas fisicos, efectos adversos y eventualidades medicas si fueron documentados.
- Incluye citas breves utiles con "sic. Pac." o "sic. Fam.".

Devuelve JSON estricto con este esquema:
{
  "sections": {
    "evolution": {
      "text": "",
      "sourceUtteranceIds": [],
      "confidence": null,
      "requiresReview": true,
      "warnings": []
    }
  },
  "globalWarnings": []
}
`;

const FORBIDDEN_EVOLUTION_PATTERNS = [
  /\bquiero preguntarle\b/i,
  /\bquiero revisar\b/i,
  /\bvoy a resumir\b/i,
  /\bsabe (?:aproximadamente )?qu[eé] fecha\b/i,
  /\bdurante la entrevista se observa\b/i,
  /\bcontacto visual\b/i,
  /\bpsicomotricidad\b/i,
  /\bcurso del pensamiento\b/i,
  /\bjuicio (?:parcialmente )?comprometido\b/i,
  /\bse mantendr[aá]n?\b/i,
  /\bsolicitar\b/i,
  /\breevaluar\b/i,
  /\bsignos vitales por turno\b/i,
  /\bcontinuar tratamiento\b/i,
  /\([^)]*$/i,
  /\bno solamente quiero\b/i
];

function sanitizeRequestId(value = "") {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 96);
}

function createRequestId(clientRequestId = "") {
  return sanitizeRequestId(clientRequestId) || `note-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
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
    event: "generateStructuredNoteFromDictation",
    ...payload
  });
  const log = logger && typeof logger[level] === "function" ? logger[level].bind(logger) : console[level].bind(console);
  log(JSON.stringify(line));
}

function extractJsonFromText(text) {
  const clean = String(text || "").trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch (_error) {
    const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) return JSON.parse(fenced[1]);
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

function normalizeString(value = "") {
  return String(value || "").trim();
}

function normalizePatientContext(value = {}) {
  const ctx = value && typeof value === "object" ? value : {};
  return {
    patientId: normalizeString(ctx.patientId || ctx.id),
    encounterId: normalizeString(ctx.encounterId),
    name: normalizeString(ctx.name || ctx.nombreCompleto || ctx.nombre),
    age: Number.isInteger(Number(ctx.age ?? ctx.edad)) ? Number(ctx.age ?? ctx.edad) : null,
    sex: normalizeString(ctx.sex || ctx.sexo),
    service: normalizeString(ctx.service || ctx.servicio),
    hospitalizationDay: Number.isInteger(Number(ctx.hospitalizationDay ?? ctx.diaEstancia)) ? Number(ctx.hospitalizationDay ?? ctx.diaEstancia) : null,
    admissionCriterion: normalizeString(ctx.admissionCriterion || ctx.criterio)
  };
}

function normalizeNoteConfiguration(value = {}) {
  const cfg = value && typeof value === "object" ? value : {};
  return {
    noteType: normalizeString(cfg.noteType || cfg.selectedDocumentType || "evolucion_observacion"),
    styleId: normalizeString(cfg.styleId || cfg.selectedWritingStyle || "evolucion_narrativa_institucional"),
    templateId: normalizeString(cfg.templateId),
    promptVersion: normalizeString(cfg.promptVersion || NOTE_PROMPT_VERSION)
  };
}

function normalizeSourceUtteranceIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item?.id || item)).filter(Boolean);
}

function normalizeUtterances(value = []) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_UTTERANCES).map((utterance, index) => {
    const id = normalizeString(utterance?.id || utterance?.utteranceId || `utt-${index + 1}`) || `utt-${index + 1}`;
    return {
      id,
      sequence: Number.isFinite(Number(utterance?.sequence)) ? Number(utterance.sequence) : index + 1,
      text: normalizeString(utterance?.text || utterance?.originalText).slice(0, MAX_UTTERANCE_CHARS),
      probableRole: normalizeString(utterance?.probableRole || "unknown"),
      speechAct: normalizeString(utterance?.speechAct || "other"),
      linkedUtteranceId: utterance?.linkedUtteranceId ? normalizeString(utterance.linkedUtteranceId) : null,
      sourceSegmentIds: normalizeSourceUtteranceIds(utterance?.sourceSegmentIds),
      requiresReview: utterance?.requiresReview !== false
    };
  }).filter((utterance) => utterance.text);
}

function validateInput({ data = {}, auth = null, HttpsErrorClass, requestId }) {
  const stage = "input_validation";
  if (!auth || !auth.uid) {
    throw makeCallableError(HttpsErrorClass, "unauthenticated", "Debes iniciar sesion.", { requestId, stage });
  }
  const patientContext = normalizePatientContext(data.patientContext || data.authorizedPatientContext || {});
  const noteConfiguration = normalizeNoteConfiguration(data.noteConfiguration || data);
  const transcriptObject = data.transcript && typeof data.transcript === "object" ? data.transcript : {};
  const utterances = normalizeUtterances(
    transcriptObject.utterances ||
    data.utterances ||
    data.conversationSegments ||
    []
  );
  const allTextLength = utterances.reduce((sum, utterance) => sum + utterance.text.length, 0);
  const patientId = normalizeString(patientContext.patientId || data.patientId);
  const encounterId = normalizeString(patientContext.encounterId || data.encounterId);

  if (!patientId) {
    throw makeCallableError(HttpsErrorClass, "invalid-argument", "patientContext.patientId es obligatorio.", { requestId, stage });
  }
  if (data.userId && data.userId !== auth.uid) {
    throw makeCallableError(HttpsErrorClass, "permission-denied", "La sesion de dictado pertenece a otro usuario.", { requestId, stage });
  }
  if (transcriptObject.patientId && normalizeString(transcriptObject.patientId) !== patientId) {
    throw makeCallableError(HttpsErrorClass, "permission-denied", "La transcripcion no corresponde al paciente seleccionado.", { requestId, stage });
  }
  if (transcriptObject.encounterId && encounterId && normalizeString(transcriptObject.encounterId) !== encounterId) {
    throw makeCallableError(HttpsErrorClass, "permission-denied", "La transcripcion no corresponde al encuentro seleccionado.", { requestId, stage });
  }
  if (!utterances.length) {
    throw makeCallableError(HttpsErrorClass, "invalid-argument", "La segmentacion conversacional esta vacia.", { requestId, stage });
  }
  if (allTextLength > MAX_TOTAL_CHARS) {
    throw makeCallableError(HttpsErrorClass, "resource-exhausted", "La segmentacion es demasiado extensa para generar Evolucion en una sola solicitud.", {
      requestId,
      stage,
      retryable: false
    });
  }

  return {
    clientRequestId: sanitizeRequestId(data.clientRequestId || requestId),
    patientContext: { ...patientContext, patientId, encounterId },
    noteConfiguration: { ...noteConfiguration, promptVersion: NOTE_PROMPT_VERSION },
    transcript: {
      transcriptId: normalizeString(transcriptObject.transcriptId || data.transcriptSessionId || data.sessionId),
      originalTextHash: normalizeString(transcriptObject.originalTextHash || data.originalTextHash || hashText(utterances.map((u) => u.text).join("\n"))),
      segmentationMode: normalizeString(transcriptObject.segmentationMode || data.segmentationMode || "hybrid"),
      utterances
    },
    metrics: {
      utteranceCount: utterances.length,
      transcriptCharacters: allTextLength,
      estimatedInputTokens: Math.ceil(allTextLength / 4)
    }
  };
}

function buildProviderInput(payload) {
  return {
    patientContext: payload.patientContext,
    noteConfiguration: payload.noteConfiguration,
    transcript: {
      transcriptId: payload.transcript.transcriptId,
      originalTextHash: payload.transcript.originalTextHash,
      segmentationMode: payload.transcript.segmentationMode,
      utterances: payload.transcript.utterances.map((utterance) => ({
        id: utterance.id,
        sequence: utterance.sequence,
        text: utterance.text,
        probableRole: utterance.probableRole,
        speechAct: utterance.speechAct,
        linkedUtteranceId: utterance.linkedUtteranceId,
        requiresReview: utterance.requiresReview
      }))
    }
  };
}

async function callProvider({ client, model, providerInput, extraInstruction = "", timeoutMs = PROVIDER_TIMEOUT_MS }) {
  let timeoutHandle;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("provider_timeout")), timeoutMs);
    });
    return await Promise.race([
      client.responses.create({
        model,
        instructions: extraInstruction ? `${NOTE_PROMPT}\n\n${extraInstruction}` : NOTE_PROMPT,
        input: JSON.stringify(providerInput)
      }),
      timeoutPromise
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function normalizeWarnings(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((warning) => {
    if (typeof warning === "string") return { message: warning };
    return {
      code: normalizeString(warning?.code),
      message: normalizeString(warning?.message || warning?.summary || "Requiere revision profesional."),
      severity: normalizeString(warning?.severity || "info")
    };
  });
}

function validateEvolutionText(text = "", knownUtteranceIds = new Set()) {
  const issues = [];
  const clean = normalizeString(text);
  if (!clean) {
    issues.push({ code: "empty_evolution", message: "evolution.text esta vacio.", severity: "high" });
  }
  for (const pattern of FORBIDDEN_EVOLUTION_PATTERNS) {
    if (pattern.test(clean)) {
      issues.push({ code: "contaminated_evolution", message: "La Evolucion contiene preguntas, plan, examen mental detallado o fragmentos no integrados.", severity: "high" });
      break;
    }
  }
  const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length > 5) {
    issues.push({ code: "too_many_paragraphs", message: "La Evolucion excede cinco parrafos narrativos.", severity: "high" });
  }
  if (/[?¿]/.test(clean)) {
    issues.push({ code: "question_in_evolution", message: "La Evolucion conserva preguntas del entrevistador.", severity: "high" });
  }
  return issues.map((issue) => ({
    ...issue,
    knownUtteranceIdCount: knownUtteranceIds.size
  }));
}

function validateProviderResult({ parsed, payload, requestId, HttpsErrorClass }) {
  const stage = "schema_validation";
  if (!parsed || typeof parsed !== "object") {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio un objeto JSON interpretable.", { requestId, stage, retryable: true });
  }
  const unknownSections = Object.keys(parsed.sections || {}).filter((key) => key !== "evolution");
  if (unknownSections.length) {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor devolvio secciones no solicitadas.", { requestId, stage, retryable: true });
  }
  const rawEvolution = parsed.sections?.evolution || {};
  const text = normalizeString(rawEvolution.text);
  const knownUtteranceIds = new Set(payload.transcript.utterances.map((utterance) => utterance.id));
  const sourceUtteranceIds = normalizeSourceUtteranceIds(rawEvolution.sourceUtteranceIds)
    .filter((id) => knownUtteranceIds.has(id) || id === "patientContext");
  const warnings = normalizeWarnings(rawEvolution.warnings);
  const blockingIssues = validateEvolutionText(text, knownUtteranceIds);

  if (!text || blockingIssues.some((issue) => issue.severity === "high")) {
    throw makeCallableError(HttpsErrorClass, "data-loss", "No fue posible validar la Evolucion generada.", {
      requestId,
      stage,
      retryable: true
    });
  }
  if (!sourceUtteranceIds.length) {
    warnings.push({
      code: "missing_traceability",
      message: "La Evolucion no incluyo trazabilidad suficiente por fragmento.",
      severity: "medium"
    });
  }

  return {
    requestId,
    provider: "external",
    model: "",
    promptVersion: NOTE_PROMPT_VERSION,
    schemaVersion: NOTE_SCHEMA_VERSION,
    sections: {
      evolution: {
        text,
        sourceUtteranceIds,
        confidence: Number.isFinite(Number(rawEvolution.confidence)) ? Math.max(0, Math.min(1, Number(rawEvolution.confidence))) : null,
        requiresReview: rawEvolution.requiresReview !== false,
        warnings
      }
    },
    globalWarnings: normalizeWarnings(parsed.globalWarnings)
  };
}

function mapProviderError({ error, HttpsErrorClass, requestId, stage }) {
  if (isCallableError(error)) return error;
  const status = Number(error?.status || error?.code || error?.response?.status);
  const message = String(error?.message || "");
  if (message === "provider_timeout") {
    return makeCallableError(HttpsErrorClass, "deadline-exceeded", "El proveedor tardo demasiado en responder.", { requestId, stage, retryable: true });
  }
  if (status === 401 || status === 403) {
    return makeCallableError(HttpsErrorClass, "failed-precondition", "La configuracion del proveedor externo no esta disponible.", { requestId, stage, retryable: false });
  }
  if (status === 408 || status === 504) {
    return makeCallableError(HttpsErrorClass, "deadline-exceeded", "El proveedor tardo demasiado en responder.", { requestId, stage, retryable: true });
  }
  if (status === 429) {
    return makeCallableError(HttpsErrorClass, "resource-exhausted", "El proveedor externo alcanzo un limite temporal.", { requestId, stage, retryable: true });
  }
  if (status >= 500) {
    return makeCallableError(HttpsErrorClass, "unavailable", "El proveedor externo no esta disponible temporalmente.", { requestId, stage, retryable: true });
  }
  if (stage === "parse_json" || stage === "schema_validation") {
    return makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio una Evolucion valida.", { requestId, stage, retryable: true });
  }
  return makeCallableError(HttpsErrorClass, "internal", "Error inesperado al generar la Evolucion.", { requestId, stage, retryable: false });
}

async function runGenerateStructuredNoteFromDictation({
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
  let payload = null;
  const model = env.OPENAI_NOTE_MODEL || DEFAULT_NOTE_MODEL;

  try {
    payload = validateInput({ data, auth, HttpsErrorClass, requestId });

    stage = "configuration";
    if (!apiKey || typeof apiKey !== "string") {
      throw makeCallableError(HttpsErrorClass, "failed-precondition", "No esta configurado el proveedor externo de notas.", {
        requestId,
        stage,
        retryable: false
      });
    }

    const client = openaiClient || new OpenAIClass({ apiKey });
    const providerInput = buildProviderInput(payload);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      stage = attempt === 1 ? "provider_request" : "provider_retry";
      safeLog(logger, "info", {
        requestId,
        stage,
        elapsedMs: Date.now() - startedAt,
        transcriptCharacters: payload.metrics.transcriptCharacters,
        utteranceCount: payload.metrics.utteranceCount,
        estimatedInputTokens: payload.metrics.estimatedInputTokens,
        transcriptHash: payload.transcript.originalTextHash || hashText(JSON.stringify(providerInput.transcript.utterances)),
        provider: "openai",
        model,
        promptVersion: NOTE_PROMPT_VERSION,
        schemaVersion: NOTE_SCHEMA_VERSION,
        attempt
      });

      const response = await callProvider({
        client,
        model,
        providerInput,
        timeoutMs,
        extraInstruction: attempt === 2
          ? "Regenera solo evolution. La respuesta anterior no paso validacion. Elimina preguntas, examen mental detallado, analisis y plan."
          : ""
      });

      stage = "extract_response";
      const outputText = extractResponseText(response);
      if (!outputText) {
        throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio contenido.", { requestId, stage, retryable: true });
      }

      stage = "parse_json";
      let parsed;
      try {
        parsed = extractJsonFromText(outputText);
      } catch (error) {
        if (attempt === 1) continue;
        throw mapProviderError({ error, HttpsErrorClass, requestId, stage });
      }
      if (!parsed && attempt === 1) continue;

      stage = "schema_validation";
      try {
        const result = validateProviderResult({ parsed, payload, requestId, HttpsErrorClass });
        result.model = model;
        result.durationMs = Date.now() - startedAt;
        safeLog(logger, "info", {
          requestId,
          stage: "complete",
          elapsedMs: Date.now() - startedAt,
          durationMs: Date.now() - startedAt,
          transcriptCharacters: payload.metrics.transcriptCharacters,
          utteranceCount: payload.metrics.utteranceCount,
          estimatedInputTokens: payload.metrics.estimatedInputTokens,
          provider: "openai",
          model,
          promptVersion: NOTE_PROMPT_VERSION,
          schemaVersion: NOTE_SCHEMA_VERSION,
          warningCount: result.globalWarnings.length + result.sections.evolution.warnings.length
        });
        return result;
      } catch (error) {
        if (attempt === 1) continue;
        throw error;
      }
    }
  } catch (error) {
    const mappedError = mapProviderError({ error, HttpsErrorClass, requestId, stage });
    safeLog(logger, "error", {
      requestId,
      stage: mappedError.details?.stage || stage,
      elapsedMs: Date.now() - startedAt,
      durationMs: Date.now() - startedAt,
      transcriptCharacters: payload?.metrics?.transcriptCharacters || 0,
      utteranceCount: payload?.metrics?.utteranceCount || 0,
      estimatedInputTokens: payload?.metrics?.estimatedInputTokens || 0,
      provider: "openai",
      model,
      promptVersion: NOTE_PROMPT_VERSION,
      schemaVersion: NOTE_SCHEMA_VERSION,
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
  NOTE_PROMPT,
  NOTE_PROMPT_VERSION,
  NOTE_SCHEMA_VERSION,
  DEFAULT_NOTE_MODEL,
  PROVIDER_TIMEOUT_MS,
  extractJsonFromText,
  extractResponseText,
  validateProviderResult,
  validateEvolutionText,
  runGenerateStructuredNoteFromDictation
};
