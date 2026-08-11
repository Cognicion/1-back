const { CLINICAL_PROBABILITY_CONFIG } = require("./config");

function wilsonInterval(numerator, denominator, confidenceLevel = CLINICAL_PROBABILITY_CONFIG.confidenceLevel) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return { lower: null, upper: null };
  const z = confidenceLevel >= 0.99 ? 2.576 : confidenceLevel >= 0.95 ? 1.96 : 1.645;
  const p = numerator / denominator;
  const z2 = z * z;
  const center = (p + z2 / (2 * denominator)) / (1 + z2 / denominator);
  const margin = (z / (1 + z2 / denominator)) * Math.sqrt((p * (1 - p) / denominator) + z2 / (4 * denominator ** 2));
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function calculateEmpiricalProbability({ numerator = 0, denominator = 0, period = null, cohort = null } = {}) {
  const insufficientEvidence = denominator < CLINICAL_PROBABILITY_CONFIG.minimumObservations || numerator < CLINICAL_PROBABILITY_CONFIG.minimumEvents;
  const interval = wilsonInterval(numerator, denominator);
  return {
    probability: denominator > 0 ? numerator / denominator : null,
    numerator,
    denominator,
    sampleSize: denominator,
    period,
    cohort,
    ciLower: interval.lower,
    ciUpper: interval.upper,
    method: "wilson",
    confidenceLevel: CLINICAL_PROBABILITY_CONFIG.confidenceLevel,
    insufficientEvidence,
    evidenceStatus: insufficientEvidence ? "insufficient_evidence" : "observational_ready",
    sourceType: "cognicion_empirical",
    formula: "numerator / denominator"
  };
}

module.exports = { wilsonInterval, calculateEmpiricalProbability };
