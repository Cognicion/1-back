const crypto = require("crypto");

const NOTE_PROMPT_VERSION = "psychiatric_voice_note_es_mx_v2";
const NOTE_SCHEMA_VERSION = "voice_note_evolution_v1";
const EVOLUTION_VALIDATOR_VERSION = "evolution_semantic_validator_v2";
const DEFAULT_NOTE_MODEL = "gpt-4.1-mini";
const PROVIDER_TIMEOUT_MS = 65000;
const MAX_UTTERANCES = 220;
const MAX_UTTERANCE_CHARS = 1800;
const MAX_TOTAL_CHARS = 60000;

const NOTE_PROMPT = `
Version del prompt: psychiatric_voice_note_es_mx_v2.
Eres un asistente especializado en documentacion psiquiatrica institucional en espanol de Mexico.

Recibiras una segmentacion conversacional revisada con roles y actos comunicativos. Usa esa segmentacion como fuente principal; no vuelvas a segmentar toda la entrevista.

Genera exclusivamente la seccion evolution para una nota psiquiatrica. No generes examen mental, analisis ni plan.

Reglas clinicas:
- Redacta en tercera persona, con lenguaje medico formal e institucional.
- Usa datos administrativos del patientContext como prioridad para nombre, edad, sexo, servicio, encuentro, dia de estancia y criterio.
- Si patientContext.hospitalizationDay es null o no esta disponible, no escribas "dia 0" ni inventes dia de estancia. Usa una construccion como "quien permanece en estancia intrahospitalaria en el servicio especial de OBSERVACION" si el servicio esta disponible.
- Si falta el criterio de ingreso, omitelo; no escribas "no especificado", "actual", "pendiente" ni sustitutos administrativos dentro del cuerpo clinico.
- No infieras sexo por nombre.
- No inventes informacion ni completes hallazgos normales.
- Conserva negaciones, temporalidad, procedencia e incertidumbre.
- No conviertas preguntas del profesional en sintomas.
- No copies intervenciones del profesional.
- No conviertas "valorar" en "iniciar".
- No conviertas antecedentes o tratamientos previos en acciones actuales.
- No incluyas indicaciones, ordenes medicas, analisis diagnostico extenso ni examen mental detallado.
- No escribas postura, cama, consultorio, cooperacion, aceptacion, orientacion, tranquilidad conductual ni ausencia de agitacion si no existe una fuente explicita en patientContext, observation del profesional o registro estructurado confiable.
- Usa evolutionCoverage como lista de hechos relevantes obligatorios. Cada hecho debe quedar incluido, marcado como incierto o explicado como excluido en warnings; no omitas medicamentos, efectos adversos, negaciones de riesgo, red de apoyo ni disposicion terapeutica si aparecen.
- Usa explorationMatrix para diferenciar dominios explorados, negados, inciertos, no mencionados y desconocidos. Si explored=false y status=unknown, omite el dominio; no escribas normalidad por ausencia de informacion.
- Si el paciente refiere que su madre puede ayudarle, redacta "considera que podria recibir apoyo de su madre"; no escribas que la madre se compromete si no existe un segmento sourceRole=relative de la madre.
- Redacta "privacion de sueno" o "insomnio" segun la fuente; nunca uses el anglicismo "insomnia".
- Evita dobles negaciones clinicas. Redacta de forma directa: "niega ideas de muerte, ideacion suicida e intencion de causar dano a otras personas".
- No emitas texto fuera del JSON.

Estilo de evolution:
- Entre dos y cuatro parrafos narrativos proporcionales a la informacion, sin subtitulos internos y sin listas. Si existen tres o mas dominios clinicos, no devuelvas un unico parrafo.
- Inicio con nombre, sexo, edad, dia de estancia, servicio y criterio solo si estan disponibles.
- Describe brevemente el abordaje, lugar, posicion, aceptacion, cooperacion y conducta general si fueron documentados.
- Integra evolucion de sintomas relevantes, riesgo referido, red de apoyo, respuesta/adherencia referidas, consumo si aparece y eventualidades medicas.
- Cierra con sueno, alimentacion, diuresis, evacuaciones, sintomas fisicos, efectos adversos y eventualidades medicas si fueron documentados.
- Respeta generationPreferences.includePatientQuotes. Si es false, no uses comillas ni "sic. Pac."; parafrasea fielmente. Si es true, usa solo citas literales breves de utterances del paciente, maximo generationPreferences.maxPatientQuotes, sin corregir el texto dentro de la cita y con "sic. Pac." inmediatamente despues.
- Usa el bloque OBSERVACIONES MANUALES DEL PROFESIONAL solo como hallazgos observados introducidos manualmente. No los atribuyas al paciente. No amplifiques su significado. No infieras orientacion, cooperacion, psicomotricidad, higiene, marcha, afecto ni riesgo a partir de otra observacion distinta. Respeta destinationSections y evita repetir literalmente la misma observacion.
- Si modality es videollamada, redacta "valorado mediante videollamada" y limita hallazgos a lo observable por camara. Si modality es llamada telefonica, no generes apariencia, contacto visual, marcha, higiene ni psicomotricidad.

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
  /\binsomnia\b/i,
  /\bniega\s+(?:la\s+)?ausencia\b/i,
  /\bniega\s+no\s+presentar\b/i,
  /\bsin\s+ausencia\b/i,
  /\bniega\s+ideaci[oÃƒÃ³]n.{0,80}\bausencia\s+de\s+intenci[oÃƒÃ³]n\b/i,
  /\bpresenta cuestionamientos respecto a ideas delirantes\b/i,
  /\bd[iÃí]a\s+0\b/i,
  /\bse encuentra en el d[iÃí]a\s+0\b/i,
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
  /\b(?:se indica|se indic[oÃó]|se mantendr[aÃá]|se decide|plan(?:ea)?|deber[aÃá]) continuar tratamiento\b/i,
  /\([^)]*$/i,
  /\bno solamente quiero\b/i
];

const UNAVAILABLE_ADMIN_VALUES = new Set([
  "",
  "0",
  "null",
  "undefined",
  "nan",
  "actual",
  "pendiente",
  "sin registro",
  "no especificado",
  "no disponible"
]);

const CONTEXT_PATTERNS = {
  posture: /\b(sentad[oa]|sedente|dec[uÃú]bito|de pie|en cama|cama correspondiente|consultorio)\b/i,
  cooperation: /\b(cooperador(?:a)?|cooperaci[oÃó]n|acepta(?:ndo)?(?: la)? entrevista|aceptaci[oÃó]n (?:de|al) (?:la )?(?:entrevista|contacto cl[iÃí]nico)|abordable)\b/i,
  orientation: /\b(orientad[oa]|orientaci[oÃó]n|ubicad[oa])\b/i,
  agitationAbsence: /\b(sin (?:presentar )?(?:episodios de )?agitaci[oÃó]n|niega agitaci[oÃó]n|no se reporta agitaci[oÃó]n)\b/i
};

const EXPLORATION_DOMAINS = [
  { domain: "sueno", patterns: [/\bsue[nÃƒÃ±]o\b/i, /\bdorm/i, /\binsomnio\b/i, /\bprivaci[oÃƒÃ³]n de sue[nÃƒÃ±]o\b/i], absent: [/\bniega.{0,40}(insomnio|alteraciones del sue[nÃƒÃ±]o)\b/i] },
  { domain: "alimentacion", patterns: [/\balimentaci[oÃƒÃ³]n\b/i, /\bapetito\b/i, /\btolerancia de la v[iÃƒÃ­]a oral\b/i], absent: [/\b(apetito conservado|alimentaci[oÃƒÃ³]n sin alteraciones|sin alteraciones en la alimentaci[oÃƒÃ³]n)\b/i] },
  { domain: "diuresis", patterns: [/\bdiuresis\b/i, /\borina\b/i, /\bmicci[oÃƒÃ³]n\b/i], absent: [/\bdiuresis (?:conservada|sin alteraciones)\b/i] },
  { domain: "evacuaciones", patterns: [/\bevacuaci[oÃƒÃ³]n|evacuaciones\b/i, /\bdeposiciones\b/i], absent: [/\bevacuaciones sin alteraciones\b/i] },
  { domain: "sintomas_fisicos", patterns: [/\brigi?dez\b/i, /\btemblor\b/i, /\bmareo\b/i, /\bca[iÃƒÃ­]das\b/i, /\bxerostom[iÃƒÃ­]a\b/i, /\bboca seca\b/i, /\bsomnolencia\b/i], absent: [/\bniega.{0,80}(rigidez|temblor|mareo|ca[iÃƒÃ­]das)\b/i] },
  { domain: "riesgo_suicida", patterns: [/\bsuicid|ideas de muerte|morir|quitarse la vida\b/i], absent: [/\bniega.{0,60}(suicid|ideas de muerte|morir|quitarse la vida)\b/i] },
  { domain: "riesgo_heteroagresivo", patterns: [/\bda[nÃƒÃ±]ar|agredir|lastimar|heteroagresiv\b/i], absent: [/\bniega.{0,80}(da[nÃƒÃ±]ar|agredir|lastimar|heteroagresiv)\b/i, /\bno quiero da[nÃƒÃ±]ar\b/i] },
  { domain: "red_apoyo", patterns: [/\bmadre|mam[aÃƒÃ¡]|familia|red de apoyo\b/i], absent: [] },
  { domain: "tratamiento", patterns: [/\bmedicamento|tratamiento|risperidona|clonazepam\b/i], absent: [] },
  { domain: "consumo", patterns: [/\bmetanfetamina|cannabis|marihuana|sustancia|consumo\b/i], absent: [] }
];

const UNEXPLORED_NORMALITY_PATTERNS = [
  { domain: "alimentacion", pattern: /\b(?:no se reportan|sin|niega).{0,50}(?:alteraciones|cambios).{0,40}alimentaci[oÃƒÃ³]n\b/i },
  { domain: "alimentacion", pattern: /\balimentaci[oÃƒÃ³]n (?:conservada|sin alteraciones)\b/i },
  { domain: "diuresis", pattern: /\b(?:no se reportan|sin|niega).{0,50}(?:alteraciones|cambios).{0,40}diuresis\b/i },
  { domain: "diuresis", pattern: /\bdiuresis (?:conservada|sin alteraciones)\b/i },
  { domain: "evacuaciones", pattern: /\b(?:no se reportan|sin|niega).{0,50}(?:alteraciones|cambios).{0,40}evacuaciones\b/i },
  { domain: "evacuaciones", pattern: /\bevacuaciones sin alteraciones\b/i },
  { domain: "sintomas_fisicos", pattern: /\bno se reportan alteraciones.{0,60}(?:s[iÃƒÃ­]ntomas f[iÃƒÃ­]sicos|som[aÃƒÃ¡]ticas|m[eÃƒÃ©]dicas)\b/i },
  { domain: "sueno", pattern: /\b(?:no se reportan|sin|niega).{0,50}(?:alteraciones|cambios).{0,40}sue[nÃƒÃ±]o\b/i }
];

const VALIDATION_CODE_MAP = {
  empty_evolution: "EMPTY_EVOLUTION",
  invalid_day_zero: "INVALID_DAY_ZERO",
  invalid_term_insomnia: "INVALID_TERM_INSOMNIA",
  double_negation: "DOUBLE_NEGATION",
  semantic_style_ideas: "SEMANTIC_STYLE_IDEAS",
  contaminated_evolution: "CONTAMINATED_EVOLUTION",
  question_in_evolution: "QUESTION_IN_EVOLUTION",
  too_many_paragraphs: "TOO_MANY_PARAGRAPHS",
  single_paragraph_multi_domain_evolution: "SINGLE_PARAGRAPH",
  posture_without_source: "UNSUPPORTED_POSTURE",
  cooperation_without_source: "UNSUPPORTED_COOPERATION",
  orientation_without_source: "UNSUPPORTED_ORIENTATION",
  agitation_absence_without_source: "UNSUPPORTED_NO_AGITATION",
  absolute_disappearance_without_source: "ABSOLUTE_DISAPPEARANCE",
  family_commitment_without_relative_source: "UNSUPPORTED_RELATIVE_COMMITMENT",
  generic_unexplored_normality: "UNEXPLORED_DOMAIN_ASSERTED",
  patient_quote_disabled: "PATIENT_QUOTES_DISABLED",
  too_many_patient_quotes: "TOO_MANY_PATIENT_QUOTES",
  critical_unknown_speaker: "INVALID_PROVENANCE",
  missing_traceability: "INVALID_PROVENANCE"
};

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
    retryable: Boolean(details.retryable),
    validationCodes: Array.isArray(details.validationCodes) ? details.validationCodes : [],
    attempt: details.attempt || null,
    validatorVersion: details.validatorVersion || ""
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

function normalizeAdminString(value = "") {
  const clean = normalizeString(value);
  return UNAVAILABLE_ADMIN_VALUES.has(clean.toLowerCase()) ? "" : clean;
}

function normalizePositiveInteger(value) {
  const clean = normalizeString(value);
  if (UNAVAILABLE_ADMIN_VALUES.has(clean.toLowerCase())) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function normalizePatientContext(value = {}) {
  const ctx = value && typeof value === "object" ? value : {};
  return {
    patientId: normalizeAdminString(ctx.patientId || ctx.id),
    encounterId: normalizeAdminString(ctx.encounterId),
    name: normalizeAdminString(ctx.name || ctx.nombreCompleto || ctx.nombre),
    age: normalizePositiveInteger(ctx.age ?? ctx.edad),
    sex: normalizeAdminString(ctx.sex || ctx.sexo),
    service: normalizeAdminString(ctx.service || ctx.servicio),
    hospitalizationDay: normalizePositiveInteger(ctx.hospitalizationDay ?? ctx.diaEstancia),
    admissionCriterion: normalizeAdminString(ctx.admissionCriterion || ctx.criterio)
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

function normalizeGenerationPreferences(value = {}) {
  const prefs = value && typeof value === "object" ? value : {};
  const includePatientQuotes = Boolean(prefs.includePatientQuotes);
  return {
    includePatientQuotes,
    maxPatientQuotes: includePatientQuotes ? Math.min(3, Math.max(1, normalizePositiveInteger(prefs.maxPatientQuotes) || 1)) : 0,
    quotePriority: includePatientQuotes ? normalizeString(prefs.quotePriority || "automatic") : "automatic"
  };
}

function normalizeDestinationSections(value = []) {
  const allowed = new Set(["evolution", "mentalStatusExam"]);
  if (!Array.isArray(value)) return ["evolution"];
  const normalized = Array.from(new Set(value.map((item) => normalizeString(item)).filter((item) => allowed.has(item))));
  return normalized.length ? normalized : ["evolution"];
}

function normalizeObservationGroup(value = []) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map((item) => ({
    value: normalizeString(item?.value).slice(0, 80),
    label: normalizeString(item?.label || item?.value).slice(0, 120),
    destinationSections: normalizeDestinationSections(item?.destinationSections)
  })).filter((item) => item.value && item.label);
}

function normalizeEncounterObservation(value = {}) {
  const obs = value && typeof value === "object" ? value : {};
  return {
    modality: normalizeString(obs.modality).slice(0, 40),
    location: normalizeString(obs.location).slice(0, 80),
    locationOther: normalizeString(obs.locationOther).replace(/[<>]/g, "").slice(0, 80),
    position: normalizeString(obs.position).slice(0, 80),
    activities: normalizeObservationGroup(obs.activities),
    behaviors: normalizeObservationGroup(obs.behaviors),
    interactions: normalizeObservationGroup(obs.interactions),
    appearance: normalizeObservationGroup(obs.appearance),
    psychomotor: normalizeObservationGroup(obs.psychomotor),
    freeText: normalizeString(obs.freeText).replace(/[<>]/g, "").slice(0, 500),
    freeTextConfirmed: Boolean(obs.freeTextConfirmed)
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
    generationPreferences: normalizeGenerationPreferences(data.generationPreferences || {}),
    encounterObservation: normalizeEncounterObservation(data.encounterObservation || {}),
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
  const evolutionCoverage = buildEvolutionCoverage(payload);
  const manualObservations = buildManualObservationFacts(payload.encounterObservation || {});
  return {
    patientContext: payload.patientContext,
    noteConfiguration: payload.noteConfiguration,
    generationPreferences: payload.generationPreferences,
    manualObservationsBlockTitle: "OBSERVACIONES MANUALES DEL PROFESIONAL",
    manualObservations,
    evolutionCoverage: serializeEvolutionCoverage(evolutionCoverage),
    explorationMatrix: evolutionCoverage.explorationMatrix || [],
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

function hasAny(text = "", patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function addCoverageFact(facts, fact) {
  if (!fact || !fact.code || !fact.sourceUtteranceIds?.length) return;
  const existing = facts.find((item) => item.code === fact.code);
  if (existing) {
    existing.sourceUtteranceIds = Array.from(new Set([...existing.sourceUtteranceIds, ...fact.sourceUtteranceIds]));
    return;
  }
  facts.push({
    domain: fact.domain,
    code: fact.code,
    proposition: fact.proposition,
    status: fact.status || "present",
    temporality: fact.temporality || "current",
    sourceRole: fact.sourceRole || "",
    sourceUtteranceIds: fact.sourceUtteranceIds,
    required: fact.required !== false,
    requiredPatterns: fact.requiredPatterns,
    requiredPatternSources: fact.requiredPatterns.map((pattern) => pattern.source),
    message: fact.message
  });
}

function serializeEvolutionCoverage(coverage = {}) {
  return {
    facts: (coverage.facts || []).map((fact) => ({
      domain: fact.domain,
      code: fact.code,
      proposition: fact.proposition,
      status: fact.status,
      temporality: fact.temporality,
      sourceRole: fact.sourceRole,
      sourceUtteranceIds: fact.sourceUtteranceIds,
      required: fact.required,
      message: fact.message
    })),
    contextSupport: coverage.contextSupport || {},
    explorationMatrix: coverage.explorationMatrix || [],
    unknownUtterances: coverage.unknownUtterances || [],
    blockingUnknownUtteranceIds: coverage.blockingUnknownUtteranceIds || []
  };
}

function buildManualObservationFacts(observation = {}) {
  const facts = [];
  const add = ({ domain, value, label, destinationSections = ["evolution"] }) => {
    if (!value && !label) return;
    const safeValue = normalizeString(value || label);
    const safeLabel = normalizeString(label || value);
    if (!safeValue || !safeLabel) return;
    facts.push({
      id: `manualObservation:${facts.length + 1}`,
      domain,
      value: safeValue,
      label: safeLabel,
      sourceRole: "clinician",
      sourceType: "manual_visual_observation",
      destinationSections: normalizeDestinationSections(destinationSections),
      createdAt: new Date(0).toISOString()
    });
  };
  if (observation.modality) add({ domain: "encounter.modality", value: observation.modality, label: observation.modality, destinationSections: ["evolution"] });
  if (observation.location) {
    add({
      domain: "encounter.location",
      value: observation.location,
      label: observation.location === "otro" ? observation.locationOther : observation.location,
      destinationSections: ["evolution"]
    });
  }
  if (observation.position) add({ domain: "encounter.position", value: observation.position, label: observation.position, destinationSections: ["evolution"] });
  for (const group of ["activities", "behaviors", "interactions", "appearance", "psychomotor"]) {
    for (const item of observation[group] || []) {
      add({
        domain: `visual.${group}`,
        value: item.value,
        label: item.label,
        destinationSections: item.destinationSections
      });
    }
  }
  if (observation.freeText && observation.freeTextConfirmed) {
    add({
      domain: "visual.free_text",
      value: "clinician_free_text",
      label: observation.freeText,
      destinationSections: ["evolution"]
    });
  }
  return facts;
}

function buildExplorationMatrix(utterances = []) {
  return EXPLORATION_DOMAINS.map((definition) => {
    const matches = [];
    for (const utterance of utterances) {
      const text = normalizeString(utterance.text);
      if (!definition.patterns.some((pattern) => pattern.test(text))) continue;
      matches.push({ utterance, text });
    }
    if (!matches.length) {
      return {
        domain: definition.domain,
        explored: false,
        status: "unknown",
        sourceRole: "",
        sourceUtteranceIds: []
      };
    }
    const sourceRoles = Array.from(new Set(matches.map(({ utterance }) => normalizeString(utterance.probableRole || "unknown")).filter(Boolean)));
    const sourceUtteranceIds = Array.from(new Set(matches.map(({ utterance }) => utterance.id).filter(Boolean)));
    const joined = matches.map((match) => match.text).join(" ");
    const hasAbsent = definition.absent.some((pattern) => pattern.test(joined)) || /\b(no|niega|sin)\b/i.test(joined);
    const hasUncertain = /\b(no se|quiz[aÃƒÃ¡]s|tal vez|puede ser|incierto|no recuerdo)\b/i.test(joined);
    return {
      domain: definition.domain,
      explored: true,
      status: hasUncertain ? "uncertain" : (hasAbsent ? "absent" : "present"),
      sourceRole: sourceRoles.length === 1 ? sourceRoles[0] : "mixed",
      sourceUtteranceIds
    };
  });
}

function classifyUnknownImpact(text = "") {
  if (/\b(suicid|matar|morir|da[nÃñ]ar|agredir|homicid|riesgo|risperidona|clonazepam|mg|dosis|niega|no|si|s[iÃí]|continuar|tratamiento|egreso)\b/i.test(text)) {
    return "critical";
  }
  if (/\b(sue[nÃñ]o|apetito|madre|mam[aÃá]|consumo|metanfetamina|cannabis|voces|persecuci[oÃó]n)\b/i.test(text)) {
    return "relevant";
  }
  return "minor";
}

function buildEvolutionCoverage(payload = {}) {
  const facts = [];
  const utterances = payload.transcript?.utterances || [];
  const explorationMatrix = buildExplorationMatrix(utterances);
  const manualObservations = buildManualObservationFacts(payload.encounterObservation || {});
  const contextSupport = {
    posture: false,
    cooperation: false,
    orientation: false,
    agitationAbsence: false
  };
  for (const observation of manualObservations) {
    const domain = normalizeString(observation.domain);
    const value = normalizeString(observation.value);
    const label = normalizeString(observation.label);
    const joined = `${domain} ${value} ${label}`;
    if (/\b(encounter\.position|sedente|decubito|bipedestacion|deambulando|alterna_posiciones)\b/i.test(joined)) contextSupport.posture = true;
    if (/\b(cooperador|poco_cooperador|declined_interview|no acepto)\b/i.test(joined)) contextSupport.cooperation = true;
    if (/\b(calm|no_particular_behavior|tranquilo|sin conducta particular)\b/i.test(joined)) contextSupport.agitationAbsence = true;
  }
  const unknownUtterances = [];
  for (const utterance of utterances) {
    const text = normalizeString(utterance.text);
    const role = normalizeString(utterance.probableRole).toLowerCase();
    const act = normalizeString(utterance.speechAct).toLowerCase();
    const id = utterance.id;
    const allowedClinicalSource = role === "patient" || role === "relative";
    const isObservation = role === "clinician" && act === "observation";

    if (role === "unknown") {
      unknownUtterances.push({ id, impact: classifyUnknownImpact(text) });
    }
    if (isObservation) {
      Object.keys(contextSupport).forEach((key) => {
        if (CONTEXT_PATTERNS[key].test(text)) contextSupport[key] = true;
      });
    }
    if (!allowedClinicalSource) continue;

    const source = { sourceRole: role, sourceUtteranceIds: [id] };
    if (hasAny(text, [/\bm[aÃá]s tranquil[oa]\b/i, /\bmejor\b.*\btranquil/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "evolucion_general",
        code: "greater_tranquility",
        proposition: "mayor tranquilidad respecto a valoracion o dia previo",
        requiredPatterns: [/m[aÃá]s tranquil|mayor tranquilidad|se siente mejor|refiere mejor/i],
        message: "Omitio mayor tranquilidad referida."
      });
    }
    if (hasAny(text, [/\b(quiero|deseo|ganas).{0,25}(irme|salir|egreso|alta)\b/i, /\bpersiste.{0,25}(egreso|salir|irse)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "evolucion_general",
        code: "discharge_wish",
        proposition: "persistencia de deseos de egreso",
        requiredPatterns: [/deseos? de egreso|deseo de (?:salir|irse)|quiere (?:salir|irse)|desea (?:salir|irse)/i],
        message: "Omitio deseos de egreso."
      });
    }
    if (hasAny(text, [/\b(seis|6)\s+horas\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "sueno",
        code: "sleep_six_hours",
        proposition: "sueno aproximado de seis horas",
        requiredPatterns: [/seis horas|6 horas/i],
        message: "Omitio sueno aproximado de seis horas."
      });
    }
    if (hasAny(text, [/\bdespert/i, /\bvolvi[oÃó] a dormir\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "sueno",
        code: "brief_awakening_sleep_recovered",
        proposition: "un despertar con recuperacion del sueno",
        requiredPatterns: [/despert|volvi[oÃó] a dormir|recuper[oÃó] el sue[nÃñ]o|sin dificultad para volver/i],
        message: "Omitio despertar nocturno con recuperacion del sueno."
      });
    }
    if (hasAny(text, [/\b(voces|alucinaciones auditivas).{0,80}(dos|2)\s+d[iÃí]as\b/i, /\b(dos|2)\s+d[iÃí]as.{0,80}(voces|alucinaciones auditivas)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "sensopercepcion",
        code: "auditory_hallucinations_absent_two_days",
        proposition: "ausencia referida de alucinaciones auditivas durante dos dias",
        status: "absent",
        requiredPatterns: [/ausencia.{0,60}(voces|alucinaciones auditivas)|no (?:ha )?(?:escucha|presenta).{0,60}(voces|alucinaciones auditivas)|durante los [uÃú]ltimos dos d[iÃí]as/i],
        message: "Omitio ausencia de alucinaciones auditivas durante dos dias."
      });
    }
    if (hasAny(text, [/\b(persecuci[oÃó]n|persegu[iÃí]|amenaz|da[nÃñ]o|televisi[oÃó]n|mensajes).{0,100}(ya no|no estoy|menos|disminu|duda|seguro)\b/i, /\b(ya no|no estoy|menos|disminu|duda).{0,100}(persecuci[oÃó]n|persegu[iÃí]|amenaz|da[nÃñ]o|televisi[oÃó]n|mensajes)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "sintomas_psicoticos",
        code: "persecutory_ideas_less_conviction",
        proposition: "disminucion de conviccion en ideas de persecucion previamente referidas",
        requiredPatterns: [/disminuci[oÃó]n.{0,80}(ideas de persecuci[oÃó]n|convicci[oÃó]n|amenaz|persegu)|menos convencido|no est[aÃá] tan seguro|duda/i],
        message: "Omitio disminucion de conviccion en ideas de persecucion."
      });
    }
    if (hasAny(text, [/\b(metanfetamina|cristal|cannabis|marihuana|falta de sue[nÃñ]o|sin dormir).{0,120}(influy|relaci|tuvo que ver|pudo|contribuy)/i, /\b(influy|relaci|tuvo que ver|pudo|contribuy).{0,120}(metanfetamina|cristal|cannabis|marihuana|falta de sue[nÃñ]o|sin dormir)/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "consumo",
        code: "patient_links_symptoms_to_sleep_and_substances",
        proposition: "posible relacion atribuida por el paciente con falta de sueno y consumo de sustancias",
        requiredPatterns: [/refiere|reconoce|atribuye|considera|relaciona|pudo haber influido/i, /metanfetamina|cannabis|sustancias|falta de sue[nÃñ]o|privaci[oÃó]n de sue[nÃñ]o/i],
        message: "Omitio posible relacion atribuida por el paciente con falta de sueno y sustancias."
      });
    }
    if (hasAny(text, [/\b(no|niega).{0,60}(suicid|quitarse la vida|morir)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "riesgo_suicida",
        code: "current_suicidal_ideation_negated",
        proposition: "negacion de ideacion suicida actual",
        status: "absent",
        requiredPatterns: [/niega.{0,50}(ideaci[oÃó]n suicida|ideas suicidas|ideas de muerte)|sin ideaci[oÃó]n suicida|no refiere.{0,50}suicid/i],
        message: "Omitio negacion de ideacion suicida actual."
      });
    }
    if (hasAny(text, [/\b(no|niega).{0,80}(da[nÃñ]ar|agredir|lastimar).{0,80}(tercer|hermano|otra persona|alguien)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "riesgo_heteroagresivo",
        code: "current_harm_intent_negated",
        proposition: "negacion de intencion de danar a terceros",
        status: "absent",
        requiredPatterns: [/niega.{0,80}(intenci[oÃó]n|plan).{0,80}(da[nÃñ]ar|causar da[nÃñ]o|agredir|lastimar|heteroagresiv)|niega.{0,80}heteroagresiv|no refiere.{0,80}(da[nÃñ]ar|causar da[nÃñ]o|agredir|lastimar|heteroagresiv)/i],
        message: "Omitio negacion de intencion de danar a terceros."
      });
    }
    if (hasAny(text, [/\b(acepto|acepta|he tomado|me tomo|tomo).{0,60}(medicamento|tratamiento|pastilla)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "adherencia",
        code: "medication_acceptance",
        proposition: "aceptacion referida de medicamentos",
        requiredPatterns: [/acepta.{0,50}medic|aceptaci[oÃó]n.{0,50}medic|ha tomado.{0,50}medic|toma.{0,50}medic/i],
        message: "Omitio aceptacion referida de medicamentos."
      });
    }
    if (/\brisperidona\b/i.test(text)) {
      addCoverageFact(facts, {
        ...source,
        domain: "tratamiento",
        code: "risperidone_mentioned",
        proposition: "risperidona mencionada dentro del tratamiento",
        requiredPatterns: [/risperidona/i],
        message: "Omitio risperidona mencionada."
      });
    }
    if (hasAny(text, [/\b(somnolencia|sue[nÃñ]o matutino|boca seca|xerostom[iÃí]a)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "efectos_adversos",
        code: "somnolence_xerostomia",
        proposition: "somnolencia y xerostomia referidas",
        requiredPatterns: [/somnolencia|sue[nÃñ]o matutino/i, /xerostom[iÃí]a|boca seca/i],
        message: "Omitio somnolencia o xerostomia."
      });
    }
    if (hasAny(text, [/\b(no|niega).{0,80}(rigidez|temblor|mareo|ca[iÃí]das)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "efectos_adversos",
        code: "eps_falls_negated",
        proposition: "negacion de rigidez, temblor, mareo y caidas",
        status: "absent",
        requiredPatterns: [/niega.{0,120}(rigidez|temblor|mareo|ca[iÃí]das)|sin.{0,120}(rigidez|temblor|mareo|ca[iÃí]das)/i],
        message: "Omitio negacion de rigidez, temblor, mareo o caidas."
      });
    }
    if (/\b(madre|mam[aÃá])\b/i.test(text)) {
      addCoverageFact(facts, {
        ...source,
        domain: "red_apoyo",
        code: "mother_support",
        proposition: "madre como red de apoyo",
        requiredPatterns: [/madre|mam[aÃá]|red de apoyo/i],
        message: "Omitio red de apoyo materna."
      });
      if (hasAny(text, [/\b(medicamento|tratamiento|pastilla)\b/i])) {
        addCoverageFact(facts, {
          ...source,
          domain: "red_apoyo",
          code: "mother_supports_medication",
          proposition: "apoyo materno para medicamentos",
          requiredPatterns: [/madre|mam[aÃá]/i, /medicamento|tratamiento|pastilla/i],
          message: "Omitio apoyo materno para medicamentos."
        });
      }
    }
    if (hasAny(text, [/\b(continuar|seguir).{0,60}(tratamiento|medicamento|consulta|seguimiento)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "proyeccion_futura",
        code: "willing_to_continue_treatment",
        proposition: "disposicion para continuar tratamiento",
        requiredPatterns: [/disposici[oÃó]n.{0,60}(continuar|seguir).{0,60}tratamiento|acepta.{0,60}(continuar|seguir).{0,60}tratamiento|continuar tratamiento/i],
        message: "Omitio disposicion para continuar tratamiento."
      });
    }
    if (hasAny(text, [/\b(evitar|dejar|no consumir|abstinencia).{0,80}(sustancia|metanfetamina|cristal|cannabis|marihuana)\b/i])) {
      addCoverageFact(facts, {
        ...source,
        domain: "consumo",
        code: "willing_to_avoid_substances",
        proposition: "disposicion para evitar sustancias",
        requiredPatterns: [/evitar.{0,60}(sustancia|metanfetamina|cannabis|consumo)|abstinencia|no consumir/i],
        message: "Omitio disposicion para evitar sustancias."
      });
    }
  }
  return {
    facts,
    contextSupport,
    explorationMatrix,
    unknownUtterances,
    blockingUnknownUtteranceIds: unknownUtterances.filter((item) => item.impact === "critical").map((item) => item.id)
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

function canonicalValidationCode(issue = {}) {
  const code = normalizeString(issue.code);
  if (VALIDATION_CODE_MAP[code]) return VALIDATION_CODE_MAP[code];
  if (code.startsWith("missing_coverage_risperidone") || code.includes("medication") || code.includes("risperidone")) return "MISSING_MEDICATION";
  if (code.startsWith("missing_coverage_somnolence") || code.startsWith("missing_coverage_eps") || code.includes("adverse")) return "MISSING_ADVERSE_EFFECT";
  if (code.startsWith("missing_coverage_current_suicidal") || code.startsWith("missing_coverage_current_harm")) return "MISSING_CURRENT_RISK";
  if (code.startsWith("missing_coverage_mother")) return "MISSING_SUPPORT_NETWORK";
  if (code.startsWith("missing_coverage_willing")) return "MISSING_TREATMENT_DISPOSITION";
  if (code.startsWith("missing_coverage_")) return "MISSING_REQUIRED_FACT";
  if (code.startsWith("unexplored_normality_")) return "UNEXPLORED_DOMAIN_ASSERTED";
  return code ? code.toUpperCase() : "UNKNOWN_VALIDATION_ERROR";
}

function validationCodesFromIssues(issues = []) {
  return Array.from(new Set(issues.map(canonicalValidationCode).filter(Boolean)));
}

function applyDeterministicEvolutionCorrections(text = "") {
  return normalizeString(text)
    .replace(/\binsomnia\b/gi, "insomnio")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function validateEvolutionText(text = "", knownUtteranceIds = new Set()) {
  const issues = [];
  const clean = normalizeString(text);
  if (!clean) {
    issues.push({ code: "empty_evolution", message: "evolution.text esta vacio.", severity: "high" });
  }
  if (/\bd[iÃƒÃ­]a\s+0\b/i.test(clean) || /\bd[ií]a\s+0\b/i.test(clean)) {
    issues.push({ code: "invalid_day_zero", message: "La Evolucion contiene dia 0.", severity: "high" });
  }
  if (/\binsomnia\b/i.test(clean)) {
    issues.push({ code: "invalid_term_insomnia", message: "La Evolucion contiene el anglicismo insomnia.", severity: "high" });
  }
  if (/\bniega\s+(?:la\s+)?ausencia\b/i.test(clean) || /\bniega\s+no\s+presentar\b/i.test(clean) || /\bsin\s+ausencia\b/i.test(clean) || /\bniega\s+ideaci[oÃƒÃ³ó]n.{0,80}\bausencia\s+de\s+intenci[oÃƒÃ³ó]n\b/i.test(clean)) {
    issues.push({ code: "double_negation", message: "La Evolucion contiene una doble negacion clinica.", severity: "high" });
  }
  if (/\bpresenta cuestionamientos respecto a ideas delirantes\b/i.test(clean)) {
    issues.push({ code: "semantic_style_ideas", message: "La Evolucion usa una construccion poco fiel para ideas de persecucion.", severity: "high" });
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

function validateContextInventions(text = "", coverage = {}) {
  const issues = [];
  const clean = normalizeString(text);
  const support = coverage.contextSupport || {};
  const checks = [
    ["posture_without_source", CONTEXT_PATTERNS.posture, support.posture, "La Evolucion describe postura, cama o consultorio sin fuente explicita."],
    ["cooperation_without_source", CONTEXT_PATTERNS.cooperation, support.cooperation, "La Evolucion afirma cooperacion o aceptacion sin fuente explicita."],
    ["orientation_without_source", CONTEXT_PATTERNS.orientation, support.orientation, "La Evolucion afirma orientacion sin fuente explicita."],
    ["agitation_absence_without_source", CONTEXT_PATTERNS.agitationAbsence, support.agitationAbsence, "La Evolucion afirma ausencia de agitacion sin fuente explicita."]
  ];
  for (const [code, pattern, hasSupport, message] of checks) {
    if (!hasSupport && pattern.test(clean)) {
      issues.push({ code, message, severity: "high" });
    }
  }
  if (/\bdesaparici[oÃó]n\b.{0,80}\b(voces|alucinaciones auditivas)\b/i.test(clean)) {
    issues.push({
      code: "absolute_disappearance_without_source",
      message: "La Evolucion usa desaparicion como certeza absoluta; debe preferir ausencia referida durante el periodo documentado.",
      severity: "high"
    });
  }
  return issues;
}

function getExplorationDomain(coverage = {}, domain = "") {
  return (coverage.explorationMatrix || []).find((item) => item.domain === domain) || {
    domain,
    explored: false,
    status: "unknown",
    sourceRole: "",
    sourceUtteranceIds: []
  };
}

function validateSemanticFidelity(text = "", coverage = {}) {
  const issues = [];
  const clean = normalizeString(text);
  const paragraphs = clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const exploredDomains = (coverage.explorationMatrix || []).filter((item) => item.explored);
  if (exploredDomains.length >= 3 && paragraphs.length < 2) {
    issues.push({
      code: "single_paragraph_multi_domain_evolution",
      message: "La Evolucion contiene un unico parrafo pese a integrar tres o mas dominios clinicos.",
      severity: "high"
    });
  }
  for (const { domain, pattern } of UNEXPLORED_NORMALITY_PATTERNS) {
    const item = getExplorationDomain(coverage, domain);
    if (!item.explored && pattern.test(clean)) {
      issues.push({
        code: `unexplored_normality_${domain}`,
        message: `La Evolucion genero normalidad de ${domain} sin exploracion documentada.`,
        severity: "high"
      });
    }
  }
  if (/\b(?:madre|mam[aÃƒÃ¡]|familiar).{0,80}se compromete\b/i.test(clean) || /\bse compromete.{0,80}(?:madre|mam[aÃƒÃ¡]|familiar)\b/i.test(clean)) {
    const hasRelativeSource = (coverage.facts || []).some((fact) => fact.sourceRole === "relative" && /madre|mam[aÃƒÃ¡]|familiar|red_apoyo/.test(`${fact.proposition} ${fact.domain}`));
    if (!hasRelativeSource) {
      issues.push({
        code: "family_commitment_without_relative_source",
        message: "La Evolucion atribuye compromiso a un familiar sin entrevista o fuente familiar.",
        severity: "high"
      });
    }
  }
  if (/\bno se reportan alteraciones\b/i.test(clean)) {
    const absentUnexplored = ["alimentacion", "diuresis", "evacuaciones", "sintomas_fisicos", "sueno"].some((domain) => !getExplorationDomain(coverage, domain).explored);
    if (absentUnexplored) {
      issues.push({
        code: "generic_unexplored_normality",
        message: "La Evolucion usa 'no se reportan alteraciones' para dominios no explorados.",
        severity: "high"
      });
    }
  }
  return issues;
}

function validateCoverageInclusion(text = "", coverage = {}) {
  const issues = [];
  const clean = normalizeString(text);
  for (const fact of coverage.facts || []) {
    if (fact.required === false) continue;
    const patterns = Array.isArray(fact.requiredPatterns) ? fact.requiredPatterns : [];
    if (!patterns.length) continue;
    const included = patterns.every((pattern) => pattern.test(clean));
    if (!included) {
      issues.push({
        code: `missing_coverage_${fact.code}`,
        message: fact.message || `La Evolucion omitio el hecho relevante: ${fact.proposition}.`,
        severity: "high",
        sourceUtteranceIds: fact.sourceUtteranceIds || []
      });
    }
  }
  for (const unknown of coverage.unknownUtterances || []) {
    if (unknown.impact === "critical") {
      issues.push({
        code: "critical_unknown_speaker",
        message: "Existe un fragmento critico con hablante no identificado.",
        severity: "high",
        sourceUtteranceIds: [unknown.id].filter(Boolean)
      });
    }
  }
  return issues;
}

function warningsForUnknownSpeakers(coverage = {}) {
  const warnings = [];
  for (const unknown of coverage.unknownUtterances || []) {
    if (unknown.impact === "critical") continue;
    warnings.push({
      code: unknown.impact === "relevant" ? "relevant_unknown_speaker" : "minor_unknown_speaker",
      message: unknown.impact === "relevant"
        ? "Un fragmento clinico potencialmente relevante tiene hablante incierto."
        : "Un fragmento no clinico tiene hablante incierto.",
      severity: unknown.impact === "relevant" ? "medium" : "info",
      sourceUtteranceIds: [unknown.id].filter(Boolean)
    });
  }
  return warnings;
}

function validateProviderResult({ parsed, payload, requestId, HttpsErrorClass, attempt = null }) {
  const stage = "schema_validation";
  if (!parsed || typeof parsed !== "object") {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor no devolvio un objeto JSON interpretable.", { requestId, stage, retryable: true });
  }
  const unknownSections = Object.keys(parsed.sections || {}).filter((key) => key !== "evolution");
  if (unknownSections.length) {
    throw makeCallableError(HttpsErrorClass, "data-loss", "El proveedor devolvio secciones no solicitadas.", { requestId, stage, retryable: true });
  }
  const rawEvolution = parsed.sections?.evolution || {};
  const text = applyDeterministicEvolutionCorrections(rawEvolution.text);
  const knownUtteranceIds = new Set(payload.transcript.utterances.map((utterance) => utterance.id));
  const manualObservationIds = new Set(buildManualObservationFacts(payload.encounterObservation || {}).map((item) => item.id));
  const sourceUtteranceIds = normalizeSourceUtteranceIds(rawEvolution.sourceUtteranceIds)
    .filter((id) => knownUtteranceIds.has(id) || manualObservationIds.has(id) || id === "patientContext");
  const warnings = normalizeWarnings(rawEvolution.warnings);
  const coverage = buildEvolutionCoverage(payload);
  const quoteIssues = [];
  if (!payload.generationPreferences?.includePatientQuotes && /\bsic\.\s*Pac\./i.test(text)) {
    quoteIssues.push({ code: "patient_quote_disabled", message: "La Evolucion incluyo sic. Pac. aunque las citas estan desactivadas.", severity: "high" });
  }
  if (payload.generationPreferences?.includePatientQuotes) {
    const quoteCount = (text.match(/\bsic\.\s*Pac\./gi) || []).length;
    if (quoteCount > Number(payload.generationPreferences.maxPatientQuotes || 1)) {
      quoteIssues.push({ code: "too_many_patient_quotes", message: "La Evolucion excedio el maximo de citas permitidas.", severity: "high" });
    }
  }
  const blockingIssues = [
    ...validateEvolutionText(text, knownUtteranceIds),
    ...validateContextInventions(text, coverage),
    ...validateSemanticFidelity(text, coverage),
    ...validateCoverageInclusion(text, coverage),
    ...quoteIssues
  ];

  if (!text || blockingIssues.some((issue) => issue.severity === "high")) {
    const validationCodes = validationCodesFromIssues(blockingIssues);
    throw makeCallableError(HttpsErrorClass, "data-loss", "No fue posible validar la Evolucion generada.", {
      requestId,
      stage,
      retryable: true,
      validationCodes,
      attempt,
      validatorVersion: EVOLUTION_VALIDATOR_VERSION
    });
  }
  if (!sourceUtteranceIds.length) {
    warnings.push({
      code: "missing_traceability",
      message: "La Evolucion no incluyo trazabilidad suficiente por fragmento.",
      severity: "medium"
    });
  }
  warnings.push(...warningsForUnknownSpeakers(coverage));

  return {
    requestId,
    provider: "external",
    model: "",
    promptVersion: NOTE_PROMPT_VERSION,
    schemaVersion: NOTE_SCHEMA_VERSION,
    validatorVersion: EVOLUTION_VALIDATOR_VERSION,
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

function buildRetryInstruction(validationDetails = {}) {
  const codes = Array.isArray(validationDetails.validationCodes) ? validationDetails.validationCodes : [];
  const codesText = codes.length ? codes.join(", ") : "SCHEMA_VALIDATION_FAILED";
  return [
    "Regenera solo evolution corrigiendo exactamente estos codigos de validacion:",
    codesText,
    "Usa solo los hechos estructurados permitidos en evolutionCoverage y explorationMatrix.",
    "No escribas dia 0. No uses dobles negaciones. No inventes postura, cooperacion, orientacion ni ausencia de agitacion.",
    "No atribuyas compromiso a familiares si la fuente es el paciente. No escribas normalidad de dominios no explorados.",
    "No generes examen mental, analisis ni plan. Devuelve solo JSON conforme al esquema."
  ].join("\n");
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
    let lastValidationDetails = null;

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
        validatorVersion: EVOLUTION_VALIDATOR_VERSION,
        validationCodes: lastValidationDetails?.validationCodes || [],
        attempt
      });

      const response = await callProvider({
        client,
        model,
        providerInput,
        timeoutMs,
        extraInstruction: attempt === 2 ? buildRetryInstruction(lastValidationDetails || {}) : ""
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
        const result = validateProviderResult({ parsed, payload, requestId, HttpsErrorClass, attempt });
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
          validatorVersion: EVOLUTION_VALIDATOR_VERSION,
          warningCount: result.globalWarnings.length + result.sections.evolution.warnings.length
        });
        return result;
      } catch (error) {
        if (attempt === 1) {
          lastValidationDetails = error?.details || null;
          continue;
        }
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
      validatorVersion: EVOLUTION_VALIDATOR_VERSION,
      validationCodes: mappedError.details?.validationCodes || error?.details?.validationCodes || [],
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
  EVOLUTION_VALIDATOR_VERSION,
  DEFAULT_NOTE_MODEL,
  PROVIDER_TIMEOUT_MS,
  extractJsonFromText,
  extractResponseText,
  buildEvolutionCoverage,
  validateContextInventions,
  validateSemanticFidelity,
  validateCoverageInclusion,
  validateProviderResult,
  validateEvolutionText,
  runGenerateStructuredNoteFromDictation
};
