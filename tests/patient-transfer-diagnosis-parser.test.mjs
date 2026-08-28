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

const versusDifferential = parseDiagnosisBlock({
  text: "PROBABLE Trastorno por estr\u00e9s postraum\u00e1tico complejo vs Trastorno de la personalidad emocionalmente inestable A DESCARTAR",
  section: "diagnosticos",
  explicit: true,
  documentId: "versus-differential"
});
assert.deepEqual(versusDifferential.map((item) => item.diagnosisName), [
  "Trastorno por estr\u00e9s postraum\u00e1tico complejo",
  "Trastorno de la personalidad emocionalmente inestable"
]);
assert.deepEqual(versusDifferential.map((item) => item.status), ["Probable", "Probable"]);
assert.ok(versusDifferential.every((item) => /\bvs\b/i.test(item.rawText)), "cada alternativa conserva la fuente diferencial completa");

const versusDifferentialFromTable = detectDiagnosisCandidates({
  documentId: "versus-differential-table",
  sections: { diagnosticos: "" },
  sourceBlocks: [{
    type: "table",
    rows: [[
      "PROBABLE Trastorno por estr\u00e9s postraum\u00e1tico complejo vs Trastorno de la personalidad emocionalmente inestable A DESCARTAR",
      "F43.1"
    ]],
    source: { tableIndex: 4, blockIndex: 9 }
  }]
});
assert.equal(versusDifferentialFromTable.length, 2);
assert.deepEqual(versusDifferentialFromTable.map((item) => item.code), ["F43.1", null]);
assert.deepEqual(versusDifferentialFromTable.map((item) => item.statusSuggestion), ["Probable", "Probable"]);

const multiDiagnosisCell = detectDiagnosisCandidates({
  documentId: "multi-diagnosis-cell",
  sections: { diagnosticos: "" },
  sourceBlocks: [{
    type: "table",
    rows: [[
      [
        "PROBABLE Trastorno por estrés postraumático complejo vs Trastorno de la personalidad emocionalmente inestable A DESCARTAR",
        "PROBABLE Discapacidad intelectual leve",
        "Distimia",
        "Dependencia a la nicotina",
        "Historia personal de lesiones autoinfligidas",
        "Síndrome de ovario poliquístico"
      ].join("\n"),
      "F43.1"
    ]],
    source: { tableIndex: 5, blockIndex: 10 }
  }]
});
assert.deepEqual(multiDiagnosisCell.map((item) => item.diagnosisName), [
  "Trastorno por estrés postraumático complejo",
  "Trastorno de la personalidad emocionalmente inestable",
  "Discapacidad intelectual leve",
  "Distimia",
  "Dependencia a la nicotina",
  "Historia personal de lesiones autoinfligidas",
  "Síndrome de ovario poliquístico"
]);
assert.deepEqual(multiDiagnosisCell.slice(0, 3).map((item) => item.statusSuggestion), ["Probable", "Probable", "Probable"]);
assert.equal(multiDiagnosisCell[0].code, "F43.1");
assert.ok(multiDiagnosisCell.slice(1).every((item) => item.diagnosisName.length < 80), "las entradas sin código siguen separadas y revisables");

const versusVariants = parseDiagnosisBlock({
  text: "F43.1 Trastorno por estr\u00e9s postraum\u00e1tico vs. F60.3 Trastorno de la personalidad emocionalmente inestable\nTrastorno bipolar versus Trastorno depresivo recurrente",
  section: "diagnosticos",
  explicit: true,
  documentId: "versus-variants"
});
assert.equal(versusVariants.length, 4);
assert.deepEqual(versusVariants.slice(0, 2).map((item) => item.code), ["F43.1", "F60.3"]);
assert.ok(versusVariants.every((item) => item.status === "Probable"));

const narrativeComparisonIsNotDifferential = parseDiagnosisBlock({
  text: "Se compar\u00f3 respuesta cl\u00ednica vs. control ambulatorio",
  section: "diagnosticos",
  explicit: true,
  documentId: "versus-narrative-negative"
});
assert.equal(narrativeComparisonIsNotDifferential.length, 1);
assert.equal(narrativeComparisonIsNotDifferential[0].diagnosisName, "Se compar\u00f3 respuesta cl\u00ednica vs. control ambulatorio");
assert.equal(narrativeComparisonIsNotDifferential[0].status, "Confirmado", "una comparaci\u00f3n narrativa no se transforma en diferencial probable");

const codedNarrative = parseDiagnosisBlock({
  text: "Trastorno depresivo recurrente, episodio actual grave F33.2",
  section: "diagnosticos",
  explicit: true,
  documentId: "coded-narrative"
});
assert.equal(codedNarrative[0].diagnosisName, "Trastorno depresivo recurrente, episodio actual grave");
assert.equal(codedNarrative[0].code, "F33.2");

const treatmentNarrativesAreNotDiagnoses = parseDiagnosisBlock({
  text: [
    "Mujer adulta, con seguimiento por ginecología y dermatología, actualmente estable.",
    "Actualmente bajo tratamiento con Medicamento Alfa 100 mg/día y Medicamento Beta 1 mg/día.",
    "Medicación psiquiátrica previa con esquema farmacológico no vigente."
  ].join("\n"),
  section: "diagnosticos",
  explicit: true,
  documentId: "treatment-is-not-diagnosis"
});
assert.deepEqual(treatmentNarrativesAreNotDiagnoses, []);

const diagnosisWithTreatmentContext = parseDiagnosisBlock({
  text: "Antecedente de trastorno bipolar diagnosticado en 2022, actualmente tratado con Medicamento Gamma 300 mg",
  section: "diagnosticos",
  explicit: true,
  documentId: "diagnosis-with-treatment-context"
});
assert.equal(diagnosisWithTreatmentContext.length, 1);
assert.equal(diagnosisWithTreatmentContext[0].diagnosisName, "Trastorno bipolar");

const productionLikeNarrativesWithDocxPrefixes = detectDiagnosisCandidates({
  documentId: "docx-list-prefixes-are-not-diagnoses",
  sections: {
    diagnosticos: [
      "- Mujer de 27 años de edad, con seguimiento por especialidades y bajo tratamiento médico.",
      "• Medicación psiquiátrica previa",
      "3) Actualmente bajo tratamiento con Medicamento Delta 100 mg/día."
    ].join("\n")
  }
});
assert.deepEqual(productionLikeNarrativesWithDocxPrefixes, []);

const treatmentWithDiagnosticStatusIsNotDiagnosis = parseDiagnosisBlock({
  text: [
    "- Mujer de 27 años con seguimiento por especialidades ANTECEDENTE",
    "- Medicación psiquiátrica previa ANTECEDENTE"
  ].join("\n"),
  section: "diagnosticos",
  explicit: true,
  documentId: "treatment-with-status"
});
assert.deepEqual(treatmentWithDiagnosticStatusIsNotDiagnosis, []);

const subjectiveAntecedentNarrativesAreNotDiagnoses = detectDiagnosisCandidates({
  documentId: "subjective-antecedents-are-not-diagnoses",
  sections: {
    subjetivo: [
      "Paciente adulta con antecedente de seguimiento por varias especialidades y evolución estable.",
      "Antecedente de tratamiento farmacológico actualmente suspendido.",
      "Se considera probable mejoría clínica con vigilancia ambulatoria."
    ].join("\n")
  }
});
assert.deepEqual(subjectiveAntecedentNarrativesAreNotDiagnoses, []);

const substanceHistoryOutsideDiagnosisSectionIsNotDiagnosis = detectDiagnosisCandidates({
  documentId: "substance-history-is-not-diagnosis",
  sections: {
    subjetivo: "Antecedente de consumo ocasional de alcohol, actualmente suspendido."
  }
});
assert.deepEqual(substanceHistoryOutsideDiagnosisSectionIsNotDiagnosis, []);

const embeddedNarrativeDiagnosisRemainsDetected = detectDiagnosisCandidates({
  documentId: "embedded-narrative-diagnosis",
  sections: {
    subjetivo: "Paciente adulta que cuenta con diagnóstico de trastorno bipolar, actualmente en seguimiento ambulatorio."
  }
});
assert.equal(embeddedNarrativeDiagnosisRemainsDetected.length, 1);
assert.equal(embeddedNarrativeDiagnosisRemainsDetected[0].diagnosisName, "Trastorno bipolar");

const codeLikeTextOutsideDiagnosisContextIsIgnored = detectDiagnosisCandidates({
  documentId: "code-like-nondiagnostic-text",
  sections: {
    examenMental: "Escala A123 aplicada durante la entrevista clínica."
  }
});
assert.deepEqual(codeLikeTextOutsideDiagnosisContextIsIgnored, []);

const prefixedRealDiagnosesRemainDetected = parseDiagnosisBlock({
  text: [
    "- Trastorno depresivo recurrente, episodio actual grave F33.2",
    "• Antecedente de trastorno bipolar diagnosticado en 2022"
  ].join("\n"),
  section: "diagnosticos",
  explicit: true,
  documentId: "prefixed-real-diagnoses"
});
assert.equal(prefixedRealDiagnosesRemainDetected.length, 2);
assert.equal(prefixedRealDiagnosesRemainDetected[0].code, "F33.2");
assert.equal(prefixedRealDiagnosesRemainDetected[1].diagnosisName, "Trastorno bipolar");
assert.equal(prefixedRealDiagnosesRemainDetected[1].status, "Antecedente");

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

const diagnosesFromFlattenedHospitalTable = detectDiagnosisCandidates({
  documentId: "fixture-flattened-hospital-table",
  sourceBlocks: [{
    type: "table",
    rows: [[
      [
        "Esquizofrenia",
        "Trastorno por consumo perjudicial de múltiples sustancias (alcohol, tabaco, solventes, cannabis)",
        "Lesión autointligida intencionalmente por medios no especificados Trastomo por dependencia a tabaco",
        "Historia personal de incumplimiento al tratamiento o régimen médico",
        "Soporte familiar inadecuado"
      ].join("\n"),
      ["F20", "F19.1", "X84", "F17.2", "Z91.1", "Z63.2"].join("\n")
    ]],
    source: { tableIndex: 1, blockIndex: 2 }
  }]
});

assert.deepEqual(
  diagnosesFromFlattenedHospitalTable.map(({ diagnosisName, code }) => [diagnosisName, code]),
  [
    ["Esquizofrenia", "F20"],
    ["Trastorno por consumo perjudicial de múltiples sustancias (alcohol, tabaco, solventes, cannabis)", "F19.1"],
    ["Lesión autoinfligida intencionalmente por medios no especificados", "X84"],
    ["Trastorno por dependencia a tabaco", "F17.2"],
    ["Historia personal de incumplimiento al tratamiento o régimen médico", "Z91.1"],
    ["Soporte familiar inadecuado", "Z63.2"]
  ],
  "la errata y la ausencia de salto entre X84/F17.2 no deben perder diagnósticos ni desalinear códigos"
);

console.log("patient-transfer-diagnosis-parser: ok");
