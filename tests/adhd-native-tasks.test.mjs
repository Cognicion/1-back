import test from "node:test";
import assert from "node:assert/strict";

import {
  ADHD_NATIVE_TASK_VERSIONS,
  advanceStopSignalStaircase,
  createNativeAdhdTaskDefinition,
  generateRoutePlanningTask,
  generateStopSignalTask,
  generateTaskSwitchingTask,
  generateTemporalEstimationTask,
  solveRoutePlanningBfs,
  transitionRoutePlanningState
} from "../js/adhd/tasks/adhdNativeTaskCores.js";
import { runNativeAdhdTask } from "../js/adhd/tasks/adhdNativeTaskRunner.js";
import {
  calculatePlanningMetrics,
  calculateStopSignalMetrics,
  calculateTaskSwitchingMetrics,
  calculateTemporalMetrics
} from "../js/adhd/core/adhdMetricsEngine.js";

function maximumRun(values, expected) {
  let current = 0;
  let maximum = 0;
  for (const value of values) {
    current = value === expected ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

test("las formas nativas son deterministas, versionadas y despachables", () => {
  const generators = {
    stop_signal: generateStopSignalTask,
    task_switching: generateTaskSwitchingTask,
    temporal_estimation: generateTemporalEstimationTask,
    route_planning: generateRoutePlanningTask
  };

  for (const [taskId, generator] of Object.entries(generators)) {
    const first = generator({ seed: "qc-form-a", ageMode: "adult" });
    const second = generator({ seed: "qc-form-a", ageMode: "adult" });
    const alternative = generator({ seed: "qc-form-b", ageMode: "adult" });
    assert.deepEqual(second, first, `${taskId} debe repetirse con la misma semilla`);
    assert.equal(first.taskVersion, ADHD_NATIVE_TASK_VERSIONS[taskId]);
    assert.deepEqual(createNativeAdhdTaskDefinition(taskId, { seed: "qc-form-a" }), first);
    assert.notDeepEqual(alternative, first, `${taskId} debe producir una forma alternativa por semilla`);
  }
  assert.throws(() => createNativeAdhdTaskDefinition("no_existe"), RangeError);
  assert.equal(typeof runNativeAdhdTask, "function");
});

test("Stop-Signal separa práctica, conserva 25% stop y expone staircase acotado", () => {
  const definition = generateStopSignalTask({ seed: 20260901 });
  const stopTrials = definition.trials.filter((trial) => trial.trialType === "stop");
  assert.equal(definition.trials.length, 96);
  assert.equal(stopTrials.length, 24);
  assert.equal(stopTrials.length / definition.trials.length, 0.25);
  assert.equal(definition.practiceTrials.length, 12);
  assert.ok(definition.practiceTrials.every((trial) => trial.practice === true));
  assert.ok(definition.trials.every((trial) => trial.practice === false));
  assert.equal(definition.trials[0].trialType, "go");
  assert.ok(maximumRun(definition.trials.map((trial) => trial.trialType), "stop") <= 2);
  assert.ok(definition.trials.every((trial) => trial.goExpectedResponse === (trial.direction === "left" ? "ArrowLeft" : "ArrowRight")));

  const options = { stepMs: 50, minimumMs: 100, maximumMs: 400, initialMs: 250 };
  assert.equal(advanceStopSignalStaircase(250, true, options), 300);
  assert.equal(advanceStopSignalStaircase(250, false, options), 200);
  assert.equal(advanceStopSignalStaircase(400, true, options), 400);
  assert.equal(advanceStopSignalStaircase(100, false, options), 100);

  const shortWindow = generateStopSignalTask({
    seed: "short-window",
    config: { responseWindowMs: 500, maximumStopSignalDelayMs: 2000, initialStopSignalDelayMs: 900 }
  });
  assert.ok(shortWindow.config.maximumStopSignalDelayMs < shortWindow.config.responseWindowMs);
  assert.ok(shortWindow.config.initialStopSignalDelayMs <= shortWindow.config.maximumStopSignalDelayMs);
});

test("Task Switching contiene bloques single/mixed y transiciones repeat/switch válidas", () => {
  const definition = generateTaskSwitchingTask({ seed: 20260901 });
  const single = definition.trials.filter((trial) => trial.blockType === "single");
  const mixed = definition.trials.filter((trial) => trial.blockType === "mixed");
  assert.equal(single.length, 32);
  assert.equal(mixed.length, 64);
  assert.deepEqual(new Set(single.map((trial) => trial.rule)), new Set(["parity", "magnitude"]));
  assert.ok(mixed.some((trial) => trial.transition === "repeat"));
  assert.ok(mixed.some((trial) => trial.transition === "switch"));
  assert.ok(definition.practiceTrials.every((trial) => trial.practice));

  for (const trial of definition.trials) {
    const expected = trial.rule === "parity"
      ? (trial.stimulus % 2 === 0 ? "ArrowRight" : "ArrowLeft")
      : (trial.stimulus > 5 ? "ArrowRight" : "ArrowLeft");
    assert.equal(trial.expectedResponse, expected);
  }
  for (let index = 1; index < mixed.length; index += 1) {
    const derived = mixed[index].rule === mixed[index - 1].rule ? "repeat" : "switch";
    assert.equal(mixed[index].transition, derived);
  }
});

test("Temporal incluye estimación y reproducción con alternativas deterministas", () => {
  const definition = generateTemporalEstimationTask({ seed: "temporal-qc" });
  assert.equal(definition.trials.length, 20);
  assert.deepEqual(new Set(definition.trials.map((trial) => trial.mode)), new Set(["estimation", "reproduction"]));
  assert.ok(definition.practiceTrials.every((trial) => trial.practice));
  for (const trial of definition.trials) {
    assert.ok(trial.targetMs > 0);
    if (trial.mode === "estimation") {
      assert.equal(trial.choicesMs.length, 3);
      assert.ok(trial.choicesMs.includes(trial.targetMs));
      assert.equal(new Set(trial.choicesMs).size, 3);
    } else {
      assert.deepEqual(trial.choicesMs, []);
    }
  }
});

test("BFS resuelve el estado compuesto y las formas generadas conservan su óptimo", () => {
  const puzzle = {
    rows: 3,
    cols: 3,
    start: { row: 0, col: 0 },
    goal: { row: 0, col: 2 },
    checkpoints: [{ row: 2, col: 0, id: "checkpoint-1" }],
    blocked: [{ row: 1, col: 1 }]
  };
  const solution = solveRoutePlanningBfs(puzzle);
  assert.equal(solution.reachable, true);
  assert.equal(solution.optimalMoves, 6);
  assert.equal(solution.states.at(-1).nextCheckpointIndex, 1);
  assert.deepEqual(solution.states.at(-1).position, puzzle.goal);
  assert.equal(transitionRoutePlanningState(puzzle, { position: puzzle.start, nextCheckpointIndex: 0 }, "left"), null);

  const generated = generateRoutePlanningTask({ seed: "route-qc-a" });
  const alternative = generateRoutePlanningTask({ seed: "route-qc-b" });
  assert.notDeepEqual(generated.puzzles.map((item) => item.formId), alternative.puzzles.map((item) => item.formId));
  for (const generatedPuzzle of [...generated.practicePuzzles, ...generated.puzzles]) {
    const generatedSolution = solveRoutePlanningBfs(generatedPuzzle);
    assert.equal(generatedSolution.reachable, true);
    assert.equal(generatedSolution.optimalMoves, generatedPuzzle.optimalMoves);
    assert.deepEqual(generatedSolution.path, generatedPuzzle.optimalPath);
  }
});

test("dataset Stop-Signal válido produce SSRT y QC excluye omisiones excesivas", () => {
  const definition = generateStopSignalTask({ seed: "stop-metrics-qc" });
  let failedStops = 0;
  const validDataset = definition.trials.map((trial, index) => {
    if (trial.trialType === "go") {
      return { ...trial, correct: true, reactionTimeMs: 480 + (index % 9) * 8, omitted: false, validForMetrics: true };
    }
    const failed = failedStops < 12;
    failedStops += 1;
    return {
      ...trial,
      stopSignalDelayMs: 250,
      inhibitionSuccess: !failed,
      reactionTimeMs: failed ? 340 + (index % 5) * 5 : null,
      correct: !failed,
      validForMetrics: true
    };
  });
  const valid = calculateStopSignalMetrics(validDataset);
  assert.equal(valid.stopTrials, 24);
  assert.equal(valid.probabilityRespondStop, 0.5);
  assert.equal(valid.valid, true);
  assert.ok(valid.ssrtMs > 0);

  let omitted = 0;
  const invalidDataset = validDataset.map((trial) => {
    if (trial.trialType !== "go" || omitted >= 24) return trial;
    omitted += 1;
    return { ...trial, correct: false, reactionTimeMs: null, omitted: true };
  });
  const invalid = calculateStopSignalMetrics(invalidDataset);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.ssrtMs, null);
  assert.ok(invalid.warnings.includes("excessive_go_omissions"));
});

test("datasets deterministas alimentan exclusivamente los motores métricos existentes", () => {
  const switching = generateTaskSwitchingTask({ seed: "switch-metrics-qc" });
  const switchingDataset = switching.trials.map((trial) => ({
    ...trial,
    correct: true,
    reactionTimeMs: trial.transition === "switch" ? 650 : 500,
    validForMetrics: true
  }));
  const switchingMetrics = calculateTaskSwitchingMetrics(switchingDataset);
  assert.equal(switchingMetrics.mixedTrials, 64);
  assert.equal(switchingMetrics.repeatAccuracy, 1);
  assert.equal(switchingMetrics.switchAccuracy, 1);
  assert.equal(switchingMetrics.switchCostMs, 150);

  const temporal = generateTemporalEstimationTask({ seed: "temporal-metrics-qc" });
  const temporalDataset = temporal.trials.map((trial) => ({ ...trial, responseMs: trial.targetMs + 100, validForMetrics: true }));
  const temporalMetrics = calculateTemporalMetrics(temporalDataset);
  assert.equal(temporalMetrics.trials, 20);
  assert.equal(temporalMetrics.biasMs, 100);
  assert.deepEqual(new Set(temporalMetrics.byMode.map((group) => group.mode)), new Set(["estimation", "reproduction"]));

  const planning = generateRoutePlanningTask({ seed: "planning-metrics-qc" });
  const planningDataset = planning.puzzles.map((puzzle, index) => ({
    ...puzzle,
    moves: puzzle.optimalMoves + index + 1,
    completed: true,
    ruleViolations: index,
    resets: index % 2,
    planningTimeMs: 1000 + index * 100,
    executionTimeMs: 3000 + index * 200,
    totalTimeMs: 4000 + index * 300,
    validForMetrics: true
  }));
  const planningMetrics = calculatePlanningMetrics(planningDataset);
  assert.equal(planningMetrics.puzzles, 4);
  assert.equal(planningMetrics.completed, 4);
  assert.equal(planningMetrics.completionRate, 1);
  assert.equal(planningMetrics.excessMoves, 10);
  assert.equal(planningMetrics.resets, 2);
  assert.equal(planningMetrics.errors, planningMetrics.ruleViolations + planningMetrics.resets);
  assert.ok(planningMetrics.efficiency > 0 && planningMetrics.efficiency < 1);
});

test("runner expone resultado serializable y destrucción segura antes de iniciar", async () => {
  class FakeEventTarget {
    constructor(ownerDocument = null) {
      this.ownerDocument = ownerDocument;
      this.dataset = {};
      this.parentNode = null;
      this._listeners = new Map();
      this._view = null;
      this._mode = null;
      this.innerHTML = "";
    }

    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
      this._listeners.get(type)?.delete(listener);
    }

    setAttribute() {}

    focus() {}

    querySelector(selector) {
      if (selector === ".adhd-native-task__view") {
        this._view ??= new FakeEventTarget(this.ownerDocument);
        return this._view;
      }
      if (selector === "[data-action='concentration']") {
        this._mode ??= new FakeEventTarget(this.ownerDocument);
        return this._mode;
      }
      return null;
    }

    replaceChildren(...children) {
      for (const child of children) child.parentNode = this;
      this.children = children;
    }
  }

  const fakeWindow = new FakeEventTarget();
  fakeWindow.setTimeout = globalThis.setTimeout.bind(globalThis);
  fakeWindow.clearTimeout = globalThis.clearTimeout.bind(globalThis);
  const fakeDocument = new FakeEventTarget();
  fakeDocument.defaultView = fakeWindow;
  fakeDocument.visibilityState = "visible";
  fakeDocument.fullscreenElement = null;
  fakeDocument.hasFocus = () => true;
  fakeDocument.createElement = () => new FakeEventTarget(fakeDocument);
  const container = new FakeEventTarget(fakeDocument);
  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument;

  try {
    const controller = runNativeAdhdTask({ taskId: "stop_signal", container, seed: "runner-qc" });
    assert.equal(controller.getState().status, "ready");
    assert.equal(controller.taskVersion, ADHD_NATIVE_TASK_VERSIONS.stop_signal);
    controller.destroy({ clearContainer: false });
    const output = await controller;
    assert.equal(output.status, "interrupted");
    assert.equal(output.interruptionReason, "destroyed_before_start");
    assert.equal(output.randomSeed, controller.randomSeed);
    assert.equal(output.taskVersion, controller.taskVersion);
    assert.deepEqual(output.practiceTrials, []);
    assert.deepEqual(output.trials, []);
    assert.ok(output.config.mainTrialCount > 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
