import { ADHD_FUNCTIONAL_DIFFICULTIES, ADHD_TRANSFER_CHALLENGES } from "../config/adhdProtocol.js";
import { createSeededRandom, round } from "../core/statistics.js";

export const ADHD_FUNCTIONAL_SERVICE_VERSION = "1.1.0";
export const ADHD_FUNCTIONAL_PROGRESS_SOURCES = Object.freeze(["patient", "caregiver", "clinician", "teacher"]);
export const ADHD_FUNCTIONAL_PROGRESS_STATUSES = Object.freeze(["achieved", "partial", "not_achieved", "not_observed"]);

export function normalizeFunctionalGoal(input = {}, index = 0) {
  const action = clean(input.action || input.text || input.label, 240);
  const context = clean(input.context, 160);
  const frequency = clean(input.frequency, 120);
  const target = clean(input.target, 180);
  const reviewDate = normalizeDate(input.reviewDate);
  const difficulty = ADHD_FUNCTIONAL_DIFFICULTIES.find((item) => item.id === input.difficultyId);
  return {
    id: clean(input.id, 80) || `goal-${index + 1}`,
    action,
    context,
    frequency,
    target,
    reviewDate,
    difficultyId: difficulty?.id || "",
    domains: normalizeDomains(input.domains, difficulty?.domains),
    active: input.active !== false,
    createdAt: clean(input.createdAt, 40) || new Date().toISOString(),
    reviewSource: normalizeSource(input.reviewSource),
    progress: normalizeFunctionalProgress(input.progress)
  };
}

export function validateFunctionalGoal(goal = {}) {
  const normalized = normalizeFunctionalGoal(goal);
  const errors = [];
  if (!normalized.action) errors.push("goal_action_required");
  if (!normalized.context) errors.push("goal_context_required");
  if (!normalized.frequency) errors.push("goal_frequency_required");
  if (!normalized.target) errors.push("goal_target_required");
  if (!normalized.reviewDate) errors.push("goal_review_date_required");
  return { valid: errors.length === 0, errors, goal: normalized };
}

export function renderFunctionalGoalText(goal = {}) {
  const normalized = normalizeFunctionalGoal(goal);
  return [normalized.action, normalized.context && `en ${normalized.context}`, normalized.frequency, normalized.target && `con meta: ${normalized.target}`]
    .filter(Boolean)
    .join(" · ");
}

export function selectFunctionalGoal({ goal = null, goals = [], goalId = "", domains = [] } = {}) {
  const requestedId = clean(goalId, 80);
  const candidates = uniqueGoals([goal, ...(Array.isArray(goals) ? goals : [])])
    .map((candidate, index) => validateFunctionalGoal(normalizeFunctionalGoal(candidate, index)))
    .filter((result) => result.valid && result.goal.active !== false)
    .map((result) => result.goal);
  if (!candidates.length) return null;
  if (requestedId) return candidates.find((candidate) => candidate.id === requestedId) || null;

  const requestedDomains = new Set(normalizeDomains(domains));
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      overlap: candidate.domains.filter((domain) => requestedDomains.has(domain)).length
    }))
    .sort((left, right) => right.overlap - left.overlap || left.index - right.index)[0]?.candidate || null;
}

export function createTransferChallenge({
  sessionNumber = 1,
  domains = [],
  ageMode = "adult",
  seed = 1,
  dueDate = "",
  goal = null,
  goals = [],
  goalId = "",
  context = ""
} = {}) {
  const normalizedDomains = normalizeDomains(domains);
  const matching = ADHD_TRANSFER_CHALLENGES.filter((challenge) => !normalizedDomains.length || challenge.domains.some((domain) => normalizedDomains.includes(domain)));
  const pool = matching.length ? matching : ADHD_TRANSFER_CHALLENGES;
  const random = createSeededRandom(Number(seed) + Number(sessionNumber));
  const template = pool[Math.floor(random() * pool.length)] || ADHD_TRANSFER_CHALLENGES[0];
  const requestedGoalId = clean(goalId, 80);
  const fallbackGoal = goal && typeof goal === "object" && (!requestedGoalId || clean(goal.id, 80) === requestedGoalId)
    ? goal
    : null;
  const selectedGoal = selectFunctionalGoal({ goal, goals, goalId: requestedGoalId, domains: normalizedDomains }) || fallbackGoal;
  const challenge = {
    id: `transfer-${sessionNumber}-${template.id}`,
    templateId: template.id,
    sessionNumber: finiteNonNegativeInteger(sessionNumber) || 1,
    label: adaptChallengeLabel(template.label, ageMode),
    domains: [...template.domains],
    ageMode: ["pediatric", "adolescent", "adult"].includes(ageMode) ? ageMode : "adult",
    dueDate: normalizeDate(dueDate),
    status: "pending",
    note: "",
    ratings: {},
    sourceReports: [],
    createdAt: new Date().toISOString(),
    completedAt: null
  };
  return linkTransferChallengeToGoal(challenge, selectedGoal, { context });
}

export function linkTransferChallengeToGoal(challenge = {}, goal = null, { context = "" } = {}) {
  const validation = goal ? validateFunctionalGoal(goal) : { valid: false, errors: ["smart_goal_required"], goal: null };
  const requestedContext = clean(context, 160);
  if (!validation.valid) {
    return {
      ...challenge,
      linkedGoalId: "",
      linkedGoalIds: [],
      goalSnapshot: null,
      applicationContext: requestedContext,
      applicationPrompt: requestedContext
        ? `Realiza el reto en ${requestedContext} y registra el resultado; vincúlalo a un objetivo funcional antes de interpretar progreso.`
        : "Selecciona un objetivo funcional SMART antes de usar este reto como indicador de progreso.",
      goalBinding: {
        status: "unlinked",
        reason: validation.errors[0] || "smart_goal_required",
        errors: [...validation.errors]
      }
    };
  }

  const normalizedGoal = validation.goal;
  const applicationContext = requestedContext || normalizedGoal.context;
  const goalSnapshot = {
    id: normalizedGoal.id,
    action: normalizedGoal.action,
    context: normalizedGoal.context,
    frequency: normalizedGoal.frequency,
    target: normalizedGoal.target,
    reviewDate: normalizedGoal.reviewDate,
    reviewSource: normalizedGoal.reviewSource
  };
  return {
    ...challenge,
    linkedGoalId: normalizedGoal.id,
    linkedGoalIds: [normalizedGoal.id],
    goalSnapshot,
    applicationContext,
    applicationPrompt: `Aplica este reto a “${normalizedGoal.action}” en ${applicationContext}. Registra si avanzaste hacia la meta: ${normalizedGoal.target}.`,
    goalBinding: {
      status: "linked",
      goalId: normalizedGoal.id,
      contextSource: requestedContext ? "session" : "goal",
      linkedAt: new Date().toISOString(),
      errors: []
    }
  };
}

export function recordTransferOutcome(challenge = {}, outcome = {}) {
  const status = ["completed", "partial", "not_completed"].includes(outcome.status) ? outcome.status : "pending";
  const completedAt = status === "pending" ? null : clean(outcome.completedAt, 40) || new Date().toISOString();
  const ratings = normalizeRatings(outcome.ratings);
  const sourceReportInput = outcome.sourceReports ?? outcome.progressBySource ?? Object.entries(ratings).map(([source, achievement]) => ({
    source,
    achievement,
    status
  }));
  const sourceReports = normalizeFunctionalSourceReports(sourceReportInput, {
    challengeId: challenge.id,
    goalId: challenge.linkedGoalId,
    context: challenge.applicationContext || challenge.goalSnapshot?.context,
    status,
    at: completedAt
  });
  return {
    ...challenge,
    status,
    note: clean(outcome.note, 800),
    ratings,
    sourceReports,
    completedAt
  };
}

export function normalizeFunctionalProgressEntry(input = {}, index = 0, defaults = {}) {
  const source = normalizeSource(input.source || defaults.source);
  const status = normalizeProgressStatus(input.status || defaults.status, input.achievement);
  const achievement = status === "not_observed"
    ? null
    : clampRating(input.achievement ?? defaults.achievement ?? achievementForStatus(status));
  const attempts = finiteNonNegativeInteger(input.attempts ?? defaults.attempts);
  const successfulAttemptsRaw = finiteNonNegativeInteger(input.successfulAttempts ?? defaults.successfulAttempts);
  const successfulAttempts = attempts === null || successfulAttemptsRaw === null
    ? successfulAttemptsRaw
    : Math.min(attempts, successfulAttemptsRaw);
  const at = normalizeDate(input.at || input.observedAt || defaults.at) || clean(input.at || input.observedAt || defaults.at, 40);
  return {
    id: clean(input.id, 100) || `progress-${source}-${at || "undated"}-${index + 1}`,
    at,
    periodStart: normalizeDate(input.periodStart || defaults.periodStart),
    periodEnd: normalizeDate(input.periodEnd || defaults.periodEnd),
    source,
    status,
    achievement,
    attempts,
    successfulAttempts,
    confidence: clampRating(input.confidence ?? defaults.confidence),
    goalId: clean(input.goalId || defaults.goalId, 80),
    challengeId: clean(input.challengeId || defaults.challengeId, 100),
    context: clean(input.context || defaults.context, 160),
    note: clean(input.note, 500)
  };
}

export function normalizeFunctionalProgress(progress = []) {
  return (Array.isArray(progress) ? progress : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => normalizeFunctionalProgressEntry(entry, index));
}

export function normalizeFunctionalSourceReports(sourceReports = [], defaults = {}) {
  const entries = Array.isArray(sourceReports)
    ? sourceReports
    : Object.entries(sourceReports || {}).map(([source, value]) => typeof value === "object" && value !== null
      ? { ...value, source }
      : { source, achievement: value });
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => !entry.source || ADHD_FUNCTIONAL_PROGRESS_SOURCES.includes(entry.source))
    .map((entry, index) => normalizeFunctionalProgressEntry(entry, index, defaults));
}

export function recordFunctionalGoalProgress(goal = {}, progressInput = {}) {
  const normalizedGoal = normalizeFunctionalGoal(goal);
  const incoming = Array.isArray(progressInput) ? progressInput : [progressInput];
  const additions = incoming
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => normalizeFunctionalProgressEntry(entry, normalizedGoal.progress.length + index, {
      goalId: normalizedGoal.id,
      context: normalizedGoal.context,
      source: normalizedGoal.reviewSource
    }));
  return {
    ...normalizedGoal,
    progress: [...normalizedGoal.progress, ...additions]
  };
}

export function applyTransferOutcomeToGoal(goal = {}, challenge = {}, outcome = {}) {
  const normalizedGoal = normalizeFunctionalGoal(goal);
  const linkedGoalId = clean(challenge.linkedGoalId || challenge.goalBinding?.goalId, 80);
  const recordedChallenge = recordTransferOutcome(challenge, outcome);
  if (!linkedGoalId || linkedGoalId !== normalizedGoal.id) {
    return { linked: false, goal: normalizedGoal, challenge: recordedChallenge, progressEntries: [] };
  }

  let progressEntries = recordedChallenge.sourceReports;
  if (!progressEntries.length && recordedChallenge.status !== "pending") {
    progressEntries = [normalizeFunctionalProgressEntry({
      at: recordedChallenge.completedAt,
      source: outcome.source || normalizedGoal.reviewSource,
      status: recordedChallenge.status,
      achievement: outcome.achievement,
      confidence: outcome.confidence,
      goalId: normalizedGoal.id,
      challengeId: recordedChallenge.id,
      context: recordedChallenge.applicationContext || normalizedGoal.context,
      note: outcome.progressNote
    })];
  }
  const updatedGoal = progressEntries.length
    ? recordFunctionalGoalProgress(normalizedGoal, progressEntries)
    : normalizedGoal;
  return {
    linked: true,
    goal: updatedGoal,
    challenge: { ...recordedChallenge, sourceReports: progressEntries },
    progressEntries
  };
}

export function summarizeFunctionalProgressBySource(goalsOrProgress = []) {
  const entries = collectProgressEntries(goalsOrProgress);
  return Object.fromEntries(ADHD_FUNCTIONAL_PROGRESS_SOURCES.map((source) => {
    const sourceEntries = entries.filter((entry) => entry.source === source);
    const observedAchievements = sourceEntries.map((entry) => entry.achievement).filter(Number.isFinite);
    const latest = sourceEntries.slice().sort((left, right) => String(right.at).localeCompare(String(left.at)))[0] || null;
    const attempts = sourceEntries.map((entry) => entry.attempts).filter(Number.isFinite);
    const successfulAttempts = sourceEntries.map((entry) => entry.successfulAttempts).filter(Number.isFinite);
    return [source, {
      source,
      checkIns: sourceEntries.length,
      meanAchievement: observedAchievements.length
        ? round(observedAchievements.reduce((total, value) => total + value, 0) / observedAchievements.length, 3)
        : null,
      attempts: attempts.length ? attempts.reduce((total, value) => total + value, 0) : null,
      successfulAttempts: successfulAttempts.length ? successfulAttempts.reduce((total, value) => total + value, 0) : null,
      latestAt: latest?.at || "",
      latestStatus: latest?.status || "not_observed"
    }];
  }));
}

export function summarizeFunctionalAdherence(challenges = [], goals = []) {
  const validChallenges = Array.isArray(challenges) ? challenges : [];
  const attempted = validChallenges.filter((item) => ["completed", "partial", "not_completed"].includes(item.status));
  const completed = attempted.filter((item) => item.status === "completed").length;
  const partial = attempted.filter((item) => item.status === "partial").length;
  const weightedCompleted = completed + (partial * 0.5);
  const goalProgress = collectProgressEntries(goals);
  const measurableProgress = goalProgress.filter((entry) => Number.isFinite(entry.achievement));
  return {
    assignedChallenges: validChallenges.length,
    attemptedChallenges: attempted.length,
    completedChallenges: completed,
    partialChallenges: partial,
    challengeAdherence: attempted.length ? round(weightedCompleted / attempted.length, 3) : null,
    activeGoals: (Array.isArray(goals) ? goals : []).filter((goal) => goal.active !== false).length,
    goalCheckIns: goalProgress.length,
    meanGoalAchievement: measurableProgress.length
      ? round(measurableProgress.reduce((total, entry) => total + entry.achievement, 0) / measurableProgress.length, 3)
      : null,
    goalProgressBySource: summarizeFunctionalProgressBySource(goalProgress),
    interpretation: "La adherencia funcional describe cumplimiento registrado; no demuestra por sí sola eficacia clínica. Las fuentes se resumen por separado y no se consideran intercambiables."
  };
}

function adaptChallengeLabel(label, ageMode) {
  if (ageMode === "pediatric") return label.replace("actividad", "tarea de casa o escuela");
  if (ageMode === "adolescent") return label.replace("actividad", "actividad escolar o personal");
  return label;
}

function normalizeRatings(ratings = {}) {
  return Object.fromEntries(Object.entries(ratings || {})
    .filter(([source]) => ADHD_FUNCTIONAL_PROGRESS_SOURCES.includes(source))
    .map(([source, value]) => [source, clampRating(value)]));
}

function normalizeProgressStatus(value, achievement) {
  const aliases = {
    completed: "achieved",
    partial: "partial",
    not_completed: "not_achieved",
    pending: "not_observed"
  };
  const normalized = aliases[value] || value;
  if (ADHD_FUNCTIONAL_PROGRESS_STATUSES.includes(normalized)) return normalized;
  const rating = clampRating(achievement);
  if (!Number.isFinite(rating)) return "not_observed";
  if (rating >= 1) return "achieved";
  if (rating > 0) return "partial";
  return "not_achieved";
}

function achievementForStatus(status) {
  return ({ achieved: 1, partial: 0.5, not_achieved: 0 })[status] ?? null;
}

function collectProgressEntries(goalsOrProgress = []) {
  return (Array.isArray(goalsOrProgress) ? goalsOrProgress : []).flatMap((item) => Array.isArray(item?.progress)
    ? normalizeFunctionalProgress(item.progress)
    : item && typeof item === "object" ? [normalizeFunctionalProgressEntry(item)] : []);
}

function uniqueGoals(goals) {
  const seen = new Set();
  return goals.filter((goal) => {
    if (!goal || typeof goal !== "object") return false;
    const key = clean(goal.id, 80) || JSON.stringify([goal.action, goal.context, goal.target]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDomains(domains, fallback = []) {
  const source = Array.isArray(domains) && domains.length ? domains : Array.isArray(fallback) ? fallback : [];
  return [...new Set(source.map((domain) => clean(domain, 80)).filter(Boolean))];
}

function normalizeSource(value) {
  return ADHD_FUNCTIONAL_PROGRESS_SOURCES.includes(value) ? value : "patient";
}

function clampRating(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : null;
}

function finiteNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}

function normalizeDate(value) {
  const text = clean(value, 40);
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : text.slice(0, 10);
}

function clean(value, maximum) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}
