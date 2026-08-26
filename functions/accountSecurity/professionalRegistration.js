"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { accountDeletionTombstonePath } = require("./accountDeletion");

if (!admin.apps.length) admin.initializeApp();

const REGION = "us-central1";
const LEGAL_VERSION = "2026-08-01";
const PROFESSIONAL_ROLES = new Set([
  "medico",
  "psicologo",
  "enfermeria_salud_mental"
]);
const PROFESSIONAL_REGISTRATION_MODES = Object.freeze({
  AUTHORIZATION_CODE: "codigo_admin",
  FREE: "gratuita"
});
const FREE_PROFESSIONAL_PLAN = "profesional_gratuito";
const AUTHORIZED_PROFESSIONAL_PLAN = "profesional_codigo";
const FREE_PATIENT_LIMIT = 5;

class ProfessionalRegistrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProfessionalRegistrationError";
    this.code = code;
  }
}

function requiredText(value, field, maxLength) {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maxLength) {
    throw new ProfessionalRegistrationError(
      "invalid-argument",
      `El campo ${field} es obligatorio y debe tener como máximo ${maxLength} caracteres.`
    );
  }
  return normalized;
}

function normalizeAuthorizationCode(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
  if (!normalized || normalized.length > 64 || !/^[A-Z0-9-]+$/u.test(normalized)) {
    throw new ProfessionalRegistrationError("invalid-argument", "El código de autorización no es válido.");
  }
  return normalized;
}

function normalizeProfessionalRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!PROFESSIONAL_ROLES.has(normalized)) {
    throw new ProfessionalRegistrationError("invalid-argument", "El rol profesional solicitado no está permitido.");
  }
  return normalized;
}

function normalizeRegistrationMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === PROFESSIONAL_REGISTRATION_MODES.FREE) {
    return PROFESSIONAL_REGISTRATION_MODES.FREE;
  }
  if (normalized === PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE) {
    return PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE;
  }
  throw new ProfessionalRegistrationError(
    "invalid-argument",
    "Selecciona si deseas una cuenta gratuita o registrarte con código de autorización."
  );
}

function dateFromFirestore(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return new Date(value);
  return null;
}

function codeAllowsRole(codeData, requestedRole) {
  if (Array.isArray(codeData.rolesPermitidos)) {
    const explicitRoles = codeData.rolesPermitidos
      .map((role) => String(role || "").trim().toLowerCase())
      .filter((role) => PROFESSIONAL_ROLES.has(role));
    return explicitRoles.includes(requestedRole);
  }

  if (codeData.rolPermitido !== undefined && codeData.rolPermitido !== null) {
    return String(codeData.rolPermitido).trim().toLowerCase() === requestedRole;
  }

  // Compatibilidad con los códigos ya emitidos por el panel, donde `tipo:
  // "medico"` identifica históricamente al código profesional y no al rol
  // elegido. Aun en ese formato, el rol queda limitado por la lista del servidor.
  return ["medico", "profesional"].includes(String(codeData.tipo || "").trim().toLowerCase())
    && PROFESSIONAL_ROLES.has(requestedRole);
}

function roleSpecialty(role) {
  if (role === "psicologo") return "Psicologia";
  if (role === "enfermeria_salud_mental") return "Enfermeria / Salud Mental";
  return "";
}

function buildProfessionalProfile({
  authorizationCode,
  authorizationData,
  email,
  mode,
  name,
  now,
  role
}) {
  const timestamp = now.toISOString();
  const isFree = mode === PROFESSIONAL_REGISTRATION_MODES.FREE;
  const profile = {
    nombre: name,
    email,
    rol: role,
    tieneCuenta: true,
    estado: "activo",
    unidad: "",
    especialidad: roleSpecialty(role),
    institucion: "",
    cedula: "",
    aceptoAvisoPrivacidad: true,
    fechaAceptacionAviso: timestamp,
    versionAvisoPrivacidad: LEGAL_VERSION,
    fechaCreacion: timestamp,
    modalidadRegistroProfesional: mode,
    planCuentaProfesional: isFree ? FREE_PROFESSIONAL_PLAN : AUTHORIZED_PROFESSIONAL_PLAN,
    limitePacientes: isFree ? FREE_PATIENT_LIMIT : null,
    pacientesEnCuenta: 0
  };
  if (!isFree) {
    profile.creadoConCodigoAutorizacion = authorizationCode;
    profile.autorizadoPorAdminUid = String(authorizationData?.creadoPorUid || "");
  }
  return profile;
}

function createProfessionalRegistrationService({ db, now = () => new Date() }) {
  if (!db || typeof db.doc !== "function" || typeof db.runTransaction !== "function") {
    throw new TypeError("Se requiere una instancia válida de Firestore Admin.");
  }

  return Object.freeze({
    async register({ auth, data = {} }) {
      const uid = String(auth?.uid || "").trim();
      if (!uid) throw new ProfessionalRegistrationError("unauthenticated", "Debes iniciar sesión para completar el registro.");

      const email = String(auth?.token?.email || "").trim().toLowerCase();
      if (!email) {
        throw new ProfessionalRegistrationError(
          "failed-precondition",
          "La cuenta autenticada no contiene un correo válido."
        );
      }
      if (auth?.token?.email_verified !== true) {
        throw new ProfessionalRegistrationError(
          "failed-precondition",
          "Verifica tu correo electrónico antes de completar el registro profesional."
        );
      }
      if (data.aceptaAviso !== true || data.aceptaBeta !== true) {
        throw new ProfessionalRegistrationError(
          "failed-precondition",
          "Debes aceptar el Aviso de Privacidad y el Consentimiento Beta."
        );
      }

      const name = requiredText(data.nombre, "nombre", 160);
      const role = normalizeProfessionalRole(data.rol);
      const mode = normalizeRegistrationMode(data.modalidadRegistro || PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE);
      const authorizationCode = mode === PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE
        ? normalizeAuthorizationCode(data.codigoAutorizacion)
        : "";
      const codeRef = authorizationCode
        ? db.doc(`codigosAutorizacionMedico/${authorizationCode}`)
        : null;
      const profileRef = db.doc(`usuarios/${uid}`);
      const deletionTombstoneRef = db.doc(accountDeletionTombstonePath(uid));

      return db.runTransaction(async (transaction) => {
        const [profileSnapshot, codeSnapshot, deletionTombstoneSnapshot] = await Promise.all([
          transaction.get(profileRef),
          codeRef ? transaction.get(codeRef) : Promise.resolve(null),
          transaction.get(deletionTombstoneRef)
        ]);

        if (deletionTombstoneSnapshot.exists) {
          throw new ProfessionalRegistrationError(
            "failed-precondition",
            "Esta cuenta está en proceso de eliminación y no puede volver a registrarse."
          );
        }

        if (profileSnapshot.exists) {
          const existing = profileSnapshot.data() || {};
          const sameIdentity = existing.rol === role
            && String(existing.email || "").trim().toLowerCase() === email;
          const sameMode = mode === PROFESSIONAL_REGISTRATION_MODES.FREE
            ? existing.modalidadRegistroProfesional === PROFESSIONAL_REGISTRATION_MODES.FREE
            : existing.creadoConCodigoAutorizacion === authorizationCode;
          if (sameIdentity && sameMode) {
            return { alreadyRegistered: true, role, uid };
          }
          throw new ProfessionalRegistrationError(
            "already-exists",
            "La cuenta autenticada ya tiene un perfil registrado."
          );
        }

        if (codeRef && !codeSnapshot.exists) {
          throw new ProfessionalRegistrationError("not-found", "El código de autorización no existe.");
        }

        const currentDate = now();
        const codeData = codeSnapshot?.data?.() || {};
        if (codeRef) {
          if (codeData.usado !== false) {
            throw new ProfessionalRegistrationError("failed-precondition", "El código de autorización ya fue utilizado.");
          }

          const expiration = dateFromFirestore(codeData.expiraEn);
          if (!expiration || Number.isNaN(expiration.getTime()) || expiration.getTime() <= currentDate.getTime()) {
            throw new ProfessionalRegistrationError(
              "failed-precondition",
              "El código de autorización expiró. Solicita uno nuevo al administrador."
            );
          }
          if (!codeAllowsRole(codeData, role)) {
            throw new ProfessionalRegistrationError(
              "permission-denied",
              "El código de autorización no permite el rol profesional solicitado."
            );
          }

          const issuerUid = String(codeData.creadoPorUid || "").trim();
          if (!issuerUid) {
            throw new ProfessionalRegistrationError("permission-denied", "El código no tiene un emisor administrativo válido.");
          }
          const issuerSnapshot = await transaction.get(db.doc(`usuarios/${issuerUid}`));
          if (!issuerSnapshot.exists || issuerSnapshot.data()?.rol !== "admin") {
            throw new ProfessionalRegistrationError("permission-denied", "El código no fue emitido por un administrador válido.");
          }
        }

        const profile = buildProfessionalProfile({
          authorizationCode,
          authorizationData: codeData,
          email,
          mode,
          name,
          now: currentDate,
          role
        });

        transaction.create(profileRef, profile);
        if (codeRef) {
          transaction.update(codeRef, {
            usado: true,
            usadoPorUid: uid,
            usadoPorEmail: email,
            usadoPorNombre: name,
            usadoPorRol: role,
            usadoEn: currentDate.toISOString()
          });
        }

        return { alreadyRegistered: false, role, uid };
      });
    }
  });
}

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createProfessionalRegistrationService({ db: admin.firestore() });
  }
  return serviceInstance;
}

async function registerProfessionalRequest(request) {
  try {
    return await getService().register({ auth: request.auth, data: request.data || {} });
  } catch (error) {
    if (error instanceof ProfessionalRegistrationError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error("[ACCOUNT_SECURITY] Error al registrar perfil profesional", {
      code: error?.code || error?.name || "internal"
    });
    throw new HttpsError("internal", "No fue posible completar el registro profesional.");
  }
}

const registerProfessional = onCall({ region: REGION, timeoutSeconds: 30 }, registerProfessionalRequest);
const registerProfessionalWithCode = onCall(
  { region: REGION, timeoutSeconds: 30 },
  (request) => registerProfessionalRequest({
    ...request,
    data: {
      ...(request.data || {}),
      modalidadRegistro: PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE
    }
  })
);

module.exports = {
  AUTHORIZED_PROFESSIONAL_PLAN,
  FREE_PATIENT_LIMIT,
  FREE_PROFESSIONAL_PLAN,
  LEGAL_VERSION,
  PROFESSIONAL_REGISTRATION_MODES,
  PROFESSIONAL_ROLES,
  ProfessionalRegistrationError,
  buildProfessionalProfile,
  codeAllowsRole,
  createProfessionalRegistrationService,
  normalizeAuthorizationCode,
  normalizeProfessionalRole,
  normalizeRegistrationMode,
  registerProfessional,
  registerProfessionalRequest,
  registerProfessionalWithCode
};
