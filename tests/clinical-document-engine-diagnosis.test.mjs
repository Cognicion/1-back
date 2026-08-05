import assert from "node:assert/strict";
import { detectDiagnosisCandidates, parseDiagnosisCandidates } from "../js/modules/clinical-document-engine/parsers/diagnosisParser.js";
import { validateDiagnosis } from "../js/modules/clinical-document-engine/validators/diagnosisValidator.js";

const candidates = parseDiagnosisCandidates({
  documentId: "anon-doc",
  noteId: "anon-note",
  explicit: true,
  text: "DIAGNÓSTICOS DE ACUERDO A CIE-10:\nTrastorno depresivo recurrente, episodio actual grave sin síntomas psicóticos | F33.2\nSE AGREGA\nDistimia | F34.1\nSoporte familiar inadecuado | Z63.2\nCOMENTARIO Y/O ANÁLISIS\nPaciente femenina en valoración clínica."
});
assert.equal(candidates.length, 3);
assert.equal(candidates[0].candidateType, "diagnosis");
assert.equal(candidates[0].diagnosisName, "Trastorno depresivo recurrente, episodio actual grave sin síntomas psicóticos");
assert.equal(candidates[0].code, "F33.2");
assert.equal(candidates[0].system, "CIE-10");
assert.equal(candidates[0].status, "Se agrega");
assert.equal(candidates[0].confidence, "HIGH");
assert.equal(candidates[0].requiresReview, false);
assert.equal(candidates[0].evidence[0].documentId, "anon-doc");
assert.equal(candidates[0].evidence[0].rawText.includes("F33.2"), true);
assert.equal(validateDiagnosis(candidates[0]).valid, true);
assert.doesNotMatch(candidates.map((candidate) => candidate.diagnosisName).join(" "), /Paciente femenina/);

const table = detectDiagnosisCandidates({
  documentId: "anon-table",
  sourceBlocks: [{ type: "table", rows: [["Diagnóstico", "CIE-10"], ["Alcohol: síndrome de dependencia", "F10.2"], ["Obesidad", "E66.9"]], source: { tableIndex: 1, blockIndex: 4 } }]
});
assert.deepEqual(table.map((candidate) => [candidate.diagnosisName, candidate.code, candidate.system]), [["Alcohol: síndrome de dependencia", "F10.2", "CIE-10"], ["Obesidad", "E66.9", "CIE-10"]]);

const concatenated = parseDiagnosisCandidates({ text: "DIAGNÓSTICO | CIE-10\nTrastorno depresivo F43.1F33.2F34.1\nPLAN TERAPÉUTICO", explicit: true, documentId: "anon-concat" });
assert.equal(concatenated.length, 1);
assert.equal(concatenated[0].code, null);
assert.equal(concatenated[0].requiresReview, true);

console.log("clinical-document-engine-diagnosis: ok");
