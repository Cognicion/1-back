const {
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_EMBEDDING_ENGINE_VERSION,
  CLINICAL_RECORD_SOURCE_CATALOG
} = require("./config");
const { sha256 } = require("./semanticDocumentBuilder");

function sourceMetadata(item = {}) {
  const source = CLINICAL_RECORD_SOURCE_CATALOG[item.sourceCollection] || {};
  return {
    sourceCollection: item.sourceCollection || "unknown",
    sourceLabel: item.sourceLabel || source.label || "Fuente clínica",
    sourceDomain: item.sourceDomain || source.domain || "otro"
  };
}

function buildSemanticRelation({ source, target, distance }) {
  const sourceId = String(source.id || source.embeddingId || "");
  const targetId = String(target.id || target.embeddingId || "");
  if (!sourceId || !targetId || sourceId === targetId) return null;
  const numericDistance = Number(distance);
  if (!Number.isFinite(numericDistance)) return null;
  const compatible = [source, target].every((item) => (
    item.embeddingEngineVersion === undefined
      || (item.embeddingEngineVersion === CLINICAL_EMBEDDING_ENGINE_VERSION
        && item.embeddingModel === CLINICAL_EMBEDDING_CONFIG.model
        && Number(item.embeddingDimensions) === CLINICAL_EMBEDDING_CONFIG.dimensions)
  ));
  if (!compatible) return null;
  const similarity = 1 - numericDistance;
  if (similarity < CLINICAL_EMBEDDING_CONFIG.minimumSimilarity) return null;
  const ordered = [
    { id: sourceId, item: source },
    { id: targetId, item: target }
  ].sort((a, b) => a.id.localeCompare(b.id));
  const first = ordered[0];
  const second = ordered[1];
  const sourceA = sourceMetadata(first.item);
  const sourceB = sourceMetadata(second.item);
  const firstPatient = String(first.item.analyticsPatientId || "");
  const secondPatient = String(second.item.analyticsPatientId || "");
  const crossPatient = Boolean(firstPatient && secondPatient && firstPatient !== secondPatient);
  return {
    relationId: sha256(`${first.id}:${second.id}:${CLINICAL_EMBEDDING_ENGINE_VERSION}`),
    embeddingIds: [first.id, second.id],
    patientPairHash: sha256([firstPatient, secondPatient].sort().join(":")),
    crossPatient,
    sourceCollectionA: sourceA.sourceCollection,
    sourceCollectionB: sourceB.sourceCollection,
    sourceLabelA: sourceA.sourceLabel,
    sourceLabelB: sourceB.sourceLabel,
    sourceDomainA: sourceA.sourceDomain,
    sourceDomainB: sourceB.sourceDomain,
    observedMonthA: first.item.observedMonth || null,
    observedMonthB: second.item.observedMonth || null,
    similarity: Number(similarity.toFixed(6)),
    distance: Number(numericDistance.toFixed(6)),
    distanceMeasure: "COSINE",
    sourceType: "cognicion_empirical",
    nonCausal: true,
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false,
    embeddingModel: CLINICAL_EMBEDDING_CONFIG.model,
    embeddingDimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    updatedAt: new Date().toISOString()
  };
}

function relationGroupKey(relation) {
  return [relation.sourceCollectionA, relation.sourceCollectionB].sort().join("::");
}

function relationInterpretation(group) {
  const sameSource = group.sourceCollectionA === group.sourceCollectionB;
  const sourceText = sameSource
    ? `fragmentos de ${group.sourceLabelA}`
    : `fragmentos de ${group.sourceLabelA} y ${group.sourceLabelB}`;
  return `Se observó afinidad semántica recurrente entre ${sourceText} en ${group.patientPairCount} pares desidentificados. Puede reflejar temas, contexto o estructura documental compartidos; no implica causalidad, equivalencia clínica ni predicción individual.`;
}

function aggregateSemanticRelations(relations = []) {
  const groups = new Map();
  relations
    .filter((relation) => relation.crossPatient === true)
    .filter((relation) => relation.embeddingEngineVersion === CLINICAL_EMBEDDING_ENGINE_VERSION)
    .filter((relation) => Number(relation.similarity) >= CLINICAL_EMBEDDING_CONFIG.minimumSimilarity)
    .forEach((relation) => {
      const key = relationGroupKey(relation);
      if (!groups.has(key)) {
        groups.set(key, {
          sourceCollectionA: relation.sourceCollectionA,
          sourceCollectionB: relation.sourceCollectionB,
          sourceLabelA: relation.sourceLabelA,
          sourceLabelB: relation.sourceLabelB,
          sourceDomainA: relation.sourceDomainA,
          sourceDomainB: relation.sourceDomainB,
          similarities: [],
          patientPairs: new Set()
        });
      }
      const group = groups.get(key);
      group.similarities.push(Number(relation.similarity));
      group.patientPairs.add(relation.patientPairHash);
    });
  const allGroups = [...groups.values()].map((group) => {
    const relationCount = group.similarities.length;
    const patientPairCount = group.patientPairs.size;
    const meanSimilarity = relationCount
      ? group.similarities.reduce((sum, value) => sum + value, 0) / relationCount
      : 0;
    const result = {
      sourceCollectionA: group.sourceCollectionA,
      sourceCollectionB: group.sourceCollectionB,
      sourceLabelA: group.sourceLabelA,
      sourceLabelB: group.sourceLabelB,
      sourceDomainA: group.sourceDomainA,
      sourceDomainB: group.sourceDomainB,
      relationCount,
      patientPairCount,
      meanSimilarity: Number(meanSimilarity.toFixed(4)),
      minimumSimilarity: Number(Math.min(...group.similarities).toFixed(4)),
      maximumSimilarity: Number(Math.max(...group.similarities).toFixed(4)),
      evidenceStatus: patientPairCount >= CLINICAL_EMBEDDING_CONFIG.minimumCrossPatientPairs
        ? "observational_ready"
        : "privacy_suppressed",
      sourceType: "cognicion_empirical",
      nonCausal: true
    };
    return { ...result, possibleInterpretationEs: relationInterpretation(result) };
  });
  const visible = allGroups
    .filter((group) => group.patientPairCount >= CLINICAL_EMBEDDING_CONFIG.minimumCrossPatientPairs)
    .sort((a, b) => b.patientPairCount - a.patientPairCount || b.meanSimilarity - a.meanSimilarity)
    .slice(0, 100);
  return {
    relations: visible,
    visibleGroups: visible.length,
    privacySuppressedGroups: allGroups.length - visible.length,
    minimumCrossPatientPairs: CLINICAL_EMBEDDING_CONFIG.minimumCrossPatientPairs
  };
}

module.exports = {
  aggregateSemanticRelations,
  buildSemanticRelation,
  relationGroupKey,
  relationInterpretation
};
