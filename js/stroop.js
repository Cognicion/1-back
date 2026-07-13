import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    els.status.textContent = user
      ? "Sesion autenticada. El resultado se guardara al finalizar."
      : "No hay usuario autenticado. Puedes entrenar, pero no se guardara en Firestore.";
  }
});

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function generateTrial(activeConfig) {
  const word = randomItem(COLORS);
  const congruent = Math.random() < activeConfig.congruentRate;
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
  difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || "facil";
  config = DIFFICULTIES[difficulty] || DIFFICULTIES.facil;
  trials = generateTrials(config);
  currentIndex = 0;
  startedAt = performance.now();
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
  acceptingAnswers = true;
  trialStartedAt = performance.now();
  els.stimulusWord.textContent = currentTrial.word;
  els.stimulusWord.style.color = currentTrial.inkHex;
  els.stimulusWord.style.animation = "none";
  void els.stimulusWord.offsetWidth;
  els.stimulusWord.style.animation = "";
  els.stimulusWrap.classList.toggle("distractors", Boolean(config.distractors));
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
  els.liveAccuracy.textContent = `${accuracy}%`;
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

function showFeedback(isCorrect, timedOut) {
  els.feedback.textContent = timedOut ? "SIN RESPUESTA" : isCorrect ? "CORRECTO" : "ERROR";
  els.feedback.className = `stroop-feedback ${isCorrect ? "ok" : "bad"}`;
  els.stimulusWrap.classList.add(isCorrect ? "ok" : "bad");
}

function clearFeedback() {
  els.feedback.textContent = "";
  els.feedback.className = "stroop-feedback";
  els.stimulusWrap.classList.remove("ok", "bad");
}

function calculateStatistics(sessionTrials, activeDifficulty, sessionStartedAt) {
  const totalTrials = sessionTrials.length;
  const correct = sessionTrials.filter((trial) => trial.isCorrect).length;
  const incorrect = totalTrials - correct;
  const accuracy = totalTrials ? Math.round((correct / totalTrials) * 1000) / 10 : 0;
  const averageReactionTime = totalTrials
    ? Math.round(sessionTrials.reduce((sum, trial) => sum + Number(trial.reactionTime || 0), 0) / totalTrials)
    : 0;
  const durationMs = Math.round(performance.now() - sessionStartedAt);
  const score = Math.max(0, Math.round(correct * 100 - averageReactionTime / 10));

  return {
    module: "stroop",
    difficulty: activeDifficulty,
    totalTrials,
    correct,
    incorrect,
    accuracy,
    averageReactionTime,
    durationMs,
    durationSeconds: Math.round(durationMs / 1000),
    score,
    createdAtIso: new Date().toISOString(),
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
  const stats = calculateStatistics(trials, difficulty, startedAt);
  els.score.textContent = String(stats.score);
  els.accuracy.textContent = `${stats.accuracy}%`;
  els.reaction.textContent = `${stats.averageReactionTime} ms`;
  els.correct.textContent = String(stats.correct);
  els.incorrect.textContent = String(stats.incorrect);
  els.total.textContent = String(stats.totalTrials);
  els.recommendation.textContent = recommendationFor(stats);
  showPanel("results");

  try {
    await saveSession(stats);
  } catch (error) {
    console.error("No se pudo guardar la sesion Stroop", error);
    els.recommendation.textContent += " No se pudo guardar la sesion en Firestore.";
  }
}

els.startButton?.addEventListener("click", startSession);
els.restartButton?.addEventListener("click", () => showPanel("start"));
showPanel("start");
