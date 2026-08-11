const { CLINICAL_PATTERN_ENGINE_VERSION } = require("./config");

const SEQUENCES = Object.freeze([
  ["insomnia", "agitation"],
  ["treatment_suspension", "relapse"],
  ["treatment", "improvement"],
  ["hospitalization", "readmission"],
  ["suicidal_ideation", "suicide_attempt"]
]);

function positiveEvents(timeline) {
  return timeline.filter((event) => event.value !== false && event.value !== "negated");
}

function detectPatientPatterns(timeline = []) {
  const events = positiveEvents(timeline);
  const patterns = [];
  SEQUENCES.forEach(([first, second]) => {
    const firstEvents = events.filter((event) => event.variableId === first);
    const secondEvents = events.filter((event) => event.variableId === second);
    firstEvents.forEach((start) => {
      const end = secondEvents.find((candidate) => candidate.observedAt >= start.observedAt);
      if (!end) return;
      patterns.push({ patternId: `patient-${first}-${second}-${start.observedAt}-${end.observedAt}`, scope: "patient", patternType: "temporal_sequence", variables: [first, second], events: [{ eventType: first, observedAt: start.observedAt }, { eventType: second, observedAt: end.observedAt }], supportCount: 1, firstObservedAt: start.observedAt, lastObservedAt: end.observedAt, confidence: Math.min(start.confidence || 0.5, end.confidence || 0.5), evidence: [{ sourceType: "cognicion_empirical", evidenceIds: [] }], algorithmVersion: CLINICAL_PATTERN_ENGINE_VERSION });
    });
  });
  return patterns;
}

function buildObservationalRelationships(timeline = []) {
  const events = positiveEvents(timeline);
  const relationships = [];
  SEQUENCES.forEach(([condition, outcome]) => {
    const denominator = events.filter((event) => event.variableId === condition).length;
    const numerator = events.filter((event) => event.variableId === condition && events.some((candidate) => candidate.variableId === outcome && candidate.observedAt >= event.observedAt)).length;
    if (denominator) relationships.push({ relationshipId: `${condition}__${outcome}`, condition, outcome, relationshipType: "observed_sequence", numerator, denominator, sourceType: "cognicion_empirical" });
  });
  return relationships;
}

module.exports = { detectPatientPatterns, buildObservationalRelationships, SEQUENCES };
