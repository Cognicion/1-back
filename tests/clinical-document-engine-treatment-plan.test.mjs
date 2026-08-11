import assert from "node:assert/strict";
import {
  parseTreatmentPlan,
  splitTreatmentPlanItems,
  adaptTreatmentPlan,
  validateTreatmentPlanCandidates
} from "../js/modules/clinical-document-engine/index.js";

const source = `PLAN TERAPÉUTICO
1. Dieta alta en fibra con líquidos a libre demanda
2. Cuidados generales de enfermería
3. Signos vitales por turno
4. Vigilancia estrecha por riesgo suicida
5. Conducta autolesiva
6. Riesgo de caída: bajo
7. Alergias: látex
8. Medicamentos a. Sertralina tabletas 50 mg vía oral 1 vez al día 1 tableta a las 08:00
b. Pregabalina cápsulas 75 mg vía oral una vez al día 1 cápsula a las 22:00
9. Solicitar BH y QS
10. Valoración por Psicología
11. Psicoterapia individual
12. Seguimiento en consulta externa
COMENTARIO Y/O ANÁLISIS CLÍNICO
Paciente estable.`;

const split = splitTreatmentPlanItems("5. Alergias: negadas 6. Medicamentos a. Sertralina 50 mg");
assert.equal(split.length, 2);
assert.match(split[1], /Medicamentos/);

const result = parseTreatmentPlan({
  text: source,
  documentId: "anon-doc",
  noteId: "anon-note",
  date: "31/07/2026",
  sourceHeading: "PLAN TERAPÉUTICO"
});

assert.equal(result.bounded.boundary?.alias, "comentario");
assert.ok(result.candidates.length >= 9);
assert.ok(result.candidates.some((item) => item.instructionType === "diet"));
assert.ok(result.candidates.some((item) => item.instructionType === "suicideRiskPrecautions"));
assert.ok(result.candidates.some((item) => item.instructionType === "fallRisk" && item.normalizedValue === "low"));
assert.ok(result.candidates.every((item) => item.candidateType === "treatmentPlanInstruction"));
assert.ok(result.candidates.every((item) => item.evidence?.[0]?.documentId === "anon-doc"));
assert.ok(result.medicationCandidates.some((item) => item.medicationName === "Sertralina"));
assert.ok(result.medicationCandidates.some((item) => item.medicationName === "Pregabalina"));
assert.equal(validateTreatmentPlanCandidates(result.candidates).valid, true);

const adapted = adaptTreatmentPlan({ text: source, documentId: "anon-doc", noteId: "anon-note", sourceHeading: "PLAN TERAPÉUTICO" });
assert.equal(adapted.instructions.length, result.candidates.length);
assert.equal(adapted.instructions[0].entityType, "treatmentPlanInstruction");
assert.ok(adapted.instructions.every((item) => item.evidence.rawText));

const brianMedicationPlan = `6. MEDICAMENTOS:
a. OLANZAPINA 10 mg tabletas. Tomar 1 vez al dia. Tomar 1 tableta por via oral a las 22 horas
b. Sertralina 50 mg tabletas. Tomar 1 veces al dia. Tomar 1 tableta a las 08 horas
c. Paracetamol 500 mg tabletas. Administrar via oral, 3 veces al dia:
   - 1 tableta 08:00
   - 1 tableta a las 15:00
   - 1 tableta a las 22:00 h
7. Reportar eventualidades.`;
const brianMedicationResult = parseTreatmentPlan({ text: brianMedicationPlan, documentId: "brian", noteId: "brian-note", date: "04/08/2026" });
assert.deepEqual(brianMedicationResult.medicationCandidates.map((item) => item.medicationName), ["Olanzapina", "Sertralina", "Paracetamol"]);
assert.equal(brianMedicationResult.medicationCandidates[0].strength, 10);
assert.equal(brianMedicationResult.medicationCandidates[0].route, "oral");
assert.equal(brianMedicationResult.medicationCandidates[0].frequencyRaw, "1 vez al dia");
assert.equal(brianMedicationResult.medicationCandidates[1].frequencyRaw, "1 vez al dia");
assert.equal(brianMedicationResult.medicationCandidates[2].strength, 500);
assert.equal(brianMedicationResult.medicationCandidates[2].schedule.length, 3);
assert.ok(brianMedicationResult.medicationCandidates.every((item) => !/reportar eventualidades/i.test(item.metadata.rawMedicationText)));
const brianMedicationAdapted = adaptTreatmentPlan({ text: brianMedicationPlan, documentId: "brian", noteId: "brian-note", date: "04/08/2026" });
assert.deepEqual(brianMedicationAdapted.medicationCandidates.map((item) => item.medicationName), ["Olanzapina", "Sertralina", "Paracetamol"]);
assert.deepEqual(brianMedicationAdapted.medicationCandidates.map((item) => item.schedule.length), [1, 1, 3]);

const brianConsumedMedicationHeading = `Dieta: Normal
Cuidados generales de enfermería
Toma de signos vitales por turno
RIESGO SUICIDA / RIESGO AUTOLESIONES (COLOCAR BRAZALETE AMARILLO)
Riesgo de caída: BAJO
ALERGIAS: Negadas
(En caso de no aceptar, favor de administrar molidos y diluidos en agua con jeringa sin aguja).
OLANZAPINA 10 mg tabletas. Tomar 1 vez al día. Tomar 1 tableta por vía oral a las 22 horas
Sertralina 50 mg tabletas. Tomar 1 veces al día. Tomar 1 de tableta a las 08 horas
Paracetamol 500 mg tabletas. Administrar vía oral, 3 veces al día 1 tableta 08:00, 1 tableta a las 15:00 y 1 tableta a las 22:00 h (0/3)
7. Reportar eventualidades. - GRACIAS :)`;
const brianConsumedHeadingResult = parseTreatmentPlan({ text: brianConsumedMedicationHeading, documentId: "brian-consumed", noteId: "brian-consumed-note", date: "04/08/2026" });
assert.deepEqual(brianConsumedHeadingResult.medicationCandidates.map((item) => item.medicationName), ["Olanzapina", "Sertralina", "Paracetamol"]);
assert.deepEqual(brianConsumedHeadingResult.medicationCandidates.map((item) => item.schedule.length), [1, 1, 3]);
assert.ok(brianConsumedHeadingResult.medicationCandidates.every((item) => !/reportar eventualidades/i.test(item.metadata.rawMedicationText)));

const hierarchy = parseTreatmentPlan({
  text: "3. Vigilancia estrecha por:\n   a. Riesgo suicida\n   b. Alucinaciones auditivas imperativas\n4. Precauciones especiales:\n   a. CaÃ­das\n   b. BroncoaspiraciÃ³n\n5. Alergias: NEGADAS\n6. )"
});
assert.equal(hierarchy.candidates.length, 3);
assert.equal(hierarchy.candidates[0].instructionType, "monitoring");
assert.equal(hierarchy.candidates[0].children.length, 2);
assert.match(hierarchy.candidates[0].text, /Riesgo suicida/);
assert.equal(hierarchy.candidates.filter((item) => /Alucinaciones|Riesgo suicida/.test(item.text)).length, 1);
assert.ok(hierarchy.candidates.some((item) => item.instructionType === "allergies" && /NEGADAS/i.test(item.text)));
assert.ok(hierarchy.candidates.every((item) => item.text !== ")"));

const valproate = parseTreatmentPlan({
  text: "1. Valproato de magnesio tabletas 200 mg, tomar 2 tabletas via oral una vez al dia 22:00"
});
assert.equal(valproate.medicationCandidates.length, 1);
assert.equal(valproate.medicationCandidates[0].medicationName, "Valproato de magnesio");
assert.equal(typeof valproate.medicationCandidates[0].metadata.sourceSpan.itemIndex, "number");
assert.equal(valproate.candidates.filter((item) => /valproato/i.test(item.text)).length, 0);

const iterations = 100;
const started = performance.now();
for (let i = 0; i < iterations; i += 1) parseTreatmentPlan({ text: source, documentId: "perf", noteId: String(i), sourceHeading: "PLAN TERAPÉUTICO" });
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ test: "treatment-plan-performance", iterations, elapsedMs: Number(elapsedMs.toFixed(2)), entities: result.candidates.length, delegatedMedications: result.medicationCandidates.length }));
console.log("clinical-document-engine-treatment-plan: ok");
