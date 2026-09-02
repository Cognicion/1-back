import { ADHD_ADAPTIVE_ENGINE_VERSION, ADHD_DEFAULT_PROGRAM } from "../config/adhdProtocol.js";
import { clamp, mean, round } from "./statistics.js";

export { ADHD_ADAPTIVE_ENGINE_VERSION };

const dimension = (key, minimum, maximum, step, harderDirection = "increase", integer = false) => Object.freeze({
  key,
  minimum,
  maximum,
  step,
  harderDirection,
  integer
});

export const ADHD_ADAPTIVE_TASK_RULES = Object.freeze({
  nback: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("level", 1, 4, 1, "increase", true),
      dimension("intervalMs", 700, 3000, 100, "decrease", true),
      dimension("trialCount", 8, 40, 4, "increase", true)
    ])
  }),
  cpt_x: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("distractorLevel", 0, 4, 1, "increase", true),
      dimension("isiMs", 650, 1800, 100, "decrease", true),
      dimension("targetRarity", 0, 3, 1, "increase", true),
      dimension("durationMinutes", 3, 10, 1, "increase", true)
    ])
  }),
  go_nogo: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("perceptualSimilarity", 0, 3, 1, "increase", true),
      dimension("responseWindowMs", 450, 1800, 100, "decrease", true),
      dimension("noGoRarity", 0, 3, 1, "increase", true)
    ])
  }),
  stroop: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("interferenceLevel", 0, 3, 1, "increase", true),
      dimension("responseWindowMs", 600, 2500, 100, "decrease", true),
      dimension("incongruentProportion", 0.25, 0.75, 0.05, "increase", false)
    ])
  }),
  task_switching: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("responseWindowMs", 650, 2600, 100, "decrease", true),
      dimension("switchProportion", 0.2, 0.65, 0.05, "increase", false),
      dimension("trialCount", 24, 96, 8, "increase", true)
    ])
  }),
  temporal_estimation: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("intervalRangeLevel", 1, 4, 1, "increase", true),
      dimension("trialCount", 8, 32, 4, "increase", true)
    ])
  }),
  route_planning: Object.freeze({
    targetRange: [0.75, 0.85],
    dimensions: Object.freeze([
      dimension("planningDepth", 2, 8, 1, "increase", true),
      dimension("gridSize", 4, 8, 1, "increase", true),
      dimension("distractorLevel", 0, 3, 1, "increase", true)
    ])
  }),
  stop_signal: Object.freeze({
    method: "one_up_one_down_ssd_staircase",
    targetInhibitionProbability: 0.5,
    targetRange: null,
    dimensions: Object.freeze([dimension("ssdMs", 50, 900, 50, "increase", true)])
  })
});

export const ADHD_ADAPTIVE_FORMULA = Object.freeze({
  id: "moving-window-task-specific-adaptation",
  version: ADHD_ADAPTIVE_ENGINE_VERSION,
  normative: false,
  defaultWindowSize: 5,
  defaultTargetRange: ADHD_DEFAULT_PROGRAM.adaptiveAccuracyTarget,
  rule: "Bajo el rango se reduce una dimensión; dentro del rango se mantiene; sobre el rango se aumenta una sola dimensión si no hay fatiga ni intercambio velocidad-precisión.",
  missingValues: "Sin un mínimo de observaciones válidas se mantiene la dificultad.",
  stopSignalException: "Stop-Signal usa un staircase SSD 1-up/1-down orientado a aproximadamente 50 % de inhibición y no el objetivo general de precisión."
});

export function evaluateAdaptiveWindow(taskId, observations = [], options = {}) {
  const taskRule = resolveTaskRule(taskId, options);
  const windowSize = Math.max(1, Math.round(Number(options.windowSize ?? 5)));
  const minimumObservations = Math.max(1, Math.round(Number(options.minimumObservations ?? 3)));
  const valid = (Array.isArray(observations) ? observations : [])
    .filter((item) => item && item.valid !== false && item.quality?.valid !== false && item.status !== "interrupted")
    .slice(-windowSize);
  if (taskId === "stop_signal") {
    const outcomes = valid.map((item) => item.inhibitionSuccessful).filter((value) => typeof value === "boolean");
    const probabilityInhibit = outcomes.length ? outcomes.filter(Boolean).length / outcomes.length : null;
    return {
      taskId,
      adaptiveEngineVersion: ADHD_ADAPTIVE_ENGINE_VERSION,
      method: taskRule.method,
      windowSize,
      observationsAvailable: valid.length,
      observationsScored: outcomes.length,
      minimumObservations,
      targetRange: null,
      targetInhibitionProbability: taskRule.targetInhibitionProbability,
      probabilityInhibit: round(probabilityInhibit, 4),
      generalAccuracyTargetApplied: false,
      band: outcomes.length >= minimumObservations ? "ssd_staircase_only" : "insufficient_data",
      normative: false
    };
  }
  const scored = valid.map((item) => ({
    accuracy: readAccuracy(taskId, item),
    omissionRate: readOmissionRate(taskId, item),
    commissionRate: readCommissionRate(taskId, item),
    meanRtMs: readMeanRt(item),
    anticipatoryRate: readAnticipatoryRate(item),
    coefficientOfVariation: readVariability(item),
    fatigue: readScale(item.fatigue ?? item.selfReport?.fatigue),
    frustration: readScale(item.frustration ?? item.selfReport?.frustration)
  }));
  const accuracies = scored.map((item) => item.accuracy).filter(Number.isFinite);
  const averageAccuracy = mean(accuracies);
  const meanRtMs = mean(scored.map((item) => item.meanRtMs).filter(Number.isFinite));
  const meanAnticipatoryRate = mean(scored.map((item) => item.anticipatoryRate).filter(Number.isFinite));
  const meanOmissionRate = mean(scored.map((item) => item.omissionRate).filter(Number.isFinite));
  const meanCommissionRate = mean(scored.map((item) => item.commissionRate).filter(Number.isFinite));
  const targetRange = taskRule.targetRange || normalizeTarget(options.targetRange);
  const fatigueThreshold = Number(options.fatigueThreshold ?? 7);
  const frustrationThreshold = Number(options.frustrationThreshold ?? 7);
  const currentFatigue = readScale(options.currentFatigue ?? options.fatigue);
  const currentFrustration = readScale(options.currentFrustration ?? options.frustration);
  const latestFatigue = Number.isFinite(currentFatigue) ? currentFatigue : lastFinite(scored.map((item) => item.fatigue));
  const latestFrustration = Number.isFinite(currentFrustration) ? currentFrustration : lastFinite(scored.map((item) => item.frustration));
  const withinSessionDeterioration = detectDeterioration(scored, options);
  const tradeoff = detectSpeedAccuracyTradeoff(scored, targetRange, options);
  const anticipatoryGuard = Number.isFinite(meanAnticipatoryRate)
    && meanAnticipatoryRate > Number(options.maximumAnticipatoryRate ?? 0.1);
  const responseBalanceTask = taskId === "cpt_x" || taskId === "go_nogo";
  const omissionGuard = responseBalanceTask
    && Number.isFinite(meanOmissionRate)
    && meanOmissionRate > Number(options.maximumOmissionRate ?? 0.25);
  const commissionGuard = responseBalanceTask
    && Number.isFinite(meanCommissionRate)
    && meanCommissionRate > Number(options.maximumCommissionRate ?? 0.25);
  const speedAccuracyGuard = tradeoff.detected
    || anticipatoryGuard
    || omissionGuard
    || commissionGuard
    || (Number.isFinite(averageAccuracy) && averageAccuracy < targetRange[0]);
  const burdenHigh = (Number.isFinite(latestFatigue) && latestFatigue >= fatigueThreshold)
    || (Number.isFinite(latestFrustration) && latestFrustration >= frustrationThreshold)
    || withinSessionDeterioration.detected;
  let band = "insufficient_data";
  if (valid.length >= minimumObservations && accuracies.length >= minimumObservations && Number.isFinite(averageAccuracy)) {
    band = averageAccuracy < targetRange[0]
      ? "below_target"
      : averageAccuracy > targetRange[1]
        ? "above_target"
        : "within_target";
  }
  return {
    taskId,
    adaptiveEngineVersion: ADHD_ADAPTIVE_ENGINE_VERSION,
    method: "moving_window",
    windowSize,
    observationsAvailable: valid.length,
    observationsScored: accuracies.length,
    minimumObservations,
    targetRange,
    averageAccuracy: round(averageAccuracy, 4),
    meanRtMs: round(meanRtMs, 1),
    meanAnticipatoryRate: round(meanAnticipatoryRate, 4),
    meanOmissionRate: round(meanOmissionRate, 4),
    meanCommissionRate: round(meanCommissionRate, 4),
    band,
    burden: {
      high: burdenHigh,
      latestFatigue,
      latestFrustration,
      withinSessionDeterioration
    },
    speedAccuracyGuard: {
      active: speedAccuracyGuard,
      anticipatoryGuard,
      omissionGuard,
      commissionGuard,
      tradeoff
    },
    normative: false
  };
}

export function adaptAdhdDifficulty(input = {}, options = {}) {
  const taskId = String(input.taskId || "");
  if (taskId === "stop_signal") return adaptStopSignalDifficulty(input, options);
  const rule = resolveTaskRule(taskId, options);
  const currentDifficulty = normalizeDifficulty(input.currentDifficulty, rule.dimensions);
  const window = evaluateAdaptiveWindow(taskId, input.recentResults, {
    ...options,
    targetRange: input.targetRange ?? options.targetRange,
    windowSize: input.windowSize ?? options.windowSize,
    currentFatigue: input.fatigue ?? options.currentFatigue,
    currentFrustration: input.frustration ?? options.currentFrustration
  });
  let decision = "hold";
  const reasons = [];
  if (window.band === "insufficient_data") {
    reasons.push("Se mantiene: datos válidos insuficientes en la ventana móvil.");
  } else if (window.band === "below_target") {
    decision = "decrease";
    reasons.push(`Se reduce una dimensión: precisión reciente ${formatRate(window.averageAccuracy)} bajo el rango ${formatRange(window.targetRange)}.`);
  } else if (window.band === "above_target") {
    if (window.burden.high) {
      reasons.push("Se mantiene: la fatiga, frustración o deterioro dentro de la sesión impide aumentar dificultad.");
    } else if (window.speedAccuracyGuard.active) {
      reasons.push("Se mantiene: el control velocidad-precisión impide recompensar rapidez asociada a errores o anticipaciones.");
    } else {
      decision = "increase";
      reasons.push(`Se aumenta una dimensión: precisión reciente ${formatRate(window.averageAccuracy)} sobre el rango ${formatRange(window.targetRange)} sin guardas activas.`);
    }
  } else {
    reasons.push(`Se mantiene: desempeño dentro del rango configurable ${formatRange(window.targetRange)}.`);
  }
  const adjustment = decision === "hold"
    ? null
    : chooseSingleDimension(rule.dimensions, currentDifficulty, decision, input.lastAdjustedDimension, input.adjustmentCount);
  if (decision !== "hold" && !adjustment) {
    decision = "hold";
    reasons.push("No existe otra dimensión disponible dentro de sus límites configurados.");
  }
  const nextDifficulty = { ...currentDifficulty };
  if (adjustment) nextDifficulty[adjustment.dimension] = adjustment.after;
  return {
    taskId,
    adaptiveEngineVersion: ADHD_ADAPTIVE_ENGINE_VERSION,
    formula: ADHD_ADAPTIVE_FORMULA,
    decision,
    currentDifficulty,
    nextDifficulty,
    adjustedDimension: adjustment?.dimension || null,
    adjustment,
    changedDimensionCount: adjustment ? 1 : 0,
    window,
    reasons,
    requiresClinicianDecision: false,
    diagnostic: false
  };
}

export function adaptStopSignalDifficulty(input = {}, options = {}) {
  const rule = resolveTaskRule("stop_signal", options);
  const descriptor = rule.dimensions[0];
  const currentDifficulty = normalizeDifficulty(input.currentDifficulty, rule.dimensions);
  const recent = (Array.isArray(input.recentResults) ? input.recentResults : [])
    .filter((item) => item && item.valid !== false && item.status !== "interrupted");
  const latest = recent.at(-1) || input.latestTrial || null;
  const success = latest?.inhibitionSuccessful ?? latest?.inhibitionSuccess;
  const fatigue = readScale(input.fatigue ?? latest?.fatigue ?? latest?.selfReport?.fatigue);
  const frustration = readScale(input.frustration ?? latest?.frustration ?? latest?.selfReport?.frustration);
  const fatigueThreshold = Number(options.fatigueThreshold ?? 7);
  const frustrationThreshold = Number(options.frustrationThreshold ?? 7);
  const currentSsd = Number(currentDifficulty.ssdMs);
  let decision = "hold";
  let nextSsd = currentSsd;
  const reasons = [];
  if (typeof success !== "boolean") {
    reasons.push("Se mantiene SSD: falta un desenlace Stop válido.");
  } else if (success && (
    Number.isFinite(fatigue) && fatigue >= fatigueThreshold
    || Number.isFinite(frustration) && frustration >= frustrationThreshold
  )) {
    reasons.push("Se mantiene SSD: una inhibición exitosa no aumenta dificultad durante fatiga o frustración alta.");
  } else {
    decision = success ? "ssd_increase" : "ssd_decrease";
    const signedStep = success ? descriptor.step : -descriptor.step;
    nextSsd = clamp(currentSsd + signedStep, descriptor.minimum, descriptor.maximum);
    if (nextSsd === currentSsd) decision = "hold";
    reasons.push(success
      ? "Inhibición exitosa: staircase 1-up/1-down aumenta únicamente el SSD."
      : "Fallo de inhibición: staircase 1-up/1-down reduce únicamente el SSD.");
  }
  const adjustment = nextSsd === currentSsd ? null : {
    dimension: "ssdMs",
    before: currentSsd,
    after: nextSsd,
    harderDirection: "increase"
  };
  return {
    taskId: "stop_signal",
    adaptiveEngineVersion: ADHD_ADAPTIVE_ENGINE_VERSION,
    formula: ADHD_ADAPTIVE_FORMULA,
    method: rule.method,
    targetInhibitionProbability: rule.targetInhibitionProbability,
    generalAccuracyTargetApplied: false,
    decision,
    currentDifficulty,
    nextDifficulty: { ...currentDifficulty, ssdMs: nextSsd },
    adjustedDimension: adjustment?.dimension || null,
    adjustment,
    changedDimensionCount: adjustment ? 1 : 0,
    fatigue,
    frustration,
    reasons,
    diagnostic: false
  };
}

export const adaptDifficulty = adaptAdhdDifficulty;

function resolveTaskRule(taskId, options) {
  const base = ADHD_ADAPTIVE_TASK_RULES[taskId];
  if (!base) throw new RangeError(`No existe una regla adaptativa explícita para la tarea: ${taskId || "(vacía)"}.`);
  const override = options.taskRules?.[taskId] || {};
  return {
    ...base,
    ...override,
    targetRange: taskId === "stop_signal" ? null : normalizeTarget(override.targetRange || options.targetRange || base.targetRange),
    dimensions: Array.isArray(override.dimensions) ? override.dimensions : base.dimensions
  };
}

function normalizeDifficulty(value = {}, dimensions) {
  return {
    ...(value && typeof value === "object" ? value : {}),
    ...Object.fromEntries(dimensions.map((descriptor) => {
    const candidate = Number(value?.[descriptor.key]);
    const fallback = midpointFor(descriptor);
    const normalized = clamp(Number.isFinite(candidate) ? candidate : fallback, descriptor.minimum, descriptor.maximum);
      return [descriptor.key, descriptor.integer ? Math.round(normalized) : round(normalized, 4)];
    }))
  };
}

function chooseSingleDimension(dimensions, current, decision, lastAdjustedDimension, adjustmentCount = 0) {
  const startFromLast = dimensions.findIndex((item) => item.key === lastAdjustedDimension);
  const start = startFromLast >= 0 ? startFromLast + 1 : Math.max(0, Number(adjustmentCount) || 0);
  for (let offset = 0; offset < dimensions.length; offset += 1) {
    const descriptor = dimensions[(start + offset) % dimensions.length];
    const before = Number(current[descriptor.key]);
    const towardHarder = decision === "increase";
    const signedStep = descriptor.harderDirection === "increase"
      ? (towardHarder ? descriptor.step : -descriptor.step)
      : (towardHarder ? -descriptor.step : descriptor.step);
    let after = clamp(before + signedStep, descriptor.minimum, descriptor.maximum);
    if (descriptor.integer) after = Math.round(after);
    else after = round(after, 4);
    if (after !== before) {
      return {
        dimension: descriptor.key,
        before,
        after,
        direction: decision,
        harderDirection: descriptor.harderDirection,
        limits: [descriptor.minimum, descriptor.maximum]
      };
    }
  }
  return null;
}

function detectSpeedAccuracyTradeoff(scored, targetRange, options) {
  if (scored.length < 4) return { detected: false, accuracyDelta: null, rtDeltaMs: null };
  const split = Math.floor(scored.length / 2);
  const first = scored.slice(0, split);
  const last = scored.slice(split);
  const firstAccuracy = mean(first.map((item) => item.accuracy).filter(Number.isFinite));
  const lastAccuracy = mean(last.map((item) => item.accuracy).filter(Number.isFinite));
  const firstRt = mean(first.map((item) => item.meanRtMs).filter(Number.isFinite));
  const lastRt = mean(last.map((item) => item.meanRtMs).filter(Number.isFinite));
  const accuracyDelta = Number.isFinite(firstAccuracy) && Number.isFinite(lastAccuracy) ? lastAccuracy - firstAccuracy : null;
  const rtDeltaMs = Number.isFinite(firstRt) && Number.isFinite(lastRt) ? lastRt - firstRt : null;
  const accuracyLossTolerance = Number(options.accuracyLossTolerance ?? 0.05);
  const minimumSpeedGainMs = Number(options.minimumSpeedGainMs ?? 30);
  const detected = Number.isFinite(accuracyDelta) && Number.isFinite(rtDeltaMs)
    && accuracyDelta < -accuracyLossTolerance
    && rtDeltaMs < -minimumSpeedGainMs
    && Number.isFinite(lastAccuracy)
    && lastAccuracy < Math.max(targetRange[0], firstAccuracy);
  return { detected, accuracyDelta: round(accuracyDelta, 4), rtDeltaMs: round(rtDeltaMs, 1) };
}

function detectDeterioration(scored, options) {
  if (scored.length < 4) return { detected: false, accuracyDelta: null, variabilityDelta: null };
  const split = Math.floor(scored.length / 2);
  const first = scored.slice(0, split);
  const last = scored.slice(split);
  const accuracyDelta = differenceOfMeans(last, first, "accuracy");
  const variabilityDelta = differenceOfMeans(last, first, "coefficientOfVariation");
  const detected = (Number.isFinite(accuracyDelta) && accuracyDelta <= -Number(options.deteriorationAccuracyThreshold ?? 0.12))
    || (Number.isFinite(variabilityDelta) && variabilityDelta >= Number(options.deteriorationVariabilityThreshold ?? 0.1));
  return { detected, accuracyDelta: round(accuracyDelta, 4), variabilityDelta: round(variabilityDelta, 4) };
}

function differenceOfMeans(after, before, key) {
  const beforeMean = mean(before.map((item) => item[key]).filter(Number.isFinite));
  const afterMean = mean(after.map((item) => item[key]).filter(Number.isFinite));
  return Number.isFinite(beforeMean) && Number.isFinite(afterMean) ? afterMean - beforeMean : null;
}

function readAccuracy(taskId, observation) {
  const metrics = observation.metrics || observation;
  if (taskId === "cpt_x" || taskId === "go_nogo") {
    return readBalancedAccuracy(taskId, observation);
  }
  const direct = finiteOrNull(metrics.accuracy ?? metrics.proportionCorrect ?? metrics.score);
  if (Number.isFinite(direct)) return clamp(direct > 1 ? direct / 100 : direct, 0, 1);
  const efficiency = finiteOrNull(metrics.efficiency);
  if (taskId === "route_planning" && Number.isFinite(efficiency)) return clamp(efficiency, 0, 1);
  const temporalError = finiteOrNull(metrics.absoluteRelativeError);
  if (taskId === "temporal_estimation" && Number.isFinite(temporalError)) {
    return clamp(1 - temporalError, 0, 1);
  }
  const correct = finiteOrNull(metrics.correct ?? metrics.hits);
  const trials = finiteOrNull(metrics.trials ?? metrics.totalTrials);
  return Number.isFinite(correct) && trials > 0 ? clamp(correct / trials, 0, 1) : null;
}

function readBalancedAccuracy(taskId, observation) {
  const metrics = observation.metrics || observation;
  const explicit = normalizeRateValue(metrics.balancedAccuracy);
  if (Number.isFinite(explicit)) return explicit;

  const omissionRate = readOmissionRate(taskId, observation);
  const commissionRate = readCommissionRate(taskId, observation);
  const responseRate = taskId === "cpt_x"
    ? normalizeRateValue(metrics.hitRate)
    : normalizeRateValue(metrics.goHitRate);
  const inhibitionRate = taskId === "cpt_x"
    ? normalizeRateValue(metrics.correctRejectionRate)
    : normalizeRateValue(metrics.correctInhibitionRate);
  const firstClassAccuracy = Number.isFinite(responseRate)
    ? responseRate
    : Number.isFinite(omissionRate) ? 1 - omissionRate : null;
  const secondClassAccuracy = Number.isFinite(inhibitionRate)
    ? inhibitionRate
    : Number.isFinite(commissionRate) ? 1 - commissionRate : null;
  return Number.isFinite(firstClassAccuracy) && Number.isFinite(secondClassAccuracy)
    ? clamp((firstClassAccuracy + secondClassAccuracy) / 2, 0, 1)
    : null;
}

function readOmissionRate(taskId, observation) {
  if (taskId !== "cpt_x" && taskId !== "go_nogo") return null;
  const metrics = observation.metrics || observation;
  const direct = normalizeRateValue(metrics.omissionRate ?? metrics.missRate);
  if (Number.isFinite(direct)) return direct;
  const omissions = finiteOrNull(metrics.omissions ?? metrics.misses);
  const opportunities = finiteOrNull(taskId === "cpt_x" ? metrics.targets ?? metrics.totalTargets : metrics.goTrials);
  return Number.isFinite(omissions) && opportunities > 0
    ? clamp(omissions / opportunities, 0, 1)
    : null;
}

function readCommissionRate(taskId, observation) {
  if (taskId !== "cpt_x" && taskId !== "go_nogo") return null;
  const metrics = observation.metrics || observation;
  const direct = normalizeRateValue(taskId === "cpt_x"
    ? metrics.falseAlarmRate ?? metrics.commissionRate
    : metrics.commissionRate);
  if (Number.isFinite(direct)) return direct;
  const commissions = finiteOrNull(metrics.commissionErrors ?? metrics.falseAlarms);
  const opportunities = finiteOrNull(taskId === "cpt_x" ? metrics.nonTargets ?? metrics.totalNonTargets : metrics.noGoTrials);
  return Number.isFinite(commissions) && opportunities > 0
    ? clamp(commissions / opportunities, 0, 1)
    : null;
}

function normalizeRateValue(value) {
  const numeric = finiteOrNull(value);
  if (!Number.isFinite(numeric)) return null;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

function readMeanRt(observation) {
  const metrics = observation.metrics || observation;
  const value = metrics.meanRtMs
    ?? metrics.reactionTime?.meanMs
    ?? metrics.goReactionTime?.meanMs
    ?? metrics.responseTime?.meanMs;
  const numeric = finiteOrNull(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readAnticipatoryRate(observation) {
  const metrics = observation.metrics || observation;
  const direct = finiteOrNull(metrics.anticipatoryRate);
  if (Number.isFinite(direct)) return clamp(direct, 0, 1);
  const count = finiteOrNull(metrics.anticipatoryCount ?? metrics.reactionTime?.anticipatoryCount);
  const total = finiteOrNull(metrics.totalTrials ?? metrics.reactionTime?.count);
  return Number.isFinite(count) && total > 0 ? clamp(count / total, 0, 1) : null;
}

function readVariability(observation) {
  const metrics = observation.metrics || observation;
  const numeric = finiteOrNull(metrics.coefficientOfVariation ?? metrics.reactionTime?.coefficientOfVariation);
  return Number.isFinite(numeric) ? numeric : null;
}

function readScale(value) {
  const numeric = finiteOrNull(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 10) : null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function lastFinite(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return values[index];
  }
  return null;
}

function normalizeTarget(value) {
  const candidate = Array.isArray(value) ? value : ADHD_DEFAULT_PROGRAM.adaptiveAccuracyTarget;
  const lower = clamp(Number(candidate[0]), 0.5, 0.95);
  const upper = clamp(Number(candidate[1]), lower, 0.99);
  return [round(lower, 3), round(upper, 3)];
}

function midpointFor(descriptor) {
  return descriptor.integer
    ? Math.round((descriptor.minimum + descriptor.maximum) / 2)
    : round((descriptor.minimum + descriptor.maximum) / 2, 4);
}

function formatRate(value) {
  return Number.isFinite(value) ? `${round(value * 100, 1)} %` : "dato insuficiente";
}

function formatRange(range) {
  return `${round(range[0] * 100, 1)}-${round(range[1] * 100, 1)} %`;
}
