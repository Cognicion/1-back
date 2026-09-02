import {
  advanceStopSignalStaircase,
  createNativeAdhdTaskDefinition,
  transitionRoutePlanningState
} from "./adhdNativeTaskCores.js";
import {
  calculatePlanningMetrics,
  calculateStopSignalMetrics,
  calculateTaskSwitchingMetrics,
  calculateTemporalMetrics
} from "../core/adhdMetricsEngine.js";

const TASK_COPY = Object.freeze({
  stop_signal: Object.freeze({
    title: "Control de respuesta",
    instruction: "Responde a la dirección de la flecha. Si aparece el círculo rojo, no respondas."
  }),
  task_switching: Object.freeze({
    title: "Cambio de regla",
    instruction: "Usa la regla indicada para clasificar cada número con izquierda o derecha."
  }),
  temporal_estimation: Object.freeze({
    title: "Percepción del tiempo",
    instruction: "Observa cada intervalo y después estimalo o reprodúcelo, según se indique."
  }),
  route_planning: Object.freeze({
    title: "Planificación de rutas",
    instruction: "Llega a la meta pasando por los puntos numerados en orden y evitando los obstáculos."
  })
});

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundTime(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCallback(callback, payload) {
  if (typeof callback !== "function") return;
  try {
    callback(payload);
  } catch (error) {
    globalThis.console?.error?.("Error en callback de tarea TDAH", error);
  }
}

function resolveContainer(container) {
  const documentRef = globalThis.document;
  if (!documentRef) throw new Error("runNativeAdhdTask requiere un entorno DOM.");
  const resolved = typeof container === "string" ? documentRef.querySelector(container) : container;
  if (!resolved || typeof resolved.replaceChildren !== "function") {
    throw new TypeError("container debe ser un elemento DOM válido o un selector existente.");
  }
  return resolved;
}

function keyboardSide(key) {
  const normalized = String(key ?? "").toLowerCase();
  if (["arrowleft", "z", "a"].includes(normalized)) return "ArrowLeft";
  if (["arrowright", "m", "l"].includes(normalized)) return "ArrowRight";
  return null;
}

function orientationSnapshot() {
  const orientation = globalThis.screen?.orientation;
  return orientation?.type ?? `${globalThis.innerWidth ?? 0}x${globalThis.innerHeight ?? 0}`;
}

function calculateTaskMetrics(taskId, practiceRecords, mainRecords) {
  const records = [...practiceRecords, ...mainRecords];
  switch (taskId) {
    case "stop_signal": return calculateStopSignalMetrics(records);
    case "task_switching": return calculateTaskSwitchingMetrics(records);
    case "temporal_estimation": return calculateTemporalMetrics(records);
    case "route_planning": return calculatePlanningMetrics(records);
    default: return null;
  }
}

export function runNativeAdhdTask({
  taskId,
  container,
  seed,
  ageMode = "adult",
  config = {},
  onComplete,
  onInterrupt
} = {}) {
  const resolvedContainer = resolveContainer(container);
  const definition = createNativeAdhdTaskDefinition(taskId, { seed, ageMode, config });
  const documentRef = resolvedContainer.ownerDocument ?? globalThis.document;
  const windowRef = documentRef.defaultView ?? globalThis;
  const copy = TASK_COPY[taskId];
  const root = documentRef.createElement("section");
  root.className = "adhd-native-task";
  root.dataset.taskId = taskId;
  root.dataset.concentration = "off";
  root.tabIndex = -1;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", copy.title);
  root.innerHTML = `
    <style>
      .adhd-native-task{--adhd-ink:#16212b;--adhd-muted:#65727e;--adhd-line:#d9e1e7;--adhd-accent:#176b87;--adhd-accent-dark:#0d5068;--adhd-good:#287a55;--adhd-bad:#b24444;--adhd-bg:#f6f8fa;color:var(--adhd-ink);background:var(--adhd-bg);border:1px solid var(--adhd-line);border-radius:18px;box-sizing:border-box;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;min-height:520px;overflow:hidden;width:100%}
      .adhd-native-task *{box-sizing:border-box}
      .adhd-native-task__bar{align-items:center;background:#fff;border-bottom:1px solid var(--adhd-line);display:flex;gap:12px;justify-content:space-between;padding:12px 18px}
      .adhd-native-task__bar strong{font-size:.94rem;letter-spacing:.02em}
      .adhd-native-task__mode{background:transparent;border:1px solid var(--adhd-line);border-radius:999px;color:var(--adhd-ink);cursor:pointer;font:inherit;font-size:.82rem;padding:7px 12px}
      .adhd-native-task__view{align-items:center;display:flex;flex:1;justify-content:center;min-height:450px;padding:clamp(18px,4vw,46px)}
      .adhd-native-task__panel{display:grid;gap:20px;justify-items:center;max-width:760px;text-align:center;width:100%}
      .adhd-native-task__eyebrow{color:var(--adhd-accent-dark);font-size:.78rem;font-weight:750;letter-spacing:.1em;margin:0;text-transform:uppercase}
      .adhd-native-task h2,.adhd-native-task h3,.adhd-native-task p{margin:0}
      .adhd-native-task h2{font-size:clamp(1.6rem,4vw,2.5rem);line-height:1.1}
      .adhd-native-task h3{font-size:clamp(1.25rem,3vw,1.8rem)}
      .adhd-native-task__lead{color:var(--adhd-muted);font-size:1.02rem;line-height:1.6;max-width:620px}
      .adhd-native-task__button{background:var(--adhd-accent);border:0;border-radius:12px;color:#fff;cursor:pointer;font:inherit;font-weight:750;min-height:48px;padding:12px 20px;touch-action:manipulation}
      .adhd-native-task__button:hover,.adhd-native-task__button:focus-visible{background:var(--adhd-accent-dark);outline:3px solid #97cede;outline-offset:2px}
      .adhd-native-task__button--secondary{background:#fff;border:1px solid var(--adhd-line);color:var(--adhd-ink)}
      .adhd-native-task__actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;width:100%}
      .adhd-native-task__response{background:#fff;border:2px solid var(--adhd-line);border-radius:14px;color:var(--adhd-ink);cursor:pointer;font:inherit;font-size:1.05rem;font-weight:800;min-height:62px;min-width:145px;padding:12px 20px;touch-action:manipulation}
      .adhd-native-task__response:focus-visible{border-color:var(--adhd-accent);outline:3px solid #b7dce7}
      .adhd-native-task__progress{color:var(--adhd-muted);font-size:.83rem}
      .adhd-native-task__fixation{font-size:clamp(3rem,10vw,6rem);font-weight:300;line-height:1}
      .adhd-native-task__stimulus{font-size:clamp(5rem,22vw,11rem);font-weight:800;line-height:.9;min-height:1em}
      .adhd-native-task__stop{align-items:center;background:#c54242;border-radius:50%;color:#fff;display:flex;font-size:clamp(2rem,8vw,4rem);font-weight:900;height:clamp(80px,18vw,130px);justify-content:center;position:absolute;width:clamp(80px,18vw,130px)}
      .adhd-native-task__stage{align-items:center;display:flex;justify-content:center;min-height:190px;position:relative;width:100%}
      .adhd-native-task__cue{background:#e7f2f6;border-radius:999px;color:var(--adhd-accent-dark);font-weight:850;letter-spacing:.06em;padding:8px 15px;text-transform:uppercase}
      .adhd-native-task__number{font-size:clamp(5rem,18vw,10rem);font-weight:850;line-height:1}
      .adhd-native-task__interval{background:var(--adhd-accent);border-radius:50%;height:clamp(110px,25vw,180px);width:clamp(110px,25vw,180px)}
      .adhd-native-task__interval--active{animation:adhd-native-pulse .8s ease-in-out infinite alternate}
      @keyframes adhd-native-pulse{to{opacity:.55;transform:scale(.94)}}
      .adhd-native-task__feedback--good{color:var(--adhd-good)}
      .adhd-native-task__feedback--bad{color:var(--adhd-bad)}
      .adhd-native-task__grid{display:grid;gap:5px;max-width:440px;width:min(78vw,440px)}
      .adhd-native-task__cell{align-items:center;aspect-ratio:1;background:#fff;border:1px solid var(--adhd-line);border-radius:8px;display:flex;font-size:clamp(.8rem,3vw,1.25rem);font-weight:850;justify-content:center;position:relative}
      .adhd-native-task__cell--blocked{background:#4d5963;border-color:#4d5963;color:#fff}
      .adhd-native-task__cell--goal{background:#fff1bd;border-color:#ddb94d}
      .adhd-native-task__cell--checkpoint{background:#e0f0f5;border-color:#83bccd}
      .adhd-native-task__cell--passed{background:#dff2e8;border-color:#7fb99a;color:#287a55}
      .adhd-native-task__cell--current{background:var(--adhd-accent);border-color:var(--adhd-accent);color:#fff;box-shadow:0 0 0 3px #b7dce7}
      .adhd-native-task__pad{display:grid;gap:7px;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,52px)}
      .adhd-native-task__pad button{background:#fff;border:1px solid var(--adhd-line);border-radius:10px;color:var(--adhd-ink);cursor:pointer;font-size:1.25rem;font-weight:800;touch-action:manipulation}
      .adhd-native-task__pad button[data-direction="up"]{grid-column:2}
      .adhd-native-task__pad button[data-direction="left"]{grid-column:1;grid-row:2}
      .adhd-native-task__pad button[data-direction="down"]{grid-column:2;grid-row:2}
      .adhd-native-task__pad button[data-direction="right"]{grid-column:3;grid-row:2}
      .adhd-native-task__meta{color:var(--adhd-muted);display:flex;flex-wrap:wrap;font-size:.82rem;gap:12px;justify-content:center}
      .adhd-native-task[data-concentration="on"]{background:#fff;border-color:transparent;border-radius:0;min-height:min(100vh,850px)}
      .adhd-native-task[data-concentration="on"] .adhd-native-task__bar{background:#fff}
      .adhd-native-task:fullscreen{border:0;border-radius:0;height:100vh;width:100vw}
      .adhd-native-task .adhd-native-task__bar{background:#fff!important;border-color:var(--adhd-line)!important;box-shadow:none!important;backdrop-filter:none!important}
      .adhd-native-task :is(h2,h3,strong){color:var(--adhd-ink)!important}
      .adhd-native-task p{color:var(--adhd-ink)!important;opacity:1!important}
      .adhd-native-task :is(.adhd-native-task__lead,.adhd-native-task__progress,.adhd-native-task__meta){color:var(--adhd-muted)!important}
      .adhd-native-task .adhd-native-task__eyebrow{color:var(--adhd-accent-dark)!important}
      .adhd-native-task .adhd-native-task__button{background:var(--adhd-accent)!important;border-color:var(--adhd-accent)!important;color:#fff!important;box-shadow:none!important}
      .adhd-native-task .adhd-native-task__button:hover,.adhd-native-task .adhd-native-task__button:focus-visible{background:var(--adhd-accent-dark)!important;border-color:var(--adhd-accent-dark)!important}
      .adhd-native-task .adhd-native-task__button--secondary,.adhd-native-task .adhd-native-task__response,.adhd-native-task .adhd-native-task__mode,.adhd-native-task .adhd-native-task__pad button{background:#fff!important;border-color:var(--adhd-line)!important;color:var(--adhd-ink)!important;box-shadow:none!important}
      html:not([data-theme="light"]) .adhd-native-task{--adhd-ink:#f3f7f4;--adhd-muted:#b7c8bd;--adhd-line:#456052;--adhd-bg:#13251d;--adhd-accent:#4ca57a;--adhd-accent-dark:#8bd4ab;background:var(--adhd-bg)!important}
      html:not([data-theme="light"]) .adhd-native-task :is(.adhd-native-task__bar,.adhd-native-task__button--secondary,.adhd-native-task__response,.adhd-native-task__mode,.adhd-native-task__pad button,.adhd-native-task__cell){background:#1b3026!important;color:var(--adhd-ink)!important}
      html:not([data-theme="light"]) .adhd-native-task[data-concentration="on"]{background:#13251d!important}
      @media(max-width:560px){.adhd-native-task__view{padding:18px 12px}.adhd-native-task__response{flex:1;min-width:125px}.adhd-native-task__bar{padding:10px 12px}}
      @media(prefers-reduced-motion:reduce){.adhd-native-task__interval--active{animation:none}}
    </style>
    <header class="adhd-native-task__bar">
      <strong>${copy.title}</strong>
      <button class="adhd-native-task__mode" type="button" data-action="concentration">Modo concentración</button>
    </header>
    <div class="adhd-native-task__view" aria-live="polite"></div>
  `;
  const view = root.querySelector(".adhd-native-task__view");
  const modeButton = root.querySelector("[data-action='concentration']");
  resolvedContainer.replaceChildren(root);

  const state = {
    status: "ready",
    settled: false,
    destroyed: false,
    concentrationMode: false,
    startedAt: null,
    startedAtIso: null,
    currentPractice: true,
    currentIndex: 0,
    currentSequence: [],
    activeTrial: null,
    activePuzzle: null,
    stopSignalDelayMs: definition.config.initialStopSignalDelayMs ?? null,
    practiceRecords: [],
    mainRecords: [],
    technicalEvents: [],
    runToken: 0,
    finalPayload: null
  };
  const timers = new Set();
  const externalCleanups = [];
  const rootCleanups = [];
  let resultResolve;
  const result = new Promise((resolve) => { resultResolve = resolve; });

  function listen(target, eventName, handler, options, external = true) {
    target?.addEventListener?.(eventName, handler, options);
    const cleanup = () => target?.removeEventListener?.(eventName, handler, options);
    (external ? externalCleanups : rootCleanups).push(cleanup);
  }

  function cleanupExternalListeners() {
    while (externalCleanups.length) externalCleanups.pop()();
  }

  function clearTimers() {
    for (const timer of timers) windowRef.clearTimeout(timer);
    timers.clear();
  }

  function schedule(callback, delayMs) {
    const token = state.runToken;
    const timer = windowRef.setTimeout(() => {
      timers.delete(timer);
      if (state.status !== "running" || token !== state.runToken) return;
      callback();
    }, Math.max(0, Number(delayMs) || 0));
    timers.add(timer);
    return timer;
  }

  function logTechnicalEvent(type, details = {}) {
    state.technicalEvents.push({
      type,
      performanceTimeMs: roundTime(now()),
      relativeTimeMs: state.startedAt === null ? null : roundTime(now() - state.startedAt),
      visibilityState: documentRef.visibilityState ?? null,
      hasFocus: documentRef.hasFocus?.() ?? null,
      orientation: orientationSnapshot(),
      ...details
    });
  }

  function render(content) {
    view.innerHTML = `<div class="adhd-native-task__panel">${content}</div>`;
  }

  function progressLabel() {
    const label = state.currentPractice ? "Práctica" : "Aplicación";
    return `${label} · ${Math.min(state.currentIndex + 1, state.currentSequence.length)} de ${state.currentSequence.length}`;
  }

  function storeRecord(record) {
    (record.practice ? state.practiceRecords : state.mainRecords).push(record);
  }

  function payload(extra = {}) {
    const base = {
      taskId: definition.taskId,
      taskVersion: definition.taskVersion,
      generatorVersion: definition.generatorVersion,
      randomSeed: definition.randomSeed,
      ageMode: definition.ageMode,
      config: definition.config,
      startedAt: state.startedAtIso,
      endedAt: new Date().toISOString(),
      durationMs: state.startedAt === null ? 0 : roundTime(now() - state.startedAt),
      technicalEvents: state.technicalEvents.map((event) => ({ ...event })),
      metrics: calculateTaskMetrics(taskId, state.practiceRecords, state.mainRecords),
      ...extra
    };
    if (taskId === "route_planning") {
      return {
        ...base,
        practicePuzzles: state.practiceRecords.map((record) => ({ ...record })),
        puzzles: state.mainRecords.map((record) => ({ ...record }))
      };
    }
    return {
      ...base,
      practiceTrials: state.practiceRecords.map((record) => ({ ...record })),
      trials: state.mainRecords.map((record) => ({ ...record }))
    };
  }

  function settleComplete() {
    if (state.settled) return;
    state.settled = true;
    state.status = "complete";
    state.runToken += 1;
    clearTimers();
    logTechnicalEvent("task_completed");
    cleanupExternalListeners();
    const completedPayload = payload({ status: "completed", interrupted: false });
    state.finalPayload = completedPayload;
    render(`
      <p class="adhd-native-task__eyebrow">Aplicación finalizada</p>
      <h2>Registro completado</h2>
      <p class="adhd-native-task__lead">Las respuestas y los eventos técnicos quedaron preparados para el cálculo del perfil.</p>
      <div class="adhd-native-task__meta"><span>Semilla ${definition.randomSeed}</span><span>Versión ${definition.taskVersion}</span></div>
    `);
    resultResolve(completedPayload);
    safeCallback(onComplete, completedPayload);
  }

  function activeInterruptionRecord(reason) {
    if (state.activeTrial) {
      const active = state.activeTrial;
      storeRecord({
        ...active.trial,
        stopSignalDelayMs: active.stopSignalDelayMs ?? active.trial.stopSignalDelayMs,
        stimulusOnsetPerformanceMs: roundTime(active.stimulusOnsetMs),
        interrupted: true,
        interruptionReason: reason,
        validForMetrics: false,
        completed: false
      });
      state.activeTrial = null;
    }
    if (state.activePuzzle) {
      const active = state.activePuzzle;
      const endedAt = now();
      storeRecord({
        ...active.puzzle,
        moves: active.moves,
        path: [...active.path],
        ruleViolations: active.ruleViolations,
        resets: active.resets,
        completed: false,
        planningTimeMs: active.firstMoveAt === null ? roundTime(endedAt - active.openedAt) : roundTime(active.firstMoveAt - active.openedAt),
        executionTimeMs: active.firstMoveAt === null ? 0 : roundTime(endedAt - active.firstMoveAt),
        totalTimeMs: roundTime(endedAt - active.openedAt),
        interrupted: true,
        interruptionReason: reason,
        validForMetrics: false
      });
      state.activePuzzle = null;
    }
  }

  function interrupt(reason = "manual") {
    if (state.settled || state.destroyed || state.status === "interrupted") return state.finalPayload;
    const wasRunning = state.status === "running";
    state.status = "interrupted";
    state.runToken += 1;
    clearTimers();
    if (wasRunning) activeInterruptionRecord(reason);
    logTechnicalEvent("task_interrupted", { reason });
    cleanupExternalListeners();
    const interruptedPayload = payload({ status: "interrupted", interrupted: true, interruptionReason: reason });
    state.finalPayload = interruptedPayload;
    state.settled = true;
    render(`
      <p class="adhd-native-task__eyebrow">Aplicación interrumpida</p>
      <h2>La tarea se detuvo de forma segura</h2>
      <p class="adhd-native-task__lead">Motivo registrado: ${escapeHtml(String(reason).replaceAll("_", " "))}. El ensayo activo no se incluirá en las métricas.</p>
      <div class="adhd-native-task__actions">
        <button class="adhd-native-task__button" type="button" data-action="restart">Reiniciar con la misma forma</button>
      </div>
    `);
    resultResolve(interruptedPayload);
    safeCallback(onInterrupt, interruptedPayload);
    return interruptedPayload;
  }

  function finishPhase() {
    clearTimers();
    state.activeTrial = null;
    state.activePuzzle = null;
    if (state.currentPractice) {
      render(`
        <p class="adhd-native-task__eyebrow">Práctica terminada</p>
        <h2>Comienza la aplicación</h2>
        <p class="adhd-native-task__lead">A partir de aquí se registran los resultados puntuables. Mantén esta ventana visible y evita cambiar de orientación.</p>
        <button class="adhd-native-task__button" type="button" data-action="begin-main">Iniciar aplicación</button>
      `);
      return;
    }
    settleComplete();
  }

  function advanceSequence(delayMs = 120) {
    clearTimers();
    state.activeTrial = null;
    state.activePuzzle = null;
    const previous = state.currentSequence[state.currentIndex];
    state.currentIndex += 1;
    if (state.currentIndex >= state.currentSequence.length) {
      schedule(finishPhase, delayMs);
      return;
    }
    const next = state.currentSequence[state.currentIndex];
    if (taskId === "task_switching" && !state.currentPractice && previous.blockIndex !== next.blockIndex) {
      render(`
        <p class="adhd-native-task__eyebrow">Pausa de bloque</p>
        <h2>${next.blockType === "mixed" ? "Ahora alternan las reglas" : next.ruleCue.label}</h2>
        <p class="adhd-native-task__lead">Lee la regla antes de responder. La tarea continuará cuando estés listo.</p>
        <button class="adhd-native-task__button" type="button" data-action="continue-block">Continuar</button>
      `);
      return;
    }
    schedule(showCurrentItem, delayMs);
  }

  function feedbackAndAdvance(correct, detail = "") {
    if (!state.currentPractice) {
      advanceSequence(100);
      return;
    }
    render(`
      <p class="adhd-native-task__eyebrow">Práctica</p>
      <h3 class="adhd-native-task__feedback--${correct ? "good" : "bad"}">${correct ? "Correcto" : "Revisa la regla"}</h3>
      ${detail ? `<p class="adhd-native-task__lead">${detail}</p>` : ""}
    `);
    schedule(() => advanceSequence(0), definition.config.feedbackMs ?? 650);
  }

  function showFixation(then) {
    state.activeTrial = null;
    render(`
      <p class="adhd-native-task__progress">${progressLabel()}</p>
      <div class="adhd-native-task__stage"><div class="adhd-native-task__fixation">+</div></div>
    `);
    schedule(then, definition.config.fixationMs ?? 400);
  }

  function renderStopStimulus(trial, stopSignalVisible = false) {
    render(`
      <p class="adhd-native-task__progress">${progressLabel()}</p>
      <div class="adhd-native-task__stage">
        <div class="adhd-native-task__stimulus" aria-label="flecha ${trial.direction}">${trial.stimulus}</div>
        ${stopSignalVisible ? '<div class="adhd-native-task__stop" aria-label="señal de detener">●</div>' : ""}
      </div>
      <div class="adhd-native-task__actions">
        <button class="adhd-native-task__response" type="button" data-response="ArrowLeft">← Izquierda</button>
        <button class="adhd-native-task__response" type="button" data-response="ArrowRight">Derecha →</button>
      </div>
    `);
  }

  function showStopTrial(trial) {
    showFixation(() => {
      const stimulusOnsetMs = now();
      const stopSignalDelayMs = state.stopSignalDelayMs;
      state.activeTrial = {
        trial,
        stimulusOnsetMs,
        stopSignalDelayMs,
        stopSignalPresentedAtMs: null
      };
      renderStopStimulus(trial, false);
      if (trial.trialType === "stop") {
        schedule(() => {
          if (!state.activeTrial) return;
          state.activeTrial.stopSignalPresentedAtMs = now();
          renderStopStimulus(trial, true);
        }, stopSignalDelayMs);
      }
      schedule(() => {
        if (!state.activeTrial) return;
        const inhibitionSuccess = trial.trialType === "stop";
        const record = {
          ...trial,
          stopSignalDelayMs,
          stimulusOnsetPerformanceMs: roundTime(stimulusOnsetMs),
          response: null,
          reactionTimeMs: null,
          omitted: trial.trialType === "go",
          inhibitionSuccess: trial.trialType === "stop" ? true : null,
          correct: inhibitionSuccess,
          validForMetrics: true
        };
        if (trial.trialType === "stop") updateStopStaircase(true);
        storeRecord(record);
        state.activeTrial = null;
        feedbackAndAdvance(record.correct, trial.trialType === "go" ? "Responde antes de que termine el intervalo." : "No responder ante el círculo es correcto.");
      }, trial.responseWindowMs);
    });
  }

  function updateStopStaircase(inhibitionSuccessful) {
    state.stopSignalDelayMs = advanceStopSignalStaircase(state.stopSignalDelayMs, inhibitionSuccessful, {
      initialMs: definition.config.initialStopSignalDelayMs,
      stepMs: definition.config.staircaseStepMs,
      minimumMs: definition.config.minimumStopSignalDelayMs,
      maximumMs: definition.config.maximumStopSignalDelayMs
    });
  }

  function respondStopSignal(response) {
    const active = state.activeTrial;
    if (!active || taskId !== "stop_signal") return;
    clearTimers();
    const responseAtMs = now();
    const isStop = active.trial.trialType === "stop";
    const correct = !isStop && response === active.trial.goExpectedResponse;
    const record = {
      ...active.trial,
      stopSignalDelayMs: active.stopSignalDelayMs,
      stimulusOnsetPerformanceMs: roundTime(active.stimulusOnsetMs),
      stopSignalOnsetPerformanceMs: roundTime(active.stopSignalPresentedAtMs),
      responsePerformanceMs: roundTime(responseAtMs),
      response,
      reactionTimeMs: roundTime(responseAtMs - active.stimulusOnsetMs),
      omitted: false,
      inhibitionSuccess: isStop ? false : null,
      respondedBeforeStopSignal: isStop && active.stopSignalPresentedAtMs === null,
      correct,
      validForMetrics: true
    };
    if (isStop) updateStopStaircase(false);
    storeRecord(record);
    state.activeTrial = null;
    feedbackAndAdvance(correct, isStop ? "Cuando aparezca el círculo, deja la respuesta sin pulsar." : "Usa la tecla o botón que coincide con la flecha.");
  }

  function showSwitchTrial(trial) {
    showFixation(() => {
      const stimulusOnsetMs = now();
      state.activeTrial = { trial, stimulusOnsetMs };
      render(`
        <p class="adhd-native-task__progress">${progressLabel()}</p>
        <div class="adhd-native-task__cue">${trial.ruleCue.label}</div>
        <div class="adhd-native-task__number">${trial.stimulus}</div>
        <div class="adhd-native-task__actions">
          <button class="adhd-native-task__response" type="button" data-response="ArrowLeft">← ${trial.ruleCue.leftLabel}</button>
          <button class="adhd-native-task__response" type="button" data-response="ArrowRight">${trial.ruleCue.rightLabel} →</button>
        </div>
      `);
      schedule(() => {
        if (!state.activeTrial) return;
        storeRecord({
          ...trial,
          stimulusOnsetPerformanceMs: roundTime(stimulusOnsetMs),
          response: null,
          reactionTimeMs: null,
          omitted: true,
          correct: false,
          validForMetrics: true
        });
        state.activeTrial = null;
        feedbackAndAdvance(false, "Responde antes de que termine el intervalo.");
      }, trial.responseWindowMs);
    });
  }

  function respondTaskSwitch(response) {
    const active = state.activeTrial;
    if (!active || taskId !== "task_switching") return;
    clearTimers();
    const responseAtMs = now();
    const correct = response === active.trial.expectedResponse;
    storeRecord({
      ...active.trial,
      stimulusOnsetPerformanceMs: roundTime(active.stimulusOnsetMs),
      responsePerformanceMs: roundTime(responseAtMs),
      response,
      reactionTimeMs: roundTime(responseAtMs - active.stimulusOnsetMs),
      omitted: false,
      correct,
      validForMetrics: true
    });
    state.activeTrial = null;
    feedbackAndAdvance(correct, `La regla activa era ${active.trial.ruleCue.label.toLowerCase()}.`);
  }

  function showTemporalTrial(trial) {
    state.activeTrial = { trial, sampleOnsetMs: now(), promptOnsetMs: null, reproductionStartMs: null };
    render(`
      <p class="adhd-native-task__progress">${progressLabel()}</p>
      <p class="adhd-native-task__eyebrow">Observa el intervalo</p>
      <div class="adhd-native-task__interval adhd-native-task__interval--active" aria-label="intervalo en curso"></div>
    `);
    schedule(() => showTemporalPrompt(trial), trial.targetMs);
  }

  function showTemporalPrompt(trial) {
    if (!state.activeTrial) return;
    state.activeTrial.promptOnsetMs = now();
    if (trial.mode === "estimation") {
      render(`
        <p class="adhd-native-task__progress">${progressLabel()}</p>
        <h3>¿Cuánto duró?</h3>
        <p class="adhd-native-task__lead">Elige una opción. También puedes usar las teclas 1, 2 o 3.</p>
        <div class="adhd-native-task__actions">
          ${trial.choicesMs.map((choice, index) => `<button class="adhd-native-task__response" type="button" data-temporal-choice="${choice}">${index + 1}. ${(choice / 1000).toFixed(2)} s</button>`).join("")}
        </div>
      `);
      return;
    }
    render(`
      <p class="adhd-native-task__progress">${progressLabel()}</p>
      <h3>Reproduce el intervalo</h3>
      <p class="adhd-native-task__lead">Pulsa una vez para iniciar y otra para detener. También puedes usar Espacio.</p>
      <button class="adhd-native-task__button" type="button" data-action="reproduction-toggle">Iniciar reproducción</button>
    `);
  }

  function answerTemporalEstimation(choice) {
    const active = state.activeTrial;
    if (!active || taskId !== "temporal_estimation" || active.trial.mode !== "estimation") return;
    const responseMs = Number(choice);
    if (!active.trial.choicesMs.includes(responseMs)) return;
    clearTimers();
    const responseAtMs = now();
    const record = {
      ...active.trial,
      sampleOnsetPerformanceMs: roundTime(active.sampleOnsetMs),
      promptOnsetPerformanceMs: roundTime(active.promptOnsetMs),
      responsePerformanceMs: roundTime(responseAtMs),
      selectionReactionTimeMs: roundTime(responseAtMs - active.promptOnsetMs),
      responseMs,
      errorMs: responseMs - active.trial.targetMs,
      validForMetrics: true
    };
    storeRecord(record);
    state.activeTrial = null;
    const exact = responseMs === record.targetMs;
    feedbackAndAdvance(exact, `Intervalo: ${(record.targetMs / 1000).toFixed(2)} s; respuesta: ${(responseMs / 1000).toFixed(2)} s.`);
  }

  function toggleTemporalReproduction() {
    const active = state.activeTrial;
    if (!active || taskId !== "temporal_estimation" || active.trial.mode !== "reproduction") return;
    if (active.reproductionStartMs === null) {
      active.reproductionStartMs = now();
      render(`
        <p class="adhd-native-task__progress">${progressLabel()}</p>
        <div class="adhd-native-task__interval adhd-native-task__interval--active" aria-label="reproducción en curso"></div>
        <button class="adhd-native-task__button" type="button" data-action="reproduction-toggle">Detener reproducción</button>
      `);
      schedule(() => finishTemporalReproduction(true), active.trial.maximumReproductionMs);
      return;
    }
    finishTemporalReproduction(false);
  }

  function finishTemporalReproduction(timedOut) {
    const active = state.activeTrial;
    if (!active || active.reproductionStartMs === null) return;
    clearTimers();
    const responseAtMs = now();
    const responseMs = Math.min(responseAtMs - active.reproductionStartMs, active.trial.maximumReproductionMs);
    const record = {
      ...active.trial,
      sampleOnsetPerformanceMs: roundTime(active.sampleOnsetMs),
      reproductionStartPerformanceMs: roundTime(active.reproductionStartMs),
      responsePerformanceMs: roundTime(responseAtMs),
      responseMs: roundTime(responseMs),
      errorMs: roundTime(responseMs - active.trial.targetMs),
      timedOut,
      validForMetrics: !timedOut
    };
    storeRecord(record);
    state.activeTrial = null;
    feedbackAndAdvance(!timedOut, `Intervalo: ${(record.targetMs / 1000).toFixed(2)} s; reproducción: ${(record.responseMs / 1000).toFixed(2)} s.`);
  }

  function planningInitialState(puzzle) {
    return { position: { ...puzzle.start }, nextCheckpointIndex: 0 };
  }

  function isPlanningGoal(puzzle, planningState) {
    return planningState.position.row === puzzle.goal.row
      && planningState.position.col === puzzle.goal.col
      && planningState.nextCheckpointIndex >= puzzle.checkpoints.length;
  }

  function renderPlanningPuzzle() {
    const active = state.activePuzzle;
    if (!active) return;
    const { puzzle, planningState } = active;
    const blocked = new Set(puzzle.blocked.map((coordinate) => `${coordinate.row},${coordinate.col}`));
    const checkpointByCell = new Map(puzzle.checkpoints.map((checkpoint, index) => [`${checkpoint.row},${checkpoint.col}`, { ...checkpoint, index }]));
    const cells = [];
    for (let row = 0; row < puzzle.rows; row += 1) {
      for (let col = 0; col < puzzle.cols; col += 1) {
        const key = `${row},${col}`;
        const checkpoint = checkpointByCell.get(key);
        const isCurrent = planningState.position.row === row && planningState.position.col === col;
        const isGoal = puzzle.goal.row === row && puzzle.goal.col === col;
        const isStart = puzzle.start.row === row && puzzle.start.col === col;
        const classes = ["adhd-native-task__cell"];
        let label = "";
        if (blocked.has(key)) {
          classes.push("adhd-native-task__cell--blocked");
          label = "×";
        }
        if (isGoal) {
          classes.push("adhd-native-task__cell--goal");
          label = "Meta";
        }
        if (checkpoint) {
          classes.push(checkpoint.index < planningState.nextCheckpointIndex ? "adhd-native-task__cell--passed" : "adhd-native-task__cell--checkpoint");
          label = checkpoint.label;
        }
        if (isStart && !label) label = "Inicio";
        if (isCurrent) {
          classes.push("adhd-native-task__cell--current");
          label = "●";
        }
        cells.push(`<div class="${classes.join(" ")}" aria-label="fila ${row + 1}, columna ${col + 1}">${label}</div>`);
      }
    }
    render(`
      <p class="adhd-native-task__progress">${progressLabel()}</p>
      <div class="adhd-native-task__meta"><span>Movimientos: ${active.moves}</span><span>Intentos no válidos: ${active.ruleViolations}</span><span>Siguiente punto: ${planningState.nextCheckpointIndex < puzzle.checkpoints.length ? planningState.nextCheckpointIndex + 1 : "meta"}</span></div>
      <div class="adhd-native-task__grid" style="grid-template-columns:repeat(${puzzle.cols},1fr)">${cells.join("")}</div>
      <div class="adhd-native-task__pad" aria-label="controles de dirección">
        <button type="button" data-direction="up" aria-label="arriba">↑</button>
        <button type="button" data-direction="left" aria-label="izquierda">←</button>
        <button type="button" data-direction="down" aria-label="abajo">↓</button>
        <button type="button" data-direction="right" aria-label="derecha">→</button>
      </div>
      <button class="adhd-native-task__button adhd-native-task__button--secondary" type="button" data-action="reset-puzzle">Volver al inicio</button>
    `);
  }

  function showPlanningPuzzle(puzzle) {
    const openedAt = now();
    state.activePuzzle = {
      puzzle,
      openedAt,
      firstMoveAt: null,
      planningState: planningInitialState(puzzle),
      moves: 0,
      path: [],
      ruleViolations: 0,
      resets: 0
    };
    renderPlanningPuzzle();
    schedule(() => finishPlanningPuzzle(false, true), definition.config.maximumPuzzleTimeMs);
  }

  function movePlanning(direction) {
    const active = state.activePuzzle;
    if (!active || taskId !== "route_planning") return;
    const nextState = transitionRoutePlanningState(active.puzzle, active.planningState, direction);
    if (!nextState) {
      active.ruleViolations += 1;
      logTechnicalEvent("planning_invalid_move", { direction });
      renderPlanningPuzzle();
      return;
    }
    const movedAt = now();
    if (active.firstMoveAt === null) active.firstMoveAt = movedAt;
    active.planningState = nextState;
    active.moves += 1;
    active.path.push(direction);
    if (isPlanningGoal(active.puzzle, nextState)) {
      finishPlanningPuzzle(true, false);
      return;
    }
    renderPlanningPuzzle();
  }

  function resetPlanningPuzzle() {
    const active = state.activePuzzle;
    if (!active) return;
    active.planningState = planningInitialState(active.puzzle);
    active.resets += 1;
    logTechnicalEvent("planning_reset", { puzzleId: active.puzzle.id });
    renderPlanningPuzzle();
  }

  function finishPlanningPuzzle(completed, timedOut) {
    const active = state.activePuzzle;
    if (!active) return;
    clearTimers();
    const endedAt = now();
    const record = {
      ...active.puzzle,
      moves: active.moves,
      path: [...active.path],
      ruleViolations: active.ruleViolations,
      resets: active.resets,
      completed,
      timedOut,
      planningTimeMs: active.firstMoveAt === null ? roundTime(endedAt - active.openedAt) : roundTime(active.firstMoveAt - active.openedAt),
      executionTimeMs: active.firstMoveAt === null ? 0 : roundTime(endedAt - active.firstMoveAt),
      totalTimeMs: roundTime(endedAt - active.openedAt),
      validForMetrics: true
    };
    storeRecord(record);
    state.activePuzzle = null;
    feedbackAndAdvance(completed, timedOut ? "Se agotó el tiempo de este recorrido." : `Ruta completada en ${record.moves} movimientos.`);
  }

  function showCurrentItem() {
    if (state.status !== "running") return;
    const item = state.currentSequence[state.currentIndex];
    if (!item) {
      finishPhase();
      return;
    }
    switch (taskId) {
      case "stop_signal": showStopTrial(item); break;
      case "task_switching": showSwitchTrial(item); break;
      case "temporal_estimation": showTemporalTrial(item); break;
      case "route_planning": showPlanningPuzzle(item); break;
      default: interrupt("unsupported_task");
    }
  }

  function beginPhase(practice) {
    state.currentPractice = practice;
    state.currentIndex = 0;
    state.runToken += 1;
    clearTimers();
    state.stopSignalDelayMs = definition.config.initialStopSignalDelayMs ?? null;
    state.currentSequence = taskId === "route_planning"
      ? (practice ? definition.practicePuzzles : definition.puzzles)
      : (practice ? definition.practiceTrials : definition.trials);
    logTechnicalEvent(practice ? "practice_started" : "main_started", { itemCount: state.currentSequence.length });
    showCurrentItem();
  }

  function beginRun() {
    if (state.status !== "ready") return;
    state.status = "running";
    state.startedAt = now();
    state.startedAtIso = new Date().toISOString();
    state.concentrationMode = true;
    root.dataset.concentration = "on";
    modeButton.textContent = "Salir de concentración";
    root.focus({ preventScroll: true });
    logTechnicalEvent("task_started", { randomSeed: definition.randomSeed, taskVersion: definition.taskVersion });
    beginPhase(true);
  }

  function toggleConcentrationMode() {
    state.concentrationMode = !state.concentrationMode;
    root.dataset.concentration = state.concentrationMode ? "on" : "off";
    modeButton.textContent = state.concentrationMode ? "Salir de concentración" : "Modo concentración";
    logTechnicalEvent("concentration_mode_changed", { enabled: state.concentrationMode });
    if (state.concentrationMode && root.requestFullscreen && documentRef.fullscreenElement !== root) {
      try {
        root.requestFullscreen({ navigationUI: "hide" })?.catch?.(() => {});
      } catch {
        // El modo concentrado visual permanece disponible aunque Fullscreen API no lo esté.
      }
    } else if (!state.concentrationMode && documentRef.fullscreenElement === root) {
      documentRef.exitFullscreen?.().catch?.(() => {});
    }
    root.focus({ preventScroll: true });
  }

  function onRootClick(event) {
    const actionTarget = event.target.closest?.("[data-action]");
    const responseTarget = event.target.closest?.("[data-response]");
    const temporalTarget = event.target.closest?.("[data-temporal-choice]");
    const directionTarget = event.target.closest?.("[data-direction]");
    if (responseTarget) {
      const response = responseTarget.dataset.response;
      if (taskId === "stop_signal") respondStopSignal(response);
      if (taskId === "task_switching") respondTaskSwitch(response);
      return;
    }
    if (temporalTarget) {
      answerTemporalEstimation(Number(temporalTarget.dataset.temporalChoice));
      return;
    }
    if (directionTarget) {
      movePlanning(directionTarget.dataset.direction);
      return;
    }
    const action = actionTarget?.dataset.action;
    if (action === "start") beginRun();
    if (action === "begin-main") beginPhase(false);
    if (action === "continue-block") showCurrentItem();
    if (action === "reproduction-toggle") toggleTemporalReproduction();
    if (action === "reset-puzzle") resetPlanningPuzzle();
    if (action === "concentration") toggleConcentrationMode();
    if (action === "restart") controller.restart();
  }

  function onKeyDown(event) {
    if (state.status !== "running" || event.repeat) return;
    const side = keyboardSide(event.key);
    if (side && ["stop_signal", "task_switching"].includes(taskId)) {
      event.preventDefault();
      if (taskId === "stop_signal") respondStopSignal(side);
      if (taskId === "task_switching") respondTaskSwitch(side);
      return;
    }
    if (taskId === "temporal_estimation" && state.activeTrial?.trial.mode === "estimation" && /^[123]$/.test(event.key)) {
      event.preventDefault();
      const choice = state.activeTrial.trial.choicesMs[Number(event.key) - 1];
      answerTemporalEstimation(choice);
      return;
    }
    if (taskId === "temporal_estimation" && state.activeTrial?.trial.mode === "reproduction" && [" ", "enter"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      toggleTemporalReproduction();
      return;
    }
    if (taskId === "route_planning") {
      const directionAliases = {
        arrowup: "up", w: "up",
        arrowright: "right", d: "right",
        arrowdown: "down", s: "down",
        arrowleft: "left", a: "left"
      };
      const direction = directionAliases[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        movePlanning(direction);
      }
    }
  }

  function visibilityHandler() {
    logTechnicalEvent("visibility_changed", { nextVisibilityState: documentRef.visibilityState });
    if (state.status === "running" && documentRef.visibilityState === "hidden") interrupt("visibility_hidden");
  }

  function blurHandler() {
    logTechnicalEvent("window_blur");
    if (state.status === "running") interrupt("window_blur");
  }

  function focusHandler() {
    logTechnicalEvent("window_focus");
  }

  function orientationHandler() {
    logTechnicalEvent("orientation_changed");
    if (state.status === "running") interrupt("orientation_change");
  }

  function fullscreenHandler() {
    logTechnicalEvent("fullscreen_changed", { active: documentRef.fullscreenElement === root });
  }

  listen(root, "click", onRootClick, undefined, false);
  listen(documentRef, "keydown", onKeyDown);
  listen(documentRef, "visibilitychange", visibilityHandler);
  listen(windowRef, "blur", blurHandler);
  listen(windowRef, "focus", focusHandler);
  listen(windowRef, "orientationchange", orientationHandler);
  listen(documentRef, "fullscreenchange", fullscreenHandler);

  render(`
    <p class="adhd-native-task__eyebrow">Forma ${definition.randomSeed}</p>
    <h2>${copy.title}</h2>
    <p class="adhd-native-task__lead">${copy.instruction}</p>
    <p class="adhd-native-task__lead">Primero realizarás una práctica no puntuada. La tarea se detendrá si la pestaña pierde visibilidad, foco u orientación.</p>
    <button class="adhd-native-task__button" type="button" data-action="start">Comenzar práctica</button>
    <div class="adhd-native-task__meta"><span>Teclado y pantalla táctil</span><span>Versión ${definition.taskVersion}</span></div>
  `);

  const controller = {
    taskId,
    taskVersion: definition.taskVersion,
    randomSeed: definition.randomSeed,
    result,
    then(onFulfilled, onRejected) {
      return result.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return result.catch(onRejected);
    },
    finally(onFinally) {
      return result.finally(onFinally);
    },
    interrupt,
    restart() {
      controller.destroy({ clearContainer: false });
      return runNativeAdhdTask({
        taskId,
        container: resolvedContainer,
        seed: definition.randomSeed,
        ageMode: definition.ageMode,
        config: definition.config,
        onComplete,
        onInterrupt
      });
    },
    getState() {
      return {
        status: state.status,
        taskId,
        taskVersion: definition.taskVersion,
        randomSeed: definition.randomSeed,
        ageMode: definition.ageMode,
        practice: state.currentPractice,
        currentIndex: state.currentIndex,
        itemCount: state.currentSequence.length,
        concentrationMode: state.concentrationMode,
        practiceRecords: state.practiceRecords.length,
        mainRecords: state.mainRecords.length,
        technicalEvents: state.technicalEvents.length
      };
    },
    destroy({ clearContainer = true } = {}) {
      if (state.destroyed) return;
      if (!state.settled) interrupt(state.status === "running" ? "destroyed" : "destroyed_before_start");
      state.destroyed = true;
      state.runToken += 1;
      clearTimers();
      cleanupExternalListeners();
      while (rootCleanups.length) rootCleanups.pop()();
      if (documentRef.fullscreenElement === root) documentRef.exitFullscreen?.().catch?.(() => {});
      if (clearContainer && root.parentNode === resolvedContainer) resolvedContainer.replaceChildren();
    }
  };

  return controller;
}
