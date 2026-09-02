import {
  ADHD_DEFAULT_PROGRAM,
  ADHD_DOMAINS,
  ADHD_FUNCTIONAL_DIFFICULTIES,
  ADHD_METACOGNITIVE_MODULES,
  ADHD_PROGRAM_ENGINE_VERSION,
  ADHD_PROTOCOL_ID,
  ADHD_PROTOCOL_VERSION,
  ADHD_TASK_CATALOG,
  ADHD_TRANSFER_CHALLENGES,
  resolveAgeModality
} from "../config/adhdProtocol.js";
import { clamp, round } from "./statistics.js";

export { ADHD_PROGRAM_ENGINE_VERSION };

export const ADHD_PROGRAM_SELECTION_RULES = Object.freeze({
  id: "adhd-program-explicit-domain-selection",
  version: ADHD_PROGRAM_ENGINE_VERSION,
  generativeAi: false,
  normative: false,
  input: "Se ordenan las señales no normativas del perfil, sus vínculos con objetivos y señales recientes de entrenamiento; edad/tolerancia ajustan duración, adherencia ajusta distribución y el historial evita repetición innecesaria.",
  missingValues: "Los dominios sin señal válida no se califican como conservados o alterados; se distribuyen de forma equilibrada cuando son necesarios para variar la sesión.",
  interpretation: "El orden selecciona contenidos de entrenamiento y no constituye diagnóstico, gravedad clínica ni recomendación automatizada."
});

const CURRENT_PROTOCOL_LIMITS = Object.freeze({
  totalSessions: Object.freeze([20, 25]),
  weeks: Object.freeze([4, 8]),
  sessionMinutes: Object.freeze([20, 30])
});

const COGNITIVE_DOMAIN_FALLBACK_ORDER = Object.freeze([
  "sustainedAttention",
  "inhibitoryControl",
  "workingMemory",
  "interferenceControl",
  "cognitiveFlexibility",
  "planning",
  "temporalControl",
  "responseVariability"
]);

const ACTIVATIONS = Object.freeze([
  Object.freeze({ id: "goal_context_check", label: "Revisar objetivo, fatiga y condiciones para la sesión" }),
  Object.freeze({ id: "brief_calibration", label: "Calibración breve y práctica no puntuable" }),
  Object.freeze({ id: "strategy_recall", label: "Recordar la estrategia funcional de la sesión anterior" })
]);

export function generateAdhdProgram(input = {}, overrides = {}) {
  const profile = input.profile || input.baselineProfile || null;
  const age = Number(input.age ?? profile?.context?.age);
  const modality = resolveAgeModality(age);
  const goals = normalizeFunctionalGoals(input.functionalGoals, input.functionalDifficulties);
  const trainingHistory = summarizeTrainingHistory(input.previousResults || input.trainingResults, input.trainingResponse);
  const configuration = normalizeAdhdProgramConfiguration({
    ...input.configuration,
    ...overrides,
    tolerance: overrides.tolerance ?? input.tolerance,
    adherence: overrides.adherence ?? input.adherence,
    trainingResponse: overrides.trainingResponse ?? input.trainingResponse
  }, modality);
  const programId = String(input.programId || `${ADHD_PROTOCOL_ID}:${profile?.profileId || "baseline-pending"}`);
  const base = {
    programId,
    protocolId: ADHD_PROTOCOL_ID,
    protocolVersion: ADHD_PROTOCOL_VERSION,
    programEngineVersion: ADHD_PROGRAM_ENGINE_VERSION,
    generatedAt: input.generatedAt ?? null,
    generatedBy: "explicit_rules",
    generativeAiUsed: false,
    normative: false,
    selectionRules: ADHD_PROGRAM_SELECTION_RULES,
    decisionInputSummary: {
      ageAvailable: Number.isFinite(age),
      baselineProfileAvailable: Boolean(profile),
      functionalGoalCount: goals.length,
      previousResultCount: trainingHistory.recordCount,
      adherenceAvailable: readRate(input.adherence) !== null,
      toleranceAvailable: readToleranceMinutes(input.tolerance) !== null,
      trainingResponseAvailable: trainingHistory.responseAvailable
    },
    modality: modality ? copyModality(modality) : null,
    configuration,
    goals,
    sourceProfile: profile ? {
      profileId: String(profile.profileId || ""),
      assessmentId: String(profile.assessmentId || ""),
      assessmentPhase: String(profile.assessmentPhase || "T0"),
      profileEngineVersion: String(profile.profileEngineVersion || "unknown")
    } : null,
    clinicianControl: {
      finalDecisionByClinician: true,
      editable: true,
      allowedEdits: ["add_task", "remove_task", "replace_task", "change_frequency", "change_goal", "session_override"]
    },
    auditTrail: [],
    notices: [
      "Plan generado con reglas explícitas para complementar el tratamiento integral; no realiza diagnóstico ni sustituye juicio clínico.",
      "La duración propuesta es configurable y no se presenta como una dosis universal clínicamente validada."
    ]
  };

  const blockingErrors = [];
  if (!modality) blockingErrors.push("age_required");
  if (modality?.standardProgramAvailable === false) blockingErrors.push("standard_program_not_available_before_age_6");
  if (!profile || !Array.isArray(profile.domains)) blockingErrors.push("baseline_profile_required");
  if (blockingErrors.length) {
    const blocked = {
      ...base,
      status: "blocked",
      blockingErrors,
      prioritizedDomains: [],
      sessions: [],
      reassessment: buildReassessmentSchedule(configuration),
      validation: null
    };
    blocked.validation = validateAdhdProgram(blocked);
    return blocked;
  }

  const prioritizedDomains = prioritizeDomains(profile.domains, goals, trainingHistory);
  const taskPool = buildTaskPool(prioritizedDomains, trainingHistory);
  const sessions = Array.from({ length: configuration.totalSessions }, (_, index) => buildSession({
    index,
    configuration,
    modality,
    prioritizedDomains,
    taskPool,
    goals
  }));
  const program = {
    ...base,
    status: "draft_for_clinician_review",
    blockingErrors: [],
    prioritizedDomains,
    sessions,
    reassessment: buildReassessmentSchedule(configuration),
    validation: null
  };
  program.validation = validateAdhdProgram(program);
  return program;
}

export function normalizeAdhdProgramConfiguration(input = {}, modality = null) {
  const totalSessions = integerWithin(input.totalSessions, ADHD_DEFAULT_PROGRAM.totalSessions, ...CURRENT_PROTOCOL_LIMITS.totalSessions);
  let weeks = integerWithin(input.weeks, ADHD_DEFAULT_PROGRAM.weeks, ...CURRENT_PROTOCOL_LIMITS.weeks);
  const adherenceRate = readRate(input.adherence);
  const fatigue = readScale(input.trainingResponse?.fatigue ?? input.fatigue);
  const toleranceMinutes = readToleranceMinutes(input.tolerance);
  if (adherenceRate !== null && adherenceRate < 0.65) {
    weeks = Math.max(weeks, Math.ceil(totalSessions / 3));
  }
  weeks = clamp(weeks, CURRENT_PROTOCOL_LIMITS.weeks[0], CURRENT_PROTOCOL_LIMITS.weeks[1]);
  let sessionMinutes = clamp(
    Number(input.sessionMinutes ?? toleranceMinutes ?? modality?.sessionMinutes ?? ADHD_DEFAULT_PROGRAM.maxSessionMinutes),
    CURRENT_PROTOCOL_LIMITS.sessionMinutes[0],
    CURRENT_PROTOCOL_LIMITS.sessionMinutes[1]
  );
  if (fatigue !== null && fatigue >= 7) sessionMinutes = CURRENT_PROTOCOL_LIMITS.sessionMinutes[0];
  const sessionsPerWeek = round(totalSessions / weeks, 2);
  return {
    totalSessions,
    weeks,
    sessionsPerWeek,
    sessionMinutes,
    referenceRange: CURRENT_PROTOCOL_LIMITS,
    adaptiveAccuracyTarget: normalizeTarget(input.adaptiveAccuracyTarget),
    intermediateReassessmentSession: clamp(
      Number(input.intermediateReassessmentSession ?? Math.round(totalSessions / 2)),
      1,
      totalSessions - 1
    ),
    finalReassessmentSession: totalSessions,
    followUpWeeks: integerWithin(input.followUpWeeks, ADHD_DEFAULT_PROGRAM.followUpWeeks, 1, 52),
    telemetryEnabled: input.telemetryEnabled === true,
    adaptationReasons: [
      ...(adherenceRate !== null && adherenceRate < 0.65 ? ["Frecuencia distribuida para facilitar adherencia reciente sin reducir los componentes del protocolo."] : []),
      ...(fatigue !== null && fatigue >= 7 ? ["Duración situada en el mínimo del protocolo por fatiga reciente informada."] : []),
      ...(toleranceMinutes !== null ? [`Duración limitada por tolerancia informada (${toleranceMinutes} minutos).`] : [])
    ]
  };
}

export function validateAdhdProgram(program = {}) {
  const errors = [];
  const warnings = [];
  const configuration = program.configuration || {};
  if (program.programEngineVersion !== ADHD_PROGRAM_ENGINE_VERSION) warnings.push("program_engine_version_differs");
  if (program.generativeAiUsed !== false) errors.push("generative_ai_must_not_make_program_decisions");
  if (!program.sourceProfile && program.status !== "blocked") errors.push("baseline_profile_required");
  if (!within(configuration.totalSessions, ...CURRENT_PROTOCOL_LIMITS.totalSessions)) errors.push("total_sessions_outside_current_protocol");
  if (!within(configuration.weeks, ...CURRENT_PROTOCOL_LIMITS.weeks)) errors.push("weeks_outside_current_protocol");
  if (!within(configuration.sessionMinutes, ...CURRENT_PROTOCOL_LIMITS.sessionMinutes)) errors.push("session_minutes_outside_current_protocol");
  const sessions = Array.isArray(program.sessions) ? program.sessions : [];
  if (program.status !== "blocked" && sessions.length !== configuration.totalSessions) errors.push("session_count_mismatch");
  const requiredKinds = ["activation", "cognitive_task", "metacognition", "functional_transfer", "self_assessment", "feedback"];
  sessions.forEach((session, index) => {
    const kinds = (session.blocks || []).map((block) => block.kind);
    requiredKinds.forEach((kind) => {
      if (!kinds.includes(kind)) errors.push(`session_${index + 1}_missing_${kind}`);
    });
    const tasks = (session.blocks || []).filter((block) => block.kind === "cognitive_task");
    if (tasks.length !== 2) errors.push(`session_${index + 1}_requires_exactly_two_cognitive_tasks`);
    if (new Set(tasks.map((block) => block.taskId)).size !== tasks.length) errors.push(`session_${index + 1}_repeats_same_task`);
    tasks.forEach((block) => {
      if (!ADHD_TASK_CATALOG[block.taskId]) errors.push(`session_${index + 1}_unknown_task_${block.taskId}`);
      if (block.practiceRequired !== true) warnings.push(`session_${index + 1}_${block.taskId}_practice_not_required`);
    });
    if (finiteOrNull(session.plannedMinutes) === null) errors.push(`session_${index + 1}_minutes_missing`);
  });
  if (!program.prioritizedDomains?.length && program.status !== "blocked") warnings.push("no_prioritized_domains");
  if (program.status === "blocked") warnings.push(...(program.blockingErrors || []));
  return {
    valid: errors.length === 0 && program.status !== "blocked",
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    checkedWithProgramEngineVersion: ADHD_PROGRAM_ENGINE_VERSION
  };
}

export function applyAdhdProgramEdits(program, edits = [], metadata = {}) {
  const updated = cloneValue(program || {});
  const operations = Array.isArray(edits) ? edits : [edits];
  updated.auditTrail = Array.isArray(updated.auditTrail) ? updated.auditTrail : [];
  operations.forEach((operation, index) => {
    applyEditOperation(updated, operation || {});
    updated.auditTrail.push({
      sequence: updated.auditTrail.length + 1,
      type: String(operation?.type || "unknown"),
      reason: String(operation?.reason || "Motivo clínico no documentado"),
      actorRole: String(operation?.actorRole || metadata.actorRole || "clinician"),
      at: operation?.at ?? metadata.at ?? null,
      source: "manual_clinician_edit",
      operationIndex: index
    });
  });
  updated.status = "clinician_edited_draft";
  updated.manualOverride = true;
  updated.validation = validateAdhdProgram(updated);
  return updated;
}

function prioritizeDomains(profileDomains, goals, trainingHistory) {
  const goalDomains = new Set(goals.flatMap((goal) => goal.domains || []));
  const source = new Map((profileDomains || []).map((domain) => [domain.id, domain]));
  const cognitive = COGNITIVE_DOMAIN_FALLBACK_ORDER.map((domainId, fallbackIndex) => {
    const domain = source.get(domainId) || {};
    const signal = finiteOrNull(domain.selectionSignal);
    const linkedGoals = goals.filter((goal) => goalDomains.has(domainId) && (goal.domains || []).includes(domainId));
    const recentTrainingSignal = trainingHistory.domainSignals[domainId] || null;
    const reasons = [];
    if (linkedGoals.length) reasons.push(`Vinculado a ${linkedGoals.length} objetivo(s) funcional(es) definido(s).`);
    if (Number.isFinite(signal)) reasons.push(`Señal interna no normativa del perfil: ${round(signal, 3)}.`);
    if (domain.status === "partial" || domain.status === "insufficient_data") reasons.push("La información basal es incompleta; no debe interpretarse como ausencia de dificultad.");
    if (recentTrainingSignal) reasons.push(`Señal reciente de entrenamiento: ${recentTrainingSignal.label}.`);
    if (!reasons.length) reasons.push("Incluido para mantener variedad entre funciones y evitar entrenamiento monótono.");
    return {
      id: domainId,
      label: ADHD_DOMAINS[domainId]?.label || domainId,
      sourceStatus: domain.status || "not_assessed",
      selectionSignal: Number.isFinite(signal) ? round(signal, 3) : null,
      linkedGoalIds: linkedGoals.map((goal) => goal.id),
      recentTrainingSignal,
      reasons,
      diagnostic: false,
      fallbackIndex
    };
  }).sort((left, right) => {
    const leftGoals = left.linkedGoalIds.length > 0 ? 1 : 0;
    const rightGoals = right.linkedGoalIds.length > 0 ? 1 : 0;
    if (rightGoals !== leftGoals) return rightGoals - leftGoals;
    const leftReview = left.recentTrainingSignal?.needsReview ? 1 : 0;
    const rightReview = right.recentTrainingSignal?.needsReview ? 1 : 0;
    if (rightReview !== leftReview) return rightReview - leftReview;
    const leftSignal = left.selectionSignal ?? -1;
    const rightSignal = right.selectionSignal ?? -1;
    return rightSignal - leftSignal || left.fallbackIndex - right.fallbackIndex;
  });
  return [
    ...cognitive,
    {
      id: "metacognition",
      label: ADHD_DOMAINS.metacognition.label,
      sourceStatus: source.get("metacognition")?.status || "functional_only",
      selectionSignal: source.get("metacognition")?.selectionSignal ?? null,
      linkedGoalIds: goals.filter((goal) => goal.domains?.includes("metacognition")).map((goal) => goal.id),
      reasons: ["Componente obligatorio para organización, autorregulación y uso de estrategias fuera de las tareas."],
      diagnostic: false
    },
    {
      id: "functionalTransfer",
      label: ADHD_DOMAINS.functionalTransfer.label,
      sourceStatus: source.get("functionalTransfer")?.status || "functional_only",
      selectionSignal: source.get("functionalTransfer")?.selectionSignal ?? null,
      linkedGoalIds: goals.filter((goal) => goal.domains?.includes("functionalTransfer")).map((goal) => goal.id),
      reasons: ["Componente obligatorio para observar aplicación en actividades cotidianas y no solo desempeño dentro de tareas."],
      diagnostic: false
    }
  ];
}

function buildTaskPool(prioritizedDomains, trainingHistory) {
  const rank = new Map(prioritizedDomains.map((domain, index) => [domain.id, index]));
  return Object.values(ADHD_TASK_CATALOG)
    .filter((task) => task.id !== "dichotic_listening")
    .map((task) => ({
      ...task,
      priority: Math.min(...task.domains.map((domain) => rank.get(domain) ?? 99)),
      recentUseCount: trainingHistory.taskUseCounts[task.id] || 0
    }))
    .sort((left, right) => left.priority - right.priority || left.recentUseCount - right.recentUseCount || left.id.localeCompare(right.id));
}

function buildSession({ index, configuration, modality, prioritizedDomains, taskPool, goals }) {
  const sessionNumber = index + 1;
  const first = taskPool[(index * 2) % taskPool.length];
  const second = findDifferentTask(taskPool, first, (index * 2) + 1);
  const sessionDomainIds = [...new Set([...first.domains, ...second.domains])];
  const meta = selectByDomains(ADHD_METACOGNITIVE_MODULES, sessionDomainIds, index);
  const transfer = selectByDomains(ADHD_TRANSFER_CHALLENGES, sessionDomainIds, index);
  const activation = ACTIVATIONS[index % ACTIVATIONS.length];
  const adultFunctionalWeight = modality?.id === "adult" ? 1 : 0;
  const fixedMinutes = 2 + (4 + adultFunctionalWeight) + (3 + adultFunctionalWeight) + 2 + 1;
  const availableTaskMinutes = Math.max(6, configuration.sessionMinutes - fixedMinutes);
  const firstMinutes = Math.max(3, Math.round(availableTaskMinutes * (first.durationMinutes / (first.durationMinutes + second.durationMinutes))));
  const secondMinutes = Math.max(3, availableTaskMinutes - firstMinutes);
  const relevantReasons = prioritizedDomains
    .filter((domain) => sessionDomainIds.includes(domain.id))
    .slice(0, 3)
    .map((domain) => ({ domainId: domain.id, reasons: domain.reasons }));
  const linkedGoalIds = goals.filter((goal) => goal.domains?.some((domain) => sessionDomainIds.includes(domain))).map((goal) => goal.id);
  const blocks = [
    {
      id: `s${sessionNumber}-activation`,
      kind: "activation",
      moduleId: activation.id,
      label: activation.label,
      plannedMinutes: 2,
      captures: ["fatigue", "concentration", "technical_conditions"]
    },
    taskBlock(sessionNumber, "primary", first, firstMinutes),
    taskBlock(sessionNumber, "secondary", second, secondMinutes),
    {
      id: `s${sessionNumber}-metacognition`,
      kind: "metacognition",
      moduleId: meta.id,
      label: meta.title,
      domains: meta.domains,
      plannedMinutes: 4 + adultFunctionalWeight,
      required: true
    },
    {
      id: `s${sessionNumber}-transfer`,
      kind: "functional_transfer",
      challengeId: transfer.id,
      label: `Asignar reto posterior: ${transfer.label}`,
      domains: transfer.domains,
      linkedGoalIds,
      plannedMinutes: 3 + adultFunctionalWeight,
      completionOptions: ["assigned"],
      patientNoteOptional: true,
      required: true
    },
    {
      id: `s${sessionNumber}-self-assessment`,
      kind: "self_assessment",
      label: "Autoevaluación breve",
      plannedMinutes: 2,
      scale: [0, 10],
      captures: ["fatigue", "frustration", "perceived_concentration"],
      required: true
    },
    {
      id: `s${sessionNumber}-feedback`,
      kind: "feedback",
      label: "Feedback descriptivo de precisión, tiempo y variabilidad",
      plannedMinutes: 1,
      prohibitedClaims: ["global_brain_improvement", "diagnosis", "normative_percentile"],
      required: true
    }
  ];
  return {
    sessionId: `session-${sessionNumber}`,
    sessionNumber,
    week: Math.min(configuration.weeks, Math.floor(index * configuration.weeks / configuration.totalSessions) + 1),
    plannedMinutes: blocks.reduce((total, block) => total + block.plannedMinutes, 0),
    modalityId: modality.id,
    instructionStyle: modality.instructionStyle,
    domains: sessionDomainIds,
    linkedGoalIds,
    selectionReasons: relevantReasons,
    milestone: sessionNumber === configuration.intermediateReassessmentSession
      ? "intermediate_reassessment_due"
      : sessionNumber === configuration.finalReassessmentSession
        ? "final_reassessment_due"
        : null,
    blocks
  };
}

function taskBlock(sessionNumber, role, task, plannedMinutes) {
  return {
    id: `s${sessionNumber}-${role}-${task.id}`,
    kind: "cognitive_task",
    role,
    taskId: task.id,
    taskVersion: task.taskVersion,
    label: task.label,
    domains: [...task.domains],
    plannedMinutes,
    adaptive: true,
    practiceRequired: true,
    practiceExcludedFromScoring: true,
    sourceKind: task.kind
  };
}

function buildReassessmentSchedule(configuration) {
  return {
    phases: [
      { phase: "T0", label: "Basal", trigger: "before_program" },
      { phase: "T1", label: "Intermedia opcional", triggerSession: configuration.intermediateReassessmentSession, optional: true },
      { phase: "T2", label: "Final", triggerSession: configuration.finalReassessmentSession },
      { phase: "T3", label: "Seguimiento", weeksAfterT2: configuration.followUpWeeks, optional: true }
    ],
    practiceEffectMustBeConsidered: true,
    alternateFormsRequired: true
  };
}

function normalizeFunctionalGoals(goals = [], difficultyIds = []) {
  const difficulties = new Map(ADHD_FUNCTIONAL_DIFFICULTIES.map((item) => [item.id, item]));
  const output = [];
  (Array.isArray(difficultyIds) ? difficultyIds : []).forEach((value) => {
    const id = typeof value === "string" ? value : value?.id;
    const difficulty = difficulties.get(id);
    if (!difficulty) return;
    output.push({
      id: `difficulty:${difficulty.id}`,
      label: difficulty.label,
      action: difficulty.label,
      context: null,
      frequency: null,
      target: null,
      reviewDate: null,
      domains: [...difficulty.domains],
      source: "functional_difficulty"
    });
  });
  (Array.isArray(goals) ? goals : []).forEach((goal, index) => {
    const linkedDifficulty = difficulties.get(goal?.difficultyId);
    const domains = [...new Set([
      ...(Array.isArray(goal?.domains) ? goal.domains : []),
      ...(linkedDifficulty?.domains || [])
    ].filter((domain) => ADHD_DOMAINS[domain]))];
    output.push({
      id: String(goal?.id || `goal-${index + 1}`),
      label: String(goal?.label || goal?.text || goal?.action || "Objetivo funcional"),
      action: goal?.action ? String(goal.action) : null,
      context: goal?.context ? String(goal.context) : null,
      frequency: goal?.frequency ?? null,
      target: goal?.target ?? goal?.meta ?? null,
      reviewDate: goal?.reviewDate ?? null,
      domains,
      source: "clinician_or_patient_defined"
    });
  });
  return uniqueBy(output, (goal) => goal.id);
}

function applyEditOperation(program, operation) {
  const type = String(operation.type || "");
  const sessionNumber = finiteOrNull(operation.sessionNumber);
  const session = sessionNumber !== null
    ? program.sessions?.find((item) => item.sessionNumber === sessionNumber)
    : null;
  if (type === "remove_task" && session) {
    session.blocks = session.blocks.filter((block) => !(block.kind === "cognitive_task" && block.taskId === operation.taskId));
  } else if (type === "add_task" && session && ADHD_TASK_CATALOG[operation.taskId]) {
    const task = ADHD_TASK_CATALOG[operation.taskId];
    const block = taskBlock(session.sessionNumber, `manual-${session.blocks.length}`, task, clamp(Number(operation.plannedMinutes || task.durationMinutes), 1, 15));
    const feedbackIndex = session.blocks.findIndex((item) => item.kind === "feedback");
    session.blocks.splice(feedbackIndex < 0 ? session.blocks.length : feedbackIndex, 0, block);
  } else if (type === "replace_task" && session && ADHD_TASK_CATALOG[operation.taskId]) {
    const index = session.blocks.findIndex((block) => block.kind === "cognitive_task" && block.taskId === operation.previousTaskId);
    if (index >= 0) session.blocks[index] = taskBlock(session.sessionNumber, "manual-replacement", ADHD_TASK_CATALOG[operation.taskId], session.blocks[index].plannedMinutes);
  } else if (type === "change_frequency") {
    program.configuration.weeks = integerWithin(operation.weeks, program.configuration.weeks, ...CURRENT_PROTOCOL_LIMITS.weeks);
    program.configuration.sessionsPerWeek = round(program.configuration.totalSessions / program.configuration.weeks, 2);
    (program.sessions || []).forEach((item, index) => {
      item.week = Math.min(program.configuration.weeks, Math.floor(index * program.configuration.weeks / program.configuration.totalSessions) + 1);
    });
  } else if (type === "change_goal") {
    const goal = normalizeFunctionalGoals([operation.goal || operation], [])[0];
    if (goal) {
      const index = program.goals.findIndex((item) => item.id === goal.id);
      if (index >= 0) program.goals[index] = goal;
      else program.goals.push(goal);
    }
  } else if (type === "remove_goal") {
    program.goals = (program.goals || []).filter((goal) => goal.id !== operation.goalId);
  } else if (type === "session_override" && session) {
    Object.assign(session, cloneValue(operation.patch || {}));
  }
  if (session) session.plannedMinutes = (session.blocks || []).reduce((total, block) => total + (Number(block.plannedMinutes) || 0), 0);
}

function findDifferentTask(pool, first, offset) {
  for (let count = 0; count < pool.length; count += 1) {
    const candidate = pool[(offset + count) % pool.length];
    if (candidate.id !== first.id && candidate.domains.some((domain) => !first.domains.includes(domain))) return candidate;
  }
  return pool.find((task) => task.id !== first.id) || first;
}

function selectByDomains(items, domains, offset) {
  const matches = items.filter((item) => item.domains?.some((domain) => domains.includes(domain)));
  const pool = matches.length ? matches : items;
  return pool[offset % pool.length];
}

function copyModality(modality) {
  return {
    id: modality.id,
    label: modality.label,
    minAge: modality.minAge,
    maxAge: modality.maxAge,
    sessionMinutes: modality.sessionMinutes,
    instructionStyle: modality.instructionStyle,
    functionalContexts: [...(modality.functionalContexts || [])],
    standardProgramAvailable: modality.standardProgramAvailable !== false,
    ...(modality.notice ? { notice: modality.notice } : {})
  };
}

function readToleranceMinutes(value) {
  const direct = finiteOrNull(value);
  if (direct !== null) return direct;
  const maximum = finiteOrNull(value?.maxSessionMinutes);
  if (maximum !== null) return maximum;
  const labels = { low: 20, baja: 20, medium: 25, media: 25, high: 30, alta: 30 };
  return labels[String(value || "").toLowerCase()] ?? null;
}

function readRate(value) {
  const candidate = typeof value === "object" && value !== null
    ? (value.rate ?? (Number(value.completed) / Number(value.scheduled)))
    : value;
  const numeric = finiteOrNull(candidate);
  if (!Number.isFinite(numeric)) return null;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

function readScale(value) {
  const numeric = finiteOrNull(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 10) : null;
}

function summarizeTrainingHistory(historyInput, responseInput) {
  const records = Array.isArray(historyInput)
    ? historyInput
    : Array.isArray(historyInput?.results)
      ? historyInput.results
      : Array.isArray(historyInput?.sessions)
        ? historyInput.sessions
        : [];
  const taskUseCounts = {};
  const domainSignals = {};
  const responseDomains = responseInput?.domains && typeof responseInput.domains === "object"
    ? Object.entries(responseInput.domains).map(([domainId, value]) => ({ domainId, ...(typeof value === "object" ? value : { status: value }) }))
    : [];
  [...records, ...responseDomains].forEach((record) => {
    const taskId = String(record?.taskId || "");
    if (taskId) taskUseCounts[taskId] = (taskUseCounts[taskId] || 0) + 1;
    const domains = [...new Set([
      ...(record?.domainId ? [record.domainId] : []),
      ...(Array.isArray(record?.domains) ? record.domains : [])
    ].filter((domainId) => ADHD_DOMAINS[domainId]))];
    const explicit = String(record?.status || record?.response || record?.trend || "").toLowerCase();
    const accuracy = finiteOrNull(record?.accuracy ?? record?.metrics?.accuracy);
    const target = normalizeTarget(record?.targetRange);
    let id = "observed";
    let label = "resultado reciente disponible para revisión";
    let needsReview = false;
    if (["declining", "decline", "deteriorating", "deterioro", "below_target", "difficulty", "dificultad"].includes(explicit)
      || (Number.isFinite(accuracy) && accuracy < target[0])) {
      id = "needs_review";
      label = "desempeño reciente bajo el objetivo interno de la tarea o tendencia descendente; revisar carga y estrategia";
      needsReview = true;
    } else if (["plateau", "meseta"].includes(explicit)) {
      id = "plateau";
      label = "meseta reciente; variar estrategia o dimensión antes de aumentar carga";
      needsReview = true;
    } else if (["improving", "improvement", "mejora", "stable", "estable", "tolerated"].includes(explicit)) {
      id = "stable_or_improving";
      label = "respuesta reciente estable o en dirección favorable, sin inferencia causal";
    }
    domains.forEach((domainId) => {
      domainSignals[domainId] = { id, label, needsReview, normative: false };
    });
  });
  return {
    recordCount: records.length,
    taskUseCounts,
    domainSignals,
    responseAvailable: Boolean(responseInput && Object.keys(responseInput).length)
  };
}

function normalizeTarget(value) {
  const candidate = Array.isArray(value) ? value : ADHD_DEFAULT_PROGRAM.adaptiveAccuracyTarget;
  const lower = clamp(Number(candidate[0]), 0.5, 0.95);
  const upper = clamp(Number(candidate[1]), lower, 0.99);
  return [round(lower, 3), round(upper, 3)];
}

function integerWithin(value, fallback, minimum, maximum) {
  const numeric = finiteOrNull(value);
  return Math.round(clamp(numeric ?? fallback, minimum, maximum));
}

function within(value, minimum, maximum) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric >= minimum && numeric <= maximum;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function uniqueBy(values, selector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = selector(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}
