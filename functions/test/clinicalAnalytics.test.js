const assert = require("assert");
const { calculateEmpiricalProbability, wilsonInterval } = require("../clinicalAnalytics/probabilityEngine");
const { extractClinicalVariables } = require("../clinicalAnalytics/variableExtractor");
const { analyzePatientTimeline } = require("../clinicalAnalytics/timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("../clinicalAnalytics/patternAnalyzer");
const { analyticsPatientId, globalVariable, stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const { patientAllowsProfessionalAccess, isProfessional } = require("../clinicalAnalytics/access");
const { deduplicateClinicalNotes } = require("../clinicalAnalytics/contextBuilder");

const probability = calculateEmpiricalProbability({ numerator: 25, denominator: 100 });
assert.strictEqual(probability.probability, 0.25);
assert.strictEqual(probability.numerator, 25);
assert.strictEqual(probability.denominator, 100);
assert.strictEqual(probability.insufficientEvidence, false);
assert.ok(wilsonInterval(25, 100).lower < 0.25 && wilsonInterval(25, 100).upper > 0.25);
assert.strictEqual(calculateEmpiricalProbability({ numerator: 2, denominator: 4 }).insufficientEvidence, true);

const variables = extractClinicalVariables({
  patient: { edad: 34, sexo: "F" },
  records: { notasMedicas: [{ id: "note-1", texto: "Niega ideación suicida; presenta insomnio e irritabilidad.", fecha: "2026-01-01" }] }
});
assert.ok(variables.some((variable) => variable.variableId === "suicidal_ideation" && variable.value === false), "La negación no debe convertirse en presencia positiva");
assert.ok(variables.some((variable) => variable.variableId === "insomnia" && variable.value === true));
const timeline = analyzePatientTimeline(variables);
assert.ok(Array.isArray(detectPatientPatterns(timeline)));
assert.ok(Array.isArray(buildObservationalRelationships(timeline)));

const hashed = analyticsPatientId("patient-real-id");
assert.notStrictEqual(hashed, "patient-real-id");
const safe = stripIdentifiers({ name: "Ana", email: "ana@example.com", nested: { phone: "555" }, symptom: "insomnia" });
assert.deepStrictEqual(safe, { nested: {}, symptom: "insomnia" });
const safeTreatment = globalVariable({
  variableId: "treatment",
  canonicalName: "tratamiento",
  domain: "treatment",
  datatype: "object",
  statisticalType: "categorical",
  observedAt: "2026-01-15T12:30:00.000Z",
  value: { medication: "Texto libre identificable de Nombre Privado", dose: "dato privado" },
  provenance: { sourceField: "medicamento", sourceRecordType: "tratamientos", extractedAt: "2026-01-15T12:31:00.000Z" }
});
assert.ok(!JSON.stringify(safeTreatment).includes("Nombre Privado"));
assert.strictEqual(safeTreatment.observedAt, "2026-01");
assert.strictEqual(isProfessional({ rol: "medico" }), true);
assert.strictEqual(patientAllowsProfessionalAccess({ rol: "paciente", medicoTratanteUid: "doctor-1" }, "doctor-1"), true);
assert.strictEqual(patientAllowsProfessionalAccess({ rol: "paciente", medicoTratanteUid: "doctor-1" }, "doctor-2"), false);
const notes = deduplicateClinicalNotes([
  { id: "legacy-note", _recordType: "notas", _sourceRoot: "usuarios", fecha: "2026-08-20", texto: "Seguimiento clínico sin cambios." },
  { id: "canonical-note", _recordType: "notasMedicas", _sourceRoot: "usuarios", fecha: "2026-08-20", texto: "Seguimiento clínico sin cambios." }
]);
assert.strictEqual(notes.length, 1, "La misma nota no debe alimentar dos veces la analítica");
assert.strictEqual(notes[0].id, "canonical-note", "notasMedicas tiene prioridad sobre la fuente legacy");
console.log("clinicalAnalytics.test.js: ok");
