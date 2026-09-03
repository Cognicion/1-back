import assert from "node:assert/strict";
import test from "node:test";

import { ADHD_PROTOCOL_ID } from "../js/adhd/config/adhdProtocol.js";
import {
  ADHD_PATIENT_RECORD_SCHEMA_VERSION,
  construirHistorialBateriasAdhd
} from "../js/adhd/integration/adhdPatientRecord.js";

const programId = "program-tdah-1";

test("el expediente integra aplicaciones hechas por paciente y profesional sin duplicar la fuente", () => {
  const model = construirHistorialBateriasAdhd({
    programs: [{ id: programId, programId, protocolId: ADHD_PROTOCOL_ID }],
    evaluations: [
      {
        id: "evaluation-t0",
        assessmentId: "evaluation-t0",
        programId,
        protocolId: ADHD_PROTOCOL_ID,
        protocolVersion: "1.0.0",
        phase: "T0",
        status: "completed",
        batteryType: "essential",
        taskIds: ["cpt_x"],
        resultIds: ["result-t0"],
        startedAt: "2026-08-01T10:00:00.000Z",
        completedAt: "2026-08-01T10:20:00.000Z"
      },
      {
        id: "evaluation-t1",
        assessmentId: "evaluation-t1",
        programId,
        protocolId: ADHD_PROTOCOL_ID,
        protocolVersion: "1.0.0",
        phase: "T1",
        status: "completed_pending_profile",
        batteryType: "expanded",
        taskIds: ["nback"],
        resultIds: ["result-t1"],
        administration: {
          actorRole: "patient",
          source: "patient_account"
        },
        startedAt: "2026-09-01T10:00:00.000Z",
        completedAt: "2026-09-01T10:15:00.000Z"
      }
    ],
    audit: [{
      eventType: "assessment_started",
      actorRole: "clinician",
      occurredAtIso: "2026-08-01T10:00:00.000Z",
      details: { evaluationId: "evaluation-t0" }
    }],
    results: [
      {
        id: "result-t0",
        resultId: "result-t0",
        programId,
        protocolId: ADHD_PROTOCOL_ID,
        taskId: "cpt_x",
        status: "completed",
        valid: true,
        completedAtIso: "2026-08-01T10:20:00.000Z",
        references: { evaluationId: "evaluation-t0" },
        metrics: { accuracy: 0.875, reactionTime: { meanMs: 412 } }
      },
      {
        id: "result-t1",
        resultId: "result-t1",
        programId,
        protocolId: ADHD_PROTOCOL_ID,
        taskId: "nback",
        status: "completed",
        valid: false,
        completedAtIso: "2026-09-01T10:15:00.000Z",
        references: { evaluationId: "evaluation-t1" },
        metrics: { accuracy: 0.6, dPrime: 0.8 }
      }
    ]
  });

  assert.equal(model.schemaVersion, ADHD_PATIENT_RECORD_SCHEMA_VERSION);
  assert.equal(model.totalEvaluations, 2);
  assert.equal(model.completedEvaluations, 2);
  assert.deepEqual(model.records.map((record) => record.phase), ["T1", "T0"]);
  assert.equal(model.records[0].sourceCode, "patient_account");
  assert.equal(model.records[0].sourceLabel, "Paciente · cuenta COGNICIÓN");
  assert.equal(model.records[0].tasks[0].statusLabel, "Completada · no interpretable");
  assert.equal(model.records[1].sourceCode, "clinician_account");
  assert.equal(model.records[1].sourceLabel, "Médico/profesional · expediente seleccionado");
  assert.deepEqual(model.records[1].tasks[0].metrics, [
    { label: "Precisión", display: "87.5 %" },
    { label: "Tiempo de respuesta medio", display: "412 ms" }
  ]);
});

test("los registros históricos sin procedencia quedan explícitamente como dato no registrado", () => {
  const model = construirHistorialBateriasAdhd({
    programs: [{ id: programId, programId, protocolId: ADHD_PROTOCOL_ID }],
    evaluations: [{
      id: "evaluation-legacy",
      assessmentId: "evaluation-legacy",
      programId,
      phase: "T0",
      status: "paused",
      batteryType: "essential",
      taskIds: ["stroop"],
      startedAt: "2026-07-01T10:00:00.000Z"
    }]
  });

  assert.equal(model.records[0].sourceCode, "unknown");
  assert.equal(model.records[0].sourceRecorded, false);
  assert.equal(model.records[0].sourceLabel, "Origen no registrado en esta versión");
  assert.equal(model.records[0].tasks[0].statusLabel, "Sin resultado canónico");
});

test("ignora resultados ajenos al protocolo o a otro programa", () => {
  const model = construirHistorialBateriasAdhd({
    programs: [{ id: programId, programId, protocolId: ADHD_PROTOCOL_ID }],
    evaluations: [{ id: "evaluation-1", assessmentId: "evaluation-1", programId, taskIds: ["nback"] }],
    results: [
      { programId, protocolId: "otro-protocolo", taskId: "nback", status: "completed", references: { evaluationId: "evaluation-1" } },
      { programId: "otro-programa", protocolId: ADHD_PROTOCOL_ID, taskId: "nback", status: "completed", references: { evaluationId: "evaluation-1" } }
    ]
  });

  assert.equal(model.records[0].completedTasks, 0);
  assert.equal(model.records[0].tasks[0].statusLabel, "Sin resultado canónico");
});
