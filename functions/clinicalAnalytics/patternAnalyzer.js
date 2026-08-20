const {
  CLINICAL_PATTERN_ENGINE_VERSION,
  CLINICAL_PATTERN_MATRIX_CONFIG
} = require("./config");

function positiveEvents(timeline = []) {
  return timeline
    .filter((event) => event?.variableId && event.value !== false && event.value !== "negated")
    .filter((event) => Number.isFinite(Date.parse(event.observedAt)))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function uniqueVariableIds(events) {
  return [...new Set(events.map((event) => event.variableId))].sort();
}

function sequenceEvents(timeline = []) {
  return positiveEvents(timeline).filter((event) => event.domain !== "demographics");
}

function quantile(values = [], probability = 0.5) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function firstFollowingEvent(events, start, outcome, maximumLagDays = CLINICAL_PATTERN_MATRIX_CONFIG.maximumTemporalLagDays) {
  const startTime = Date.parse(start.observedAt);
  return events.find((candidate) => (
    candidate.variableId === outcome
    && Date.parse(candidate.observedAt) > startTime
    && (Date.parse(candidate.observedAt) - startTime) / 86400000 <= maximumLagDays
  ));
}

function temporalSequencePairs(timeline = [], maxPairs = CLINICAL_PATTERN_MATRIX_CONFIG.maxTemporalPairsPerPatient) {
  const events = sequenceEvents(timeline);
  const variableIds = uniqueVariableIds(events);
  const pairs = [];

  for (const condition of variableIds) {
    const starts = events.filter((event) => event.variableId === condition);
    for (const outcome of variableIds) {
      let occurrences = 0;
      let firstMatch = null;
      let lastMatch = null;
      let confidence = 1;
      const lagDays = [];
      for (const start of starts) {
        const end = firstFollowingEvent(events, start, outcome);
        if (!end) continue;
        const lag = (Date.parse(end.observedAt) - Date.parse(start.observedAt)) / 86400000;
        occurrences += 1;
        lagDays.push(lag);
        firstMatch ||= { start, end };
        lastMatch = { start, end };
        confidence = Math.min(confidence, start.confidence || 0.5, end.confidence || 0.5);
      }
      if (!occurrences) continue;
      pairs.push({
        condition,
        outcome,
        occurrences,
        eligibleOccurrences: starts.length,
        firstObservedAt: firstMatch.start.observedAt,
        firstOutcomeAt: firstMatch.end.observedAt,
        lastObservedAt: lastMatch.end.observedAt,
        medianLagDays: quantile(lagDays, 0.5),
        minimumLagDays: Math.min(...lagDays),
        maximumLagDays: Math.max(...lagDays),
        lagIqrDays: quantile(lagDays, 0.75) - quantile(lagDays, 0.25),
        confidence
      });
    }
  }

  return pairs
    .sort((a, b) => b.occurrences - a.occurrences || a.condition.localeCompare(b.condition) || a.outcome.localeCompare(b.outcome))
    .slice(0, maxPairs);
}

function cooccurrencePatterns(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = `${event.observedAt}|${event.sourceRecordType || "unknown"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  const patterns = [];
  for (const group of groups.values()) {
    const ids = uniqueVariableIds(group);
    for (let firstIndex = 0; firstIndex < ids.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < ids.length; secondIndex += 1) {
        const first = group.find((event) => event.variableId === ids[firstIndex]);
        const second = group.find((event) => event.variableId === ids[secondIndex]);
        patterns.push({
          patternId: `patient-cooccurrence-${ids[firstIndex]}-${ids[secondIndex]}-${first.observedAt}`,
          scope: "patient",
          patternType: "cooccurrence",
          variables: [ids[firstIndex], ids[secondIndex]],
          events: [
            { eventType: ids[firstIndex], observedAt: first.observedAt },
            { eventType: ids[secondIndex], observedAt: second.observedAt }
          ],
          supportCount: 1,
          firstObservedAt: first.observedAt,
          lastObservedAt: second.observedAt,
          confidence: Math.min(first.confidence || 0.5, second.confidence || 0.5),
          evidence: [{ sourceType: "cognicion_empirical", evidenceIds: [] }],
          algorithmVersion: CLINICAL_PATTERN_ENGINE_VERSION
        });
      }
    }
  }
  return patterns;
}

function detectPatientPatterns(timeline = []) {
  const events = sequenceEvents(timeline);
  const temporal = temporalSequencePairs(events).map((pair) => ({
    patternId: `patient-sequence-${pair.condition}-${pair.outcome}-${pair.firstObservedAt}-${pair.firstOutcomeAt}`,
    scope: "patient",
    patternType: "temporal_sequence",
    variables: [pair.condition, pair.outcome],
    events: [
      { eventType: pair.condition, observedAt: pair.firstObservedAt },
      { eventType: pair.outcome, observedAt: pair.firstOutcomeAt }
    ],
    supportCount: pair.occurrences,
    firstObservedAt: pair.firstObservedAt,
    lastObservedAt: pair.lastObservedAt,
    confidence: pair.confidence,
    evidence: [{ sourceType: "cognicion_empirical", evidenceIds: [] }],
    algorithmVersion: CLINICAL_PATTERN_ENGINE_VERSION
  }));

  return [...temporal, ...cooccurrencePatterns(events)]
    .sort((a, b) => b.supportCount - a.supportCount || a.patternId.localeCompare(b.patternId))
    .slice(0, CLINICAL_PATTERN_MATRIX_CONFIG.maxTemporalPairsPerPatient);
}

function buildObservationalRelationships(timeline = []) {
  return temporalSequencePairs(timeline).map((pair) => ({
    relationshipId: `${pair.condition}__${pair.outcome}`,
    condition: pair.condition,
    outcome: pair.outcome,
    relationshipType: "observed_sequence",
    numerator: pair.occurrences,
    denominator: pair.eligibleOccurrences,
    sourceType: "cognicion_empirical",
    algorithmVersion: CLINICAL_PATTERN_ENGINE_VERSION
  }));
}

module.exports = {
  buildObservationalRelationships,
  detectPatientPatterns,
  positiveEvents,
  quantile,
  temporalSequencePairs
};
