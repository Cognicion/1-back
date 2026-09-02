import {
  ADHD_DOMAINS,
  ADHD_FUNCTIONAL_DIFFICULTIES,
  ADHD_TASK_CATALOG,
  getMetacognitiveModule
} from "../config/adhdProtocol.js";
import { summarizeFunctionalProgressBySource } from "../services/adhdFunctionalTransferService.js";

const $ = (id) => document.getElementById(id);

export function showAdhdView(viewId) {
  document.querySelectorAll("[data-adhd-view]").forEach((section) => {
    const active = section.dataset.adhdView === viewId;
    section.hidden = !active;
    section.classList.toggle("adhd-current-view", active);
  });
  document.querySelectorAll("[data-adhd-tab]").forEach((button) => {
    const active = button.dataset.adhdTab === viewId;
    button.classList.toggle("adhd-current-tab", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelector(`[data-adhd-view="${cssEscape(viewId)}"]`)?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function setAdhdStatus(message, state = "info") {
  const banner = $("adhdStatusBanner");
  if (!banner) return;
  banner.textContent = message;
  banner.dataset.state = state;
}

export function renderPatientOptions(select, patients = [], selectedId = "") {
  if (!select) return;
  select.innerHTML = [
    '<option value="">Selecciona un paciente</option>',
    ...patients.map((patient) => `<option value="${escapeHtml(patient.id)}" ${patient.id === selectedId ? "selected" : ""}>${escapeHtml(patient.label || "Paciente")}</option>`)
  ].join("");
}

export function renderFunctionalDifficulties(selected = []) {
  const container = $("adhdFunctionalDifficulties");
  if (!container) return;
  const selectedSet = new Set(selected);
  container.innerHTML = ADHD_FUNCTIONAL_DIFFICULTIES.map((item) => `
    <label><input type="checkbox" name="functionalDifficulty" value="${item.id}" ${selectedSet.has(item.id) ? "checked" : ""}> ${escapeHtml(item.label)}</label>
  `).join("");
}

export function renderPatientContext({ actorMode, patientName, ageMode, clinician = false } = {}) {
  $("adhdUserMode").textContent = actorMode || (clinician ? "Vista clínica" : "Vista del paciente");
  $("adhdPatientName").textContent = patientName || "Sin paciente seleccionado";
  $("adhdAgeMode").textContent = ageMode?.label ? `Modalidad ${ageMode.label}` : "Modalidad pendiente";
  document.body.classList.toggle("adhd-actor-patient", !clinician);
  document.body.classList.toggle("adhd-actor-clinician", clinician);
  document.querySelectorAll(".adhd-clinician-only").forEach((element) => {
    element.toggleAttribute("data-readonly", !clinician);
  });
}

export function renderDashboard(state = {}) {
  const program = state.program;
  const sessions = getSessions(state.plan || program?.plan);
  const completedSessions = (state.sessions || []).filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status));
  const latestSession = completedSessions.slice().sort(byDateDescending)[0];
  const latestAssessment = (state.evaluations || []).slice().sort(byDateDescending)[0];
  const activeGoals = (state.goals || []).filter((goal) => goal.active !== false);
  const trainedDomains = state.plan?.prioritizedDomains || state.plan?.priorities || state.plan?.priorityDomains || state.profile?.domains?.filter((domain) => domain.selectionSignal > 0).slice(0, 4) || [];

  setText("adhdProgramStatus", program?.status ? statusLabel(program.status) : "Sin programa");
  setText("adhdBaselineStatus", baselineStatus(state.evaluations));
  setText("adhdSessionsCompleted", completedSessions.length);
  setText("adhdSessionsScheduled", sessions.length);
  setText("adhdLastSession", latestSession ? formatDate(latestSession.completedAt || latestSession.updatedAt) : "Sin sesiones");
  setText("adhdNextReassessment", resolveNextReassessment(state.plan, completedSessions.length, state.evaluations));
  setText("adhdNextStep", resolveNextStep(state));

  const domainsNode = $("adhdTrainedDomains");
  if (domainsNode) domainsNode.innerHTML = trainedDomains.length
    ? trainedDomains.map((domain) => `<li>${escapeHtml(domain.label || ADHD_DOMAINS[domain.id || domain]?.label || domain)}</li>`).join("")
    : "<li>Aún no se ha generado un plan.</li>";
  const goalsNode = $("adhdCurrentGoals");
  if (goalsNode) goalsNode.innerHTML = activeGoals.length
    ? activeGoals.map((goal) => `<li>${escapeHtml(goal.action || goal.label || goal.text || "Objetivo funcional")}</li>`).join("")
    : "<li>Aún no se han definido objetivos.</li>";

  const primaryAction = $("adhdPrimaryAction");
  if (primaryAction) {
    const target = !state.patientId ? "patient" : !latestAssessment ? "assessment" : !state.profile ? "profile" : !state.plan ? "plan" : "session";
    primaryAction.dataset.target = target;
    primaryAction.textContent = {
      patient: "Seleccionar paciente",
      assessment: "Iniciar evaluación basal",
      profile: "Revisar y generar perfil",
      plan: "Crear plan personalizado",
      session: "Abrir sesión de hoy"
    }[target];
  }
}

export function renderBattery({ tasks = [], results = {}, activeTaskId = "" } = {}) {
  const list = $("adhdBatteryTasks");
  if (!list) return;
  const completed = tasks.filter((task) => results[task.id]?.status === "completed").length;
  list.innerHTML = tasks.map((task) => {
    const result = results[task.id] || {};
    const status = result.status || "pending";
    const quality = result.metrics?.valid === false || result.quality?.valid === false ? " · control de calidad no válido" : "";
    const completedTask = status === "completed";
    return `<li data-task-id="${task.id}" data-status="${status}">
      <div><strong>${escapeHtml(task.label)}</strong><small>${escapeHtml(task.domains.map((domain) => ADHD_DOMAINS[domain]?.label || domain).join(" · "))} · ${task.durationMinutes} min${escapeHtml(quality)}</small></div>
      <button type="button" class="${completedTask ? "adhd-secondary" : "adhd-primary"}" data-start-adhd-task="${task.id}" ${activeTaskId || completedTask ? "disabled" : ""}>${completedTask ? "Completado" : status === "interrupted" ? "Reiniciar bloque" : "Iniciar"}</button>
    </li>`;
  }).join("");
  const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  setText("adhdBatteryProgressText", `${completed} de ${tasks.length} tareas completadas`);
  const progress = $("adhdBatteryProgress");
  if (progress) {
    progress.setAttribute("aria-valuenow", String(percentage));
    progress.querySelector("i")?.style.setProperty("width", `${percentage}%`);
  }
  const generate = $("adhdGenerateProfile");
  if (generate) generate.disabled = completed !== tasks.length;
}

export function renderProfile(profile = null) {
  const container = $("adhdDomainProfile");
  if (!container) return;
  if (!profile) {
    container.innerHTML = '<p class="adhd-empty">Completa la batería para generar el perfil.</p>';
    setText("adhdProfileQuality", "Sin perfil disponible.");
    return;
  }
  setText("adhdProfilePhase", profile.assessmentPhase || "T0");
  setText(
    "adhdProfileQuality",
    `${profile.quality.validTasks} de ${profile.quality.requiredTasks} tareas con resultados interpretables. ${profile.quality.fullyInterpretable ? "Batería completa para esta versión." : "Revisar datos incompletos o inválidos."}`
  );
  container.innerHTML = profile.domains.map((domain) => `
    <article class="adhd-domain-row" data-domain="${domain.id}">
      <div><span class="adhd-eyebrow">${escapeHtml(statusLabel(domain.status))}</span><h3>${escapeHtml(domain.label)}</h3><p class="adhd-signal-note">${domain.linkedGoals.length ? `Vinculado a ${domain.linkedGoals.length} objetivo(s) funcional(es).` : "Sin objetivo funcional vinculado."}</p></div>
      <div class="adhd-measure-table">${domain.measures.length ? domain.measures.map((measure) => `<div><span>${escapeHtml(measure.label)}</span><strong>${formatMeasure(measure)}</strong></div>`).join("") : '<p class="adhd-empty">Sin medida cognitiva para este dominio; puede conservar información funcional.</p>'}</div>
      <div><p class="adhd-signal-note"><strong>Señal de selección:</strong> ${formatNumber(domain.selectionSignal)} / 1</p><p class="adhd-signal-note">Índice interno experimental no normativo. No representa severidad.</p><ul>${domain.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul></div>
    </article>`).join("");
}

export function renderPlan(plan = null, editable = true) {
  const list = $("adhdSessionPlanList");
  if (!list) return;
  if (!plan) {
    list.innerHTML = '<p class="adhd-empty">Aún no hay un plan generado.</p>';
    setText("adhdPlanSummary", "Sin plan");
    return;
  }
  const sessions = getSessions(plan);
  setText("adhdPlanSummary", `${sessions.length} sesiones · ${plan.weeks || plan.configuration?.weeks || "—"} semanas · protocolo ${plan.protocolVersion || "sin versión"}`);
  const rationale = $("adhdPlanRationale");
  const reasons = plan.rationale || plan.reasons || plan.prioritizedDomains?.flatMap((item) => item.reasons || [item.reason]).filter(Boolean) || plan.priorities?.flatMap((item) => item.reasons || [item.reason]).filter(Boolean) || [];
  if (rationale) rationale.innerHTML = `<strong>Por qué se eligieron estos dominios</strong>${reasons.length ? `<ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "<p>El motor aún no cuenta con razones suficientes; el profesional debe revisar.</p>"}`;
  list.innerHTML = sessions.map((session, index) => {
    const components = getSessionComponents(session);
    return `<article class="adhd-plan-item" data-session-index="${index}">
      <span>Sesión ${session.number || index + 1}</span>
      <div><strong>${escapeHtml((session.domainTargets || session.domains || []).map((domain) => ADHD_DOMAINS[domain]?.label || domain).join(" · ") || "Multicomponente")}</strong><p>${session.plannedMinutes || session.estimatedMinutes || session.durationMinutes || "—"} min · ${escapeHtml(session.phase || "entrenamiento")}</p></div>
      <div>${components.map((component) => `<p><b>${escapeHtml(component.type || component.kind || "componente")}:</b> ${escapeHtml(component.label || component.title || ADHD_TASK_CATALOG[component.taskId]?.label || component.taskId || "Actividad")}</p>`).join("")}</div>
      <div class="adhd-plan-item-actions">${editable ? `<button type="button" class="adhd-secondary" data-edit-session="${index}">Sustituir tarea</button><button type="button" class="adhd-danger" data-remove-session="${index}">Quitar tarea</button>` : ""}</div>
    </article>`;
  }).join("");
}

export function renderTodaySession({ session, goal, active = false, followUpChallenge = null } = {}) {
  const components = getSessionComponents(session);
  const nextComponentIndex = components.findIndex((item) => !isFinishedViewStatus(item.status));
  setText("adhdSessionEstimate", session ? `Duración aproximada: ${session.plannedMinutes || session.estimatedMinutes || session.durationMinutes || "20–30"} minutos.` : "Selecciona un plan para conocer la duración aproximada.");
  setText("adhdTodayProgress", `${components.filter((item) => isCompletedStatus(item.status)).length} de ${components.length}`);
  setText("adhdTodayGoal", goal?.action || goal?.label || "Objetivo funcional por definir");
  setText("adhdTodayDifficulty", session?.difficultyLabel || "Ajuste por tarea");
  const list = $("adhdTodayComponents");
  if (list) list.innerHTML = components.length ? components.map((component, index) => `
    <li data-component-index="${index}" data-status="${component.status || "pending"}">
      <span>${index + 1}</span>
      <div><strong>${escapeHtml(component.label || component.title || ADHD_TASK_CATALOG[component.taskId]?.label || component.type || "Actividad")}</strong><small>${escapeHtml(component.instructions || component.reason || "")}</small></div>
      ${renderSessionComponentAction(component, index, active || (nextComponentIndex >= 0 && index !== nextComponentIndex))}
    </li>`).join("") : "<li>Genera un plan para preparar la primera sesión.</li>";
  const start = $("adhdStartSession");
  if (start) start.disabled = !session;
  const challenge = followUpChallenge || session?.transferChallenge || session?.transfer || null;
  const transferBlock = components.find((component) => (component.kind || component.type) === "functional_transfer");
  const challengeModel = buildTransferChallengeViewModel(challenge, goal);
  setText("adhdTransferPrompt", challengeModel.challengePrompt);
  setText("adhdTransferGoalAction", challengeModel.goalAction);
  setText("adhdTransferGoalContext", challengeModel.goalContext);
  setText("adhdTransferGoalFrequency", challengeModel.goalFrequency);
  setText("adhdTransferGoalTarget", challengeModel.goalTarget);
  setText("adhdTransferApplication", challengeModel.applicationPrompt);
  $("adhdTransferGoal")?.toggleAttribute("hidden", !challengeModel.linked);
  $("adhdTransferActions")?.toggleAttribute("hidden", !followUpChallenge || followUpChallenge.status !== "pending");
}

export function buildTransferChallengeViewModel(challenge = null, fallbackGoal = null) {
  const hasDeclaredBinding = Boolean(challenge && typeof challenge === "object" && (
    Object.prototype.hasOwnProperty.call(challenge, "goalBinding")
    || Object.prototype.hasOwnProperty.call(challenge, "linkedGoalId")
    || Object.prototype.hasOwnProperty.call(challenge, "linkedGoalIds")
  ));
  const fallbackMatches = fallbackGoal && (
    challenge?.linkedGoalId === fallbackGoal.id
    || challenge?.linkedGoalIds?.includes?.(fallbackGoal.id)
    || !hasDeclaredBinding
  );
  const goal = challenge?.goalSnapshot || (fallbackMatches ? fallbackGoal : null);
  const linked = Boolean(challenge && goal && (challenge.goalBinding?.status !== "unlinked"));
  return {
    challengeId: String(challenge?.id || ""),
    linked,
    bindingStatus: linked ? "linked" : challenge ? "unlinked" : "not_assigned",
    challengePrompt: challenge?.label || challenge?.prompt || "El reto aparecerá al programar la sesión.",
    applicationPrompt: challenge?.applicationPrompt || (linked
      ? `Aplica el reto a este objetivo en ${goal.context || "el contexto acordado"}.`
      : challenge ? "Vincula el reto a un objetivo funcional antes de interpretar progreso." : ""),
    goalId: linked ? String(goal.id || "") : "",
    goalAction: linked ? String(goal.action || goal.label || "Objetivo funcional") : "",
    goalContext: linked ? String(goal.context || "Contexto por especificar") : "",
    goalFrequency: linked ? String(goal.frequency || "Frecuencia por especificar") : "",
    goalTarget: linked ? String(goal.target || "Meta por especificar") : ""
  };
}

export function buildMetacognitiveModuleViewModel(moduleOrBlock = {}, draft = {}) {
  const requestedId = typeof moduleOrBlock === "string"
    ? moduleOrBlock
    : moduleOrBlock?.moduleId || moduleOrBlock?.id || "";
  const normalizedDraft = draft && typeof draft === "object" ? draft : {};
  const suppliedDefinition = moduleOrBlock && typeof moduleOrBlock === "object" && Array.isArray(moduleOrBlock.steps)
    ? moduleOrBlock
    : null;
  const definition = suppliedDefinition || getMetacognitiveModule(requestedId);
  if (!definition) {
    return {
      available: false,
      moduleId: String(requestedId || ""),
      title: "Módulo no disponible",
      description: "No se encontró contenido versionado para este módulo.",
      minutes: null,
      domains: [],
      steps: [],
      completedStepIds: [],
      strategyPrompt: "",
      applicationPrompt: "",
      strategy: "",
      application: "",
      progressText: "0 de 0 pasos",
      allStepsCompleted: false
    };
  }

  const completedInput = normalizedDraft.completedStepIds || normalizedDraft.checkedStepIds || normalizedDraft.result?.completedStepIds || [];
  const completedSet = new Set((Array.isArray(completedInput) ? completedInput : []).map(String));
  const steps = definition.steps.map((step, index) => ({
    id: String(step.id || `step-${index + 1}`),
    label: String(step.label || step.text || ""),
    completed: completedSet.has(String(step.id || `step-${index + 1}`))
  }));
  const completedStepIds = steps.filter((step) => step.completed).map((step) => step.id);
  return {
    available: true,
    moduleId: String(definition.id),
    contentVersion: String(definition.contentVersion || "1.0.0"),
    title: String(definition.title || "Estrategia metacognitiva"),
    description: String(definition.description || ""),
    minutes: finiteOrNull(definition.minutes),
    domains: Array.isArray(definition.domains) ? [...definition.domains] : [],
    steps,
    completedStepIds,
    strategyPrompt: String(definition.strategyPrompt || "Describe brevemente la estrategia elegida."),
    applicationPrompt: String(definition.applicationPrompt || "Indica dónde y cuándo la aplicarás."),
    strategy: cleanViewText(normalizedDraft.strategy || normalizedDraft.result?.strategy, 500),
    application: cleanViewText(normalizedDraft.application || normalizedDraft.result?.application, 500),
    progressText: `${completedStepIds.length} de ${steps.length} pasos`,
    allStepsCompleted: steps.length > 0 && completedStepIds.length === steps.length
  };
}

export function buildMetacognitiveModuleResult(moduleOrBlock = {}, draft = {}, { completedAt = "" } = {}) {
  const model = buildMetacognitiveModuleViewModel(moduleOrBlock, draft);
  const errors = [];
  if (!model.available) errors.push("metacognitive_module_not_found");
  if (!model.allStepsCompleted) errors.push("metacognitive_steps_incomplete");
  if (!model.strategy) errors.push("metacognitive_strategy_required");
  if (!model.application) errors.push("metacognitive_application_required");
  const valid = errors.length === 0;
  return {
    valid,
    errors,
    result: {
      moduleId: model.moduleId,
      contentVersion: model.contentVersion || "",
      title: model.title,
      status: valid ? "completed" : "incomplete",
      completedStepIds: [...model.completedStepIds],
      totalSteps: model.steps.length,
      strategy: model.strategy,
      application: model.application,
      completedAt: valid ? cleanViewText(completedAt, 40) || null : null,
      acknowledged: valid
    }
  };
}

export function renderMetacognitiveModuleDialog(moduleOrBlock = {}, draft = {}) {
  const model = buildMetacognitiveModuleViewModel(moduleOrBlock, draft);
  const dialog = $("adhdMetacognitiveDialog");
  if (!dialog) return model;
  dialog.dataset.moduleId = model.moduleId;
  setText("adhdMetacognitiveTitle", model.title);
  setText("adhdMetacognitiveDescription", model.description);
  setText("adhdMetacognitiveDuration", Number.isFinite(model.minutes) ? `${model.minutes} minutos aproximados` : "Duración breve");
  setText("adhdMetacognitiveStrategyPrompt", model.strategyPrompt);
  setText("adhdMetacognitiveApplicationPrompt", model.applicationPrompt);
  const stepList = $("adhdMetacognitiveSteps");
  if (stepList) stepList.innerHTML = model.steps.map((step, index) => `
    <li>
      <label>
        <input type="checkbox" value="${escapeHtml(step.id)}" data-adhd-metacognitive-step ${step.completed ? "checked" : ""}>
        <span><b>Paso ${index + 1}</b>${escapeHtml(step.label)}</span>
      </label>
    </li>`).join("");
  const strategy = $("adhdMetacognitiveStrategy");
  if (strategy) strategy.value = model.strategy;
  const application = $("adhdMetacognitiveApplication");
  if (application) application.value = model.application;
  refreshMetacognitiveModuleDialogState();
  return model;
}

export function readMetacognitiveModuleDialogDraft() {
  return {
    completedStepIds: [...document.querySelectorAll("#adhdMetacognitiveSteps [data-adhd-metacognitive-step]:checked")].map((input) => input.value),
    strategy: cleanViewText($("adhdMetacognitiveStrategy")?.value, 500),
    application: cleanViewText($("adhdMetacognitiveApplication")?.value, 500)
  };
}

export function refreshMetacognitiveModuleDialogState() {
  const dialog = $("adhdMetacognitiveDialog");
  const moduleId = dialog?.dataset.moduleId || "";
  const validation = buildMetacognitiveModuleResult(moduleId, readMetacognitiveModuleDialogDraft());
  const result = validation.result;
  setText("adhdMetacognitiveProgress", `${result.completedStepIds.length} de ${result.totalSteps} pasos marcados`);
  const save = $("adhdSaveMetacognitiveModule");
  if (save) save.disabled = !validation.valid;
  return validation;
}

export function openMetacognitiveModuleDialog(moduleOrBlock = {}, draft = {}) {
  const model = renderMetacognitiveModuleDialog(moduleOrBlock, draft);
  const dialog = $("adhdMetacognitiveDialog");
  if (!dialog || !model.available) return model;
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else if (!dialog.open) dialog.setAttribute("open", "");
  dialog.querySelector("[data-adhd-metacognitive-step]:not(:checked), textarea, button")?.focus();
  return model;
}

export function closeMetacognitiveModuleDialog() {
  const dialog = $("adhdMetacognitiveDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

export function renderClinicalPanel(state = {}) {
  const adherence = buildAdhdSessionAdherenceViewModel(state);
  const completedSessions = adherence.completedSessions;
  const challenges = state.challenges || [];
  const completedChallenges = challenges.filter((challenge) => challenge.status === "completed").length;
  const canonicalResults = canonicalResultRecords(state);
  const facts = $("adhdClinicalFacts");
  const plannedSessionCount = getSessions(state.plan).length;
  if (facts) facts.innerHTML = [
    ["Evaluaciones", (state.evaluations || []).length, "T0–T3"],
    ["Sesiones", completedSessions.length, plannedSessionCount ? `de ${plannedSessionCount}` : "sin denominador programado"],
    ["Retos realizados", completedChallenges, `de ${challenges.length}`],
    ["Resultados canónicos", canonicalResults.length, "con versión y fuente"]
  ].map(([label, value, detail]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");

  const evaluationsTable = $("adhdAssessmentsTable");
  if (evaluationsTable) evaluationsTable.innerHTML = (state.evaluations || []).length
    ? state.evaluations.slice().sort(byDateAscending).map((evaluation) => `<tr><td>${escapeHtml(evaluation.phase || evaluation.timepoint || "—")}</td><td>${formatDate(evaluation.completedAt || evaluation.startedAt || evaluation.createdAt)}</td><td>${escapeHtml(formatConditions(evaluation.context))}</td><td>${escapeHtml(statusLabel(evaluation.quality?.valid === false ? "invalid" : evaluation.status || "pending"))}</td><td>${escapeHtml(evaluation.protocolVersion || evaluation.schemaVersion || "—")}</td></tr>`).join("")
    : '<tr><td colspan="5">Sin evaluaciones.</td></tr>';

  const sessionsTable = $("adhdSessionsTable");
  const sessionRecords = uniqueSessionRecords(state.sessions);
  if (sessionsTable) sessionsTable.innerHTML = sessionRecords.length
    ? sessionRecords.slice().sort(compareAdhdSessionNumbers).map((session) => `<tr><td>${escapeHtml(resolveAdhdSessionNumber(session) ?? "—")}</td><td>${escapeHtml(statusLabel(session.status))}</td><td>${escapeHtml((session.taskResultIds || session.completedTaskIds || []).length)}</td><td>${formatNumber(session.selfRating?.fatigue)}</td><td>${escapeHtml(statusLabel(session.transferStatus || session.transferChallenge?.status || "pending"))}</td></tr>`).join("")
    : '<tr><td colspan="5">Sin sesiones.</td></tr>';

  renderSessionAdherence(adherence);
  renderAdaptiveHistory(buildAdhdAdaptiveHistoryViewModel(state));
  renderFunctionalProgress(buildAdhdFunctionalProgressViewModel(state));

  const audit = $("adhdProtocolAudit");
  if (audit) audit.textContent = state.program ? JSON.stringify({
    programId: state.program.id || state.program.programId,
    protocolId: state.program.protocolId,
    protocolVersion: state.program.protocolVersion,
    schemaVersion: state.program.schemaVersion,
    profileEngineVersion: state.profile?.profileEngineVersion,
    programEngineVersion: state.plan?.programEngineVersion,
    assessmentSources: (state.evaluations || []).map((evaluation) => ({ id: evaluation.id || evaluation.assessmentId, phase: evaluation.phase, sourceResultIds: evaluation.resultIds || evaluation.taskResultIds || [] }))
  }, null, 2) : "Sin programa cargado.";
}

export function buildAdhdSessionAdherenceViewModel(state = {}) {
  const sessions = uniqueSessionRecords(state.sessions);
  const scheduledSessions = getSessions(state.plan).length;
  const startedStatuses = new Set(["in_progress", "paused", "interrupted", "abandoned", "completed", "completed_with_incomplete_data"]);
  const startedSessions = sessions.filter((session) => startedStatuses.has(String(session.status || "")) || session.hasStarted === true || Boolean(session.startedAt));
  const completedSessions = sessions.filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status));
  const incompleteDataSessions = completedSessions.filter((session) => session.status === "completed_with_incomplete_data");
  const openOrInterruptedSessions = startedSessions.filter((session) => !["completed", "completed_with_incomplete_data"].includes(session.status));
  return {
    hasData: scheduledSessions > 0 || sessions.length > 0,
    scheduledSessions,
    recordedSessions: sessions.length,
    startedSessions,
    completedSessions,
    incompleteDataSessions,
    openOrInterruptedSessions,
    plannedCompletionRate: scheduledSessions > 0 ? completedSessions.length / scheduledSessions : null,
    startedCompletionRate: startedSessions.length > 0 ? completedSessions.length / startedSessions.length : null
  };
}

export function buildAdhdAdaptiveHistoryViewModel(state = {}) {
  return canonicalResultRecords(state)
    .filter((record) => record.adaptiveDecision && typeof record.adaptiveDecision === "object")
    .sort(byDateAscending)
    .map((record, index) => {
      const decision = record.adaptiveDecision;
      return {
        canonicalLabel: `Resultado canónico ${index + 1}`,
        completedAt: record.completedAtIso || record.completedAt || record.updatedAt || record.createdAt || "",
        taskLabel: ADHD_TASK_CATALOG[record.taskId]?.label || "Tarea versionada",
        taskVersion: record.taskVersion || "Versión no registrada",
        decisionLabel: adaptiveDecisionLabel(decision.decision),
        adjustmentLabel: adaptiveAdjustmentLabel(decision),
        evidenceLabel: adaptiveEvidenceLabel(decision),
        safetyLabel: adaptiveSafetyLabel(decision, record),
        valid: record.valid !== false && record.quality?.valid !== false
      };
    });
}

export function buildAdhdFunctionalProgressViewModel(state = {}) {
  const entries = uniqueFunctionalProgressEntries(state);
  const summary = summarizeFunctionalProgressBySource(entries);
  const rows = ["patient", "caregiver", "clinician", "teacher"].map((source) => {
    const item = summary[source] || {};
    return {
      source,
      sourceLabel: functionalSourceLabel(source),
      checkIns: Number(item.checkIns) || 0,
      meanAchievement: finiteOrNull(item.meanAchievement),
      attempts: finiteOrNull(item.attempts),
      successfulAttempts: finiteOrNull(item.successfulAttempts),
      latestStatus: functionalProgressStatusLabel(item.latestStatus),
      latestAt: item.latestAt || ""
    };
  });
  return { hasData: rows.some((row) => row.checkIns > 0), rows };
}

function renderSessionAdherence(model) {
  const container = $("adhdSessionAdherence");
  if (!container) return;
  if (!model.hasData) {
    container.innerHTML = '<p class="adhd-empty">Sin sesiones programadas ni iniciadas. No puede calcularse adherencia.</p>';
    setText("adhdSessionAdherenceNote", "Una sesión sin registro no se interpreta como abandono.");
    return;
  }
  const items = [
    ["Programadas", model.scheduledSessions || "Dato insuficiente", model.scheduledSessions ? "denominador del plan" : "plan sin sesiones disponibles"],
    ["Iniciadas", model.startedSessions.length, `de ${model.recordedSessions} registros de sesión`],
    ["Completadas / plan", formatRateOrInsufficient(model.plannedCompletionRate), model.scheduledSessions ? `${model.completedSessions.length} de ${model.scheduledSessions}` : "sin denominador programado"],
    ["Completadas / iniciadas", formatRateOrInsufficient(model.startedCompletionRate), model.startedSessions.length ? `${model.completedSessions.length} de ${model.startedSessions.length}` : "sin sesiones iniciadas"]
  ];
  container.innerHTML = items.map(([label, value, detail]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
  const caveats = [];
  if (model.incompleteDataSessions.length) caveats.push(`${model.incompleteDataSessions.length} completada(s) con datos incompletos`);
  if (model.openOrInterruptedSessions.length) caveats.push(`${model.openOrInterruptedSessions.length} abierta(s), pausada(s) o interrumpida(s)`);
  setText("adhdSessionAdherenceNote", caveats.length
    ? `${caveats.join(" · ")}. Se reportan por separado y no se consideran automáticamente abandono.`
    : "La adherencia usa conteos observados y su denominador; no demuestra eficacia clínica.");
}

function renderAdaptiveHistory(rows) {
  const table = $("adhdAdaptiveHistoryTable");
  if (!table) return;
  table.innerHTML = rows.length
    ? rows.map((row) => `<tr><td>${escapeHtml(row.canonicalLabel)}</td><td>${formatDate(row.completedAt)}</td><td>${escapeHtml(row.taskLabel)}<br><small>${escapeHtml(row.taskVersion)}</small></td><td>${escapeHtml(row.decisionLabel)}</td><td>${escapeHtml(row.adjustmentLabel)}</td><td>${escapeHtml(row.evidenceLabel)}</td><td>${escapeHtml(row.safetyLabel)}</td></tr>`).join("")
    : '<tr><td colspan="7">Sin decisiones adaptativas persistidas en resultados canónicos. Esto no significa que la dificultad haya permanecido estable.</td></tr>';
}

function renderFunctionalProgress(model) {
  const table = $("adhdFunctionalProgressTable");
  if (!table) return;
  if (!model.hasData) {
    table.innerHTML = '<tr><td colspan="6">Sin registros funcionales por fuente. Esto no significa ausencia de dificultad o de cambio.</td></tr>';
    return;
  }
  table.innerHTML = model.rows.map((row) => `<tr><td>${escapeHtml(row.sourceLabel)}</td><td>${escapeHtml(row.checkIns)}</td><td>${row.meanAchievement === null ? "Dato insuficiente" : `${formatNumber(row.meanAchievement * 100)} %`}</td><td>${formatFunctionalAttempts(row)}</td><td>${escapeHtml(row.latestStatus)}</td><td>${row.latestAt ? formatClinicalObservationDate(row.latestAt) : "Sin registro"}</td></tr>`).join("");
}

export function setAssessmentVisible(visible) {
  $("adhdBattery")?.toggleAttribute("hidden", !visible);
}

export function setTaskDialog({ title, description, external = false } = {}) {
  setText("adhdTaskDialogTitle", title || "Tarea cognitiva");
  setText("adhdTaskDialogDescription", description || "Sigue las instrucciones y completa primero la práctica.");
  $("adhdTaskHost")?.toggleAttribute("hidden", external);
  $("adhdTaskFrame")?.toggleAttribute("hidden", !external);
}

export function renderTaskFeedback({ taskLabel = "Tarea", result = {}, previous = null } = {}) {
  const model = buildAdhdTaskFeedbackModel(result, previous);
  setText("adhdFeedbackTitle", `Resultado de ${taskLabel}`);
  setText("adhdFeedbackQuality", model.qualityMessage);
  const metrics = $("adhdFeedbackMetrics");
  if (metrics) metrics.innerHTML = model.items.length
    ? model.items.map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.display)}</strong></li>`).join("")
    : '<li><span>Métricas</span><strong>Dato insuficiente</strong></li>';
  setText("adhdFeedbackComparison", model.comparisonMessage);
}

export function buildAdhdTaskFeedbackModel(result = {}, previous = null) {
  const taskId = String(result.taskId || "");
  const metrics = result.metrics || {};
  const items = feedbackItems(taskId, metrics);
  const currentComparison = feedbackComparisonValue(taskId, metrics);
  const previousComparison = previous ? feedbackComparisonValue(taskId, previous.metrics || {}) : null;
  let comparisonMessage = "Primera aplicación comparable de esta tarea.";
  if (currentComparison && previousComparison && currentComparison.key === previousComparison.key) {
    const delta = currentComparison.value - previousComparison.value;
    comparisonMessage = `Cambio frente a la aplicación previa: ${signedValue(delta, currentComparison.unit)}. Es una comparación intraindividual; no es un percentil ni prueba eficacia clínica.`;
  } else if (previous) {
    comparisonMessage = "La aplicación previa no contiene la misma métrica válida; no se calcula un cambio.";
  }
  const qualityValid = result.valid !== false && result.quality?.valid !== false && metrics.valid !== false;
  return {
    taskId,
    items,
    comparisonMessage,
    qualityMessage: qualityValid
      ? "Resultado válido para revisión descriptiva según los controles disponibles."
      : "Resultado no interpretable o incompleto según control de calidad; se conserva para trazabilidad."
  };
}

function feedbackItems(taskId, metrics) {
  const definitions = {
    cpt_x: [
      ["Precisión", metrics.accuracy, "proportion"],
      ["Tiempo de respuesta medio", metrics.reactionTime?.meanMs, "ms"],
      ["Variabilidad del RT (CV)", metrics.reactionTime?.coefficientOfVariation, "coefficient"]
    ],
    go_nogo: [
      ["Precisión", metrics.accuracy, "proportion"],
      ["Comisiones No-Go", metrics.commissionRate, "proportion"],
      ["RT Go medio", metrics.goReactionTime?.meanMs ?? metrics.reactionTime?.meanMs, "ms"],
      ["Variabilidad del RT (CV)", metrics.goReactionTime?.coefficientOfVariation ?? metrics.reactionTime?.coefficientOfVariation, "coefficient"]
    ],
    nback: [
      ["Precisión", metrics.accuracy, "proportion"],
      ["d-prime", metrics.dPrime, "number"],
      ["RT medio", metrics.reactionTime?.meanMs, "ms"],
      ["Nivel máximo estable", metrics.maximumStableLevel, "number"]
    ],
    stroop: [
      ["Precisión incongruente", metrics.incongruentAccuracy, "proportion"],
      ["RT incongruente medio", metrics.incongruentReactionTime?.meanMs, "ms"],
      ["Costo de interferencia", metrics.interferenceCostMs, "ms"]
    ],
    stop_signal: [
      ["Inhibiciones exitosas", metrics.probabilityInhibit, "proportion"],
      ["SSD medio", metrics.meanSsdMs, "ms"],
      [metrics.ssrtMs === null ? "SSRT" : "SSRT (integration method)", metrics.ssrtMs, "ms"]
    ],
    task_switching: [
      ["Precisión repeat", metrics.repeatAccuracy, "proportion"],
      ["Precisión switch", metrics.switchAccuracy, "proportion"],
      ["Costo de cambio", metrics.switchCostMs, "ms"]
    ],
    temporal_estimation: [
      ["Error absoluto", metrics.absoluteErrorMs, "ms"],
      ["Error relativo absoluto", metrics.absoluteRelativeError, "proportion"],
      ["Sesgo", metrics.biasMs, "ms"]
    ],
    route_planning: [
      ["Eficiencia", metrics.efficiency, "proportion"],
      ["Movimientos adicionales", metrics.excessMoves, "number"],
      ["Tiempo inicial de planificación", metrics.meanPlanningTimeMs, "ms"]
    ]
  };
  const fallback = [
    ["Precisión", metrics.accuracy, "proportion"],
    ["RT medio", metrics.reactionTime?.meanMs ?? metrics.meanRtMs, "ms"],
    ["Variabilidad del RT (CV)", metrics.reactionTime?.coefficientOfVariation ?? metrics.coefficientOfVariation, "coefficient"]
  ];
  return (definitions[taskId] || fallback)
    .filter(([, value]) => finiteOrNull(value) !== null)
    .map(([label, value, unit]) => ({ label, value: Number(value), unit, display: feedbackValue(Number(value), unit) }));
}

function feedbackComparisonValue(taskId, metrics) {
  const definitions = {
    cpt_x: ["accuracy", metrics.accuracy, "proportion_points"],
    go_nogo: ["accuracy", metrics.accuracy, "proportion_points"],
    nback: ["accuracy", metrics.accuracy, "proportion_points"],
    stroop: ["incongruentAccuracy", metrics.incongruentAccuracy, "proportion_points"],
    stop_signal: ["ssrtMs", metrics.ssrtMs, "ms"],
    task_switching: ["switchCostMs", metrics.switchCostMs, "ms"],
    temporal_estimation: ["absoluteRelativeError", metrics.absoluteRelativeError, "proportion_points"],
    route_planning: ["efficiency", metrics.efficiency, "proportion_points"]
  };
  const [key, rawValue, unit] = definitions[taskId] || ["accuracy", metrics.accuracy, "proportion_points"];
  const value = finiteOrNull(rawValue);
  return Number.isFinite(value) ? { key, value, unit } : null;
}

function feedbackValue(value, unit) {
  if (unit === "proportion") return `${formatNumber(value * 100)} %`;
  if (unit === "ms") return `${formatNumber(value)} ms`;
  return formatNumber(value);
}

function signedValue(delta, unit) {
  const scaled = unit === "proportion_points" ? delta * 100 : delta;
  const suffix = unit === "proportion_points" ? " puntos porcentuales" : unit === "ms" ? " ms" : "";
  return `${scaled > 0 ? "+" : ""}${formatNumber(scaled)}${suffix}`;
}

export function showToast(message) {
  const toast = $("adhdToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
}

export function resolveAdhdSessionNumber(session = {}) {
  const value = session.plannedSessionNumber ?? session.sessionNumber ?? session.number;
  return value === null || value === undefined || value === "" ? null : value;
}

function compareAdhdSessionNumbers(left, right) {
  const leftValue = resolveAdhdSessionNumber(left);
  const rightValue = resolveAdhdSessionNumber(right);
  const leftNumeric = finiteOrNull(leftValue);
  const rightNumeric = finiteOrNull(rightValue);
  if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) return leftNumeric - rightNumeric;
  if (Number.isFinite(leftNumeric)) return -1;
  if (Number.isFinite(rightNumeric)) return 1;
  return String(leftValue || "").localeCompare(String(rightValue || ""), "es", { numeric: true });
}

function renderSessionComponentAction(component, index, active) {
  const completed = isCompletedStatus(component.status);
  if (component.taskId) {
    return `<button type="button" class="${completed ? "adhd-secondary" : "adhd-primary"}" data-start-session-task="${escapeHtml(component.taskId)}" data-session-block-id="${escapeHtml(component.id || "")}" ${active || completed ? "disabled" : ""}>${completed ? "Completado" : "Iniciar"}</button>`;
  }
  const kind = component.kind || component.type;
  if (kind === "metacognition") {
    const moduleId = component.moduleId || "";
    return `<button type="button" class="adhd-secondary" data-open-metacognitive-module="${escapeHtml(moduleId)}" data-component-index="${index}" ${active || completed || !moduleId ? "disabled" : ""}>${completed ? "Completado" : "Practicar estrategia"}</button>`;
  }
  if (kind === "functional_transfer") {
    return `<button type="button" class="adhd-secondary" data-complete-component="${index}" ${active || completed ? "disabled" : ""}>${completed ? "Reto asignado" : "Asignar para después"}</button>`;
  }
  return `<button type="button" class="adhd-secondary" data-complete-component="${index}" ${active || completed ? "disabled" : ""}>${completed ? "Completado" : "Marcar completado"}</button>`;
}

function getSessions(plan) {
  return Array.isArray(plan?.sessions) ? plan.sessions : Array.isArray(plan?.schedule) ? plan.schedule : [];
}

function uniqueSessionRecords(sessions = []) {
  const seen = new Set();
  return (Array.isArray(sessions) ? sessions : []).filter((session, index) => {
    if (!session || typeof session !== "object") return false;
    const key = String(session.id || session.sessionId || `record-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalResultRecords(state = {}) {
  const detailed = Array.isArray(state.resultRecords) ? state.resultRecords : [];
  const latest = Array.isArray(state.taskResults)
    ? state.taskResults
    : state.taskResults && typeof state.taskResults === "object"
      ? Object.values(state.taskResults)
      : [];
  const seen = new Set();
  return [...detailed, ...latest].filter((record) => {
    if (!record || typeof record !== "object") return false;
    const resultId = String(record.id || record.resultId || record.idResultado || "");
    if (!resultId || seen.has(resultId)) return false;
    seen.add(resultId);
    return true;
  });
}

function uniqueFunctionalProgressEntries(state = {}) {
  const goalEntries = (Array.isArray(state.goals) ? state.goals : [])
    .flatMap((goal) => Array.isArray(goal?.progress) ? goal.progress : []);
  const challengeEntries = (Array.isArray(state.challenges) ? state.challenges : [])
    .flatMap((challenge) => Array.isArray(challenge?.sourceReports) ? challenge.sourceReports : []);
  const seen = new Set();
  return [...goalEntries, ...challengeEntries].filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const key = String(entry.id || [
      entry.source,
      entry.at || entry.observedAt,
      entry.goalId,
      entry.challengeId
    ].join("|"));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function adaptiveDecisionLabel(value) {
  return ({
    increase: "Aumentar una dimensión",
    decrease: "Reducir una dimensión",
    hold: "Mantener dificultad",
    ssd_increase: "Aumentar SSD",
    ssd_decrease: "Reducir SSD",
    manual_decrease: "Reducción manual"
  })[String(value || "")] || "Decisión versionada registrada";
}

function adaptiveAdjustmentLabel(decision = {}) {
  const adjustment = decision.adjustment && typeof decision.adjustment === "object" ? decision.adjustment : null;
  const dimension = adjustment?.dimension || decision.adjustedDimension;
  if (!dimension || !adjustment) return "Sin cambio de dimensión";
  const descriptor = adaptiveDimensionDescriptor(dimension);
  if (!descriptor) return "Una dimensión versionada fue ajustada";
  const before = finiteOrNull(adjustment.before);
  const after = finiteOrNull(adjustment.after);
  if (before === null || after === null) return `${descriptor.label}: cambio registrado sin valores comparables`;
  return `${descriptor.label}: ${formatAdaptiveValue(before, descriptor.unit)} → ${formatAdaptiveValue(after, descriptor.unit)}`;
}

function adaptiveEvidenceLabel(decision = {}) {
  const window = decision.window && typeof decision.window === "object" ? decision.window : null;
  if (!window) {
    return decision.method === "one_up_one_down_ssd_staircase" || decision.taskId === "stop_signal"
      ? "Staircase SSD basado en el último desenlace válido"
      : "Sin ventana móvil registrada";
  }
  const scored = finiteOrNull(window.observationsScored);
  const minimum = finiteOrNull(window.minimumObservations);
  const count = scored === null ? "conteo no disponible" : minimum === null ? `${scored} observaciones` : `${scored} de ${minimum} observaciones mínimas`;
  const band = ({
    insufficient_data: "Datos insuficientes",
    below_target: "Debajo del rango configurable",
    within_target: "Dentro del rango configurable",
    above_target: "Sobre el rango configurable",
    ssd_staircase_only: "Staircase SSD"
  })[String(window.band || "")] || "Banda no disponible";
  return `${band} · ${count}`;
}

function adaptiveSafetyLabel(decision = {}, record = {}) {
  if (record.valid === false || record.quality?.valid === false) return "Resultado no interpretable; decisión conservada para auditoría";
  if (decision.window?.burden?.high === true || finiteOrNull(decision.fatigue) >= 7 || finiteOrNull(decision.frustration) >= 7) {
    return "Carga alta registrada; el aumento queda bloqueado";
  }
  if (decision.window?.speedAccuracyGuard?.active === true) return "Guarda velocidad–precisión activa";
  if (decision.window?.burden?.high === false && decision.window?.speedAccuracyGuard?.active === false) return "Sin guardas activas en esta decisión";
  return "Sin señal de seguridad estructurada disponible";
}

function adaptiveDimensionDescriptor(dimension) {
  return ({
    level: { label: "Nivel N", unit: "number" },
    intervalMs: { label: "Intervalo entre estímulos", unit: "ms" },
    trialCount: { label: "Número de ensayos", unit: "number" },
    distractorLevel: { label: "Nivel de distractores", unit: "number" },
    isiMs: { label: "Intervalo entre estímulos", unit: "ms" },
    targetRarity: { label: "Rareza del objetivo", unit: "number" },
    durationMinutes: { label: "Duración", unit: "minutes" },
    perceptualSimilarity: { label: "Similitud perceptual", unit: "number" },
    responseWindowMs: { label: "Ventana de respuesta", unit: "ms" },
    noGoRarity: { label: "Rareza No-Go", unit: "number" },
    interferenceLevel: { label: "Nivel de interferencia", unit: "number" },
    incongruentProportion: { label: "Proporción incongruente", unit: "proportion" },
    switchProportion: { label: "Proporción de cambio", unit: "proportion" },
    intervalRangeLevel: { label: "Rango de intervalos", unit: "number" },
    planningDepth: { label: "Profundidad de planificación", unit: "number" },
    gridSize: { label: "Tamaño de cuadrícula", unit: "number" },
    ssdMs: { label: "Demora de señal de parada (SSD)", unit: "ms" }
  })[dimension] || null;
}

function formatAdaptiveValue(value, unit) {
  if (unit === "ms") return `${formatNumber(value)} ms`;
  if (unit === "minutes") return `${formatNumber(value)} min`;
  if (unit === "proportion") return `${formatNumber(value * 100)} %`;
  return formatNumber(value);
}

function functionalSourceLabel(source) {
  return ({
    patient: "Autorreporte del paciente",
    caregiver: "Reporte de cuidador",
    clinician: "Observación clínica",
    teacher: "Reporte docente/escolar"
  })[source] || "Fuente estructurada";
}

function functionalProgressStatusLabel(status) {
  return ({
    achieved: "Logrado",
    partial: "Parcial",
    not_achieved: "No logrado",
    not_observed: "Sin observación"
  })[String(status || "")] || "Sin observación";
}

function formatFunctionalAttempts(row) {
  if (row.attempts === null) return "Dato insuficiente";
  if (row.successfulAttempts === null) return `${formatNumber(row.attempts)} registrados`;
  return `${formatNumber(row.successfulAttempts)} de ${formatNumber(row.attempts)}`;
}

function formatRateOrInsufficient(value) {
  const rate = finiteOrNull(value);
  return rate === null ? "Dato insuficiente" : `${formatNumber(rate * 100)} %`;
}

function getSessionComponents(session) {
  if (!session) return [];
  if (Array.isArray(session.components)) return session.components;
  if (Array.isArray(session.blocks)) return session.blocks;
  if (Array.isArray(session.tasks)) return session.tasks.map((task) => typeof task === "string" ? { type: "task", taskId: task } : task);
  return [];
}

function baselineStatus(evaluations = []) {
  const baseline = evaluations.find((evaluation) => (evaluation.phase || evaluation.timepoint) === "T0");
  return baseline ? statusLabel(baseline.status) : "Pendiente";
}

function resolveNextStep(state) {
  if (!state.patientId) return "Selecciona un paciente.";
  if (!(state.evaluations || []).length) return "Registrar contexto y comenzar evaluación basal.";
  if (!state.profile) return "Completar la batería y generar el perfil.";
  if (!state.plan) return "Revisar el perfil y generar un plan editable.";
  return "Iniciar o retomar la siguiente sesión programada.";
}

function resolveNextReassessment(plan, completedCount, evaluations = []) {
  if (!plan) return "Por definir";
  const completedPhases = new Set(evaluations
    .filter((evaluation) => evaluation.status === "completed" && evaluation.quality?.valid === true)
    .map((evaluation) => evaluation.phase || evaluation.timepoint));
  if (!completedPhases.has("T0")) return "T0 válida pendiente";
  const intermediate = Number(plan.intermediateReassessmentSession || plan.configuration?.intermediateReassessmentSession || 0);
  const final = Number(plan.finalReassessmentSession || plan.configuration?.finalReassessmentSession || getSessions(plan).length);
  if (!completedPhases.has("T1") && intermediate && completedCount < intermediate) return `T1 después de sesión ${intermediate}`;
  if (!completedPhases.has("T1") && intermediate && completedCount < final) return "T1 intermedia pendiente (opcional)";
  if (!completedPhases.has("T2") && final && completedCount < final) return `T2 después de sesión ${final}`;
  if (!completedPhases.has("T2")) return "T2 final pendiente ahora";
  if (!completedPhases.has("T3")) return "T3 seguimiento según ventana clínica";
  return "Seguimiento T0–T3 completo";
}

function statusLabel(status) {
  return ({
    pending: "Pendiente", in_progress: "En curso", paused: "Pausado", interrupted: "Interrumpido",
    completed: "Completado", invalid: "No interpretable", complete: "Completo", partial: "Parcial",
    insufficient_data: "Dato insuficiente", functional_only: "Solo información funcional", not_assessed: "No evaluado",
    active: "Activo", archived: "Archivado", draft: "Borrador"
  })[String(status || "")] || String(status || "Pendiente").replaceAll("_", " ");
}

function formatMeasure(measure) {
  if (finiteOrNull(measure.value) === null) return "Dato insuficiente";
  const value = formatNumber(measure.value);
  const unit = ({ ms: "ms", count: "", raw: "", level: "", coefficient: "", proportion: "", proportion_delta: "" })[measure.unit] ?? measure.unit;
  if (measure.unit === "proportion") return `${formatNumber(Number(measure.value) * 100)} %`;
  if (measure.unit === "proportion_delta") return `${Number(measure.value) >= 0 ? "+" : ""}${formatNumber(Number(measure.value) * 100)} puntos %`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatNumber(value) {
  const numeric = finiteOrNull(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(numeric);
}

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", hour12: false });
}

function formatClinicalObservationDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""))) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-MX", { dateStyle: "medium", timeZone: "UTC" });
  }
  return formatDate(value);
}

function formatConditions(context = {}) {
  const parts = [];
  if (finiteOrNull(context.sleepHours) !== null) parts.push(`${context.sleepHours} h sueño`);
  if (finiteOrNull(context.fatigue) !== null) parts.push(`fatiga ${context.fatigue}/10`);
  if (context.deviceClass) parts.push(context.deviceClass);
  if (context.inputMode) parts.push(context.inputMode);
  if (Number(context.focusLosses) > 0) parts.push(`${context.focusLosses} pérdidas de foco`);
  return parts.join(" · ") || "Sin contexto registrado";
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isCompletedStatus(status) {
  return ["completed", "completed_with_incomplete_data"].includes(status);
}

function isFinishedViewStatus(status) {
  return isCompletedStatus(status) || status === "skipped";
}

function cleanViewText(value, maximum) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function byDateAscending(a, b) {
  return dateTimestamp(a?.completedAtIso || a?.completedAt || a?.updatedAt || a?.createdAt || a?.startedAt || 0)
    - dateTimestamp(b?.completedAtIso || b?.completedAt || b?.updatedAt || b?.createdAt || b?.startedAt || 0);
}

function byDateDescending(a, b) {
  return -byDateAscending(a, b);
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = String(value ?? "");
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function dateTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
