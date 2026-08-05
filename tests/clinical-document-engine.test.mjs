import assert from "node:assert/strict";
import {
  ClinicalDocument,
  ClinicalNote,
  ClinicalSection,
  ClinicalCandidate,
  ClinicalEvidence,
  findFirstBoundary,
  findSectionStart,
  extractBoundedSection,
  normalizeRecordNumber,
  normalizeClinicalDate,
  normalizeClinicalTime,
  normalizeDiagnosticCode,
  normalizeMedicationRoute,
  evaluateConfidence,
  validateDiagnosis,
  validateMedication,
  validatePatient,
  adaptSubjectiveParser,
  adaptMentalExamParser
} from "../js/modules/clinical-document-engine/index.js";

assert.equal(normalizeRecordNumber("001 245"), "001245");
assert.equal(normalizeClinicalDate("4-8-2026"), "04/08/2026");
assert.equal(normalizeClinicalTime("8 horas"), "08:00");
assert.equal(normalizeDiagnosticCode(" f33.2 "), "F33.2");
assert.equal(normalizeMedicationRoute("Administrar vía oral"), "oral");
assert.equal(evaluateConfidence({ explicitHeading: true }), "HIGH");

const boundary = findFirstBoundary("Texto. EXAMEN MENTAL: Alerta.", ["Examen mental"]);
assert.equal(boundary.alias, "Examen mental");
const start = findSectionStart("EXAMEN MENTAL: Alerta.", ["Examen mental"]);
assert.equal(start.inlineContent, "Alerta.");
const bounded = extractBoundedSection({ text: "EXAMEN MENTAL: Alerta. DIAGNÓSTICO: F33.2", startAliases: ["Examen mental"], boundaryAliases: ["Diagnóstico"] });
assert.equal(bounded.value, "Alerta.");

const evidence = new ClinicalEvidence({ documentId: "anon-doc", block: 3, rawText: "Alerta.", confidence: "HIGH" });
const section = new ClinicalSection({ key: "mentalExam", value: "Alerta.", evidence: [evidence], confidence: "HIGH" });
const note = new ClinicalNote({ id: "anon-note", sections: [section] });
const document = new ClinicalDocument({ id: "anon-doc", notes: [note] });
assert.equal(document.notes[0].sections[0].value, "Alerta.");
assert.notEqual(document.notes, note.sections);
assert.equal(new ClinicalCandidate({ id: "dx-1", type: "diagnosis", value: { code: "F33.2" } }).type, "diagnosis");
assert.equal(validateDiagnosis({ diagnosisName: "Trastorno depresivo", code: "F33.2" }).valid, true);
assert.equal(validateMedication({ medicationName: "Sertralina", schedule: [] }).valid, true);
assert.equal(validatePatient({ expediente: "001245" }).valid, true);

const subjective = adaptSubjectiveParser({ id: "anon-note", blocks: [{ type: "paragraph", text: "SUBJETIVO: Refiere mejoría.", source: { blockIndex: 0 } }, { type: "paragraph", text: "EXAMEN MENTAL: Alerta.", source: { blockIndex: 1 } }] });
assert.equal(subjective.value, "Refiere mejoría.");
assert.equal(subjective.parser, "patient-transfer.subjectiveSectionParser");
const mental = adaptMentalExamParser({ id: "anon-note", blocks: [{ type: "paragraph", text: "EXAMEN MENTAL: Alerta.", source: { blockIndex: 0 } }] });
assert.equal(mental.value, "Alerta.");
assert.equal(mental.parser, "patient-transfer.clinicalSectionParser.mentalExam");

console.log("clinical-document-engine: ok");
