import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAdhdProgramEdits,
  generateAdhdProgram,
  validateAdhdProgram
} from "../js/adhd/core/adhdProgramEngine.js";
import {
  adaptAdhdDifficulty,
  adaptStopSignalDifficulty,
  evaluateAdaptiveWindow
} from "../js/adhd/core/adhdAdaptiveEngine.js";
import {
  AdhdSessionTransitionError,
  completeAdhdSession,
  createAdhdSession,
  hydrateAdhdSession,
  interruptAdhdBlock,
  pauseAdhdSession,
  recordAdhdBlockResult,
  resumeAdhdSession,
  startAdhdBlock,
  startAdhdSession,
  validateAdhdSession
} from "../js/adhd/core/adhdSessionEngine.js";
import {
  buildAdhdLongitudinalSummary,
  compareAdhdAssessments,
  createAdhdReassessmentConfiguration
} from "../js/adhd/core/adhdLongitudinalEngine.js";
import {
  buildAdhdResearchDataset,
  exportAdhdResearchCsv,
  exportAdhdResearchJson,
  validateAdhdResearchDataset
} from "../js/adhd/core/adhdResearchExport.js";
import {
  buildAdhdSofiaSummary,
  validateAdhdSofiaSummary
} from "../js/adhd/integration/adhdSofiaBridge.js";
import { resolveAgeModality } from "../js/adhd/config/adhdProtocol.js";

function profile(phase = "T0", commissionRate = 0.3, accuracy = 0.76, sleepHours = 7) {
  return {
    profileId: `profile-${phase}`,
    assessmentId: `assessment-${phase}`,
    assessmentPhase: phase,
    profileEngineVersion: "1.0.0",
    createdAt: `2026-01-0${phase === "T0" ? 1 : 2}T10:00:00.000Z`,
    sourceTaskIds: ["go_nogo", "nback"],
    quality: { requiredTasks: 8, completedTasks: 8, validTasks: 8, complete: true, fullyInterpretable: true },
    context: { age: 31, sleepHours, fatigue: phase === "T0" ? 6 : 2, deviceClass: "desktop", inputMode: "keyboard" },
    domains: [
      {
        id: "inhibitoryControl",
        label: "Control inhibitorio",
        status: "complete",
        selectionSignal: 0.86,
        observedDifficultySignal: commissionRate,
        linkedGoals: [{ id: "goal-impulse", label: "Revisar antes de responder" }],
        measures: [
          { taskId: "go_nogo", label: "Tasa de comisiones No-Go", value: commissionRate, unit: "proportion", validity: "valid" },
          { taskId: "go_nogo", label: "Tiempo de respuesta medio", value: phase === "T0" ? 510 : 430, unit: "ms", validity: "valid" }
        ],
        caveats: ["Sin normas poblacionales."]
      },
      {
        id: "workingMemory",
        label: "Memoria de trabajo",
        status: "complete",
        selectionSignal: 0.72,
        observedDifficultySignal: 1 - accuracy,
        linkedGoals: [],
        measures: [
          { taskId: "nback", label: "Precisión", value: accuracy, unit: "proportion", validity: "valid" }
        ],
        caveats: ["Sin normas poblacionales."]
      }
    ]
  };
}

test("la batería estándar solo se bloquea cuando la modalidad lo declara explícitamente", () => {
  assert.notEqual(resolveAgeModality(6)?.standardProgramAvailable, false);
  assert.notEqual(resolveAgeModality(13)?.standardProgramAvailable, false);
  assert.notEqual(resolveAgeModality(30)?.standardProgramAvailable, false);
  assert.equal(resolveAgeModality(5)?.standardProgramAvailable, false);
});

test("el generador exige basal, respeta edad y produce sesiones multicomponente auditables", () => {
  const withoutBaseline = generateAdhdProgram({ age: 30, generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(withoutBaseline.status, "blocked");
  assert.ok(withoutBaseline.blockingErrors.includes("baseline_profile_required"));
  assert.equal(withoutBaseline.sessions.length, 0);

  const preschool = generateAdhdProgram({ age: 5, profile: profile() });
  assert.equal(preschool.status, "blocked");
  assert.ok(preschool.blockingErrors.includes("standard_program_not_available_before_age_6"));

  const program = generateAdhdProgram({
    programId: "program-test",
    age: 31,
    profile: profile(),
    functionalGoals: [{
      id: "goal-impulse",
      action: "Revisar instrucciones antes de responder",
      context: "trabajo",
      frequency: "4 días por semana",
      target: "máximo un error evitable",
      domains: ["inhibitoryControl", "metacognition"]
    }],
    configuration: { totalSessions: 24, weeks: 6, sessionMinutes: 30 }
  });
  assert.equal(program.generativeAiUsed, false);
  assert.equal(program.sessions.length, 24);
  assert.equal(program.modality.id, "adult");
  assert.equal(program.prioritizedDomains[0].id, "inhibitoryControl");
  assert.ok(program.prioritizedDomains[0].reasons.some((reason) => /objetivo/i.test(reason)));
  const requiredKinds = ["activation", "cognitive_task", "metacognition", "functional_transfer", "self_assessment", "feedback"];
  program.sessions.forEach((session) => {
    const kinds = session.blocks.map((block) => block.kind);
    requiredKinds.forEach((kind) => assert.ok(kinds.includes(kind), `${session.sessionId} carece de ${kind}`));
    const tasks = session.blocks.filter((block) => block.kind === "cognitive_task");
    assert.equal(tasks.length, 2);
    assert.equal(new Set(tasks.map((task) => task.taskId)).size, tasks.length);
    assert.ok(tasks.every((task) => task.practiceRequired && task.practiceExcludedFromScoring));
    assert.ok(session.plannedMinutes >= 20 && session.plannedMinutes <= 30);
  });
  assert.ok(new Set(program.sessions.flatMap((session) => session.blocks.filter((block) => block.kind === "cognitive_task").map((block) => block.taskId))).size >= 6);
  assert.equal(validateAdhdProgram(program).valid, true);

  const edited = applyAdhdProgramEdits(program, {
    type: "change_frequency",
    weeks: 8,
    reason: "Distribuir sesiones por adherencia reciente",
    at: "2026-01-02T00:00:00Z"
  });
  assert.equal(edited.configuration.weeks, 8);
  assert.equal(edited.manualOverride, true);
  assert.equal(edited.auditTrail.at(-1).source, "manual_clinician_edit");
  assert.equal(edited.validation.valid, true);

  const overfilled = applyAdhdProgramEdits(program, {
    type: "add_task",
    sessionNumber: 1,
    taskId: "dichotic_listening",
    reason: "Prueba del contrato de dos tareas",
    at: "2026-01-02T00:00:00Z"
  });
  assert.equal(overfilled.validation.valid, false);
  assert.ok(overfilled.validation.errors.includes("session_1_requires_exactly_two_cognitive_tasks"));
});

test("el motor adaptativo usa ventana móvil, cambia una dimensión y aplica guardas", () => {
  const high = Array.from({ length: 5 }, (_, index) => ({ accuracy: 0.92, meanRtMs: 540 - index * 5, anticipatoryRate: 0.01, fatigue: 2 }));
  const increase = adaptAdhdDifficulty({
    taskId: "nback",
    currentDifficulty: { level: 2, intervalMs: 1800, distractorLevel: 1, stimulusSimilarity: 1 },
    recentResults: high
  });
  assert.equal(increase.decision, "increase");
  assert.equal(increase.changedDimensionCount, 1);
  assert.equal(Object.keys(increase.nextDifficulty).filter((key) => increase.nextDifficulty[key] !== increase.currentDifficulty[key]).length, 1);

  const fatigued = adaptAdhdDifficulty({
    taskId: "nback",
    currentDifficulty: increase.currentDifficulty,
    recentResults: high.map((item, index) => ({ ...item, fatigue: index === 4 ? 8 : 2 }))
  });
  assert.equal(fatigued.decision, "hold");
  assert.equal(fatigued.window.burden.high, true);

  const currentBurden = adaptAdhdDifficulty({
    taskId: "nback",
    currentDifficulty: increase.currentDifficulty,
    recentResults: high,
    fatigue: 9,
    frustration: 8
  });
  assert.equal(currentBurden.decision, "hold", "el autorreporte del bloque actual debe bloquear el aumento");
  assert.equal(currentBurden.window.burden.latestFatigue, 9);
  assert.equal(currentBurden.window.burden.latestFrustration, 8);

  const tradeoff = evaluateAdaptiveWindow("go_nogo", [
    { accuracy: 0.99, balancedAccuracy: 0.96, meanRtMs: 620 },
    { accuracy: 0.99, balancedAccuracy: 0.94, meanRtMs: 600 },
    { accuracy: 0.99, balancedAccuracy: 0.8, meanRtMs: 430 },
    { accuracy: 0.99, balancedAccuracy: 0.79, meanRtMs: 410 }
  ], { minimumObservations: 4 });
  assert.equal(tradeoff.speedAccuracyGuard.tradeoff.detected, true);
  const guarded = adaptAdhdDifficulty({
    taskId: "go_nogo",
    currentDifficulty: { perceptualSimilarity: 1, responseWindowMs: 1200, noGoRarity: 1 },
    recentResults: [
      { accuracy: 0.99, balancedAccuracy: 0.96, meanRtMs: 620 },
      { accuracy: 0.99, balancedAccuracy: 0.94, meanRtMs: 600 },
      { accuracy: 0.99, balancedAccuracy: 0.8, meanRtMs: 430 },
      { accuracy: 0.99, balancedAccuracy: 0.79, meanRtMs: 410 }
    ]
  }, { minimumObservations: 4 });
  assert.equal(guarded.decision, "hold");

  const decrease = adaptAdhdDifficulty({
    taskId: "stroop",
    currentDifficulty: { interferenceLevel: 2, responseWindowMs: 1200, incongruentProportion: 0.5 },
    recentResults: Array.from({ length: 5 }, () => ({ accuracy: 0.61, meanRtMs: 900 }))
  });
  assert.equal(decrease.decision, "decrease");
  assert.equal(decrease.changedDimensionCount, 1);
});

test("CPT y Go/No-Go adaptan con precisión balanceada y no premian patrones triviales", () => {
  const cptNoResponses = adaptAdhdDifficulty({
    taskId: "cpt_x",
    currentDifficulty: { distractorLevel: 1, isiMs: 1200, targetRarity: 1, durationMinutes: 5 },
    recentResults: Array.from({ length: 5 }, () => ({
      metrics: {
        accuracy: 0.95,
        hitRate: 0,
        correctRejectionRate: 1,
        omissionRate: 1,
        falseAlarmRate: 0
      }
    }))
  });
  assert.equal(cptNoResponses.window.averageAccuracy, 0.5);
  assert.equal(cptNoResponses.window.speedAccuracyGuard.omissionGuard, true);
  assert.notEqual(cptNoResponses.decision, "increase");

  const goRespondEverything = adaptAdhdDifficulty({
    taskId: "go_nogo",
    currentDifficulty: { perceptualSimilarity: 1, responseWindowMs: 1200, noGoRarity: 1 },
    recentResults: Array.from({ length: 5 }, () => ({
      metrics: {
        accuracy: 0.9,
        goHitRate: 1,
        correctInhibitionRate: 0,
        omissionRate: 0,
        commissionRate: 1
      }
    }))
  });
  assert.equal(goRespondEverything.window.averageAccuracy, 0.5);
  assert.equal(goRespondEverything.window.speedAccuracyGuard.commissionGuard, true);
  assert.notEqual(goRespondEverything.decision, "increase");
});

test("Stop-Signal mantiene un staircase SSD separado y la fatiga impide subir", () => {
  const success = adaptStopSignalDifficulty({
    currentDifficulty: { ssdMs: 250 },
    recentResults: [{ inhibitionSuccessful: true, fatigue: 2 }]
  });
  assert.equal(success.generalAccuracyTargetApplied, false);
  assert.equal(success.decision, "ssd_increase");
  assert.equal(success.nextDifficulty.ssdMs, 300);
  assert.equal(success.changedDimensionCount, 1);

  const failed = adaptAdhdDifficulty({
    taskId: "stop_signal",
    currentDifficulty: { ssdMs: 250 },
    recentResults: [{ inhibitionSuccessful: false }]
  });
  assert.equal(failed.nextDifficulty.ssdMs, 200);

  const fatigued = adaptStopSignalDifficulty({
    currentDifficulty: { ssdMs: 250 },
    recentResults: [{ inhibitionSuccessful: true, fatigue: 9 }]
  });
  assert.equal(fatigued.decision, "hold");
  assert.equal(fatigued.nextDifficulty.ssdMs, 250);

  const frustrated = adaptStopSignalDifficulty({
    currentDifficulty: { ssdMs: 250 },
    recentResults: [{ inhibitionSuccessful: true }],
    frustration: 8
  });
  assert.equal(frustrated.decision, "hold");
  assert.equal(frustrated.nextDifficulty.ssdMs, 250);
});

test("la sesión pausa en límite seguro, una interrupción descarta el intento y obliga a reiniciar", () => {
  let session = createAdhdSession({
    sessionId: "session-test",
    programId: "program-test",
    createdAt: "2026-01-01T10:00:00Z",
    programEngineVersion: "1.0.0",
    blocks: [{ id: "task-1", kind: "cognitive_task", taskId: "nback", taskVersion: "1.0.0", required: true }]
  });
  session = startAdhdSession(session, "2026-01-01T10:01:00Z");
  session = startAdhdBlock(session, "task-1", { at: "2026-01-01T10:02:00Z" });
  assert.throws(
    () => pauseAdhdSession(session, { at: "2026-01-01T10:03:00Z" }),
    (error) => error instanceof AdhdSessionTransitionError && error.code === "safe_boundary_required"
  );
  session = pauseAdhdSession(session, { safeBoundary: true, checkpoint: { nextTrialIndex: 11 }, at: "2026-01-01T10:03:00Z" });
  assert.equal(session.status, "paused");
  session = resumeAdhdSession(session, { at: "2026-01-01T10:04:00Z" });
  assert.equal(session.blocks[0].attempts[0].resumedFromPartialTrial, false);
  session = interruptAdhdBlock(session, "task-1", { reason: "focus_loss", at: "2026-01-01T10:05:00Z" });
  assert.equal(session.blocks[0].status, "pending");
  assert.equal(session.blocks[0].mustRestart, true);
  assert.equal(session.blocks[0].result, null);
  assert.equal(session.blocks[0].attempts[0].status, "interrupted_discarded");
  assert.equal(session.dataQuality.partialInterruptedDataRetained, false);

  session = resumeAdhdSession(session, { at: "2026-01-01T10:06:00Z" });
  session = startAdhdBlock(session, "task-1", { at: "2026-01-01T10:07:00Z" });
  assert.equal(session.blocks[0].attempts.length, 2);
  session = recordAdhdBlockResult(session, "task-1", {
    resultId: "result-task-1",
    taskId: "nback",
    taskVersion: "1.0.0",
    metricsVersion: "1.0.0",
    metrics: { accuracy: 0.8 }
  }, { at: "2026-01-01T10:12:00Z" });
  assert.equal(session.blocks[0].result.resultId, "result-task-1");
  assert.equal(session.blocks[0].result.snapshotContainsMetrics, false);
  assert.equal(Object.hasOwn(session.blocks[0].result, "metrics"), false);
  session = completeAdhdSession(session, "2026-01-01T10:13:00Z");
  assert.equal(session.status, "completed");
  assert.equal(validateAdhdSession(session).valid, true);
});

test("la sesión conserva módulos versionados y obliga a completar los bloques en orden", () => {
  let session = createAdhdSession({
    sessionId: "ordered-session",
    programId: "program-test",
    programEngineVersion: "1.0.0",
    blocks: [
      { id: "activation", kind: "activation", moduleId: "context_check", captures: ["fatigue"] },
      { id: "metacognition", kind: "metacognition", moduleId: "goal_check", domains: ["metacognition"] },
      { id: "transfer", kind: "functional_transfer", challengeId: "challenge-1", linkedGoalIds: ["goal-1"] }
    ]
  });
  assert.equal(session.blocks[1].moduleId, "goal_check");
  assert.deepEqual(session.blocks[1].domains, ["metacognition"]);
  assert.equal(session.blocks[2].challengeId, "challenge-1");
  assert.deepEqual(session.blocks[2].linkedGoalIds, ["goal-1"]);
  session = startAdhdSession(session, "2026-01-03T10:00:00Z");
  assert.throws(
    () => startAdhdBlock(session, "metacognition", { at: "2026-01-03T10:01:00Z" }),
    (error) => error instanceof AdhdSessionTransitionError && error.code === "block_order_violation"
  );
  session = startAdhdBlock(session, "activation", { at: "2026-01-03T10:01:00Z" });
  session = recordAdhdBlockResult(session, "activation", { acknowledged: true }, { at: "2026-01-03T10:02:00Z" });
  session = startAdhdBlock(session, "metacognition", { at: "2026-01-03T10:03:00Z" });
  assert.equal(session.currentBlockId, "metacognition");
});

test("la sesión conserva resultados incompletos, versiones y rechaza esquemas futuros", () => {
  let session = createAdhdSession({
    sessionId: "incomplete-session",
    programId: "program-test",
    programEngineVersion: "1.0.0",
    blocks: [{ id: "task-1", kind: "cognitive_task", taskId: "nback", taskVersion: "1.0.0" }]
  });
  session = startAdhdSession(session, "2026-01-01T10:00:00Z");
  session = startAdhdBlock(session, "task-1", { at: "2026-01-01T10:01:00Z" });
  session = recordAdhdBlockResult(session, "task-1", null, { at: "2026-01-01T10:02:00Z" });
  assert.equal(session.blocks[0].status, "completed_with_incomplete_data");
  session = completeAdhdSession(session, "2026-01-01T10:03:00Z");
  assert.equal(session.status, "completed_with_incomplete_data");
  assert.ok(session.dataQuality.incompleteBlocks.includes("task-1"));
  assert.throws(
    () => hydrateAdhdSession({ schemaVersion: "99.0.0" }),
    (error) => error instanceof AdhdSessionTransitionError && error.code === "unsupported_future_schema"
  );

  let invalidSession = createAdhdSession({
    sessionId: "invalid-session",
    programId: "program-test",
    programEngineVersion: "1.0.0",
    blocks: [{ id: "task-invalid", kind: "cognitive_task", taskId: "cpt_x", taskVersion: "1.0.0" }]
  });
  invalidSession = startAdhdSession(invalidSession, "2026-01-02T10:00:00Z");
  invalidSession = startAdhdBlock(invalidSession, "task-invalid", { at: "2026-01-02T10:01:00Z" });
  invalidSession = recordAdhdBlockResult(invalidSession, "task-invalid", {
    taskVersion: "1.0.0",
    valid: false,
    quality: { valid: false },
    metrics: { accuracy: 0.4 }
  }, { at: "2026-01-02T10:02:00Z" });
  assert.equal(invalidSession.blocks[0].status, "completed_with_incomplete_data");
  invalidSession = completeAdhdSession(invalidSession, "2026-01-02T10:03:00Z");
  assert.equal(invalidSession.status, "completed_with_incomplete_data");
  assert.ok(invalidSession.dataQuality.invalidBlocks.includes("task-invalid"));
});

test("la comparación longitudinal conserva medidas, contexto y efecto de práctica sin inventar normas", () => {
  const baseline = {
    phase: "T0",
    profile: profile("T0", 0.3, 0.74, 4),
    taskResults: { go_nogo: { taskVersion: "1.0.0", randomSeed: 101 }, nback: { taskVersion: "1.0.0", randomSeed: 201 } },
    formConfiguration: { tasks: [
      { taskId: "go_nogo", metricConfiguration: { porcentajeGo: 70, duracionEstimulo: 1000 } },
      { taskId: "nback", metricConfiguration: { level: 1, stimulusIntervalMs: 2000 } }
    ] }
  };
  const followUp = {
    phase: "T2",
    profile: profile("T2", 0.18, 0.84, 8),
    taskResults: { go_nogo: { taskVersion: "1.0.0", randomSeed: 101 }, nback: { taskVersion: "1.0.0", randomSeed: 202 } },
    formConfiguration: { tasks: [
      { taskId: "go_nogo", metricConfiguration: { porcentajeGo: 70, duracionEstimulo: 1000 } },
      { taskId: "nback", metricConfiguration: { level: 1, stimulusIntervalMs: 2000 } }
    ] }
  };
  const comparison = compareAdhdAssessments(baseline, followUp);
  assert.equal(comparison.normative, false);
  const commissions = comparison.measures.find((measure) => /comisiones/i.test(measure.label));
  assert.equal(commissions.absoluteChange, -0.12);
  assert.equal(commissions.directionalInterpretation, "change_in_favorable_direction");
  const reactionTime = comparison.measures.find((measure) => /respuesta medio/i.test(measure.label));
  assert.equal(reactionTime.directionalInterpretation, "change_requires_speed_accuracy_context");
  assert.equal(comparison.contextComparison.materiallyDifferent, true);
  assert.ok(comparison.practiceEffect.sameFormTasks.includes("go_nogo"));
  assert.match(comparison.practiceEffect.notice, /práctica/i);
  assert.equal(comparison.measures.every((measure) => measure.causalAttribution === false && measure.normative === false), true);

  const mismatched = compareAdhdAssessments(baseline, {
    ...followUp,
    formConfiguration: { tasks: [
      { taskId: "go_nogo", metricConfiguration: { porcentajeGo: 90, duracionEstimulo: 800 } },
      { taskId: "nback", metricConfiguration: { level: 1, stimulusIntervalMs: 2000 } }
    ] }
  });
  assert.equal(mismatched.measures.some((measure) => measure.taskId === "go_nogo"), false);
  assert.ok(mismatched.unavailableMeasures.some((measure) => measure.taskId === "go_nogo" && measure.reason === "metric_configuration_mismatch"));
  assert.equal(mismatched.quality.metricConfigurationComparable, false);

  const versionMismatched = compareAdhdAssessments(baseline, {
    ...followUp,
    taskResults: {
      ...followUp.taskResults,
      go_nogo: { ...followUp.taskResults.go_nogo, taskVersion: "2.0.0" }
    }
  });
  assert.equal(versionMismatched.measures.some((measure) => measure.taskId === "go_nogo"), false);
  assert.ok(versionMismatched.unavailableMeasures.some((measure) => measure.taskId === "go_nogo" && measure.reason === "task_version_mismatch"));
  assert.equal(versionMismatched.quality.taskVersionComparable, false);

  const summary = buildAdhdLongitudinalSummary([
    baseline,
    { ...followUp, phase: "T1" },
    followUp,
    { ...followUp, phase: "T3" }
  ]);
  assert.equal(summary.phases.every((phase) => phase.available), true);
  assert.equal(summary.baselineComparisons.length, 3);
  assert.equal(summary.quality.validForChange, true);

  const fixedMetricConfiguration = { go_nogo: { porcentajeGo: 70, duracionEstimulo: 1000 } };
  const t0Form = createAdhdReassessmentConfiguration({ phase: "T0", baseSeed: 123, taskIds: ["go_nogo"], metricConfigurations: fixedMetricConfiguration });
  const t2Form = createAdhdReassessmentConfiguration({ phase: "T2", baseSeed: 123, taskIds: ["go_nogo"], metricConfigurations: fixedMetricConfiguration });
  assert.notEqual(t0Form.tasks[0].randomSeed, t2Form.tasks[0].randomSeed);
  assert.equal(t2Form.tasks[0].prohibitExactBaselineSequence, true);
  assert.deepEqual(t0Form.tasks[0].metricConfiguration, t2Form.tasks[0].metricConfiguration);
});

test("la exportación de investigación exige seudónimo y elimina identificadores directos", () => {
  const input = {
    patient: {
      name: "Ana Prueba",
      email: "ana@example.test",
      patientId: "patient-secret",
      ageBand: "adult"
    },
    profileId: "source-profile-id",
    sessions: [{
      sessionId: "source-session-id",
      challengeId: "source-challenge-id",
      taskResultIds: ["source-result-id"],
      resultIds: ["source-result-id-2"],
      sessionNumber: 1,
      note: "Ana Prueba realizó la sesión",
      metrics: { accuracy: 0.82 },
      safeLabel: "Ana Prueba",
      spreadsheetValue: "=campo libre",
      condition: "Ana Prueba",
      mode: "=2+2"
    }]
  };
  assert.throws(() => buildAdhdResearchDataset(input), /código seudónimo/i);
  const dataset = buildAdhdResearchDataset(input, { subjectCode: "ADHD_0001" });
  assert.equal(validateAdhdResearchDataset(dataset).valid, true);
  assert.equal(dataset.pseudonymization.mappingIncluded, false);
  const json = exportAdhdResearchJson(dataset);
  assert.doesNotMatch(json, /Ana Prueba|ana@example\.test|patient-secret|source-session-id|source-profile-id|source-result-id|source-challenge-id/);
  assert.match(json, /ADHD_0001/);
  assert.match(json, /\[REDACTED\]/);
  assert.doesNotMatch(json, /safeLabel|spreadsheetValue|campo libre/u);
  const csv = exportAdhdResearchCsv(dataset);
  assert.match(csv, /ADHD_0001/);
  assert.doesNotMatch(csv, /Ana Prueba|patient-secret/);
  assert.match(csv, /"'=2\+2"/);
});

test("el puente de SOFÍA entrega solo un resumen derivado sin autoridad clínica ni datos crudos", () => {
  const baseline = { phase: "T0", profile: profile("T0", 0.3, 0.74, 6) };
  const followUp = { phase: "T2", profile: profile("T2", 0.2, 0.82, 7) };
  const longitudinal = buildAdhdLongitudinalSummary([baseline, followUp]);
  const program = generateAdhdProgram({
    programId: "program-test",
    age: 31,
    profile: baseline.profile,
    functionalGoals: [{ id: "goal-1", action: "Planificar tres prioridades", domains: ["planning", "metacognition"] }]
  });
  const summary = buildAdhdSofiaSummary({
    patientId: "must-not-pass",
    profile: followUp.profile,
    longitudinal,
    program,
    sessions: [{
      status: "completed",
      plannedSessionNumber: 1,
      rawTrials: [{ reactionTimeMs: 500 }],
      blocks: [{ kind: "functional_transfer", result: { status: "partial" } }]
    }]
  });
  assert.equal(summary.dataRole.sourceOfTruth, false);
  assert.equal(summary.dataRole.readOnly, true);
  assert.equal(summary.dataRole.containsRawTrials, false);
  assert.equal(summary.authority.mayDiagnose, false);
  assert.equal(summary.authority.mayChangeProgram, false);
  assert.equal(summary.programStatus.generativeAiUsedForProgramDecision, false);
  assert.equal(validateAdhdSofiaSummary(summary).valid, true);
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /must-not-pass|rawTrials|reactionTimeMs/);
});
