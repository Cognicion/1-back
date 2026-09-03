import { auth } from "./firebase.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";
import { listarPacientes, obtenerPermisoMedico, obtenerUsuario } from "./services/usuarios.js?v=20260826-cuenta-profesional-gratuita-v1";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { hasClinicalProfessionalProfile, isAdministrator } from "./utils/roles.js?v=20260719-admin-universal-modules";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  ADHD_PROTOCOL_ID,
  ADHD_PROTOCOL_VERSION,
  ADHD_TASK_CATALOG,
  getBatteryDefinition,
  getFunctionalDifficulty,
  resolveAgeModality
} from "./adhd/config/adhdProtocol.js";
import { buildAdhdProfile } from "./adhd/core/adhdProfileEngine.js";
import { adaptAdhdDifficulty } from "./adhd/core/adhdAdaptiveEngine.js";
import { applyAdhdProgramEdits, generateAdhdProgram } from "./adhd/core/adhdProgramEngine.js";
import {
  completeAdhdSession,
  createAdhdSession,
  hydrateAdhdSession,
  interruptAdhdBlock,
  recordAdhdBlockResult,
  resumeAdhdSession,
  startAdhdBlock,
  startAdhdSession
} from "./adhd/core/adhdSessionEngine.js";
import {
  buildAdhdLongitudinalSummary,
  createAdhdReassessmentConfiguration
} from "./adhd/core/adhdLongitudinalEngine.js";
import {
  buildAdhdResearchDataset,
  exportAdhdResearchCsv,
  exportAdhdResearchJson
} from "./adhd/core/adhdResearchExport.js";
import { buildAdhdSofiaSummary } from "./adhd/integration/adhdSofiaBridge.js";
import {
  buildExistingTaskBootstrapName,
  buildExistingTaskUrl,
  createTaskLaunchContext
} from "./adhd/adapters/existingTaskAdapters.js";
import { createAdhdTaskBridgeHost } from "./adhd/integration/adhdTaskPageBridge.js";
import {
  archiveAdhdProgram,
  clearAdhdDraft,
  createAdhdProgramRecord,
  crearIdEstableAdhd,
  loadAdhdDraft,
  loadAdhdProgramBundle,
  saveAdhdDraft,
  saveAdhdEvaluation,
  saveAdhdGoal,
  saveAdhdPlan,
  saveAdhdProfile,
  saveAdhdSession,
  saveAdhdTaskResult,
  saveAdhdTransferChallenge,
  saveProgram,
  saveProgramAudit,
  syncPendingAdhdWrites
} from "./adhd/services/adhdPersistenceAdapter.js?v=20260902-adhd-launch-recovery-v3";
import {
  applyTransferOutcomeToGoal,
  createTransferChallenge,
  normalizeFunctionalGoal,
  recordTransferOutcome,
  validateFunctionalGoal
} from "./adhd/services/adhdFunctionalTransferService.js";
import {
  createTechnicalMonitor,
  detectDeviceContext,
  normalizeAssessmentContext
} from "./adhd/services/adhdTechnicalContext.js";
import {
  buildMetacognitiveModuleResult,
  closeMetacognitiveModuleDialog,
  downloadTextFile,
  openMetacognitiveModuleDialog,
  readMetacognitiveModuleDialogDraft,
  refreshMetacognitiveModuleDialogState,
  renderBattery,
  renderClinicalPanel,
  renderDashboard,
  renderFunctionalDifficulties,
  renderPatientContext,
  renderPatientOptions,
  renderPlan,
  renderProfile,
  renderTaskFeedback,
  renderTodaySession,
  setAdhdStatus,
  setAssessmentVisible,
  setTaskDialog,
  showAdhdView,
  showToast
} from "./adhd/ui/adhdProgramView.js";
import { renderLongitudinalChart } from "./adhd/ui/adhdLongitudinalChart.js";

aplicarAparienciaGuardada();

const $ = (id) => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const FINISHED_SESSION_STATUSES = new Set(["completed", "completed_with_incomplete_data"]);
const DEFAULT_ADAPTIVE_DIFFICULTY = Object.freeze({
  nback: Object.freeze({ level: 1, intervalMs: 2000, trialCount: 20 }),
  cpt_x: Object.freeze({ distractorLevel: 0, isiMs: 1000, targetRarity: 0, durationMinutes: 3 }),
  go_nogo: Object.freeze({ perceptualSimilarity: 0, responseWindowMs: 1000, noGoRarity: 1 }),
  stroop: Object.freeze({ interferenceLevel: 0, responseWindowMs: 2500, incongruentProportion: 0.3 }),
  task_switching: Object.freeze({ responseWindowMs: 1400, switchProportion: 0.5, trialCount: 64 }),
  temporal_estimation: Object.freeze({ intervalRangeLevel: 1, trialCount: 20 }),
  route_planning: Object.freeze({ planningDepth: 2, gridSize: 6, distractorLevel: 2 }),
  stop_signal: Object.freeze({ ssdMs: 250 })
});

const state = {
  user: null,
  actor: null,
  clinician: false,
  canEditPatient: false,
  patients: [],
  patientId: "",
  patient: null,
  ageMode: null,
  programId: "",
  program: null,
  evaluations: [],
  profiles: [],
  plans: [],
  goals: [],
  sessions: [],
  challenges: [],
  taskResults: {},
  resultRecords: [],
  audit: [],
  currentEvaluation: null,
  assessmentResults: {},
  batteryTasks: [],
  profile: null,
  plan: null,
  currentSession: null,
  currentChallenge: null,
  followUpChallenge: null,
  pendingAssessmentPhase: "T0",
  technicalMonitor: null,
  activeTask: null,
  activeRunner: null,
  activeBridge: null,
  activeTaskSettled: false,
  pendingFeedback: null,
  sessionRecoveredAfterReload: false,
  adaptiveDecisions: {},
  adaptiveConfigurations: {},
  draftTimer: null,
  busy: false
};

bindStaticEvents();
renderFunctionalDifficulties();
setDefaultReviewDate();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  state.user = user;
  try {
    state.actor = await obtenerUsuario(user.uid, { forzar: true });
    if (!state.actor) throw new Error("actor_profile_not_found");
    await sincronizarAparienciaUsuario(user.uid, state.actor).catch(() => {});
    state.clinician = isAdministrator(state.actor) || hasClinicalProfessionalProfile(state.actor);
    configureRoleView();
    await loadAuthorizedPatients();
    $("adhdApp")?.setAttribute("aria-busy", "false");
  } catch (error) {
    reportError(error, "No fue posible inicializar el programa con esta cuenta.");
  }
});

function bindStaticEvents() {
  document.querySelectorAll("[data-adhd-nav], [data-adhd-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.adhdNav || button.dataset.adhdTab;
      if (target === "clinician" && !state.clinician) return;
      showAdhdView(target);
    });
  });
  $("adhdPrimaryAction")?.addEventListener("click", () => {
    const target = $("adhdPrimaryAction")?.dataset.target;
    if (target === "patient") $("adhdPatientSelect")?.focus();
    else showAdhdView(target || "assessment");
  });
  $("adhdPatientSelect")?.addEventListener("change", (event) => selectPatient(event.target.value));
  $("adhdIntakeForm")?.addEventListener("submit", beginAssessment);
  $("adhdIntakeForm")?.addEventListener("input", (event) => {
    event.target?.removeAttribute?.("aria-invalid");
    scheduleIntakeDraft();
  });
  $("adhdIntakeForm")?.addEventListener("change", scheduleIntakeDraft);
  $("adhdSaveAssessmentDraft")?.addEventListener("click", () => saveIntakeDraft(true));
  $("adhdBatteryTasks")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-start-adhd-task]");
    if (button) startTask(button.dataset.startAdhdTask, "assessment");
  });
  $("adhdGenerateProfile")?.addEventListener("click", generateProfileFromAssessment);
  $("adhdSuspendAssessment")?.addEventListener("click", suspendAssessment);
  $("adhdReviewAssessment")?.addEventListener("click", () => showAdhdView("assessment"));
  $("adhdGoToPlan")?.addEventListener("click", () => {
    showAdhdView("plan");
    if (state.canEditPatient && !state.plan) previewPlan();
  });
  $("adhdPlanConfig")?.addEventListener("change", handlePlanConfigurationChange);
  $("adhdPlanConfig")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.canEditPatient) {
      showToast("Este acceso al expediente es de solo lectura.");
      return;
    }
    previewPlan();
  });
  $("adhdSavePlan")?.addEventListener("click", activatePlan);
  $("adhdAddPlanItem")?.addEventListener("click", addPlanExercise);
  $("adhdEditGoal")?.addEventListener("click", editPrimaryGoal);
  $("adhdRemoveGoal")?.addEventListener("click", deactivatePrimaryGoal);
  $("adhdSessionPlanList")?.addEventListener("click", handlePlanItemAction);
  $("adhdStartSession")?.addEventListener("click", startOrResumeTodaySession);
  $("adhdTodayComponents")?.addEventListener("click", handleTodayComponentAction);
  $("adhdMetacognitiveForm")?.addEventListener("input", refreshMetacognitiveModuleDialogState);
  $("adhdMetacognitiveForm")?.addEventListener("change", refreshMetacognitiveModuleDialogState);
  $("adhdCloseMetacognitiveModule")?.addEventListener("click", closeMetacognitiveModuleDialog);
  $("adhdCancelMetacognitiveModule")?.addEventListener("click", closeMetacognitiveModuleDialog);
  $("adhdSaveMetacognitiveModule")?.addEventListener("click", saveMetacognitiveModule);
  $("adhdMetacognitiveDialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMetacognitiveModuleDialog();
  });
  $("adhdSaveTransfer")?.addEventListener("click", saveTransferOutcome);
  $("adhdCompleteSession")?.addEventListener("click", saveSelfRatingAndCompleteSession);
  $("adhdCloseTask")?.addEventListener("click", () => interruptActiveTask("dialog_closed"));
  $("adhdPauseTask")?.addEventListener("click", () => interruptActiveTask("user_pause_restart_required"));
  $("adhdInterruptTask")?.addEventListener("click", () => interruptActiveTask("user_ended_block"));
  $("adhdReduceDifficulty")?.addEventListener("click", reduceActiveTaskDifficulty);
  $("adhdTaskDialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    interruptActiveTask("dialog_cancelled");
  });
  $("adhdSaveTaskFeedback")?.addEventListener("click", () => completeTaskFeedback(false));
  $("adhdSkipTaskFeedback")?.addEventListener("click", () => completeTaskFeedback(true));
  $("adhdFeedbackDialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    completeTaskFeedback(true);
  });
  $("adhdStartReassessment")?.addEventListener("click", () => $("adhdReassessmentDialog")?.showModal());
  $("adhdConfirmReassessment")?.addEventListener("click", confirmReassessment);
  $("adhdExportJson")?.addEventListener("click", () => exportResearch("json"));
  $("adhdExportCsv")?.addEventListener("click", () => exportResearch("csv"));
  window.addEventListener("pagehide", () => {
    if (state.activeTask) interruptActiveTask("page_hidden");
    state.technicalMonitor?.markInterruption("page_hidden");
  });
}

function configureRoleView() {
  document.querySelectorAll('[data-adhd-nav="clinician"], [data-adhd-tab="clinician"]').forEach((node) => {
    node.hidden = !state.clinician;
  });
  ["adhdAddPlanItem", "adhdEditGoal", "adhdRemoveGoal", "adhdSavePlan", "adhdStartReassessment"].forEach((id) => {
    const node = $(id);
    if (node) node.hidden = !state.canEditPatient;
  });
  $("adhdPlanConfig")?.querySelectorAll("input, select, button").forEach((node) => {
    node.disabled = !state.canEditPatient;
  });
  const generate = $("adhdGenerateProfile");
  if (generate) {
    generate.textContent = state.canEditPatient ? "Generar perfil para revisión" : "Pendiente de revisión profesional";
  }
  const createAssessment = $("adhdCreateAssessment");
  if (createAssessment) createAssessment.disabled = state.clinician && !state.canEditPatient;
}

async function loadAuthorizedPatients() {
  setAdhdStatus("Verificando expedientes autorizados…");
  if (!state.clinician) {
    state.patients = [{ id: state.user.uid, label: patientLabel(state.actor), data: state.actor }];
    renderPatientOptions($("adhdPatientSelect"), state.patients, state.user.uid);
    $("adhdPatientSelect").disabled = true;
    await selectPatient(state.user.uid);
    return;
  }
  const snapshot = await listarPacientes(state.user.uid, { forzar: true });
  state.patients = snapshot.docs.map((item) => ({
    id: item.id,
    label: patientLabel(item.data()),
    data: item.data()
  }));
  const requested = new URLSearchParams(window.location.search).get("id")
    || new URLSearchParams(window.location.search).get("paciente")
    || "";
  const selected = state.patients.some((patient) => patient.id === requested) ? requested : "";
  renderPatientOptions($("adhdPatientSelect"), state.patients, selected);
  if (selected) await selectPatient(selected);
  else {
    renderPatientContext({ actorMode: "Vista clínica", clinician: true });
    renderAll();
    setAdhdStatus("Selecciona un paciente autorizado para cargar o crear su programa.");
  }
}

async function selectPatient(patientId) {
  const selected = state.patients.find((patient) => patient.id === patientId);
  if (!selected) {
    resetPatientState();
    renderAll();
    setAdhdStatus("Selecciona un paciente autorizado.");
    return;
  }
  setBusy(true, "Cargando programa longitudinal…");
  try {
    resetTechnicalMonitor();
    state.patientId = selected.id;
    state.patient = selected.data || await obtenerUsuario(selected.id);
    state.canEditPatient = await resolvePatientEditAccess(state.patientId, state.patient);
    configureRoleView();
    state.programId = crearIdEstableAdhd("program", state.patientId, ADHD_PROTOCOL_ID);
    const age = calculateAge(state.patient);
    state.ageMode = resolveAgeModality(age);
    $("adhdAge").value = Number.isFinite(age) ? String(age) : "";
    renderPatientContext({
      actorMode: state.clinician ? "Vista clínica" : "Vista del paciente",
      patientName: selected.label,
      ageMode: state.ageMode,
      clinician: state.clinician
    });
    let bundle = await loadAdhdProgramBundle({ patientId: state.patientId, programId: state.programId });
    if (bundle?.pendingSync && globalThis.navigator?.onLine !== false) {
      const sync = await syncPendingAdhdWrites({ patientId: state.patientId, programId: state.programId });
      if (!sync.pendingSync) {
        bundle = await loadAdhdProgramBundle({ patientId: state.patientId, programId: state.programId });
      } else {
        bundle = { ...bundle, pendingSync: true, localDraftCount: sync.localDraftCount };
      }
    }
    applyBundle(bundle);
    if (state.sessionRecoveredAfterReload) await persistCurrentSession();
    await restoreIntakeDraft();
    renderAll();
    if (state.pendingFeedback) {
      renderTaskFeedback(state.pendingFeedback);
      showDialog($("adhdFeedbackDialog"));
    }
    if (bundle?.loadErrorCode) {
      setAdhdStatus("Se cargó un respaldo local, pero Firestore no está disponible. Los cambios quedarán pendientes de sincronización.", "warning");
    } else if (bundle?.pendingSync) {
      setAdhdStatus(`Programa recuperado con ${bundle.localDraftCount || 1} cambio(s) local(es) pendiente(s) de sincronización.`, "warning");
    } else if (!state.program) {
      setAdhdStatus(
        state.clinician
          ? "No existe un programa TDAH para este expediente. Puedes iniciar la evaluación basal."
          : "Aún no existe un programa habilitado. Solicita al profesional tratante que lo cree.",
        "warning"
      );
    } else if (state.clinician && !state.canEditPatient) {
      setAdhdStatus("Programa cargado en modo de solo lectura. Este permiso no permite generar perfil, editar ni activar el plan.", "warning");
    } else if (state.sessionRecoveredAfterReload) {
      setAdhdStatus("Se recuperó una sesión interrumpida. El bloque activo se descartó en un límite seguro y quedó listo para reiniciarse.", "warning");
    } else {
      setAdhdStatus("Programa cargado. Las tareas y sesiones pueden reanudarse por bloque.", "success");
    }
  } catch (error) {
    reportError(error, "No fue posible cargar el programa de este expediente.");
  } finally {
    setBusy(false);
  }
}

function applyBundle(bundle) {
  state.program = bundle?.program || null;
  state.evaluations = bundle?.evaluations || [];
  state.profiles = bundle?.profiles || [];
  state.plans = bundle?.plans || [];
  state.goals = bundle?.goals || [];
  state.sessions = bundle?.sessions || [];
  state.challenges = bundle?.challenges || [];
  state.taskResults = bundle?.taskResults || {};
  state.resultRecords = bundle?.resultRecords || Object.values(bundle?.taskResults || {});
  state.adaptiveDecisions = {};
  state.adaptiveConfigurations = {};
  [...state.resultRecords].sort(byCompletedDate).forEach((record) => {
    const decision = record?.adaptiveDecision;
    if (!record?.taskId || !decision?.nextDifficulty) return;
    state.adaptiveDecisions[record.taskId] = decision;
    state.adaptiveConfigurations[record.taskId] = { ...decision.nextDifficulty };
  });
  state.audit = bundle?.audit || [];
  state.currentEvaluation = latestEvaluationForWork(state.evaluations);
  state.profile = bundle?.profile || latestByDate(state.profiles);
  state.plan = bundle?.plan || latestByDate(state.plans);
  state.assessmentResults = resultsForEvaluation(state.currentEvaluation?.id || state.currentEvaluation?.assessmentId);
  state.batteryTasks = state.currentEvaluation
    ? getBatteryDefinition(state.currentEvaluation.batteryType || "essential")
    : [];
  state.currentSession = resolveExistingSession();
  state.currentChallenge = resolveCurrentChallenge();
  state.followUpChallenge = resolvePendingFollowUpChallenge();
  state.pendingFeedback = resolvePendingSessionFeedback();
}

function resetPatientState() {
  resetTechnicalMonitor();
  Object.assign(state, {
    patientId: "", patient: null, ageMode: null, programId: "", program: null, canEditPatient: false,
    evaluations: [], profiles: [], plans: [], goals: [], sessions: [], challenges: [],
    taskResults: {}, resultRecords: [], audit: [], currentEvaluation: null,
    assessmentResults: {}, batteryTasks: [], profile: null, plan: null,
    currentSession: null, currentChallenge: null, followUpChallenge: null, pendingFeedback: null,
    adaptiveDecisions: {}, adaptiveConfigurations: {}, sessionRecoveredAfterReload: false
  });
  configureRoleView();
  closeDialog($("adhdFeedbackDialog"));
}

async function beginAssessment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = $("adhdIntakeError");
  errorNode.textContent = "";
  if (state.busy) {
    errorNode.textContent = "Espera a que termine la operación en curso antes de iniciar la batería.";
    return;
  }
  if (!state.patientId) {
    errorNode.textContent = "Selecciona el expediente del paciente antes de iniciar la batería.";
    setAdhdStatus("Selecciona un paciente autorizado para guardar la evaluación en su expediente.", "warning");
    $("adhdPatientSelect")?.focus();
    return;
  }
  if (state.clinician && !state.canEditPatient) {
    errorNode.textContent = "Este permiso permite consultar, pero no iniciar ni modificar evaluaciones.";
    setAdhdStatus("Este permiso permite consultar, pero no iniciar ni modificar evaluaciones.", "warning");
    return;
  }
  if (!validateAssessmentForm(form, errorNode)) return;
  const intake = readIntakeForm();
  const modality = resolveAgeModality(intake.age);
  if (!modality) {
    errorNode.textContent = "Registra una edad válida para seleccionar la modalidad.";
    return;
  }
  if (!modality.standardProgramAvailable) {
    errorNode.textContent = modality.notice;
    setAdhdStatus(modality.notice, "warning");
    return;
  }
  if (!state.program && !state.clinician) {
    errorNode.textContent = "El programa debe ser habilitado por un profesional antes de iniciar la evaluación.";
    return;
  }
  const requestedPhase = state.pendingAssessmentPhase || "T0";
  const existingPhase = state.evaluations.find((evaluation) => evaluation.phase === requestedPhase && evaluation.status !== "archived");
  if (existingPhase) {
    if (!["completed", "completed_pending_profile"].includes(existingPhase.status)) {
      await resumeExistingAssessment(existingPhase, errorNode);
      return;
    }
    errorNode.textContent = `${requestedPhase} ya está cerrada. No se sobrescribe ni se repite dentro del mismo registro longitudinal.`;
    return;
  }
  const goalValidation = validateFunctionalGoal(intake.goal);
  if (!goalValidation.valid) {
    errorNode.textContent = "Completa acción, contexto, frecuencia, criterio observable y fecha de revisión del objetivo.";
    return;
  }
  let firstTaskId = "";
  setAssessmentSubmitBusy(true);
  setBusy(true, "Preparando batería y forma reproducible…");
  try {
    state.ageMode = modality;
    if (!state.program) await createProgramRoot();
    resetTechnicalMonitor();
    state.technicalMonitor = createTechnicalMonitor();
    const technical = await state.technicalMonitor.start();
    const phase = requestedPhase;
    const assessmentId = crearIdEstableAdhd("evaluation", state.programId, phase, nowIso());
    const tasks = getBatteryDefinition(intake.batteryType);
    const formConfiguration = createAdhdReassessmentConfiguration({
      phase,
      taskIds: tasks.map((task) => task.id),
      baseSeed: `${state.programId}:${phase}:${assessmentId}`,
      metricConfigurations: fixedAssessmentMetricConfigurations(tasks.map((task) => task.id))
    });
    const context = normalizeAssessmentContext(intake, technical);
    const goal = { ...goalValidation.goal, id: crearIdEstableAdhd("goal", state.programId, phase, goalValidation.goal.action) };
    const evaluation = {
      id: assessmentId,
      assessmentId,
      phase,
      status: "in_progress",
      batteryType: intake.batteryType,
      taskIds: tasks.map((task) => task.id),
      resultIds: [],
      validResultIds: [],
      context,
      functionalDifficultyIds: intake.functionalDifficultyIds,
      goalIds: [goal.id],
      formConfiguration,
      protocolId: ADHD_PROTOCOL_ID,
      protocolVersion: ADHD_PROTOCOL_VERSION,
      administration: createAssessmentAdministration(),
      telemetryEnabled: intake.telemetryEnabled,
      startedAt: nowIso(),
      createdAtIso: nowIso()
    };
    const persistenceOperations = [
      saveAdhdEvaluation({ patientId: state.patientId, programId: state.programId, id: assessmentId, data: evaluation }),
      saveAdhdGoal({ patientId: state.patientId, programId: state.programId, id: goal.id, data: goal })
    ];
    if (state.clinician) {
      persistenceOperations.push(saveProgram({
        patientId: state.patientId,
        programId: state.programId,
        data: {
          ...state.program,
          status: "baseline_in_progress",
          activeEvaluationId: assessmentId,
          telemetryEnabled: intake.telemetryEnabled
        }
      }));
    }
    const [evaluationSave, goalSave] = await Promise.all(persistenceOperations);
    evaluation.pendingSync = evaluationSave.pendingSync;
    goal.pendingSync = goalSave.pendingSync;
    state.currentEvaluation = evaluation;
    state.evaluations = upsertById(state.evaluations, evaluation);
    state.goals = upsertById(state.goals, goal);
    state.batteryTasks = tasks;
    firstTaskId = tasks[0]?.id || "";
    state.assessmentResults = {};
    state.pendingAssessmentPhase = "T0";
    if (state.clinician) {
      state.program = { ...state.program, status: "baseline_in_progress", activeEvaluationId: assessmentId, telemetryEnabled: intake.telemetryEnabled };
    }
    await clearAdhdDraft({ patientId: state.patientId, programId: state.programId, kind: "intake", id: "current" }).catch(() => {});
    void auditEvent("assessment_started", { phase, evaluationId: assessmentId, batteryType: intake.batteryType });
    setAssessmentVisible(true);
    renderAll();
    showAdhdView("assessment");
    setAdhdStatus("Batería preparada. Cada tarea inicia con práctica no puntuada y puede reanudarse por bloque.", "success");
  } catch (error) {
    const message = authorizationAwareMessage(error, "No fue posible iniciar la evaluación; el trabajo recuperable se conserva solo si el fallo es de conectividad.");
    errorNode.textContent = `${message} Código: ${String(error?.code || error?.name || "unknown_error")}.`;
    reportError(error, message);
  } finally {
    setBusy(false);
    setAssessmentSubmitBusy(false);
  }
  if (firstTaskId) {
    $("adhdBattery")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const launched = await startTask(firstTaskId, "assessment");
    if (!launched && !errorNode.textContent) {
      errorNode.textContent = "La evaluación quedó guardada, pero otra acción requiere atención antes de abrir la primera tarea.";
    }
  }
}

async function resumeExistingAssessment(evaluation, errorNode) {
  const evaluationId = evaluation.assessmentId || evaluation.id;
  state.currentEvaluation = evaluation;
  state.batteryTasks = getBatteryDefinition(evaluation.batteryType || "essential");
  state.assessmentResults = resultsForEvaluation(evaluationId);
  const nextTask = state.batteryTasks.find((task) => state.assessmentResults[task.id]?.status !== "completed");
  setAssessmentVisible(true);
  renderAll();
  showAdhdView("assessment");
  if (!nextTask) {
    errorNode.textContent = "La batería no tiene bloques pendientes. Revisa los resultados guardados antes de crear otra fase.";
    setAdhdStatus(errorNode.textContent, "warning");
    $("adhdBattery")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return false;
  }

  if (evaluation.status === "paused") {
    setAssessmentSubmitBusy(true, "Reanudando batería…");
    setBusy(true, "Reanudando la evaluación guardada…");
    try {
      state.currentEvaluation = { ...evaluation, status: "in_progress", pausedAt: null };
      const saved = await saveAdhdEvaluation({
        patientId: state.patientId,
        programId: state.programId,
        id: evaluationId,
        data: state.currentEvaluation
      });
      state.currentEvaluation.pendingSync = saved.pendingSync;
      state.evaluations = upsertById(state.evaluations, state.currentEvaluation);
    } catch (error) {
      const message = authorizationAwareMessage(error, "No fue posible reanudar la evaluación guardada.");
      errorNode.textContent = `${message} Código: ${String(error?.code || error?.name || "unknown_error")}.`;
      reportError(error, message);
      return false;
    } finally {
      setBusy(false);
      setAssessmentSubmitBusy(false);
    }
  }

  errorNode.textContent = "";
  $("adhdBattery")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const launched = await startTask(nextTask.id, "assessment");
  if (!launched && !errorNode.textContent) {
    errorNode.textContent = "La batería está guardada, pero hay una acción pendiente antes de abrir el siguiente bloque.";
  }
  return launched;
}

async function createProgramRoot() {
  const program = {
    id: state.programId,
    programId: state.programId,
    protocolId: ADHD_PROTOCOL_ID,
    protocolVersion: ADHD_PROTOCOL_VERSION,
    status: "baseline_in_progress",
    patientFacingNoticeAccepted: false,
    createdByRole: "clinician",
    createdAtIso: nowIso()
  };
  const saved = await createAdhdProgramRecord({ patientId: state.patientId, programId: state.programId, data: program });
  program.pendingSync = saved.pendingSync;
  state.program = program;
}

async function startTask(taskId, source = "assessment", requestedSessionBlockId = "") {
  const task = ADHD_TASK_CATALOG[taskId];
  if (!task) {
    setAdhdStatus("No se encontró la tarea solicitada en esta versión de la batería.", "error");
    showToast("No se encontró la tarea solicitada.");
    return false;
  }
  if (state.activeTask) {
    showDialog($("adhdTaskDialog"));
    setAdhdStatus("La tarea ya estaba iniciada; se volvió a abrir el modo de concentración.", "success");
    return true;
  }
  if (state.pendingFeedback) {
    renderTaskFeedback(state.pendingFeedback);
    showDialog($("adhdFeedbackDialog"));
    setAdhdStatus("Cierra el registro posterior del bloque anterior para continuar.", "warning");
    return false;
  }
  if (state.busy) {
    setAdhdStatus("Espera a que termine la operación en curso antes de abrir la tarea.", "warning");
    return false;
  }
  if (source === "assessment" && !state.currentEvaluation) {
    showToast("Primero registra el contexto de evaluación.");
    setAdhdStatus("Primero registra el contexto de evaluación.", "warning");
    return false;
  }
  if (source === "assessment" && state.assessmentResults[taskId]?.status === "completed") {
    showToast("Este bloque ya está cerrado. Para repetirlo debe iniciarse una nueva fase de evaluación versionada.");
    return false;
  }
  let sessionBlock = null;
  if (source === "session") {
    if (!state.currentSession || state.currentSession.status === "paused" || state.currentSession.status === "not_started") {
      await startOrResumeTodaySession();
    }
    if (!state.currentSession) return false;
    sessionBlock = state.currentSession.blocks.find((block) => (
      block.kind === "cognitive_task"
      && block.taskId === taskId
      && block.status === "pending"
      && (!requestedSessionBlockId || block.id === requestedSessionBlockId)
    ));
    if (!sessionBlock) {
      showToast("Esta tarea ya está completada o no pertenece al bloque actual.");
      return false;
    }
    try {
      state.currentSession = startAdhdBlock(state.currentSession, sessionBlock.id, { at: nowIso(), source: "patient_ui" });
      await persistCurrentSession();
    } catch (error) {
      reportError(error, "No fue posible iniciar este bloque de sesión.");
      return false;
    }
  }
  const taskForm = resolveTaskForm(taskId, source);
  const executionConfiguration = source === "assessment"
    ? { ...(taskForm?.metricConfiguration || assessmentMetricConfiguration(taskId)) }
    : task.kind === "native"
      ? nativeDifficultyConfig(taskId)
      : existingDifficultyConfig(taskId);
  const taskConfiguration = {
    ...(taskForm || {}),
    ...executionConfiguration,
    metricConfiguration: { ...executionConfiguration },
    metricConfigurationVersion: taskForm?.metricConfigurationVersion || "1.0.0"
  };
  const taskContext = {
    patientId: state.patientId,
    programId: state.programId,
    sessionId: source === "session" ? state.currentSession?.sessionId : null,
    evaluationId: source === "assessment" ? state.currentEvaluation?.assessmentId : null,
    goalId: state.goals.find((goal) => goal.active !== false)?.id || null,
    challengeId: state.currentChallenge?.id || null,
    mode: source,
    randomSeed: taskForm?.randomSeed,
    configuration: taskConfiguration
  };
  const launchContext = task.kind === "existing"
    ? createTaskLaunchContext(taskId, taskContext)
    : {
        ...taskContext,
        taskId,
        taskVersion: task.taskVersion,
        attemptId: crearIdEstableAdhd("attempt", state.programId, source, taskId, nowIso())
      };
  state.activeTask = {
    taskId,
    source,
    task,
    sessionBlockId: sessionBlock?.id || null,
    launchContext,
    taskForm,
    taskConfiguration,
    metricConfiguration: executionConfiguration
  };
  state.activeTaskSettled = false;
  document.body.classList.add("adhd-focus-mode");
  setTaskDialog({ title: task.label, description: "Completa primero la práctica. Si se interrumpe un ensayo, el bloque deberá reiniciarse.", external: task.kind === "existing" });
  showDialog($("adhdTaskDialog"));
  renderAll();
  if (!state.technicalMonitor) state.technicalMonitor = createTechnicalMonitor();
  await state.technicalMonitor.start();
  state.technicalMonitor.markBlock(taskId, "started");
  try {
    if (task.kind === "native") await launchNativeTask(taskId, taskForm, taskConfiguration);
    else launchExistingTask(taskId, launchContext);
    return true;
  } catch (error) {
    await handleTaskInterruption({ status: "interrupted", valid: false, interruptionReason: "launch_error", errorCode: error?.code || error?.name });
    reportError(error, "La tarea no pudo iniciarse; el bloque quedó listo para reiniciarse.");
    return false;
  }
}

async function launchNativeTask(taskId, taskForm, taskConfiguration) {
  const { runNativeAdhdTask } = await import("./adhd/tasks/adhdNativeTaskRunner.js");
  state.activeRunner = runNativeAdhdTask({
    taskId,
    container: $("adhdTaskHost"),
    seed: taskForm?.randomSeed || `${state.programId}:${taskId}`,
    ageMode: state.ageMode?.id || "adult",
    config: taskConfiguration,
    onComplete: (payload) => handleTaskCompletion(payload),
    onInterrupt: (payload) => handleTaskInterruption(payload)
  });
}

function launchExistingTask(taskId, launchContext) {
  const iframe = $("adhdTaskFrame");
  iframe.name = buildExistingTaskBootstrapName(launchContext);
  iframe.referrerPolicy = "no-referrer";
  state.activeBridge = createAdhdTaskBridgeHost({
    iframe,
    context: launchContext,
    targetOrigin: window.location.origin,
    onResult: (payload) => handleTaskCompletion(payload),
    onError: (payload) => handleTaskInterruption({ status: "interrupted", valid: false, ...payload }),
    onClose: () => handleTaskInterruption({ status: "interrupted", valid: false, interruptionReason: "task_page_closed" })
  });
  iframe.src = buildExistingTaskUrl(taskId, launchContext, window.location.href);
}

async function handleTaskCompletion(payload) {
  if (!state.activeTask || state.activeTaskSettled) return;
  state.activeTaskSettled = true;
  const active = state.activeTask;
  const normalized = normalizeCompletedTaskPayload(active, payload);
  const previousComparable = findPreviousComparableResult(active, normalized);
  const telemetryEnabled = telemetryEnabledForSource(active.source);
  try {
    const saved = await saveAdhdTaskResult({
      patientId: state.patientId,
      programId: state.programId,
      sessionId: active.source === "session" ? state.currentSession?.sessionId : null,
      evaluationId: active.source === "assessment" ? state.currentEvaluation?.assessmentId : null,
      goalId: active.launchContext.goalId,
      challengeId: active.launchContext.challengeId,
      attemptId: active.launchContext.attemptId,
      result: normalized,
      telemetry: extractTelemetry(normalized),
      telemetryEnabled
    });
    const record = {
      id: saved.id,
      ...normalized,
      references: {
        evaluationId: active.source === "assessment" ? state.currentEvaluation?.assessmentId : null,
        sessionId: active.source === "session" ? state.currentSession?.sessionId : null,
        goalId: active.launchContext.goalId || null,
        challengeId: active.launchContext.challengeId || null,
        attemptId: active.launchContext.attemptId
      },
      pendingSync: saved.pendingSync
    };
    state.resultRecords.push(record);
    state.taskResults[active.taskId] = record;
    if (active.source === "assessment") await completeAssessmentTask(active.taskId, record);
    else await completeSessionTask(active, record);
    state.technicalMonitor?.markBlock(active.taskId, "completed");
    await saveProgram({
      patientId: state.patientId,
      programId: state.programId,
      data: { lastActivityAt: nowIso(), lastResultId: saved.id }
    });
    showToast(saved.pendingSync ? "Resultado conservado localmente; sincronización pendiente." : "Bloque guardado.");
    setAdhdStatus("Resultado registrado con métricas, versión, contexto y control de calidad.", "success");
    state.pendingFeedback = {
      taskId: active.taskId,
      taskLabel: active.task.label,
      source: active.source,
      sessionBlockId: active.sessionBlockId,
      resultId: record.id,
      result: record,
      previous: previousComparable
    };
  } catch (error) {
    await recoverActiveSessionBlock(active, "result_persistence_failed");
    reportError(error, authorizationAwareMessage(error, "No fue posible registrar el resultado; se intentó conservar como borrador local por un fallo recuperable."));
  } finally {
    cleanupActiveTask();
    renderAll();
    if (state.pendingFeedback) {
      renderTaskFeedback(state.pendingFeedback);
      showDialog($("adhdFeedbackDialog"));
    }
  }
}

async function completeTaskFeedback(skip = false) {
  const pending = state.pendingFeedback;
  if (!pending || state.busy) return;
  const selfReport = skip ? null : {
    fatigue: boundedRating($("adhdPostBlockFatigue")?.value),
    frustration: boundedRating($("adhdPostBlockFrustration")?.value),
    perceivedConcentration: boundedRating($("adhdPostBlockConcentration")?.value),
    recordedAt: nowIso(),
    source: "patient_ui"
  };
  setBusy(true, skip ? "Cerrando feedback…" : "Guardando registro posterior al bloque…");
  try {
    if (selfReport) {
      if ($("adhdSessionFatigue")) $("adhdSessionFatigue").value = String(selfReport.fatigue ?? 3);
      if ($("adhdSessionFrustration")) $("adhdSessionFrustration").value = String(selfReport.frustration ?? 2);
      if ($("adhdSessionConcentration")) $("adhdSessionConcentration").value = String(selfReport.perceivedConcentration ?? 6);
    }
    const canonicalResultId = pending.result?.id || pending.result?.resultId || pending.resultId;
    let result = { ...pending.result, id: canonicalResultId, resultId: canonicalResultId };
    if (pending.source === "session") {
      const fatigue = selfReport?.fatigue ?? boundedRating($("adhdSessionFatigue")?.value);
      const frustration = selfReport?.frustration ?? boundedRating($("adhdSessionFrustration")?.value);
      const adaptiveDecision = evaluateAdaptation(pending.taskId, result, fatigue, frustration);
      if (adaptiveDecision) {
        result = { ...result, adaptiveDecision };
        pending.result = result;
        state.resultRecords = state.resultRecords.map((record) => record.id === canonicalResultId ? result : record);
        state.taskResults[pending.taskId] = result;
        await saveAdhdTaskResult({
          patientId: state.patientId,
          programId: state.programId,
          resultId: canonicalResultId,
          sessionId: state.currentSession?.sessionId || result.references?.sessionId || null,
          goalId: result.context?.goalId || result.references?.goalId || null,
          challengeId: result.context?.challengeId || result.references?.challengeId || null,
          attemptId: result.references?.attemptId || result.attemptId,
          result,
          telemetry: extractTelemetry(result),
          telemetryEnabled: telemetryEnabledForSource("session")
        });
      }
    }
    if (pending.source === "session" && state.currentSession && pending.sessionBlockId) {
      state.currentSession = {
        ...state.currentSession,
        blocks: state.currentSession.blocks.map((block) => block.id === pending.sessionBlockId
          ? {
              ...block,
              result: compactSessionTaskResult(result),
              postBlockSelfReport: selfReport,
              feedbackSkipped: skip
            }
          : block)
      };
      await persistCurrentSession();
    } else if (pending.source === "assessment" && state.currentEvaluation) {
      state.currentEvaluation = {
        ...state.currentEvaluation,
        postBlockSelfReports: {
          ...(state.currentEvaluation.postBlockSelfReports || {}),
          [pending.taskId]: { resultId: pending.resultId, selfReport, feedbackSkipped: skip }
        }
      };
      state.evaluations = upsertById(state.evaluations, state.currentEvaluation);
      await saveAdhdEvaluation({
        patientId: state.patientId,
        programId: state.programId,
        id: state.currentEvaluation.assessmentId,
        data: state.currentEvaluation
      });
    }
    closeDialog($("adhdFeedbackDialog"));
    state.pendingFeedback = null;
    showToast(skip ? "Feedback cerrado sin registro subjetivo." : "Registro breve guardado.");
  } catch (error) {
    reportError(error, authorizationAwareMessage(error, "No fue posible guardar el registro posterior al bloque."));
  } finally {
    setBusy(false);
    renderAll();
  }
}

async function handleTaskInterruption(payload = {}) {
  if (!state.activeTask || state.activeTaskSettled) return;
  state.activeTaskSettled = true;
  const active = state.activeTask;
  const interrupted = {
    taskId: active.taskId,
    taskVersion: active.task.taskVersion,
    status: "interrupted",
    valid: false,
    quality: { valid: false, flags: [String(payload.interruptionReason || "interrupted_block")] },
    completedAtIso: nowIso(),
    randomSeed: payload.randomSeed || active.taskForm?.randomSeed || null,
    configuration: payload.config || active.taskConfiguration || {},
    metrics: payload.metrics || {},
    ...payload,
    status: "interrupted",
    valid: false
  };
  if (active.source === "session" && state.currentSession && active.sessionBlockId) {
    const activeBlock = state.currentSession.blocks.find((block) => block.id === active.sessionBlockId);
    if (activeBlock && ["in_progress", "paused"].includes(activeBlock.status)) {
      state.currentSession = interruptAdhdBlock(state.currentSession, active.sessionBlockId, {
        at: nowIso(), reason: payload.interruptionReason || "interrupted", pauseSession: true, source: "patient_ui"
      });
      state.sessions = upsertById(state.sessions, state.currentSession);
    }
  }
  try {
    const saved = await saveAdhdTaskResult({
      patientId: state.patientId,
      programId: state.programId,
      sessionId: active.source === "session" ? state.currentSession?.sessionId : null,
      evaluationId: active.source === "assessment" ? state.currentEvaluation?.assessmentId : null,
      attemptId: active.launchContext.attemptId,
      result: interrupted,
      telemetry: extractTelemetry(interrupted),
      telemetryEnabled: Boolean(state.currentEvaluation?.telemetryEnabled ?? state.plan?.configuration?.telemetryEnabled ?? false)
    });
    state.resultRecords.push({ id: saved.id, ...interrupted, references: {
      evaluationId: active.source === "assessment" ? state.currentEvaluation?.assessmentId : null,
      sessionId: active.source === "session" ? state.currentSession?.sessionId : null
    } });
    if (active.source === "assessment" && state.assessmentResults[active.taskId]?.status !== "completed") {
      state.assessmentResults[active.taskId] = interrupted;
    }
    if (active.source === "session" && state.currentSession && active.sessionBlockId) await persistCurrentSession();
    state.technicalMonitor?.markInterruption(payload.interruptionReason || "interrupted_block", { taskId: active.taskId });
    setAdhdStatus("Bloque interrumpido. El ensayo parcial no se reutiliza y la tarea debe reiniciarse desde un límite seguro.", "warning");
  } catch (error) {
    if (active.source === "session" && state.currentSession) {
      await persistCurrentSession().catch(() => {});
    }
    reportError(error, "El bloque se detuvo, pero no fue posible sincronizar el registro de interrupción.");
  } finally {
    cleanupActiveTask();
    renderAll();
  }
}

async function recoverActiveSessionBlock(active, reason) {
  if (active?.source !== "session" || !state.currentSession || !active.sessionBlockId) return false;
  const block = state.currentSession.blocks.find((item) => item.id === active.sessionBlockId);
  if (!block || !["in_progress", "paused"].includes(block.status)) return false;
  state.currentSession = interruptAdhdBlock(state.currentSession, active.sessionBlockId, {
    at: nowIso(),
    reason,
    pauseSession: true,
    source: "persistence_recovery"
  });
  state.sessions = upsertById(state.sessions, state.currentSession);
  await persistCurrentSession().catch(() => {});
  setAdhdStatus("El resultado no se confirmó. El bloque volvió a pendiente y puede reiniciarse de forma segura.", "warning");
  return true;
}

async function completeAssessmentTask(taskId, record) {
  state.assessmentResults[taskId] = record;
  const resultIds = uniqueStrings([...(state.currentEvaluation.resultIds || []), record.id]);
  const validResultIds = record.valid === false
    ? uniqueStrings(state.currentEvaluation.validResultIds || [])
    : uniqueStrings([...(state.currentEvaluation.validResultIds || []), record.id]);
  const completed = state.batteryTasks.every((task) => state.assessmentResults[task.id]?.status === "completed");
  const technical = state.technicalMonitor?.getSnapshot() || {};
  state.currentEvaluation = {
    ...state.currentEvaluation,
    resultIds,
    validResultIds,
    status: completed ? "completed_pending_profile" : "in_progress",
    completedAt: completed ? nowIso() : null,
    context: {
      ...state.currentEvaluation.context,
      refreshRateHz: technical.refreshRateHz,
      focusLosses: technical.focusLosses,
      visibilityLosses: technical.visibilityLosses,
      orientationChanges: technical.orientationChanges
    },
    quality: {
      completedTaskCount: state.batteryTasks.filter((task) => state.assessmentResults[task.id]?.status === "completed").length,
      requiredTaskCount: state.batteryTasks.length,
      invalidTaskIds: state.batteryTasks.filter((task) => state.assessmentResults[task.id]?.valid === false).map((task) => task.id),
      valid: completed && state.batteryTasks.every((task) => state.assessmentResults[task.id]?.valid !== false)
    }
  };
  state.evaluations = upsertById(state.evaluations, state.currentEvaluation);
  await saveAdhdEvaluation({
    patientId: state.patientId,
    programId: state.programId,
    id: state.currentEvaluation.assessmentId,
    data: state.currentEvaluation
  });
  if (completed && !state.clinician) {
    setAdhdStatus("Batería completa. El perfil y el plan quedan pendientes de revisión profesional.", "success");
  }
}

async function completeSessionTask(active, record) {
  state.currentSession = recordAdhdBlockResult(state.currentSession, active.sessionBlockId, compactSessionTaskResult(record), {
    at: nowIso(), taskVersion: record.taskVersion, metricsVersion: record.metricsEngineVersion, source: "task_result"
  });
  state.currentSession.taskResultIds = uniqueStrings([...(state.currentSession.taskResultIds || []), record.id]);
  await persistCurrentSession();
}

function normalizeCompletedTaskPayload(active, payload = {}) {
  const completedAtIso = payload.completedAtIso || payload.endedAt || nowIso();
  const quality = {
    ...(payload.quality || {}),
    valid: payload.valid !== false && payload.metrics?.valid !== false,
    practiceExcluded: true
  };
  return {
    ...payload,
    taskId: active.taskId,
    taskVersion: payload.taskVersion || active.task.taskVersion,
    status: "completed",
    valid: quality.valid,
    quality,
    completedAtIso,
    configuration: payload.configuration || payload.config || active.taskConfiguration || {},
    comparisonConfiguration: { ...(active.metricConfiguration || {}) },
    metricConfigurationVersion: active.taskConfiguration?.metricConfigurationVersion || "1.0.0",
    randomSeed: payload.randomSeed ?? active.taskForm?.randomSeed ?? null,
    context: {
      ...(payload.context || {}),
      programId: state.programId,
      evaluationId: active.source === "assessment" ? state.currentEvaluation?.assessmentId : null,
      sessionId: active.source === "session" ? state.currentSession?.sessionId : null,
      goalId: active.launchContext.goalId || null,
      challengeId: active.launchContext.challengeId || null,
      attemptId: active.launchContext.attemptId || null
    }
  };
}

function evaluateAdaptation(taskId, result, fatigue = null, frustration = null) {
  try {
    const recentResults = [...state.resultRecords.filter((item) => (
      item.taskId === taskId
      && item.id !== result.id
      && item.references?.sessionId
      && item.status === "completed"
      && item.valid !== false
      && item.quality?.valid !== false
    )), result]
      .slice(-5)
      .map((item) => ({ ...item, ...(item.metrics || {}) }));
    if (taskId === "stop_signal") {
      const lastStopTrial = [...(result.trials || [])]
        .reverse()
        .find((trial) => trial.trialType === "stop" && typeof (trial.inhibitionSuccessful ?? trial.inhibitionSuccess) === "boolean");
      if (lastStopTrial && recentResults.length) {
        recentResults[recentResults.length - 1].inhibitionSuccessful = Boolean(
          lastStopTrial.inhibitionSuccessful ?? lastStopTrial.inhibitionSuccess
        );
      }
    }
    const decision = adaptAdhdDifficulty({
      taskId,
      recentResults,
      fatigue: boundedRating(fatigue),
      frustration: boundedRating(frustration),
      currentDifficulty: difficultyDescriptor(taskId, result)
    });
    state.adaptiveDecisions[taskId] = decision;
    if (decision.nextDifficulty) state.adaptiveConfigurations[taskId] = { ...decision.nextDifficulty };
    return decision;
  } catch (_) {
    return null;
  }
}

function difficultyDescriptor(taskId, result = null) {
  const stored = state.adaptiveConfigurations[taskId]
    || state.adaptiveDecisions[taskId]?.nextDifficulty;
  const descriptor = { ...(stored || DEFAULT_ADAPTIVE_DIFFICULTY[taskId] || {}) };
  if (taskId !== "stop_signal" || !Array.isArray(result?.trials)) return descriptor;
  const lastStopTrial = [...result.trials].reverse().find((trial) => (
    trial.trialType === "stop" && Number.isFinite(Number(trial.stopSignalDelayMs))
  ));
  return lastStopTrial ? { ...descriptor, ssdMs: Number(lastStopTrial.stopSignalDelayMs) } : descriptor;
}

function nativeDifficultyConfig(taskId, suppliedDifficulty = null) {
  const nextDifficulty = suppliedDifficulty || state.adaptiveConfigurations[taskId]
    || state.adaptiveDecisions[taskId]?.nextDifficulty
    || difficultyDescriptor(taskId);
  if (taskId === "stop_signal") {
    return { initialStopSignalDelayMs: Number(nextDifficulty.ssdMs) || 250 };
  }
  if (taskId === "task_switching") {
    return {
      responseWindowMs: Number(nextDifficulty.responseWindowMs) || (state.ageMode?.id === "pediatric" ? 1600 : 1400),
      switchProportion: Number(nextDifficulty.switchProportion) || 0.5,
      mixedBlockTrialCount: Number(nextDifficulty.trialCount) || 64
    };
  }
  if (taskId === "temporal_estimation") {
    return {
      targetDurationsMs: temporalTargetsForLevel(nextDifficulty.intervalRangeLevel),
      mainTrialCount: Number(nextDifficulty.trialCount) || 20
    };
  }
  if (taskId === "route_planning") {
    const gridSize = Math.max(4, Math.min(8, Math.round(Number(nextDifficulty.gridSize) || 6)));
    return {
      rows: gridSize,
      cols: gridSize,
      checkpointCount: Math.max(1, Math.min(8, Math.round(Number(nextDifficulty.planningDepth) || 2))),
      blockedRatio: Math.max(0.04, Math.min(0.28, 0.08 + ((Number(nextDifficulty.distractorLevel) || 0) * 0.04)))
    };
  }
  return {};
}

function existingDifficultyConfig(taskId, suppliedDifficulty = null) {
  const nextDifficulty = suppliedDifficulty || state.adaptiveConfigurations[taskId]
    || state.adaptiveDecisions[taskId]?.nextDifficulty
    || difficultyDescriptor(taskId);
  if (taskId === "nback") {
    return {
      level: Math.max(1, Math.min(4, Math.round(Number(nextDifficulty.level) || 1))),
      stimulusIntervalMs: Number(nextDifficulty.intervalMs) || 2000,
      totalTrials: Math.max(8, Math.round(Number(nextDifficulty.trialCount) || 20))
    };
  }
  if (taskId === "cpt_x") {
    const distractorLevel = Math.max(0, Math.min(4, Math.round(Number(nextDifficulty.distractorLevel) || 0)));
    const rarityLevel = Math.max(0, Math.min(3, Math.round(Number(nextDifficulty.targetRarity) || 0)));
    return {
      modality: distractorLevel > 0 ? "degraded" : "cpt_x",
      degradationLevel: distractorLevel > 0 ? 20 + (distractorLevel * 12) : 0,
      stimulusIntervalMs: Number(nextDifficulty.isiMs) || 1000,
      targetPercentage: [20, 15, 10, 8][rarityLevel],
      durationSeconds: Math.round((Number(nextDifficulty.durationMinutes) || 3) * 60),
      practiceEnabled: true
    };
  }
  if (taskId === "go_nogo") {
    const similarity = Math.max(0, Math.min(3, Math.round(Number(nextDifficulty.perceptualSimilarity) || 0)));
    const rarity = Math.max(0, Math.min(3, Math.round(Number(nextDifficulty.noGoRarity) || 0)));
    return {
      dificultad: similarity === 0 ? "facil" : similarity === 1 ? "intermedio" : "dificil",
      duracionEstimulo: Number(nextDifficulty.responseWindowMs) || 1000,
      porcentajeGo: [60, 70, 80, 90][rarity]
    };
  }
  if (taskId === "stroop") {
    const interference = Math.max(0, Math.min(3, Math.round(Number(nextDifficulty.interferenceLevel) || 0)));
    return {
      difficulty: interference === 0 ? "facil" : interference === 1 ? "medio" : "dificil",
      timeLimitMs: Number(nextDifficulty.responseWindowMs) || 2500,
      congruentRate: Math.max(0.1, Math.min(0.9, 1 - (Number(nextDifficulty.incongruentProportion) || 0.3))),
      distractors: interference >= 2
    };
  }
  return {};
}

function assessmentMetricConfiguration(taskId) {
  const definition = ADHD_TASK_CATALOG[taskId];
  const fixedDifficulty = DEFAULT_ADAPTIVE_DIFFICULTY[taskId] || {};
  return definition?.kind === "native"
    ? nativeDifficultyConfig(taskId, fixedDifficulty)
    : existingDifficultyConfig(taskId, fixedDifficulty);
}

function fixedAssessmentMetricConfigurations(taskIds = []) {
  const baseline = state.evaluations.find((evaluation) => evaluation.phase === "T0");
  return Object.fromEntries(taskIds.map((taskId) => {
    const baselineTask = baseline?.formConfiguration?.tasks?.find((task) => task.taskId === taskId);
    return [taskId, {
      ...(baselineTask?.metricConfiguration || assessmentMetricConfiguration(taskId))
    }];
  }));
}

function temporalTargetsForLevel(value) {
  const level = Math.max(1, Math.min(4, Math.round(Number(value) || 1)));
  const pediatric = [
    [700, 1000, 1400, 1900],
    [600, 950, 1500, 2200],
    [500, 850, 1700, 2700],
    [400, 750, 1900, 3300]
  ];
  const adult = [
    [800, 1200, 1700, 2300],
    [650, 1050, 1800, 2700],
    [550, 950, 2100, 3300],
    [450, 850, 2400, 4000]
  ];
  return (state.ageMode?.id === "pediatric" ? pediatric : adult)[level - 1];
}

function manuallyReducedDifficulty(taskId) {
  const current = difficultyDescriptor(taskId);
  if (taskId === "stop_signal") return { ...current, ssdMs: Math.max(50, Number(current.ssdMs) - 50) };
  if (taskId === "task_switching") return { ...current, responseWindowMs: Math.min(2600, Number(current.responseWindowMs) + 200) };
  if (taskId === "temporal_estimation") return { ...current, intervalRangeLevel: Math.max(1, Number(current.intervalRangeLevel) - 1) };
  if (taskId === "route_planning") return { ...current, planningDepth: Math.max(2, Number(current.planningDepth) - 1) };
  return current;
}

function reduceActiveTaskDifficulty() {
  if (!state.activeTask) return;
  const taskId = state.activeTask.taskId;
  if (state.activeTask.task.kind !== "native") {
    showToast("Esta tarea heredada no admite reducción en curso; puede terminarse y revisarse clínicamente.");
    return;
  }
  const currentDifficulty = difficultyDescriptor(taskId);
  const nextDifficulty = manuallyReducedDifficulty(taskId);
  state.adaptiveConfigurations[taskId] = nextDifficulty;
  state.adaptiveDecisions[taskId] = {
    taskId,
    decision: "manual_decrease",
    currentDifficulty,
    nextDifficulty,
    reasons: ["Reducción solicitada durante la ejecución; el bloque completo debe reiniciarse."],
    requiresClinicianDecision: false,
    diagnostic: false
  };
  interruptActiveTask("manual_difficulty_reduction");
  showToast("Se registró la reducción. Reinicia el bloque completo para aplicarla.");
}

function interruptActiveTask(reason) {
  if (!state.activeTask || state.activeTaskSettled) return;
  if (state.activeRunner) state.activeRunner.interrupt(reason);
  else handleTaskInterruption({ status: "interrupted", valid: false, interruptionReason: reason });
}

function cleanupActiveTask() {
  state.activeBridge?.destroy();
  state.activeBridge = null;
  state.activeRunner?.destroy?.();
  state.activeRunner = null;
  const iframe = $("adhdTaskFrame");
  if (iframe) {
    iframe.src = "about:blank";
    iframe.removeAttribute("name");
  }
  $("adhdTaskHost")?.replaceChildren();
  closeDialog($("adhdTaskDialog"));
  document.body.classList.remove("adhd-focus-mode");
  state.activeTask = null;
  state.activeTaskSettled = false;
}

async function generateProfileFromAssessment() {
  if (!state.currentEvaluation) return;
  if (!state.canEditPatient) {
    showToast("El perfil derivado requiere revisión y guardado por un profesional autorizado.");
    return;
  }
  const complete = state.batteryTasks.every((task) => state.assessmentResults[task.id]?.status === "completed");
  if (!complete) {
    showToast("Completa todas las tareas de la batería antes de generar el perfil.");
    return;
  }
  try {
    const profile = buildAdhdProfile({
    profileId: crearIdEstableAdhd("profile", state.programId, state.currentEvaluation.assessmentId),
    assessmentId: state.currentEvaluation.assessmentId,
    assessmentPhase: state.currentEvaluation.phase,
    taskResults: state.assessmentResults,
    functionalGoals: state.goals.filter((goal) => state.currentEvaluation.goalIds?.includes(goal.id)),
    functionalDifficulties: state.currentEvaluation.functionalDifficultyIds,
    assessmentContext: state.currentEvaluation.context,
    createdAt: nowIso()
  });
    const saved = await saveAdhdProfile({ patientId: state.patientId, programId: state.programId, id: profile.profileId, data: profile });
    profile.pendingSync = saved.pendingSync;
    state.profile = profile;
    state.profiles = upsertById(state.profiles, profile);
    state.currentEvaluation = { ...state.currentEvaluation, status: "completed", profileId: profile.profileId };
    state.evaluations = upsertById(state.evaluations, state.currentEvaluation);
    const [evaluationSaved, programSaved] = await Promise.all([
      saveAdhdEvaluation({ patientId: state.patientId, programId: state.programId, id: state.currentEvaluation.assessmentId, data: state.currentEvaluation }),
      saveProgram({ patientId: state.patientId, programId: state.programId, data: { status: "profile_ready", activeProfileId: profile.profileId } }),
      auditEvent("profile_generated", { assessmentId: state.currentEvaluation.assessmentId, profileId: profile.profileId })
    ]);
    state.program = { ...state.program, status: "profile_ready", activeProfileId: profile.profileId };
    resetTechnicalMonitor();
    renderAll();
    showAdhdView("profile");
    const pending = saved.pendingSync || evaluationSaved?.pendingSync || programSaved?.pendingSync;
    setAdhdStatus(
      pending
        ? "Perfil derivado conservado localmente; la revisión remota está pendiente de sincronización."
        : "Perfil estructurado generado con medidas crudas y señales internas no normativas.",
      pending ? "warning" : "success"
    );
  } catch (error) {
    reportError(error, authorizationAwareMessage(error, "No fue posible guardar el perfil derivado."));
  }
}

function previewPlan() {
  if (!state.canEditPatient || !state.profile) return;
  const configuration = readPlanConfiguration();
  state.plan = generateAdhdProgram({
    programId: state.programId,
    profile: state.profile,
    age: Number($("adhdAge")?.value) || calculateAge(state.patient),
    functionalGoals: state.goals.filter((goal) => goal.active !== false),
    functionalDifficulties: state.currentEvaluation?.functionalDifficultyIds || [],
    previousResults: state.resultRecords,
    adherence: deriveSessionAdherence(),
    configuration,
    generatedAt: nowIso()
  });
  renderAll();
  if (!state.plan.validation?.valid) setAdhdStatus("El borrador del plan requiere correcciones antes de guardarse.", "warning");
}

function handlePlanConfigurationChange(event) {
  if (!state.canEditPatient || !state.profile) return;
  if (!state.plan?.sessions?.length || ["totalSessions", "sessionMinutes"].includes(event?.target?.name)) {
    previewPlan();
  } else if (event?.target?.name === "weeks") {
    state.plan = applyAdhdProgramEdits(state.plan, [{
      type: "change_frequency",
      weeks: Number(new FormData($("adhdPlanConfig")).get("weeks")),
      reason: "Ajuste manual de frecuencia por el profesional",
      actorRole: "clinician",
      at: nowIso()
    }]);
    renderAll();
  }
}

async function activatePlan() {
  if (!state.canEditPatient || !state.profile) {
    showToast("Solo un profesional autorizado puede guardar el plan.");
    return;
  }
  if (!state.plan) previewPlan();
  if (!state.plan?.validation?.valid) {
    showToast(`El plan no es válido: ${(state.plan?.validation?.errors || []).join(", ")}.`);
    return;
  }
  try {
    const planId = crearIdEstableAdhd("plan", state.programId, state.profile.profileId);
    state.plan = { ...state.plan, id: planId, planId, status: "active", activatedAt: nowIso() };
    const saved = await saveAdhdPlan({ patientId: state.patientId, programId: state.programId, id: planId, data: state.plan });
    state.plan.pendingSync = saved.pendingSync;
    state.plans = upsertById(state.plans, state.plan);
    const [programSaved] = await Promise.all([
      saveProgram({ patientId: state.patientId, programId: state.programId, data: { status: "active", activePlanId: planId, activeProfileId: state.profile.profileId } }),
      auditEvent("plan_activated", { planId, profileId: state.profile.profileId })
    ]);
    state.program = { ...state.program, status: "active", activePlanId: planId, activeProfileId: state.profile.profileId };
    renderAll();
    showAdhdView("session");
    const pending = saved.pendingSync || programSaved?.pendingSync;
    setAdhdStatus(pending ? "Plan guardado localmente; la activación remota está pendiente." : "Plan revisado y activado. La persona puede iniciar la primera sesión.", pending ? "warning" : "success");
  } catch (error) {
    reportError(error, authorizationAwareMessage(error, "No fue posible guardar y activar el plan."));
  }
}

function addPlanExercise() {
  if (!state.canEditPatient || !state.plan) return;
  const sessionNumber = Number(window.prompt(`Número de sesión (1–${state.plan.sessions.length})`, "1"));
  const session = state.plan.sessions.find((item) => item.sessionNumber === sessionNumber);
  if (!session) return;
  const tasks = session.blocks.filter((block) => block.kind === "cognitive_task");
  const taskId = window.prompt(`ID de tarea: ${Object.keys(ADHD_TASK_CATALOG).join(", ")}`, "go_nogo")?.trim();
  if (!ADHD_TASK_CATALOG[taskId]) return;
  if (tasks.some((task) => task.taskId === taskId)) {
    showToast("La sesión ya contiene esa tarea; el protocolo no admite duplicados.");
    return;
  }
  let operation = { type: "add_task", sessionNumber, taskId };
  if (tasks.length >= 2) {
    const previousTaskId = window.prompt(
      `Cada sesión conserva exactamente dos tareas para mantener duración y contrato de persistencia. Elige cuál sustituir: ${tasks.map((task) => task.taskId).join(", ")}`,
      tasks.at(-1)?.taskId || ""
    )?.trim();
    if (!tasks.some((task) => task.taskId === previousTaskId)) return;
    operation = { type: "replace_task", sessionNumber, previousTaskId, taskId };
  }
  state.plan = applyAdhdProgramEdits(state.plan, [{
    ...operation,
    reason: tasks.length >= 2 ? "Ejercicio sustituido por revisión clínica" : "Ejercicio añadido por revisión clínica",
    actorRole: "clinician",
    at: nowIso()
  }]);
  renderAll();
}

function handlePlanItemAction(event) {
  if (!state.canEditPatient || !state.plan) return;
  const edit = event.target.closest("[data-edit-session]");
  const remove = event.target.closest("[data-remove-session]");
  if (!edit && !remove) return;
  const index = Number((edit || remove).dataset.editSession ?? (edit || remove).dataset.removeSession);
  const session = state.plan.sessions[index];
  if (!session) return;
  const tasks = session.blocks.filter((block) => block.kind === "cognitive_task");
  const previousTaskId = window.prompt(`Tarea de la sesión ${session.sessionNumber}: ${tasks.map((task) => task.taskId).join(", ")}`, tasks.at(-1)?.taskId || "")?.trim();
  if (!tasks.some((task) => task.taskId === previousTaskId)) return;
  if (remove) {
    if (!window.confirm("Quitar una tarea puede invalidar la estructura mínima. El plan no podrá guardarse hasta añadir o sustituir el componente faltante.")) return;
    state.plan = applyAdhdProgramEdits(state.plan, [{ type: "remove_task", sessionNumber: session.sessionNumber, taskId: previousTaskId, reason: "Tarea retirada por decisión clínica", actorRole: "clinician", at: nowIso() }]);
  } else {
    const taskId = window.prompt(`Nueva tarea: ${Object.keys(ADHD_TASK_CATALOG).join(", ")}`, "task_switching")?.trim();
    if (!ADHD_TASK_CATALOG[taskId]) return;
    state.plan = applyAdhdProgramEdits(state.plan, [{ type: "replace_task", sessionNumber: session.sessionNumber, previousTaskId, taskId, reason: "Sustitución clínica documentada", actorRole: "clinician", at: nowIso() }]);
  }
  renderAll();
}

function editPrimaryGoal() {
  if (!state.canEditPatient || !state.plan) return;
  const goal = state.plan.goals?.find((item) => item.active !== false) || state.goals.find((item) => item.active !== false);
  if (!goal) return;
  const action = window.prompt("Acción observable del objetivo", goal.action || goal.label || "")?.trim();
  const target = window.prompt("Criterio observable", goal.target || "")?.trim();
  if (!action || !target) return;
  const updated = { ...goal, action, target };
  state.plan = applyAdhdProgramEdits(state.plan, [{ type: "change_goal", goal: updated, reason: "Objetivo editado por revisión clínica", actorRole: "clinician", at: nowIso() }]);
  state.goals = upsertById(state.goals, updated);
  saveAdhdGoal({ patientId: state.patientId, programId: state.programId, id: updated.id, data: updated });
  renderAll();
}

function deactivatePrimaryGoal() {
  if (!state.canEditPatient || !state.plan) return;
  const goal = state.goals.find((item) => item.active !== false);
  if (!goal || !window.confirm("¿Desactivar este objetivo funcional? Su historial se conservará.")) return;
  const updated = { ...goal, active: false, deactivatedAt: nowIso() };
  state.goals = upsertById(state.goals, updated);
  state.plan = applyAdhdProgramEdits(state.plan, [{ type: "remove_goal", goalId: goal.id, reason: "Objetivo desactivado por revisión clínica", actorRole: "clinician", at: nowIso() }]);
  saveAdhdGoal({ patientId: state.patientId, programId: state.programId, id: updated.id, data: updated });
  renderAll();
}

async function startOrResumeTodaySession() {
  if (!state.plan || state.plan.status !== "active" || state.plan.validation?.valid === false) {
    showToast("Primero se requiere un plan válido, guardado y activado por un profesional.");
    return;
  }
  try {
    if (!state.currentSession) {
      const planSession = nextPlanSession();
      if (!planSession) {
        showToast("Todas las sesiones programadas están finalizadas.");
        return;
      }
      state.currentSession = createAdhdSession({
        sessionId: planSession.sessionId,
        programId: state.programId,
        planSession,
        sessionNumber: planSession.sessionNumber,
        programEngineVersion: state.plan.programEngineVersion,
        createdAt: nowIso(),
        context: { sessionNumber: planSession.sessionNumber, ...detectDeviceContext() }
      });
      state.currentSession.number = planSession.sessionNumber;
      state.currentSession.planId = state.plan.planId || state.plan.id;
      state.currentChallenge = createTransferChallenge({
        sessionNumber: planSession.sessionNumber,
        domains: planSession.domains,
        ageMode: state.ageMode?.id || "adult",
        seed: hash32(`${state.programId}:${planSession.sessionNumber}`),
        dueDate: addDaysIso(1),
        ...functionalGoalBindingForSession(planSession)
      });
      state.currentChallenge.sessionId = state.currentSession.sessionId;
      state.currentSession.transferChallengeId = state.currentChallenge.id;
      await saveAdhdTransferChallenge({ patientId: state.patientId, programId: state.programId, id: state.currentChallenge.id, data: { ...state.currentChallenge, sessionId: state.currentSession.sessionId } });
      state.challenges = upsertById(state.challenges, state.currentChallenge);
    }
    if (state.currentSession.status === "not_started") state.currentSession = startAdhdSession(state.currentSession, nowIso());
    else if (state.currentSession.status === "paused") state.currentSession = resumeAdhdSession(state.currentSession, { at: nowIso(), source: "patient_ui" });
    await persistCurrentSession();
    renderAll();
    setAdhdStatus("Sesión iniciada. Completa los componentes en orden y usa pausas entre ensayos.", "success");
  } catch (error) {
    reportError(error, "No fue posible iniciar o reanudar la sesión.");
  }
}

async function handleTodayComponentAction(event) {
  const taskButton = event.target.closest("[data-start-session-task]");
  if (taskButton) {
    await startTask(taskButton.dataset.startSessionTask, "session", taskButton.dataset.sessionBlockId || "");
    return;
  }
  const metacognitiveButton = event.target.closest("[data-open-metacognitive-module]");
  if (metacognitiveButton) {
    if (!state.currentSession) await startOrResumeTodaySession();
    if (!state.currentSession) return;
    const block = state.currentSession.blocks[Number(metacognitiveButton.dataset.componentIndex)];
    if (!block || block.kind !== "metacognition" || block.status !== "pending") return;
    const dialog = $("adhdMetacognitiveDialog");
    if (dialog) dialog.dataset.blockId = block.id;
    openMetacognitiveModuleDialog({ moduleId: block.moduleId }, block.result || {});
    return;
  }
  const button = event.target.closest("[data-complete-component]");
  if (!button) return;
  if (!state.currentSession) await startOrResumeTodaySession();
  if (!state.currentSession) return;
  const block = state.currentSession.blocks[Number(button.dataset.completeComponent)];
  if (!block || block.status === "completed" || block.kind === "cognitive_task") return;
  if (block.kind === "functional_transfer") {
    const challenge = state.currentChallenge;
    if (!challenge) {
      showToast("No existe un reto funcional preparado para esta sesión.");
      return;
    }
    const assigned = await completeNonTaskBlock(block, {
      status: "assigned",
      challengeId: challenge.id,
      dueDate: challenge.dueDate,
      linkedGoalId: challenge.linkedGoalId || null,
      assignedAt: nowIso(),
      outcomePending: true
    });
    if (assigned) {
      showToast("Reto asignado. Su resultado se registrará después, fuera de esta sesión.");
      setAdhdStatus("El reto quedó pendiente de seguimiento; no es necesario inventar un resultado para cerrar la sesión.", "success");
    }
    return;
  }
  if (block.kind === "self_assessment") {
    $("adhdSelfRating")?.removeAttribute("hidden");
    $("adhdSelfRating")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const result = block.kind === "activation"
    ? { acknowledged: true, fatigue: Number($("adhdSessionFatigue")?.value || 0), technicalContext: detectDeviceContext() }
    : { acknowledged: true, completedBy: state.clinician ? "clinician_or_patient" : "patient" };
  await completeNonTaskBlock(block, result);
}

async function saveMetacognitiveModule() {
  const dialog = $("adhdMetacognitiveDialog");
  const blockId = dialog?.dataset.blockId;
  const block = state.currentSession?.blocks?.find((item) => item.id === blockId);
  if (!block || block.kind !== "metacognition" || block.status !== "pending") {
    showToast("El módulo ya no está disponible en esta sesión.");
    closeMetacognitiveModuleDialog();
    return;
  }
  const validation = buildMetacognitiveModuleResult(
    { moduleId: block.moduleId },
    readMetacognitiveModuleDialogDraft(),
    { completedAt: nowIso() }
  );
  if (!validation.valid) {
    showToast("Completa los pasos, la estrategia y su aplicación concreta.");
    refreshMetacognitiveModuleDialogState();
    return;
  }
  const completed = await completeNonTaskBlock(block, validation.result);
  if (!completed) return;
  closeMetacognitiveModuleDialog();
  if (dialog) delete dialog.dataset.blockId;
}

async function completeNonTaskBlock(block, result) {
  const previousSession = state.currentSession;
  try {
    if (state.currentSession.status === "paused") state.currentSession = resumeAdhdSession(state.currentSession, { at: nowIso() });
    state.currentSession = startAdhdBlock(state.currentSession, block.id, { at: nowIso(), source: "patient_ui" });
    state.currentSession = recordAdhdBlockResult(state.currentSession, block.id, result, { at: nowIso(), resultVersion: "1.0.0", source: "patient_ui" });
    await persistCurrentSession();
    renderAll();
    return true;
  } catch (error) {
    state.currentSession = previousSession;
    renderAll();
    reportError(error, "No fue posible completar este componente.");
    return false;
  }
}

async function saveTransferOutcome() {
  const challenge = state.followUpChallenge;
  if (!challenge) {
    showToast("No hay un reto posterior pendiente de seguimiento.");
    return;
  }
  const selected = document.querySelector('input[name="transferStatus"]:checked')?.value;
  if (!selected) {
    showToast("Selecciona realizado, parcial o no realizado.");
    return;
  }
  const outcome = {
    status: selected,
    note: $("adhdTransferNote")?.value,
    completedAt: nowIso(),
    source: state.clinician ? "clinician" : "patient"
  };
  const linkedGoal = state.goals.find((goal) => goal.id === challenge.linkedGoalId);
  const applied = linkedGoal
    ? applyTransferOutcomeToGoal(linkedGoal, challenge, outcome)
    : { linked: false, challenge: recordTransferOutcome(challenge, outcome), progressEntries: [] };
  const persistence = [
    saveAdhdTransferChallenge({
      patientId: state.patientId,
      programId: state.programId,
      id: applied.challenge.id,
      data: { ...applied.challenge, sessionId: challenge.sessionId }
    })
  ];
  if (applied.linked) {
    persistence.push(saveAdhdGoal({
      patientId: state.patientId,
      programId: state.programId,
      id: applied.goal.id,
      data: applied.goal
    }));
  }
  try {
    await Promise.all(persistence);
  } catch (error) {
    reportError(error, authorizationAwareMessage(error, "No fue posible guardar el resultado del reto funcional."));
    return;
  }
  state.followUpChallenge = applied.challenge;
  if (applied.linked) state.goals = upsertById(state.goals, applied.goal);
  state.challenges = upsertById(state.challenges, state.followUpChallenge);
  state.followUpChallenge = resolvePendingFollowUpChallenge();
  renderAll();
  showToast("Resultado funcional posterior guardado.");
}

async function saveSelfRatingAndCompleteSession() {
  if (!state.currentSession) return;
  const selfRating = {
    fatigue: boundedRating($("adhdSessionFatigue")?.value),
    frustration: boundedRating($("adhdSessionFrustration")?.value),
    perceivedConcentration: boundedRating($("adhdSessionConcentration")?.value)
  };
  const selfBlock = state.currentSession.blocks.find((block) => block.kind === "self_assessment" && block.status === "pending");
  if (selfBlock && !(await completeNonTaskBlock(selfBlock, selfRating))) return;
  const feedbackBlock = state.currentSession.blocks.find((block) => block.kind === "feedback" && block.status === "pending");
  if (feedbackBlock && !(await completeNonTaskBlock(feedbackBlock, {
    acknowledged: true,
    source: "post_block_descriptive_feedback"
  }))) return;
  state.currentSession.selfRating = selfRating;
  const unfinished = state.currentSession.blocks.filter((block) => block.required !== false && !["completed", "completed_with_incomplete_data"].includes(block.status));
  if (unfinished.length) {
    showToast(`Faltan componentes: ${unfinished.map((block) => block.label).join(", ")}.`);
    return;
  }
  try {
    state.currentSession = completeAdhdSession(state.currentSession, nowIso());
    state.currentSession.transferStatus = state.currentChallenge?.status === "pending"
      ? "assigned_pending_follow_up"
      : state.currentChallenge?.status || "not_assigned";
    await persistCurrentSession();
    state.sessions = upsertById(state.sessions, state.currentSession);
    await auditEvent("session_completed", { sessionId: state.currentSession.sessionId, sessionNumber: state.currentSession.plannedSessionNumber });
    state.followUpChallenge = state.currentChallenge?.status === "pending"
      ? state.currentChallenge
      : resolvePendingFollowUpChallenge();
    state.currentSession = null;
    state.currentChallenge = null;
    resetTechnicalMonitor();
    renderAll();
    setAdhdStatus("Sesión completada. El resultado se conserva para el seguimiento intraindividual y el reto funcional.", "success");
  } catch (error) {
    reportError(error, "La sesión aún contiene componentes obligatorios sin finalizar.");
  }
}

async function persistCurrentSession() {
  if (!state.currentSession) return null;
  const saved = await saveAdhdSession({ patientId: state.patientId, programId: state.programId, id: state.currentSession.sessionId, data: state.currentSession });
  state.currentSession.pendingSync = saved.pendingSync;
  state.sessions = upsertById(state.sessions, state.currentSession);
  return saved;
}

async function suspendAssessment() {
  if (!state.currentEvaluation) return;
  if (state.activeTask) {
    interruptActiveTask("assessment_suspended");
    return;
  }
  state.currentEvaluation = { ...state.currentEvaluation, status: "paused", pausedAt: nowIso() };
  state.evaluations = upsertById(state.evaluations, state.currentEvaluation);
  await saveAdhdEvaluation({ patientId: state.patientId, programId: state.programId, id: state.currentEvaluation.assessmentId, data: state.currentEvaluation });
  resetTechnicalMonitor();
  setAdhdStatus("Evaluación pausada. Los bloques completados se conservaron; el siguiente se reiniciará completo.", "warning");
  renderAll();
}

function confirmReassessment(event) {
  event.preventDefault();
  const phase = $("adhdReassessmentPhase")?.value || "T2";
  const eligibility = reassessmentEligibility(phase);
  if (!eligibility.allowed) {
    setAdhdStatus(eligibility.reason, "warning");
    showToast(eligibility.reason);
    return;
  }
  state.pendingAssessmentPhase = phase;
  closeDialog($("adhdReassessmentDialog"));
  $("adhdAssessmentPhase").textContent = state.pendingAssessmentPhase;
  $("adhdIntakeForm")?.reset();
  $("adhdAge").value = String(calculateAge(state.patient) ?? "");
  setDefaultReviewDate();
  renderFunctionalDifficulties();
  setAssessmentVisible(false);
  showAdhdView("assessment");
  setAdhdStatus(`Preparando ${state.pendingAssessmentPhase}. Registra de nuevo las condiciones para evaluar comparabilidad.`, "warning");
}

function exportResearch(format) {
  if (!state.clinician) return;
  const subjectCode = window.prompt("Código seudónimo externo (6–64 caracteres, sin nombre, UID ni expediente)", "")?.trim();
  if (!subjectCode) return;
  try {
    const longitudinal = buildLongitudinalState();
    const dataset = buildAdhdResearchDataset({
      patient: { patientId: state.patientId, name: patientLabel(state.patient) },
      protocolId: ADHD_PROTOCOL_ID,
      protocolVersion: ADHD_PROTOCOL_VERSION,
      assessments: state.evaluations,
      profiles: state.profiles,
      planConfiguration: state.plan?.configuration || null,
      sessions: state.sessions,
      functionalChallenges: state.challenges,
      taskResults: state.resultRecords,
      longitudinal
    }, { subjectCode, datePolicy: "remove" });
    const content = format === "csv" ? exportAdhdResearchCsv(dataset) : exportAdhdResearchJson(dataset);
    downloadTextFile(`cognicion-tdah-${subjectCode}.${format}`, content, format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8");
    showToast("Exportación seudonimizada creada sin tabla de correspondencia ni texto libre.");
  } catch (error) {
    reportError(error, error.message || "La exportación no superó la validación de privacidad.");
  }
}

function renderAll() {
  const dashboardState = publicState();
  syncPlanConfigurationForm();
  renderDashboard(dashboardState);
  renderBattery({ tasks: state.batteryTasks, results: state.assessmentResults, activeTaskId: state.activeTask?.taskId || "" });
  setAssessmentVisible(Boolean(state.currentEvaluation));
  renderProfile(state.profile);
  renderPlan(state.plan, state.canEditPatient);
  renderToday();
  renderClinicalPanel(dashboardState);
  renderCharts();
  renderSofiaAudit();
  const generate = $("adhdGenerateProfile");
  if (generate && !state.canEditPatient) generate.disabled = true;
  $("adhdAssessmentPhase").textContent = state.currentEvaluation?.phase || state.pendingAssessmentPhase || "T0";
  $("adhdProfilePhase").textContent = state.profile?.assessmentPhase || "T0";
}

function syncPlanConfigurationForm() {
  const configuration = state.plan?.configuration;
  const form = $("adhdPlanConfig");
  if (!configuration || !form) return;
  for (const key of ["totalSessions", "weeks", "sessionsPerWeek", "sessionMinutes"]) {
    if (configuration[key] !== undefined && form.elements[key]) form.elements[key].value = String(configuration[key]);
  }
}

function publicState() {
  return {
    patientId: state.patientId,
    program: state.program,
    evaluations: state.evaluations,
    profile: state.profile,
    plan: state.plan,
    goals: state.goals,
    sessions: state.sessions,
    challenges: state.challenges,
    taskResults: state.taskResults,
    resultRecords: state.resultRecords
  };
}

function renderToday() {
  const activePlan = state.plan?.status === "active" && state.plan?.validation?.valid !== false ? state.plan : null;
  const planSession = state.currentSession
    ? state.plan?.sessions?.find((item) => item.sessionId === state.currentSession.sessionId)
    : activePlan ? nextPlanSession() : null;
  const previewChallenge = state.currentChallenge || (planSession ? createTransferChallenge({
    sessionNumber: planSession.sessionNumber,
    domains: planSession.domains,
    ageMode: state.ageMode?.id || "adult",
    seed: hash32(`${state.programId}:${planSession.sessionNumber}`),
    dueDate: addDaysIso(1),
    ...functionalGoalBindingForSession(planSession)
  }) : null);
  const session = state.currentSession
    ? { ...state.currentSession, transferChallenge: previewChallenge, difficultyLabel: adaptiveDifficultyLabel() }
    : planSession ? { ...planSession, transferChallenge: previewChallenge, difficultyLabel: "Calibración inicial" } : null;
  renderTodaySession({
    session,
    goal: state.goals.find((goal) => goal.active !== false),
    active: Boolean(state.activeTask),
    followUpChallenge: state.followUpChallenge
  });
  const selfAssessmentIndex = state.currentSession?.blocks?.findIndex((block) => block.kind === "self_assessment") ?? -1;
  const selfAssessmentAvailable = selfAssessmentIndex >= 0 && state.currentSession.blocks
    .slice(0, selfAssessmentIndex)
    .every((block) => block.required === false || ["completed", "completed_with_incomplete_data", "skipped"].includes(block.status));
  $("adhdSelfRating")?.toggleAttribute("hidden", !selfAssessmentAvailable);
}

function functionalGoalBindingForSession(planSession = {}) {
  const goals = state.goals.filter((goal) => goal.active !== false);
  const goalId = (planSession.linkedGoalIds || []).find((id) => goals.some((goal) => goal.id === id)) || "";
  return { goals, goalId };
}

function renderCharts() {
  const series = chartSeriesFromLongitudinal(buildLongitudinalState());
  renderLongitudinalChart($("adhdLongitudinalChart"), series, { label: "Evolución T0–T3" });
  renderLongitudinalChart($("adhdOverviewChart"), series.slice(0, 2), { label: "Resumen de evolución" });
}

function renderSofiaAudit() {
  if (!state.program) return;
  try {
    const longitudinal = buildLongitudinalState();
    const summary = buildAdhdSofiaSummary({
      profile: state.profile,
      program: state.plan,
      sessions: state.sessions,
      goals: state.goals,
      longitudinal
    }, { redactTerms: [patientLabel(state.patient)] });
    state.sofiaSummary = summary;
  } catch (_) {
    state.sofiaSummary = null;
  }
}

function buildLongitudinalState() {
  const inputs = state.evaluations
    .filter((evaluation) => evaluation.status === "completed" && evaluation.quality?.valid === true)
    .map((evaluation) => {
      const assessmentId = evaluation.assessmentId || evaluation.id;
      const profile = state.profiles.find((candidate) => candidate.assessmentId === assessmentId);
      return profile ? {
        ...evaluation,
        assessmentId,
        profile,
        taskResults: resultsForEvaluation(assessmentId)
      } : null;
    })
    .filter(Boolean);
  return buildAdhdLongitudinalSummary(inputs);
}

function chartSeriesFromLongitudinal(longitudinal) {
  const map = new Map();
  (longitudinal?.baselineComparisons || []).forEach((comparison) => {
    (comparison.measures || []).forEach((measure) => {
      if (!map.has(measure.key)) {
        map.set(measure.key, {
          label: measure.label,
          unit: measure.unit,
          points: [{ phase: comparison.baseline.phase, value: measure.baseline }]
        });
      }
      const series = map.get(measure.key);
      if (!series.points.some((point) => point.phase === comparison.followUp.phase)) {
        series.points.push({ phase: comparison.followUp.phase, value: measure.followUp });
      }
    });
  });
  return [...map.values()]
    .filter((series) => series.points.length >= 2)
    .map((series) => ({ ...series, points: series.points.sort((left, right) => ["T0", "T1", "T2", "T3"].indexOf(left.phase) - ["T0", "T1", "T2", "T3"].indexOf(right.phase)) }))
    .slice(0, 5);
}

function reassessmentEligibility(phase) {
  const completed = new Set(state.evaluations
    .filter((evaluation) => evaluation.status === "completed" && evaluation.quality?.valid === true)
    .map((evaluation) => evaluation.phase));
  if (!completed.has("T0")) return { allowed: false, reason: "Primero debe completarse una T0 válida y revisada." };
  const completedSessions = state.sessions.filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status)).length;
  const intermediate = Number(state.plan?.configuration?.intermediateReassessmentSession || state.plan?.intermediateReassessmentSession || 0);
  const final = Number(state.plan?.configuration?.finalReassessmentSession || state.plan?.finalReassessmentSession || state.plan?.sessions?.length || 0);
  if (phase === "T1" && intermediate && completedSessions < intermediate) {
    return { allowed: false, reason: `T1 está prevista después de la sesión ${intermediate}; hay ${completedSessions} finalizada(s).` };
  }
  if (phase === "T2" && final && completedSessions < final) {
    return { allowed: false, reason: `T2 está prevista después de la sesión ${final}; hay ${completedSessions} finalizada(s).` };
  }
  if (phase === "T3" && !completed.has("T2")) {
    return { allowed: false, reason: "T3 requiere una T2 válida y revisada como referencia final." };
  }
  return { allowed: true, reason: "" };
}

function readIntakeForm() {
  const formData = new FormData($("adhdIntakeForm"));
  const functionalDifficultyIds = formData.getAll("functionalDifficulty").map(String);
  const domains = uniqueStrings(functionalDifficultyIds.flatMap((id) => getFunctionalDifficulty(id)?.domains || []));
  return {
    age: Number(formData.get("age")),
    laterality: formData.get("laterality"),
    sleepHours: Number(formData.get("sleepHours")),
    sleepQuality: Number(formData.get("sleepQuality")),
    fatigue: Number(formData.get("fatigue")),
    motivation: Number(formData.get("motivation")),
    environmentalDistractibility: Number(formData.get("environmentalDistractibility")),
    adhdMedication: formData.get("adhdMedication"),
    lastDoseTime: formData.get("lastDoseTime"),
    batteryType: formData.get("batteryType") || "essential",
    recentCaffeine: formData.has("recentCaffeine"),
    recentTreatmentChanges: formData.has("recentTreatmentChanges"),
    visualProblems: formData.has("visualProblems"),
    auditoryProblems: formData.has("auditoryProblems"),
    telemetryEnabled: formData.has("telemetryEnabled"),
    interruptions: formData.get("interruptions"),
    functionalDifficultyIds,
    goal: normalizeFunctionalGoal({
      action: formData.get("goalAction"),
      context: formData.get("goalContext"),
      frequency: formData.get("goalFrequency"),
      target: formData.get("goalTarget"),
      reviewDate: formData.get("goalReviewDate"),
      reviewSource: formData.get("goalReviewSource"),
      difficultyId: functionalDifficultyIds[0] || "",
      domains
    })
  };
}

function validateAssessmentForm(form, errorNode) {
  if (form.checkValidity()) return true;
  const invalid = form.querySelector(":invalid");
  const fieldLabels = {
    age: "edad",
    sleepHours: "horas de sueño la noche previa",
    sleepQuality: "calidad subjetiva del sueño",
    fatigue: "fatiga subjetiva",
    motivation: "motivación actual",
    environmentalDistractibility: "distractibilidad ambiental",
    goalAction: "acción concreta",
    goalContext: "contexto",
    goalFrequency: "frecuencia",
    goalTarget: "meta observable",
    goalReviewDate: "fecha de revisión"
  };
  const label = fieldLabels[invalid?.name] || "un campo obligatorio";
  const message = `Falta completar o corregir: ${label}.`;
  errorNode.textContent = message;
  setAdhdStatus(message, "warning");
  invalid?.setAttribute("aria-invalid", "true");
  invalid?.scrollIntoView({ behavior: "smooth", block: "center" });
  invalid?.focus({ preventScroll: true });
  form.reportValidity();
  return false;
}

function setAssessmentSubmitBusy(busy, busyLabel = "Guardando e iniciando batería…") {
  const button = $("adhdCreateAssessment");
  if (!button) return;
  button.textContent = busy ? busyLabel : "Guardar contexto e iniciar batería";
  button.setAttribute("aria-busy", String(busy));
  button.disabled = Boolean(busy || (state.clinician && !state.canEditPatient));
}

function createAssessmentAdministration() {
  const actorRole = state.clinician ? "clinician" : "patient";
  return {
    schemaVersion: "1.0.0",
    actorRole,
    actorUid: state.user?.uid || "",
    patientId: state.patientId,
    source: state.clinician ? "clinician_account" : "patient_account",
    recordedAtIso: nowIso()
  };
}

function readPlanConfiguration() {
  const data = new FormData($("adhdPlanConfig"));
  return {
    totalSessions: Number(data.get("totalSessions")),
    weeks: Number(data.get("weeks")),
    sessionsPerWeek: Number(data.get("sessionsPerWeek")),
    sessionMinutes: Number(data.get("sessionMinutes")),
    telemetryEnabled: Boolean(state.currentEvaluation?.telemetryEnabled)
  };
}

function scheduleIntakeDraft() {
  window.clearTimeout(state.draftTimer);
  state.draftTimer = window.setTimeout(() => saveIntakeDraft(false), 650);
}

async function saveIntakeDraft(notify) {
  if (!state.patientId || !state.programId) return;
  const data = formSnapshot($("adhdIntakeForm"));
  const saved = await saveAdhdDraft({ patientId: state.patientId, programId: state.programId, kind: "intake", id: "current", data });
  if (notify) showToast(saved.pendingSync ? "Borrador guardado en este dispositivo." : "Borrador guardado.");
}

async function restoreIntakeDraft() {
  const draft = await loadAdhdDraft({ patientId: state.patientId, programId: state.programId, kind: "intake", id: "current" });
  if (draft?.payload) applyFormSnapshot($("adhdIntakeForm"), draft.payload);
}

function formSnapshot(form) {
  const output = {};
  form?.querySelectorAll("input, select, textarea").forEach((control) => {
    if (!control.name) return;
    if (control.type === "checkbox") {
      if (!Array.isArray(output[control.name])) output[control.name] = [];
      if (control.checked) output[control.name].push(control.value || true);
    } else if (control.type !== "radio" || control.checked) output[control.name] = control.value;
  });
  return output;
}

function applyFormSnapshot(form, snapshot) {
  form?.querySelectorAll("input, select, textarea").forEach((control) => {
    if (!control.name || snapshot[control.name] === undefined) return;
    if (control.type === "checkbox") control.checked = snapshot[control.name].map(String).includes(String(control.value || true));
    else control.value = snapshot[control.name];
  });
}

function resultsForEvaluation(evaluationId) {
  if (!evaluationId) return {};
  const matches = state.resultRecords.filter((record) => (
    record.references?.evaluationId === evaluationId
    || record.context?.evaluationId === evaluationId
  ));
  const map = {};
  matches.sort(byCompletedDate).forEach((record) => {
    if (record.taskId && (record.status === "completed" || !map[record.taskId])) map[record.taskId] = record;
  });
  return map;
}

function resolveTaskForm(taskId, source) {
  if (source === "assessment") return state.currentEvaluation?.formConfiguration?.tasks?.find((item) => item.taskId === taskId) || null;
  const attempt = state.currentSession?.blocks?.find((block) => block.taskId === taskId)?.attempts?.length || 0;
  return { randomSeed: hash32(`${state.programId}:${state.currentSession?.sessionId}:${taskId}:${attempt}`) };
}

function resolveExistingSession() {
  state.sessionRecoveredAfterReload = false;
  const candidates = state.sessions.filter((session) => !FINISHED_SESSION_STATUSES.has(session.status) && session.status !== "abandoned");
  const raw = latestByDate(candidates);
  if (!raw) return null;
  try {
    let session = hydrateAdhdSession(raw);
    const staleBlock = session.blocks?.find((block) => (
      block.id === session.currentBlockId && ["in_progress", "paused"].includes(block.status)
    ));
    if (staleBlock) {
      session = interruptAdhdBlock(session, staleBlock.id, {
        at: nowIso(),
        reason: "application_reloaded",
        pauseSession: true,
        source: "recovery"
      });
      session.recoveredAfterReload = true;
      state.sessionRecoveredAfterReload = true;
    }
    return session;
  } catch (_) {
    return null;
  }
}

function resolveCurrentChallenge() {
  if (!state.currentSession) return null;
  return state.challenges.find((challenge) => challenge.id === state.currentSession.transferChallengeId || challenge.sessionId === state.currentSession.sessionId) || null;
}

function resolvePendingFollowUpChallenge() {
  const completedSessionIds = new Set(state.sessions
    .filter((session) => ["completed", "completed_with_incomplete_data"].includes(session.status))
    .map((session) => session.sessionId || session.id));
  return state.challenges
    .filter((challenge) => challenge.status === "pending" && completedSessionIds.has(challenge.sessionId))
    .sort((left, right) => String(left.dueDate || left.createdAt || "").localeCompare(String(right.dueDate || right.createdAt || "")))[0] || null;
}

function resolvePendingSessionFeedback() {
  if (!state.currentSession) return null;
  const block = [...(state.currentSession.blocks || [])].reverse().find((item) => (
    item.kind === "cognitive_task"
    && ["completed", "completed_with_incomplete_data"].includes(item.status)
    && item.feedbackSkipped === undefined
    && item.postBlockSelfReport === undefined
    && item.result?.resultId
  ));
  if (!block) return null;
  const record = state.resultRecords.find((item) => item.id === block.result.resultId) || block.result;
  return {
    taskId: block.taskId,
    taskLabel: ADHD_TASK_CATALOG[block.taskId]?.label || block.label || "Tarea",
    source: "session",
    sessionBlockId: block.id,
    resultId: block.result.resultId,
    result: record,
    previous: null,
    restoredAfterReload: true
  };
}

function nextPlanSession() {
  if (!state.plan?.sessions?.length) return null;
  const done = new Set(state.sessions.filter((session) => FINISHED_SESSION_STATUSES.has(session.status)).map((session) => Number(session.plannedSessionNumber ?? session.number)));
  return state.plan.sessions.find((session) => !done.has(Number(session.sessionNumber))) || null;
}

function latestEvaluationForWork(evaluations) {
  const unfinished = evaluations.filter((item) => !["completed", "archived"].includes(item.status));
  return latestByDate(unfinished.length ? unfinished : evaluations);
}

function latestByDate(items) {
  return [...(items || [])].sort((a, b) => dateValue(b.updatedAt || b.completedAt || b.createdAt || b.createdAtIso) - dateValue(a.updatedAt || a.completedAt || a.createdAt || a.createdAtIso))[0] || null;
}

function dateValue(value) {
  if (value?.toDate) return value.toDate().getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function byCompletedDate(a, b) {
  return dateValue(a.completedAtIso || a.completedAt) - dateValue(b.completedAtIso || b.completedAt);
}

function extractTelemetry(result) {
  return {
    trials: result.trials || result.trialHistory || result.puzzles || [],
    practice: result.practiceTrials || result.practicePuzzles || [],
    sequence: result.sequence || [],
    events: result.technicalEvents || result.events || result.telemetry?.events || []
  };
}

function telemetryEnabledForSource(source) {
  return source === "assessment"
    ? Boolean(state.currentEvaluation?.telemetryEnabled)
    : Boolean(state.plan?.configuration?.telemetryEnabled);
}

function compactSessionTaskResult(result = {}) {
  const valid = result.valid !== false && result.quality?.valid !== false && result.metrics?.valid !== false;
  return {
    resultId: result.id || result.resultId || null,
    taskId: result.taskId || null,
    taskVersion: result.taskVersion || null,
    metricsVersion: result.metricsVersion || result.metricsEngineVersion || null,
    status: result.status || "completed",
    valid,
    quality: {
      valid,
      flags: Array.isArray(result.quality?.flags) ? result.quality.flags.slice(0, 20).map(String) : []
    },
    canonicalSource: "usuarios/{patientId}/rehabilitacionResultados/{resultId}",
    snapshotContainsMetrics: false,
    completedAtIso: result.completedAtIso || null
  };
}

function findPreviousComparableResult(active, current) {
  const currentConfiguration = active.metricConfiguration || current.comparisonConfiguration;
  return [...state.resultRecords].reverse().find((record) => {
    const sameSource = active.source === "assessment"
      ? Boolean(record.references?.evaluationId || record.context?.evaluationId)
      : Boolean(record.references?.sessionId || record.context?.sessionId);
    return sameSource
      && record.taskId === active.taskId
      && record.taskVersion === current.taskVersion
      && record.status === "completed"
      && record.valid !== false
      && record.quality?.valid !== false
      && record.metrics?.valid !== false
      && sameConfiguration(currentConfiguration, record.comparisonConfiguration || record.configuration?.metricConfiguration);
  }) || null;
}

function sameConfiguration(left, right) {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  return stableObjectString(left) === stableObjectString(right);
}

function stableObjectString(value) {
  if (Array.isArray(value)) return `[${value.map(stableObjectString).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableObjectString(value[key])}`).join(",")}}`;
}

async function resolvePatientEditAccess(patientId, patient = {}) {
  if (!state.clinician) return false;
  if (isAdministrator(state.actor || {})) return true;
  const ownerFields = [
    "creadoPor", "ownerUid", "createdByUid", "medicoUid", "uidMedico",
    "medicoTratanteUid", "medicoTratanteUID", "medicoTratanteId", "idMedico"
  ];
  if (ownerFields.some((field) => patient?.[field] === state.user?.uid)) return true;
  const embedded = patient?.permisosMedicos?.[state.user?.uid];
  if (embedded) return embedded.editarPaciente === true;
  const permission = await obtenerPermisoMedico(patientId, state.user?.uid).catch(() => null);
  return permission?.editarPaciente === true;
}

function resetTechnicalMonitor() {
  state.technicalMonitor?.stop?.();
  state.technicalMonitor = null;
}

function calculateAge(patient = {}) {
  const institutional = patient.datosInstitucionales || {};
  const explicit = Number(patient.edad ?? institutional.edad);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  const source = patient.fechaNacimiento || patient.fecha_nacimiento || patient.birthDate || patient.nacimiento || institutional.fechaNacimiento;
  if (!source) return null;
  const birth = new Date(source);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function patientLabel(patient) {
  return obtenerNombrePacienteParaMostrar(patient) || "Paciente sin nombre registrado";
}

function setDefaultReviewDate() {
  const input = $("adhdIntakeForm")?.elements?.goalReviewDate;
  if (input && !input.value) input.value = addDaysIso(42);
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function deriveSessionAdherence() {
  const started = state.sessions.filter((session) => session.status !== "not_started");
  if (!started.length) return null;
  return started.filter((session) => FINISHED_SESSION_STATUSES.has(session.status)).length / started.length;
}

function adaptiveDifficultyLabel() {
  const decisions = Object.values(state.adaptiveDecisions);
  const latest = decisions.at(-1);
  if (!latest) return "Calibración inicial";
  return latest.decision === "increase" ? "Aumento de una dimensión" : latest.decision === "decrease" ? "Reducción de una dimensión" : "Dificultad mantenida";
}

function boundedRating(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(10, numeric)) : null;
}

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function upsertById(items, value) {
  const id = value.id || value.assessmentId || value.profileId || value.planId || value.sessionId;
  const output = [...(items || [])];
  const index = output.findIndex((item) => (item.id || item.assessmentId || item.profileId || item.planId || item.sessionId) === id);
  if (index >= 0) output[index] = value;
  else output.push(value);
  return output;
}

async function auditEvent(eventType, details = {}) {
  if (!state.patientId || !state.programId) return null;
  return saveProgramAudit({
    patientId: state.patientId,
    programId: state.programId,
    auditId: crearIdEstableAdhd("audit", state.programId, eventType, nowIso()),
    data: { eventType, details, actorRole: state.clinician ? "clinician" : "patient", occurredAtIso: nowIso() }
  }).catch(() => null);
}

function setBusy(busy, message = "") {
  state.busy = busy;
  $("adhdApp")?.setAttribute("aria-busy", String(busy));
  if (message) setAdhdStatus(message);
}

function reportError(error, userMessage) {
  const code = String(error?.code || error?.name || "unknown_error");
  setAdhdStatus(`${userMessage} Código: ${code}.`, "error");
  showToast(userMessage);
}

function authorizationAwareMessage(error, fallback) {
  const code = String(error?.code || error?.name || "").toLowerCase();
  if (code.includes("permission-denied") || code.includes("unauthenticated") || code.includes("unauthorized")) {
    return "La operación fue rechazada por permisos; no se marcó como sincronización pendiente ni como guardada.";
  }
  return fallback;
}

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

// API de depuración deliberadamente no identificatoria para pruebas manuales.
window.__cognicionAdhd = Object.freeze({
  protocolId: ADHD_PROTOCOL_ID,
  protocolVersion: ADHD_PROTOCOL_VERSION,
  getStatus: () => ({
    hasProgram: Boolean(state.program),
    assessmentPhase: state.currentEvaluation?.phase || null,
    completedAssessmentTasks: Object.values(state.assessmentResults).filter((item) => item.status === "completed").length,
    activeSessionStatus: state.currentSession?.status || null
  }),
  archive: (reason = "clinician_closed") => state.canEditPatient
    ? archiveAdhdProgram({ patientId: state.patientId, programId: state.programId, reason })
    : Promise.reject(new Error("clinician_required"))
});
