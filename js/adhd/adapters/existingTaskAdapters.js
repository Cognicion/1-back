import {
  ADHD_METRICS_ENGINE_VERSION,
  ADHD_PERSISTENCE_SCHEMA_VERSION,
  ADHD_TASK_CATALOG
} from "../config/adhdProtocol.js";

const TASK_ALIASES = Object.freeze({
  cpt: "cpt_x",
  cpt_x: "cpt_x",
  "cpt-x": "cpt_x",
  go_nogo: "go_nogo",
  "go-nogo": "go_nogo",
  gonogo: "go_nogo",
  n_back: "nback",
  "n-back": "nback",
  nback: "nback",
  stroop: "stroop",
  escucha_dicotica: "dichotic_listening",
  "escucha-dicotica": "dichotic_listening",
  dichotic: "dichotic_listening",
  dichotic_listening: "dichotic_listening"
});

export const ADHD_TASK_BRIDGE_BOOTSTRAP_PREFIX = "cognicion-adhd-bridge:";
const SAFE_BRIDGE_TOKEN = /^[a-zA-Z0-9_-]{8,160}$/u;

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sum(values) {
  return values.reduce((total, value) => total + (number(value, 0) || 0), 0);
}

function mean(values) {
  const clean = values.map((value) => number(value)).filter(Number.isFinite);
  return clean.length ? sum(clean) / clean.length : null;
}

function standardDeviation(values) {
  const clean = values.map((value) => number(value)).filter(Number.isFinite);
  if (clean.length < 2) return 0;
  const average = mean(clean);
  return Math.sqrt(sum(clean.map((value) => (value - average) ** 2)) / clean.length);
}

function ratio(value, denominator = null) {
  const numeric = number(value);
  if (!Number.isFinite(numeric)) return null;
  if (Number.isFinite(denominator)) return denominator > 0 ? numeric / denominator : null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function balancedRate(first, second) {
  const firstRate = ratio(first);
  const secondRate = ratio(second);
  return Number.isFinite(firstRate) && Number.isFinite(secondRate)
    ? (firstRate + secondRate) / 2
    : null;
}

function reactionTime(values, explicit = {}) {
  const clean = values.map((value) => number(value)).filter((value) => Number.isFinite(value) && value >= 0);
  const meanMs = number(explicit.meanMs ?? explicit.averageReactionTime ?? explicit.averageReactionTimeMs, mean(clean));
  const standardDeviationMs = number(
    explicit.standardDeviationMs ?? explicit.sdMs ?? explicit.reactionTimeVariability,
    standardDeviation(clean)
  );
  const sorted = clean.toSorted((a, b) => a - b);
  const medianMs = number(explicit.medianMs, sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : null);
  return {
    meanMs,
    medianMs,
    standardDeviationMs,
    coefficientOfVariation: Number.isFinite(meanMs) && meanMs > 0 && Number.isFinite(standardDeviationMs)
      ? standardDeviationMs / meanMs
      : null,
    minimumMs: number(explicit.minimumMs, sorted.at(0) ?? null),
    maximumMs: number(explicit.maximumMs, sorted.at(-1) ?? null),
    sampleSize: clean.length
  };
}

// Aproximación de Acklam, suficiente para la normalización descriptiva d-prime.
function inverseNormal(probability) {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, probability));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function dPrime(hits, targets, falseAlarms, nonTargets) {
  if (!(targets > 0) || !(nonTargets > 0)) return null;
  const hitRate = (hits + 0.5) / (targets + 1);
  const falseAlarmRate = (falseAlarms + 0.5) / (nonTargets + 1);
  return inverseNormal(hitRate) - inverseNormal(falseAlarmRate);
}

function normalizeTaskId(value) {
  const id = String(value || "").trim().toLowerCase().replace(/\s+/gu, "_");
  const normalized = TASK_ALIASES[id] || id;
  const definition = ADHD_TASK_CATALOG[normalized];
  if (!definition || definition.kind !== "existing") throw new TypeError(`Tarea existente no compatible: ${value}`);
  return normalized;
}

function temporalChange(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length < 2) return null;
  const blockAccuracy = (block) => {
    const total = number(block.totalTrials ?? block.trials);
    const correct = number(block.correct ?? block.correctResponses, null)
      ?? sum([block.hits, block.correctRejections]);
    return ratio(block.accuracy ?? block.accuracyPercentage) ?? (total > 0 ? correct / total : null);
  };
  const first = blockAccuracy(blocks[0]);
  const last = blockAccuracy(blocks.at(-1));
  return Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
}

function commonEnvelope(taskId, payload, metrics, context = {}, telemetry = {}) {
  const definition = ADHD_TASK_CATALOG[taskId];
  const interruptions = payload.interruptions || [];
  const practice = payload.practice === true || payload.modoPractica === true;
  const completed = payload.status !== "cancelled" && payload.status !== "stopped";
  const valid = payload.valid ?? payload.quality?.valid ?? (completed && !practice && number(metrics.totalTrials, 0) > 0);
  return {
    persistenceSchemaVersion: ADHD_PERSISTENCE_SCHEMA_VERSION,
    metricsEngineVersion: ADHD_METRICS_ENGINE_VERSION,
    taskId,
    taskVersion: String(payload.taskVersion || payload.activityVersion || definition.taskVersion),
    sourceTaskId: String(payload.activityId || payload.module || taskId),
    status: completed ? "completed" : "cancelled",
    valid: Boolean(valid),
    mode: payload.modality || payload.sessionMode || payload.difficulty || context.mode || "standard",
    attemptId: context.attemptId || payload.attemptId || payload.sessionId || null,
    startedAtIso: payload.startedAtIso || payload.startedAt || null,
    completedAtIso: payload.completedAtIso || payload.createdAtIso || payload.date || new Date().toISOString(),
    durationMs: number(payload.durationMs, number(payload.duration, 0) * 1000),
    configuration: payload.configuration || context.configuration || {},
    randomSeed: payload.randomSeed ?? context.randomSeed ?? null,
    metrics,
    quality: {
      valid: Boolean(valid),
      practice,
      interruptionCount: Array.isArray(interruptions) ? interruptions.length : 0,
      technicalFailureCount: number(payload.technicalFailureCount, 0),
      flags: Array.isArray(payload.quality?.flags) ? payload.quality.flags : []
    },
    context: {
      programId: context.programId || null,
      sessionId: context.sessionId || null,
      evaluationId: context.evaluationId || null,
      goalId: context.goalId || null,
      challengeId: context.challengeId || null
    },
    telemetry
  };
}

function normalizeCpt(payload, context) {
  const raw = payload.results || payload.metrics || payload;
  const trials = payload.trialHistory || payload.trials || [];
  const hits = number(raw.hits, 0);
  const misses = number(raw.misses, 0);
  const falseAlarms = number(raw.falseAlarms, 0);
  const correctRejections = number(raw.correctRejections, 0);
  const targets = number(raw.totalTargets, hits + misses);
  const nonTargets = number(raw.totalNonTargets, falseAlarms + correctRejections);
  const hitRts = trials.filter((trial) => trial.responseType === "hit").map((trial) => trial.reactionTimeMs);
  const hitRate = ratio(raw.hitRate ?? raw.hitPercentage) ?? ratio(hits, targets);
  const falseAlarmRate = ratio(raw.falseAlarmRate ?? raw.falseAlarmPercentage) ?? ratio(falseAlarms, nonTargets);
  const correctRejectionRate = ratio(raw.correctRejectionRate ?? raw.correctRejectionPercentage)
    ?? (Number.isFinite(falseAlarmRate) ? 1 - falseAlarmRate : ratio(correctRejections, nonTargets));
  const balancedAccuracy = ratio(raw.balancedAccuracy)
    ?? balancedRate(hitRate, correctRejectionRate);
  const metrics = {
    totalTrials: number(raw.totalTrials, trials.length || targets + nonTargets),
    targets,
    nonTargets,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate,
    omissionRate: ratio(misses, targets),
    missRate: ratio(misses, targets),
    falseAlarmRate,
    correctRejectionRate,
    balancedAccuracy,
    accuracy: ratio(raw.accuracy ?? raw.accuracyPercentage)
      ?? ratio(hits + correctRejections, targets + nonTargets),
    dPrime: number(raw.dPrime, dPrime(hits, targets, falseAlarms, nonTargets)),
    responseCriterion: number(raw.responseCriterion),
    anticipatoryResponses: number(raw.anticipatoryResponses, 0),
    invalidResponses: number(raw.invalidResponses, 0),
    reactionTime: reactionTime(hitRts, {
      meanMs: raw.meanHitReactionTimeMs,
      medianMs: raw.medianHitReactionTimeMs,
      standardDeviationMs: raw.sdHitReactionTimeMs ?? raw.reactionTimeVariabilityMs,
      minimumMs: raw.minHitReactionTimeMs,
      maximumMs: raw.maxHitReactionTimeMs
    }),
    temporal: { accuracyChange: temporalChange(raw.blockResults || payload.blockResults) },
    blockResults: raw.blockResults || payload.blockResults || []
  };
  return commonEnvelope("cpt_x", payload, metrics, context, {
    trials,
    sequence: payload.sequence || [],
    events: payload.interruptions || []
  });
}

function normalizeGoNoGo(payload, context) {
  const raw = payload.results || payload.metrics || payload;
  const trials = payload.trialHistory || payload.trials || [];
  const goTrials = number(raw.goTrials, 0);
  const noGoTrials = number(raw.noGoTrials, 0);
  const omissions = number(raw.omissions, 0);
  const commissions = number(raw.commissionErrors, 0);
  const correctGo = number(raw.correctGo ?? raw.goHits, Math.max(0, goTrials - omissions));
  const correctInhibitions = number(raw.correctInhibitions, Math.max(0, noGoTrials - commissions));
  const omissionRate = ratio(raw.omissionRate) ?? ratio(omissions, goTrials);
  const commissionRate = ratio(raw.commissionRate) ?? ratio(commissions, noGoTrials);
  const goHitRate = ratio(raw.goHitRate)
    ?? (Number.isFinite(omissionRate) ? 1 - omissionRate : ratio(correctGo, goTrials));
  const correctInhibitionRate = ratio(raw.correctInhibitionRate)
    ?? (Number.isFinite(commissionRate) ? 1 - commissionRate : ratio(correctInhibitions, noGoTrials));
  const balancedAccuracy = ratio(raw.balancedAccuracy)
    ?? balancedRate(goHitRate, correctInhibitionRate);
  const correctGoTrials = trials.filter((trial) => (
    trial.resultado === "acierto_go"
    || trial.responseType === "hit"
    || (trial.tipo === "go" && trial.correcta === true)
  ));
  const rts = correctGoTrials.map((trial) => trial.rt ?? trial.reactionTimeMs).filter(Number.isFinite);
  const legacyRtSummary = trials.length ? {} : {
    meanMs: raw.averageReactionTime,
    standardDeviationMs: raw.reactionTimeVariability,
    minimumMs: raw.minimumReactionTime,
    maximumMs: raw.maximumReactionTime
  };
  const metrics = {
    totalTrials: number(raw.totalTrials, trials.length || goTrials + noGoTrials),
    goTrials,
    noGoTrials,
    correctGo,
    correctInhibitions,
    omissions,
    commissionErrors: commissions,
    omissionRate,
    commissionRate,
    goHitRate,
    correctInhibitionRate,
    balancedAccuracy,
    accuracy: ratio(raw.accuracy)
      ?? ratio(correctGo + correctInhibitions, goTrials + noGoTrials),
    goReactionTime: reactionTime(rts, legacyRtSummary),
    postErrorSlowingMs: number(raw.postErrorSlowingMs),
    temporal: { accuracyChange: temporalChange(raw.blockResults || payload.blockResults) }
  };
  return commonEnvelope("go_nogo", payload, metrics, context, { trials, events: payload.interruptions || [] });
}

function normalizeNBack(payload, context) {
  const raw = payload.results || payload.metrics || payload;
  const audio = raw.audio || raw.sound || {};
  const visual = raw.visual || raw.position || {};
  const hits = number(raw.hits, sum([audio.hits ?? audio.correct ?? raw.audioAciertos, visual.hits ?? visual.correct ?? raw.visualAciertos]));
  const falseAlarms = number(raw.falseAlarms, sum([audio.falseAlarms ?? audio.commissionErrors ?? raw.audioComision, visual.falseAlarms ?? visual.commissionErrors ?? raw.visualComision]));
  const misses = number(raw.misses, sum([audio.misses ?? audio.omissions ?? raw.audioOmision, visual.misses ?? visual.omissions ?? raw.visualOmision]));
  const correctRejections = number(raw.correctRejections, sum([
    audio.correctRejections ?? raw.audioRechazosCorrectos,
    visual.correctRejections ?? raw.visualRechazosCorrectos
  ]));
  const targets = number(raw.targets, hits + misses);
  const nonTargets = number(raw.nonTargets, falseAlarms + correctRejections);
  const trials = payload.trialHistory || payload.trials || [];
  const rts = [
    ...(raw.audioReactionTimes || raw.trAudio || audio.reactionTimes || []),
    ...(raw.visualReactionTimes || raw.trVisual || visual.reactionTimes || []),
    ...trials.map((trial) => trial.reactionTimeMs ?? trial.rt)
  ];
  const metrics = {
    totalTrials: number(raw.totalTrials ?? raw.completedTrials, trials.length || targets + nonTargets),
    hits,
    falseAlarms,
    misses,
    correctRejections,
    hitRate: ratio(hits, targets),
    falseAlarmRate: ratio(falseAlarms, nonTargets),
    accuracy: ratio(raw.accuracy) ?? ratio(hits + correctRejections, targets + nonTargets),
    dPrime: number(raw.dPrime, dPrime(hits, targets, falseAlarms, nonTargets)),
    administeredLevel: number(raw.administeredLevel ?? raw.level ?? raw.nivel ?? payload.level ?? payload.nivel),
    maximumStableLevel: number(raw.maximumStableLevel),
    reactionTime: reactionTime(rts, raw.reactionTime || {})
  };
  return commonEnvelope("nback", payload, metrics, context, {
    trials,
    sequence: payload.sequence || payload.secuencia || []
  });
}

function groupStats(trials, congruent) {
  const group = trials.filter((trial) => Boolean(trial.isCongruent) === congruent);
  const correct = group.filter((trial) => trial.isCorrect).length;
  return {
    totalTrials: group.length,
    correct,
    accuracy: ratio(correct, group.length),
    reactionTime: reactionTime(group.filter((trial) => trial.isCorrect).map((trial) => trial.reactionTime ?? trial.reactionTimeMs))
  };
}

function normalizeStroop(payload, context) {
  const raw = payload.results || payload.metrics || payload;
  const trials = payload.trials || payload.trialHistory || raw.trials || [];
  const congruent = groupStats(trials, true);
  const incongruent = groupStats(trials, false);
  const metrics = {
    totalTrials: number(raw.totalTrials, trials.length),
    correct: number(raw.correct, trials.filter((trial) => trial.isCorrect).length),
    incorrect: number(raw.incorrect, trials.filter((trial) => !trial.isCorrect).length),
    accuracy: ratio(raw.accuracy),
    reactionTime: reactionTime(
      trials.filter((trial) => trial.isCorrect).map((trial) => trial.reactionTime),
      trials.length ? {} : {
        meanMs: raw.averageReactionTime,
        standardDeviationMs: raw.reactionTimeVariability
      }
    ),
    congruent,
    incongruent,
    congruentReactionTime: congruent.reactionTime,
    incongruentReactionTime: incongruent.reactionTime,
    congruentAccuracy: congruent.accuracy,
    incongruentAccuracy: incongruent.accuracy,
    interferenceCostMs: Number.isFinite(congruent.reactionTime.meanMs) && Number.isFinite(incongruent.reactionTime.meanMs)
      ? incongruent.reactionTime.meanMs - congruent.reactionTime.meanMs
      : number(raw.interferenceCostMs)
  };
  return commonEnvelope("stroop", payload, metrics, context, { trials });
}

function normalizeDichotic(payload, context) {
  const raw = payload.results || payload.metrics || payload;
  const trials = payload.trialHistory || payload.trials || [];
  const totalTrials = number(raw.totalTrials, trials.length);
  const correct = number(raw.correctResponses, trials.filter((trial) => trial.isCorrect).length);
  const technicalFailures = number(raw.technicalFailures, 0);
  const metrics = {
    totalTrials,
    correctResponses: correct,
    incorrectResponses: number(raw.incorrectResponses ?? raw.totalErrors, Math.max(0, totalTrials - correct)),
    leftEarIntrusions: number(raw.leftEarIntrusions, 0),
    nonPresentedWords: number(raw.nonPresentedWords, 0),
    omissions: number(raw.omissions, 0),
    unintelligibleResponses: number(raw.unintelligibleResponses, 0),
    technicalFailures,
    accuracy: ratio(raw.accuracy ?? raw.accuracyPercentage) ?? ratio(correct, totalTrials),
    reactionTime: reactionTime(trials.map((trial) => trial.reactionTime ?? trial.responseLatencyMs), {
      meanMs: raw.meanResponseTimeMs
    }),
    blockResults: raw.blockResults || payload.blockResults || []
  };
  const normalized = commonEnvelope("dichotic_listening", {
    ...payload,
    valid: payload.valid ?? (payload.sessionMode !== "demo_technical" && payload.practice !== true && totalTrials > 0),
    technicalFailureCount: technicalFailures
  }, metrics, context, {
    trials,
    events: [...(payload.breaks || []), ...(payload.interruptions || []), ...(payload.researchEvents || [])]
  });
  normalized.quality.corpus = {
    corpusId: payload.corpusId || null,
    corpusVersion: payload.corpusVersion || null,
    clinicallyValidated: payload.clinicallyValidated === true,
    authorizedMaterial: payload.authorizedMaterial === true
  };
  return normalized;
}

export function normalizeExistingTaskResult(taskId, payload = {}, context = {}) {
  const normalizedTaskId = normalizeTaskId(taskId || payload.taskId || payload.activityId || payload.module);
  const adapters = {
    cpt_x: normalizeCpt,
    go_nogo: normalizeGoNoGo,
    nback: normalizeNBack,
    stroop: normalizeStroop,
    dichotic_listening: normalizeDichotic
  };
  return adapters[normalizedTaskId](payload, context);
}

function randomToken() {
  return globalThis.crypto?.randomUUID?.().replace(/-/gu, "")
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function createTaskLaunchContext(taskId, context = {}) {
  const normalizedTaskId = normalizeTaskId(taskId);
  return Object.freeze({
    taskId: normalizedTaskId,
    taskVersion: ADHD_TASK_CATALOG[normalizedTaskId].taskVersion,
    programId: context.programId || null,
    sessionId: context.sessionId || null,
    evaluationId: context.evaluationId || null,
    goalId: context.goalId || null,
    challengeId: context.challengeId || null,
    attemptId: context.attemptId || randomToken(),
    patientId: context.patientId || null,
    mode: context.mode || "program",
    randomSeed: context.randomSeed ?? null,
    configuration: context.configuration || {},
    bridgeToken: context.bridgeToken || randomToken()
  });
}

export function buildExistingTaskUrl(taskId, context = {}, baseUrl = globalThis.location?.href || "http://localhost/") {
  const launchContext = context.bridgeToken ? { ...context, taskId: normalizeTaskId(taskId) } : createTaskLaunchContext(taskId, context);
  const definition = ADHD_TASK_CATALOG[launchContext.taskId];
  const base = new URL(baseUrl);
  const target = new URL(definition.url, base);
  if (target.origin !== base.origin) throw new TypeError("La tarea TDAH debe ejecutarse en el mismo origen.");
  const parameters = {
    adhd: "1",
    embed: "1",
    adhdTask: launchContext.taskId
  };
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && String(value)) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

export function buildExistingTaskBootstrapName(context = {}) {
  const token = String(context.bridgeToken || "");
  if (!SAFE_BRIDGE_TOKEN.test(token)) throw new TypeError("bridgeToken TDAH ausente o inválido.");
  return `${ADHD_TASK_BRIDGE_BOOTSTRAP_PREFIX}${token}`;
}

export function parseExistingTaskContext(
  url = globalThis.location?.href || "http://localhost/",
  bootstrapName = globalThis.name || ""
) {
  const target = new URL(url);
  if (target.searchParams.get("adhd") !== "1") return null;
  const taskId = normalizeTaskId(target.searchParams.get("adhdTask"));
  const rawBootstrap = String(bootstrapName || "");
  const bridgeToken = rawBootstrap.startsWith(ADHD_TASK_BRIDGE_BOOTSTRAP_PREFIX)
    ? rawBootstrap.slice(ADHD_TASK_BRIDGE_BOOTSTRAP_PREFIX.length)
    : null;
  return Object.freeze({
    taskId,
    taskVersion: ADHD_TASK_CATALOG[taskId].taskVersion,
    programId: null,
    sessionId: null,
    evaluationId: null,
    goalId: null,
    challengeId: null,
    attemptId: null,
    patientId: null,
    mode: "program",
    randomSeed: null,
    configuration: {},
    bridgeToken
  });
}

export const normalizarResultadoTareaExistente = normalizeExistingTaskResult;
export const crearContextoLanzamientoTarea = createTaskLaunchContext;
export const construirUrlTareaExistente = buildExistingTaskUrl;
