import { updateStopSignalDelay } from "../core/adhdMetricsEngine.js";
import { createSeededRandom, shuffleSeeded } from "../core/statistics.js";

export const ADHD_NATIVE_TASK_CORE_VERSION = "1.0.0";

export const ADHD_NATIVE_TASK_VERSIONS = Object.freeze({
  stop_signal: "1.0.0",
  task_switching: "1.0.0",
  temporal_estimation: "1.0.0",
  route_planning: "1.0.0"
});

export const ADHD_NATIVE_TASK_IDS = Object.freeze(Object.keys(ADHD_NATIVE_TASK_VERSIONS));

const AGE_MODES = new Set(["pediatric", "adolescent", "adult"]);
const DIRECTIONS = Object.freeze([
  Object.freeze({ id: "up", row: -1, col: 0 }),
  Object.freeze({ id: "right", row: 0, col: 1 }),
  Object.freeze({ id: "down", row: 1, col: 0 }),
  Object.freeze({ id: "left", row: 0, col: -1 })
]);

const AGE_TIMING = Object.freeze({
  pediatric: Object.freeze({ fixationMs: 500, responseWindowMs: 1600, feedbackMs: 500 }),
  adolescent: Object.freeze({ fixationMs: 450, responseWindowMs: 1450, feedbackMs: 450 }),
  adult: Object.freeze({ fixationMs: 400, responseWindowMs: 1300, feedbackMs: 400 })
});

function hashText(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeNativeTaskSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return (Math.trunc(seed) >>> 0) || 1;
  }
  if (typeof seed === "bigint") return Number(seed & 0xffffffffn) || 1;
  return hashText(seed ?? "adhd-native-default") || 1;
}

function forkSeed(seed, namespace) {
  return hashText(`${normalizeNativeTaskSeed(seed)}:${namespace}`) || 1;
}

function normalizeAgeMode(ageMode) {
  return AGE_MODES.has(ageMode) ? ageMode : "adult";
}

function positiveInteger(value, fallback, minimum = 1) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return fallback;
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) ? Math.max(minimum, numeric) : fallback;
}

function finiteNumber(value, fallback, minimum = -Infinity, maximum = Infinity) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function makeBalancedBinarySequence(count, positiveCount, seed, positiveValue, negativeValue) {
  const safeCount = positiveInteger(count, 1);
  const safePositiveCount = Math.min(safeCount, Math.max(0, Math.trunc(positiveCount)));
  const base = [
    ...Array.from({ length: safePositiveCount }, () => positiveValue),
    ...Array.from({ length: safeCount - safePositiveCount }, () => negativeValue)
  ];

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = shuffleSeeded(base, forkSeed(seed, `binary-${attempt}`));
    if (candidate[0] === positiveValue) continue;
    let run = 0;
    let maximumPositiveRun = 0;
    for (const value of candidate) {
      run = value === positiveValue ? run + 1 : 0;
      maximumPositiveRun = Math.max(maximumPositiveRun, run);
    }
    if (maximumPositiveRun <= 2) return candidate;
  }

  const output = [];
  let positives = safePositiveCount;
  let negatives = safeCount - safePositiveCount;
  while (positives + negatives > 0) {
    if (negatives > 0) {
      output.push(negativeValue);
      negatives -= 1;
    }
    if (positives > 0) {
      output.push(positiveValue);
      positives -= 1;
    }
  }
  return output;
}

function makeStopTrials({ count, seed, practice, config }) {
  const stopCount = Math.round(count * config.stopProbability);
  const trialTypes = makeBalancedBinarySequence(count, stopCount, seed, "stop", "go");
  const random = createSeededRandom(forkSeed(seed, "directions"));
  let previousDirection = null;
  let directionRun = 0;

  return trialTypes.map((trialType, index) => {
    let direction = random() < 0.5 ? "left" : "right";
    if (direction === previousDirection && directionRun >= 3) direction = direction === "left" ? "right" : "left";
    directionRun = direction === previousDirection ? directionRun + 1 : 1;
    previousDirection = direction;
    const goExpectedResponse = direction === "left" ? "ArrowLeft" : "ArrowRight";
    return {
      id: `${practice ? "practice" : "main"}-stop-${String(index + 1).padStart(3, "0")}`,
      taskId: "stop_signal",
      taskVersion: ADHD_NATIVE_TASK_VERSIONS.stop_signal,
      sequenceVersion: ADHD_NATIVE_TASK_CORE_VERSION,
      ordinal: index + 1,
      practice,
      trialType,
      direction,
      stimulus: direction === "left" ? "←" : "→",
      goExpectedResponse,
      expectedResponse: trialType === "go" ? goExpectedResponse : null,
      stopSignalDelayMs: config.initialStopSignalDelayMs,
      responseWindowMs: config.responseWindowMs,
      stopProbability: config.stopProbability,
      staircaseAppliedAtRuntime: true
    };
  });
}

export function advanceStopSignalStaircase(currentSsdMs, inhibitionSuccessful, options = {}) {
  return updateStopSignalDelay(currentSsdMs, inhibitionSuccessful, options);
}

export function generateStopSignalTask({ seed, ageMode = "adult", config: overrides = {} } = {}) {
  const randomSeed = normalizeNativeTaskSeed(seed);
  const normalizedAgeMode = normalizeAgeMode(ageMode);
  const timing = AGE_TIMING[normalizedAgeMode];
  const config = Object.freeze({
    mainTrialCount: positiveInteger(overrides.mainTrialCount, 96, 8),
    practiceTrialCount: positiveInteger(overrides.practiceTrialCount, 12, 4),
    stopProbability: finiteNumber(overrides.stopProbability, 0.25, 0.2, 0.35),
    fixationMs: finiteNumber(overrides.fixationMs, timing.fixationMs, 100, 2000),
    responseWindowMs: finiteNumber(overrides.responseWindowMs, timing.responseWindowMs, 500, 5000),
    feedbackMs: finiteNumber(overrides.feedbackMs, timing.feedbackMs, 100, 2000),
    initialStopSignalDelayMs: finiteNumber(overrides.initialStopSignalDelayMs, 250, 50, 900),
    staircaseStepMs: finiteNumber(overrides.staircaseStepMs, 50, 1, 300),
    minimumStopSignalDelayMs: finiteNumber(overrides.minimumStopSignalDelayMs, 50, 0, 900),
    maximumStopSignalDelayMs: finiteNumber(overrides.maximumStopSignalDelayMs, 900, 50, 2000)
  });
  const maximumDelayWithinWindow = Math.max(0, config.responseWindowMs - 50);
  const boundedMinimumDelay = Math.min(config.minimumStopSignalDelayMs, maximumDelayWithinWindow);
  const boundedMaximumDelay = Math.min(
    Math.max(boundedMinimumDelay, config.maximumStopSignalDelayMs),
    maximumDelayWithinWindow
  );
  const boundedConfig = Object.freeze({
    ...config,
    minimumStopSignalDelayMs: boundedMinimumDelay,
    maximumStopSignalDelayMs: boundedMaximumDelay,
    initialStopSignalDelayMs: Math.min(
      Math.max(config.initialStopSignalDelayMs, boundedMinimumDelay),
      boundedMaximumDelay
    )
  });

  return {
    taskId: "stop_signal",
    taskVersion: ADHD_NATIVE_TASK_VERSIONS.stop_signal,
    generatorVersion: ADHD_NATIVE_TASK_CORE_VERSION,
    randomSeed,
    ageMode: normalizedAgeMode,
    config: boundedConfig,
    practiceTrials: makeStopTrials({
      count: boundedConfig.practiceTrialCount,
      seed: forkSeed(randomSeed, "stop-practice"),
      practice: true,
      config: boundedConfig
    }),
    trials: makeStopTrials({
      count: boundedConfig.mainTrialCount,
      seed: forkSeed(randomSeed, "stop-main"),
      practice: false,
      config: boundedConfig
    })
  };
}

const SWITCH_RULES = Object.freeze({
  parity: Object.freeze({ id: "parity", label: "PAR / IMPAR", leftLabel: "Impar", rightLabel: "Par" }),
  magnitude: Object.freeze({ id: "magnitude", label: "MENOR / MAYOR QUE 5", leftLabel: "Menor", rightLabel: "Mayor" })
});

function taskSwitchExpectedResponse(rule, stimulus) {
  if (rule === "parity") return stimulus % 2 === 0 ? "ArrowRight" : "ArrowLeft";
  return stimulus > 5 ? "ArrowRight" : "ArrowLeft";
}

function makeSwitchRuleSequence(count, seed, blockType, fixedRule = null, switchProportion = 0.5) {
  if (blockType === "single") return Array.from({ length: count }, () => fixedRule);
  const random = createSeededRandom(forkSeed(seed, "mixed-rules"));
  const rules = [random() < 0.5 ? "parity" : "magnitude"];
  const transitionCount = Math.max(0, count - 1);
  const switchCount = Math.round(transitionCount * finiteNumber(switchProportion, 0.5, 0.1, 0.9));
  const transitions = shuffleSeeded([
    ...Array.from({ length: switchCount }, () => "switch"),
    ...Array.from({ length: transitionCount - switchCount }, () => "repeat")
  ], forkSeed(seed, "mixed-transitions"));
  for (const transition of transitions) {
    const previous = rules[rules.length - 1];
    rules.push(transition === "switch" ? (previous === "parity" ? "magnitude" : "parity") : previous);
  }
  return rules;
}

function makeSwitchBlock({ count, seed, practice, blockIndex, blockType, fixedRule, startingOrdinal, config }) {
  const rules = makeSwitchRuleSequence(count, seed, blockType, fixedRule, config.switchProportion);
  const random = createSeededRandom(forkSeed(seed, "stimuli"));
  const availableStimuli = [1, 2, 3, 4, 6, 7, 8, 9];
  let previousStimulus = null;

  return rules.map((rule, index) => {
    let stimulus = availableStimuli[Math.floor(random() * availableStimuli.length)];
    if (stimulus === previousStimulus) {
      stimulus = availableStimuli[(availableStimuli.indexOf(stimulus) + 1 + Math.floor(random() * 3)) % availableStimuli.length];
    }
    previousStimulus = stimulus;
    const previousRule = index > 0 ? rules[index - 1] : null;
    const transition = previousRule ? (previousRule === rule ? "repeat" : "switch") : null;
    const expectedResponse = taskSwitchExpectedResponse(rule, stimulus);
    return {
      id: `${practice ? "practice" : "main"}-switch-${String(startingOrdinal + index).padStart(3, "0")}`,
      taskId: "task_switching",
      taskVersion: ADHD_NATIVE_TASK_VERSIONS.task_switching,
      sequenceVersion: ADHD_NATIVE_TASK_CORE_VERSION,
      ordinal: startingOrdinal + index,
      practice,
      blockIndex,
      blockType,
      rule,
      ruleCue: SWITCH_RULES[rule],
      transition,
      stimulus,
      expectedResponse,
      expectedSide: expectedResponse === "ArrowLeft" ? "left" : "right",
      responseWindowMs: config.responseWindowMs
    };
  });
}

export function generateTaskSwitchingTask({ seed, ageMode = "adult", config: overrides = {} } = {}) {
  const randomSeed = normalizeNativeTaskSeed(seed);
  const normalizedAgeMode = normalizeAgeMode(ageMode);
  const timing = AGE_TIMING[normalizedAgeMode];
  const config = Object.freeze({
    singleBlockTrialCount: positiveInteger(overrides.singleBlockTrialCount, 16, 4),
    mixedBlockTrialCount: positiveInteger(overrides.mixedBlockTrialCount, 64, 8),
    practiceTrialCount: positiveInteger(overrides.practiceTrialCount, 12, 4),
    fixationMs: finiteNumber(overrides.fixationMs, timing.fixationMs, 100, 2000),
    responseWindowMs: finiteNumber(overrides.responseWindowMs, timing.responseWindowMs, 500, 5000),
    switchProportion: finiteNumber(overrides.switchProportion, 0.5, 0.2, 0.65),
    feedbackMs: finiteNumber(overrides.feedbackMs, timing.feedbackMs, 100, 2000)
  });
  const practiceTrials = makeSwitchBlock({
    count: config.practiceTrialCount,
    seed: forkSeed(randomSeed, "switch-practice"),
    practice: true,
    blockIndex: 0,
    blockType: "mixed",
    fixedRule: null,
    startingOrdinal: 1,
    config
  });
  const parityBlock = makeSwitchBlock({
    count: config.singleBlockTrialCount,
    seed: forkSeed(randomSeed, "switch-single-parity"),
    practice: false,
    blockIndex: 1,
    blockType: "single",
    fixedRule: "parity",
    startingOrdinal: 1,
    config
  });
  const magnitudeBlock = makeSwitchBlock({
    count: config.singleBlockTrialCount,
    seed: forkSeed(randomSeed, "switch-single-magnitude"),
    practice: false,
    blockIndex: 2,
    blockType: "single",
    fixedRule: "magnitude",
    startingOrdinal: parityBlock.length + 1,
    config
  });
  const mixedBlock = makeSwitchBlock({
    count: config.mixedBlockTrialCount,
    seed: forkSeed(randomSeed, "switch-mixed"),
    practice: false,
    blockIndex: 3,
    blockType: "mixed",
    fixedRule: null,
    startingOrdinal: parityBlock.length + magnitudeBlock.length + 1,
    config
  });

  return {
    taskId: "task_switching",
    taskVersion: ADHD_NATIVE_TASK_VERSIONS.task_switching,
    generatorVersion: ADHD_NATIVE_TASK_CORE_VERSION,
    randomSeed,
    ageMode: normalizedAgeMode,
    config,
    responseRules: SWITCH_RULES,
    practiceTrials,
    blocks: [
      { blockIndex: 1, blockType: "single", rule: "parity", trialCount: parityBlock.length },
      { blockIndex: 2, blockType: "single", rule: "magnitude", trialCount: magnitudeBlock.length },
      { blockIndex: 3, blockType: "mixed", rule: null, trialCount: mixedBlock.length }
    ],
    trials: [...parityBlock, ...magnitudeBlock, ...mixedBlock]
  };
}

function makeTemporalTrials({ count, seed, practice, config }) {
  const modes = shuffleSeeded(Array.from({ length: count }, (_, index) => (
    index % 2 === 0 ? "estimation" : "reproduction"
  )), forkSeed(seed, "temporal-modes"));
  const targets = shuffleSeeded(Array.from({ length: count }, (_, index) => (
    config.targetDurationsMs[index % config.targetDurationsMs.length]
  )), forkSeed(seed, "temporal-targets"));

  return modes.map((mode, index) => {
    const targetMs = targets[index];
    const lower = Math.max(100, Math.round((targetMs * 0.7) / 50) * 50);
    const upper = Math.round((targetMs * 1.3) / 50) * 50;
    const choicesMs = mode === "estimation"
      ? shuffleSeeded([lower, targetMs, upper], forkSeed(seed, `temporal-choice-${index}`))
      : [];
    return {
      id: `${practice ? "practice" : "main"}-temporal-${String(index + 1).padStart(3, "0")}`,
      taskId: "temporal_estimation",
      taskVersion: ADHD_NATIVE_TASK_VERSIONS.temporal_estimation,
      sequenceVersion: ADHD_NATIVE_TASK_CORE_VERSION,
      ordinal: index + 1,
      practice,
      mode,
      targetMs,
      choicesMs,
      presentationLabel: mode === "estimation" ? "Estima la duración" : "Reproduce la duración",
      maximumReproductionMs: config.maximumReproductionMs
    };
  });
}

export function generateTemporalEstimationTask({ seed, ageMode = "adult", config: overrides = {} } = {}) {
  const randomSeed = normalizeNativeTaskSeed(seed);
  const normalizedAgeMode = normalizeAgeMode(ageMode);
  const defaultTargets = normalizedAgeMode === "pediatric"
    ? [700, 1000, 1400, 1900]
    : [800, 1200, 1700, 2300];
  const suppliedTargets = Array.isArray(overrides.targetDurationsMs)
    ? overrides.targetDurationsMs.map(Number).filter((value) => Number.isFinite(value) && value >= 300 && value <= 5000)
    : [];
  const targetDurationsMs = Object.freeze(suppliedTargets.length ? suppliedTargets : defaultTargets);
  const config = Object.freeze({
    mainTrialCount: positiveInteger(overrides.mainTrialCount, 20, 4),
    practiceTrialCount: positiveInteger(overrides.practiceTrialCount, 4, 2),
    targetDurationsMs,
    interTrialMs: finiteNumber(overrides.interTrialMs, 550, 100, 3000),
    maximumReproductionMs: finiteNumber(overrides.maximumReproductionMs, 6000, 1000, 15000)
  });

  return {
    taskId: "temporal_estimation",
    taskVersion: ADHD_NATIVE_TASK_VERSIONS.temporal_estimation,
    generatorVersion: ADHD_NATIVE_TASK_CORE_VERSION,
    randomSeed,
    ageMode: normalizedAgeMode,
    config,
    practiceTrials: makeTemporalTrials({
      count: config.practiceTrialCount,
      seed: forkSeed(randomSeed, "temporal-practice"),
      practice: true,
      config
    }),
    trials: makeTemporalTrials({
      count: config.mainTrialCount,
      seed: forkSeed(randomSeed, "temporal-main"),
      practice: false,
      config
    })
  };
}

function coordinateKey(coordinate) {
  return `${coordinate.row},${coordinate.col}`;
}

function sameCoordinate(first, second) {
  return first?.row === second?.row && first?.col === second?.col;
}

function normalizeCoordinate(value) {
  return { row: Math.trunc(Number(value?.row)), col: Math.trunc(Number(value?.col)) };
}

function normalizePlanningState(puzzle, state) {
  const checkpoints = Array.isArray(puzzle.checkpoints) ? puzzle.checkpoints : [];
  const position = normalizeCoordinate(state?.position ?? puzzle.start);
  let nextCheckpointIndex = Math.max(0, Math.trunc(Number(state?.nextCheckpointIndex) || 0));
  while (nextCheckpointIndex < checkpoints.length && sameCoordinate(position, checkpoints[nextCheckpointIndex])) {
    nextCheckpointIndex += 1;
  }
  return { position, nextCheckpointIndex };
}

function normalizeDirection(direction) {
  const key = String(direction ?? "").toLowerCase();
  const aliases = {
    arrowup: "up", w: "up", arriba: "up",
    arrowright: "right", d: "right", derecha: "right",
    arrowdown: "down", s: "down", abajo: "down",
    arrowleft: "left", a: "left", izquierda: "left"
  };
  return aliases[key] ?? key;
}

export function transitionRoutePlanningState(puzzle, state, direction) {
  const rows = positiveInteger(puzzle?.rows, 1);
  const cols = positiveInteger(puzzle?.cols, 1);
  const current = normalizePlanningState(puzzle, state);
  const delta = DIRECTIONS.find((candidate) => candidate.id === normalizeDirection(direction));
  if (!delta) return null;
  const position = {
    row: current.position.row + delta.row,
    col: current.position.col + delta.col
  };
  if (position.row < 0 || position.row >= rows || position.col < 0 || position.col >= cols) return null;
  const blocked = new Set((puzzle.blocked ?? []).map((coordinate) => coordinateKey(normalizeCoordinate(coordinate))));
  if (blocked.has(coordinateKey(position))) return null;
  return normalizePlanningState(puzzle, {
    position,
    nextCheckpointIndex: current.nextCheckpointIndex
  });
}

function planningStateKey(state) {
  return `${coordinateKey(state.position)}|${state.nextCheckpointIndex}`;
}

export function solveRoutePlanningBfs(puzzle, startState = null) {
  const checkpoints = Array.isArray(puzzle?.checkpoints) ? puzzle.checkpoints : [];
  const initial = normalizePlanningState(puzzle, startState ?? {
    position: puzzle?.start,
    nextCheckpointIndex: 0
  });
  const queue = [initial];
  let queueIndex = 0;
  const initialKey = planningStateKey(initial);
  const parent = new Map([[initialKey, null]]);
  const parentMove = new Map();
  const states = new Map([[initialKey, initial]]);
  let goalKey = null;

  while (queueIndex < queue.length) {
    const state = queue[queueIndex];
    queueIndex += 1;
    const key = planningStateKey(state);
    if (sameCoordinate(state.position, puzzle.goal) && state.nextCheckpointIndex >= checkpoints.length) {
      goalKey = key;
      break;
    }
    for (const direction of DIRECTIONS) {
      const next = transitionRoutePlanningState(puzzle, state, direction.id);
      if (!next) continue;
      const nextKey = planningStateKey(next);
      if (parent.has(nextKey)) continue;
      parent.set(nextKey, key);
      parentMove.set(nextKey, direction.id);
      states.set(nextKey, next);
      queue.push(next);
    }
  }

  if (!goalKey) {
    return { reachable: false, optimalMoves: null, path: [], states: [], visitedStates: parent.size };
  }
  const path = [];
  const statePath = [];
  let cursor = goalKey;
  while (cursor !== null) {
    statePath.push(states.get(cursor));
    if (parentMove.has(cursor)) path.push(parentMove.get(cursor));
    cursor = parent.get(cursor);
  }
  path.reverse();
  statePath.reverse();
  return {
    reachable: true,
    optimalMoves: path.length,
    path,
    states: statePath,
    visitedStates: parent.size
  };
}

function allGridCoordinates(rows, cols) {
  return Array.from({ length: rows * cols }, (_, index) => ({
    row: Math.floor(index / cols),
    col: index % cols
  }));
}

function makeRoutePuzzle({ seed, index, practice, rows, cols, checkpointCount, blockedRatio }) {
  const puzzleSeed = forkSeed(seed, `${practice ? "practice" : "main"}-route-${index}`);
  const variant = puzzleSeed % 4;
  const corners = [
    { row: 0, col: 0 },
    { row: 0, col: cols - 1 },
    { row: rows - 1, col: cols - 1 },
    { row: rows - 1, col: 0 }
  ];
  const start = corners[variant];
  const goal = corners[(variant + 2) % 4];
  const eligible = allGridCoordinates(rows, cols).filter((coordinate) => (
    !sameCoordinate(coordinate, start)
    && !sameCoordinate(coordinate, goal)
    && coordinate.row > 0
    && coordinate.row < rows - 1
    && coordinate.col > 0
    && coordinate.col < cols - 1
  ));
  const checkpoints = shuffleSeeded(eligible, forkSeed(puzzleSeed, "checkpoints"))
    .slice(0, checkpointCount)
    .map((coordinate, checkpointIndex) => ({
      ...coordinate,
      id: `checkpoint-${checkpointIndex + 1}`,
      order: checkpointIndex + 1,
      label: String(checkpointIndex + 1)
    }));
  const protectedKeys = new Set([start, goal, ...checkpoints].map(coordinateKey));
  const obstacleCandidates = allGridCoordinates(rows, cols).filter((coordinate) => !protectedKeys.has(coordinateKey(coordinate)));
  const desiredBlocked = Math.floor(rows * cols * blockedRatio);
  let selectedBlocked = [];
  let solution = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    selectedBlocked = shuffleSeeded(obstacleCandidates, forkSeed(puzzleSeed, `blocked-${attempt}`)).slice(0, desiredBlocked);
    const candidate = { rows, cols, start, goal, checkpoints, blocked: selectedBlocked };
    solution = solveRoutePlanningBfs(candidate);
    const directDistance = Math.abs(start.row - goal.row) + Math.abs(start.col - goal.col);
    if (solution.reachable && solution.optimalMoves >= directDistance) break;
  }
  if (!solution?.reachable) {
    selectedBlocked = [];
    solution = solveRoutePlanningBfs({ rows, cols, start, goal, checkpoints, blocked: [] });
  }

  return {
    id: `${practice ? "practice" : "main"}-route-${String(index + 1).padStart(2, "0")}`,
    taskId: "route_planning",
    taskVersion: ADHD_NATIVE_TASK_VERSIONS.route_planning,
    generatorVersion: ADHD_NATIVE_TASK_CORE_VERSION,
    formId: `route-${rows}x${cols}-v${variant}-${puzzleSeed.toString(36)}`,
    puzzleSeed,
    ordinal: index + 1,
    practice,
    rows,
    cols,
    start: { ...start },
    goal: { ...goal },
    checkpoints,
    blocked: selectedBlocked.map((coordinate) => ({ ...coordinate })),
    rules: {
      orderedCheckpoints: true,
      diagonalMoves: false,
      blockedCellsTraversable: false
    },
    optimalMoves: solution.optimalMoves,
    optimalPath: [...solution.path],
    reachableStateCount: solution.visitedStates
  };
}

export function generateRoutePlanningTask({ seed, ageMode = "adult", config: overrides = {} } = {}) {
  const randomSeed = normalizeNativeTaskSeed(seed);
  const normalizedAgeMode = normalizeAgeMode(ageMode);
  const defaultRows = normalizedAgeMode === "pediatric" ? 5 : 6;
  const config = Object.freeze({
    mainPuzzleCount: positiveInteger(overrides.mainPuzzleCount, 4, 1),
    practicePuzzleCount: positiveInteger(overrides.practicePuzzleCount, 1, 1),
    rows: positiveInteger(overrides.rows, defaultRows, 4),
    cols: positiveInteger(overrides.cols, defaultRows, 4),
    checkpointCount: positiveInteger(overrides.checkpointCount, normalizedAgeMode === "pediatric" ? 1 : 2, 1),
    blockedRatio: finiteNumber(overrides.blockedRatio, 0.16, 0, 0.35),
    maximumPuzzleTimeMs: finiteNumber(overrides.maximumPuzzleTimeMs, 120000, 10000, 600000)
  });
  const practicePuzzles = Array.from({ length: config.practicePuzzleCount }, (_, index) => makeRoutePuzzle({
    seed: forkSeed(randomSeed, "route-practice"),
    index,
    practice: true,
    rows: 4,
    cols: 4,
    checkpointCount: 1,
    blockedRatio: 0.08
  }));
  const puzzles = Array.from({ length: config.mainPuzzleCount }, (_, index) => makeRoutePuzzle({
    seed: forkSeed(randomSeed, "route-main"),
    index,
    practice: false,
    rows: config.rows,
    cols: config.cols,
    checkpointCount: Math.min(config.checkpointCount, Math.max(1, (config.rows - 2) * (config.cols - 2))),
    blockedRatio: config.blockedRatio
  }));

  return {
    taskId: "route_planning",
    taskVersion: ADHD_NATIVE_TASK_VERSIONS.route_planning,
    generatorVersion: ADHD_NATIVE_TASK_CORE_VERSION,
    randomSeed,
    ageMode: normalizedAgeMode,
    config,
    practicePuzzles,
    puzzles
  };
}

export function createNativeAdhdTaskDefinition(taskId, options = {}) {
  switch (taskId) {
    case "stop_signal": return generateStopSignalTask(options);
    case "task_switching": return generateTaskSwitchingTask(options);
    case "temporal_estimation": return generateTemporalEstimationTask(options);
    case "route_planning": return generateRoutePlanningTask(options);
    default: throw new RangeError(`Tarea TDAH nativa no soportada: ${String(taskId)}`);
  }
}
