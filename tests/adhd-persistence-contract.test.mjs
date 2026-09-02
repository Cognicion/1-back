import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildExistingTaskBootstrapName,
  buildExistingTaskUrl,
  createTaskLaunchContext,
  normalizeExistingTaskResult,
  parseExistingTaskContext
} from "../js/adhd/adapters/existingTaskAdapters.js";
import {
  ADHD_TASK_BRIDGE_CHANNEL,
  ADHD_TASK_BRIDGE_TYPES,
  ADHD_TASK_BRIDGE_VERSION
} from "../js/adhd/integration/adhdTaskPageBridge.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(resolve(repositoryRoot, relativePath), "utf8");
}

function rulesFunction(rules, name) {
  const start = rules.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró la función de reglas ${name}.`);
  const end = rules.indexOf("\n    function ", start + 1);
  return rules.slice(start, end === -1 ? rules.length : end);
}

function affectedFields(functionSource) {
  const match = functionSource.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/u);
  assert.ok(match, "La función debe declarar una lista explícita de campos mutables.");
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((item) => item[1]);
}

test("normaliza CPT al contrato común sin llevar identificadores del paciente", () => {
  const normalized = normalizeExistingTaskResult("cpt", {
    activityId: "cpt",
    patientId: "patient-private",
    results: {
      totalTargets: 10,
      totalNonTargets: 10,
      hits: 8,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 9,
      hitPercentage: 80,
      falseAlarmPercentage: 10,
      dPrime: 2.1,
      blockResults: [
        { totalTrials: 10, correct: 9 },
        { totalTrials: 10, correct: 8 }
      ]
    },
    trialHistory: [
      { responseType: "hit", reactionTimeMs: 400 },
      { responseType: "hit", reactionTimeMs: 600 }
    ]
  }, { programId: "program-1", sessionId: "session-1" });

  assert.equal(normalized.taskId, "cpt_x");
  assert.equal(normalized.metrics.omissionRate, 0.2);
  assert.equal(normalized.metrics.missRate, 0.2);
  assert.equal(normalized.metrics.hitRate, 0.8);
  assert.equal(normalized.metrics.falseAlarmRate, 0.1);
  assert.equal(normalized.metrics.correctRejectionRate, 0.9);
  assert.ok(Math.abs(normalized.metrics.balancedAccuracy - 0.85) < 1e-12);
  assert.equal(normalized.metrics.reactionTime.meanMs, 500);
  assert.ok(Math.abs(normalized.metrics.temporal.accuracyChange + 0.1) < 1e-10);
  assert.equal(normalized.context.programId, "program-1");
  assert.equal("patientId" in normalized, false);
});

test("normaliza Go/No-Go, N-Back, Stroop y escucha dicótica", () => {
  const go = normalizeExistingTaskResult("go-nogo", {
    totalTrials: 20,
    goTrials: 15,
    noGoTrials: 5,
    correctGo: 12,
    omissions: 3,
    commissionErrors: 1,
    correctInhibitions: 4,
    accuracy: 80,
    averageReactionTime: 450,
    reactionTimeVariability: 90
  });
  assert.equal(go.metrics.accuracy, 0.8);
  assert.equal(go.metrics.omissionRate, 0.2);
  assert.equal(go.metrics.commissionRate, 0.2);
  assert.equal(go.metrics.goHitRate, 0.8);
  assert.equal(go.metrics.correctInhibitionRate, 0.8);
  assert.equal(go.metrics.balancedAccuracy, 0.8);
  assert.equal(go.metrics.goReactionTime.coefficientOfVariation, 0.2);

  const goWithCommissionRt = normalizeExistingTaskResult("go-nogo", {
    goTrials: 1,
    noGoTrials: 1,
    correctGo: 1,
    commissionErrors: 1,
    averageReactionTime: 300,
    trialHistory: [
      { tipo: "go", resultado: "acierto_go", correcta: true, rt: 500 },
      { tipo: "nogo", resultado: "error_comision", correcta: false, rt: 100 }
    ]
  });
  assert.equal(goWithCommissionRt.metrics.goReactionTime.meanMs, 500);
  assert.equal(goWithCommissionRt.metrics.goReactionTime.sampleSize, 1);

  const nback = normalizeExistingTaskResult("nback", {
    totalTrials: 20,
    nivel: 2,
    audioAciertos: 3,
    visualAciertos: 4,
    audioComision: 1,
    visualComision: 1,
    audioOmision: 1,
    visualOmision: 1,
    audioRechazosCorrectos: 5,
    visualRechazosCorrectos: 4,
    trAudio: [400, 500],
    trVisual: [600, 700]
  });
  assert.equal(nback.metrics.hits, 7);
  assert.equal(nback.metrics.falseAlarms, 2);
  assert.equal(nback.metrics.administeredLevel, 2);
  assert.equal(nback.metrics.maximumStableLevel, null);
  assert.ok(Number.isFinite(nback.metrics.dPrime));

  const stroop = normalizeExistingTaskResult("stroop", {
    totalTrials: 4,
    correct: 4,
    accuracy: 100,
    trials: [
      { isCongruent: true, isCorrect: true, reactionTime: 500 },
      { isCongruent: true, isCorrect: true, reactionTime: 550 },
      { isCongruent: false, isCorrect: true, reactionTime: 800 },
      { isCongruent: false, isCorrect: true, reactionTime: 900 }
    ]
  });
  assert.equal(stroop.metrics.accuracy, 1);
  assert.equal(stroop.metrics.interferenceCostMs, 325);
  assert.equal(stroop.metrics.incongruentAccuracy, 1);

  const dichotic = normalizeExistingTaskResult("escucha-dicotica", {
    sessionMode: "demo_technical",
    clinicallyValidated: false,
    authorizedMaterial: false,
    results: {
      totalTrials: 6,
      correctResponses: 3,
      leftEarIntrusions: 1,
      nonPresentedWords: 1,
      omissions: 1,
      technicalFailures: 0,
      accuracyPercentage: 50
    }
  });
  assert.equal(dichotic.taskId, "dichotic_listening");
  assert.equal(dichotic.valid, false);
  assert.equal(dichotic.metrics.accuracy, 0.5);
  assert.equal(dichotic.quality.corpus.clinicallyValidated, false);
});

test("construye URL mínima y entrega el token fuera de query/referrer", () => {
  const context = createTaskLaunchContext("cpt", {
    patientId: "patient-1",
    programId: "program-1",
    sessionId: "session-1",
    attemptId: "attempt_12345678",
    bridgeToken: "bridge_token_12345678"
  });
  const url = buildExistingTaskUrl("cpt", context, "https://cognicion.test/programa.html");
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.origin, "https://cognicion.test");
  assert.equal(parsedUrl.pathname, "/cpt.html");
  assert.equal(parsedUrl.searchParams.get("embed"), "1");
  assert.equal(parsedUrl.searchParams.get("adhdTask"), "cpt_x");
  for (const sensitiveParameter of [
    "adhdProgram", "adhdSession", "adhdEvaluation", "adhdGoal", "adhdChallenge",
    "adhdAttempt", "adhdMode", "adhdSeed", "adhdBridgeToken", "id"
  ]) assert.equal(parsedUrl.searchParams.has(sensitiveParameter), false, sensitiveParameter);
  const bootstrapName = buildExistingTaskBootstrapName(context);
  const parsed = parseExistingTaskContext(url, bootstrapName);
  assert.equal(parsed.taskId, "cpt_x");
  assert.equal(parsed.taskVersion, "1.0.0");
  assert.equal(parsed.bridgeToken, "bridge_token_12345678");
  assert.equal(parsed.patientId, null);
  assert.equal(parsed.programId, null);
});

test("declara el puente versionado y valida origen, fuente y token", async () => {
  assert.equal(ADHD_TASK_BRIDGE_CHANNEL, "cognicion.adhd.task");
  assert.equal(ADHD_TASK_BRIDGE_VERSION, "1.0.0");
  assert.equal(ADHD_TASK_BRIDGE_TYPES.RESULT, "result");
  const bridgeSource = await source("js/adhd/integration/adhdTaskPageBridge.js");
  assert.match(bridgeSource, /event\.origin\s*!==\s*origin/u);
  assert.match(bridgeSource, /event\.source\s*!==\s*iframe\.contentWindow/u);
  assert.match(bridgeSource, /event\.source\s*!==\s*parentWindow/u);
  assert.match(bridgeSource, /data\.token\s*===\s*token/u);
  assert.match(bridgeSource, /visibilitychange/u);
  assert.match(bridgeSource, /window_blur/u);
  assert.match(bridgeSource, /orientation_changed/u);
  assert.match(bridgeSource, /task_integrity_interrupted/u);
  assert.match(bridgeSource, /globalThis\.name\s*=\s*""/u, "el token bootstrap no debe permanecer en window.name");
  assert.match(bridgeSource, /html\.adhd-embedded-task body > header/u, "el embed debe ocultar el encabezado de la tarea");
  assert.match(bridgeSource, /html\.adhd-embedded-task body > nav/u, "el embed debe ocultar la navegación superior independiente");
  assert.doesNotMatch(bridgeSource, /postMessage\([^\n]+,[\s]*["']\*["']/u);
});

test("el adaptador persiste el contrato canónico, bloques acotados y borradores IndexedDB", async () => {
  const adapterSource = await source("js/adhd/services/adhdPersistenceAdapter.js");
  const requiredExports = [
    "createAdhdProgramRecord",
    "loadAdhdProgramBundle",
    "saveAdhdEvaluation",
    "saveAdhdProfile",
    "saveAdhdPlan",
    "saveAdhdGoal",
    "saveAdhdSession",
    "saveAdhdTransferChallenge",
    "saveAdhdTaskResult",
    "saveAdhdDraft",
    "loadAdhdDraft",
    "clearAdhdDraft",
    "archiveAdhdProgram"
  ];
  for (const exportName of requiredExports) {
    assert.match(adapterSource, new RegExp(`export (?:async function|const) ${exportName}\\b`, "u"));
  }
  assert.match(adapterSource, /"usuarios"[\s\S]+ADHD_PROGRAM_COLLECTION/u);
  assert.match(adapterSource, /ADHD_RESULT_COLLECTION/u);
  assert.match(adapterSource, /ADHD_TELEMETRY_COLLECTION/u);
  assert.match(adapterSource, /where\("programId",\s*"==",\s*id\)/u);
  assert.match(adapterSource, /taskResults:\s*resultsByTask\(resultRecords\)/u);
  assert.match(adapterSource, /resultRecords/u);
  assert.match(adapterSource, /loadErrorCode/u);
  assert.match(adapterSource, /writeBatch\(db\)/u);
  assert.match(adapterSource, /metricsVersion:/u);
  assert.match(adapterSource, /taskResultIds:\s*arrayUnion\(resultId\),\s*resultIds:\s*arrayUnion\(resultId\)/u);
  assert.match(adapterSource, /ADHD_MAX_TELEMETRY_BLOCKS\s*=\s*50/u);
  assert.match(adapterSource, /ADHD_TELEMETRY_BLOCK_SIZE\s*=\s*100/u);
  assert.match(adapterSource, /ADHD_MAX_TELEMETRY_BLOCK_BYTES\s*=\s*700\s*\*\s*1024/u);
  assert.match(adapterSource, /telemetryEnabled\s*=\s*false/u);
  assert.match(adapterSource, /TELEMETRY_PII_KEY/u);
  assert.match(adapterSource, /TELEMETRY_ALLOWED_KEYS/u);
  assert.match(adapterSource, /"patientId"[\s\S]*SUMMARY_OMISSIONS/u);
  assert.match(adapterSource, /guardarBorradorClinicoLocal/u);
  assert.match(adapterSource, /obtenerBorradorClinicoLocal/u);
  assert.doesNotMatch(adapterSource, /for\s*\([^)]*trial[^)]*\)[\s\S]{0,240}(?:setDoc|batch\.set)/iu);
});

test("las reglas aíslan el programa y preservan identidad, versiones y transiciones", async () => {
  const rules = await source("firestore.rules");
  const evaluationUpdate = rulesFunction(rules, "validAdhdEvaluationUpdate");
  const patientGoalUpdate = rulesFunction(rules, "validPatientAdhdGoalUpdate");
  const sessionUpdate = rulesFunction(rules, "validAdhdSessionUpdate");
  assert.match(rules, /subcollection\s*!=\s*"rehabilitacionProgramas"/u);
  assert.match(rules, /subcollection\s*!=\s*"rehabilitacionResultados"/u);
  assert.equal([...rules.matchAll(/subcollection\s*!=\s*"rehabilitacionProgramas"/gu)].length, 3);
  assert.equal([...rules.matchAll(/subcollection\s*!=\s*"rehabilitacionResultados"/gu)].length, 3);
  assert.match(rules, /match \/rehabilitacionProgramas\/\{programId\}/u);
  assert.match(rules, /match \/perfiles\/\{profileId\}[\s\S]*?allow create, update:[\s\S]*?professionalCanEditPatient/u);
  assert.match(rules, /match \/planes\/\{planId\}[\s\S]*?allow create, update:[\s\S]*?professionalCanEditPatient/u);
  assert.match(rules, /function validAdhdMetadata\([\s\S]*?persistenceSchemaVersion[\s\S]*?protocolId[\s\S]*?protocolVersion/u);
  assert.match(rules, /function validAdhdEvaluationUpdate\([\s\S]*?affectedKeys\(\)\.hasOnly\([\s\S]*?resultIds[\s\S]*?validResultIds[\s\S]*?profileId/u);
  assert.match(rules, /function validPatientAdhdEvaluationTransition\([\s\S]*?completed_pending_profile/u);
  assert.match(rules, /function validAdhdSessionUpdate\([\s\S]*?affectedKeys\(\)\.hasOnly\([\s\S]*?transitionLog[\s\S]*?resultIds/u);
  assert.match(rules, /function validAdhdSessionTransition\([\s\S]*?completed_with_incomplete_data[\s\S]*?abandoned/u);
  assert.match(rules, /function validAdhdSingleBlockMutation\([\s\S]*?after\[0\] != before\[0\][\s\S]*?after\[6\] != before\[6\]/u);
  assert.match(rules, /validAdhdSessionBlockTransitions\(\)[\s\S]*?validAdhdSingleBlockMutation\(\)/u);
  assert.match(rules, /function validAdhdCognitiveBlockPayload\([\s\S]*?snapshotContainsMetrics[\s\S]*?== false/u);
  assert.match(rules, /validAdhdCognitiveBlockPayload\(blocks\[1\]\)[\s\S]*?validAdhdCognitiveBlockPayload\(blocks\[2\]\)/u);
  assert.match(rules, /function validPatientAdhdGoalUpdate\([\s\S]*?affectedKeys\(\)\.hasOnly\([\s\S]*?progress[\s\S]*?resultIds/u);
  assert.match(rules, /match \/evaluaciones\/\{evaluationId\}[\s\S]*?validAdhdEvaluationCreate\(programId, evaluationId\)[\s\S]*?validAdhdEvaluationUpdate/u);
  assert.match(rules, /match \/sesiones\/\{sessionId\}[\s\S]*?validAdhdSessionCreate\(programId, sessionId\)[\s\S]*?validAdhdSessionUpdate/u);
  assert.match(rules, /match \/metas\/\{goalId\}[\s\S]*?validAdhdGoalCreate\(programId, goalId\)[\s\S]*?validPatientAdhdGoalUpdate/u);
  assert.match(rules, /match \/auditoria\/\{auditId\}[\s\S]*?allow update, delete: if false/u);
  assert.deepEqual(affectedFields(evaluationUpdate), [
    "resultIds", "taskResultIds", "validResultIds", "status", "completedAt", "pausedAt",
    "context", "quality", "postBlockSelfReports", "profileId", "updatedAt", "pendingSync"
  ]);
  assert.deepEqual(affectedFields(patientGoalUpdate), ["progress", "resultIds", "updatedAt", "pendingSync"]);
  assert.deepEqual(affectedFields(sessionUpdate), [
    "blocks", "transitionLog", "dataQuality", "status", "hasStarted", "startedAt", "completedAt",
    "pausedAt", "currentBlockId", "taskResultIds", "resultIds", "selfRating", "transferStatus",
    "migration", "recoveredAfterReload", "updatedAt", "pendingSync"
  ]);
  for (const immutableField of ["programId", "id", "assessmentId", "sessionId", "protocolVersion", "persistenceSchemaVersion"]) {
    assert.equal(affectedFields(evaluationUpdate).includes(immutableField), false);
    assert.equal(affectedFields(patientGoalUpdate).includes(immutableField), false);
    assert.equal(affectedFields(sessionUpdate).includes(immutableField), false);
  }
});

test("resultado TDAH y telemetría son append-only salvo feedback/reintento idempotente", async () => {
  const rules = await source("firestore.rules");
  const resultUpdate = rulesFunction(rules, "validCanonicalAdhdResultUpdate");
  assert.match(rules, /function validCanonicalAdhdResultCreate\([\s\S]*?idResultado[\s\S]*?resultId[\s\S]*?taskVersion[\s\S]*?metricsVersion[\s\S]*?references/u);
  assert.match(rules, /function validCanonicalAdhdResultUpdate\([\s\S]*?affectedKeys\(\)\.hasOnly\(\[[\s\S]*?adaptiveDecision[\s\S]*?feedback[\s\S]*?createdAt[\s\S]*?updatedAt[\s\S]*?canonicalAdhdFeedbackIsWriteOnce/u);
  assert.match(rules, /request\.resource\.data\.get\("createdAt", null\) == resource\.data\.get\("createdAt", null\)/u);
  assert.match(rules, /!resource\.data\.keys\(\)\.hasAny\(\["id"\]\)[\s\S]*?request\.resource\.data\.get\("id", ""\) == resource\.data\.get\("id", ""\)/u);
  assert.match(rules, /match \/rehabilitacionResultados\/\{resultId\}[\s\S]*?allow create:[\s\S]*?validCanonicalAdhdResultCreate\(uid, resultId\)[\s\S]*?allow update:[\s\S]*?validCanonicalAdhdResultUpdate\(resultId\)/u);
  assert.match(rules, /allow delete:[\s\S]*?!isCanonicalAdhdData\(resource\.data\)/u);
  assert.match(rules, /function validAdhdTelemetryCreate\([\s\S]*?getAfter\([\s\S]*?recordCount[\s\S]*?records/u);
  assert.match(rules, /function validAdhdTelemetryIdempotentUpdate\([\s\S]*?affectedKeys\(\)\.hasOnly\(\["createdAt"\]\)/u);
  assert.match(rules, /match \/telemetryBlocks\/\{blockId\}[\s\S]*?allow create:[\s\S]*?validAdhdTelemetryCreate\(uid, resultId\)[\s\S]*?allow update:[\s\S]*?validAdhdTelemetryIdempotentUpdate\(\)[\s\S]*?allow delete: if false/u);
  assert.deepEqual(affectedFields(resultUpdate), [
    "adaptiveDecision", "feedback", "postBlockSelfReport", "feedbackSkipped", "id",
    "pendingSync", "createdAt", "updatedAt"
  ]);
  for (const immutableField of [
    "idResultado", "resultId", "programId", "taskId", "activityId", "taskVersion",
    "metricsVersion", "protocolId", "protocolVersion", "persistenceSchemaVersion",
    "references", "metrics", "results", "status", "valid"
  ]) {
    assert.equal(affectedFields(resultUpdate).includes(immutableField), false);
  }
});

test("desactiva índices de los arreglos grandes de telemetryBlocks", async () => {
  const indexes = JSON.parse(await source("firestore.indexes.json"));
  const overrides = indexes.fieldOverrides.filter((item) => item.collectionGroup === "telemetryBlocks");
  assert.ok(overrides.some((item) => item.fieldPath === "records" && item.indexes.length === 0));
  assert.ok(overrides.every((item) => Array.isArray(item.indexes) && item.indexes.length === 0));
});
