import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const adhdTaskRequested = new URLSearchParams(globalThis.location?.search || "").get("adhd") === "1";
const adhdTaskMode = adhdTaskRequested
  && document.documentElement.dataset.cognicionEmbed === "adhd-task";
let adhdTaskContext = null;
let adhdTaskBridge = null;
let adhdResultPublished = false;
let adhdBridgeConfiguration = {};
let adhdBridgeRandomSeed = null;
let adhdBridgeMode = "program";

if (adhdTaskMode) {
  try {
    const [{ parseExistingTaskContext }, { createAdhdTaskPageBridge }] = await Promise.all([
      import("./adhd/adapters/existingTaskAdapters.js"),
      import("./adhd/integration/adhdTaskPageBridge.js?v=20260902-adhd-task-embed-v2")
    ]);
    adhdTaskContext = parseExistingTaskContext();
    if (adhdTaskContext.taskId !== "stroop") throw new TypeError("El contexto TDAH no corresponde a Stroop.");
    adhdBridgeRandomSeed = adhdTaskContext.randomSeed;
    adhdTaskBridge = createAdhdTaskPageBridge({
      context: adhdTaskContext,
      onConfig(launchConfig) {
        if (launchConfig?.taskId !== "stroop") return;
        adhdBridgeMode = launchConfig.mode || adhdBridgeMode;
        adhdBridgeConfiguration = launchConfig.configuration || {};
        adhdBridgeRandomSeed = launchConfig.randomSeed !== null
          && launchConfig.randomSeed !== undefined
          && launchConfig.randomSeed !== ""
          && Number.isFinite(Number(launchConfig.randomSeed))
          ? Number(launchConfig.randomSeed)
          : adhdBridgeRandomSeed;
      }
    });
  } catch (error) {
    console.error("No se pudo iniciar el puente TDAH de Stroop.", error);
  }
}

function createSeededRandom(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = [
  { key: "rojo", label: "ROJO", hex: "#ef4444" },
  { key: "azul", label: "AZUL", hex: "#38bdf8" },
  { key: "verde", label: "VERDE", hex: "#22c55e" },
  { key: "amarillo", label: "AMARILLO", hex: "#eab308" },
  { key: "morado", label: "MORADO", hex: "#a855f7" },
  { key: "naranja", label: "NARANJA", hex: "#f97316" }
];

const DIFFICULTIES = {
  facil: { label: "Facil", totalTrials: 18, timeLimitMs: 5200, congruentRate: 0.7, distractors: false },
  medio: { label: "Medio", totalTrials: 24, timeLimitMs: 4200, congruentRate: 0.5, distractors: false },
  dificil: { label: "Dificil", totalTrials: 30, timeLimitMs: 3200, congruentRate: 0.28, distractors: true }
};

let currentUser = null;
let difficulty = "facil";
let config = DIFFICULTIES.facil;
let trials = [];
let currentTrial = null;
let currentIndex = 0;
let startedAt = 0;
let trialStartedAt = 0;
let trialTimer = null;
let rafId = null;
let acceptingAnswers = false;
let sessionSeed = null;
let sessionRandom = Math.random;
let sessionStartedAtIso = "";
let stroopPracticeMode = false;
let adhdPracticeCompleted = false;

const els = {
  start: document.getElementById("stroopStart"),
  task: document.getElementById("stroopTask"),
  results: document.getElementById("stroopResults"),
  startButton: document.getElementById("startStroop"),
  restartButton: document.getElementById("restartStroop"),
  status: document.getElementById("stroopSessionStatus"),
  trialCounter: document.getElementById("trialCounter"),
  liveAccuracy: document.getElementById("liveAccuracy"),
  timeRemaining: document.getElementById("timeRemaining"),
  progressBar: document.getElementById("progressBar"),
  stimulusWrap: document.getElementById("stimulusWrap"),
  stimulusWord: document.getElementById("stimulusWord"),
  answerButtons: document.getElementById("answerButtons"),
  feedback: document.getElementById("feedback"),
  score: document.getElementById("scoreResult"),
  accuracy: document.getElementById("accuracyResult"),
  reaction: document.getElementById("rtResult"),
  correct: document.getElementById("correctResult"),
  incorrect: document.getElementById("incorrectResult"),
  total: document.getElementById("totalResult"),
  recommendation: document.getElementById("recommendationResult")
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (els.status) {
    els.status.textContent = adhdTaskMode
      ? "Modo programa TDAH: el resultado se devolvera al programa sin guardado paralelo."
      : user
        ? "Sesion autenticada. El resultado se guardara al finalizar."
        : "No hay usuario autenticado. Puedes entrenar, pero no se guardara en Firestore.";
  }
});

function randomItem(items) {
  return items[Math.floor(sessionRandom() * items.length)];
}

function generateTrial(activeConfig) {
  const word = randomItem(COLORS);
  const congruent = sessionRandom() < activeConfig.congruentRate;
  const inkColor = congruent
    ? word
    : randomItem(COLORS.filter((color) => color.key !== word.key));

  return {
    word: word.label,
    inkColor: inkColor.key,
    inkHex: inkColor.hex,
    correctAnswer: inkColor.key,
    isCongruent: congruent
  };
}

function generateTrials(activeConfig) {
  return Array.from({ length: activeConfig.totalTrials }, () => generateTrial(activeConfig));
}

function startSession() {
  startSessionPhase(adhdTaskMode && !adhdPracticeCompleted);
}

function startSessionPhase(isPractice) {
  const localDifficulty = document.querySelector('input[name="difficulty"]:checked')?.value || "facil";
  difficulty = DIFFICULTIES[adhdBridgeConfiguration.difficulty]
    ? adhdBridgeConfiguration.difficulty
    : localDifficulty;
  const baseConfig = DIFFICULTIES[difficulty] || DIFFICULTIES.facil;
  const configuredSession = adhdTaskMode ? {
    ...baseConfig,
    totalTrials: boundedInteger(adhdBridgeConfiguration.totalTrials, baseConfig.totalTrials, 6, 200),
    timeLimitMs: boundedInteger(adhdBridgeConfiguration.timeLimitMs, baseConfig.timeLimitMs, 500, 10000),
    congruentRate: boundedNumber(adhdBridgeConfiguration.congruentRate, baseConfig.congruentRate, 0.1, 0.9),
    distractors: typeof adhdBridgeConfiguration.distractors === "boolean"
      ? adhdBridgeConfiguration.distractors
      : baseConfig.distractors
  } : baseConfig;
  stroopPracticeMode = Boolean(isPractice);
  config = stroopPracticeMode
    ? { ...configuredSession, totalTrials: 6, timeLimitMs: Math.max(3000, configuredSession.timeLimitMs), distractors: false }
    : configuredSession;
  sessionSeed = adhdTaskMode ? createAdhdContextSeed(`stroop:${stroopPracticeMode ? "practice" : "main"}`) : null;
  sessionRandom = sessionSeed === null ? Math.random : createSeededRandom(sessionSeed);
  sessionStartedAtIso = new Date().toISOString();
  if (stroopPracticeMode || !adhdTaskMode) adhdResultPublished = false;
  trials = generateTrials(config);
  currentIndex = 0;
  startedAt = performance.now();
  if (adhdTaskMode && stroopPracticeMode) {
    adhdTaskBridge?.publishEvent("practice_started", {
      practiceTrials: config.totalTrials,
      randomSeed: sessionSeed,
      scored: false
    });
  } else if (adhdTaskMode) {
    adhdTaskBridge?.publishEvent("task_started", {
      randomSeed: sessionSeed,
      configuration: { ...config, difficulty },
      sequenceControlled: true,
      practiceAvailable: true,
      practiceRequired: true
    });
  }
  clearFeedback();
  renderButtons();
  showPanel("task");
  nextTrial();
}

function showPanel(panel) {
  els.start.hidden = panel !== "start";
  els.task.hidden = panel !== "task";
  els.results.hidden = panel !== "results";
}

function renderButtons() {
  els.answerButtons.innerHTML = COLORS.map((color) => `
    <button type="button" data-answer="${color.key}" style="background:${color.hex}">${color.label}</button>
  `).join("");
  els.answerButtons.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(button.dataset.answer));
  });
}

function nextTrial() {
  window.clearTimeout(trialTimer);
  window.cancelAnimationFrame(rafId);
  clearFeedback();

  if (currentIndex >= trials.length) {
    finishSession();
    return;
  }

  currentTrial = trials[currentIndex];
  acceptingAnswers = false;
  els.stimulusWord.textContent = currentTrial.word;
  els.stimulusWord.style.color = currentTrial.inkHex;
  els.stimulusWord.style.animation = "none";
  void els.stimulusWord.offsetWidth;
  els.stimulusWord.style.animation = "";
  els.stimulusWrap.classList.toggle("distractors", Boolean(config.distractors));
  trialStartedAt = performance.now();
  acceptingAnswers = true;
  updateHud();
  updateTimer();

  trialTimer = window.setTimeout(() => {
    submitAnswer(null);
  }, config.timeLimitMs);
}

function updateHud() {
  const answered = trials.filter((trial) => trial.userAnswer !== undefined);
  const correct = answered.filter((trial) => trial.isCorrect).length;
  const accuracy = answered.length ? Math.round((correct / answered.length) * 100) : 0;
  els.trialCounter.textContent = `${Math.min(currentIndex + 1, trials.length)}/${trials.length}`;
  els.liveAccuracy.textContent = suppressScoredAssessmentFeedback() ? "—" : `${accuracy}%`;
  els.progressBar.style.width = `${Math.round((answered.length / trials.length) * 100)}%`;
}

function updateTimer() {
  const elapsed = performance.now() - trialStartedAt;
  const remaining = Math.max(0, config.timeLimitMs - elapsed);
  els.timeRemaining.textContent = `${(remaining / 1000).toFixed(1)}s`;
  if (acceptingAnswers) rafId = window.requestAnimationFrame(updateTimer);
}

function submitAnswer(answer) {
  if (!acceptingAnswers || !currentTrial) return;
  acceptingAnswers = false;
  window.clearTimeout(trialTimer);
  window.cancelAnimationFrame(rafId);

  const reactionTime = Math.round(performance.now() - trialStartedAt);
  const isCorrect = answer === currentTrial.correctAnswer;
  Object.assign(currentTrial, {
    userAnswer: answer || "sin_respuesta",
    isCorrect,
    reactionTime: answer ? reactionTime : config.timeLimitMs,
    timestamp: new Date().toISOString()
  });

  showFeedback(isCorrect, answer === null);
  currentIndex += 1;
  updateHud();
  window.setTimeout(nextTrial, 520);
}

function suppressScoredAssessmentFeedback() {
  return adhdTaskMode && adhdBridgeMode === "assessment" && !stroopPracticeMode;
}

function showFeedback(isCorrect, timedOut) {
  if (suppressScoredAssessmentFeedback()) {
    clearFeedback();
    return;
  }
  els.feedback.textContent = timedOut ? "SIN RESPUESTA" : isCorrect ? "CORRECTO" : "ERROR";
  els.feedback.className = `stroop-feedback ${isCorrect ? "ok" : "bad"}`;
  els.stimulusWrap.classList.add(isCorrect ? "ok" : "bad");
}

function clearFeedback() {
  els.feedback.textContent = "";
  els.feedback.className = "stroop-feedback";
  els.stimulusWrap.classList.remove("ok", "bad");
}

function calculateStatistics(sessionTrials, activeDifficulty, sessionStartedAt, isPractice = false) {
  const totalTrials = sessionTrials.length;
  const correct = sessionTrials.filter((trial) => trial.isCorrect).length;
  const incorrect = totalTrials - correct;
  const accuracy = totalTrials ? Math.round((correct / totalTrials) * 1000) / 10 : 0;
  const correctReactionTimes = sessionTrials.filter((trial) => trial.isCorrect).map((trial) => Number(trial.reactionTime)).filter(Number.isFinite);
  const averageReactionTime = correctReactionTimes.length
    ? Math.round(correctReactionTimes.reduce((sum, value) => sum + value, 0) / correctReactionTimes.length)
    : 0;
  const durationMs = Math.round(performance.now() - sessionStartedAt);
  const score = Math.max(0, Math.round(correct * 100 - averageReactionTime / 10));

  return {
    module: "stroop",
    activityVersion: "1.1.0",
    status: "completed",
    practice: Boolean(isPractice),
    difficulty: activeDifficulty,
    configuration: { ...config, difficulty: activeDifficulty },
    randomSeed: sessionSeed,
    startedAtIso: sessionStartedAtIso,
    totalTrials,
    correct,
    incorrect,
    accuracy,
    averageReactionTime,
    durationMs,
    durationSeconds: Math.round(durationMs / 1000),
    score,
    createdAtIso: new Date().toISOString(),
    completedAtIso: new Date().toISOString(),
    trials: sessionTrials.map((trial, index) => ({
      attempt: index + 1,
      word: trial.word,
      inkColor: trial.inkColor,
      correctAnswer: trial.correctAnswer,
      userAnswer: trial.userAnswer,
      isCorrect: trial.isCorrect,
      reactionTime: trial.reactionTime,
      timestamp: trial.timestamp,
      isCongruent: trial.isCongruent
    }))
  };
}

function recommendationFor(stats) {
  if (stats.accuracy >= 90 && stats.averageReactionTime <= 1200) return "Excelente control inhibitorio.";
  if (stats.accuracy >= 78) return "Buen desempeno. Mantener entrenamiento con dificultad progresiva.";
  if (stats.accuracy >= 60) return "Conviene repetir el entrenamiento y vigilar errores en ensayos incongruentes.";
  return "Se observa dificultad para inhibir respuestas automaticas. Repetir en dificultad menor.";
}

async function saveSession(stats) {
  if (!currentUser) return;
  const payload = {
    userId: currentUser.uid,
    module: "stroop",
    difficulty: stats.difficulty,
    totalTrials: stats.totalTrials,
    correct: stats.correct,
    incorrect: stats.incorrect,
    accuracy: stats.accuracy,
    averageReactionTime: stats.averageReactionTime,
    durationMs: stats.durationMs,
    durationSeconds: stats.durationSeconds,
    score: stats.score,
    createdAt: serverTimestamp(),
    createdAtIso: stats.createdAtIso,
    trials: stats.trials
  };
  await addDoc(collection(db, "rehabilitacion_cognitiva", currentUser.uid, "stroop_sessions"), payload);
}

async function finishSession() {
  const stats = calculateStatistics(trials, difficulty, startedAt, stroopPracticeMode);
  if (adhdTaskMode && stroopPracticeMode) {
    adhdPracticeCompleted = true;
    adhdTaskBridge?.publishEvent("practice_completed", {
      practiceTrials: stats.totalTrials,
      randomSeed: sessionSeed,
      scored: false
    });
    if (els.status) els.status.textContent = "Practica completada. Inicia ahora la aplicacion puntuable.";
    if (els.startButton) els.startButton.textContent = "Iniciar aplicacion";
    showPanel("start");
    return;
  }
  els.score.textContent = String(stats.score);
  els.accuracy.textContent = `${stats.accuracy}%`;
  els.reaction.textContent = `${stats.averageReactionTime} ms`;
  els.correct.textContent = String(stats.correct);
  els.incorrect.textContent = String(stats.incorrect);
  els.total.textContent = String(stats.totalTrials);
  els.recommendation.textContent = recommendationFor(stats);
  showPanel("results");

  if (adhdTaskMode) {
    publishAdhdResult(stats);
  } else {
    try {
      await saveSession(stats);
    } catch (error) {
      console.error("No se pudo guardar la sesion Stroop", error);
      els.recommendation.textContent += " No se pudo guardar la sesion en Firestore.";
    }
  }
}

function createAdhdContextSeed(namespace) {
  const controlledValue = adhdBridgeRandomSeed ?? adhdTaskContext?.randomSeed;
  const controlledSeed = controlledValue === null || controlledValue === undefined || controlledValue === ""
    ? null
    : Number(controlledValue);
  const hasControlledSeed = Number.isFinite(controlledSeed) && controlledSeed !== 0;
  if (hasControlledSeed && namespace.endsWith(":main")) return Math.trunc(controlledSeed) >>> 0;
  const explicitSeed = new URLSearchParams(globalThis.location?.search || "").get("adhdSeed");
  const source = hasControlledSeed
    ? controlledSeed
    : explicitSeed || adhdTaskContext?.attemptId || adhdTaskContext?.sessionId || adhdTaskContext?.bridgeToken || "stroop";
  let hash = 2166136261;
  for (const character of `${source}:${namespace}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function publishAdhdResult(stats) {
  if (!adhdTaskMode || !adhdTaskBridge || adhdResultPublished) return false;
  adhdResultPublished = adhdTaskBridge.publishResult(stats);
  return adhdResultPublished;
}

els.startButton?.addEventListener("click", startSession);
els.restartButton?.addEventListener("click", () => showPanel("start"));
if (adhdTaskMode && els.startButton) els.startButton.textContent = "Comenzar practica";
showPanel("start");
