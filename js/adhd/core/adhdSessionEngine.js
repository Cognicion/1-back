import {
  ADHD_PERSISTENCE_SCHEMA_VERSION,
  ADHD_PROTOCOL_VERSION
} from "../config/adhdProtocol.js";

export const ADHD_SESSION_ENGINE_VERSION = "1.1.0";
export const ADHD_SESSION_SCHEMA_VERSION = ADHD_PERSISTENCE_SCHEMA_VERSION;

export const ADHD_SESSION_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "paused",
  "completed",
  "completed_with_incomplete_data",
  "abandoned"
]);

export const ADHD_BLOCK_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "paused",
  "completed",
  "completed_with_incomplete_data",
  "skipped"
]);

export class AdhdSessionTransitionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AdhdSessionTransitionError";
    this.code = code;
    this.details = details;
  }
}

export function createAdhdSession(input = {}) {
  const planSession = input.planSession || input.sessionPlan || {};
  const sourceBlocks = Array.isArray(input.blocks) ? input.blocks : (Array.isArray(planSession.blocks) ? planSession.blocks : []);
  const session = {
    sessionId: String(input.sessionId || planSession.sessionId || ""),
    programId: String(input.programId || ""),
    plannedSessionNumber: finiteOrNull(input.sessionNumber ?? planSession.sessionNumber),
    sessionEngineVersion: ADHD_SESSION_ENGINE_VERSION,
    schemaVersion: ADHD_SESSION_SCHEMA_VERSION,
    protocolVersion: String(input.protocolVersion || ADHD_PROTOCOL_VERSION),
    programEngineVersion: String(input.programEngineVersion || input.programVersion || "unknown"),
    status: "not_started",
    hasStarted: false,
    createdAt: input.createdAt ?? null,
    updatedAt: input.createdAt ?? null,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    currentBlockId: null,
    context: sanitizeSessionContext(input.context),
    blocks: sourceBlocks.map((block, index) => normalizeBlock(block, index)),
    transitionLog: [],
    dataQuality: null
  };
  session.dataQuality = summarizeDataQuality(session);
  return session;
}

export function transitionAdhdSession(session, event = {}) {
  assertSessionVersion(session);
  const next = cloneValue(session);
  const type = String(event.type || "").toUpperCase();
  const at = event.at ?? null;
  if (!type) throw new AdhdSessionTransitionError("event_type_required", "La transición requiere un tipo de evento.");
  switch (type) {
    case "START_SESSION":
      requireStatus(next, ["not_started"], type);
      next.status = "in_progress";
      next.hasStarted = true;
      next.startedAt = next.startedAt ?? at;
      break;
    case "START_BLOCK":
      startBlock(next, event, at);
      break;
    case "COMPLETE_BLOCK":
      completeBlock(next, event, at);
      break;
    case "PAUSE_BLOCK":
      pauseBlock(next, event, at);
      break;
    case "RESUME_BLOCK":
      resumeBlock(next, event, at);
      break;
    case "INTERRUPT_BLOCK":
      interruptBlock(next, event, at);
      break;
    case "PAUSE_SESSION":
      pauseSession(next, at);
      break;
    case "RESUME_SESSION":
      resumeSession(next);
      break;
    case "SKIP_OPTIONAL_BLOCK":
      skipOptionalBlock(next, event, at);
      break;
    case "COMPLETE_SESSION":
      completeSession(next, at);
      break;
    case "ABANDON_SESSION":
      requireStatus(next, ["not_started", "in_progress", "paused"], type);
      if (next.currentBlockId) throw invalid("active_block_requires_interruption", "Interrumpa el bloque activo antes de abandonar la sesión.");
      next.status = "abandoned";
      break;
    default:
      throw invalid("unknown_event", `Evento de sesión no reconocido: ${type}.`);
  }
  next.updatedAt = at;
  next.transitionLog = Array.isArray(next.transitionLog) ? next.transitionLog : [];
  next.transitionLog.push({
    sequence: next.transitionLog.length + 1,
    event: type,
    blockId: event.blockId ? String(event.blockId) : null,
    at,
    source: String(event.source || "session_engine")
  });
  next.dataQuality = summarizeDataQuality(next);
  return next;
}

export function startAdhdSession(session, at = null) {
  return transitionAdhdSession(session, { type: "START_SESSION", at });
}

export function startAdhdBlock(session, blockId, options = {}) {
  return transitionAdhdSession(session, { type: "START_BLOCK", blockId, ...options });
}

export function recordAdhdBlockResult(session, blockId, result, options = {}) {
  return transitionAdhdSession(session, { type: "COMPLETE_BLOCK", blockId, result, ...options });
}

export function pauseAdhdSession(session, options = {}) {
  const current = session?.blocks?.find((block) => block.id === session.currentBlockId);
  return current
    ? transitionAdhdSession(session, { type: "PAUSE_BLOCK", blockId: current.id, ...options })
    : transitionAdhdSession(session, { type: "PAUSE_SESSION", ...options });
}

export function resumeAdhdSession(session, options = {}) {
  const pausedBlock = session?.blocks?.find((block) => block.status === "paused");
  return pausedBlock
    ? transitionAdhdSession(session, { type: "RESUME_BLOCK", blockId: pausedBlock.id, ...options })
    : transitionAdhdSession(session, { type: "RESUME_SESSION", ...options });
}

export function interruptAdhdBlock(session, blockId, options = {}) {
  return transitionAdhdSession(session, { type: "INTERRUPT_BLOCK", blockId, ...options });
}

export function completeAdhdSession(session, at = null) {
  return transitionAdhdSession(session, { type: "COMPLETE_SESSION", at });
}

export function canTransitionAdhdSession(session, event = {}) {
  try {
    transitionAdhdSession(session, event);
    return { allowed: true, error: null };
  } catch (error) {
    if (!(error instanceof AdhdSessionTransitionError)) throw error;
    return { allowed: false, error: { code: error.code, message: error.message, details: error.details } };
  }
}

export function hydrateAdhdSession(raw = {}) {
  const sourceVersion = String(raw.schemaVersion || "");
  if (sourceVersion && majorVersion(sourceVersion) > majorVersion(ADHD_SESSION_SCHEMA_VERSION)) {
    throw invalid("unsupported_future_schema", `La sesión usa el esquema futuro ${sourceVersion}.`, { sourceVersion });
  }
  const session = cloneValue(raw);
  session.sessionEngineVersion = String(session.sessionEngineVersion || "legacy_unversioned");
  session.schemaVersion = ADHD_SESSION_SCHEMA_VERSION;
  session.protocolVersion = String(session.protocolVersion || "unknown");
  session.programEngineVersion = String(session.programEngineVersion || "unknown");
  session.status = ADHD_SESSION_STATUSES.includes(session.status) ? session.status : "not_started";
  session.hasStarted = session.hasStarted === true
    || session.status !== "not_started"
    || Boolean(session.startedAt)
    || (Array.isArray(session.transitionLog) && session.transitionLog.some((entry) => entry.event === "START_SESSION"));
  session.blocks = (Array.isArray(session.blocks) ? session.blocks : []).map((block, index) => ({
    ...normalizeBlock(block, index),
    ...block,
    id: String(block.id || `block-${index + 1}`),
    status: ADHD_BLOCK_STATUSES.includes(block.status) ? block.status : "pending",
    attempts: Array.isArray(block.attempts) ? block.attempts : []
  }));
  session.transitionLog = Array.isArray(session.transitionLog) ? session.transitionLog : [];
  session.context = sanitizeSessionContext(session.context);
  session.migration = {
    fromSchemaVersion: sourceVersion || "unversioned",
    toSchemaVersion: ADHD_SESSION_SCHEMA_VERSION,
    dataReconstructed: true
  };
  session.dataQuality = summarizeDataQuality(session);
  return session;
}

export function validateAdhdSession(session = {}) {
  const errors = [];
  const warnings = [];
  if (!session.sessionId) errors.push("session_id_missing");
  if (!session.programId) warnings.push("program_id_missing");
  if (!session.schemaVersion) errors.push("schema_version_missing");
  if (!session.sessionEngineVersion) errors.push("session_engine_version_missing");
  if (!ADHD_SESSION_STATUSES.includes(session.status)) errors.push("unknown_session_status");
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  if (!blocks.length) errors.push("blocks_missing");
  const ids = new Set();
  blocks.forEach((block, index) => {
    if (!block.id) errors.push(`block_${index + 1}_id_missing`);
    if (ids.has(block.id)) errors.push(`duplicate_block_id_${block.id}`);
    ids.add(block.id);
    if (!ADHD_BLOCK_STATUSES.includes(block.status)) errors.push(`block_${block.id}_unknown_status`);
    if (block.kind === "cognitive_task" && !block.taskVersion) warnings.push(`block_${block.id}_task_version_missing`);
    if (block.status === "completed_with_incomplete_data") warnings.push(`block_${block.id}_incomplete_result`);
    if (block.mustRestart === true && block.status !== "pending") errors.push(`block_${block.id}_restart_state_invalid`);
  });
  const activeBlocks = blocks.filter((block) => block.status === "in_progress" || block.status === "paused");
  if (activeBlocks.length > 1) errors.push("multiple_active_blocks");
  if (session.currentBlockId && !activeBlocks.some((block) => block.id === session.currentBlockId)) errors.push("current_block_pointer_invalid");
  if (session.status === "completed" && blocks.some((block) => isRequired(block) && block.status !== "completed")) {
    errors.push("completed_session_has_unfinished_required_blocks");
  }
  if (session.status === "completed_with_incomplete_data" && blocks.some((block) => isRequired(block) && !isFinished(block))) {
    errors.push("completed_session_has_unfinished_required_blocks");
  }
  if (String(session.schemaVersion) !== ADHD_SESSION_SCHEMA_VERSION) warnings.push("schema_version_differs");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    schemaVersion: ADHD_SESSION_SCHEMA_VERSION,
    sessionEngineVersion: ADHD_SESSION_ENGINE_VERSION,
    dataQuality: summarizeDataQuality(session)
  };
}

function startBlock(session, event, at) {
  requireStatus(session, ["in_progress"], "START_BLOCK");
  if (session.currentBlockId) throw invalid("another_block_active", `Ya existe un bloque activo: ${session.currentBlockId}.`);
  const block = requireBlock(session, event.blockId);
  if (block.status !== "pending") throw invalid("block_not_pending", `El bloque ${block.id} no puede iniciarse desde ${block.status}.`);
  const blockIndex = session.blocks.findIndex((candidate) => candidate.id === block.id);
  const unfinishedPriorBlocks = session.blocks
    .slice(0, blockIndex)
    .filter((candidate) => isRequired(candidate) && !isFinished(candidate));
  if (unfinishedPriorBlocks.length) {
    throw invalid("block_order_violation", "Completa los componentes anteriores antes de iniciar este bloque.", {
      blockId: block.id,
      unfinishedBlockIds: unfinishedPriorBlocks.map((candidate) => candidate.id)
    });
  }
  const attemptNumber = (block.attempts?.length || 0) + 1;
  block.status = "in_progress";
  block.mustRestart = false;
  block.attempts = Array.isArray(block.attempts) ? block.attempts : [];
  block.attempts.push({
    attemptNumber,
    startedAt: at,
    endedAt: null,
    status: "in_progress",
    resumedFromPartialTrial: false
  });
  session.currentBlockId = block.id;
}

function completeBlock(session, event, at) {
  requireStatus(session, ["in_progress"], "COMPLETE_BLOCK");
  const block = requireBlock(session, event.blockId || session.currentBlockId);
  if (session.currentBlockId !== block.id || block.status !== "in_progress") {
    throw invalid("block_not_active", `El bloque ${block.id} no está activo.`);
  }
  const quality = evaluateBlockResult(block, event.result, event);
  block.result = block.kind === "cognitive_task"
    ? compactCanonicalResultReference(event.result)
    : cloneValue(event.result ?? null);
  block.resultVersion = String(event.resultVersion || event.metricsVersion || event.result?.metricsVersion || event.result?.metrics?.metricsVersion || "unknown");
  block.taskVersion = String(event.taskVersion || event.result?.taskVersion || block.taskVersion || "unknown");
  block.quality = quality;
  block.status = quality.complete && quality.valid ? "completed" : "completed_with_incomplete_data";
  block.completedAt = at;
  const attempt = block.attempts?.at(-1);
  if (attempt) {
    attempt.endedAt = at;
    attempt.status = block.status;
  }
  session.currentBlockId = null;
}

function pauseBlock(session, event, at) {
  requireStatus(session, ["in_progress"], "PAUSE_BLOCK");
  const block = requireBlock(session, event.blockId || session.currentBlockId);
  if (block.id !== session.currentBlockId || block.status !== "in_progress") throw invalid("block_not_active", `El bloque ${block.id} no está activo.`);
  if (event.safeBoundary !== true) {
    throw invalid("safe_boundary_required", "La pausa solo puede guardarse en un límite seguro entre ensayos; use interrupción para descartar y reiniciar el bloque.");
  }
  block.status = "paused";
  block.safeCheckpoint = cloneValue(event.checkpoint ?? null);
  block.pausedAt = at;
  const attempt = block.attempts?.at(-1);
  if (attempt) attempt.status = "paused";
  session.status = "paused";
  session.pausedAt = at;
}

function resumeBlock(session, event, at) {
  requireStatus(session, ["paused"], "RESUME_BLOCK");
  const block = requireBlock(session, event.blockId || session.currentBlockId);
  if (block.id !== session.currentBlockId || block.status !== "paused") throw invalid("block_not_paused", `El bloque ${block.id} no está pausado.`);
  block.status = "in_progress";
  block.resumedAt = at;
  const attempt = block.attempts?.at(-1);
  if (attempt) {
    attempt.status = "in_progress";
    attempt.resumedAt = at;
    attempt.resumedFromPartialTrial = false;
  }
  session.status = "in_progress";
  session.pausedAt = null;
}

function interruptBlock(session, event, at) {
  requireStatus(session, ["in_progress", "paused"], "INTERRUPT_BLOCK");
  const block = requireBlock(session, event.blockId || session.currentBlockId);
  if (block.id !== session.currentBlockId || !["in_progress", "paused"].includes(block.status)) {
    throw invalid("block_not_active", `El bloque ${block.id} no está activo ni pausado.`);
  }
  const attempt = block.attempts?.at(-1);
  if (attempt) {
    attempt.endedAt = at;
    attempt.status = "interrupted_discarded";
    attempt.reason = String(event.reason || "interruption");
    attempt.discardedPartialData = true;
  }
  block.status = "pending";
  block.mustRestart = true;
  block.result = null;
  block.quality = null;
  block.safeCheckpoint = null;
  block.interruptedAt = at;
  block.interruptionCount = (Number(block.interruptionCount) || 0) + 1;
  session.currentBlockId = null;
  session.status = event.pauseSession === false ? "in_progress" : "paused";
  session.pausedAt = session.status === "paused" ? at : null;
}

function pauseSession(session, at) {
  requireStatus(session, ["not_started", "in_progress"], "PAUSE_SESSION");
  if (session.currentBlockId) throw invalid("active_block_requires_boundary", "Pause o interrumpa el bloque activo antes de pausar la sesión.");
  session.status = "paused";
  session.pausedAt = at;
}

function resumeSession(session) {
  requireStatus(session, ["paused"], "RESUME_SESSION");
  if (session.currentBlockId) throw invalid("paused_block_requires_resume", "Reanude explícitamente el bloque pausado.");
  session.status = session.hasStarted === true ? "in_progress" : "not_started";
  session.pausedAt = null;
}

function skipOptionalBlock(session, event, at) {
  requireStatus(session, ["in_progress"], "SKIP_OPTIONAL_BLOCK");
  if (session.currentBlockId) throw invalid("another_block_active", "No se puede omitir otro bloque mientras existe uno activo.");
  const block = requireBlock(session, event.blockId);
  if (isRequired(block)) throw invalid("required_block_cannot_be_skipped", `El bloque ${block.id} es obligatorio.`);
  if (block.status !== "pending") throw invalid("block_not_pending", `El bloque ${block.id} no está pendiente.`);
  block.status = "skipped";
  block.completedAt = at;
  block.skipReason = String(event.reason || "optional_block_skipped");
}

function completeSession(session, at) {
  requireStatus(session, ["in_progress", "paused"], "COMPLETE_SESSION");
  if (session.currentBlockId) throw invalid("active_block_present", "Finalice o interrumpa el bloque activo antes de completar la sesión.");
  const unfinished = session.blocks.filter((block) => isRequired(block) && !isFinished(block));
  if (unfinished.length) throw invalid("required_blocks_unfinished", "Existen bloques obligatorios sin finalizar.", { blockIds: unfinished.map((block) => block.id) });
  const incomplete = session.blocks.some((block) => block.status === "completed_with_incomplete_data");
  session.status = incomplete ? "completed_with_incomplete_data" : "completed";
  session.completedAt = at;
  session.pausedAt = null;
}

function normalizeBlock(block = {}, index) {
  return {
    id: String(block.id || `block-${index + 1}`),
    kind: String(block.kind || "unspecified"),
    label: String(block.label || ""),
    taskId: block.taskId ? String(block.taskId) : null,
    taskVersion: block.taskVersion ? String(block.taskVersion) : null,
    moduleId: block.moduleId ? String(block.moduleId) : null,
    challengeId: block.challengeId ? String(block.challengeId) : null,
    domains: stringArray(block.domains),
    linkedGoalIds: stringArray(block.linkedGoalIds),
    captures: stringArray(block.captures),
    completionOptions: stringArray(block.completionOptions),
    prohibitedClaims: stringArray(block.prohibitedClaims),
    patientNoteOptional: block.patientNoteOptional === true,
    scale: Array.isArray(block.scale) ? cloneValue(block.scale) : null,
    instructions: block.instructions ? String(block.instructions) : null,
    reason: block.reason ? String(block.reason) : null,
    required: block.required !== false,
    status: "pending",
    plannedMinutes: finiteOrNull(block.plannedMinutes),
    attempts: [],
    result: null,
    resultVersion: null,
    quality: null,
    mustRestart: false,
    interruptionCount: 0
  };
}

function stringArray(value) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function evaluateBlockResult(block, result, event) {
  const missing = [];
  if (result === undefined || result === null) missing.push("result");
  if (block.kind === "cognitive_task") {
    const hasCanonicalResultReference = typeof result?.resultId === "string" && Boolean(result.resultId);
    if (!hasCanonicalResultReference) missing.push("canonical_result_reference");
    if (!(event.taskVersion || result?.taskVersion || block.taskVersion)) missing.push("taskVersion");
  }
  if (block.kind === "functional_transfer") {
    const status = result?.status ?? result?.completionStatus;
    if (!["assigned", "completed", "partial", "not_completed"].includes(status)) missing.push("completionStatus");
  }
  if (block.kind === "self_assessment") {
    ["fatigue", "frustration"].forEach((key) => {
      if (finiteOrNull(result?.[key]) === null) missing.push(key);
    });
    if (finiteOrNull(result?.perceivedConcentration ?? result?.perceived_concentration) === null) missing.push("perceivedConcentration");
  }
  const valid = result?.valid !== false && result?.quality?.valid !== false;
  return {
    complete: missing.length === 0,
    status: missing.length ? "incomplete_data" : valid ? "complete" : "invalid_result",
    missing,
    valid,
    warnings: result?.valid === false || result?.quality?.valid === false ? ["result_marked_invalid"] : []
  };
}

function compactCanonicalResultReference(result) {
  if (!result || typeof result !== "object" || typeof result.resultId !== "string" || !result.resultId) return null;
  const valid = result.valid !== false && result.quality?.valid !== false;
  return {
    resultId: result.resultId,
    taskId: result.taskId ? String(result.taskId) : null,
    taskVersion: result.taskVersion ? String(result.taskVersion) : null,
    metricsVersion: result.metricsVersion ? String(result.metricsVersion) : null,
    status: result.status ? String(result.status) : "completed",
    valid,
    quality: {
      valid,
      flags: Array.isArray(result.quality?.flags) ? result.quality.flags.slice(0, 20).map(String) : []
    },
    canonicalSource: "usuarios/{patientId}/rehabilitacionResultados/{resultId}",
    snapshotContainsMetrics: false,
    completedAtIso: result.completedAtIso ? String(result.completedAtIso) : null
  };
}

function summarizeDataQuality(session) {
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const incompleteBlocks = blocks
    .filter((block) => block.status === "completed_with_incomplete_data" || block.quality?.complete === false)
    .map((block) => block.id);
  const invalidBlocks = blocks.filter((block) => block.quality?.valid === false).map((block) => block.id);
  const interruptedAttempts = blocks.reduce((total, block) => total + (block.attempts || []).filter((attempt) => attempt.status === "interrupted_discarded").length, 0);
  const versionsMissing = [
    ...(!session?.protocolVersion || session.protocolVersion === "unknown" ? ["protocolVersion"] : []),
    ...(!session?.programEngineVersion || session.programEngineVersion === "unknown" ? ["programEngineVersion"] : []),
    ...blocks.filter((block) => block.kind === "cognitive_task" && !block.taskVersion).map((block) => `taskVersion:${block.id}`)
  ];
  return {
    status: incompleteBlocks.length || invalidBlocks.length || versionsMissing.length ? "incomplete_or_cautious" : "complete",
    incompleteBlocks,
    invalidBlocks,
    interruptedAttempts,
    versionsMissing,
    partialInterruptedDataRetained: false
  };
}

function sanitizeSessionContext(context = {}) {
  const allowed = [
    "assessmentPhase", "sessionNumber", "sleepHours", "sleepQuality", "recentCaffeine",
    "adhdMedication", "lastDoseTime", "fatigue", "motivation", "environmentalDistractibility",
    "deviceClass", "inputMode", "browser", "refreshRateHz", "focusLosses", "visibilityLosses",
    "interruptions", "technicalNotes"
  ];
  return Object.fromEntries(allowed.filter((key) => context?.[key] !== undefined).map((key) => [key, cloneValue(context[key])]));
}

function requireStatus(session, allowed, eventType) {
  if (!allowed.includes(session.status)) {
    throw invalid("invalid_session_transition", `${eventType} no es válido desde el estado ${session.status}.`, { allowed, current: session.status });
  }
}

function requireBlock(session, blockId) {
  const id = String(blockId || "");
  const block = session.blocks?.find((item) => item.id === id);
  if (!block) throw invalid("block_not_found", `No existe el bloque ${id || "(vacío)"}.`);
  return block;
}

function assertSessionVersion(session) {
  if (!session || typeof session !== "object") throw invalid("session_required", "Se requiere una sesión estructurada.");
  if (session.schemaVersion && majorVersion(session.schemaVersion) > majorVersion(ADHD_SESSION_SCHEMA_VERSION)) {
    throw invalid("unsupported_future_schema", `No se puede modificar una sesión con esquema futuro ${session.schemaVersion}.`);
  }
}

function isRequired(block) {
  return block.required !== false;
}

function isFinished(block) {
  return ["completed", "completed_with_incomplete_data", "skipped"].includes(block.status);
}

function invalid(code, message, details = {}) {
  return new AdhdSessionTransitionError(code, message, details);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function majorVersion(version) {
  const major = Number(String(version || "0").split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}
