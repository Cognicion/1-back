import {
  ADHD_PROTOCOL_ID,
  ADHD_TASK_CATALOG
} from "../config/adhdProtocol.js";

export const ADHD_PATIENT_RECORD_SCHEMA_VERSION = "1.0.0";

const PHASE_LABELS = Object.freeze({
  T0: "T0 · basal",
  T1: "T1 · intermedia",
  T2: "T2 · final",
  T3: "T3 · seguimiento"
});

const EVALUATION_STATUS_LABELS = Object.freeze({
  in_progress: "En curso",
  paused: "Interrumpida; puede continuar",
  completed_pending_profile: "Batería completa; perfil pendiente",
  completed: "Completada y revisada",
  archived: "Archivada"
});

const TASK_STATUS_LABELS = Object.freeze({
  completed: "Completada",
  interrupted: "Interrumpida",
  paused: "Pausada",
  in_progress: "En curso",
  pending: "Pendiente"
});

const METRIC_DEFINITIONS = Object.freeze({
  cpt_x: [
    ["Precisión", ["accuracy"], "proportion"],
    ["Tiempo de respuesta medio", ["reactionTime", "meanMs"], "ms"],
    ["Variabilidad del RT (CV)", ["reactionTime", "coefficientOfVariation"], "number"]
  ],
  go_nogo: [
    ["Precisión", ["accuracy"], "proportion"],
    ["Comisiones No-Go", ["commissionRate"], "proportion"],
    ["RT Go medio", [["goReactionTime", "meanMs"], ["reactionTime", "meanMs"]], "ms"]
  ],
  nback: [
    ["Precisión", ["accuracy"], "proportion"],
    ["d-prime", ["dPrime"], "number"],
    ["RT medio", ["reactionTime", "meanMs"], "ms"],
    ["Nivel máximo estable", ["maximumStableLevel"], "number"]
  ],
  stroop: [
    ["Precisión incongruente", ["incongruentAccuracy"], "proportion"],
    ["RT incongruente medio", ["incongruentReactionTime", "meanMs"], "ms"],
    ["Costo de interferencia", ["interferenceCostMs"], "ms"]
  ],
  stop_signal: [
    ["Inhibiciones exitosas", ["probabilityInhibit"], "proportion"],
    ["SSD medio", ["meanSsdMs"], "ms"],
    ["SSRT (integration method)", ["ssrtMs"], "ms"]
  ],
  task_switching: [
    ["Precisión repeat", ["repeatAccuracy"], "proportion"],
    ["Precisión switch", ["switchAccuracy"], "proportion"],
    ["Costo de cambio", ["switchCostMs"], "ms"]
  ],
  temporal_estimation: [
    ["Error absoluto", ["absoluteErrorMs"], "ms"],
    ["Error relativo absoluto", ["absoluteRelativeError"], "proportion"],
    ["Sesgo", ["biasMs"], "ms"]
  ],
  route_planning: [
    ["Eficiencia", ["efficiency"], "proportion"],
    ["Movimientos adicionales", ["excessMoves"], "number"],
    ["Tiempo inicial de planificación", ["meanPlanningTimeMs"], "ms"]
  ]
});

const FALLBACK_METRICS = Object.freeze([
  ["Precisión", ["accuracy"], "proportion"],
  ["RT medio", [["reactionTime", "meanMs"], ["meanRtMs"]], "ms"],
  ["Variabilidad del RT (CV)", [["reactionTime", "coefficientOfVariation"], ["coefficientOfVariation"]], "number"]
]);

export function construirHistorialBateriasAdhd({ programs = [], evaluations = [], results = [], audit = [] } = {}) {
  const canonicalPrograms = programs.filter((program) => program?.protocolId === ADHD_PROTOCOL_ID);
  const programIds = new Set(canonicalPrograms.map((program) => String(program.programId || program.id || "")).filter(Boolean));
  const canonicalResults = results.filter((result) => (
    result?.protocolId === ADHD_PROTOCOL_ID
    && (!programIds.size || programIds.has(String(result.programId || "")))
  ));
  const sourceByEvaluation = buildAuditSourceMap(audit);
  const records = evaluations
    .filter((evaluation) => !programIds.size || programIds.has(String(evaluation?.programId || "")))
    .map((evaluation) => buildEvaluationRecord(evaluation, canonicalResults, sourceByEvaluation))
    .sort((left, right) => right.sortTimestamp - left.sortTimestamp || right.id.localeCompare(left.id, "es"));

  return {
    schemaVersion: ADHD_PATIENT_RECORD_SCHEMA_VERSION,
    protocolId: ADHD_PROTOCOL_ID,
    totalEvaluations: records.length,
    completedEvaluations: records.filter((record) => ["completed", "completed_pending_profile"].includes(record.status)).length,
    records
  };
}

function buildEvaluationRecord(evaluation = {}, canonicalResults = [], sourceByEvaluation = new Map()) {
  const id = String(evaluation.assessmentId || evaluation.id || "");
  const resultIds = new Set([
    ...(evaluation.resultIds || []),
    ...(evaluation.taskResultIds || [])
  ].map(String));
  const matchingResults = canonicalResults.filter((result) => {
    const resultId = String(result.resultId || result.idResultado || result.id || "");
    return String(result.references?.evaluationId || "") === id || resultIds.has(resultId);
  });
  const taskIds = uniqueStrings([
    ...(evaluation.taskIds || []),
    ...matchingResults.map((result) => result.taskId || result.activityId)
  ]);
  const tasks = taskIds.map((taskId) => buildTaskRecord(taskId, matchingResults));
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const validTasks = tasks.filter((task) => task.status === "completed" && task.valid).length;
  const startedAt = evaluation.startedAt || evaluation.startedAtIso || evaluation.createdAt || evaluation.createdAtIso || null;
  const completedAt = evaluation.completedAt || evaluation.completedAtIso || null;
  const provenance = resolveProvenance(evaluation, sourceByEvaluation.get(id));

  return {
    id,
    programId: String(evaluation.programId || ""),
    protocolId: evaluation.protocolId || ADHD_PROTOCOL_ID,
    protocolVersion: String(evaluation.protocolVersion || "Sin versión registrada"),
    phase: String(evaluation.phase || ""),
    phaseLabel: PHASE_LABELS[evaluation.phase] || String(evaluation.phase || "Fase no registrada"),
    batteryType: String(evaluation.batteryType || "unknown"),
    batteryLabel: batteryLabel(evaluation.batteryType, taskIds.length),
    status: String(evaluation.status || "pending"),
    statusLabel: EVALUATION_STATUS_LABELS[evaluation.status] || TASK_STATUS_LABELS[evaluation.status] || "Estado no registrado",
    sourceCode: provenance.sourceCode,
    sourceLabel: provenance.sourceLabel,
    sourceRecorded: provenance.recorded,
    startedAt,
    completedAt,
    pausedAt: evaluation.pausedAt || null,
    sortTimestamp: timestampMillis(completedAt || evaluation.pausedAt || startedAt),
    taskCount: taskIds.length,
    completedTasks,
    validTasks,
    tasks,
    qualityValid: evaluation.quality?.valid !== false,
    dataStatus: taskIds.length ? "available" : "insufficient"
  };
}

function buildTaskRecord(taskId, matchingResults = []) {
  const result = matchingResults
    .filter((candidate) => String(candidate.taskId || candidate.activityId || "") === taskId)
    .sort((left, right) => timestampMillis(right.completedAtIso || right.updatedAt) - timestampMillis(left.completedAtIso || left.updatedAt))[0] || null;
  const status = String(result?.status || "pending");
  const valid = Boolean(result) && result.valid !== false && result.quality?.valid !== false && result.metrics?.valid !== false;
  return {
    id: taskId,
    label: ADHD_TASK_CATALOG[taskId]?.label || taskId || "Tarea no identificada",
    status,
    statusLabel: result
      ? `${TASK_STATUS_LABELS[status] || status}${status === "completed" && !valid ? " · no interpretable" : ""}`
      : "Sin resultado canónico",
    valid,
    completedAt: result?.completedAtIso || result?.completedAt || null,
    metrics: summarizeMetrics(taskId, result?.metrics || result?.results || {})
  };
}

function resolveProvenance(evaluation = {}, auditedRole = "") {
  const administration = evaluation.administration || {};
  const role = String(administration.actorRole || evaluation.appliedByRole || auditedRole || "").toLowerCase();
  if (role === "patient") {
    return { sourceCode: "patient_account", sourceLabel: "Paciente · cuenta COGNICIÓN", recorded: true };
  }
  if (["clinician", "medical", "professional", "admin"].includes(role)) {
    return { sourceCode: "clinician_account", sourceLabel: "Médico/profesional · expediente seleccionado", recorded: true };
  }
  return { sourceCode: "unknown", sourceLabel: "Origen no registrado en esta versión", recorded: false };
}

function buildAuditSourceMap(audit = []) {
  const map = new Map();
  audit
    .filter((entry) => entry?.eventType === "assessment_started")
    .sort((left, right) => timestampMillis(left.occurredAtIso || left.createdAt) - timestampMillis(right.occurredAtIso || right.createdAt))
    .forEach((entry) => {
      const evaluationId = String(entry.details?.evaluationId || "");
      if (evaluationId) map.set(evaluationId, String(entry.actorRole || ""));
    });
  return map;
}

function summarizeMetrics(taskId, metrics = {}) {
  return (METRIC_DEFINITIONS[taskId] || FALLBACK_METRICS)
    .map(([label, path, unit]) => ({ label, value: readMetric(metrics, path), unit }))
    .filter((metric) => Number.isFinite(metric.value))
    .map((metric) => ({ label: metric.label, display: formatMetric(metric.value, metric.unit) }));
}

function readMetric(metrics, pathOrAlternatives) {
  const alternatives = Array.isArray(pathOrAlternatives?.[0]) ? pathOrAlternatives : [pathOrAlternatives];
  for (const path of alternatives) {
    const value = path.reduce((current, key) => current?.[key], metrics);
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function formatMetric(value, unit) {
  const numeric = unit === "proportion" ? value * 100 : value;
  const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
  if (unit === "proportion") return `${rounded} %`;
  if (unit === "ms") return `${rounded} ms`;
  return String(rounded);
}

function batteryLabel(type, taskCount) {
  const label = type === "essential" ? "Esencial" : type === "expanded" ? "Ampliada" : "Modalidad no registrada";
  return `${label} · ${taskCount} tarea${taskCount === 1 ? "" : "s"}`;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return Number(value.toMillis()) || 0;
  if (typeof value?.toDate === "function") return Number(value.toDate()?.getTime()) || 0;
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
