import assert from "node:assert/strict";
import { detectDiagnosisCandidates, parseDiagnosisCandidates } from "../js/modules/clinical-document-engine/parsers/diagnosisParser.js";
import { validateDiagnosis } from "../js/modules/clinical-document-engine/validators/diagnosisValidator.js";

const anaTable = {
  type: "table",
  source: { tableIndex: 5, blockIndex: 14 },
  rows: [
    ["DIAGNÓSTICO", "CIE-10"],
    [
      "Trastorno de Estrés Postraumático Complejo Trastorno Depresivo Recurrente, episodio actual grave sin síntomas psicóticos SE AGREGAEpisodio Depresivo Grave sin síntomas psicóticos SE DESCARTA DistimiaSoporte familiar inadecuado SE AGREGACónyuge o pareja, autor de maltrato y abandono",
      "F43.1F33.2F32.2F34.1Z63.2Y07.0"
    ]
  ]
};
const anaTableCandidates = detectDiagnosisCandidates({ sourceBlocks: [anaTable], documentId: "ana", noteId: "ana-note-1" });
assert.deepEqual(anaTableCandidates.map(({ diagnosisName, code, system, status }) => ({ diagnosisName, code, system, status })), [
  { diagnosisName: "Trastorno de Estrés Postraumático Complejo", code: "F43.1", system: "CIE-10", status: "Confirmado" },
  { diagnosisName: "Trastorno Depresivo Recurrente, episodio actual grave sin síntomas psicóticos", code: "F33.2", system: "CIE-10", status: "Se agrega" },
  { diagnosisName: "Episodio Depresivo Grave sin síntomas psicóticos", code: "F32.2", system: "CIE-10", status: "Descartado" },
  { diagnosisName: "Distimia", code: "F34.1", system: "CIE-10", status: "Confirmado" },
  { diagnosisName: "Soporte familiar inadecuado", code: "Z63.2", system: "CIE-10", status: "Se agrega" },
  { diagnosisName: "Cónyuge o pareja, autor de maltrato y abandono", code: "Y07.0", system: "CIE-10", status: "Confirmado" }
]);
assert.ok(anaTableCandidates.every((candidate) => !/SE AGREGA|SE DESCARTA/i.test(candidate.diagnosisName)));
assert.ok(anaTableCandidates.every((candidate) => candidate.evidence[0].block === 14));

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

const structured = parseDiagnosisCandidates({
  text: `DIAGNÓSTICOS DE ACUERDO A CIE-10
Trastorno de Estrés Postraumático Complejo | F43.1
Trastorno Depresivo Recurrente | F33.2
SE AGREGA
Episodio Depresivo Grave | F32.2
SE DESCARTA
Distimia | F34.1
Soporte familiar inadecuado | Z63.2
Cónyuge o pareja, autor de maltrato y abandono | Y07.0
COMENTARIO Y/O ANÁLISIS
Paciente femenina en valoración clínica.`,
  explicit: true,
  documentId: "anon-ana",
  noteId: "note-1"
});
assert.deepEqual(structured.map((candidate) => candidate.diagnosisName), [
  "Trastorno de Estrés Postraumático Complejo",
  "Trastorno Depresivo Recurrente",
  "Episodio Depresivo Grave",
  "Distimia",
  "Soporte familiar inadecuado",
  "Cónyuge o pareja, autor de maltrato y abandono"
]);
assert.deepEqual(structured.map((candidate) => candidate.code), ["F43.1", "F33.2", "F32.2", "F34.1", "Z63.2", "Y07.0"]);
assert.equal(structured[1].status, "Se agrega");
assert.equal(structured[2].status, "Descartado");
assert.ok(structured.every((candidate) => candidate.system === "CIE-10"));
assert.doesNotMatch(structured.map((candidate) => candidate.diagnosisName).join(" "), /SE AGREGA|SE DESCARTA|RIESGO SUICIDA/i);

const excluded = detectDiagnosisCandidates({
  documentId: "anon-excluded",
  sections: {
    diagnosticos: "DIAGNÓSTICO | CIE-10\nTrastorno depresivo | F33.2\nPLAN TERAPÉUTICO",
    plan: "Riesgo suicida: vigilancia estrecha. Riesgo de caída: bajo. Conducta autolesiva.",
    analisis: "Comentario clínico: paciente estable, sin nuevos diagnósticos."
  }
});
assert.deepEqual(excluded.map((candidate) => candidate.diagnosisName), ["Trastorno depresivo"]);
assert.doesNotMatch(excluded.map((candidate) => candidate.diagnosisName).join(" "), /riesgo|vigilancia|autolesiva|comentario/i);

console.log("clinical-document-engine-diagnosis: ok");
