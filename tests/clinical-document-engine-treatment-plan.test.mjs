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

const iterations = 100;
const started = performance.now();
for (let i = 0; i < iterations; i += 1) parseTreatmentPlan({ text: source, documentId: "perf", noteId: String(i), sourceHeading: "PLAN TERAPÉUTICO" });
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ test: "treatment-plan-performance", iterations, elapsedMs: Number(elapsedMs.toFixed(2)), entities: result.candidates.length, delegatedMedications: result.medicationCandidates.length }));
console.log("clinical-document-engine-treatment-plan: ok");
