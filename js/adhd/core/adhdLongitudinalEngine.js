import {
  ADHD_PROTOCOL_VERSION,
  ADHD_TASK_CATALOG
} from "../config/adhdProtocol.js";
import { compareAssessmentContexts } from "./adhdProfileEngine.js";
import { percentChange, round } from "./statistics.js";

export const ADHD_LONGITUDINAL_ENGINE_VERSION = "1.1.0";

export const ADHD_ASSESSMENT_PHASES = Object.freeze({
  T0: Object.freeze({ id: "T0", label: "Basal", required: true }),
  T1: Object.freeze({ id: "T1", label: "Intermedia", required: false }),
  T2: Object.freeze({ id: "T2", label: "Final", required: true }),
  T3: Object.freeze({ id: "T3", label: "Seguimiento", required: false })
});

export const ADHD_PRACTICE_EFFECT_NOTICE =
  "Los cambios tras repetir tareas pueden incluir efecto de práctica. No deben atribuirse automáticamente al programa; también deben considerarse contexto, medicación, otros tratamientos y condiciones técnicas.";

export const ADHD_LONGITUDINAL_INTERPRETATION_RULES = Object.freeze({
  id: "raw-intraindividual-change",
  version: ADHD_LONGITUDINAL_ENGINE_VERSION,
  normative: false,
  formula: "Cambio absoluto = seguimiento − basal. Cambio porcentual = (seguimiento − basal) / |basal| × 100 cuando basal es distinto de cero.",
  directionality: "Solo se informa una dirección favorable/desfavorable para métricas con significado inequívoco; velocidad aislada se clasifica como dependiente del contexto de precisión.",
  missingValues: "Una métrica ausente en cualquiera de los dos momentos se conserva como no comparable y no se imputa.",
  attribution: "La dirección del cambio no demuestra eficacia ni causalidad."
});

export function compareAdhdAssessments(baselineInput = {}, followUpInput = {}, options = {}) {
  const baseline = normalizeAssessment(baselineInput, "T0");
  const followUp = normalizeAssessment(followUpInput, options.followUpPhase || "T2");
  const baselineMeasures = extractMeasures(baseline);
  const followUpMeasures = extractMeasures(followUp);
  const repeatedTasks = intersect(baseline.taskIds, followUp.taskIds);
  const versionComparison = compareVersions(baseline, followUp);
  const taskVersionMismatches = new Set(
    versionComparison.comparisons
      .filter((comparison) => comparison.type === "task")
      .map((comparison) => comparison.taskId)
  );
  const formComparison = compareForms(baseline, followUp, repeatedTasks);
  const metricConfigurationMismatches = new Set(
    formComparison.metricConfigurationMismatches.map((item) => item.taskId)
  );
  const followUpMap = new Map(followUpMeasures.map((measure) => [measure.key, measure]));
  const baselineMap = new Map(baselineMeasures.map((measure) => [measure.key, measure]));
  const comparable = [];
  const unavailable = [];

  baselineMeasures.forEach((before) => {
    const after = followUpMap.get(before.key);
    if (before.taskId && taskVersionMismatches.has(before.taskId)) {
      unavailable.push({
        key: before.key,
        taskId: before.taskId,
        label: before.label,
        reason: "task_version_mismatch"
      });
      return;
    }
    if (before.taskId && metricConfigurationMismatches.has(before.taskId)) {
      unavailable.push({
        key: before.key,
        taskId: before.taskId,
        label: before.label,
        reason: "metric_configuration_mismatch"
      });
      return;
    }
    if (!after || !Number.isFinite(before.value) || !Number.isFinite(after.value)) {
      unavailable.push({ key: before.key, taskId: before.taskId, label: before.label, reason: "missing_follow_up_value" });
      return;
    }
    if (before.unit && after.unit && before.unit !== after.unit) {
      unavailable.push({ key: before.key, taskId: before.taskId, label: before.label, reason: "unit_mismatch", beforeUnit: before.unit, afterUnit: after.unit });
      return;
    }
    const delta = after.value - before.value;
    const direction = inferDirection(before);
    comparable.push({
      key: before.key,
      domainId: before.domainId,
      taskId: before.taskId,
      label: before.label,
      unit: before.unit || after.unit || "raw",
      baseline: before.value,
      followUp: after.value,
      absoluteChange: round(delta, options.decimals ?? 4),
      percentChange: round(percentChange(after.value, before.value), 2),
      expectedDirection: direction,
      directionalInterpretation: interpretDirection(delta, direction, Number(options.noChangeTolerance ?? 0)),
      normative: false,
      causalAttribution: false
    });
  });
  followUpMeasures.forEach((after) => {
    if (!baselineMap.has(after.key)) unavailable.push({ key: after.key, taskId: after.taskId, label: after.label, reason: "missing_baseline_value" });
  });

  const contextComparison = compareAssessmentContexts(baseline.context, followUp.context);
  const cautions = [ADHD_PRACTICE_EFFECT_NOTICE];
  if (contextComparison.materiallyDifferent) cautions.push("Las condiciones de evaluación difieren materialmente entre momentos.");
  if (versionComparison.materiallyDifferent) cautions.push("Una o más versiones de tarea/protocolo difieren; las métricas de tareas con versión distinta no se compararon numéricamente.");
  if (versionComparison.missingVersions.length) cautions.push("Falta documentar una o más versiones de tarea administrada.");
  if (formComparison.sameFormTasks.length) cautions.push(`Se repitió la misma forma/configuración en: ${formComparison.sameFormTasks.join(", ")}.`);
  if (formComparison.metricConfigurationMismatches.length) {
    cautions.push(`No se compararon métricas con carga o parámetros distintos en: ${formComparison.metricConfigurationMismatches.map((item) => item.taskId).join(", ")}.`);
  }
  if (formComparison.metricConfigurationUnavailableTasks.length) {
    cautions.push(`No fue posible verificar la equivalencia de parámetros en: ${formComparison.metricConfigurationUnavailableTasks.join(", ")}.`);
  }
  if (!comparable.length) cautions.push("No existen medidas numéricas emparejadas suficientes para comparar.");

  return {
    comparisonId: String(options.comparisonId || `${baseline.assessmentId || baseline.phase}:${followUp.assessmentId || followUp.phase}`),
    longitudinalEngineVersion: ADHD_LONGITUDINAL_ENGINE_VERSION,
    protocolVersion: ADHD_PROTOCOL_VERSION,
    baseline: assessmentReference(baseline),
    followUp: assessmentReference(followUp),
    scoreType: "raw_intraindividual_change",
    normative: false,
    interpretationRules: ADHD_LONGITUDINAL_INTERPRETATION_RULES,
    measures: comparable,
    unavailableMeasures: uniqueBy(unavailable, (item) => `${item.key}:${item.reason}`),
    contextComparison,
    versionComparison,
    practiceEffect: {
      considered: true,
      repeatedTasks,
      ...formComparison,
      notice: ADHD_PRACTICE_EFFECT_NOTICE
    },
    quality: {
      comparableMeasures: comparable.length,
      unavailableMeasures: unavailable.length,
      interpretableWithCaution: comparable.length > 0,
      materiallyDifferentContext: contextComparison.materiallyDifferent,
      materiallyDifferentVersions: versionComparison.materiallyDifferent,
      taskVersionComparable: taskVersionMismatches.size === 0,
      taskVersionMismatches: taskVersionMismatches.size,
      metricConfigurationComparable: formComparison.metricConfigurationMismatches.length === 0,
      metricConfigurationMismatches: formComparison.metricConfigurationMismatches.length
    },
    cautions
  };
}

export function buildAdhdLongitudinalSummary(assessmentInputs = [], options = {}) {
  const assessments = (Array.isArray(assessmentInputs) ? assessmentInputs : [])
    .map((assessment, index) => normalizeAssessment(assessment, index === 0 ? "T0" : null))
    .filter((assessment) => ADHD_ASSESSMENT_PHASES[assessment.phase])
    .sort((left, right) => phaseIndex(left.phase) - phaseIndex(right.phase));
  const byPhase = new Map();
  const duplicatePhases = [];
  assessments.forEach((assessment) => {
    if (byPhase.has(assessment.phase)) duplicatePhases.push(assessment.phase);
    else byPhase.set(assessment.phase, assessment);
  });
  const baseline = byPhase.get("T0");
  const baselineComparisons = baseline
    ? ["T1", "T2", "T3"].filter((phase) => byPhase.has(phase)).map((phase) => compareAdhdAssessments(baseline, byPhase.get(phase), options))
    : [];
  const consecutiveComparisons = [];
  const available = [...byPhase.values()].sort((left, right) => phaseIndex(left.phase) - phaseIndex(right.phase));
  for (let index = 1; index < available.length; index += 1) {
    consecutiveComparisons.push(compareAdhdAssessments(available[index - 1], available[index], options));
  }
  const missingPhases = Object.keys(ADHD_ASSESSMENT_PHASES).filter((phase) => !byPhase.has(phase));
  return {
    longitudinalEngineVersion: ADHD_LONGITUDINAL_ENGINE_VERSION,
    protocolVersion: ADHD_PROTOCOL_VERSION,
    normative: false,
    scoreType: "raw_intraindividual_change",
    phases: Object.values(ADHD_ASSESSMENT_PHASES).map((definition) => ({
      ...definition,
      available: byPhase.has(definition.id),
      assessment: byPhase.has(definition.id) ? assessmentReference(byPhase.get(definition.id)) : null
    })),
    baselineComparisons,
    consecutiveComparisons,
    quality: {
      baselineAvailable: Boolean(baseline),
      finalAvailable: byPhase.has("T2"),
      duplicatePhases: [...new Set(duplicatePhases)],
      missingPhases,
      validForChange: Boolean(baseline && baselineComparisons.length)
    },
    notices: [
      ADHD_PRACTICE_EFFECT_NOTICE,
      "Las comparaciones son intraindividuales y no usan percentiles, normas poblacionales ni puntos de corte diagnósticos."
    ]
  };
}

export function createAdhdReassessmentConfiguration(input = {}) {
  const phase = ADHD_ASSESSMENT_PHASES[input.phase] ? input.phase : "T2";
  const taskIds = Array.isArray(input.taskIds) && input.taskIds.length
    ? input.taskIds.filter((taskId) => ADHD_TASK_CATALOG[taskId])
    : Object.keys(ADHD_TASK_CATALOG).filter((taskId) => ADHD_TASK_CATALOG[taskId].essential);
  const baseSeed = normalizeSeed(input.baseSeed ?? 1);
  const metricConfigurations = input.metricConfigurations && typeof input.metricConfigurations === "object"
    ? input.metricConfigurations
    : {};
  return {
    phase,
    longitudinalEngineVersion: ADHD_LONGITUDINAL_ENGINE_VERSION,
    protocolVersion: ADHD_PROTOCOL_VERSION,
    alternateForms: true,
    generatedBy: "controlled_deterministic_seed",
    tasks: taskIds.map((taskId, index) => ({
      taskId,
      taskVersion: ADHD_TASK_CATALOG[taskId].taskVersion,
      randomSeed: mixSeed(baseSeed, `${phase}:${taskId}:${index}`),
      formIndex: phaseIndex(phase),
      prohibitExactBaselineSequence: phase !== "T0",
      metricConfiguration: clonePlainObject(metricConfigurations[taskId]),
      metricConfigurationVersion: "1.0.0"
    })),
    reproducibility: {
      baseSeed,
      algorithm: "fnv1a_32_seed_mix",
      configurationMustBePersisted: true
    }
  };
}

function clonePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    Array.isArray(item) ? [...item] : (item && typeof item === "object" ? clonePlainObject(item) : item)
  ]));
}

function normalizeAssessment(input, fallbackPhase) {
  const profile = input?.profile || input?.cognitiveProfile || (Array.isArray(input?.domains) ? input : null);
  const phase = String(input?.phase || input?.assessmentPhase || profile?.assessmentPhase || fallbackPhase || "").toUpperCase();
  const taskResults = normalizeTaskResults(input?.taskResults || profile?.taskResults || {});
  const taskIds = [...new Set([
    ...Object.keys(taskResults),
    ...(profile?.sourceTaskIds || []),
    ...(input?.taskIds || [])
  ])];
  return {
    assessmentId: String(input?.assessmentId || profile?.assessmentId || ""),
    phase,
    date: input?.date ?? input?.createdAt ?? profile?.createdAt ?? null,
    profile,
    taskResults,
    taskIds,
    context: input?.context || input?.assessmentContext || profile?.context || {},
    protocolVersion: String(input?.protocolVersion || ADHD_PROTOCOL_VERSION),
    profileEngineVersion: String(profile?.profileEngineVersion || input?.profileEngineVersion || "unknown"),
    formConfiguration: input?.formConfiguration || input?.configuration || {},
    randomSeed: input?.randomSeed ?? input?.configuration?.randomSeed ?? null
  };
}

function extractMeasures(assessment) {
  const profileMeasures = (assessment.profile?.domains || []).flatMap((domain) =>
    (domain.measures || []).filter((measure) => finiteOrNull(measure.value) !== null).map((measure) => ({
      key: `${domain.id}:${measure.taskId || "domain"}:${slug(measure.label)}`,
      domainId: domain.id,
      taskId: String(measure.taskId || ""),
      label: String(measure.label || "Medida"),
      value: finiteOrNull(measure.value),
      unit: String(measure.unit || "raw")
    }))
  );
  if (profileMeasures.length) return uniqueBy(profileMeasures, (measure) => measure.key);
  const taskMeasures = [];
  Object.entries(assessment.taskResults).forEach(([taskId, result]) => {
    collectNumericLeaves(result?.metrics || {}, "metrics", (path, value) => {
      taskMeasures.push({
        key: `task:${taskId}:${path}`,
        domainId: null,
        taskId,
        label: path.replace(/^metrics\./, ""),
        value,
        unit: inferUnit(path)
      });
    });
  });
  return taskMeasures;
}

function collectNumericLeaves(value, path, visit) {
  if (value !== null && value !== undefined && Number.isFinite(Number(value)) && typeof value !== "boolean" && value !== "") {
    visit(path, Number(value));
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  Object.entries(value).forEach(([key, child]) => collectNumericLeaves(child, `${path}.${key}`, visit));
}

function inferDirection(measure) {
  const text = `${measure.key} ${measure.label}`.toLowerCase();
  if (/accuracy|precisi[oó]n|dprime|d-prime|eficien|probabilityinhibit|probabilidad de inhibici[oó]n|nivel m[aá]ximo|correct/.test(text)) return "higher_is_favorable";
  if (/omisi|comisi|falsealarm|falsa alarma|miss|error|variab|coefficient|costo|cost|excess|adicional|violaci|lapse|anticipat/.test(text)) return "lower_is_favorable";
  if (/reactiontime|tiempo de respuesta|meanms|medianms|rt\b|ssd|planningtime|tiempo inicial/.test(text)) return "context_dependent";
  return "descriptive_only";
}

function interpretDirection(delta, direction, tolerance) {
  if (!Number.isFinite(delta)) return "not_comparable";
  if (Math.abs(delta) <= Math.abs(tolerance)) return "no_observed_change";
  if (direction === "higher_is_favorable") return delta > 0 ? "change_in_favorable_direction" : "change_in_unfavorable_direction";
  if (direction === "lower_is_favorable") return delta < 0 ? "change_in_favorable_direction" : "change_in_unfavorable_direction";
  if (direction === "context_dependent") return "change_requires_speed_accuracy_context";
  return "descriptive_change_only";
}

function compareVersions(baseline, followUp) {
  const comparisons = [];
  const missingVersions = [];
  if (baseline.protocolVersion !== followUp.protocolVersion) comparisons.push({ type: "protocol", before: baseline.protocolVersion, after: followUp.protocolVersion });
  if (baseline.profileEngineVersion !== followUp.profileEngineVersion) comparisons.push({ type: "profile_engine", before: baseline.profileEngineVersion, after: followUp.profileEngineVersion });
  intersect(baseline.taskIds, followUp.taskIds).forEach((taskId) => {
    const before = baseline.taskResults[taskId]?.taskVersion || baseline.taskResults[taskId]?.version || "unknown";
    const after = followUp.taskResults[taskId]?.taskVersion || followUp.taskResults[taskId]?.version || "unknown";
    if (before === "unknown" || after === "unknown") missingVersions.push({ taskId, before, after });
    else if (before !== after) comparisons.push({ type: "task", taskId, before, after });
  });
  return { materiallyDifferent: comparisons.length > 0, comparisons, missingVersions };
}

function compareForms(baseline, followUp, taskIds) {
  const sameFormTasks = [];
  const alternateFormTasks = [];
  const metricConfigurationMismatches = [];
  const metricConfigurationUnavailableTasks = [];
  taskIds.forEach((taskId) => {
    const before = baseline.taskResults[taskId]?.randomSeed
      ?? baseline.taskResults[taskId]?.configuration?.randomSeed
      ?? baseline.formConfiguration?.tasks?.find?.((task) => task.taskId === taskId)?.randomSeed
      ?? baseline.randomSeed;
    const after = followUp.taskResults[taskId]?.randomSeed
      ?? followUp.taskResults[taskId]?.configuration?.randomSeed
      ?? followUp.formConfiguration?.tasks?.find?.((task) => task.taskId === taskId)?.randomSeed
      ?? followUp.randomSeed;
    if (before !== null && before !== undefined && after !== null && after !== undefined) {
      if (String(before) === String(after)) sameFormTasks.push(taskId);
      else alternateFormTasks.push(taskId);
    }
    const beforeMetricConfiguration = metricConfigurationForTask(baseline, taskId);
    const afterMetricConfiguration = metricConfigurationForTask(followUp, taskId);
    if (!beforeMetricConfiguration || !afterMetricConfiguration) {
      metricConfigurationUnavailableTasks.push(taskId);
    } else if (stableConfiguration(beforeMetricConfiguration) !== stableConfiguration(afterMetricConfiguration)) {
      metricConfigurationMismatches.push({
        taskId,
        baseline: beforeMetricConfiguration,
        followUp: afterMetricConfiguration
      });
    }
  });
  return {
    sameFormTasks,
    alternateFormTasks,
    formInformationAvailable: sameFormTasks.length + alternateFormTasks.length,
    metricConfigurationMismatches,
    metricConfigurationUnavailableTasks
  };
}

function metricConfigurationForTask(assessment, taskId) {
  const result = assessment.taskResults?.[taskId];
  const formTask = assessment.formConfiguration?.tasks?.find?.((task) => task.taskId === taskId);
  const candidate = result?.comparisonConfiguration
    || result?.configuration?.metricConfiguration
    || formTask?.metricConfiguration;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate;
}

function stableConfiguration(value) {
  if (Array.isArray(value)) return `[${value.map(stableConfiguration).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableConfiguration(value[key])}`).join(",")}}`;
}

function assessmentReference(assessment) {
  return {
    assessmentId: assessment.assessmentId,
    phase: assessment.phase,
    label: ADHD_ASSESSMENT_PHASES[assessment.phase]?.label || assessment.phase,
    date: assessment.date,
    protocolVersion: assessment.protocolVersion,
    profileEngineVersion: assessment.profileEngineVersion,
    taskIds: assessment.taskIds
  };
}

function normalizeTaskResults(results) {
  if (Array.isArray(results)) return Object.fromEntries(results.filter((item) => item?.taskId).map((item) => [item.taskId, item]));
  return results && typeof results === "object" ? { ...results } : {};
}

function inferUnit(path) {
  const lower = path.toLowerCase();
  if (/ms|reactiontime|ssd|ssrt|time/.test(lower)) return "ms";
  if (/accuracy|rate|probability|proportion|efficiency|coefficient/.test(lower)) return "proportion";
  return "raw";
}

function intersect(left, right) {
  const rightSet = new Set(right || []);
  return [...new Set(left || [])].filter((item) => rightSet.has(item));
}

function phaseIndex(phase) {
  return ["T0", "T1", "T2", "T3"].indexOf(phase);
}

function normalizeSeed(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (numeric >>> 0) || 1 : hash32(String(value || "1"));
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mixSeed(baseSeed, label) {
  return (hash32(`${baseSeed}:${label}`) ^ baseSeed) >>> 0 || 1;
}

function hash32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function slug(value) {
  return String(value || "measure").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function uniqueBy(values, selector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = selector(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
