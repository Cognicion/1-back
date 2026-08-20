const { CLINICAL_RECORD_COLLECTIONS } = require("./config");

const COLLECTIONS = CLINICAL_RECORD_COLLECTIONS;

function valueToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function readCollection(db, patientId, collectionName) {
  try {
    const snap = await db.collection(`usuarios/${patientId}/${collectionName}`).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), _recordType: collectionName })).sort((a, b) => String(valueToIso(b.updatedAt || b.fecha || b.createdAt) || "").localeCompare(String(valueToIso(a.updatedAt || a.fecha || a.createdAt) || "")));
  } catch {
    return [];
  }
}

async function buildPatientClinicalContext({ db, patientId, patient }) {
  const records = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (collectionName) => [collectionName, await readCollection(db, patientId, collectionName)])));
  return {
    patientId,
    patient: { ...patient, _recordType: "patientProfile" },
    records,
    builtAt: new Date().toISOString(),
    sourceModule: "clinicalAnalytics.contextBuilder"
  };
}

module.exports = { buildPatientClinicalContext, valueToIso, COLLECTIONS };
