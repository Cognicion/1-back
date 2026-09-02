import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

import { createRulesTestEnvironment } from "./environment.mjs";

const PATIENT_UID = "uidAdhdRehabPatient";
const CLINICIAN_UID = "uidAdhdRehabClinician";
const OTHER_UID = "uidAdhdRehabOther";
const PROGRAM_ID = "program_contract";
const RESULT_ID = "result_contract";
const PROTOCOL_ID = "cognicion-tdah-multicomponente";
const PROTOCOL_VERSION = "1.1.0";
const SCHEMA_VERSION = "1.0.0";

let environment;
let patientDb;
let clinicianDb;
let otherDb;

function metadata(programId = PROGRAM_ID) {
  return {
    persistenceSchemaVersion: SCHEMA_VERSION,
    programId,
    protocolId: PROTOCOL_ID,
    protocolVersion: PROTOCOL_VERSION
  };
}

function evaluationData(evaluationId = "evaluation_1") {
  return {
    ...metadata(),
    id: evaluationId,
    assessmentId: evaluationId,
    phase: "T0",
    status: "in_progress",
    batteryType: "essential",
    taskIds: ["cpt_x"],
    resultIds: [],
    taskResultIds: [],
    validResultIds: [],
    formConfiguration: { version: "1.0.0", tasks: [] },
    createdAtIso: "2026-09-01T10:00:00.000Z",
    updatedAt: serverTimestamp()
  };
}

function goalData(goalId = "goal_1") {
  return {
    ...metadata(),
    id: goalId,
    action: "Revisar instrucciones antes de responder",
    context: "en el trabajo",
    frequency: "cuatro días por semana",
    target: "máximo un error evitable",
    reviewDate: "2026-10-01",
    difficultyId: "impulsivity",
    domains: ["inhibitoryControl"],
    active: true,
    progress: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: serverTimestamp()
  };
}

function sessionData(sessionId = "session_1") {
  const block = (id, kind, extra = {}) => ({
    id,
    kind,
    label: id,
    required: true,
    status: "pending",
    attempts: [],
    ...extra
  });
  return {
    ...metadata(),
    id: sessionId,
    sessionId,
    sessionEngineVersion: "1.0.0",
    schemaVersion: SCHEMA_VERSION,
    programEngineVersion: "1.0.0",
    status: "in_progress",
    blocks: [
      block("activation", "activation"),
      block("task_1", "cognitive_task", { taskId: "cpt_x" }),
      block("task_2", "cognitive_task", { taskId: "go_nogo" }),
      block("metacognition", "metacognition", { moduleId: "goal_management" }),
      block("transfer", "functional_transfer", { challengeId: "challenge_1" }),
      block("self_assessment", "self_assessment"),
      block("feedback", "feedback")
    ],
    currentBlockId: null,
    transitionLog: [{ sequence: 1, event: "START_SESSION" }],
    resultIds: [],
    taskResultIds: [],
    hasStarted: true,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: serverTimestamp()
  };
}

function challengeData(challengeId = "challenge_1") {
  return {
    ...metadata(),
    id: challengeId,
    templateId: "daily_priorities",
    sessionId: "session_1",
    sessionNumber: 1,
    label: "Preparar tres prioridades",
    domains: ["planning"],
    status: "pending",
    ratings: {},
    sourceReports: [],
    linkedGoalIds: ["goal_1"],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: serverTimestamp()
  };
}

function canonicalResultData() {
  return {
    ...metadata(),
    idResultado: RESULT_ID,
    resultId: RESULT_ID,
    taskId: "cpt_x",
    activityId: "cpt_x",
    taskVersion: "1.0.0",
    metricsVersion: "1.0.0",
    metrics: { accuracy: 0.8 },
    results: { accuracy: 0.8 },
    references: {
      evaluationId: "evaluation_1",
      sessionId: null,
      goalId: "goal_1",
      challengeId: null
    },
    status: "completed",
    valid: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function telemetryBlockData() {
  return {
    ...metadata(),
    blockIndex: 0,
    channel: "trials",
    records: [{ correct: true, reactionTimeMs: 410 }],
    recordCount: 1,
    resultId: RESULT_ID,
    taskId: "cpt_x",
    totalBlocks: 1,
    createdAt: serverTimestamp()
  };
}

async function seedProfilesAndProgram() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "usuarios", PATIENT_UID), {
        ownerUid: CLINICIAN_UID,
        rol: "paciente",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", CLINICIAN_UID), {
        rol: "psicologo",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", OTHER_UID), {
        rol: "medico",
        tieneCuenta: true
      }),
      setDoc(doc(db, `usuarios/${PATIENT_UID}/rehabilitacionProgramas/${PROGRAM_ID}`), {
        ...metadata(),
        programId: PROGRAM_ID,
        status: "active"
      })
    ]);
  });
}

before(async () => {
  environment = await createRulesTestEnvironment();
  patientDb = environment.authenticatedContext(PATIENT_UID).firestore();
  clinicianDb = environment.authenticatedContext(CLINICIAN_UID).firestore();
  otherDb = environment.authenticatedContext(OTHER_UID).firestore();
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedProfilesAndProgram();
});

after(async () => {
  await environment?.cleanup();
});

test("protege prescripción clínica y conserva la ejecución del paciente", async () => {
  const programPath = `usuarios/${PATIENT_UID}/rehabilitacionProgramas/${PROGRAM_ID}`;
  const profilePath = `${programPath}/perfiles/profile_1`;
  const planPath = `${programPath}/planes/plan_1`;

  await assertFails(setDoc(doc(patientDb, `usuarios/${PATIENT_UID}/rehabilitacionProgramas/patient_created`), {
    status: "active"
  }));
  await assertSucceeds(setDoc(doc(clinicianDb, `usuarios/${PATIENT_UID}/rehabilitacionProgramas/clinician_created`), {
    status: "draft"
  }));
  await assertFails(setDoc(doc(patientDb, profilePath), { profileId: "profile_1" }));
  await assertFails(setDoc(doc(patientDb, planPath), { planId: "plan_1" }));
  await assertSucceeds(setDoc(doc(clinicianDb, profilePath), { profileId: "profile_1" }));
  await assertSucceeds(setDoc(doc(clinicianDb, planPath), { planId: "plan_1" }));
  await assertSucceeds(getDoc(doc(patientDb, profilePath)));
  await assertSucceeds(getDoc(doc(patientDb, planPath)));
  await assertFails(getDoc(doc(otherDb, planPath)));

  const evaluationRef = doc(patientDb, `${programPath}/evaluaciones/evaluation_1`);
  await assertSucceeds(setDoc(evaluationRef, evaluationData()));
  await assertFails(updateDoc(evaluationRef, { programId: "other_program" }));
  await assertSucceeds(updateDoc(evaluationRef, {
    status: "paused",
    pausedAt: "2026-09-01T10:05:00.000Z",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(evaluationRef, {
    status: "in_progress",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(evaluationRef, {
    status: "completed",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(evaluationRef, {
    resultIds: arrayUnion(RESULT_ID),
    taskResultIds: arrayUnion(RESULT_ID),
    validResultIds: arrayUnion(RESULT_ID),
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(evaluationRef, {
    resultIds: [],
    updatedAt: serverTimestamp()
  }));

  const goalRef = doc(patientDb, `${programPath}/metas/goal_1`);
  await assertSucceeds(setDoc(goalRef, goalData()));
  await assertFails(updateDoc(goalRef, {
    action: "El paciente reescribe la prescripción",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(goalRef, {
    progress: [{ at: "2026-09-02", source: "patient", achievement: 0.5 }],
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(clinicianDb, `${programPath}/metas/goal_1`), {
    target: "máximo dos errores evitables",
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(goalRef));

  const sessionRef = doc(patientDb, `${programPath}/sesiones/session_1`);
  await assertSucceeds(setDoc(sessionRef, sessionData()));
  await assertFails(updateDoc(sessionRef, { sessionId: "session_rewritten" }));
  await assertSucceeds(updateDoc(sessionRef, {
    status: "paused",
    pausedAt: "2026-09-01T10:10:00.000Z",
    transitionLog: [
      { sequence: 1, event: "START_SESSION" },
      { sequence: 2, event: "PAUSE_SESSION" }
    ],
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(sessionRef, {
    status: "in_progress",
    transitionLog: [
      { sequence: 1, event: "START_SESSION" },
      { sequence: 2, event: "PAUSE_SESSION" },
      { sequence: 3, event: "RESUME_SESSION" }
    ],
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(sessionRef, {
    resultIds: arrayUnion(RESULT_ID),
    taskResultIds: arrayUnion(RESULT_ID),
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(sessionRef, {
    status: "completed",
    completedAt: "2026-09-01T10:30:00.000Z",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(sessionRef, {
    blocks: sessionData().blocks.map((block) => ({
      ...block,
      status: "completed",
      result: { acknowledged: true },
      completedAt: "2026-09-01T10:30:00.000Z"
    })),
    status: "completed",
    completedAt: "2026-09-01T10:30:00.000Z",
    updatedAt: serverTimestamp()
  }));
  let completedBlocks = sessionData().blocks;
  for (let index = 0; index < completedBlocks.length; index += 1) {
    completedBlocks = completedBlocks.map((block, blockIndex) => blockIndex === index
      ? {
          ...block,
          status: "completed",
          result: block.kind === "cognitive_task"
            ? {
                resultId: `${RESULT_ID}_${blockIndex}`,
                taskId: block.taskId,
                taskVersion: "1.0.0",
                metricsVersion: "1.0.0",
                status: "completed",
                valid: true,
                quality: { valid: true, flags: [] },
                canonicalSource: "usuarios/{patientId}/rehabilitacionResultados/{resultId}",
                snapshotContainsMetrics: false,
                completedAtIso: `2026-09-01T10:${String(20 + index).padStart(2, "0")}:00.000Z`
              }
            : { acknowledged: true },
          completedAt: `2026-09-01T10:${String(20 + index).padStart(2, "0")}:00.000Z`
        }
      : block);
    await assertSucceeds(updateDoc(sessionRef, {
      blocks: completedBlocks,
      updatedAt: serverTimestamp()
    }));
  }
  await assertSucceeds(updateDoc(sessionRef, {
    status: "completed",
    completedAt: "2026-09-01T10:30:00.000Z",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(sessionRef, {
    status: "in_progress",
    updatedAt: serverTimestamp()
  }));

  const challengeRef = doc(patientDb, `${programPath}/retos/challenge_1`);
  await assertFails(setDoc(challengeRef, { status: "completed" }));
  await assertSucceeds(setDoc(challengeRef, challengeData()));
  await assertSucceeds(updateDoc(challengeRef, {
    status: "completed",
    note: "Registro funcional posterior",
    ratings: { patient: 7 },
    sourceReports: [{ source: "patient", achievement: 7 }],
    completedAt: "2026-09-02T10:00:00.000Z",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(challengeRef, {
    templateId: "rewritten_template",
    updatedAt: serverTimestamp()
  }));

  await assertFails(updateDoc(doc(patientDb, programPath), { status: "archived" }));
  await assertSucceeds(updateDoc(doc(patientDb, programPath), {
    lastActivityAt: "2026-09-01T12:00:00.000Z",
    lastResultId: RESULT_ID,
    updatedAt: "2026-09-01T12:00:00.000Z"
  }));
});

test("protege resultado y telemetría canónicos con actualizaciones idempotentes acotadas", async () => {
  const programPath = `usuarios/${PATIENT_UID}/rehabilitacionProgramas/${PROGRAM_ID}`;
  const resultPath = `usuarios/${PATIENT_UID}/rehabilitacionResultados/${RESULT_ID}`;
  const blockPath = `${resultPath}/telemetryBlocks/tb_1`;
  const auditPath = `${programPath}/auditoria/audit_1`;

  const resultRef = doc(patientDb, resultPath);
  const blockRef = doc(patientDb, blockPath);
  const adaptiveDecision = { decision: "hold", nextDifficulty: { targetRarity: 1 } };

  await assertSucceeds(setDoc(resultRef, canonicalResultData()));
  await assertFails(updateDoc(resultRef, {
    metrics: { accuracy: 1 },
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(resultRef, {
    protocolVersion: "99.0.0",
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(resultRef, {
    references: { evaluationId: "evaluation_rewritten" },
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(resultRef, {
    adaptiveDecision,
    id: RESULT_ID,
    pendingSync: false,
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(resultRef, {
    adaptiveDecision,
    id: RESULT_ID,
    pendingSync: false,
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(resultRef, {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(resultRef, {
    id: deleteField(),
    updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(resultRef, {
    adaptiveDecision: { decision: "increase", nextDifficulty: { targetRarity: 3 } },
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(resultRef));

  await assertSucceeds(setDoc(blockRef, telemetryBlockData()));
  await assertFails(updateDoc(blockRef, {
    records: [{ correct: true, reactionTimeMs: 412 }],
    createdAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(blockRef, { createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(blockRef));

  await assertSucceeds(setDoc(doc(patientDb, auditPath), {
    eventType: "task_result_saved",
    resultId: RESULT_ID
  }));
  await assertFails(updateDoc(doc(patientDb, auditPath), { eventType: "rewritten" }));
  await assertFails(getDoc(doc(otherDb, resultPath)));

  const legacyResult = doc(patientDb, `usuarios/${PATIENT_UID}/rehabilitacionResultados/legacy_result`);
  await assertSucceeds(setDoc(legacyResult, { activityId: "cpt", metrics: { accuracy: 0.7 } }));
  await assertSucceeds(updateDoc(legacyResult, { metrics: { accuracy: 0.8 } }));
  await assertFails(setDoc(doc(patientDb, `usuarios/${PATIENT_UID}/rehabilitacionResultados/forged_program_result`), {
    activityId: "cpt",
    programId: PROGRAM_ID,
    references: { evaluationId: "evaluation_1" },
    metrics: { accuracy: 1 }
  }));
});
