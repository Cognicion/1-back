import assert from "node:assert/strict";
import { detectDiagnosisCandidates, detectTreatmentCandidates, extractClinicalCandidates } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

const document = {
  id: "doc-test",
  sections: {
    diagnosticos: [
      "CIE-10 F29 Psicosis no organica no especificada",
      "Antecedente de enfermedad de Parkinson",
      "A descartar delirium"
    ].join("\n"),
    tratamiento: [
      "Se inicio quetiapina 37.5 mg/dia via oral por la noche",
      "Se suspendio risperidona 1 mg al dia",
      "Niega uso de clonazepam"
    ].join("\n")
  }
};

const result = extractClinicalCandidates(document);

assert.equal(result.diagnoses.length, 3, "detecta diagnosticos solo desde seccion explicita");
assert.equal(result.diagnoses[0].code, "F29");
assert.equal(result.diagnoses[0].codingSystem, "CIE-10");
assert.equal(result.diagnoses[1].statusSuggestion, "Antecedente");
assert.equal(result.diagnoses[2].statusSuggestion, "A descartar");

assert.equal(result.treatments.length, 2, "no convierte tratamiento negado en activo");
assert.equal(result.treatments[0].medicationName.toLowerCase(), "quetiapina");
assert.equal(result.treatments[0].dose, "37.5");
assert.equal(result.treatments[0].doseUnit.toLowerCase(), "mg");
assert.equal(result.treatments[0].statusSuggestion, "Inicia");
assert.equal(result.treatments[1].statusSuggestion, "Suspende");

const narrativeDiagnoses = detectDiagnosisCandidates({
  documentId: "ana",
  sections: { subjetivo: "Cuenta con diagnóstico de trastorno depresivo diagnosticada en 2022. Probable trastorno bipolar. A descartar trastorno psicótico. Niega antecedente de esquizofrenia." }
});
assert.equal(narrativeDiagnoses.length, 4, "detecta frases diagnósticas sin sección Diagnósticos");
assert.equal(narrativeDiagnoses[0].statusSuggestion, "Antecedente");
assert.equal(narrativeDiagnoses[1].statusSuggestion, "Probable");
assert.equal(narrativeDiagnoses[2].statusSuggestion, "A descartar");
assert.equal(narrativeDiagnoses[3].negated, true);

const codeCandidates = detectDiagnosisCandidates({ fullText: "CIE-10: F32.2 Episodio depresivo grave\nCIE-11: 6A70 Trastorno depresivo" });
assert.equal(codeCandidates[0].code, "F32.2");
assert.equal(codeCandidates[1].codingSystem, "CIE-11");

const medications = detectTreatmentCandidates({
  sections: { subjetivo: "Recibió clonazepam, paroxetina y lamotrigina. Se inició sertralina 50 mg cada 24 horas." }
});
assert.equal(medications.length, 4, "separa listas farmacológicas y medicamento con dosis");
assert.equal(medications.filter((item) => item.statusSuggestion === "Antecedente").length, 3);
assert.equal(medications.find((item) => item.medicationName.toLowerCase() === "sertralina")?.dose, "50");

console.log("patient-transfer-clinical-candidates.test.mjs OK");
