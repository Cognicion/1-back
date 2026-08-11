const { HttpsError } = require("firebase-functions/v2/https");

const ADMIN_ROLES = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);
const PROFESSIONAL_ROLES = new Set(["medico", "doctor", "psicologo", "enfermeriasaludmental"]);

function normalized(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function isAdmin(profile = {}, auth = {}) {
  const roles = Array.isArray(profile.roles) ? profile.roles : Object.entries(profile.roles || {}).filter(([, active]) => active).map(([role]) => role);
  return auth.uid === "NQ0CU5PSDBUgVrk56sjPEVhOs2D3" || auth.token?.admin === true || [profile.rol, profile.role, ...roles].some((role) => ADMIN_ROLES.has(normalized(role))) || profile.admin === true || profile.esAdmin === true;
}

function isProfessional(profile = {}) {
  const roles = Array.isArray(profile.roles) ? profile.roles : Object.entries(profile.roles || {}).filter(([, active]) => active).map(([role]) => role);
  return [profile.rol, profile.role, profile.tipoUsuario, ...roles].some((role) => PROFESSIONAL_ROLES.has(normalized(role)));
}

function patientAllowsProfessionalAccess(patient = {}, uid = "") {
  if (!uid) return false;
  const direct = [patient.uidMedico, patient.medicoUid, patient.medicoTratanteUid, patient.creadoPor, patient.idMedico, patient.professionalUid];
  if (direct.includes(uid)) return true;
  if ([patient.medicosAutorizados, patient.profesionalesAutorizados, patient.medicosAsignados].some((list) => Array.isArray(list) && list.includes(uid))) return true;
  const permissions = patient.permisosMedicos || patient.permisos || {};
  const permission = permissions[uid];
  return permission === true || permission?.lectura === true || permission?.read === true || permission?.activo === true;
}

async function assertAuthorizedProfessional(request, db, patientId) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  if (!patientId || typeof patientId !== "string" || patientId.length > 160) throw new HttpsError("invalid-argument", "Paciente inválido.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  const actor = actorSnap.exists ? actorSnap.data() || {} : {};
  if (!isAdmin(actor, request.auth)) {
    if (!isProfessional(actor)) throw new HttpsError("permission-denied", "Solo personal clínico autorizado puede solicitar este análisis.");
    const patientSnap = await db.doc(`usuarios/${patientId}`).get();
    if (!patientSnap.exists || !patientAllowsProfessionalAccess(patientSnap.data() || {}, request.auth.uid)) throw new HttpsError("permission-denied", "No tienes acceso a este paciente.");
    return { actor, patient: patientSnap.data() || {}, patientSnap, isAdmin: false };
  }
  const patientSnap = await db.doc(`usuarios/${patientId}`).get();
  if (!patientSnap.exists) throw new HttpsError("not-found", "Paciente no encontrado.");
  return { actor, patient: patientSnap.data() || {}, patientSnap, isAdmin: true };
}

async function assertAdmin(request, db) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  const actorSnap = await db.doc(`usuarios/${request.auth.uid}`).get();
  if (!actorSnap.exists || !isAdmin(actorSnap.data() || {}, request.auth)) throw new HttpsError("permission-denied", "Acceso exclusivo para administradores.");
  return actorSnap.data() || {};
}

module.exports = { normalized, isAdmin, isProfessional, patientAllowsProfessionalAccess, assertAuthorizedProfessional, assertAdmin };
