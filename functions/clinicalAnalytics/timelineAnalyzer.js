function analyzePatientTimeline(variables = []) {
  return variables.filter((item) => item.observedAt).sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt))).map((item, index) => ({ eventId: `event-${index + 1}`, eventType: item.variableId, variableId: item.variableId, domain: item.domain, statisticalType: item.statisticalType, value: item.value, observedAt: item.observedAt, sourceRecordType: item.provenance?.sourceRecordType || null, confidence: item.confidence }));
}

module.exports = { analyzePatientTimeline };
