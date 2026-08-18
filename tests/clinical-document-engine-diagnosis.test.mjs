import assert from "node:assert/strict";
import { detectDiagnosisCandidates, parseDiagnosisCandidates } from "../js/modules/clinical-document-engine/parsers/diagnosisParser.js";
import { toLegacyDiagnosisCandidate } from "../js/modules/clinical-document-engine/adapters/diagnosisAdapter.js";
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

const narrativeAfterDiagnosis = parseDiagnosisCandidates({
  documentId: "anon-narrative-boundary",
  noteId: "anon-note-1",
  explicit: true,
  text: "Trastorno depresivo recurrente | F33.2\nAna Lizbeth, mujer de la cuarta década de la vida quien refiere persistencia de ideas de muerte y acude a valoración."
});
assert.equal(narrativeAfterDiagnosis.length, 1);
assert.equal(narrativeAfterDiagnosis[0].diagnosisName, "Trastorno depresivo recurrente");
assert.doesNotMatch(narrativeAfterDiagnosis.map((candidate) => candidate.diagnosisName).join(" "), /Ana Lizbeth|Paciente|Mujer|Se trata de/i);

const narrativeOnly = detectDiagnosisCandidates({
  documentId: "anon-narrative-only",
  noteId: "anon-note-2",
  sections: { subjetivo: "Se trata de Ana Lizbeth, paciente que refiere persistencia de sintomatología depresiva y acude a valoración." }
});
assert.equal(narrativeOnly.length, 0);

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

const mixedMultilineTable = detectDiagnosisCandidates({
  documentId: "fixture-multiline-table",
  noteId: "fixture-note",
  sourceBlocks: [{
    type: "table",
    source: { tableIndex: 2, blockIndex: 8 },
    rows: [
      ["DIAGNÓSTICO", "CIE-10"],
      [
        "Esquizofrenia\nTrastorno por consumo perjudicial de múltiples sustancias\nLesión autoinfligida intencionalmente por medios no especificados Trastorno por dependencia a tabaco\nHistoria personal de incumplimiento al tratamiento o régimen médico\nSoporte familiar inadecuado",
        "F20\nF19.1\nX84\nF17.2\nZ91.1\nZ63.2"
      ]
    ]
  }]
});
assert.deepEqual(mixedMultilineTable.map((candidate) => candidate.code), ["F20", "F19.1", "X84", "F17.2", "Z91.1", "Z63.2"]);
assert.deepEqual(mixedMultilineTable.map((candidate) => candidate.diagnosisName), [
  "Esquizofrenia",
  "Trastorno por consumo perjudicial de múltiples sustancias",
  "Lesión autoinfligida intencionalmente por medios no especificados",
  "Trastorno por dependencia a tabaco",
  "Historia personal de incumplimiento al tratamiento o régimen médico",
  "Soporte familiar inadecuado"
]);

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

const multiCodeTable = detectDiagnosisCandidates({
  documentId: "anon-brian",
  noteId: "brian-note-1",
  sourceBlocks: [{
    type: "table",
    source: { tableIndex: 4, blockIndex: 14 },
    rows: [
      ["DIAGNOSTICO", "CIE-10"],
      ["Discapacidad intelectual leve", "F70.1"],
      ["Episodio depresivo grave", "F32.1"],
      ["Intoxicacion aguda a alcohol", "F10.0"],
      ["Lesion autoinfligida por objeto cortante", "X78, S517 + S117"],
      ["Historia personal de autolesiones", "Z91.5"],
      ["Historia personal de incumplimiento", "Z91.1"],
      ["Soporte familiar inadecuado", "Z63.2"]
    ]
  }]
});
assert.equal(multiCodeTable.length, 7);
const injury = multiCodeTable[3];
assert.equal(injury.code, "X78");
assert.deepEqual(injury.codes, ["X78", "S517", "S117"]);
assert.equal(injury.metadata.codeEvidence.length, 3);
assert.deepEqual(multiCodeTable.slice(4).map((candidate) => candidate.code), ["Z91.5", "Z91.1", "Z63.2"]);
const legacyInjury = toLegacyDiagnosisCandidate(injury);
assert.equal(legacyInjury.code, "X78");
assert.deepEqual(legacyInjury.codes, ["X78", "S517", "S117"]);
assert.equal(legacyInjury.codeEvidence.length, 3);

console.log("clinical-document-engine-diagnosis: ok");
