import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  normalizeImportedStudyDate,
  parseStudyCandidates
} from "../js/modules/patient-transfer/parsing/studyCandidateParser.js";
import { parseClinicalSections } from "../js/modules/patient-transfer/parsing/clinicalSectionParser.js";
import {
  buildImportedStudyPayload,
  studyClinicalIdentity,
  studyIdentityKeys,
  studyImportKey
} from "../js/modules/patient-transfer/integration/importedStudyContract.js";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("extrae un ECG como estudio canónico de gabinete", () => {
  const [candidate] = parseStudyCandidates({
    documentId: "fixture-document",
    noteId: "fixture-note",
    clinicalDate: "16/08/2026",
    text: "ECG 17/08/2026: FC 72, ritmo sinusal, sin datos agudos"
  });
  assert.equal(candidate.name, "Electrocardiograma");
  assert.equal(candidate.type, "Gabinete");
  assert.equal(candidate.date, "2026-08-17");
  assert.match(candidate.result, /FC 72/);
  assert.equal(candidate.include, false);
});

test("el encabezado diagnóstico alimenta la sección canónica de Estudios", () => {
  const sections = parseClinicalSections([
    { type: "paragraph", text: "RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNÓSTICO", source: { blockIndex: 0 } },
    { type: "paragraph", text: "ECG 17/08/2026: ritmo sinusal, sin datos agudos", source: { blockIndex: 1 } },
    { type: "paragraph", text: "DIAGNÓSTICOS DE ACUERDO CON CIE-10", source: { blockIndex: 2 } },
    { type: "paragraph", text: "Diagnóstico ficticio F00", source: { blockIndex: 3 } }
  ]).secciones;
  assert.match(sections.resultadosEstudios, /ECG 17\/08\/2026/);
  assert.doesNotMatch(sections.resultadosEstudios, /Diagnóstico ficticio/);
  const candidates = parseStudyCandidates({ text: sections.resultadosEstudios, clinicalDate: "17/08/2026" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "Electrocardiograma");
});

test("separa estudios de laboratorio y gabinete dentro de una misma sección", () => {
  const candidates = parseStudyCandidates({
    documentId: "fixture-multiple",
    noteId: "fixture-note",
    clinicalDate: "18/08/2026",
    text: "Biometría hemática: hemoglobina dentro de rango\nTAC de cráneo: sin lesión aguda"
  });
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(({ type }) => type), ["Laboratorio", "Gabinete"]);
  assert.deepEqual(candidates.map(({ date }) => date), ["2026-08-18", "2026-08-18"]);
});

test("una sección explícita desconocida se conserva para revisión sin inventar tipo", () => {
  const [candidate] = parseStudyCandidates({
    documentId: "fixture-review",
    noteId: "fixture-note",
    text: "Prueba funcional especializada: resultado pendiente de corroborar"
  });
  assert.equal(candidate.name, "Estudio diagnóstico");
  assert.equal(candidate.type, "Otro");
  assert.equal(candidate.requiresReview, true);
});

test("normaliza fecha clínica y construye el mismo contrato que Estudios del expediente", () => {
  assert.equal(normalizeImportedStudyDate("17/08/2026"), "2026-08-17");
  const candidate = parseStudyCandidates({
    documentId: "fixture-contract",
    noteId: "fixture-note",
    text: "Electrocardiograma: ritmo sinusal",
    clinicalDate: "17/08/2026"
  })[0];
  const payload = buildImportedStudyPayload(candidate, {
    sourceFileHash: "fixture-hash",
    sourceNoteId: "fixture-segment",
    transferOperationId: "fixture-transfer",
    user: { uid: "fixture-user" }
  });
  ["nombre", "tipo", "fecha", "resultado", "observaciones", "enlace", "creadoPor"].forEach((key) => {
    assert.ok(Object.hasOwn(payload, key), `incluye ${key}`);
  });
  assert.equal(payload.nombre, "Electrocardiograma");
  assert.equal(payload.tipo, "Gabinete");
  assert.equal(payload.fecha, "2026-08-17");
  assert.equal(payload.origenImportacionDocx, true);
});

test("la identidad clínica une el mismo estudio repetido en notas distintas", () => {
  const candidate = {
    id: "temporary-study-1",
    sourceIndex: 0,
    name: "Electrocardiograma",
    type: "Gabinete",
    date: "2026-08-17",
    result: "Ritmo sinusal, FC 72",
    observations: "Sin datos agudos"
  };
  const context = { sourceFileHash: "fixture-hash", sourceDocumentIndex: 1 };
  assert.equal(
    studyImportKey(candidate, context),
    studyImportKey(
      { ...candidate, id: "another-temporary-id", sourceIndex: 4 },
      { sourceFileHash: "another-file", sourceDocumentIndex: 9, sourceNoteId: "another-note" }
    )
  );
  assert.notEqual(studyImportKey(candidate, context), studyImportKey({ ...candidate, date: "2026-08-18" }, context));
  assert.notEqual(studyImportKey(candidate, context), studyImportKey({ ...candidate, result: "Ritmo sinusal, FC 80" }, context));
});

test("la identidad acepta el contrato del candidato y el contrato canónico persistido", () => {
  const candidate = {
    name: "Biometría hemática",
    type: "Laboratorio",
    date: "17/08/2026",
    result: "Hemoglobina dentro de rango",
    observations: "Control",
    link: "https://example.test/study"
  };
  const stored = {
    nombre: "BIOMETRIA HEMATICA",
    tipo: "laboratorio",
    fecha: "2026-08-17",
    resultado: "Hemoglobina   dentro de rango",
    observaciones: "control",
    enlace: "https://example.test/another-copy",
    importCandidateKey: "legacy-source-scoped-key"
  };
  assert.equal(studyClinicalIdentity(candidate), studyClinicalIdentity(stored));
  assert.equal(studyImportKey(candidate), studyImportKey(stored));
  assert.deepEqual(
    studyIdentityKeys(stored),
    ["legacy-source-scoped-key", studyImportKey(candidate)]
  );
});

test("sin fecha clínica no fusiona automáticamente estudios de notas distintas", () => {
  const candidate = {
    sourceIndex: 0,
    name: "Electrocardiograma",
    type: "Gabinete",
    result: "Ritmo sinusal"
  };
  assert.notEqual(
    studyImportKey(candidate, { sourceFileHash: "file-a", sourceNoteId: "note-a" }),
    studyImportKey(candidate, { sourceFileHash: "file-a", sourceNoteId: "note-b" })
  );
});

test("patient-transfer usa colección, escritor y lector canónicos del target", () => {
  const service = read("js/services/estudios.js");
  const patientRecord = read("js/paciente.js");
  const adapter = read("js/modules/patient-transfer/integration/clinicalDataImportAdapter.js");
  const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
  assert.match(service, /collection\(db, "usuarios", uidPaciente, "estudios"\)/);
  assert.match(patientRecord, /function datosFormularioEstudio\(\)/);
  assert.match(patientRecord, /nombre:[\s\S]*tipo:[\s\S]*fecha:[\s\S]*resultado:[\s\S]*observaciones:[\s\S]*enlace:[\s\S]*creadoPor:/);
  assert.match(patientRecord, /await crearEstudio\(uidPaciente, datos\)/);
  assert.match(patientRecord, /estudiosCache = await listarEstudios\(uidPaciente\)/);
  assert.match(adapter, /crearEstudio, listarEstudios/);
  assert.match(adapter, /await crearEstudio\(patientId, payload\)/);
  assert.match(adapter, /const after = await listarEstudios\(patientId\)/);
  assert.match(adapter, /before\.flatMap\(\(study\) => studyIdentityKeys\(study, context\)\)/);
  assert.match(adapter, /candidateKeys\.some\(\(candidateKey\) => seen\.has\(candidateKey\)\)/);
  assert.match(repository, /createImportedStudies\(patientId, documentStudies, clinicalContext\)/);
  const documentLoop = repository.slice(repository.indexOf("for (let documentIndex"));
  assert.ok(documentLoop.indexOf('stage = "creating_studies"') < documentLoop.indexOf('stage = "creating_note"'));
});

test("la revisión expone Estudios y conserva selección aunque el control no esté montado", () => {
  const view = read("js/modules/patient-transfer/ui/patientTransferView.js");
  const segmenter = read("js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js");
  assert.match(view, /Estudios de laboratorio y gabinete/);
  assert.match(view, /data-transfer-study-include/);
  assert.match(view, /candidateType === "study"/);
  assert.match(view, /includeControl\s*\? includeControl\.checked\s*:\s*candidate\.include === true \|\| candidate\.selectedForImport === true/);
  assert.match(segmenter, /studyCandidates: segment\.studyCandidates/);
});
