"use strict";

const { ACCOUNT_LINKING_ACTIONS } = require("./config");
const { AccountLinkingError } = require("./errors");

const ADMIN_ROLES = new Set([
  "admin",
  "administrador",
  "superadmin",
  "adminprincipal",
  "administradorprincipal"
]);

const PROFESSIONAL_ROLES = new Set([
  "medico",
  "doctor",
  "psicologo",
  "enfermeria",
  "enfermero",
  "enfermeriasaludmental"
]);

const VALID_ACTIONS = new Set(Object.values(ACCOUNT_LINKING_ACTIONS));
const PRIMARY_ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/u;
const CODE_PATTERN = /^COG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u;

function normalizedRole(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[\s_-]+/gu, "")
    .trim();
}

function profileRoles(profile = {}) {
  const arrayRoles = Array.isArray(profile.roles)
    ? profile.roles
    : Object.entries(profile.roles || {})
      .filter(([, enabled]) => enabled === true)
      .map(([role]) => role);

  return [
    profile.rol,
    profile.role,
    profile.tipoRol,
    profile.tipoUsuario,
    profile.perfil,
    profile.cargoSistema,
    ...arrayRoles
  ].map(normalizedRole).filter(Boolean);
}

function isAdmin(profile = {}, auth = {}) {
  return auth.uid === PRIMARY_ADMIN_UID
    || auth.token?.admin === true
    || profile.admin === true
    || profile.esAdmin === true
    || profile.isAdmin === true
    || profile.permisos?.admin === true
    || profile.claims?.admin === true
    || profileRoles(profile).some((role) => ADMIN_ROLES.has(role));
}

function isProfessional(profile = {}, auth = {}) {
  return isAdmin(profile, auth)
    || profileRoles(profile).some((role) => PROFESSIONAL_ROLES.has(role));
}

function isPatient(profile = {}) {
  const roles = profileRoles(profile);
  const hasPrivilegedRole = roles.some((role) => ADMIN_ROLES.has(role) || PROFESSIONAL_ROLES.has(role));
  return roles.includes("paciente")
    && !hasPrivilegedRole
    && profile.admin !== true
    && profile.esAdmin !== true
    && profile.isAdmin !== true
    && profile.permisos?.admin !== true
    && profile.claims?.admin !== true;
}

function requireAuthenticatedUid(auth = null) {
  const uid = String(auth?.uid || "").trim();
  if (!ID_PATTERN.test(uid)) {
    throw new AccountLinkingError("unauthenticated", "Debes iniciar sesión para vincular una cuenta.");
  }
  return uid;
}

function requireAction(value) {
  const action = String(value || "").trim();
  if (!VALID_ACTIONS.has(action)) {
    throw new AccountLinkingError("invalid-argument", "Operación de vinculación no válida.");
  }
  return action;
}

function requireDocumentId(value, label = "identificador") {
  const id = String(value || "").trim();
  if (!ID_PATTERN.test(id)) {
    throw new AccountLinkingError("invalid-argument", `${label} no válido.`);
  }
  return id;
}

function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
  if (!CODE_PATTERN.test(code)) {
    throw new AccountLinkingError("invalid-argument", "Código de vinculación no válido.");
  }
  return code;
}

function codeIsExpired(codeData = {}, nowMs = Date.now()) {
  const expirationMs = Date.parse(String(codeData.expiraEn || ""));
  return !Number.isFinite(expirationMs) || expirationMs < nowMs;
}

function patientAllowsProfessionalAccess(patient = {}, professionalUid = "", permission = {}) {
  if (!professionalUid || !isPatient(patient)) return false;
  if (patient.estado === "vinculado" && patient.vinculadoA) return false;

  const directFields = [
    "creadoPor",
    "ownerUid",
    "createdByUid",
    "medicoUid",
    "uidMedico",
    "medicoTratanteUid",
    "medicoTratanteUID",
    "medicoTratanteId",
    "idMedico",
    "professionalUid"
  ];
  if (directFields.some((field) => patient[field] === professionalUid)) return true;

  const arrayFields = [
    "medicosAutorizados",
    "medicosAutorizadosUid",
    "profesionalesAutorizados",
    "profesionalesAutorizadosIds",
    "medicosAsignados",
    "equipoClinico",
    "equipoClinicoIds",
    "clinicosAutorizados"
  ];
  if (arrayFields.some((field) => Array.isArray(patient[field]) && patient[field].includes(professionalUid))) {
    return true;
  }

  const embeddedPermission = patient.permisosMedicos?.[professionalUid] || patient.permisos?.[professionalUid];
  const grantsRead = (value) => value === true
    || value?.lectura === true
    || value?.read === true
    || value?.activo === true;

  return grantsRead(embeddedPermission) || grantsRead(permission);
}

function assertPatientProfile(profile = {}, options = {}) {
  if (!isPatient(profile)) {
    throw new AccountLinkingError("failed-precondition", "La cuenta de destino no corresponde a un paciente.");
  }
  if (options.requireAccount === true && profile.tieneCuenta !== true) {
    throw new AccountLinkingError("failed-precondition", "La cuenta de destino aún no está activa.");
  }
  if (options.requireProvisional === true && profile.tieneCuenta === true) {
    throw new AccountLinkingError("failed-precondition", "El expediente de origen ya pertenece a una cuenta.");
  }
}

module.exports = {
  assertPatientProfile,
  codeIsExpired,
  isAdmin,
  isPatient,
  isProfessional,
  normalizeCode,
  normalizedRole,
  patientAllowsProfessionalAccess,
  profileRoles,
  requireAction,
  requireAuthenticatedUid,
  requireDocumentId
};
