const { HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const {
  assertAuthorizedPatientClinician,
  isProfessional,
  listAuthorizedPatientSnapshots
} = require("./access");
const { inferAge } = require("./variableExtractor");
const { getOrBuildPatientPatternProfile } = require("./patientPatternProfileService");
const { profileRef } = require("./patientPatternProfilePersistence");
const { BSS_CONFIG, PATTERN_STATUSES } = require("./patientPatternConfig");

function normalized(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function patientLabel(patient = {}) {
  return patient.nombreCompleto
    || patient.displayName
    || [patient.nombres, patient.nombre, patient.apellidoPaterno, patient.apellidoMaterno, patient.apellidos].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    || "Paciente";
}

function patientRecordNumber(patient = {}) {
  return patient.numeroExpediente || patient.expediente || patient.numeroHistoria || patient.folio || null;
}

function patientSummary(id, patient = {}) {
  return {
    id,
    label: patientLabel(patient),
    age: inferAge(patient),
    recordNumber: patientRecordNumber(patient),
    updatedAt: patient.updatedAt?.toDate?.()?.toISOString?.()
      || patient.updatedAt?.toISOString?.()
      || (typeof patient.updatedAt === "string" ? patient.updatedAt : null)
  };
}

async function authorizedActor(request, db) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const snapshot = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = snapshot.exists ? snapshot.data() || {} : {};
  if (!isProfessional(actor)) throw new HttpsError("permission-denied", "Acceso exclusivo para personal clínico autorizado.");
  return { actor };
}

function matchesPatient(doc, query) {
  if (!query) return true;
  const patient = doc.data() || {};
  return [
    patientLabel(patient),
    patientRecordNumber(patient),
    doc.id,
    patient.curp
  ].some((value) => normalized(value).includes(query));
}

async function searchAuthorizedPatternPatients({ request, db }) {
  const { actor } = await authorizedActor(request, db);
  const query = normalized(request.data?.query).slice(0, 120);
  const authorizedPatients = await listAuthorizedPatientSnapshots({
    db,
    professionalProfile: actor,
    professionalUid: request.auth.uid
  });
  const patients = authorizedPatients
    .filter((doc) => matchesPatient(doc, query))
    .map((doc) => patientSummary(doc.id, doc.data() || {}))
    .sort((a, b) => a.label.localeCompare(b.label, "es"))
    .slice(0, 25);
  return { ok: true, patients, curpReturned: false, authorizedPatientMetadata: true };
}

async function getPatientPatternProfile({ request, db, force = false }) {
  const patientId = String(request.data?.patientId || "").trim();
  const access = await assertAuthorizedPatientClinician(request, db, patientId);
  const result = await getOrBuildPatientPatternProfile({
    db,
    patientId,
    patient: access.patient,
    actorUid: request.auth.uid,
    force
  });
  return {
    ok: true,
    patient: patientSummary(patientId, access.patient),
    profile: result.profile,
    persistence: {
      persisted: result.persistence?.persisted === true,
      duplicate: result.persistence?.duplicate === true,
      scope: "protected_patient_record"
    }
  };
}

async function refreshPatientPatternProfileHandler({ request, db }) {
  return getPatientPatternProfile({ request, db, force: true });
}

function validCorrectionValue(value) {
  return value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function correctedBssInstrument(instrument, itemNumber, clinicianValue, actorUid, changedAt, action) {
  const items = (instrument.itemResults || []).map((item) => {
    if (Number(item.itemNumber) !== itemNumber) return item;
    return {
      ...item,
      originalInference: item.originalInference || {
        value: item.value,
        confidence: item.confidence,
        evidence: item.evidence || null,
        ruleApplied: item.ruleApplied || null
      },
      value: clinicianValue,
      clinicianValue: action === "correct" ? clinicianValue : (item.clinicianValue ?? null),
      clinicianReviewed: true,
      reviewStatus: action === "correct" ? "corrected" : "confirmed",
      changedBy: actorUid,
      changedAt
    };
  });
  const validItems = items.filter((item) => Number.isInteger(Number(item.value)) && Number(item.value) >= 0 && Number(item.value) <= 2);
  const complete = validItems.length === BSS_CONFIG.itemCount;
  const partialSum = validItems.reduce((sum, item) => sum + Number(item.value), 0);
  return {
    ...instrument,
    itemResults: items,
    rawScore: complete ? partialSum : null,
    normalizedScore: complete ? partialSum / BSS_CONFIG.maximumScore : null,
    partialSum,
    coverage: validItems.length / BSS_CONFIG.itemCount,
    coveredItems: validItems.length,
    missingItems: Array.from({ length: BSS_CONFIG.itemCount }, (_value, index) => index + 1)
      .filter((number) => !validItems.some((item) => Number(item.itemNumber) === number)),
    scoreStatus: complete ? "complete" : validItems.length ? "partial" : "not_calculable",
    clinicianReviewed: items.length > 0 && items.every((item) => item.clinicianReviewed === true),
    audit: {
      ...(instrument.audit || {}),
      clinicianReviewed: items.length > 0 && items.every((item) => item.clinicianReviewed === true),
      clinicianCorrections: items.filter((item) => item.reviewStatus === "corrected").length,
      lastReviewedAt: changedAt
    }
  };
}

function confirmedBssInstrument(instrument, actorUid, changedAt) {
  const items = (instrument.itemResults || []).map((item) => ({
    ...item,
    clinicianReviewed: true,
    reviewStatus: item.reviewStatus === "corrected" ? "corrected" : "confirmed",
    changedBy: item.changedBy || actorUid,
    changedAt: item.changedAt || changedAt
  }));
  return {
    itemResults: items,
    clinicianReviewed: items.length > 0,
    reviewStatus: "confirmed",
    changedBy: actorUid,
    changedAt,
    audit: {
      ...(instrument.audit || {}),
      clinicianReviewed: items.length > 0,
      clinicianCorrections: items.filter((item) => item.reviewStatus === "corrected").length,
      lastReviewedAt: changedAt
    }
  };
}

async function reviewPatientPatternResult({ request, db }) {
  const patientId = String(request.data?.patientId || "").trim();
  await assertAuthorizedPatientClinician(request, db, patientId);
  const targetType = String(request.data?.targetType || "pattern_observation");
  const targetId = String(request.data?.targetId || "").trim();
  const action = String(request.data?.action || "confirm");
  if (!targetId || !["pattern_observation", "bss_instrument", "bss_item"].includes(targetType) || !["confirm", "correct"].includes(action)
    || (targetType === "bss_instrument" && action !== "confirm")) {
    throw new HttpsError("invalid-argument", "La revisión solicitada no es válida.");
  }
  const changedAt = new Date().toISOString();
  const rootRef = profileRef(db, patientId);
  const collectionName = targetType === "pattern_observation" ? "observations" : "instruments";
  const targetRef = rootRef.collection(collectionName).doc(targetId);
  const snapshot = await targetRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Resultado computado no encontrado.");
  const original = snapshot.data() || {};
  let clinicianValue = request.data?.clinicianValue ?? null;
  let status = String(request.data?.status || original.status || "");
  let itemNumber = null;

  if (targetType === "pattern_observation" && action === "correct" && (!validCorrectionValue(clinicianValue) || !PATTERN_STATUSES.includes(status))) {
    throw new HttpsError("invalid-argument", "La corrección clínica no es válida.");
  }
  if (targetType === "bss_item") {
    itemNumber = Number(request.data?.itemNumber);
    const originalItem = (original.itemResults || []).find((item) => Number(item.itemNumber) === itemNumber);
    if (!Number.isInteger(itemNumber) || itemNumber < 1 || itemNumber > BSS_CONFIG.itemCount || !originalItem
      || (action === "correct" && (!Number.isInteger(Number(clinicianValue)) || Number(clinicianValue) < 0 || Number(clinicianValue) > 2))) {
      throw new HttpsError("invalid-argument", "El reactivo o su valor no es válido.");
    }
    clinicianValue = action === "correct" ? Number(clinicianValue) : originalItem.value;
  }

  const originalInference = targetType === "bss_item"
    ? (original.itemResults || []).find((item) => Number(item.itemNumber) === itemNumber)
    : original;
  const reviewId = `review-${crypto.createHash("sha256").update([patientId, targetType, targetId, request.auth.uid, changedAt].join("|")).digest("hex").slice(0, 28)}`;
  await db.collection(`usuarios/${patientId}/clinicalPatternReviews`).doc(reviewId).set({
    reviewId,
    patientId,
    targetType,
    targetId,
    itemNumber,
    action,
    status: targetType === "pattern_observation" ? status : null,
    originalInference,
    clinicianValue: action === "correct" ? clinicianValue : null,
    changedBy: request.auth.uid,
    changedAt,
    reviewStatus: action === "correct" ? "corrected" : "confirmed",
    sourceProfilePath: `clinicalPatternProfiles/current/${collectionName}/${targetId}`,
    storageScope: "human_review_separate_from_computed_profile"
  });

  return { ok: true, targetType, targetId, action, changedAt, reviewStoredSeparately: true };
}

module.exports = {
  confirmedBssInstrument,
  correctedBssInstrument,
  getPatientPatternProfile,
  matchesPatient,
  patientLabel,
  patientSummary,
  refreshPatientPatternProfileHandler,
  reviewPatientPatternResult,
  searchAuthorizedPatternPatients
};
