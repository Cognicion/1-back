const TECHNICAL_FIELD_PATTERN = /(?:^|[._-])(importaciondocx|importedby|imported|migratedby|migrated|migration|migracion|sync|sincronizacion|schema|checksum|hash|processedby|processed|processing|createdby|updatedby|audit|auditoria)(?:$|[._-])/i;
const DERIVED_METRIC_SUFFIXES = Object.freeze([
  ".change_per_day",
  ".observation_count",
  ".ever_positive",
  ".positive_rate",
  ".mean_length",
  ".documented",
  ".latest",
  ".mean",
  ".range",
  ".count"
]);
const GENERIC_LABEL_WORDS = new Set([
  "de", "del", "la", "el", "los", "las", "numero", "número", "observacion", "observaciones",
  "registro", "registros", "documentado", "documentada", "documentacion", "documentación", "valor",
  "ultimo", "último", "promedio", "media", "proporcion", "proporción", "campo", "estructurado"
]);
const CLINICAL_DOMAINS = new Set([
  "demographics", "history", "diagnosis", "treatment", "symptoms", "scales", "laboratories",
  "vitals", "events", "cognitive_rehabilitation", "structured_record"
]);

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function normalized(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function stripMetricSuffix(value = "") {
  const id = String(value);
  const suffix = DERIVED_METRIC_SUFFIXES.find((candidate) => id.endsWith(candidate));
  return suffix ? id.slice(0, -suffix.length) : id;
}

function featureSourceCollection(feature = {}) {
  const id = normalized(feature.featureId);
  const parts = id.split(".");
  if (parts[0] === "structured" || parts[0] === "record_type") return parts[1] || null;
  if (feature.sourceCollection) return normalized(feature.sourceCollection);
  return null;
}

function featureFamily(feature = {}) {
  const id = normalized(feature.featureId);
  if (!id) return "unknown";
  if (id.startsWith("record_type.")) return `collection:${id.split(".")[1] || "unknown"}`;
  if (id.startsWith("structured.")) return `structured:${stripMetricSuffix(id)}`;
  return `variable:${stripMetricSuffix(id)}`;
}

function isTechnicalFeature(feature = {}) {
  const searchable = `${normalized(feature.featureId)}.${normalized(feature.canonicalName)}.${normalized(feature.sourcePath)}`;
  return TECHNICAL_FIELD_PATTERN.test(searchable);
}

function knowledgeLayer(feature = {}) {
  if (isTechnicalFeature(feature)) return "technical";
  const domain = normalized(feature.domain);
  if (domain === "platform_usage") return "operations";
  if (domain === "documentation") return "documentation";
  return CLINICAL_DOMAINS.has(domain) ? "clinical" : "clinical";
}

function enrichFeatureMetadata(feature = {}) {
  return {
    featureFamily: feature.featureFamily || featureFamily(feature),
    knowledgeLayer: feature.knowledgeLayer || knowledgeLayer(feature),
    sourceCollection: feature.sourceCollection || featureSourceCollection(feature),
    technicalMetadata: isTechnicalFeature(feature)
  };
}

function labelTokens(feature = {}) {
  return normalized(stripMetricSuffix(feature.canonicalName || feature.featureId))
    .split(/[._-]+/)
    .filter((token) => token && !GENERIC_LABEL_WORDS.has(token));
}

function tokenSimilarity(featureA, featureB) {
  const first = new Set(labelTokens(featureA));
  const second = new Set(labelTokens(featureB));
  if (!first.size || !second.size) return 0;
  const intersection = [...first].filter((token) => second.has(token)).length;
  const union = new Set([...first, ...second]).size;
  return union ? intersection / union : 0;
}

function nearlyEqual(first, second, tolerance = 1e-10) {
  return Math.abs(Number(first) - Number(second)) <= tolerance;
}

function vectorDiagnostics(rows = []) {
  const valuesA = rows.map((row) => row[0]);
  const valuesB = rows.map((row) => row[1]);
  const exactMatch = rows.length > 0 && rows.every((row) => nearlyEqual(row[0], row[1]));
  const binaryComplement = rows.length > 0 && rows.every((row) => (
    [0, 1].includes(row[0]) && [0, 1].includes(row[1]) && nearlyEqual(row[0] + row[1], 1)
  ));
  return {
    exactMatch,
    binaryComplement,
    uniqueValuesA: new Set(valuesA.map(String)).size,
    uniqueValuesB: new Set(valuesB.map(String)).size,
    zeroRateA: valuesA.length ? valuesA.filter((value) => Number(value) === 0).length / valuesA.length : 0,
    zeroRateB: valuesB.length ? valuesB.filter((value) => Number(value) === 0).length / valuesB.length : 0
  };
}

function derivedCountFeature(feature = {}) {
  return feature.statisticalType === "count"
    || /(?:\.observation_count|\.count)$/.test(String(feature.featureId || ""));
}

function pairQualityGate(featureA = {}, featureB = {}, rows = []) {
  const metadataA = { ...featureA, ...enrichFeatureMetadata(featureA) };
  const metadataB = { ...featureB, ...enrichFeatureMetadata(featureB) };
  const diagnostics = vectorDiagnostics(rows);
  const sameFamily = metadataA.featureFamily === metadataB.featureFamily;
  const sameCollection = Boolean(metadataA.sourceCollection && metadataA.sourceCollection === metadataB.sourceCollection);
  const semanticSimilarity = tokenSimilarity(metadataA, metadataB);
  const bothDerivedCounts = derivedCountFeature(metadataA) && derivedCountFeature(metadataB);

  if (metadataA.technicalMetadata || metadataB.technicalMetadata) {
    return { eligible: false, reason: "technical_metadata", diagnostics, sameFamily, sameCollection, semanticSimilarity };
  }
  if (sameFamily) {
    return { eligible: false, reason: "same_feature_family", diagnostics, sameFamily, sameCollection, semanticSimilarity };
  }
  if (diagnostics.exactMatch && normalized(metadataA.canonicalName) === normalized(metadataB.canonicalName)) {
    return { eligible: false, reason: "semantic_duplicate", diagnostics, sameFamily, sameCollection, semanticSimilarity };
  }
  if (diagnostics.exactMatch && bothDerivedCounts && (sameCollection || semanticSimilarity >= 0.25)) {
    return { eligible: false, reason: "deterministic_count_alias", diagnostics, sameFamily, sameCollection, semanticSimilarity };
  }

  return {
    eligible: true,
    reason: null,
    diagnostics,
    sameFamily,
    sameCollection,
    semanticSimilarity,
    crossDomain: normalized(metadataA.domain) !== normalized(metadataB.domain),
    crossLayer: metadataA.knowledgeLayer !== metadataB.knowledgeLayer,
    patternCategory: patternCategory(metadataA, metadataB)
  };
}

function patternCategory(featureA = {}, featureB = {}) {
  const layers = new Set([knowledgeLayer(featureA), knowledgeLayer(featureB)]);
  if (layers.has("clinical") && layers.has("documentation")) return "clinical_documentation";
  if (layers.has("clinical") && layers.has("operations")) return "clinical_operations";
  if (layers.size === 1 && layers.has("documentation")) return "documentation_quality";
  if (layers.size === 1 && layers.has("operations")) return "platform_operations";
  if (layers.size === 1 && layers.has("clinical")) {
    return normalized(featureA.domain) === normalized(featureB.domain) ? "clinical_same_domain" : "clinical_cross_domain";
  }
  return "cross_domain";
}

function normalizedEffect(association = {}) {
  const effect = Math.abs(Number(association.effectSize));
  if (!Number.isFinite(effect)) return 0;
  return association.effectMetric === "eta_squared" ? clamp(Math.sqrt(effect)) : clamp(effect);
}

function informationScore(association = {}) {
  const diagnostics = association.vectorDiagnostics || {};
  const minimumUnique = Math.min(Number(diagnostics.uniqueValuesA) || 0, Number(diagnostics.uniqueValuesB) || 0);
  if (association.statisticalTypeA === "binary" || association.statisticalTypeB === "binary") {
    const zeroBalanceA = 1 - Math.abs((Number(diagnostics.zeroRateA) || 0) - 0.5) * 2;
    const zeroBalanceB = 1 - Math.abs((Number(diagnostics.zeroRateB) || 0) - 0.5) * 2;
    return clamp(Math.max(0.25, Math.min(zeroBalanceA, zeroBalanceB)));
  }
  return clamp(minimumUnique / 8);
}

function utilityTier(score, association, config) {
  if (score >= config.highUtilityScore && association.passesFalseDiscoveryRate === true) return "high";
  if (score >= config.moderateUtilityScore) return "moderate";
  if (score >= config.minimumUtilityScore) return "exploratory";
  return "low";
}

function assessAssociationUtility(association = {}, config = {}) {
  const weights = config.utilityWeights || {};
  const effect = normalizedEffect(association);
  const evidence = association.passesFalseDiscoveryRate === true
    ? 1
    : Number(association.adjustedPValue) <= 0.1 ? 0.6 : 0.25;
  const robustness = clamp(association.robustnessScore ?? 0.5);
  const sample = clamp(Math.log1p(Number(association.sampleSize) || 0) / Math.log1p(config.utilityReferenceSampleSize || 100));
  const coverage = clamp(association.coverageRate);
  const novelty = association.domainA !== association.domainB ? 1 : association.knowledgeLayerA !== association.knowledgeLayerB ? 0.85 : 0.6;
  const information = informationScore(association);
  const components = { effect, evidence, robustness, sample, coverage, novelty, information };
  const score = clamp(Object.entries(components).reduce((sum, [key, value]) => sum + value * (Number(weights[key]) || 0), 0));
  const tier = utilityTier(score, association, config);
  const warnings = [];
  if (association.passesFalseDiscoveryRate !== true) warnings.push("multiple_testing_not_confirmed");
  if (association.lowCoverage === true) warnings.push("low_coverage");
  if (robustness < (config.minimumRobustnessScore || 0.45)) warnings.push("unstable_subsamples");
  if (association.vectorDiagnostics?.exactMatch) warnings.push("perfect_sample_fit");
  return {
    utilityScore: Number(score.toFixed(4)),
    utilityTier: tier,
    utilityEligible: score >= (config.minimumUtilityScore || 0.45)
      && robustness >= (config.minimumRobustnessScore || 0.45),
    utilityComponents: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(4))])),
    qualityWarnings: warnings
  };
}

function assessTemporalUtility(pattern = {}, config = {}) {
  const probabilityDifference = Math.abs(Number(pattern.absoluteProbabilityDifference) || 0);
  const lift = Number(pattern.lift);
  const liftSignal = Number.isFinite(lift) && lift > 0 ? clamp(Math.abs(Math.log2(lift)) / 2) : 0;
  const effect = Math.max(clamp(probabilityDifference * 2), liftSignal);
  const sample = clamp(Math.log1p(Number(pattern.denominator) || 0) / Math.log1p(config.utilityReferenceSampleSize || 100));
  const support = clamp((Number(pattern.numerator) || 0) / Math.max(config.minimumEvents || 3, 10));
  const coverage = clamp(pattern.coverageRate);
  const intervalWidth = Number(pattern.ciUpper) - Number(pattern.ciLower);
  const precision = Number.isFinite(intervalWidth) ? clamp(1 - intervalWidth) : 0.25;
  const medianLag = Number(pattern.medianLagDays);
  const lagIqr = Number(pattern.lagIqrDays);
  const timing = Number.isFinite(medianLag) && medianLag > 0 && Number.isFinite(lagIqr)
    ? clamp(1 - (lagIqr / Math.max(medianLag, 1)))
    : 0.5;
  const novelty = pattern.variableA === pattern.variableB ? 0.55 : pattern.domainA !== pattern.domainB ? 1 : 0.7;
  const score = clamp(effect * 0.24 + sample * 0.14 + support * 0.16 + coverage * 0.12 + precision * 0.14 + timing * 0.12 + novelty * 0.08);
  const tier = score >= (config.highUtilityScore || 0.75)
    ? "high"
    : score >= (config.moderateUtilityScore || 0.6) ? "moderate" : score >= (config.minimumUtilityScore || 0.45) ? "exploratory" : "low";
  return {
    utilityScore: Number(score.toFixed(4)),
    utilityTier: tier,
    utilityEligible: pattern.insufficientEvidence !== true && score >= (config.minimumUtilityScore || 0.45),
    utilityComponents: {
      effect: Number(effect.toFixed(4)),
      sample: Number(sample.toFixed(4)),
      support: Number(support.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
      precision: Number(precision.toFixed(4)),
      timing: Number(timing.toFixed(4)),
      novelty: Number(novelty.toFixed(4))
    },
    qualityWarnings: pattern.lowCoverage ? ["low_coverage"] : []
  };
}

module.exports = {
  assessAssociationUtility,
  assessTemporalUtility,
  enrichFeatureMetadata,
  featureFamily,
  featureSourceCollection,
  isTechnicalFeature,
  knowledgeLayer,
  pairQualityGate,
  patternCategory,
  stripMetricSuffix,
  tokenSimilarity,
  vectorDiagnostics
};
