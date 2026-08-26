"use strict";

const {
  FREE_PATIENT_LIMIT,
  FREE_PROFESSIONAL_PLAN
} = require("./professionalRegistration");

const QUOTA_ASSIGNMENTS_COLLECTION = "patientQuotaAssignments";

class ProfessionalPatientQuotaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProfessionalPatientQuotaError";
    this.code = code;
    this.details = details;
  }
}

function isFreeProfessionalProfile(profile = {}) {
  return profile.planCuentaProfesional === FREE_PROFESSIONAL_PLAN
    || profile.modalidadRegistroProfesional === "gratuita";
}

function patientLimitForProfile(profile = {}) {
  if (!isFreeProfessionalProfile(profile)) return null;
  const configured = Number(profile.limitePacientes);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : FREE_PATIENT_LIMIT;
}

function patientCountForProfile(profile = {}) {
  const count = Number(profile.pacientesEnCuenta);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function quotaAssignmentPath(professionalUid, patientUid) {
  return `usuarios/${professionalUid}/${QUOTA_ASSIGNMENTS_COLLECTION}/${patientUid}`;
}

function quotaAssignmentData({ professionalUid, patientUid, source = "", now = new Date() }) {
  return {
    professionalUid,
    patientUid,
    estado: "activo",
    origen: String(source || "").slice(0, 80),
    fechaAsignacion: now.toISOString()
  };
}

async function professionalPlanAllowsPatientAccess({
  db,
  patientUid,
  professionalProfile = {},
  professionalUid
}) {
  if (!isFreeProfessionalProfile(professionalProfile)) return true;
  if (!db || typeof db.doc !== "function" || !professionalUid || !patientUid) return false;
  const assignmentSnapshot = await db.doc(quotaAssignmentPath(professionalUid, patientUid)).get();
  return assignmentSnapshot.exists
    && assignmentSnapshot.data()?.estado === "activo";
}

function assertPatientSlotAvailable(profile = {}, assignmentExists = false) {
  const limit = patientLimitForProfile(profile);
  const count = patientCountForProfile(profile);
  if (limit === null || assignmentExists) return { count, limited: limit !== null, limit };
  if (count >= limit) {
    throw new ProfessionalPatientQuotaError(
      "resource-exhausted",
      `Tu cuenta gratuita permite hasta ${limit} pacientes. Libera un acceso existente o cambia de plan para agregar otro.`,
      { current: count, limit }
    );
  }
  return { count, limited: true, limit };
}

function assignPatientSlotInTransaction({
  assignmentExists = false,
  assignmentRef,
  now = new Date(),
  patientUid,
  professionalProfile = {},
  professionalRef,
  professionalUid,
  source = "",
  transaction
}) {
  const state = assertPatientSlotAvailable(professionalProfile, assignmentExists);
  if (!state.limited || assignmentExists) return { acquired: false, ...state };

  transaction.create(assignmentRef, quotaAssignmentData({
    professionalUid,
    patientUid,
    source,
    now
  }));
  transaction.update(professionalRef, {
    pacientesEnCuenta: state.count + 1
  });
  return { acquired: true, ...state, count: state.count + 1 };
}

function moveProfessionalPatientSlotInTransaction({
  destinationExists = false,
  destinationPatientUid,
  destinationRef,
  now = new Date(),
  originExists = false,
  originRef,
  professionalProfile = {},
  professionalRef,
  professionalUid,
  source = "vinculacion",
  transaction
}) {
  if (!isFreeProfessionalProfile(professionalProfile)) return { moved: false };
  const count = patientCountForProfile(professionalProfile);

  if (destinationExists) {
    if (originExists) {
      transaction.delete(originRef);
      transaction.update(professionalRef, { pacientesEnCuenta: Math.max(0, count - 1) });
    }
    return { moved: originExists, merged: originExists };
  }

  if (originExists) {
    transaction.create(destinationRef, quotaAssignmentData({
      professionalUid,
      patientUid: destinationPatientUid,
      source,
      now
    }));
    transaction.delete(originRef);
    return { moved: true, merged: false };
  }

  const state = assertPatientSlotAvailable(professionalProfile, false);
  transaction.create(destinationRef, quotaAssignmentData({
    professionalUid,
    patientUid: destinationPatientUid,
    source,
    now
  }));
  transaction.update(professionalRef, { pacientesEnCuenta: state.count + 1 });
  return { moved: true, recoveredMissingOrigin: true };
}

async function releaseProfessionalPatientSlot({ db, patientUid, professionalUid }) {
  if (!db || !patientUid || !professionalUid) return { released: false };
  return db.runTransaction(async (transaction) => {
    const professionalRef = db.doc(`usuarios/${professionalUid}`);
    const assignmentRef = db.doc(quotaAssignmentPath(professionalUid, patientUid));
    const [professionalSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(professionalRef),
      transaction.get(assignmentRef)
    ]);
    if (!assignmentSnapshot.exists) return { released: false };

    transaction.delete(assignmentRef);
    if (professionalSnapshot.exists && isFreeProfessionalProfile(professionalSnapshot.data() || {})) {
      transaction.update(professionalRef, {
        pacientesEnCuenta: Math.max(0, patientCountForProfile(professionalSnapshot.data() || {}) - 1)
      });
    }
    return { released: true };
  });
}

async function releasePatientSlotsForPatient({ db, patientUid }) {
  if (!db || !patientUid) return { released: 0 };
  const snapshot = await db.collectionGroup(QUOTA_ASSIGNMENTS_COLLECTION)
    .where("patientUid", "==", patientUid)
    .get();
  const results = await Promise.all(snapshot.docs.map((assignment) => (
    releaseProfessionalPatientSlot({
      db,
      patientUid,
      professionalUid: String(assignment.data()?.professionalUid || "")
    })
  )));
  return { released: results.filter((result) => result.released).length };
}

module.exports = {
  ProfessionalPatientQuotaError,
  QUOTA_ASSIGNMENTS_COLLECTION,
  assertPatientSlotAvailable,
  assignPatientSlotInTransaction,
  isFreeProfessionalProfile,
  moveProfessionalPatientSlotInTransaction,
  patientCountForProfile,
  patientLimitForProfile,
  professionalPlanAllowsPatientAccess,
  quotaAssignmentData,
  quotaAssignmentPath,
  releasePatientSlotsForPatient,
  releaseProfessionalPatientSlot
};
