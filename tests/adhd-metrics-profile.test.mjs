import assert from "node:assert/strict";
import {
  calculateDPrime,
  calculateGoNoGoMetrics,
  calculateNBackMetrics,
  calculatePlanningMetrics,
  calculateRtMetrics,
  calculateStopSignalMetrics,
  calculateStroopMetrics,
  calculateTaskSwitchingMetrics,
  calculateTemporalMetrics,
  updateStopSignalDelay
} from "../js/adhd/core/adhdMetricsEngine.js";
import { buildAdhdProfile, compareAssessmentContexts } from "../js/adhd/core/adhdProfileEngine.js";
import { finiteNumbers } from "../js/adhd/core/statistics.js";

assert.deepEqual(finiteNumbers([null, undefined, "", false, 0, "2", Number.NaN]), [0, 2]);
const missingRt = calculateRtMetrics([null, undefined, "", false, 500]);
assert.equal(missingRt.count, 1);
assert.equal(missingRt.meanMs, 500);

const sensitivity = calculateDPrime({ hits: 40, misses: 10, falseAlarms: 5, correctRejections: 45 });
assert.equal(sensitivity.valid, true);
assert.ok(sensitivity.dPrime > 1);
assert.equal(sensitivity.correction, "loglinear_0.5");
assert.equal(calculateDPrime({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }).valid, false);

const rt = calculateRtMetrics([80, 400, 500, 600, 1100]);
assert.equal(rt.count, 5);
assert.equal(rt.validCount, 4);
assert.equal(rt.anticipatoryCount, 1);
assert.equal(rt.lapseCount, 1);
assert.ok(rt.coefficientOfVariation > 0);

const goTrials = [
  { tipo: "go", correcta: true, rt: 400 },
  { tipo: "nogo", correcta: false, resultado: "error_comision", rt: 280 },
  { tipo: "go", correcta: true, rt: 520 },
  { tipo: "nogo", correcta: true, resultado: "inhibicion", rt: null },
  { tipo: "go", correcta: false, resultado: "omision", rt: null },
  { tipo: "nogo", correcta: false, resultado: "error_comision", rt: 260 },
  { tipo: "go", correcta: true, rt: 560 },
  { tipo: "go", correcta: true, rt: 410 }
];
const goMetrics = calculateGoNoGoMetrics(goTrials);
assert.equal(goMetrics.commissionErrors, 2);
assert.equal(goMetrics.omissions, 1);
assert.equal(goMetrics.postErrorSampleSize, 2);
assert.equal(goMetrics.goHitRate, 0.8);
assert.equal(goMetrics.correctInhibitionRate, 0.3333);
assert.equal(goMetrics.balancedAccuracy, 0.5667);
assert.ok(goMetrics.reactionTime.coefficientOfVariation > 0);

const nbackMetrics = calculateNBackMetrics({ hits: 12, misses: 3, falseAlarms: 2, correctRejections: 13, level: 2 });
assert.equal(nbackMetrics.accuracy, 0.8333);
assert.ok(nbackMetrics.dPrime > 1);
assert.equal(nbackMetrics.administeredLevel, 2);
assert.equal(nbackMetrics.maximumStableLevel, null);

const stroopTrials = Array.from({ length: 12 }, (_, index) => ({
  isCongruent: index < 6,
  isCorrect: index !== 11,
  reactionTime: index < 6 ? 500 + index : 700 + index
}));
const stroopMetrics = calculateStroopMetrics(stroopTrials);
assert.ok(stroopMetrics.interferenceCostMs > 190);
assert.equal(stroopMetrics.congruentAccuracy, 1);
assert.ok(stroopMetrics.incongruentAccuracy < 1);

const stopTrials = [];
for (let index = 0; index < 72; index += 1) {
  stopTrials.push({ trialType: "go", correct: true, reactionTimeMs: 440 + (index % 20) * 5 });
}
for (let index = 0; index < 24; index += 1) {
  const failed = index % 2 === 0;
  stopTrials.push({
    trialType: "stop",
    inhibitionSuccess: !failed,
    stopSignalDelayMs: 250,
    reactionTimeMs: failed ? 350 + index : null
  });
}
const stopMetrics = calculateStopSignalMetrics(stopTrials);
assert.equal(stopMetrics.valid, true);
assert.equal(stopMetrics.probabilityInhibit, 0.5);
assert.ok(stopMetrics.ssrtMs > 150 && stopMetrics.ssrtMs < 350);
assert.equal(stopMetrics.method, "integration_with_go_omission_replacement");
assert.equal(updateStopSignalDelay(250, true), 300);
assert.equal(updateStopSignalDelay(250, false), 200);

const invalidStop = calculateStopSignalMetrics([
  ...Array.from({ length: 20 }, () => ({ trialType: "go", omitted: true })),
  ...Array.from({ length: 24 }, (_, index) => ({ trialType: "stop", inhibitionSuccess: index % 2 === 0, stopSignalDelayMs: 250 }))
]);
assert.equal(invalidStop.valid, false);
assert.equal(invalidStop.ssrtMs, null);
assert.ok(invalidStop.warnings.includes("excessive_go_omissions"));

const switchTrials = [
  ...Array.from({ length: 8 }, (_, index) => ({ blockType: "mixed", transition: "repeat", correct: true, reactionTimeMs: 500 + index })),
  ...Array.from({ length: 8 }, (_, index) => ({ blockType: "mixed", transition: "switch", correct: index !== 7, reactionTimeMs: 650 + index }))
];
const switchMetrics = calculateTaskSwitchingMetrics(switchTrials);
assert.ok(switchMetrics.switchCostMs > 140);
assert.equal(switchMetrics.repeatAccuracy, 1);
assert.equal(switchMetrics.switchAccuracy, 0.875);
assert.equal(switchMetrics.accuracy, 0.9375);

const temporalMetrics = calculateTemporalMetrics([
  { targetMs: 1000, responseMs: 1100 },
  { targetMs: 1000, responseMs: 900 },
  { targetMs: 2000, responseMs: 2200 },
  { targetMs: 2000, responseMs: 1800 }
]);
assert.equal(temporalMetrics.biasMs, 0);
assert.equal(temporalMetrics.absoluteErrorMs, 150);
assert.equal(temporalMetrics.absoluteRelativeError, 0.1);
assert.ok(temporalMetrics.variabilityMs > 0);
const temporalMissing = calculateTemporalMetrics([{ targetMs: 1000, responseMs: null }]);
assert.equal(temporalMissing.trials, 0);
assert.equal(temporalMissing.meanResponseMs, null);

const planningMetrics = calculatePlanningMetrics([
  { completed: true, moves: 7, optimalMoves: 5, planningTimeMs: 1500, executionTimeMs: 5000, totalTimeMs: 6500, ruleViolations: 1, resets: 2 },
  { completed: true, moves: 4, optimalMoves: 4, planningTimeMs: 1100, executionTimeMs: 3500, totalTimeMs: 4600, ruleViolations: 0, resets: 0 }
]);
assert.equal(planningMetrics.excessMoves, 2);
assert.equal(planningMetrics.completed, 2);
assert.equal(planningMetrics.efficiency, 0.8182);
assert.equal(planningMetrics.resets, 2);
assert.equal(planningMetrics.errors, 3);

const planningWithIncomplete = calculatePlanningMetrics([
  { completed: true, moves: 10, optimalMoves: 5 },
  { completed: false, moves: 1, optimalMoves: 100 }
]);
assert.equal(planningWithIncomplete.efficiency, 0.5);
assert.ok(planningWithIncomplete.efficiency <= 1);
assert.equal(calculatePlanningMetrics([{ completed: true, moves: 2, optimalMoves: 5 }]).efficiency, 1);
assert.equal(calculatePlanningMetrics([{ completed: false, moves: 1, optimalMoves: 100 }]).efficiency, null);
const planningMissing = calculatePlanningMetrics([{ completed: false, moves: null, optimalMoves: null, totalTimeMs: null }]);
assert.equal(planningMissing.totalMoves, null);
assert.equal(planningMissing.optimalMoves, null);
assert.equal(planningMissing.ruleViolations, null);
assert.equal(planningMissing.totalTimeMs, null);

const taskResults = {
  cpt_x: { taskId: "cpt_x", status: "completed", metrics: { misses: 3, missRate: 0.15, dPrime: 1.4, temporal: { accuracyChange: -0.08 }, reactionTime: { coefficientOfVariation: 0.28 } } },
  go_nogo: { taskId: "go_nogo", status: "completed", metrics: goMetrics },
  nback: { taskId: "nback", status: "completed", metrics: nbackMetrics },
  stroop: { taskId: "stroop", status: "completed", metrics: stroopMetrics },
  stop_signal: { taskId: "stop_signal", status: "completed", metrics: stopMetrics },
  task_switching: { taskId: "task_switching", status: "completed", metrics: switchMetrics },
  temporal_estimation: { taskId: "temporal_estimation", status: "completed", metrics: temporalMetrics },
  route_planning: { taskId: "route_planning", status: "completed", metrics: planningMetrics }
};
const profile = buildAdhdProfile({
  assessmentId: "assessment-1",
  taskResults,
  functionalDifficulties: ["impulsivity", "timeManagement"],
  functionalGoals: [{ id: "goal-1", action: "Responder después de revisar", difficultyId: "impulsivity" }]
});
assert.equal(profile.normative, false);
assert.equal(profile.quality.complete, true);
assert.equal(profile.quality.fullyInterpretable, true);
assert.equal(profile.domains.length, 10);
assert.equal(profile.domains.find((domain) => domain.id === "inhibitoryControl").linkedGoals.length > 0, true);
assert.match(profile.selectionFormula.interpretation, /no cuantifica gravedad/i);
assert.ok(profile.domains.every((domain) => domain.caveats.some((item) => /normas poblacionales/i.test(item))));

const invalidOnlyProfile = buildAdhdProfile({
  taskResults: {
    cpt_x: {
      status: "completed",
      valid: false,
      metrics: { misses: 99, missRate: 1, dPrime: -9, reactionTime: { coefficientOfVariation: 1 } }
    },
    go_nogo: {
      status: "completed",
      quality: { valid: false },
      metrics: { omissionRate: 1, commissionRate: 1, reactionTime: { coefficientOfVariation: 1 } }
    },
    nback: {
      status: "completed",
      metrics: { valid: false, accuracy: 0, reactionTime: { coefficientOfVariation: 1 } }
    },
    route_planning: {
      status: "interrupted",
      metrics: { efficiency: 0, completed: 0, puzzles: 10 }
    }
  }
});
for (const domainId of ["sustainedAttention", "inhibitoryControl", "workingMemory", "responseVariability", "planning"]) {
  const domain = invalidOnlyProfile.domains.find((item) => item.id === domainId);
  assert.deepEqual(domain.measures, []);
  assert.equal(domain.observedDifficultySignal, null);
  assert.equal(domain.selectionSignal, 0);
}
assert.deepEqual(invalidOnlyProfile.quality.invalidTasks.sort(), ["cpt_x", "go_nogo", "nback"]);

const missingOnlyProfile = buildAdhdProfile({
  taskResults: {
    cpt_x: {
      taskId: "cpt_x",
      status: "completed",
      valid: true,
      metrics: { missRate: null, dPrime: null, reactionTime: { coefficientOfVariation: null } }
    }
  }
});
const missingAttention = missingOnlyProfile.domains.find((item) => item.id === "sustainedAttention");
assert.deepEqual(missingAttention.measures, []);
assert.equal(missingAttention.observedDifficultySignal, null);
assert.equal(missingAttention.selectionSignal, 0);

const contextComparison = compareAssessmentContexts(
  { sleepHours: 4, deviceClass: "phone", adhdMedication: "registrada" },
  { sleepHours: 8, deviceClass: "desktop", adhdMedication: "registrada" }
);
assert.equal(contextComparison.materiallyDifferent, true);
assert.ok(contextComparison.summary.some((line) => /Horas de sueño/.test(line)));
assert.ok(contextComparison.summary.some((line) => /Tipo de dispositivo/.test(line)));

console.log("ADHD metrics and profile tests passed");
