import assert from "node:assert/strict";
import { detectDiagnosisCandidates, detectTreatmentCandidates, extractClinicalCandidates, splitMedicationItems, parseClinicalQuantity, parseMedicationStrength, parseMedicationSchedules } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

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

assert.equal(parseClinicalQuantity("½"), 0.5);
assert.equal(parseClinicalQuantity("1/2"), 0.5);
assert.deepEqual(parseMedicationStrength("jarabe 10g/15ml"), {
  strengthValue: 10,
  strengthUnit: "g",
  strengthPerValue: 15,
  strengthPerUnit: "ml",
  rawStrength: "10g/15ml"
});

const anaMedicationText = "a. CLONAZEPAM tabletas 2 mg via oral. 2 veces al dia. Tomar ½ tableta a las 08:00h y 1 tableta a las 22:00h b. Duloxetina capsulas 60 mg. Tomar via oral 1 vez al dia. Tomar 2 capsulas a las 08:00 c. Plantago Psyllium polvo. Administrar via oral 1 vez al dia. 1 cucharada disuelta en 1 vaso de agua a las 8 horas d. Lactulosa jarabe 10g/15ml. Administrar via oral 2 veces al dia. 10ml a las 008h y 10ml a las 15h";
const splitAnaMedicationItems = splitMedicationItems(anaMedicationText);
assert.equal(splitAnaMedicationItems.length, 4);
assert.equal(parseMedicationSchedules("Tomar ½ tableta a las 08:00h y 1 tableta a las 22:00h")[0].quantity, 0.5);
assert.equal(parseMedicationSchedules("Tomar 1 de tableta a las 22:00h")[0].administrationUnit, "tableta");
assert.equal(parseMedicationSchedules("10ml a las 008h y 10ml a las 15h")[0].time, "08:00");

const anaTreatments = detectTreatmentCandidates({ sections: { medicamentos: anaMedicationText }, documentId: "ana", date: "2026-07-31" });
const clonazepam = anaTreatments.find((item) => item.medicationName.toLowerCase() === "clonazepam");
const duloxetina = anaTreatments.find((item) => item.medicationName.toLowerCase() === "duloxetina");
const plantago = anaTreatments.find((item) => item.medicationName.toLowerCase() === "plantago psyllium");
const lactulosa = anaTreatments.find((item) => item.medicationName.toLowerCase() === "lactulosa");
assert.equal(clonazepam.presentation, "tabletas");
assert.equal(clonazepam.strengthValue, 2);
assert.equal(clonazepam.strengthUnit, "mg");
assert.equal(clonazepam.route, "oral");
assert.equal(clonazepam.frequencyRaw, "2 veces al dia");
assert.deepEqual(clonazepam.schedule.map(({ time, quantity, administrationUnit }) => ({ time, quantity, administrationUnit })), [
  { time: "08:00", quantity: 0.5, administrationUnit: "tableta" },
  { time: "22:00", quantity: 1, administrationUnit: "tableta" }
]);
assert.equal(duloxetina.presentation, "capsulas");
assert.equal(duloxetina.strengthValue, 60);
assert.equal(duloxetina.administrationQuantity, 2);
assert.equal(duloxetina.schedule[0].time, "08:00");
assert.equal(plantago.presentation, "polvo");
assert.equal(plantago.administrationUnit, "cucharada");
assert.equal(plantago.schedule[0].time, "08:00");
assert.equal(lactulosa.strengthValue, 10);
assert.equal(lactulosa.strengthUnit, "g");
assert.equal(lactulosa.strengthPerValue, 15);
assert.equal(lactulosa.strengthPerUnit, "ml");
assert.deepEqual(lactulosa.schedule.map((item) => item.time), ["08:00", "15:00"]);
assert.deepEqual(lactulosa.schedule.map((item) => item.quantity), [10, 10]);

const changedPresentation = detectTreatmentCandidates({ sections: { tratamiento: "Duloxetina capsulas 60 mg CAMBIA PRESENTACION" } })[0];
assert.equal(changedPresentation.action, "Cambia presentación");
assert.equal(changedPresentation.medicationName, "Duloxetina");
const historical = detectTreatmentCandidates({ sections: { subjetivo: "Recibió clonazepam previamente." } })[0];
assert.equal(historical.action, "Antecedente");
assert.equal(historical.strengthValue, null);
assert.deepEqual(historical.schedule, []);

console.log("patient-transfer-clinical-candidates.test.mjs OK");
