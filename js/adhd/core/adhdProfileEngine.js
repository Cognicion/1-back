import {
  ADHD_DOMAINS,
  ADHD_FUNCTIONAL_DIFFICULTIES,
  ADHD_PROFILE_ENGINE_VERSION,
  ADHD_TASK_CATALOG
} from "../config/adhdProtocol.js";
import { clamp, mean, round } from "./statistics.js";

export { ADHD_PROFILE_ENGINE_VERSION };

const DOMAIN_REQUIRED_TASKS = Object.freeze({
  sustainedAttention: ["cpt_x", "go_nogo"],
  inhibitoryControl: ["go_nogo", "stop_signal"],
  interferenceControl: ["stroop"],
  workingMemory: ["nback"],
  cognitiveFlexibility: ["task_switching"],
  responseVariability: ["cpt_x", "go_nogo", "nback", "stroop", "stop_signal", "task_switching"],
  planning: ["route_planning"],
  temporalControl: ["temporal_estimation"],
  metacognition: [],
  functionalTransfer: []
});

export const ADHD_PROFILE_SELECTION_FORMULA = Object.freeze({
  id: "domain-training-selection-signal",
  version: ADHD_PROFILE_ENGINE_VERSION,
  range: [0, 1],
  normative: false,
  formula: "0.60 × vínculo con objetivo funcional + 0.40 × señal de dificultad observada dentro de la tarea",
  missingValues: "Si no existen métricas válidas, la señal se deriva solo de objetivos funcionales y se marca como dato insuficiente.",
  interpretation: "Sirve para ordenar contenidos de entrenamiento; no cuantifica gravedad, diagnóstico, percentil ni desviación respecto de una población."
});

export function buildAdhdProfile(input = {}) {
  const taskResults = normalizeTaskResults(input.taskResults);
  const usableTaskResults = Object.fromEntries(
    Object.entries(taskResults).filter(([, result]) => isUsableTaskResult(result))
  );
  const goalDomains = resolveGoalDomains(input.functionalGoals, input.functionalDifficulties);
  const domains = Object.keys(ADHD_DOMAINS).map((domainId) => {
    const taskIds = DOMAIN_REQUIRED_TASKS[domainId] || [];
    const relevantResults = taskIds.map((taskId) => taskResults[taskId]).filter(Boolean);
    const validResults = relevantResults.filter(isUsableTaskResult);
    const measures = extractDomainMeasures(domainId, usableTaskResults);
    const observedDifficulty = calculateObservedDifficultySignal(domainId, usableTaskResults);
    const linkedGoals = goalDomains.filter((goal) => goal.domains.includes(domainId));
    const functionalSignal = linkedGoals.length ? 1 : 0;
    const selectionSignal = round((functionalSignal * 0.6) + ((observedDifficulty ?? 0) * 0.4), 3);
    const status = taskIds.length === 0
      ? (linkedGoals.length ? "functional_only" : "not_assessed")
      : validResults.length === taskIds.length
        ? "complete"
        : validResults.length
          ? "partial"
          : "insufficient_data";
    return {
      id: domainId,
      label: ADHD_DOMAINS[domainId].label,
      status,
      sourceTasks: taskIds,
      availableTasks: relevantResults.map((result) => result.taskId),
      validTasks: validResults.map((result) => result.taskId),
      measures,
      linkedGoals: linkedGoals.map(({ id, label }) => ({ id, label })),
      observedDifficultySignal: observedDifficulty,
      selectionSignal,
      selectionSignalLabel: "Índice interno experimental no normativo para selección del entrenamiento",
      caveats: buildDomainCaveats(taskIds, relevantResults, validResults, observedDifficulty)
    };
  });

  const requiredTaskIds = [...new Set(Object.values(DOMAIN_REQUIRED_TASKS).flat())];
  const completedTasks = requiredTaskIds.filter((taskId) => taskResults[taskId]?.status === "completed");
  const validTasks = requiredTaskIds.filter((taskId) => isUsableTaskResult(taskResults[taskId]));
  const invalidTasks = requiredTaskIds.filter((taskId) => taskResults[taskId]?.status === "completed" && !isUsableTaskResult(taskResults[taskId]));

  return {
    profileId: String(input.profileId || `profile-${Date.now()}`),
    profileEngineVersion: ADHD_PROFILE_ENGINE_VERSION,
    assessmentId: String(input.assessmentId || ""),
    assessmentPhase: String(input.assessmentPhase || "T0"),
    createdAt: input.createdAt || new Date().toISOString(),
    normative: false,
    scoreType: "raw_and_intraindividual",
    selectionFormula: ADHD_PROFILE_SELECTION_FORMULA,
    domains,
    sourceTaskIds: Object.keys(taskResults),
    quality: {
      requiredTasks: requiredTaskIds.length,
      completedTasks: completedTasks.length,
      validTasks: validTasks.length,
      invalidTasks,
      complete: completedTasks.length === requiredTaskIds.length,
      fullyInterpretable: validTasks.length === requiredTaskIds.length
    },
    context: sanitizeContext(input.assessmentContext),
    interpretationNotices: [
      "El perfil conserva medidas por dominio y no produce una puntuación global de TDAH.",
      "Las señales internas ordenan contenidos de entrenamiento; no son normas, percentiles, diagnóstico ni severidad clínica.",
      "La interpretación debe considerar sueño, medicación, fatiga, motivación, dispositivo, interrupciones y efecto de práctica."
    ]
  };
}

export function compareAssessmentContexts(baseline = {}, followUp = {}) {
  const comparisons = [
    compareNumericContext("sleepHours", "Horas de sueño", baseline, followUp, 2),
    compareNumericContext("fatigue", "Fatiga subjetiva", baseline, followUp, 2),
    compareNumericContext("motivation", "Motivación", baseline, followUp, 2),
    compareNumericContext("environmentalDistractibility", "Distractibilidad ambiental", baseline, followUp, 2),
    compareCategoricalContext("inputMode", "Modalidad de respuesta", baseline, followUp),
    compareCategoricalContext("deviceClass", "Tipo de dispositivo", baseline, followUp),
    compareCategoricalContext("adhdMedication", "Medicación para TDAH", baseline, followUp),
    compareCategoricalContext("lastDoseTime", "Hora de última dosis", baseline, followUp)
  ].filter(Boolean);
  return {
    materiallyDifferent: comparisons.some((item) => item.material),
    comparisons,
    summary: comparisons.filter((item) => item.material).map((item) => item.message)
  };
}

function normalizeTaskResults(results = {}) {
  if (Array.isArray(results)) {
    return Object.fromEntries(results.filter((item) => item?.taskId).map((item) => [item.taskId, item]));
  }
  return Object.fromEntries(Object.entries(results || {}).map(([taskId, result]) => [taskId, { taskId, ...result }]));
}

function resolveGoalDomains(goals = [], difficultyIds = []) {
  const output = [];
  const difficultyMap = new Map(ADHD_FUNCTIONAL_DIFFICULTIES.map((item) => [item.id, item]));
  const selectedDifficulties = Array.isArray(difficultyIds) ? difficultyIds : [];
  selectedDifficulties.forEach((id) => {
    const item = difficultyMap.get(typeof id === "string" ? id : id?.id);
    if (item) output.push({ id: item.id, label: item.label, domains: item.domains });
  });
  (Array.isArray(goals) ? goals : []).forEach((goal, index) => {
    const domains = Array.isArray(goal.domains) ? goal.domains.filter((domain) => ADHD_DOMAINS[domain]) : [];
    if (!domains.length && goal.difficultyId && difficultyMap.has(goal.difficultyId)) {
      domains.push(...difficultyMap.get(goal.difficultyId).domains);
    }
    output.push({
      id: String(goal.id || `goal-${index + 1}`),
      label: String(goal.label || goal.action || goal.text || "Objetivo funcional"),
      domains
    });
  });
  return output;
}

function isUsableTaskResult(result) {
  if (!result || result.status !== "completed") return false;
  if (result.valid === false || result.quality?.valid === false || result.metrics?.valid === false) return false;
  return true;
}

function extractDomainMeasures(domainId, taskResults) {
  const cpt = taskResults.cpt_x?.metrics || {};
  const go = taskResults.go_nogo?.metrics || {};
  const nback = taskResults.nback?.metrics || {};
  const stroop = taskResults.stroop?.metrics || {};
  const stop = taskResults.stop_signal?.metrics || {};
  const switching = taskResults.task_switching?.metrics || {};
  const temporal = taskResults.temporal_estimation?.metrics || {};
  const planning = taskResults.route_planning?.metrics || {};
  const definitions = {
    sustainedAttention: [
      measure("cpt_x", "Omisiones CPT", cpt.misses, "count"),
      measure("cpt_x", "d-prime CPT", cpt.dPrime, "raw"),
      measure("cpt_x", "Cambio de precisión por bloques", cpt.temporal?.accuracyChange ?? cpt.accuracyChange, "proportion_delta"),
      measure("go_nogo", "Tasa de omisiones Go", go.omissionRate, "proportion")
    ],
    inhibitoryControl: [
      measure("go_nogo", "Tasa de comisiones No-Go", go.commissionRate, "proportion"),
      measure("stop_signal", "SSRT por método de integración", stop.ssrtMs, "ms", stop.valid === false ? "invalid" : "valid"),
      measure("stop_signal", "Probabilidad de inhibición", stop.probabilityInhibit, "proportion")
    ],
    interferenceControl: [
      measure("stroop", "Costo de interferencia", stroop.interferenceCostMs, "ms"),
      measure("stroop", "Precisión incongruente", stroop.incongruentAccuracy, "proportion")
    ],
    workingMemory: [
      measure("nback", "Aciertos", nback.hits, "count"),
      measure("nback", "Falsas alarmas", nback.falseAlarms, "count"),
      measure("nback", "d-prime", nback.dPrime, "raw"),
      measure("nback", "Nivel máximo estable", nback.maximumStableLevel, "level")
    ],
    cognitiveFlexibility: [
      measure("task_switching", "Costo de cambio", switching.switchCostMs, "ms"),
      measure("task_switching", "Costo de precisión", switching.switchAccuracyCost, "proportion_delta")
    ],
    responseVariability: collectVariabilityMeasures(taskResults),
    planning: [
      measure("route_planning", "Movimientos adicionales", planning.excessMoves, "count"),
      measure("route_planning", "Eficiencia", planning.efficiency, "proportion"),
      measure("route_planning", "Tiempo inicial de planificación", planning.meanPlanningTimeMs, "ms"),
      measure("route_planning", "Violaciones de regla", planning.ruleViolations, "count")
    ],
    temporalControl: [
      measure("temporal_estimation", "Error absoluto", temporal.absoluteErrorMs, "ms"),
      measure("temporal_estimation", "Error relativo absoluto", temporal.absoluteRelativeError, "proportion"),
      measure("temporal_estimation", "Sesgo", temporal.biasMs, "ms"),
      measure("temporal_estimation", "Variabilidad", temporal.variabilityMs, "ms")
    ],
    metacognition: [],
    functionalTransfer: []
  };
  return (definitions[domainId] || []).filter((item) => item.value !== null);
}

function calculateObservedDifficultySignal(domainId, taskResults) {
  const cpt = taskResults.cpt_x?.metrics || {};
  const go = taskResults.go_nogo?.metrics || {};
  const nback = taskResults.nback?.metrics || {};
  const stroop = taskResults.stroop?.metrics || {};
  const switching = taskResults.task_switching?.metrics || {};
  const temporal = taskResults.temporal_estimation?.metrics || {};
  const planning = taskResults.route_planning?.metrics || {};
  const signals = {
    sustainedAttention: [cpt.missRate, go.omissionRate, negativeAccuracyChange(cpt.temporal?.accuracyChange ?? cpt.accuracyChange)],
    inhibitoryControl: [go.commissionRate],
    interferenceControl: [accuracyDeficit(stroop.incongruentAccuracy), relativeCost(stroop.interferenceCostMs, stroop.congruentReactionTime?.meanMs)],
    workingMemory: [accuracyDeficit(nback.accuracy)],
    cognitiveFlexibility: [accuracyDeficit(switching.switchAccuracy), relativeCost(switching.switchCostMs, switching.repeatReactionTime?.meanMs)],
    responseVariability: collectVariabilityMeasures(taskResults).map((item) => item.value),
    planning: [accuracyDeficit(planning.efficiency), planning.completed === 0 && planning.puzzles > 0 ? 1 : null],
    temporalControl: [temporal.absoluteRelativeError],
    metacognition: [],
    functionalTransfer: []
  };
  const valid = (signals[domainId] || []).map(finiteOrNull).filter(Number.isFinite).map((value) => clamp(value, 0, 1));
  return valid.length ? round(mean(valid), 3) : null;
}

function collectVariabilityMeasures(taskResults) {
  const output = [];
  Object.values(taskResults).forEach((result) => {
    const metrics = result?.metrics || {};
    const candidates = [
      metrics.reactionTime?.coefficientOfVariation,
      metrics.goReactionTime?.coefficientOfVariation,
      metrics.congruentReactionTime?.coefficientOfVariation,
      metrics.incongruentReactionTime?.coefficientOfVariation,
      metrics.repeatReactionTime?.coefficientOfVariation,
      metrics.switchReactionTime?.coefficientOfVariation,
      metrics.coefficientOfVariation
    ].map(finiteOrNull).filter(Number.isFinite);
    if (candidates.length) output.push(measure(result.taskId, "Coeficiente de variación del TR", round(mean(candidates), 4), "coefficient"));
  });
  return output;
}

function buildDomainCaveats(requiredTasks, relevantResults, validResults, observedDifficulty) {
  const caveats = [];
  if (requiredTasks.length && relevantResults.length < requiredTasks.length) caveats.push("Faltan una o más tareas previstas para este dominio.");
  if (relevantResults.length > validResults.length) caveats.push("Existe al menos un resultado no interpretable por control de calidad.");
  if (observedDifficulty === null) caveats.push("Dato insuficiente para calcular una señal interna de selección.");
  caveats.push("No se aplicaron normas poblacionales ni puntos de corte diagnósticos.");
  return caveats;
}

function measure(taskId, label, value, unit, validity = "valid") {
  const numeric = finiteOrNull(value);
  return {
    taskId,
    label,
    value: Number.isFinite(numeric) ? numeric : null,
    unit,
    validity,
    normative: false
  };
}

function accuracyDeficit(value) {
  const numeric = finiteOrNull(value);
  return Number.isFinite(numeric) ? 1 - clamp(numeric, 0, 1) : null;
}

function relativeCost(cost, baseline) {
  const numericCost = finiteOrNull(cost);
  const numericBaseline = finiteOrNull(baseline);
  if (!Number.isFinite(numericCost) || !Number.isFinite(numericBaseline) || numericBaseline <= 0) return null;
  return clamp(numericCost / numericBaseline, 0, 1);
}

function negativeAccuracyChange(value) {
  const numeric = finiteOrNull(value);
  return Number.isFinite(numeric) && numeric < 0 ? Math.abs(numeric) : Number.isFinite(numeric) ? 0 : null;
}

function sanitizeContext(context = {}) {
  const allowed = [
    "age", "laterality", "sleepHours", "sleepQuality", "assessmentTime", "recentCaffeine",
    "adhdMedication", "lastDoseTime", "recentTreatmentChanges", "fatigue", "motivation",
    "environmentalDistractibility", "visualProblems", "auditoryProblems", "deviceClass",
    "inputMode", "interruptions", "browser", "refreshRateHz", "focusLosses", "visibilityLosses"
  ];
  return Object.fromEntries(allowed.filter((key) => context[key] !== undefined).map((key) => [key, context[key]]));
}

function compareNumericContext(key, label, baseline, followUp, threshold) {
  const before = finiteOrNull(baseline[key]);
  const after = finiteOrNull(followUp[key]);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const delta = after - before;
  const material = Math.abs(delta) >= threshold;
  return { key, label, before, after, delta, material, message: `${label}: basal ${before}; reevaluación ${after}.` };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareCategoricalContext(key, label, baseline, followUp) {
  const before = String(baseline[key] ?? "").trim();
  const after = String(followUp[key] ?? "").trim();
  if (!before || !after) return null;
  const material = before !== after;
  return { key, label, before, after, material, message: `${label}: basal “${before}”; reevaluación “${after}”.` };
}

export function getDomainTaskLabels(domainId) {
  return (DOMAIN_REQUIRED_TASKS[domainId] || []).map((taskId) => ADHD_TASK_CATALOG[taskId]?.label || taskId);
}
