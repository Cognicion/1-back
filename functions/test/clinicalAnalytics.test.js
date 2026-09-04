const assert = require("assert");
const { calculateEmpiricalProbability, wilsonInterval } = require("../clinicalAnalytics/probabilityEngine");
const { extractClinicalVariables } = require("../clinicalAnalytics/variableExtractor");
const { analyzePatientTimeline } = require("../clinicalAnalytics/timelineAnalyzer");
const { detectPatientPatterns, buildObservationalRelationships } = require("../clinicalAnalytics/patternAnalyzer");
const { analyticsPatientId, globalVariable, stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const { patientAllowsProfessionalAccess, isProfessional } = require("../clinicalAnalytics/access");
const {
  deduplicateClinicalNotes,
  deduplicateLaboratoryRecords,
  rootClinicalParameterRecords
} = require("../clinicalAnalytics/contextBuilder");
const { buildPatientFeatureProfile } = require("../clinicalAnalytics/patientFeatureProfile");

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

const laboratoryRecords = deduplicateLaboratoryRecords([
  { id: "legacy-creatinine", _sourceRoot: "pacientes", analito: "Creatinina", valor: 1, unidad: "mg/dL", fecha: "2026-08-21" },
  { id: "canonical-creatinine", _sourceRoot: "usuarios", analyteId: "creatinina", valor: 1, unidad: "mg/dL", fecha: "2026-08-21" },
  { id: "albumin", _sourceRoot: "usuarios", analyteId: "albumina", valor: 4, unidad: "g/dL", fecha: "2026-08-21" }
]);
assert.strictEqual(laboratoryRecords.length, 2, "Un mismo resultado replicado entre raíces no debe contarse dos veces");
assert.ok(laboratoryRecords.some((record) => record.id === "canonical-creatinine"), "usuarios tiene prioridad cuando el resultado clínico es equivalente");
assert.ok(laboratoryRecords.some((record) => record.id === "albumin"), "Analitos distintos deben permanecer separados");

const projectedParameters = rootClinicalParameterRecords({
  parametrosClinicos: {
    fechaMuestra: "2026-08-22",
    valores: {
      creatinina: { valor: 0.9, unidad: "mg/dL" },
      albumina: { valor: 4.2, unidad: "g/dL" }
    }
  }
});
assert.strictEqual(projectedParameters.length, 2, "Los parámetros versionados del expediente deben alimentar la analítica");
assert.ok(projectedParameters.every((record) => record._sourceContainer === "patientProfile.parametrosClinicos"));

const laboratoryProfile = buildPatientFeatureProfile({
  variables: [],
  timeline: [],
  context: { records: { laboratorios: laboratoryRecords } }
});
const creatinineMean = laboratoryProfile.features.find((feature) => feature.featureId === "structured.laboratorios.analito_creatinina_unidad_mg_dl_valor.mean");
const albuminMean = laboratoryProfile.features.find((feature) => feature.featureId === "structured.laboratorios.analito_albumina_unidad_g_dl_valor.mean");
assert.strictEqual(creatinineMean?.value, 1, "La creatinina debe agregarse solo con la misma identidad y unidad");
assert.strictEqual(albuminMean?.value, 4, "La albúmina debe conservar su propia serie analítica");
assert.ok(!laboratoryProfile.features.some((feature) => feature.featureId === "structured.laboratorios.valor.mean"), "No se deben promediar analitos heterogéneos");

const twelveAnalytes = [
  ["creatinina", "mg/dL", 1], ["eGFR", "mL/min/1.73 m²", 90], ["uacr", "mg/g", 10],
  ["sodio", "mmol/L", 140], ["potasio", "mmol/L", 4], ["cloro", "mmol/L", 102],
  ["bicarbonato", "mmol/L", 24], ["magnesio", "mg/dL", 2], ["calcio", "mg/dL", 9],
  ["proteinasTotales", "g/dL", 7], ["albumina", "g/dL", 4], ["globulinas", "g/dL", 3]
].map(([analyteId, unidad, valor]) => ({ analyteId, unidad, valor }));
const allAnalytesProfile = buildPatientFeatureProfile({
  variables: [],
  timeline: [],
  context: { records: { laboratorios: twelveAnalytes } }
});
twelveAnalytes.forEach(({ analyteId, unidad, valor }) => {
  const analito = analyteId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const unit = unidad.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const featureId = `structured.laboratorios.analito_${analito}_unidad_${unit}_valor.mean`;
  assert.strictEqual(allAnalytesProfile.features.find((feature) => feature.featureId === featureId)?.value, valor, featureId);
});

const noisyStructuredFields = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`campo_${index}`, index + 1]));
const cappedAnalytesProfile = buildPatientFeatureProfile({
  variables: [],
  timeline: [],
  context: {
    records: {
      documentosImportados: [noisyStructuredFields],
      escalasAplicadas: [noisyStructuredFields],
      laboratorios: twelveAnalytes
    }
  }
});
twelveAnalytes.forEach(({ analyteId, unidad, valor }) => {
  const analito = analyteId.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const unit = unidad.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const featureId = `structured.laboratorios.analito_${analito}_unidad_${unit}_valor.mean`;
  assert.strictEqual(cappedAnalytesProfile.features.find((feature) => feature.featureId === featureId)?.value, valor, `El límite global no debe expulsar ${featureId}`);
});

const legacyStudyProfile = buildPatientFeatureProfile({
  variables: [],
  timeline: [],
  context: {
    records: {
      estudios: [
        { nombre: "Creatinina", resultado: 1, unidad: "mg/dL" },
        { nombre: "Albúmina", resultado: 4, unidad: "g/dL" }
      ]
    }
  }
});
assert.strictEqual(
  legacyStudyProfile.features.find((feature) => feature.featureId === "structured.estudios.analito_creatinina_unidad_mg_dl_resultado.mean")?.value,
  1,
  "Los estudios legacy de creatinina deben conservar identidad y unidad"
);
assert.strictEqual(
  legacyStudyProfile.features.find((feature) => feature.featureId === "structured.estudios.analito_albumina_unidad_g_dl_resultado.mean")?.value,
  4,
  "Los estudios legacy de albúmina deben conservar identidad y unidad"
);
assert.ok(!legacyStudyProfile.features.some((feature) => feature.featureId === "structured.estudios.resultado.mean"), "No se deben promediar estudios de analitos heterogéneos");
console.log("clinicalAnalytics.test.js: ok");
