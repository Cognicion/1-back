const { HttpsError } = require("firebase-functions/v2/https");
const {
  isFreeProfessionalProfile,
  professionalPlanAllowsPatientAccess
} = require("../accountSecurity/professionalPatientQuota");
const { accountDeletionTombstoneExists } = require("../accountSecurity/accountDeletion");
const { patientAllowsProfessionalAccess } = require("../accountLinking/validation");

const ADMIN_ROLES = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);
const PROFESSIONAL_ROLES = new Set(["medico", "doctor", "psicologo", "enfermeriasaludmental"]);

function normalized(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function isAdmin(profile = {}, auth = {}) {
  const roles = Array.isArray(profile.roles) ? profile.roles : Object.entries(profile.roles || {}).filter(([, active]) => active).map(([role]) => role);
  return auth.token?.admin === true || [profile.rol, profile.role, ...roles].some((role) => ADMIN_ROLES.has(normalized(role))) || profile.admin === true || profile.esAdmin === true;
}

function isProfessional(profile = {}) {
  const roles = Array.isArray(profile.roles) ? profile.roles : Object.entries(profile.roles || {}).filter(([, active]) => active).map(([role]) => role);
  const professionalRole = [
    profile.rol,
    profile.role,
    profile.tipoUsuario,
    profile.tipoProfesional,
    profile.profesion,
    profile.profession,
    profile.professionalProfile?.role,
    profile.professionalProfile?.profession,
    profile.clinicalProfile?.role,
    profile.clinicalProfile?.profession,
    ...roles
  ].some((role) => {
    const value = normalized(role);
    return PROFESSIONAL_ROLES.has(value) || value.includes("medico") || value.includes("psicolog");
  });
  if (!professionalRole) return false;
  if (!isAdmin(profile)) return true;
  const verifiedClinicalProfile = profile.perfilClinicoHabilitado === true
    || profile.clinicalProfileEnabled === true
    || profile.perfilMedicoVerificado === true
    || profile.medicoVerificado === true
    || profile.professionalProfile?.enabled === true
    || profile.clinicalProfile?.enabled === true;
  const professionalCredentials = Boolean(
    profile.cedulaProfesional
    || profile.cedula
    || profile.cedulaEspecialidad
    || profile.perfilProfesionalActualizado
  );
  return verifiedClinicalProfile || professionalCredentials;
}

async function patientAllowsProfessionalServerAccess({
  assignmentAlreadyValidated = false,
  db,
  patient = {},
  patientId,
  professionalProfile = {},
  professionalUid
}) {
  const [professionalDeleting, patientDeleting] = await Promise.all([
    accountDeletionTombstoneExists({ db, uid: professionalUid }),
    accountDeletionTombstoneExists({ db, uid: patientId })
  ]);
  if (professionalDeleting || patientDeleting) return false;
  if (patient.estado === "vinculado" && patient.vinculadoA) return false;
  let relationAllows = patientAllowsProfessionalAccess(patient, professionalUid);
  if (!relationAllows) {
    const permissionSnapshot = await db.doc(
      `usuarios/${patientId}/permisosMedicos/${professionalUid}`
    ).get();
    const permission = permissionSnapshot.exists ? permissionSnapshot.data() || {} : {};
    relationAllows = permission.lectura === true
      || permission.read === true
      || permission.activo === true;
  }
  if (!relationAllows) return false;
  if (assignmentAlreadyValidated && isFreeProfessionalProfile(professionalProfile)) return true;
  return professionalPlanAllowsPatientAccess({
    db,
    patientUid: patientId,
    professionalProfile,
    professionalUid
  });
}

async function listAuthorizedPatientSnapshots({ db, professionalProfile = {}, professionalUid }) {
  if (await accountDeletionTombstoneExists({ db, uid: professionalUid })) return [];
  if (isFreeProfessionalProfile(professionalProfile)) {
    const assignments = await db
      .collection(`usuarios/${professionalUid}/patientQuotaAssignments`)
      .where("estado", "==", "activo")
      .get();
    const patientSnapshots = await Promise.all(assignments.docs.map((assignment) => (
      db.doc(`usuarios/${assignment.id}`).get()
    )));
    const authorized = await Promise.all(patientSnapshots.map(async (patientSnapshot) => {
      if (!patientSnapshot.exists) return null;
      const allowed = await patientAllowsProfessionalServerAccess({
        assignmentAlreadyValidated: true,
        db,
        patient: patientSnapshot.data() || {},
        patientId: patientSnapshot.id,
        professionalProfile,
        professionalUid
      });
      return allowed ? patientSnapshot : null;
    }));
    return authorized.filter(Boolean);
  }

  const snapshot = await db.collection("usuarios").where("rol", "==", "paciente").get();
  const authorized = await Promise.all(snapshot.docs.map(async (patientSnapshot) => {
    const allowed = await patientAllowsProfessionalServerAccess({
      db,
      patient: patientSnapshot.data() || {},
      patientId: patientSnapshot.id,
      professionalProfile,
      professionalUid
    });
    return allowed ? patientSnapshot : null;
  }));
  return authorized.filter(Boolean);
}

async function assertAuthorizedProfessional(request, db, patientId) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  if (!patientId || typeof patientId !== "string" || patientId.length > 160) throw new HttpsError("invalid-argument", "Paciente inválido.");
  const [actorDeleting, patientDeleting] = await Promise.all([
    accountDeletionTombstoneExists({ db, uid: request.auth.uid }),
    accountDeletionTombstoneExists({ db, uid: patientId })
  ]);
  if (actorDeleting || patientDeleting) throw new HttpsError("permission-denied", "La cuenta está en proceso de eliminación.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  if (!isAdmin(actor, request.auth)) {
    if (!isProfessional(actor)) throw new HttpsError("permission-denied", "Solo personal clínico autorizado puede solicitar este análisis.");
    const patientSnap = await db.doc(`usuarios/${patientId}`).get();
    const patient = patientSnap.exists ? patientSnap.data() || {} : {};
    const allowed = patientSnap.exists && await patientAllowsProfessionalServerAccess({
      db,
      patient,
      patientId,
      professionalProfile: actor,
      professionalUid: request.auth.uid
    });
    if (!allowed) throw new HttpsError("permission-denied", "No tienes acceso a este paciente.");
    return { actor, patient: patientSnap.data() || {}, patientSnap, isAdmin: false };
  }
  const patientSnap = await db.doc(`usuarios/${patientId}`).get();
  if (!patientSnap.exists) throw new HttpsError("not-found", "Paciente no encontrado.");
  return { actor, patient: patientSnap.data() || {}, patientSnap, isAdmin: true };
}

async function assertAuthorizedPatientClinician(request, db, patientId) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  if (!patientId || typeof patientId !== "string" || patientId.length > 160) throw new HttpsError("invalid-argument", "Paciente inválido.");
  const [actorDeleting, patientDeleting] = await Promise.all([
    accountDeletionTombstoneExists({ db, uid: request.auth.uid }),
    accountDeletionTombstoneExists({ db, uid: patientId })
  ]);
  if (actorDeleting || patientDeleting) throw new HttpsError("permission-denied", "La cuenta está en proceso de eliminación.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  if (!isProfessional(actor)) {
    throw new HttpsError("permission-denied", "El perfil individual está disponible únicamente para personal clínico autorizado.");
  }
  const patientSnap = await db.doc(`usuarios/${patientId}`).get();
  if (!patientSnap.exists) throw new HttpsError("not-found", "Paciente no encontrado.");
  const patient = patientSnap.data() || {};
  if (!await patientAllowsProfessionalServerAccess({
    db,
    patient,
    patientId,
    professionalProfile: actor,
    professionalUid: request.auth.uid
  })) {
    throw new HttpsError("permission-denied", "No tienes acceso a este paciente.");
  }
  return { actor, patient, patientSnap, isAdmin: isAdmin(actor, request.auth) };
}

async function assertAdmin(request, db) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  if (await accountDeletionTombstoneExists({ db, uid: request.auth.uid })) {
    throw new HttpsError("permission-denied", "La cuenta está en proceso de eliminación.");
  }
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  if (!actorSnap.exists || !isAdmin(actorSnap.data() || {}, request.auth)) throw new HttpsError("permission-denied", "Acceso exclusivo para administradores.");
  return actorSnap.data() || {};
}

module.exports = {
  normalized,
  isAdmin,
  isProfessional,
  listAuthorizedPatientSnapshots,
  patientAllowsProfessionalAccess,
  patientAllowsProfessionalServerAccess,
  assertAuthorizedProfessional,
  assertAuthorizedPatientClinician,
  assertAdmin
};
