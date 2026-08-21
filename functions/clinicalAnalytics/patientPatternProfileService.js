const { buildPatientClinicalContext } = require("./contextBuilder");
const { extractClinicalVariables } = require("./variableExtractor");
const { analyzePatientTimeline } = require("./timelineAnalyzer");
const { buildPatientPatternProfile } = require("./patientPatternProfileBuilder");
const {
  loadPatientPatternProfile,
  markPatientPatternProfileState,
  persistPatientPatternProfile
} = require("./patientPatternProfilePersistence");
const { PATTERN_CATALOG } = require("./patientPatternConfig");
const { calculateEmpiricalProbability } = require("./probabilityEngine");

function analysisFromProfile(profile = {}) {
  const variables = profile.clinicalVariables || [];
  const timeline = analyzePatientTimeline(variables);
  return {
    variables,
    timeline,
    patterns: profile.discoveryPatterns || [],
    relationships: (profile.relationships || []).map((item) => ({
      relationshipId: item.id,
      condition: item.sourcePattern,
      outcome: item.targetPattern,
      relationshipType: item.relationship,
      numerator: item.observations || 0,
      denominator: item.eligibleObservations || 0,
      algorithmVersion: item.algorithmVersion,
      probability: calculateEmpiricalProbability({
        numerator: item.observations || 0,
        denominator: item.eligibleObservations || 0,
        cohort: { condition: item.sourcePattern, outcome: item.targetPattern }
      })
    }))
  };
}

async function refreshPatientPatternProfile({
  db,
  patientId,
  patient,
  context = null,
  actorUid = null,
  affectedPatternKeys = Object.keys(PATTERN_CATALOG)
}) {
  await markPatientPatternProfileState({ db, patientId, state: "analyzing", affectedPatternKeys });
  try {
    const existingProfile = await loadPatientPatternProfile({ db, patientId });
    const clinicalContext = context || await buildPatientClinicalContext({ db, patientId, patient });
    const variables = extractClinicalVariables(clinicalContext);
    const profile = buildPatientPatternProfile({
      patientId,
      context: clinicalContext,
      variables,
      existingProfile,
      affectedPatternKeys
    });
    profile.audit.generatedBy = actorUid ? "authorized_callable" : "clinical_record_trigger";
    const persistence = await persistPatientPatternProfile({ db, profile });
    return { profile, persistence, analysis: analysisFromProfile(profile), clinicalContext };
  } catch (error) {
    await markPatientPatternProfileState({
      db,
      patientId,
      state: "error",
      affectedPatternKeys,
      errorCode: error?.code || error?.name || "unknown"
    }).catch(() => {});
    throw error;
  }
}

async function getOrBuildPatientPatternProfile({ db, patientId, patient, actorUid = null, force = false }) {
  const current = await loadPatientPatternProfile({ db, patientId });
  if (!force && current?.analysisState === "current") {
    return { profile: current, persistence: { persisted: false, duplicate: true }, analysis: analysisFromProfile(current) };
  }
  return refreshPatientPatternProfile({ db, patientId, patient, actorUid });
}

module.exports = {
  analysisFromProfile,
  getOrBuildPatientPatternProfile,
  refreshPatientPatternProfile
};
