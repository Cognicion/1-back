import assert from "node:assert/strict";
import {
  detectDiagnosisCandidates,
  parseDiagnosisBlock,
  splitDiagnosticCodes
} from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

assert.deepEqual(splitDiagnosticCodes("F43.1F33.2F34.1"), ["F43.1", "F33.2", "F34.1"]);

const tableCandidates = detectDiagnosisCandidates({
  documentId: "maria",
  sections: { diagnosticos: "" },
  sourceBlocks: [{
    type: "table",
    rows: [
      ["Diagnóstico", "CIE-10"],
      ["Trastorno depresivo recurrente, episodio actual grave", "F33.2"],
      ["Alcohol: síndrome de dependencia", "F10.2"],
      ["Obesidad", "E66.9"]
    ],
    source: { tableIndex: 2, blockIndex: 12 }
  }]
});
assert.equal(tableCandidates.length, 3);
assert.equal(tableCandidates[0].diagnosisName, "Trastorno depresivo recurrente, episodio actual grave");
assert.equal(tableCandidates[0].code, "F33.2");
assert.equal(tableCandidates[0].system, "CIE-10");
assert.equal(tableCandidates[1].diagnosisName, "Alcohol: síndrome de dependencia");
assert.equal(tableCandidates[1].code, "F10.2");
assert.notEqual(tableCandidates[1].code, "F33.2");

const columnCandidates = parseDiagnosisBlock({
  text: "Trastorno depresivo\nDistimia\nF33.2\nF34.1",
  explicit: true,
  documentId: "columns"
});
assert.equal(columnCandidates.length, 2);
assert.equal(columnCandidates[0].code, "F33.2");
assert.equal(columnCandidates[1].code, "F34.1");

const unpaired = parseDiagnosisBlock({ text: "Trastorno depresivo | F33.2 | F34.1", explicit: true, documentId: "unsafe" });
assert.equal(unpaired.length, 1);
assert.equal(unpaired[0].code, null);
assert.equal(unpaired[0].requiresReview, true);

const structured = parseDiagnosisBlock({
  text: "DIAGNÓSTICOS DE ACUERDO A CIE-10:\nTrastorno depresivo recurrente, episodio actual grave sin síntomas psicóticos | F33.2\nSE AGREGA\nDistimia | F34.1\nSoporte familiar inadecuado | Z63.2\nCOMENTARIO Y/O ANÁLISIS CLÍNICO\nPaciente femenina en la cuarta década.",
  explicit: true,
  documentId: "structured"
});
assert.equal(structured.length, 3);
assert.deepEqual(structured.map((item) => item.code), ["F33.2", "F34.1", "Z63.2"]);
assert.equal(structured[0].status, "Se agrega");
assert.equal(structured[1].diagnosisName, "Distimia");
assert.doesNotMatch(structured.map((item) => item.diagnosisName).join(" "), /Paciente femenina/);

const bounded = parseDiagnosisBlock({
  text: "DIAGNÓSTICOS | CIE-10\nTrastorno depresivo F43.1F33.2F34.1\nPLAN TERAPÉUTICO\nPaciente femenina en la cuarta década.",
  explicit: true,
  documentId: "bounded"
});
assert.equal(bounded.length, 1);
assert.equal(bounded[0].code, null);
assert.equal(bounded[0].requiresReview, true);

const narrative = parseDiagnosisBlock({
  text: "Cuenta con diagn\u00f3stico de Esquizofrenia otorgado en IMSS Morelos en enero de 2026, con \u00faltimo esquema farmacol\u00f3gico con base en Fluoxetina 60 mg/d\u00eda.",
  section: "analisis",
  explicit: true,
  documentId: "enedina-narrative"
});
assert.equal(narrative.length, 1);
assert.equal(narrative[0].diagnosisName, "Esquizofrenia");
assert.equal(narrative[0].status, "Antecedente");
assert.match(narrative[0].rawText, /Fluoxetina/);
assert.doesNotMatch(narrative[0].diagnosisName, /Fluoxetina/);

const narrativeEvent = parseDiagnosisBlock({
  text: "Se otorgó diagnóstico de Esquizofrenia, egresada por petición familiar debido a altercado con otra usuaria.",
  section: "analisis",
  explicit: true,
  documentId: "narrative-event"
});
assert.equal(narrativeEvent.length, 1);
assert.equal(narrativeEvent[0].diagnosisName, "Esquizofrenia");
assert.doesNotMatch(narrativeEvent[0].diagnosisName, /egresada|petición|altercado/i);
assert.equal(narrativeEvent[0].sourceType, "narrative_history");
assert.match(narrativeEvent[0].sourceSpan.rawText, /egresada/);

const temporalTreatment = parseDiagnosisBlock({
  text: "diagnosticada con depresión en 2022 y tratada con sertralina",
  section: "analisis",
  explicit: true,
  documentId: "narrative-treatment"
});
assert.equal(temporalTreatment[0].diagnosisName, "Depresión");
assert.doesNotMatch(temporalTreatment[0].diagnosisName, /sertralina|2022/i);

const narrativeVariants = parseDiagnosisBlock({
  text: "Antecedente de trastorno bipolar diagnosticado en 2022, actualmente tratado con litio\nCon diagn\u00f3stico previo de TDAH desde la infancia\nTEPT complejo a descartar",
  section: "diagnosticos",
  explicit: true,
  documentId: "narrative-variants"
});
assert.equal(narrativeVariants.length, 3);
assert.equal(narrativeVariants[0].diagnosisName, "Trastorno bipolar");
assert.equal(narrativeVariants[0].status, "Antecedente");
assert.equal(narrativeVariants[1].diagnosisName, "TDAH");
assert.equal(narrativeVariants[1].status, "Antecedente");
assert.equal(narrativeVariants[2].diagnosisName, "TEPT complejo");
assert.equal(narrativeVariants[2].status, "A descartar");

const codedNarrative = parseDiagnosisBlock({
  text: "Trastorno depresivo recurrente, episodio actual grave F33.2",
  section: "diagnosticos",
  explicit: true,
  documentId: "coded-narrative"
});
assert.equal(codedNarrative[0].diagnosisName, "Trastorno depresivo recurrente, episodio actual grave");
assert.equal(codedNarrative[0].code, "F33.2");

const deduplicated = detectDiagnosisCandidates({
  documentId: "dedup",
  sections: {
    diagnosticos: "Esquizofrenia F20",
    analisis: "Cuenta con diagnóstico de Esquizofrenia otorgado previamente."
  }
});
assert.equal(deduplicated.filter((item) => item.normalizedDiagnosisName === "esquizofrenia").length, 1);
assert.equal(deduplicated[0].code, "F20");
assert.equal(deduplicated[0].sourceType, "structured_diagnosis");

console.log("patient-transfer-diagnosis-parser: ok");
