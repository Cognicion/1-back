import {
  coefficientOfVariation,
  finiteNumbers,
  inverseStandardNormal,
  logLinearRate,
  mean,
  median,
  quantile,
  rate,
  round,
  standardDeviation
} from "./statistics.js";
import { ADHD_METRICS_ENGINE_VERSION } from "../config/adhdProtocol.js";

export { ADHD_METRICS_ENGINE_VERSION };

export function calculateDPrime({ hits = 0, misses = 0, falseAlarms = 0, correctRejections = 0 } = {}) {
  const signalTrials = Number(hits) + Number(misses);
  const noiseTrials = Number(falseAlarms) + Number(correctRejections);
  if (!(signalTrials > 0) || !(noiseTrials > 0)) {
    return { dPrime: null, criterion: null, hitRate: null, falseAlarmRate: null, valid: false };
  }
  const hitRate = logLinearRate(hits, signalTrials);
  const falseAlarmRate = logLinearRate(falseAlarms, noiseTrials);
  const zHit = inverseStandardNormal(hitRate);
  const zFalseAlarm = inverseStandardNormal(falseAlarmRate);
  return {
    dPrime: round(zHit - zFalseAlarm, 3),
    criterion: round(-0.5 * (zHit + zFalseAlarm), 3),
    hitRate: round(hitRate, 4),
    falseAlarmRate: round(falseAlarmRate, 4),
    valid: true,
    correction: "loglinear_0.5"
  };
}

export function calculateRtMetrics(values = [], options = {}) {
  const rts = finiteNumbers(values).filter((value) => value >= 0);
  const anticipatoryThresholdMs = Number(options.anticipatoryThresholdMs ?? 120);
  const lapseThresholdMs = Number(options.lapseThresholdMs ?? 1000);
  const centralRts = rts.filter((value) => value >= anticipatoryThresholdMs);
  const average = mean(centralRts);
  const deviation = standardDeviation(centralRts);
  return {
    count: rts.length,
    validCount: centralRts.length,
    meanMs: round(average, 1),
    medianMs: round(median(centralRts), 1),
    sdMs: round(deviation, 1),
    coefficientOfVariation: round(coefficientOfVariation(centralRts), 4),
    minimumMs: centralRts.length ? Math.min(...centralRts) : null,
    maximumMs: centralRts.length ? Math.max(...centralRts) : null,
    anticipatoryCount: rts.filter((value) => value < anticipatoryThresholdMs).length,
    lapseCount: rts.filter((value) => value >= lapseThresholdMs).length,
    p10Ms: round(quantile(centralRts, 0.1), 1),
    p90Ms: round(quantile(centralRts, 0.9), 1)
  };
}

export function calculateBlockVariability(trials = [], options = {}) {
  const blockSize = Math.max(1, Number(options.blockSize) || 20);
  const blocks = [];
  for (let start = 0; start < trials.length; start += blockSize) {
    const block = trials.slice(start, start + blockSize);
    const scored = block.filter((trial) => trial.practice !== true && trial.validForMetrics !== false);
    const correct = scored.filter((trial) => trial.correct === true || trial.isCorrect === true).length;
    const rts = scored.map(readReactionTime).filter(Number.isFinite);
    blocks.push({
      block: blocks.length + 1,
      fromTrial: start + 1,
      toTrial: start + block.length,
      trials: scored.length,
      accuracy: round(rate(correct, scored.length), 4),
      ...calculateRtMetrics(rts, options)
    });
  }
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return {
    blocks,
    accuracyChange: first && last && Number.isFinite(first.accuracy) && Number.isFinite(last.accuracy)
      ? round(last.accuracy - first.accuracy, 4)
      : null,
    meanRtChangeMs: first && last && Number.isFinite(first.meanMs) && Number.isFinite(last.meanMs)
      ? round(last.meanMs - first.meanMs, 1)
      : null,
    variabilityChange: first && last && Number.isFinite(first.coefficientOfVariation) && Number.isFinite(last.coefficientOfVariation)
      ? round(last.coefficientOfVariation - first.coefficientOfVariation, 4)
      : null
  };
}

export function calculateGoNoGoMetrics(trials = [], options = {}) {
  const scored = trials.filter((trial) => trial.practice !== true && trial.validForMetrics !== false);
  const goTrials = scored.filter((trial) => normalizeTrialType(trial) === "go");
  const noGoTrials = scored.filter((trial) => normalizeTrialType(trial) === "nogo");
  const goHits = goTrials.filter(isCorrectGo).length;
  const omissions = goTrials.length - goHits;
  const commissionErrors = noGoTrials.filter((trial) => trial.correct === false || trial.isCorrect === false || trial.resultado === "error_comision").length;
  const correctInhibitions = noGoTrials.length - commissionErrors;
  const goRts = goTrials.filter(isCorrectGo).map(readReactionTime).filter(Number.isFinite);
  const postErrorRts = [];
  const comparisonRts = [];
  scored.forEach((trial, index) => {
    if (normalizeTrialType(trial) !== "go" || !isCorrectGo(trial)) return;
    const previous = scored[index - 1];
    const rt = readReactionTime(trial);
    if (!Number.isFinite(rt)) return;
    if (previous && normalizeTrialType(previous) === "nogo" && (previous.correct === false || previous.isCorrect === false || previous.resultado === "error_comision")) {
      postErrorRts.push(rt);
    } else {
      comparisonRts.push(rt);
    }
  });
  const overallCorrect = goHits + correctInhibitions;
  const goHitRate = rate(goHits, goTrials.length);
  const correctInhibitionRate = rate(correctInhibitions, noGoTrials.length);
  const balancedAccuracy = Number.isFinite(goHitRate) && Number.isFinite(correctInhibitionRate)
    ? mean([goHitRate, correctInhibitionRate])
    : null;
  const postErrorSlowingMs = postErrorRts.length >= 2 && comparisonRts.length >= 2
    ? round(mean(postErrorRts) - mean(comparisonRts), 1)
    : null;

  return {
    taskId: "go_nogo",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    totalTrials: scored.length,
    goTrials: goTrials.length,
    noGoTrials: noGoTrials.length,
    goHits,
    omissions,
    commissionErrors,
    correctInhibitions,
    accuracy: round(rate(overallCorrect, scored.length), 4),
    goHitRate: round(goHitRate, 4),
    correctInhibitionRate: round(correctInhibitionRate, 4),
    balancedAccuracy: round(balancedAccuracy, 4),
    omissionRate: round(rate(omissions, goTrials.length), 4),
    commissionRate: round(rate(commissionErrors, noGoTrials.length), 4),
    reactionTime: calculateRtMetrics(goRts, options),
    postErrorSlowingMs,
    postErrorSampleSize: postErrorRts.length,
    temporal: calculateBlockVariability(scored, { ...options, blockSize: options.blockSize || Math.ceil(scored.length / 4) })
  };
}

export function calculateNBackMetrics(input = {}, options = {}) {
  const trials = Array.isArray(input) ? input : (input.trials || []);
  let hits;
  let misses;
  let falseAlarms;
  let correctRejections;
  if (trials.length) {
    const scored = trials.filter((trial) => trial.practice !== true && trial.validForMetrics !== false && trial.scorable !== false);
    hits = scored.filter((trial) => trial.isTarget === true && trial.responded === true && trial.correct !== false).length;
    misses = scored.filter((trial) => trial.isTarget === true && trial.responded !== true).length;
    falseAlarms = scored.filter((trial) => trial.isTarget === false && trial.responded === true).length;
    correctRejections = scored.filter((trial) => trial.isTarget === false && trial.responded !== true).length;
  } else {
    hits = Number(input.hits) || 0;
    misses = Number(input.misses) || 0;
    falseAlarms = Number(input.falseAlarms) || 0;
    correctRejections = Number(input.correctRejections) || 0;
  }
  const total = hits + misses + falseAlarms + correctRejections;
  const rts = trials.map(readReactionTime).filter(Number.isFinite);
  const sensitivity = calculateDPrime({ hits, misses, falseAlarms, correctRejections });
  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  const stableLevels = blocks
    .filter((block) => Number(block.accuracy) >= Number(options.stableAccuracy ?? 0.75))
    .map((block) => Number(block.level))
    .filter(Number.isFinite);
  return {
    taskId: "nback",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    accuracy: round(rate(hits + correctRejections, total), 4),
    dPrime: sensitivity.dPrime,
    criterion: sensitivity.criterion,
    reactionTime: calculateRtMetrics(rts, options),
    administeredLevel: Number(input.administeredLevel ?? input.level) || null,
    maximumStableLevel: stableLevels.length ? Math.max(...stableLevels) : null,
    temporal: trials.length ? calculateBlockVariability(trials, { ...options, blockSize: options.blockSize || Math.ceil(trials.length / 4) }) : null
  };
}

export function calculateStroopMetrics(trials = [], options = {}) {
  const scored = trials.filter((trial) => trial.practice !== true && trial.validForMetrics !== false);
  const congruent = scored.filter((trial) => trial.isCongruent === true);
  const incongruent = scored.filter((trial) => trial.isCongruent === false);
  const congruentCorrect = congruent.filter(isCorrect).length;
  const incongruentCorrect = incongruent.filter(isCorrect).length;
  const congruentRts = congruent.filter(isCorrect).map(readReactionTime).filter(Number.isFinite);
  const incongruentRts = incongruent.filter(isCorrect).map(readReactionTime).filter(Number.isFinite);
  const congruentMean = mean(congruentRts);
  const incongruentMean = mean(incongruentRts);
  return {
    taskId: "stroop",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    totalTrials: scored.length,
    congruentTrials: congruent.length,
    incongruentTrials: incongruent.length,
    congruentAccuracy: round(rate(congruentCorrect, congruent.length), 4),
    incongruentAccuracy: round(rate(incongruentCorrect, incongruent.length), 4),
    congruentReactionTime: calculateRtMetrics(congruentRts, options),
    incongruentReactionTime: calculateRtMetrics(incongruentRts, options),
    interferenceCostMs: Number.isFinite(congruentMean) && Number.isFinite(incongruentMean)
      ? round(incongruentMean - congruentMean, 1)
      : null,
    interferenceAccuracyCost: congruent.length && incongruent.length
      ? round(rate(congruentCorrect, congruent.length) - rate(incongruentCorrect, incongruent.length), 4)
      : null
  };
}

export function calculateStopSignalMetrics(trials = [], options = {}) {
  const config = {
    minimumStopTrials: Number(options.minimumStopTrials ?? 24),
    maximumGoOmissionRate: Number(options.maximumGoOmissionRate ?? 0.25),
    minimumRespondRate: Number(options.minimumRespondRate ?? 0.25),
    maximumRespondRate: Number(options.maximumRespondRate ?? 0.75),
    anticipatoryThresholdMs: Number(options.anticipatoryThresholdMs ?? 120)
  };
  const scored = trials.filter((trial) => trial.practice !== true && trial.validForMetrics !== false);
  const goTrials = scored.filter((trial) => normalizeTrialType(trial) === "go");
  const stopTrials = scored.filter((trial) => normalizeTrialType(trial) === "stop");
  const correctGoRts = goTrials.filter(isCorrectGo).map(readReactionTime).filter(Number.isFinite);
  const goOmissions = goTrials.filter((trial) => !Number.isFinite(readReactionTime(trial)) || trial.omitted === true).length;
  const failedStops = stopTrials.filter((trial) => trial.inhibitionSuccess === false || Number.isFinite(readReactionTime(trial)));
  const successfulStops = stopTrials.length - failedStops.length;
  const probabilityRespondStop = rate(failedStops.length, stopTrials.length);
  const probabilityInhibit = rate(successfulStops, stopTrials.length);
  const stopSignalDelays = stopTrials.map((trial) => finiteOrNull(trial.stopSignalDelayMs ?? trial.ssdMs)).filter(Number.isFinite);
  const meanSsdMs = mean(stopSignalDelays);
  const warnings = [];

  if (stopTrials.length < config.minimumStopTrials) warnings.push("insufficient_stop_trials");
  const goOmissionRate = rate(goOmissions, goTrials.length);
  if (goOmissionRate === null || goOmissionRate > config.maximumGoOmissionRate) warnings.push("excessive_go_omissions");
  if (probabilityRespondStop === null || probabilityRespondStop <= config.minimumRespondRate || probabilityRespondStop >= config.maximumRespondRate) {
    warnings.push("inhibition_probability_out_of_range");
  }
  if (correctGoRts.length < Math.max(10, Math.floor(goTrials.length * 0.5))) warnings.push("insufficient_valid_go_rts");

  const integrationDistribution = [...correctGoRts];
  if (correctGoRts.length && goOmissions) {
    const replacement = Math.max(...correctGoRts);
    integrationDistribution.push(...Array.from({ length: goOmissions }, () => replacement));
  }
  const goQuantileMs = probabilityRespondStop !== null
    ? quantile(integrationDistribution, probabilityRespondStop)
    : null;
  const ssrtMs = Number.isFinite(goQuantileMs) && Number.isFinite(meanSsdMs)
    ? goQuantileMs - meanSsdMs
    : null;
  if (!Number.isFinite(ssrtMs) || ssrtMs <= 0) warnings.push("non_positive_or_missing_ssrt");

  const failedStopRts = failedStops.map(readReactionTime).filter(Number.isFinite);
  const meanFailedStopRt = mean(failedStopRts);
  const meanGoRt = mean(correctGoRts);
  const raceModelConsistent = Number.isFinite(meanFailedStopRt) && Number.isFinite(meanGoRt)
    ? meanFailedStopRt < meanGoRt
    : null;
  if (raceModelConsistent === false) warnings.push("race_model_assumption_not_met");

  const valid = warnings.every((warning) => ![
    "insufficient_stop_trials",
    "excessive_go_omissions",
    "inhibition_probability_out_of_range",
    "insufficient_valid_go_rts",
    "non_positive_or_missing_ssrt"
  ].includes(warning));

  return {
    taskId: "stop_signal",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    method: "integration_with_go_omission_replacement",
    totalTrials: scored.length,
    goTrials: goTrials.length,
    stopTrials: stopTrials.length,
    goOmissions,
    goOmissionRate: round(goOmissionRate, 4),
    successfulInhibitions: successfulStops,
    failedInhibitions: failedStops.length,
    probabilityInhibit: round(probabilityInhibit, 4),
    probabilityRespondStop: round(probabilityRespondStop, 4),
    meanSsdMs: round(meanSsdMs, 1),
    goQuantileMs: round(goQuantileMs, 1),
    ssrtMs: valid ? round(ssrtMs, 1) : null,
    goReactionTime: calculateRtMetrics(correctGoRts, { ...options, anticipatoryThresholdMs: config.anticipatoryThresholdMs }),
    failedStopReactionTime: calculateRtMetrics(failedStopRts, options),
    raceModelConsistent,
    valid,
    warnings
  };
}

export function updateStopSignalDelay(currentSsdMs, inhibitionSuccessful, options = {}) {
  const stepMs = Math.max(1, finiteOrNull(options.stepMs) ?? 50);
  const minimumMs = Math.max(0, finiteOrNull(options.minimumMs) ?? 50);
  const maximumMs = Math.max(minimumMs, finiteOrNull(options.maximumMs) ?? 900);
  const current = finiteOrNull(currentSsdMs) ?? finiteOrNull(options.initialMs) ?? 250;
  return Math.min(maximumMs, Math.max(minimumMs, current + (inhibitionSuccessful ? stepMs : -stepMs)));
}

export function calculateTaskSwitchingMetrics(trials = [], options = {}) {
  const mixed = trials.filter((trial) => trial.practice !== true && trial.blockType === "mixed" && trial.validForMetrics !== false);
  const mixedCorrect = mixed.filter(isCorrect);
  const repeats = mixed.filter((trial) => trial.transition === "repeat");
  const switches = mixed.filter((trial) => trial.transition === "switch");
  const repeatCorrect = repeats.filter(isCorrect);
  const switchCorrect = switches.filter(isCorrect);
  const repeatRts = repeatCorrect.map(readReactionTime).filter(Number.isFinite);
  const switchRts = switchCorrect.map(readReactionTime).filter(Number.isFinite);
  const repeatMean = mean(repeatRts);
  const switchMean = mean(switchRts);
  return {
    taskId: "task_switching",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    mixedTrials: mixed.length,
    repeatTrials: repeats.length,
    switchTrials: switches.length,
    accuracy: round(rate(mixedCorrect.length, mixed.length), 4),
    repeatAccuracy: round(rate(repeatCorrect.length, repeats.length), 4),
    switchAccuracy: round(rate(switchCorrect.length, switches.length), 4),
    repeatReactionTime: calculateRtMetrics(repeatRts, options),
    switchReactionTime: calculateRtMetrics(switchRts, options),
    switchCostMs: Number.isFinite(repeatMean) && Number.isFinite(switchMean) ? round(switchMean - repeatMean, 1) : null,
    switchAccuracyCost: repeats.length && switches.length
      ? round(rate(repeatCorrect.length, repeats.length) - rate(switchCorrect.length, switches.length), 4)
      : null
  };
}

export function calculateTemporalMetrics(trials = []) {
  const scored = trials.filter((trial) => trial.practice !== true && trial.validForMetrics !== false)
    .map((trial) => ({
      ...trial,
      targetMs: finiteOrNull(trial.targetMs),
      responseMs: finiteOrNull(trial.responseMs)
    }))
    .filter((trial) => trial.targetMs > 0 && trial.responseMs !== null && trial.responseMs >= 0);
  const signedErrors = scored.map((trial) => trial.responseMs - trial.targetMs);
  const absoluteErrors = signedErrors.map(Math.abs);
  const relativeErrors = scored.map((trial) => (trial.responseMs - trial.targetMs) / trial.targetMs);
  const absoluteRelativeErrors = relativeErrors.map(Math.abs);
  return {
    taskId: "temporal_estimation",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    trials: scored.length,
    meanTargetMs: round(mean(scored.map((trial) => trial.targetMs)), 1),
    meanResponseMs: round(mean(scored.map((trial) => trial.responseMs)), 1),
    biasMs: round(mean(signedErrors), 1),
    absoluteErrorMs: round(mean(absoluteErrors), 1),
    relativeError: round(mean(relativeErrors), 4),
    absoluteRelativeError: round(mean(absoluteRelativeErrors), 4),
    variabilityMs: round(standardDeviation(signedErrors), 1),
    coefficientOfVariation: round(coefficientOfVariation(scored.map((trial) => trial.responseMs)), 4),
    byMode: groupTemporalByMode(scored)
  };
}

export function calculatePlanningMetrics(puzzles = []) {
  const scored = puzzles.filter((puzzle) => puzzle.practice !== true && puzzle.validForMetrics !== false);
  const completedPuzzles = scored.filter((puzzle) => puzzle.completed === true);
  const moveValues = scored.map((puzzle) => finiteOrNull(puzzle.moves)).filter((value) => value !== null && value >= 0);
  const optimalMoveValues = scored.map((puzzle) => finiteOrNull(puzzle.optimalMoves)).filter((value) => value !== null && value >= 0);
  const pairedCompleted = completedPuzzles.filter((puzzle) => (
    finiteOrNull(puzzle.moves) !== null && finiteOrNull(puzzle.moves) >= 0
    && finiteOrNull(puzzle.optimalMoves) !== null && finiteOrNull(puzzle.optimalMoves) >= 0
  ));
  const totalMoves = moveValues.length ? moveValues.reduce((total, value) => total + value, 0) : null;
  const optimalMoves = optimalMoveValues.length ? optimalMoveValues.reduce((total, value) => total + value, 0) : null;
  const excessMoves = totalMoves !== null && optimalMoves !== null ? Math.max(0, totalMoves - optimalMoves) : null;
  const completedMoves = pairedCompleted.reduce((total, puzzle) => total + finiteOrNull(puzzle.moves), 0);
  const completedOptimalMoves = pairedCompleted.reduce((total, puzzle) => total + finiteOrNull(puzzle.optimalMoves), 0);
  const completed = completedPuzzles.length;
  const violationValues = scored.map((puzzle) => finiteOrNull(puzzle.ruleViolations)).filter((value) => value !== null && value >= 0);
  const ruleViolations = violationValues.length ? violationValues.reduce((total, value) => total + value, 0) : null;
  const resetValues = scored.map((puzzle) => finiteOrNull(puzzle.resets)).filter((value) => value !== null && value >= 0);
  const resets = resetValues.length ? resetValues.reduce((total, value) => total + value, 0) : null;
  const planningTimes = scored.map((puzzle) => finiteOrNull(puzzle.planningTimeMs)).filter(Number.isFinite);
  const executionTimes = scored.map((puzzle) => finiteOrNull(puzzle.executionTimeMs)).filter(Number.isFinite);
  const totalTimes = scored.map((puzzle) => finiteOrNull(puzzle.totalTimeMs)).filter((value) => value !== null && value >= 0);
  return {
    taskId: "route_planning",
    metricsVersion: ADHD_METRICS_ENGINE_VERSION,
    puzzles: scored.length,
    completed,
    completionRate: round(rate(completed, scored.length), 4),
    totalMoves,
    optimalMoves,
    excessMoves,
    ruleViolations,
    resets,
    errors: ruleViolations === null && resets === null ? null : (ruleViolations || 0) + (resets || 0),
    meanPlanningTimeMs: round(mean(planningTimes), 1),
    meanExecutionTimeMs: round(mean(executionTimes), 1),
    totalTimeMs: totalTimes.length ? round(totalTimes.reduce((total, value) => total + value, 0), 1) : null,
    efficiency: pairedCompleted.length && completedMoves > 0
      ? round(Math.min(1, Math.max(0, completedOptimalMoves / completedMoves)), 4)
      : null
  };
}

function groupTemporalByMode(trials) {
  const modes = [...new Set(trials.map((trial) => trial.mode || "reproduction"))];
  return modes.map((mode) => {
    const subset = trials.filter((trial) => (trial.mode || "reproduction") === mode);
    const errors = subset.map((trial) => trial.responseMs - trial.targetMs);
    return {
      mode,
      trials: subset.length,
      biasMs: round(mean(errors), 1),
      absoluteErrorMs: round(mean(errors.map(Math.abs)), 1),
      variabilityMs: round(standardDeviation(errors), 1)
    };
  });
}

function normalizeTrialType(trial = {}) {
  const value = String(trial.trialType ?? trial.type ?? trial.tipo ?? "").toLowerCase().replace(/[_\s-]/g, "");
  if (value === "nogo") return "nogo";
  if (value === "stop" || value === "stopsignal") return "stop";
  return value === "go" ? "go" : value;
}

function readReactionTime(trial = {}) {
  const value = trial.reactionTimeMs ?? trial.reactionTime ?? trial.rtMs ?? trial.rt;
  return finiteOrNull(value);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isCorrect(trial = {}) {
  return trial.correct === true || trial.isCorrect === true || trial.correcta === true;
}

function isCorrectGo(trial = {}) {
  if (trial.resultado === "acierto_go") return true;
  return isCorrect(trial) && Number.isFinite(readReactionTime(trial));
}
