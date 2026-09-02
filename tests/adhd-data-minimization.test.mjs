import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAdhdResearchDataset,
  validateAdhdResearchDataset
} from "../js/adhd/core/adhdResearchExport.js";

async function loadPersistenceModule() {
  const adapterUrl = new URL("../js/adhd/services/adhdPersistenceAdapter.js", import.meta.url);
  const adapterSource = await readFile(adapterUrl, "utf8");
  const importlessSource = adapterSource.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/gu, "");
  const firestoreHarness = `
    export const __writes = [];
    const db = {};
    const ADHD_PERSISTENCE_SCHEMA_VERSION = "test-schema";
    const ADHD_PROTOCOL_ID = "test-protocol";
    const ADHD_PROTOCOL_VERSION = "test-version";
    const ref = (...parts) => ({ path: parts.flatMap((part) => part?.path || (part === db ? [] : [String(part)])) });
    const doc = (...parts) => ref(...parts);
    const collection = (...parts) => ref(...parts);
    const query = (...parts) => ref(...parts);
    const where = (...parts) => parts;
    const arrayUnion = (...values) => values;
    const serverTimestamp = () => ({ __serverTimestamp: true });
    const getDoc = async () => ({ exists: () => false });
    const getDocs = async () => ({ docs: [] });
    const setDoc = async () => {};
    const writeBatch = () => ({
      set(reference, payload) { __writes.push({ path: reference.path, payload }); },
      async commit() {}
    });
    const eliminarBorradorClinicoLocal = async () => {};
    const guardarBorradorClinicoLocal = async () => {};
    const obtenerBorradorClinicoLocal = async () => null;
  `;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${firestoreHarness}\n${importlessSource}`).toString("base64")}`;
  return import(moduleUrl);
}

function normalizedKeys(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizedKeys(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    output.push(key.toLowerCase().replace(/[^a-z0-9]/gu, ""));
    normalizedKeys(child, output);
  }
  return output;
}

test("el resumen canónico elimina recursivamente ensayos, puzzles, secuencias y eventos", async () => {
  const persistence = await loadPersistenceModule();
  const rawResult = {
    taskId: "route_planning",
    trials: [{ patientId: "patient-secret", reactionTimeMs: 410 }],
    practiceTrials: [{ prompt: "memoriza Ana" }],
    puzzles: [{ moves: ["left", "right"] }],
    practicePuzzles: [{ moves: ["up"] }],
    technicalEvents: [{ eventType: "focus", prompt: "Ana perdió foco" }],
    events: [{ type: "visibility" }],
    sequences: [[1, 2, 3]],
    configuration: {
      practiceTrials: 6,
      practiceTrialCount: 6,
      sequenceMode: "seeded",
      sequenceControlled: true
    },
    metrics: {
      accuracy: 0.82,
      totalTrials: 24,
      eventCount: 2,
      nested: {
        trial_history: [{ raw_response: "nombre privado" }],
        raw_trial_data: [{ stimulus: "X" }],
        practice_puzzles: [{ optimalMoves: 4 }],
        telemetry_records: [{ reactionTimeMs: 500 }],
        event_log: [{ type: "blur" }],
        focus_events: [{ type: "orientationchange" }],
        response_records: [{ response: "texto crudo" }],
        stimuli: [{ word: "secreto" }],
        attempts: [{ trialIndex: 1, reactionTimeMs: 400 }],
        rt_samples: [400, 420],
        technical_logs: [{ type: "debug" }],
        interruption_events: [{ reason: "texto libre" }],
        response_sequence: ["A", "B"]
      }
    },
    quality: {
      valid: true,
      researchEvents: [{ note: "no debe pasar" }]
    }
  };
  const sanitized = persistence.sanitizarResumenAdhd(rawResult);

  assert.equal(sanitized.taskId, "route_planning");
  assert.equal(sanitized.metrics.accuracy, 0.82);
  assert.equal(sanitized.metrics.totalTrials, 24);
  assert.equal(sanitized.metrics.eventCount, 2);
  assert.equal(sanitized.configuration.practiceTrialCount, 6);
  assert.equal(sanitized.configuration.sequenceMode, "seeded");
  assert.equal(sanitized.configuration.sequenceControlled, true);

  const keys = normalizedKeys(sanitized);
  for (const forbidden of [
    "trials", "practicetrials", "puzzles", "practicepuzzles", "technicalevents", "events", "sequences",
    "trialhistory", "rawtrialdata", "practicepuzzles", "telemetryrecords", "eventlog",
    "focusevents", "responserecords", "stimuli", "attempts", "rtsamples", "technicallogs",
    "interruptionevents", "responsesequence", "researchevents"
  ]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} no debe sobrevivir en el canónico`);
  }
  assert.doesNotMatch(JSON.stringify(sanitized), /patient-secret|memoriza Ana|nombre privado|texto libre|no debe pasar/u);

  await persistence.saveTaskResult({
    patientId: "patient-test",
    programId: "program-test",
    resultId: "result-minimized",
    result: rawResult,
    telemetryEnabled: false
  });
  const canonicalWrite = persistence.__writes.find(({ path, payload }) => (
    path.includes("rehabilitacionResultados")
    && path.at(-1) === "result-minimized"
    && payload.taskId === "route_planning"
  ));
  assert.ok(canonicalWrite, "debe escribirse el resultado canónico simulado");
  assert.deepEqual(canonicalWrite.payload.telemetry, { enabled: false, blockCount: 0, recordCount: 0 });
  assert.equal(persistence.__writes.some(({ path }) => path.includes("telemetryBlocks")), false);
  const canonicalKeys = normalizedKeys(canonicalWrite.payload);
  for (const forbidden of [
    "trials", "practicetrials", "puzzles", "practicepuzzles", "technicalevents", "events", "sequences",
    "trialhistory", "rawtrialdata", "practicepuzzles", "telemetryrecords", "eventlog",
    "focusevents", "responserecords", "stimuli", "attempts", "rtsamples", "technicallogs",
    "interruptionevents", "responsesequence", "researchevents"
  ]) {
    assert.equal(canonicalKeys.includes(forbidden), false, `${forbidden} no debe alcanzar Firestore canónico`);
  }

  persistence.__writes.splice(0);
  await persistence.saveTaskResult({
    patientId: "patient-test",
    programId: "program-test",
    resultId: "result-with-telemetry",
    result: rawResult,
    telemetryEnabled: true,
    telemetry: {
      trials: [{ trialIndex: 1, reactionTimeMs: 430, patientId: "patient-secret" }]
    }
  });
  const canonicalWithTelemetry = persistence.__writes.find(({ path, payload }) => (
    path.at(-1) === "result-with-telemetry" && payload.taskId === "route_planning"
  ));
  const telemetryWrites = persistence.__writes.filter(({ path }) => path.includes("telemetryBlocks"));
  assert.ok(canonicalWithTelemetry);
  assert.deepEqual(canonicalWithTelemetry.payload.telemetry, { enabled: true, blockCount: 1, recordCount: 1 });
  assert.equal(normalizedKeys(canonicalWithTelemetry.payload).includes("trials"), false);
  assert.equal(telemetryWrites.length, 1, "el detalle opt-in debe quedar solo en su subcolección");
  assert.equal(telemetryWrites[0].payload.records[0].reactionTimeMs, 430);
  assert.equal("patientId" in telemetryWrites[0].payload.records[0], false);
});

test("datePolicy remove cubre fechas ISO variantes y suprime texto libre sensible", () => {
  const dataset = buildAdhdResearchDataset({
    patient: { name: "Ana Prueba", patientId: "patient-secret", ageBand: "adult" },
    completedAtIso: "2026-08-31T10:15:00.000Z",
    created_at_iso: "2026-08-30T09:00:00.000Z",
    dueDate: "2026-09-15",
    nested: {
      occurred_at_iso: "2026-08-31T10:16:00.000Z",
      completionDate: "2026-08-31",
      responseTimeMs: 520,
      completionRate: 0.75,
      prompt: "Describe la conducta de Ana Prueba",
      interruptions: [{ reasonText: "Ana Prueba dijo su expediente" }],
      raw_response: "Respuesta de Ana Prueba",
      safeLabel: "Ana Prueba terminó"
    }
  }, { subjectCode: "ADHD_0099", datePolicy: "remove" });

  assert.equal(validateAdhdResearchDataset(dataset).valid, true);
  assert.equal(dataset.data.nested.responseTimeMs, 520, "los tiempos de respuesta no son fechas identificables");
  assert.equal(dataset.data.nested.completionRate, 0.75);
  assert.equal(dataset.data.nested.safeLabel, undefined, "un rótulo arbitrario sigue siendo texto libre aunque pueda redactarse parcialmente");
  const serialized = JSON.stringify(dataset);
  assert.doesNotMatch(serialized, /completedAtIso|created_at_iso|dueDate|occurred_at_iso|completionDate/u);
  assert.doesNotMatch(serialized, /prompt|interruptions|raw_response|Ana Prueba|patient-secret|expediente/u);
  assert.ok(dataset.exportAudit.removedFieldCategories.exact_time >= 5);
  assert.ok(dataset.exportAudit.removedFieldCategories.free_text >= 3);

  const tampered = structuredClone(dataset);
  tampered.data.completedAtIso = "2026-08-31T10:15:00.000Z";
  tampered.data.prompt = "texto libre";
  const validation = validateAdhdResearchDataset(tampered);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.startsWith("exact_time_key:")));
  assert.ok(validation.errors.some((error) => error.startsWith("free_text_key:")));
});

test("la exportación retira estrategia metacognitiva y texto funcional aunque no contengan el nombre", () => {
  const dataset = buildAdhdResearchDataset({
    patient: { name: "Ana Prueba", patientId: "patient-secret" },
    sessions: [{
      blocks: [{
        kind: "metacognition",
        result: {
          moduleId: "goal_check",
          strategy: "Llamar a mi supervisora Laura antes de abrir el expediente 22",
          application: "En el consultorio del tercer piso el próximo lunes"
        }
      }]
    }],
    functionalChallenges: [{
      templateId: "three_priorities",
      applicationPrompt: "Aplicar al informe confidencial de Laura",
      goalSnapshot: {
        action: "Preparar el informe de Laura",
        context: "consultorio del tercer piso",
        frequency: "tres veces por semana",
        target: "terminar antes de la reunión privada"
      }
    }],
    assessmentContext: {
      sleepHours: 7,
      deviceClass: "desktop",
      adhdMedication: "Metilfenidato indicado por la Dra. Laura",
      lastDoseTime: "08:15",
      futureFreeTextField: "dato clínico libre que una versión futura no debe filtrar por accidente"
    }
  }, { subjectCode: "ADHD_0100", datePolicy: "remove" });

  assert.equal(validateAdhdResearchDataset(dataset).valid, true);
  assert.equal(dataset.data.assessmentContext.sleepHours, 7, "el contexto estructurado debe conservarse");
  const serialized = JSON.stringify(dataset);
  assert.doesNotMatch(serialized, /Laura|consultorio|informe confidencial|reunión privada|supervisora|Metilfenidato|08:15|dato clínico libre/u);
  for (const key of ["strategy", "application", "applicationPrompt", "action", "context", "frequency", "target"]) {
    assert.doesNotMatch(serialized, new RegExp(`"${key}"`, "u"));
  }
  assert.ok(dataset.exportAudit.removedFieldCategories.free_text >= 7);
});
