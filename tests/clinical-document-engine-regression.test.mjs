import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { ClinicalDocument } from "../js/modules/clinical-document-engine/core/ClinicalDocument.js";
import { ClinicalNote } from "../js/modules/clinical-document-engine/core/ClinicalNote.js";
import { ClinicalSection } from "../js/modules/clinical-document-engine/core/ClinicalSection.js";
import { ClinicalEntityEngine } from "../js/modules/clinical-document-engine/engine/ClinicalEntityEngine.js";
import { parseDiagnosisCandidates } from "../js/modules/clinical-document-engine/parsers/diagnosisParser.js";
import { parseMedicationCandidates } from "../js/modules/clinical-document-engine/parsers/medicationParser.js";
import { parseVitalSigns } from "../js/modules/clinical-document-engine/parsers/vitalSignsParser.js";
import { toLegacyDiagnosisCandidate } from "../js/modules/clinical-document-engine/adapters/diagnosisAdapter.js";
import { toLegacyMedicationCandidate } from "../js/modules/clinical-document-engine/adapters/medicationAdapter.js";
import { adaptVitalSignsCandidates } from "../js/modules/clinical-document-engine/adapters/vitalSignsAdapter.js";

const table = {
  type: "table",
  rows: [["Presión arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2", "Peso", "Talla", "IMC"], ["120/80", "36.5", "75", "18", "95", "72", "1.67", "25.81"]],
  source: { blockIndex: 2, tableIndex: 0 }
};
const document = new ClinicalDocument({ id: "regression-doc", rawText: "Nota clínica anonimizadA", blocks: [table] });
const note = new ClinicalNote({ id: "regression-note", metadata: { documentId: document.id, date: "31/07/2026", time: "21:00" }, rawText: document.rawText, sections: [new ClinicalSection({ key: "diagnosticos", value: "Diagnósticos: Trastorno depresivo recurrente | F33.2" }), new ClinicalSection({ key: "medicamentos", value: "Sertralina 50 mg vía oral 1 vez al día" })] });
document.notes.push(note);

const diagnosisCandidates = parseDiagnosisCandidates({ text: note.sections[0].value, section: "diagnosticos", documentId: document.id, noteId: note.id });
const medicationCandidates = parseMedicationCandidates({ text: note.sections[1].value, section: "medicamentos", documentId: document.id, noteId: note.id });
const vitalCandidates = parseVitalSigns({ blocks: document.blocks, documentId: document.id, noteId: note.id, date: note.metadata.date, time: note.metadata.time });
assert.equal(diagnosisCandidates.length, 1);
assert.equal(medicationCandidates.length, 1);
assert.equal(vitalCandidates.length, 8);

const entityEngine = new ClinicalEntityEngine();
const results = entityEngine.createMany([...diagnosisCandidates, ...medicationCandidates, ...vitalCandidates]);
const entities = results.map((result) => result.entity);
assert.equal(entities.length, 10);
assert.equal(entities.filter((entity) => entity.entityType === "diagnosis").length, 1);
assert.equal(entities.filter((entity) => entity.entityType === "medication").length, 1);
assert.equal(entities.filter((entity) => entity.entityType === "vitalSign").length, 8);
assert.ok(entities.every((entity) => entity.evidence.length && entity.createdAt && entity.updatedAt && entity.version));

assert.equal(toLegacyDiagnosisCandidate(entities.find((entity) => entity.entityType === "diagnosis")).code, "F33.2");
assert.equal(toLegacyMedicationCandidate(entities.find((entity) => entity.entityType === "medication")).medicationName, "Sertralina");
const legacyVitals = adaptVitalSignsCandidates({ blocks: [table], date: note.metadata.date, time: note.metadata.time });
assert.equal(legacyVitals.length, 1);
assert.equal(legacyVitals[0].vitalSigns.bloodPressure.systolic, 120);
assert.equal(legacyVitals[0].vitalSigns.weight.value, 72);

const start = performance.now();
const repeats = 100;
for (let index = 0; index < repeats; index += 1) {
  parseDiagnosisCandidates({ text: note.sections[0].value, section: "diagnosticos", documentId: document.id, noteId: note.id });
  parseMedicationCandidates({ text: note.sections[1].value, section: "medicamentos", documentId: document.id, noteId: note.id });
  parseVitalSigns({ blocks: document.blocks, documentId: document.id, noteId: note.id });
}
const elapsedMs = performance.now() - start;
const metrics = { repeats, elapsedMs: Number(elapsedMs.toFixed(2)), averageMs: Number((elapsedMs / repeats).toFixed(3)), entityCount: entities.length, memoryRssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)) };
assert.ok(metrics.elapsedMs >= 0);
console.log(`clinical-document-engine-regression: ok ${JSON.stringify(metrics)}`);
