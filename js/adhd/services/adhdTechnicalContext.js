const TECHNICAL_CONTEXT_VERSION = "1.0.0";

export { TECHNICAL_CONTEXT_VERSION };

export function detectDeviceContext(environment = globalThis) {
  const navigatorObject = environment.navigator || {};
  const screenObject = environment.screen || {};
  const userAgent = String(navigatorObject.userAgent || "");
  const coarsePointer = environment.matchMedia?.("(pointer: coarse)")?.matches === true;
  const touchPoints = Number(navigatorObject.maxTouchPoints || 0);
  const shortestSide = Math.min(Number(screenObject.width) || 0, Number(screenObject.height) || 0);
  const deviceClass = shortestSide && shortestSide < 600
    ? "phone"
    : shortestSide && shortestSide < 1024
      ? "tablet"
      : "desktop";
  return {
    technicalContextVersion: TECHNICAL_CONTEXT_VERSION,
    browser: detectBrowser(userAgent),
    deviceClass,
    inputMode: coarsePointer || touchPoints > 0 ? (navigatorObject.keyboard ? "touch_and_keyboard" : "touch") : "keyboard",
    touchPoints,
    viewport: {
      width: Number(environment.innerWidth) || null,
      height: Number(environment.innerHeight) || null,
      devicePixelRatio: Number(environment.devicePixelRatio) || 1
    },
    orientation: readOrientation(screenObject, environment)
  };
}

export async function estimateRefreshRate(environment = globalThis, samples = 30) {
  if (typeof environment.requestAnimationFrame !== "function") return null;
  const timestamps = [];
  await new Promise((resolve) => {
    const collect = (timestamp) => {
      timestamps.push(timestamp);
      if (timestamps.length >= Math.max(8, Number(samples) || 30)) {
        resolve();
        return;
      }
      environment.requestAnimationFrame(collect);
    };
    environment.requestAnimationFrame(collect);
  });
  const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index]).filter((value) => value > 0 && value < 100);
  if (!intervals.length) return null;
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const medianInterval = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  return Math.round((1000 / medianInterval) * 10) / 10;
}

export function createTechnicalMonitor(options = {}) {
  const environment = options.environment || globalThis;
  const documentObject = options.document || environment.document;
  const performanceObject = options.performance || environment.performance;
  const events = [];
  const startedAt = Number(performanceObject?.now?.() ?? 0);
  let active = false;
  let pauseStartedAt = null;
  let totalPausedMs = 0;
  let refreshRateHz = null;

  const record = (type, detail = {}) => {
    const relativeTimeMs = Math.max(0, Number(performanceObject?.now?.() ?? 0) - startedAt);
    events.push({ type, relativeTimeMs: Math.round(relativeTimeMs), ...sanitizeEventDetail(detail) });
    if (events.length > 500) events.splice(0, events.length - 500);
  };

  const handlers = {
    visibilitychange: () => record(documentObject?.hidden ? "visibility_hidden" : "visibility_visible", {
      visibilityState: documentObject?.visibilityState
    }),
    blur: () => record("window_blur"),
    focus: () => record("window_focus"),
    orientationchange: () => record("orientation_change", {
      orientation: readOrientation(environment.screen || {}, environment)
    }),
    pagehide: () => record("page_hide"),
    freeze: () => record("page_freeze")
  };

  return {
    async start() {
      if (active) return this.getSnapshot();
      active = true;
      documentObject?.addEventListener?.("visibilitychange", handlers.visibilitychange);
      environment.addEventListener?.("blur", handlers.blur);
      environment.addEventListener?.("focus", handlers.focus);
      environment.addEventListener?.("orientationchange", handlers.orientationchange);
      environment.addEventListener?.("pagehide", handlers.pagehide);
      documentObject?.addEventListener?.("freeze", handlers.freeze);
      record("monitor_started");
      refreshRateHz = await estimateRefreshRate(environment).catch(() => null);
      return this.getSnapshot();
    },
    stop() {
      if (!active) return this.getSnapshot();
      if (pauseStartedAt !== null) this.resume("monitor_stopped");
      active = false;
      documentObject?.removeEventListener?.("visibilitychange", handlers.visibilitychange);
      environment.removeEventListener?.("blur", handlers.blur);
      environment.removeEventListener?.("focus", handlers.focus);
      environment.removeEventListener?.("orientationchange", handlers.orientationchange);
      environment.removeEventListener?.("pagehide", handlers.pagehide);
      documentObject?.removeEventListener?.("freeze", handlers.freeze);
      record("monitor_stopped");
      return this.getSnapshot();
    },
    pause(reason = "user_pause") {
      if (pauseStartedAt !== null) return;
      pauseStartedAt = Number(performanceObject?.now?.() ?? 0);
      record("pause_started", { reason });
    },
    resume(reason = "user_resume") {
      if (pauseStartedAt === null) return;
      totalPausedMs += Math.max(0, Number(performanceObject?.now?.() ?? 0) - pauseStartedAt);
      pauseStartedAt = null;
      record("pause_ended", { reason });
    },
    markInterruption(reason, detail = {}) {
      record("interruption", { reason, ...detail });
    },
    markBlock(blockId, status) {
      record("block_state", { blockId, status });
    },
    getSnapshot() {
      const base = detectDeviceContext(environment);
      return {
        ...base,
        refreshRateHz,
        active,
        durationMs: Math.max(0, Math.round(Number(performanceObject?.now?.() ?? 0) - startedAt)),
        totalPausedMs: Math.round(totalPausedMs),
        focusLosses: events.filter((event) => event.type === "window_blur").length,
        visibilityLosses: events.filter((event) => event.type === "visibility_hidden").length,
        orientationChanges: events.filter((event) => event.type === "orientation_change").length,
        interruptions: events.filter((event) => event.type === "interruption").length,
        events: events.map((event) => ({ ...event }))
      };
    }
  };
}

export function normalizeAssessmentContext(input = {}, technical = {}) {
  return {
    contextVersion: "1.0.0",
    age: finiteOrNull(input.age),
    laterality: clean(input.laterality, 40),
    sleepHours: finiteOrNull(input.sleepHours),
    sleepQuality: finiteOrNull(input.sleepQuality),
    assessmentTime: clean(input.assessmentTime || new Date().toISOString(), 64),
    recentCaffeine: Boolean(input.recentCaffeine),
    adhdMedication: clean(input.adhdMedication, 160),
    lastDoseTime: clean(input.lastDoseTime, 40),
    recentTreatmentChanges: Boolean(input.recentTreatmentChanges),
    fatigue: finiteOrNull(input.fatigue),
    motivation: finiteOrNull(input.motivation),
    environmentalDistractibility: finiteOrNull(input.environmentalDistractibility),
    visualProblems: Boolean(input.visualProblems),
    auditoryProblems: Boolean(input.auditoryProblems),
    deviceClass: clean(technical.deviceClass || input.deviceClass, 32),
    inputMode: clean(technical.inputMode || input.inputMode, 32),
    browser: clean(technical.browser || input.browser, 80),
    refreshRateHz: finiteOrNull(technical.refreshRateHz),
    focusLosses: finiteOrNull(technical.focusLosses),
    visibilityLosses: finiteOrNull(technical.visibilityLosses),
    interruptions: clean(input.interruptions, 500)
  };
}

function detectBrowser(userAgent) {
  const rules = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/CriOS\/([\d.]+)/, "Chrome iOS"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/FxiOS\/([\d.]+)/, "Firefox iOS"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari/, "Safari"]
  ];
  for (const [pattern, name] of rules) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return "Navegador no identificado";
}

function readOrientation(screenObject, environment) {
  return String(screenObject.orientation?.type || (Number(environment.innerWidth) > Number(environment.innerHeight) ? "landscape" : "portrait"));
}

function sanitizeEventDetail(detail = {}) {
  const output = {};
  for (const [key, value] of Object.entries(detail)) {
    if (["reason", "blockId", "status", "visibilityState", "orientation"].includes(key)) output[key] = clean(value, 120);
  }
  return output;
}

function clean(value, maximum) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
