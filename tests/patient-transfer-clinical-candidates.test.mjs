import assert from "node:assert/strict";
import { extractClinicalCandidates } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

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
assert.equal(result.treatments[0].medicationName, "quetiapina");
assert.equal(result.treatments[0].dose, "37.5");
assert.equal(result.treatments[0].doseUnit.toLowerCase(), "mg");
assert.equal(result.treatments[0].statusSuggestion, "Inicia");
assert.equal(result.treatments[1].statusSuggestion, "Suspende");

console.log("patient-transfer-clinical-candidates.test.mjs OK");
