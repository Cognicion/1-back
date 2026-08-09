import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  detectDiagnosisCandidates,
  parseDiagnosisCandidates
} from "../js/modules/clinical-document-engine/parsers/diagnosisParser.js";
import { toLegacyDiagnosisCandidate } from "../js/modules/clinical-document-engine/adapters/diagnosisAdapter.js";
import {
  claveDiagnosticoPaciente,
  construirActualizacionHistorialDiagnosticos,
  construirRegistroDiagnosticoImportado,
  fusionarDiagnosticosImportados
} from "../js/services/diagnosticosPaciente.js";
import { construirActualizacionSignosVitalesDesdeNota } from "../js/services/signosVitalesNotas.js";
import { runVitalSignsAndDiagnosesIndependently } from "../js/modules/patient-transfer/domainPersistenceIsolation.js";
import {
  diagnosisTransferSummary,
  reviewedDiagnosisSelection
} from "../js/modules/patient-transfer/ui/patientTransferView.js";

const root = process.cwd();
const repository = readFileSync(join(root, "js/modules/patient-transfer/patientTransferRepository.js"), "utf8");

function selected(candidate) {
  return { ...toLegacyDiagnosisCandidate(candidate), include: true, selectedForImport: true, confirmedByDoctor: true };
}

test("parser produce un diagnóstico canónico", () => {
  const candidates = parseDiagnosisCandidates({
    documentId: "fixture-doc",
    noteId: "fixture-note",
    explicit: true,
    text: "DIAGNÓSTICOS DE ACUERDO A CIE-10:\nEpisodio depresivo grave | F32.2\nPLAN TERAPÉUTICO"
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].code, "F32.2");
  assert.equal(candidates[0].system, "CIE-10");
});

test("parser conserva múltiples diagnósticos y sus estados", () => {
  const candidates = parseDiagnosisCandidates({
    documentId: "fixture-doc-multiple",
    noteId: "fixture-note-multiple",
    explicit: true,
    text: "DIAGNÓSTICOS DE ACUERDO A CIE-10:\nEpisodio depresivo grave | F32.2\nTrastorno de ansiedad generalizada | F41.1\nPROBABLE\nProblema relacionado con apoyo familiar | Z63.2\nA DESCARTAR\nPLAN TERAPÉUTICO"
  });
  assert.equal(candidates.length, 3);
  assert.equal(candidates[1].status, "Probable");
  assert.equal(candidates[2].status, "A descartar");
});

test("códigos múltiples permanecen en una sola entidad", () => {
  const [candidate] = detectDiagnosisCandidates({
    documentId: "fixture-multicode",
    noteId: "fixture-note-multicode",
    sourceBlocks: [{
      type: "table",
      source: { tableIndex: 1, blockIndex: 2 },
      rows: [["DIAGNÓSTICO", "CIE-10"], ["Lesión ficticia", "X78, S517 + S117"]]
    }]
  });
  const legacy = selected(candidate);
  const payload = construirRegistroDiagnosticoImportado(legacy, {
    sourceFileHash: "fixture-hash",
    sourceNoteId: "fixture-segment",
    date: "04/08/2026"
  });
  assert.deepEqual(payload.codes, ["X78", "S517", "S117"]);
  assert.equal(payload.codigo, "X78");
});

test("estado probable y negación conservan semántica clínica", () => {
  const probable = construirRegistroDiagnosticoImportado({
    id: "dx-probable",
    code: "F41.1",
    codingSystem: "CIE-10",
    normalizedLabel: "Trastorno de ansiedad generalizada",
    statusSuggestion: "Probable"
  });
  const negated = construirRegistroDiagnosticoImportado({
    id: "dx-negated",
    code: "F32.2",
    codingSystem: "CIE-10",
    normalizedLabel: "Episodio depresivo grave",
    statusSuggestion: "Descartado",
    negated: true
  });
  assert.equal(probable.estadoClinico, "Probable");
  assert.equal(probable.estado, "activo");
  assert.equal(negated.estadoClinico, "Se descarta");
  assert.equal(negated.estado, "descartado");
});

test("associate_existing escribe únicamente en el target resuelto", () => {
  const helperStart = repository.indexOf("async function persistImportedDiagnosesForDocument");
  const helperEnd = repository.indexOf("function traceTransfer", helperStart);
  const helper = repository.slice(helperStart, helperEnd);
  assert.match(helper, /const patientRef = doc\(db, "usuarios", patientId\)/);
  assert.match(repository, /patientId,\s*operationId,\s*effectiveAction,\s*user\s*\}\);/);
  assert.doesNotMatch(helper, /operation\.data\?\.patientId|sourcePatientId|temporaryPatientId/);
});

test("diagnósticos se persisten antes de crear o verificar la nota", () => {
  const loop = repository.indexOf("for (let documentIndex = 0; documentIndex < documentsToSave.length");
  const diagnosisCall = repository.indexOf("persistImportedDiagnosesForDocument({", loop);
  const noteStage = repository.indexOf('stage = "creating_note"', loop);
  assert.ok(diagnosisCall > loop);
  assert.ok(diagnosisCall < noteStage);
});

test("operation.completed no bloquea la reparación del dominio diagnóstico", () => {
  assert.match(repository, /const resumingCompletedOperation = operation\.data\?\.status === "completed"/);
  assert.equal(repository.indexOf('if (operation.data?.status === "completed")'), -1);
  const loop = repository.indexOf("for (let documentIndex = 0; documentIndex < documentsToSave.length");
  assert.ok(repository.indexOf("persistImportedDiagnosesForDocument({", loop) > repository.indexOf("const resumingCompletedOperation"));
});

test("reimportación idéntica no duplica el historial", () => {
  const candidate = {
    id: "dx-idempotent",
    code: "F32.2",
    codes: ["F32.2"],
    codingSystem: "CIE-10",
    normalizedLabel: "Episodio depresivo grave",
    statusSuggestion: "Confirmado",
    include: true,
    selectedForImport: true
  };
  const context = { sourceFileHash: "fixture-hash", sourceNoteId: "fixture-note", date: "04/08/2026" };
  const first = fusionarDiagnosticosImportados([], [candidate], context);
  const second = fusionarDiagnosticosImportados(first.historial, [candidate], context);
  assert.equal(first.created.length, 1);
  assert.equal(second.created.length, 0);
  assert.equal(second.existing.length, 1);
  assert.equal(second.historial.length, 1);
});

test("diagnóstico manual e importado comparten el contrato de historial", () => {
  const manual = {
    id: "manual-fixture",
    codigo: "F32.2",
    codes: ["F32.2"],
    catalogo: "CIE-10",
    nombre: "Episodio depresivo grave",
    texto: "F32.2 - Episodio depresivo grave",
    fechaSeleccion: "2026-08-04T14:30:00",
    estado: "activo",
    estadoClinico: "Confirmado",
    orden: 0,
    manual: true
  };
  const imported = construirRegistroDiagnosticoImportado({
    id: "import-fixture",
    code: "F32.2",
    codes: ["F32.2"],
    codingSystem: "CIE-10",
    normalizedLabel: "Episodio depresivo grave",
    rawText: "F32.2 - Episodio depresivo grave",
    statusSuggestion: "Confirmado"
  }, { sourceFileHash: "fixture-hash", sourceNoteId: "fixture-note", date: "04/08/2026", time: "14:30" });
  const required = ["id", "codigo", "codes", "catalogo", "nombre", "texto", "fechaSeleccion", "estado", "estadoClinico", "orden"];
  required.forEach((key) => {
    assert.ok(Object.hasOwn(manual, key), `manual contiene ${key}`);
    assert.ok(Object.hasOwn(imported, key), `importado contiene ${key}`);
  });
  assert.equal(claveDiagnosticoPaciente(manual), claveDiagnosticoPaciente(imported));
  const update = construirActualizacionHistorialDiagnosticos({}, [imported]);
  assert.equal(update.historialDiagnosticos[0].codigo, "F32.2");
  assert.equal(update.datosClinicosResumen.historialDiagnosticos[0].codigo, "F32.2");
});

test("persistencia exige before -> write -> after y read-after-write observable", () => {
  const helperStart = repository.indexOf("async function persistImportedDiagnosesForDocument");
  const helperEnd = repository.indexOf("function traceTransfer", helperStart);
  const helper = repository.slice(helperStart, helperEnd);
  const before = helper.indexOf("const beforeSnap = await getDocFromServer(patientRef)");
  const write = helper.indexOf("createImportedDiagnoses(patientId");
  const after = helper.indexOf("const afterSnap = await getDocFromServer(patientRef)");
  assert.ok(before >= 0 && write > before && after > write);
  assert.match(helper, /patient-transfer:diagnoses-history-before-real/);
  assert.match(helper, /patient-transfer:diagnoses-source-real/);
  assert.match(helper, /patient-transfer:diagnoses-target/);
  assert.match(helper, /patient-transfer:diagnoses-write-start/);
  assert.match(helper, /patient-transfer:diagnoses-write-result/);
  assert.match(helper, /patient-transfer:diagnoses-history-after-real/);
  assert.match(helper, /patient-transfer:diagnoses-write-not-observed/);
});

test("checkbox ausente conserva la selección clínica central", () => {
  assert.equal(reviewedDiagnosisSelection({ include: true, selectedForImport: true }, null), true);
  assert.equal(reviewedDiagnosisSelection({ include: false, selectedForImport: false }, null), false);
  assert.equal(reviewedDiagnosisSelection({ include: true }, { checked: false }), false);
  assert.equal(reviewedDiagnosisSelection({ include: false }, { checked: true }), true);
});

test("la integración publicada de signos vitales permanece aislada", () => {
  const vitalsStart = repository.indexOf("async function persistImportedVitalSignsForDocument");
  const diagnosesStart = repository.indexOf("function diagnosisHistoryFromPatient", vitalsStart);
  assert.ok(vitalsStart >= 0 && diagnosesStart > vitalsStart);
  const vitalsHelper = repository.slice(vitalsStart, diagnosesStart);
  assert.match(vitalsHelper, /construirActualizacionSignosVitalesDesdeNota/);
  assert.match(vitalsHelper, /patient-transfer:vitals-history-after-real/);
  assert.doesNotMatch(vitalsHelper, /diagnoses-|Diagnostico|Diagnóstico/);
});

test("un fallo de signos vitales no impide intentar y completar diagnósticos", async () => {
  const calls = [];
  const domainErrors = [];
  const outcome = await runVitalSignsAndDiagnosesIndependently({
    persistVitalSigns: async () => {
      calls.push("vital-signs");
      const error = new Error("fixture vital failure");
      error.code = "fixture-vitals-error";
      throw error;
    },
    persistDiagnoses: async () => {
      calls.push("diagnoses");
      return { created: [{ id: "fixture-diagnosis" }], existing: [] };
    },
    onDomainError: ({ domain, error }) => domainErrors.push({ domain, code: error.code })
  });

  assert.deepEqual(calls, ["vital-signs", "diagnoses"]);
  assert.equal(outcome.results.vitalSigns, null);
  assert.equal(outcome.results.diagnoses.created.length, 1);
  assert.deepEqual(domainErrors, [{ domain: "vital-signs", code: "fixture-vitals-error" }]);
});

test("un fallo diagnóstico conserva el resultado previo de signos vitales", async () => {
  const outcome = await runVitalSignsAndDiagnosesIndependently({
    persistVitalSigns: async () => ({ created: 1, recordIds: ["fixture-vital"] }),
    persistDiagnoses: async () => {
      throw new Error("fixture diagnosis failure");
    }
  });

  assert.equal(outcome.results.vitalSigns.created, 1);
  assert.equal(outcome.results.diagnoses, null);
  assert.equal(outcome.errors[0].domain, "diagnoses");
});

test("fecha nula en la comparación de signos vitales no aborta el dominio siguiente", () => {
  const update = construirActualizacionSignosVitalesDesdeNota({
    paciente: {
      historialSignosVitales: {
        presionArterial: [{ fecha: "2026-08-08T10:00:00.000Z", valor: "110/70" }]
      }
    },
    nota: {
      observacionFray: {
        presionArterial: "120/80",
        fechaNota: "09/08/2026",
        horaNota: "10:00"
      }
    },
    sourceNoteId: "fixture-note",
    createdBy: "fixture-user"
  });

  assert.equal(update.presionArterial, "120/80");
  assert.equal(update.historialSignosVitales.presionArterial.length, 2);
});

test("el resumen diagnóstico distingue intento, inclusión, idempotencia y error", () => {
  assert.equal(diagnosisTransferSummary({}), "no ejecutado");
  assert.equal(diagnosisTransferSummary({
    diagnosesAttempted: true,
    diagnosesDetected: 3,
    diagnosesIncluded: 3,
    diagnosesCreated: 2,
    diagnosesIdempotent: 1,
    diagnosesOmitted: 0,
    diagnosesError: "fixture-error"
  }), "3 detectados / 3 incluidos / 2 registrados / 1 idempotentes / 0 omitidos / error: fixture-error");
});

test("el repositorio reporta el error de dominio sin retorno silencioso antes de DX", () => {
  const loop = repository.indexOf("runVitalSignsAndDiagnosesIndependently({");
  const vitalAttempt = repository.indexOf("persistVitalSigns: async () =>", loop);
  const diagnosisAttempt = repository.indexOf("persistDiagnoses: async () =>", loop);
  const errorTrace = repository.indexOf('console.error("patient-transfer:domain-error"', loop);
  const finalThrow = repository.indexOf("throw firstDomainError", loop);
  assert.ok(loop >= 0 && vitalAttempt > loop && diagnosisAttempt > vitalAttempt);
  assert.ok(errorTrace > diagnosisAttempt && finalThrow > errorTrace);
});
