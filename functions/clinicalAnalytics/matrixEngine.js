const crypto = require("crypto");
const {
  CLINICAL_MATRIX_ENGINE_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG,
  CLINICAL_PROBABILITY_ENGINE_VERSION
} = require("./config");
const { calculateEmpiricalProbability } = require("./probabilityEngine");

const NUMERIC_TYPES = new Set(["continuous", "count", "ordinal"]);

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function inverseNormalCdf(probability) {
  if (!(probability > 0 && probability < 1)) return null;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lower = 0.02425;
  const upper = 1 - lower;
  if (probability < lower) {
    const q = Math.sqrt(-2 * Math.log(probability));
    const numerator = ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5];
    const denominator = (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1;
    return numerator / denominator;
  }
  if (probability > upper) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    const numerator = ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5];
    const denominator = (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1;
    return -(numerator / denominator);
  }
  const q = probability - 0.5;
  const r = q * q;
  const numerator = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q;
  const denominator = ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1;
  return numerator / denominator;
}

function fisherCorrelationInterval(correlation, sampleSize, confidenceLevel = 0.95) {
  if (!Number.isFinite(correlation) || sampleSize <= 3 || !(confidenceLevel > 0 && confidenceLevel < 1)) return null;
  const bounded = clamp(correlation, -0.999999999, 0.999999999);
  const criticalValue = inverseNormalCdf(1 - ((1 - confidenceLevel) / 2));
  if (!Number.isFinite(criticalValue)) return null;
  const transformed = Math.atanh(bounded);
  const margin = criticalValue / Math.sqrt(sampleSize - 3);
  return {
    ciLower: Math.tanh(transformed - margin),
    ciUpper: Math.tanh(transformed + margin),
    confidenceLevel,
    confidenceIntervalMethod: "fisher_z"
  };
}

function pearsonSpearmanConcordance(pearson, spearman, tolerance = 0.15) {
  if (!Number.isFinite(pearson) || !Number.isFinite(spearman)) return null;
  const difference = Math.abs(pearson - spearman);
  const sameDirection = Math.sign(pearson) === Math.sign(spearman) || Math.abs(pearson) < 1e-12 || Math.abs(spearman) < 1e-12;
  return {
    difference,
    sameDirection,
    status: !sameDirection
      ? "direction_disagreement"
      : difference <= tolerance
        ? "consistent"
        : "magnitude_difference"
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function variance(values) {
  if (values.length < 2) return 0;
  const center = mean(values);
  return values.reduce((sum, value) => sum + ((value - center) ** 2), 0) / (values.length - 1);
}

function pearsonCorrelation(valuesA, valuesB) {
  if (valuesA.length !== valuesB.length || valuesA.length < 2) return null;
  const meanA = mean(valuesA);
  const meanB = mean(valuesB);
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < valuesA.length; index += 1) {
    const deltaA = valuesA[index] - meanA;
    const deltaB = valuesB[index] - meanB;
    numerator += deltaA * deltaB;
    sumA += deltaA ** 2;
    sumB += deltaB ** 2;
  }
  const denominator = Math.sqrt(sumA * sumB);
  return denominator ? clamp(numerator / denominator, -1, 1) : null;
}

function ranks(values) {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[ordered[index].index] = averageRank;
    start = end;
  }
  return result;
}

function spearmanCorrelation(valuesA, valuesB) {
  return pearsonCorrelation(ranks(valuesA), ranks(valuesB));
}

function logGamma(value) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  let adjusted = value - 1;
  let sum = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => { sum += coefficient / (adjusted + index + 1); });
  const t = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(t) - t + Math.log(sum);
}

function regularizedGammaQ(shape, value) {
  if (!(shape > 0) || value < 0) return null;
  if (value === 0) return 1;
  const epsilon = 1e-12;
  const floor = 1e-300;
  if (value < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    let cursor = shape;
    for (let iteration = 1; iteration <= 200; iteration += 1) {
      cursor += 1;
      term *= value / cursor;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * epsilon) break;
    }
    const lower = sum * Math.exp(-value + shape * Math.log(value) - logGamma(shape));
    return clamp(1 - lower);
  }
  let b = value + 1 - shape;
  let c = 1 / floor;
  let d = 1 / Math.max(b, floor);
  let result = d;
  for (let iteration = 1; iteration <= 200; iteration += 1) {
    const an = -iteration * (iteration - shape);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < floor) d = floor;
    c = b + an / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return clamp(Math.exp(-value + shape * Math.log(value) - logGamma(shape)) * result);
}

function betaContinuedFraction(a, b, value) {
  const maxIterations = 250;
  const epsilon = 3e-12;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * value / qap);
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const even = 2 * iteration;
    let numerator = iteration * (b - iteration) * value / ((qam + even) * (a + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;
    numerator = -(a + iteration) * (qab + iteration) * value / ((a + even) * (qap + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedBeta(value, a, b) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(value) + b * Math.log(1 - value));
  if (value < (a + 1) / (a + b + 2)) return clamp(factor * betaContinuedFraction(a, b, value) / a);
  return clamp(1 - factor * betaContinuedFraction(b, a, 1 - value) / b);
}

function correlationPValue(correlation, sampleSize) {
  if (!Number.isFinite(correlation) || sampleSize < 4) return null;
  const absolute = Math.min(Math.abs(correlation), 0.999999999);
  const tSquared = (absolute ** 2) * (sampleSize - 2) / Math.max(1e-15, 1 - absolute ** 2);
  return clamp(1 - regularizedBeta(tSquared / (tSquared + sampleSize - 2), 0.5, (sampleSize - 2) / 2));
}

function fDistributionPValue(fStatistic, degreesA, degreesB) {
  if (!(fStatistic >= 0) || !(degreesA > 0) || !(degreesB > 0)) return null;
  const ratio = (degreesA * fStatistic) / ((degreesA * fStatistic) + degreesB);
  return clamp(1 - regularizedBeta(ratio, degreesA / 2, degreesB / 2));
}

function contingency(valuesA, valuesB, config = CLINICAL_PATTERN_MATRIX_CONFIG) {
  const countsA = new Map();
  const countsB = new Map();
  valuesA.forEach((value) => countsA.set(String(value), (countsA.get(String(value)) || 0) + 1));
  valuesB.forEach((value) => countsB.set(String(value), (countsB.get(String(value)) || 0) + 1));
  const collapse = (value, counts) => (counts.get(String(value)) < config.minimumCellCount ? "__other__" : String(value));
  const normalizedA = valuesA.map((value) => collapse(value, countsA));
  const normalizedB = valuesB.map((value) => collapse(value, countsB));
  const categoriesA = [...new Set(normalizedA)].sort();
  const categoriesB = [...new Set(normalizedB)].sort();
  if (categoriesA.length < 2 || categoriesB.length < 2 || categoriesA.length > config.maxCategories || categoriesB.length > config.maxCategories) return null;
  const cells = categoriesA.map(() => categoriesB.map(() => 0));
  normalizedA.forEach((valueA, index) => {
    cells[categoriesA.indexOf(valueA)][categoriesB.indexOf(normalizedB[index])] += 1;
  });
  const rowTotals = cells.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = categoriesB.map((_, column) => cells.reduce((sum, row) => sum + row[column], 0));
  const sampleSize = valuesA.length;
  let chiSquare = 0;
  cells.forEach((row, rowIndex) => row.forEach((observed, columnIndex) => {
    const expected = rowTotals[rowIndex] * columnTotals[columnIndex] / sampleSize;
    if (expected > 0) chiSquare += ((observed - expected) ** 2) / expected;
  }));
  const degreesOfFreedom = (categoriesA.length - 1) * (categoriesB.length - 1);
  const minimumDimension = Math.min(categoriesA.length - 1, categoriesB.length - 1);
  const cramersV = minimumDimension > 0 ? Math.sqrt(chiSquare / (sampleSize * minimumDimension)) : null;
  const privacySuppressed = cells.some((row) => row.some((count) => count > 0 && count < config.minimumCellCount));
  let signedPhi = null;
  if (cells.length === 2 && cells[0].length === 2) {
    const [[a, b], [c, d]] = cells;
    const denominator = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
    signedPhi = denominator ? ((a * d) - (b * c)) / denominator : null;
  }
  return {
    categoriesA,
    categoriesB,
    cells,
    chiSquare,
    degreesOfFreedom,
    cramersV,
    signedPhi,
    privacySuppressed,
    pValue: regularizedGammaQ(degreesOfFreedom / 2, chiSquare / 2)
  };
}

function correlationRatio(categories, values, config = CLINICAL_PATTERN_MATRIX_CONFIG) {
  const counts = new Map();
  categories.forEach((category) => counts.set(String(category), (counts.get(String(category)) || 0) + 1));
  const normalized = categories.map((category) => counts.get(String(category)) < config.minimumCellCount ? "__other__" : String(category));
  const unique = [...new Set(normalized)];
  if (unique.length < 2 || unique.length > config.maxCategories) return null;
  const overall = mean(values);
  let between = 0;
  let total = 0;
  unique.forEach((category) => {
    const group = values.filter((_, index) => normalized[index] === category);
    between += group.length * ((mean(group) - overall) ** 2);
  });
  values.forEach((value) => { total += (value - overall) ** 2; });
  if (!total) return null;
  const etaSquared = clamp(between / total);
  const degreesA = unique.length - 1;
  const degreesB = values.length - unique.length;
  const fStatistic = etaSquared >= 1 ? Number.POSITIVE_INFINITY : (etaSquared / Math.max(1e-15, 1 - etaSquared)) * (degreesB / degreesA);
  const groupSizes = unique.map((category) => normalized.filter((value) => value === category).length);
  return {
    etaSquared,
    groupCount: unique.length,
    privacySuppressed: groupSizes.some((count) => count > 0 && count < config.minimumCellCount),
    pValue: Number.isFinite(fStatistic) ? fDistributionPValue(fStatistic, degreesA, degreesB) : 0
  };
}

function benjaminiHochberg(items, pValueKey = "pValue") {
  const eligible = items
    .map((item, index) => ({ index, pValue: item[pValueKey] }))
    .filter((item) => Number.isFinite(item.pValue))
    .sort((a, b) => a.pValue - b.pValue);
  let previous = 1;
  for (let cursor = eligible.length - 1; cursor >= 0; cursor -= 1) {
    const adjusted = Math.min(previous, eligible[cursor].pValue * eligible.length / (cursor + 1));
    eligible[cursor].adjustedPValue = clamp(adjusted);
    previous = adjusted;
  }
  return items.map((item, index) => {
    const match = eligible.find((candidate) => candidate.index === index);
    return { ...item, adjustedPValue: match?.adjustedPValue ?? null };
  });
}

function methodologicalEvidenceIds(association) {
  const evidenceIds = [];
  if (["pearson_spearman", "point_biserial"].includes(association.method)) evidenceIds.push("nist-sematech-statistics-handbook");
  if (Number.isFinite(association.pValue)) evidenceIds.push("benjamini-hochberg-1995", "asa-p-values-2016");
  return evidenceIds;
}

function matrixFeatureCatalog(profiles, filter) {
  const catalog = new Map();
  profiles.forEach((profile) => (profile.features || []).forEach((feature) => {
    if (!feature?.featureId || !filter(feature)) return;
    const current = catalog.get(feature.featureId) || { ...feature, value: undefined, observedAt: undefined, coverage: 0 };
    current.coverage += 1;
    current.absenceIsZero ||= feature.absenceIsZero === true;
    catalog.set(feature.featureId, current);
  }));
  return [...catalog.values()]
    .sort((a, b) => b.coverage - a.coverage || a.featureId.localeCompare(b.featureId))
    .slice(0, CLINICAL_PATTERN_MATRIX_CONFIG.maxMatrixFeatures);
}

function profileFeatureMap(profile) {
  return new Map((profile.features || []).map((feature) => [feature.featureId, feature]));
}

function absentValue(metadata) {
  if (!metadata.absenceIsZero) return undefined;
  return metadata.statisticalType === "binary" ? false : 0;
}

function typedValue(value, statisticalType) {
  if (statisticalType === "binary") {
    if (value === true || value === 1 || value === "true") return 1;
    if (value === false || value === 0 || value === "false") return 0;
    return null;
  }
  if (NUMERIC_TYPES.has(statisticalType)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (statisticalType === "categorical") return typeof value === "string" && value ? value : null;
  return null;
}

function pairRows(profileMaps, metadataA, metadataB) {
  const rows = [];
  profileMaps.forEach((map) => {
    const valueA = typedValue(map.get(metadataA.featureId)?.value ?? absentValue(metadataA), metadataA.statisticalType);
    const valueB = typedValue(map.get(metadataB.featureId)?.value ?? absentValue(metadataB), metadataB.statisticalType);
    if (valueA !== null && valueB !== null) rows.push([valueA, valueB]);
  });
  return rows;
}

function associationId(matrixType, featureA, featureB) {
  return crypto.createHash("sha256").update(`${matrixType}:${featureA}:${featureB}`).digest("hex").slice(0, 32);
}

function baseAssociation(matrixType, metadataA, metadataB, sampleSize) {
  return {
    associationId: associationId(matrixType, metadataA.featureId, metadataB.featureId),
    matrixType,
    scope: "platform",
    variableA: metadataA.featureId,
    variableB: metadataB.featureId,
    canonicalNameA: metadataA.canonicalName,
    canonicalNameB: metadataB.canonicalName,
    domainA: metadataA.domain,
    domainB: metadataB.domain,
    statisticalTypeA: metadataA.statisticalType,
    statisticalTypeB: metadataB.statisticalType,
    sampleSize,
    sourceType: "cognicion_empirical",
    nonCausal: true,
    matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
  };
}

function numericAssociation(matrixType, metadataA, metadataB, rows, config) {
  const valuesA = rows.map((row) => row[0]);
  const valuesB = rows.map((row) => row[1]);
  if (!variance(valuesA) || !variance(valuesB)) return null;
  const pearson = pearsonCorrelation(valuesA, valuesB);
  const spearman = spearmanCorrelation(valuesA, valuesB);
  const interval = fisherCorrelationInterval(pearson, rows.length, config.confidenceLevel);
  const concordance = pearsonSpearmanConcordance(pearson, spearman, config.pearsonSpearmanAgreementTolerance);
  return {
    ...baseAssociation(matrixType, metadataA, metadataB, rows.length),
    method: "pearson_spearman",
    effectSize: pearson,
    effectMetric: "pearson_r",
    secondaryEffectSize: spearman,
    secondaryEffectMetric: "spearman_rho",
    direction: pearson > 0 ? "positive" : pearson < 0 ? "negative" : "none",
    pValue: correlationPValue(pearson, rows.length),
    ...(interval || {}),
    pearsonSpearmanDifference: concordance?.difference ?? null,
    pearsonSpearmanSameDirection: concordance?.sameDirection ?? null,
    pearsonSpearmanConcordance: concordance?.status || null,
    privacySuppressed: false
  };
}

function binaryAssociation(matrixType, metadataA, metadataB, rows, config) {
  const table = contingency(rows.map((row) => row[0]), rows.map((row) => row[1]), config);
  if (!table || table.signedPhi === null) return null;
  return {
    ...baseAssociation(matrixType, metadataA, metadataB, rows.length),
    method: "phi",
    effectSize: table.signedPhi,
    effectMetric: "phi",
    direction: table.signedPhi > 0 ? "positive" : table.signedPhi < 0 ? "negative" : "none",
    pValue: table.pValue,
    privacySuppressed: table.privacySuppressed
  };
}

function pointBiserialAssociation(matrixType, metadataA, metadataB, rows, config) {
  const binaryIndex = metadataA.statisticalType === "binary" ? 0 : 1;
  const groupCounts = [0, 0];
  rows.forEach((row) => { groupCounts[row[binaryIndex]] += 1; });
  const valuesA = rows.map((row) => row[0]);
  const valuesB = rows.map((row) => row[1]);
  if (!variance(valuesA) || !variance(valuesB)) return null;
  const effect = pearsonCorrelation(valuesA, valuesB);
  return {
    ...baseAssociation(matrixType, metadataA, metadataB, rows.length),
    method: "point_biserial",
    effectSize: effect,
    effectMetric: "point_biserial_r",
    direction: effect > 0 ? "positive" : effect < 0 ? "negative" : "none",
    pValue: correlationPValue(effect, rows.length),
    privacySuppressed: groupCounts.some((count) => count > 0 && count < config.minimumCellCount)
  };
}

function categoricalAssociation(matrixType, metadataA, metadataB, rows, config) {
  const table = contingency(rows.map((row) => row[0]), rows.map((row) => row[1]), config);
  if (!table || table.cramersV === null) return null;
  return {
    ...baseAssociation(matrixType, metadataA, metadataB, rows.length),
    method: "cramers_v",
    effectSize: table.cramersV,
    effectMetric: "cramers_v",
    direction: "non_directional",
    pValue: table.pValue,
    privacySuppressed: table.privacySuppressed
  };
}

function numericCategoricalAssociation(matrixType, metadataA, metadataB, rows, config) {
  const categoryFirst = metadataA.statisticalType === "categorical";
  const categories = rows.map((row) => row[categoryFirst ? 0 : 1]);
  const values = rows.map((row) => row[categoryFirst ? 1 : 0]);
  const ratio = correlationRatio(categories, values, config);
  if (!ratio) return null;
  return {
    ...baseAssociation(matrixType, metadataA, metadataB, rows.length),
    method: "correlation_ratio",
    effectSize: ratio.etaSquared,
    effectMetric: "eta_squared",
    direction: "non_directional",
    pValue: ratio.pValue,
    privacySuppressed: ratio.privacySuppressed
  };
}

function calculatePair(matrixType, metadataA, metadataB, rows, config) {
  const typeA = metadataA.statisticalType;
  const typeB = metadataB.statisticalType;
  if (typeA === "binary" && typeB === "binary") return binaryAssociation(matrixType, metadataA, metadataB, rows, config);
  if ((typeA === "binary" && NUMERIC_TYPES.has(typeB)) || (typeB === "binary" && NUMERIC_TYPES.has(typeA))) return pointBiserialAssociation(matrixType, metadataA, metadataB, rows, config);
  if (NUMERIC_TYPES.has(typeA) && NUMERIC_TYPES.has(typeB)) return numericAssociation(matrixType, metadataA, metadataB, rows, config);
  if ((typeA === "categorical" && NUMERIC_TYPES.has(typeB)) || (typeB === "categorical" && NUMERIC_TYPES.has(typeA))) return numericCategoricalAssociation(matrixType, metadataA, metadataB, rows, config);
  if ((typeA === "categorical" || typeA === "binary") && (typeB === "categorical" || typeB === "binary")) return categoricalAssociation(matrixType, metadataA, metadataB, rows, config);
  return null;
}

function buildAssociationMatrix(profiles = [], {
  matrixType = "mixed_values",
  featureFilter = () => true,
  maxAssociations = CLINICAL_PATTERN_MATRIX_CONFIG.maxAssociations,
  config = CLINICAL_PATTERN_MATRIX_CONFIG
} = {}) {
  const features = matrixFeatureCatalog(profiles, featureFilter);
  const profileMaps = profiles.map(profileFeatureMap);
  const candidates = [];
  const skipped = { insufficientObservations: 0, constantOrUnsupported: 0, privacy: 0 };
  for (let first = 0; first < features.length; first += 1) {
    for (let second = first + 1; second < features.length; second += 1) {
      const rows = pairRows(profileMaps, features[first], features[second]);
      if (rows.length < config.minimumObservations) {
        skipped.insufficientObservations += 1;
        continue;
      }
      const association = calculatePair(matrixType, features[first], features[second], rows, config);
      if (!association || !Number.isFinite(association.effectSize)) {
        skipped.constantOrUnsupported += 1;
        continue;
      }
      if (association.privacySuppressed) {
        skipped.privacy += 1;
        continue;
      }
      candidates.push({
        ...association,
        cohortSize: profiles.length,
        coverageRate: profiles.length ? rows.length / profiles.length : 0,
        lowCoverage: profiles.length ? rows.length / profiles.length < config.lowCoverageThreshold : true
      });
    }
  }
  const adjusted = benjaminiHochberg(candidates).map((association) => ({
    ...association,
    evidenceIds: methodologicalEvidenceIds(association),
    falseDiscoveryRate: config.falseDiscoveryRate,
    multipleTestingMethod: "benjamini_hochberg",
    passesEffectThreshold: Math.abs(association.effectSize) >= config.minimumAbsoluteEffect,
    passesFalseDiscoveryRate: association.adjustedPValue !== null && association.adjustedPValue <= config.falseDiscoveryRate,
    evidenceStatus: Math.abs(association.effectSize) < config.minimumAbsoluteEffect
      ? "effect_below_threshold"
      : association.adjustedPValue !== null && association.adjustedPValue <= config.falseDiscoveryRate
        ? "screened_candidate"
        : "exploratory_not_confirmed"
  }));
  const associations = adjusted
    .filter((association) => association.passesEffectThreshold)
    .sort((a, b) => Number(b.passesFalseDiscoveryRate) - Number(a.passesFalseDiscoveryRate) || Math.abs(b.effectSize) - Math.abs(a.effectSize) || a.associationId.localeCompare(b.associationId))
    .slice(0, maxAssociations);
  return {
    matrixType,
    cohortSize: profiles.length,
    featureCount: features.length,
    featureIds: features.map((feature) => feature.featureId),
    testedPairs: candidates.length,
    retainedAssociations: associations.length,
    associations,
    skipped,
    sourceType: "cognicion_empirical",
    nonCausal: true,
    matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
  };
}

function buildTemporalPatternMatrix(profiles = [], config = CLINICAL_PATTERN_MATRIX_CONFIG) {
  const aggregate = new Map();
  const positiveSets = profiles.map((profile) => new Set(profile.positiveVariableIds || []));
  profiles.forEach((profile, profileIndex) => {
    const seen = new Set();
    (profile.temporalPairs || []).forEach((pair) => {
      const key = `${pair.variableA}__${pair.variableB}`;
      if (!pair.variableA || !pair.variableB || seen.has(key)) return;
      seen.add(key);
      const current = aggregate.get(key) || {
        variableA: pair.variableA,
        variableB: pair.variableB,
        patientIndexes: new Set(),
        occurrences: 0,
        firstObservedAt: pair.firstObservedAt || null,
        lastObservedAt: pair.lastObservedAt || null
      };
      current.patientIndexes.add(profileIndex);
      current.occurrences += Number(pair.occurrences) || 1;
      if (pair.firstObservedAt && (!current.firstObservedAt || pair.firstObservedAt < current.firstObservedAt)) current.firstObservedAt = pair.firstObservedAt;
      if (pair.lastObservedAt && (!current.lastObservedAt || pair.lastObservedAt > current.lastObservedAt)) current.lastObservedAt = pair.lastObservedAt;
      aggregate.set(key, current);
    });
  });

  const patterns = [];
  aggregate.forEach((item, key) => {
    const numerator = item.patientIndexes.size;
    const denominator = positiveSets.filter((set) => set.has(item.variableA)).length;
    if (denominator < config.minimumObservations || numerator < config.minimumEvents) return;
    const outcomePatients = positiveSets.filter((set) => set.has(item.variableB)).length;
    const probability = calculateEmpiricalProbability({
      numerator,
      denominator,
      cohort: { scope: "all_deidentified_profiles", condition: item.variableA, outcome: item.variableB }
    });
    const baseProbability = profiles.length ? outcomePatients / profiles.length : null;
    patterns.push({
      associationId: associationId("temporal_sequences", item.variableA, item.variableB),
      patternId: key,
      matrixType: "temporal_sequences",
      patternType: "temporal_sequence",
      scope: "platform",
      variableA: item.variableA,
      variableB: item.variableB,
      numerator,
      denominator,
      sampleSize: denominator,
      patientSupport: numerator,
      occurrenceSupport: item.occurrences,
      probability: probability.probability,
      ciLower: probability.ciLower,
      ciUpper: probability.ciUpper,
      confidenceLevel: probability.confidenceLevel,
      confidenceIntervalMethod: probability.method,
      cohortSize: profiles.length,
      coverageRate: profiles.length ? denominator / profiles.length : 0,
      lowCoverage: profiles.length ? denominator / profiles.length < config.lowCoverageThreshold : true,
      baselineProbability: baseProbability,
      absoluteProbabilityDifference: baseProbability === null ? null : probability.probability - baseProbability,
      lift: baseProbability > 0 ? probability.probability / baseProbability : null,
      firstObservedAt: item.firstObservedAt,
      lastObservedAt: item.lastObservedAt,
      evidenceStatus: probability.insufficientEvidence ? "insufficient_evidence" : "observational_ready",
      sourceType: "cognicion_empirical",
      nonCausal: true,
      probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION,
      matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
    });
  });
  const associations = patterns
    .sort((a, b) => b.patientSupport - a.patientSupport || (b.lift || 0) - (a.lift || 0) || a.patternId.localeCompare(b.patternId))
    .slice(0, config.maxTemporalPatterns);
  return {
    matrixType: "temporal_sequences",
    cohortSize: profiles.length,
    testedPairs: aggregate.size,
    retainedAssociations: associations.length,
    associations,
    sourceType: "cognicion_empirical",
    nonCausal: true,
    matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
  };
}

function buildPatternMatrices(profiles = [], config = CLINICAL_PATTERN_MATRIX_CONFIG) {
  const mixed = buildAssociationMatrix(profiles, {
    matrixType: "mixed_values",
    featureFilter: (feature) => !feature.featureId.endsWith(".documented"),
    maxAssociations: config.maxAssociations,
    config
  });
  const documentation = buildAssociationMatrix(profiles, {
    matrixType: "documentation_presence",
    featureFilter: (feature) => feature.featureId.endsWith(".documented"),
    maxAssociations: config.maxPresenceAssociations,
    config
  });
  const temporal = buildTemporalPatternMatrix(profiles, config);
  return {
    generatedAt: new Date().toISOString(),
    cohortSize: profiles.length,
    matrices: { mixed, documentation, temporal },
    versions: { matrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION, probabilityEngineVersion: CLINICAL_PROBABILITY_ENGINE_VERSION },
    safeguards: {
      minimumObservations: config.minimumObservations,
      minimumEvents: config.minimumEvents,
      minimumCellCount: config.minimumCellCount,
      minimumAbsoluteEffect: config.minimumAbsoluteEffect,
      falseDiscoveryRate: config.falseDiscoveryRate,
      confidenceLevel: config.confidenceLevel,
      pearsonSpearmanAgreementTolerance: config.pearsonSpearmanAgreementTolerance,
      lowCoverageThreshold: config.lowCoverageThreshold,
      correction: "benjamini_hochberg",
      directIdentifiersIncluded: false,
      rawClinicalTextIncluded: false,
      causalClaimsAllowed: false
    }
  };
}

module.exports = {
  benjaminiHochberg,
  buildAssociationMatrix,
  buildPatternMatrices,
  buildTemporalPatternMatrix,
  correlationPValue,
  correlationRatio,
  contingency,
  fisherCorrelationInterval,
  inverseNormalCdf,
  pearsonCorrelation,
  pearsonSpearmanConcordance,
  spearmanCorrelation
};
