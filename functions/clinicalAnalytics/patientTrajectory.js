const { PATTERN_CATALOG } = require("./patientPatternConfig");

function sameDay(first, second) {
  return String(first || "").slice(0, 10) === String(second || "").slice(0, 10);
}

function buildPatientStateVectors({ patientId, patterns = [], instruments = [], snapshots = [] }) {
  return snapshots.map((snapshot) => {
    const features = {};
    patterns.forEach((pattern) => {
      const featureKey = PATTERN_CATALOG[pattern.key]?.quantitativeFeature;
      if (!featureKey) return;
      const observation = (pattern.observations || [])
        .filter((item) => item.superseded !== true && item.sourceAvailable !== false && sameDay(item.timestamp, snapshot.timestamp))
        .at(-1);
      features[featureKey] = observation ? {
        rawValue: observation.value === true ? 1 : observation.value === false ? 0 : null,
        normalizedValue: observation.normalizedValue ?? null,
        confidence: Number(observation.confidence) || 0,
        coverage: observation.coverage ?? 1,
        observationId: observation.id
      } : {
        rawValue: null,
        normalizedValue: null,
        confidence: 0,
        coverage: 0,
        observationId: null
      };
    });
    const instrument = instruments
      .filter((item) => item.superseded !== true && item.sourceAvailable !== false && item.scoreStatus === "complete" && sameDay(item.timestamp, snapshot.timestamp))
      .at(-1);
    features.suicidalIdeationBSS = instrument ? {
      rawValue: instrument.rawScore,
      normalizedValue: instrument.normalizedScore,
      confidence: instrument.itemResults?.length ? Math.min(...instrument.itemResults.map((item) => Number(item.confidence) || 0)) : 0,
      coverage: instrument.coverage,
      observationId: instrument.id
    } : {
      rawValue: null,
      normalizedValue: null,
      confidence: 0,
      coverage: 0,
      observationId: null
    };
    return { patientId, timestamp: snapshot.timestamp, features };
  });
}

function descriptiveDelta(first, second) {
  const firstValue = first?.normalizedValue;
  const secondValue = second?.normalizedValue;
  if (firstValue === null || firstValue === undefined || secondValue === null || secondValue === undefined) return null;
  const from = Number(firstValue);
  const to = Number(secondValue);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from, to, delta: to - from, interpretation: "descriptive_change_only" };
}

module.exports = { buildPatientStateVectors, descriptiveDelta, sameDay };
