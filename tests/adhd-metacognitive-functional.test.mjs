import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADHD_METACOGNITIVE_MODULES,
  ADHD_PROTOCOL_VERSION,
  getMetacognitiveModule
} from "../js/adhd/config/adhdProtocol.js";
import {
  ADHD_FUNCTIONAL_PROGRESS_SOURCES,
  ADHD_FUNCTIONAL_SERVICE_VERSION,
  applyTransferOutcomeToGoal,
  createTransferChallenge,
  normalizeFunctionalProgressEntry,
  selectFunctionalGoal,
  summarizeFunctionalAdherence,
  summarizeFunctionalProgressBySource
} from "../js/adhd/services/adhdFunctionalTransferService.js";
import {
  buildAdhdAdaptiveHistoryViewModel,
  buildAdhdFunctionalProgressViewModel,
  buildAdhdSessionAdherenceViewModel,
  buildMetacognitiveModuleResult,
  buildMetacognitiveModuleViewModel,
  buildTransferChallengeViewModel,
  resolveAdhdSessionNumber
} from "../js/adhd/ui/adhdProgramView.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function smartGoal(overrides = {}) {
  return {
    id: "goal-planning",
    action: "Preparar el informe semanal",
    context: "escritorio de trabajo después del desayuno",
    frequency: "tres mañanas por semana",
    target: "iniciar antes de las 09:15 y completar el primer apartado",
    reviewDate: "2026-09-15",
    reviewSource: "patient",
    domains: ["planning", "metacognition"],
    ...overrides
  };
}

test("los módulos metacognitivos tienen contenido breve, versionado y accionable", () => {
  assert.equal(ADHD_PROTOCOL_VERSION, "1.1.0");
  assert.ok(ADHD_METACOGNITIVE_MODULES.length >= 10);
  assert.equal(new Set(ADHD_METACOGNITIVE_MODULES.map((module) => module.id)).size, ADHD_METACOGNITIVE_MODULES.length);

  ADHD_METACOGNITIVE_MODULES.forEach((module) => {
    assert.match(module.contentVersion, /^\d+\.\d+\.\d+$/u);
    assert.ok(module.minutes >= 3 && module.minutes <= 5, `${module.id} debe seguir siendo breve`);
    assert.ok(module.description.length >= 40);
    assert.ok(module.steps.length >= 3 && module.steps.length <= 4);
    assert.equal(new Set(module.steps.map((step) => step.id)).size, module.steps.length);
    assert.ok(module.steps.every((step) => step.label.length >= 20));
    assert.ok(module.strategyPrompt.length >= 25);
    assert.ok(module.applicationPrompt.length >= 25);
    assert.equal(Object.isFrozen(module.steps), true);
    assert.equal(Object.isFrozen(module.steps[0]), true);
  });
  assert.equal(getMetacognitiveModule("task_start")?.id, "task_start");
  assert.equal(getMetacognitiveModule("missing"), null);
});

test("los helpers puros del módulo exigen pasos, estrategia y aplicación real", () => {
  const definition = getMetacognitiveModule("goal_check");
  const completedStepIds = definition.steps.map((step) => step.id);
  const viewModel = buildMetacognitiveModuleViewModel(
    { moduleId: "goal_check" },
    {
      completedStepIds: [...completedStepIds, "unknown-step"],
      strategy: "  Decirme: vuelve a la siguiente acción.  ",
      application: "Antes de responder el correo de seguimiento."
    }
  );
  assert.equal(viewModel.available, true);
  assert.equal(viewModel.allStepsCompleted, true);
  assert.deepEqual(viewModel.completedStepIds, completedStepIds);
  assert.equal(viewModel.strategy, "Decirme: vuelve a la siguiente acción.");

  const complete = buildMetacognitiveModuleResult("goal_check", viewModel, {
    completedAt: "2026-09-02T10:00:00.000Z"
  });
  assert.equal(complete.valid, true);
  assert.equal(complete.result.status, "completed");
  assert.equal(complete.result.totalSteps, definition.steps.length);
  assert.equal(complete.result.acknowledged, true);

  const incomplete = buildMetacognitiveModuleResult("goal_check", {
    completedStepIds: completedStepIds.slice(0, -1),
    strategy: "",
    application: "En el trabajo"
  });
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.includes("metacognitive_steps_incomplete"));
  assert.ok(incomplete.errors.includes("metacognitive_strategy_required"));
  assert.equal(incomplete.result.completedAt, null);
});

test("el reto selecciona y conserva un objetivo SMART compatible con el dominio y contexto", () => {
  assert.equal(ADHD_FUNCTIONAL_SERVICE_VERSION, "1.1.0");
  const attentionGoal = smartGoal({
    id: "goal-attention",
    action: "Leer un capítulo",
    domains: ["sustainedAttention"]
  });
  const planningGoal = smartGoal();
  const selected = selectFunctionalGoal({
    goals: [attentionGoal, planningGoal],
    domains: ["planning"]
  });
  assert.equal(selected.id, planningGoal.id);

  const challenge = createTransferChallenge({
    sessionNumber: 3,
    domains: ["planning"],
    goals: [attentionGoal, planningGoal],
    ageMode: "adult",
    seed: 21,
    dueDate: "2026-09-04"
  });
  assert.equal(challenge.goalBinding.status, "linked");
  assert.equal(challenge.linkedGoalId, planningGoal.id);
  assert.deepEqual(challenge.linkedGoalIds, [planningGoal.id]);
  assert.equal(challenge.goalSnapshot.context, planningGoal.context);
  assert.equal(challenge.applicationContext, planningGoal.context);
  assert.match(challenge.applicationPrompt, /Preparar el informe semanal/u);
  assert.match(challenge.applicationPrompt, /09:15/u);

  const uiModel = buildTransferChallengeViewModel(challenge);
  assert.equal(uiModel.linked, true);
  assert.equal(uiModel.goalAction, planningGoal.action);
  assert.equal(uiModel.goalTarget, planningGoal.target);

  const unlinked = createTransferChallenge({
    sessionNumber: 4,
    domains: ["planning"],
    goal: { action: "Tarea sin componentes SMART" },
    context: "casa",
    seed: 22
  });
  assert.equal(unlinked.goalBinding.status, "unlinked");
  assert.equal(unlinked.goalBinding.reason, "goal_context_required");
  assert.equal(buildTransferChallengeViewModel(unlinked, planningGoal).linked, false);

  const missingRequestedGoal = createTransferChallenge({
    sessionNumber: 4,
    domains: ["planning"],
    goal: planningGoal,
    goalId: "different-goal",
    seed: 22
  });
  assert.equal(missingRequestedGoal.goalBinding.status, "unlinked");
  assert.equal(missingRequestedGoal.linkedGoalId, "");
});

test("el resultado funcional agrega progreso estructurado sin mezclar fuentes", () => {
  const goal = smartGoal();
  const challenge = createTransferChallenge({
    sessionNumber: 5,
    domains: ["planning"],
    goal,
    seed: 44
  });
  const update = applyTransferOutcomeToGoal(goal, challenge, {
    status: "partial",
    completedAt: "2026-09-05T12:30:00.000Z",
    sourceReports: [
      { source: "patient", achievement: 0.5, attempts: 3, successfulAttempts: 2, confidence: 0.8 },
      { source: "caregiver", status: "achieved", attempts: 1, successfulAttempts: 1 }
    ]
  });
  assert.equal(update.linked, true);
  assert.equal(update.goal.progress.length, 2);
  assert.deepEqual(update.goal.progress.map((entry) => entry.source), ["patient", "caregiver"]);
  assert.ok(update.goal.progress.every((entry) => entry.goalId === goal.id && entry.challengeId === challenge.id));

  const bySource = summarizeFunctionalProgressBySource([update.goal]);
  assert.deepEqual(Object.keys(bySource), ADHD_FUNCTIONAL_PROGRESS_SOURCES);
  assert.equal(bySource.patient.meanAchievement, 0.5);
  assert.equal(bySource.patient.attempts, 3);
  assert.equal(bySource.caregiver.meanAchievement, 1);
  assert.equal(bySource.clinician.checkIns, 0);
  assert.equal(bySource.clinician.meanAchievement, null);

  const adherence = summarizeFunctionalAdherence([update.challenge], [update.goal]);
  assert.equal(adherence.challengeAdherence, 0.5);
  assert.equal(adherence.goalCheckIns, 2);
  assert.equal(adherence.meanGoalAchievement, 0.75);
  assert.equal(adherence.goalProgressBySource.teacher.checkIns, 0);
  assert.match(adherence.interpretation, /fuentes se resumen por separado/u);

  const bounded = normalizeFunctionalProgressEntry({
    source: "teacher",
    status: "partial",
    attempts: 2,
    successfulAttempts: 9,
    achievement: 4
  });
  assert.equal(bounded.achievement, 1);
  assert.equal(bounded.successfulAttempts, 2);
  assert.equal(normalizeFunctionalProgressEntry({
    source: "clinician",
    status: "not_observed",
    achievement: 0.9
  }).achievement, null);
});

test("el diálogo accesible, el objetivo vinculado y los estados no repetibles quedan presentes en la UI", () => {
  const html = read("rehabilitacion-tdah.html");
  const css = read("css/rehabilitacion-tdah.css");
  const view = read("js/adhd/ui/adhdProgramView.js");

  assert.match(html, /id="adhdMetacognitiveDialog"[^>]*aria-labelledby="adhdMetacognitiveTitle"[^>]*aria-describedby="adhdMetacognitiveDescription"/u);
  assert.match(html, /id="adhdMetacognitiveSteps"/u);
  assert.match(html, /id="adhdMetacognitiveProgress"[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(html, /id="adhdMetacognitiveStrategy"[^>]*maxlength="500"/u);
  assert.match(html, /id="adhdMetacognitiveApplication"[^>]*maxlength="500"/u);
  assert.match(html, /id="adhdTransferGoal"[^>]*aria-labelledby="adhdTransferGoalLabel"/u);
  assert.match(html, /id="adhdTransferGoalContext"/u);
  assert.match(html, /id="adhdTransferGoalTarget"/u);
  assert.match(css, /\.adhd-metacognitive-steps label:has\(input:checked\)/u);
  assert.match(css, /\.adhd-transfer-goal dl/u);
  assert.match(view, /data-open-metacognitive-module/u);
  assert.doesNotMatch(view, /Repetir/u);
  assert.match(view, /active \|\| completed \? "disabled"/u);
});

test("el número clínico de sesión respeta el orden de precedencia solicitado", () => {
  assert.equal(resolveAdhdSessionNumber({ plannedSessionNumber: 7, sessionNumber: 4, number: 2 }), 7);
  assert.equal(resolveAdhdSessionNumber({ sessionNumber: 4, number: 2 }), 4);
  assert.equal(resolveAdhdSessionNumber({ number: 2 }), 2);
  assert.equal(resolveAdhdSessionNumber({}), null);

  const view = read("js/adhd/ui/adhdProgramView.js");
  assert.match(view, /session\.plannedSessionNumber \?\? session\.sessionNumber \?\? session\.number/u);
  assert.match(view, /sessionRecords\.slice\(\)\.sort\(compareAdhdSessionNumbers\)/u);
});

test("el panel calcula adherencia con denominadores explícitos y conserva estados incompletos", () => {
  const model = buildAdhdSessionAdherenceViewModel({
    plan: { sessions: [{}, {}, {}, {}] },
    sessions: [
      { id: "s1", status: "completed" },
      { id: "s2", status: "completed_with_incomplete_data" },
      { id: "s3", status: "paused" },
      { id: "s4", status: "not_started" },
      { id: "s4", status: "not_started" }
    ]
  });
  assert.equal(model.scheduledSessions, 4);
  assert.equal(model.recordedSessions, 4);
  assert.equal(model.startedSessions.length, 3);
  assert.equal(model.completedSessions.length, 2);
  assert.equal(model.incompleteDataSessions.length, 1);
  assert.equal(model.openOrInterruptedSessions.length, 1);
  assert.equal(model.plannedCompletionRate, 0.5);
  assert.equal(model.startedCompletionRate, 2 / 3);

  const empty = buildAdhdSessionAdherenceViewModel({});
  assert.equal(empty.hasData, false);
  assert.equal(empty.plannedCompletionRate, null);
  assert.equal(empty.startedCompletionRate, null);
});

test("el historial adaptativo usa una fila por resultado canónico sin exponer IDs ni texto libre", () => {
  const first = {
    id: "patient-secret-result-1",
    taskId: "nback",
    taskVersion: "1.1.0",
    completedAtIso: "2026-09-02T10:00:00.000Z",
    note: "texto libre clínico que no debe aparecer",
    adaptiveDecision: {
      decision: "increase",
      adjustedDimension: "level",
      adjustment: { dimension: "level", before: 1, after: 2 },
      window: {
        band: "above_target",
        observationsScored: 4,
        minimumObservations: 3,
        burden: { high: false },
        speedAccuracyGuard: { active: false }
      }
    }
  };
  const rows = buildAdhdAdaptiveHistoryViewModel({
    resultRecords: [
      {
        id: "patient-secret-result-2",
        taskId: "stop_signal",
        taskVersion: "1.0.0",
        completedAtIso: "2026-09-03T10:00:00.000Z",
        adaptiveDecision: { decision: "hold", method: "one_up_one_down_ssd_staircase", taskId: "stop_signal" }
      },
      first,
      { taskId: "nback", adaptiveDecision: { decision: "hold" } }
    ],
    taskResults: { nback: first }
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].canonicalLabel, "Resultado canónico 1");
  assert.equal(rows[0].taskLabel, "N-Back");
  assert.match(rows[0].adjustmentLabel, /Nivel N: 1 → 2/u);
  assert.match(rows[0].evidenceLabel, /4 de 3 observaciones mínimas/u);
  assert.equal(rows[1].canonicalLabel, "Resultado canónico 2");
  const serialized = JSON.stringify(rows);
  assert.doesNotMatch(serialized, /patient-secret-result/u);
  assert.doesNotMatch(serialized, /texto libre clínico/u);
});

test("el panel funcional separa fuentes, deduplica el reto ligado y omite notas sensibles", () => {
  const shared = {
    id: "progress-shared",
    source: "patient",
    status: "partial",
    achievement: 0.5,
    attempts: 2,
    successfulAttempts: 1,
    at: "2026-09-04",
    note: "detalle funcional libre sensible"
  };
  const model = buildAdhdFunctionalProgressViewModel({
    goals: [{ id: "goal-private", action: "acción privada", progress: [shared] }],
    challenges: [{
      id: "challenge-private",
      note: "nota privada",
      sourceReports: [shared, {
        id: "progress-caregiver",
        source: "caregiver",
        status: "achieved",
        achievement: 1,
        attempts: 1,
        successfulAttempts: 1,
        at: "2026-09-05"
      }]
    }]
  });
  assert.equal(model.hasData, true);
  assert.deepEqual(model.rows.map((row) => row.source), ["patient", "caregiver", "clinician", "teacher"]);
  assert.equal(model.rows[0].checkIns, 1);
  assert.equal(model.rows[0].meanAchievement, 0.5);
  assert.equal(model.rows[1].checkIns, 1);
  assert.equal(model.rows[2].checkIns, 0);
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /detalle funcional|acción privada|nota privada|goal-private|challenge-private/u);
});

test("la vista clínica declara estados vacíos honestos para sus tres desgloses", () => {
  const html = read("rehabilitacion-tdah.html");
  ["adhdSessionAdherence", "adhdAdaptiveHistoryTable", "adhdFunctionalProgressTable"].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`, "u"), `Falta #${id}`);
  });
  assert.match(html, /Sin decisiones adaptativas persistidas en resultados canónicos/u);
  assert.match(html, /Sin registros funcionales por fuente\. Esto no significa ausencia de dificultad/u);
  assert.match(html, /Una sesión sin registro no se interpreta como abandono/u);
});
