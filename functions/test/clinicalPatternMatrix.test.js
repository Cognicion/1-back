const assert = require("assert");
const {
  benjaminiHochberg,
  buildPatternMatrices,
  correlationRatio,
  contingency,
  fisherCorrelationInterval,
  pearsonCorrelation,
  pearsonSpearmanConcordance,
  spearmanCorrelation
} = require("../clinicalAnalytics/matrixEngine");
const { buildPatientFeatureProfile } = require("../clinicalAnalytics/patientFeatureProfile");
const { assertSafeProfile } = require("../clinicalAnalytics/matrixPersistence");
const { detectPatientPatterns, buildObservationalRelationships } = require("../clinicalAnalytics/patternAnalyzer");

assert.ok(Math.abs(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
assert.ok(Math.abs(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12);
assert.ok(Math.abs(spearmanCorrelation([1, 2, 3, 4], [1, 4, 9, 16]) - 1) < 1e-12);
const correlationInterval = fisherCorrelationInterval(0.5, 100, 0.95);
assert.ok(Math.abs(correlationInterval.ciLower - 0.3366433) < 1e-6);
assert.ok(Math.abs(correlationInterval.ciUpper - 0.6341398) < 1e-6);
assert.strictEqual(pearsonSpearmanConcordance(0.5, 0.46, 0.15).status, "consistent");
assert.strictEqual(pearsonSpearmanConcordance(0.5, -0.1, 0.15).status, "direction_disagreement");

const table = contingency(
  [...Array(20).fill(0), ...Array(20).fill(1)],
  [...Array(20).fill(0), ...Array(20).fill(1)]
);
assert.ok(table.cramersV > 0.99);
assert.strictEqual(table.privacySuppressed, false);
const rareTable = contingency(
  [...Array(19).fill(0), 1],
  [...Array(19).fill(0), 1]
);
assert.strictEqual(rareTable.privacySuppressed, true);

const eta = correlationRatio(
  [...Array(10).fill("a"), ...Array(10).fill("b")],
  [...Array(10).fill(1), ...Array(10).fill(10)]
);
assert.ok(eta.etaSquared > 0.99);

const adjusted = benjaminiHochberg([{ pValue: 0.01 }, { pValue: 0.02 }, { pValue: 0.2 }]);
assert.ok(Math.abs(adjusted[0].adjustedPValue - 0.03) < 1e-12);
assert.ok(Math.abs(adjusted[1].adjustedPValue - 0.03) < 1e-12);
assert.ok(Math.abs(adjusted[2].adjustedPValue - 0.2) < 1e-12);

function feature(featureId, canonicalName, domain, statisticalType, value, absenceIsZero = false) {
  return { featureId, canonicalName, domain, statisticalType, value, absenceIsZero };
}

const profiles = Array.from({ length: 40 }, (_, index) => ({
  features: [
    feature("age.latest", "edad", "demographics", "continuous", index + 20),
    feature("documentation.mean_words", "palabras_promedio", "documentation", "continuous", (index + 20) * 3),
    feature("insomnia.documented", "insomnio_documentado", "documentation", "binary", index % 2 === 0, true),
    feature("anxiety.documented", "ansiedad_documentada", "documentation", "binary", index % 2 === 0, true)
  ],
  positiveVariableIds: ["insomnia", "anxiety"],
  temporalPairs: index < 20 ? [{ variableA: "insomnia", variableB: "anxiety", occurrences: 1, eligibleOccurrences: 1 }] : []
}));

const matrices = buildPatternMatrices(profiles);
const crossDomain = matrices.matrices.mixed.associations.find((item) => (
  [item.variableA, item.variableB].includes("age.latest")
  && [item.variableA, item.variableB].includes("documentation.mean_words")
));
assert.ok(crossDomain, "La matriz debe buscar asociaciones entre dominios distintos");
assert.ok(crossDomain.effectSize > 0.99);
assert.strictEqual(crossDomain.evidenceStatus, "screened_candidate");
assert.strictEqual(crossDomain.coverageRate, 1);
assert.strictEqual(crossDomain.lowCoverage, false);
assert.strictEqual(crossDomain.confidenceIntervalMethod, "fisher_z");
assert.strictEqual(crossDomain.pearsonSpearmanConcordance, "consistent");
assert.ok(crossDomain.evidenceIds.includes("asa-p-values-2016"));
assert.ok(matrices.matrices.documentation.associations.some((item) => item.effectSize > 0.99));
const temporal = matrices.matrices.temporal.associations.find((item) => item.variableA === "insomnia" && item.variableB === "anxiety");
assert.ok(temporal);
assert.strictEqual(temporal.numerator, 20);
assert.strictEqual(temporal.denominator, 40);
assert.strictEqual(temporal.probability, 0.5);
assert.strictEqual(temporal.baselineProbability, 1);
assert.strictEqual(temporal.absoluteProbabilityDifference, -0.5);
assert.strictEqual(temporal.lift, 0.5);

const arbitraryTimeline = [
  { variableId: "education", value: "higher", observedAt: "2026-01-01T00:00:00.000Z", confidence: 0.9 },
  { variableId: "laboratory", value: { value: 3 }, observedAt: "2026-02-01T00:00:00.000Z", confidence: 0.8 }
];
assert.ok(detectPatientPatterns(arbitraryTimeline).some((item) => item.variables.join("|") === "education|laboratory"));
assert.ok(buildObservationalRelationships(arbitraryTimeline).some((item) => item.condition === "education" && item.outcome === "laboratory"));

const profile = buildPatientFeatureProfile({
  variables: [{
    variableId: "age",
    value: 32,
    observedAt: "2026-01-01T00:00:00.000Z",
    confidence: 0.9
  }],
  timeline: [],
  context: {
    records: {
      notasMedicas: [{
        nombre: "Ana Identificable",
        email: "ana@example.com",
        telefono: "5551234567",
        texto: "La persona niega ansiedad y describe actividades laborales.",
        fecha: "2026-01-01T00:00:00.000Z"
      }]
    }
  }
});
const serialized = JSON.stringify(profile);
assert.strictEqual(profile.directIdentifiersIncluded, false);
assert.strictEqual(profile.rawClinicalTextIncluded, false);
assert.ok(!serialized.includes("Ana Identificable"));
assert.ok(!serialized.includes("ana@example.com"));
assert.ok(!serialized.includes("5551234567"));
assert.ok(!serialized.includes("actividades laborales"));
assert.ok(profile.features.some((item) => item.featureId === "structured.notasmedicas.texto.mean_length"));
assert.ok(!profile.features.some((item) => /nombre|email|telefono/.test(item.featureId)));
assert.doesNotThrow(() => assertSafeProfile(profile));
assert.throws(() => assertSafeProfile({ ...profile, patientId: "real-patient-id" }));

console.log("clinicalPatternMatrix.test.js: ok");
