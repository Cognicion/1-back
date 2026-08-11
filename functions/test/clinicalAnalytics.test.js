const assert = require("assert");
const { calculateEmpiricalProbability, wilsonInterval } = require("../clinicalAnalytics/probabilityEngine");
const { extractClinicalVariables } = require("../clinicalAnalytics/variableExtractor");
const { analyzePatientTimeline } = require("../clinicalAnalytics/timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("../clinicalAnalytics/patternAnalyzer");
const { analyticsPatientId, stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const { patientAllowsProfessionalAccess, isProfessional } = require("../clinicalAnalytics/access");

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
assert.strictEqual(isProfessional({ rol: "medico" }), true);
assert.strictEqual(patientAllowsProfessionalAccess({ medicoTratanteUid: "doctor-1" }, "doctor-1"), true);
assert.strictEqual(patientAllowsProfessionalAccess({ medicoTratanteUid: "doctor-1" }, "doctor-2"), false);
console.log("clinicalAnalytics.test.js: ok");
