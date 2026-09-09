"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { isAdmin, isProfessional } = require("../clinicalAnalytics/access");
const { FREE_PATIENT_LIMIT, FREE_PROFESSIONAL_PLAN, AUTHORIZED_PROFESSIONAL_PLAN } = require("./professionalRegistration");

if (!admin.apps.length) admin.initializeApp();

const REGION = "us-central1";
const AUTH_DIRECTORY_LIMIT = 5000;
const MEMBERSHIP_TYPES = Object.freeze({
  FREE: "gratuita",
  PRO: "pro"
});

class MembershipAdministrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MembershipAdministrationError";
    this.code = code;
  }
}

function normalizeMembershipType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === MEMBERSHIP_TYPES.FREE || normalized === MEMBERSHIP_TYPES.PRO) return normalized;
  throw new MembershipAdministrationError("invalid-argument", "La membresía debe ser gratuita o Pro.");
}

function requireUid(value, label = "Usuario") {
  const uid = String(value || "").trim();
  if (!uid || uid.length > 160 || uid.includes("/")) {
    throw new MembershipAdministrationError("invalid-argument", `${label} no válido.`);
  }
  return uid;
}

function publicAuthUser(user = {}) {
  return {
    uid: String(user.uid || ""),
    email: String(user.email || "").trim().toLowerCase().slice(0, 320),
    nombre: String(user.displayName || "").trim().slice(0, 240),
    emailVerificado: user.emailVerified === true,
    deshabilitado: user.disabled === true,
    creadoEnAuth: String(user.metadata?.creationTime || ""),
    ultimoAccesoAuth: String(user.metadata?.lastSignInTime || "")
  };
}

function createMembershipAdministrationService({ authAdmin, db, now = () => new Date() }) {
  if (!authAdmin || typeof authAdmin.listUsers !== "function") {
    throw new TypeError("Se requiere una instancia válida de Firebase Auth Admin.");
  }
  if (!db || typeof db.doc !== "function" || typeof db.runTransaction !== "function") {
    throw new TypeError("Se requiere una instancia válida de Firestore Admin.");
  }

  async function requireAdministrator(auth) {
    const actorUid = requireUid(auth?.uid, "Administrador");
    const actorSnapshot = await db.doc(`usuarios/${actorUid}`).get();
    const actorProfile = actorSnapshot.exists ? actorSnapshot.data() || {} : {};
    if (!isAdmin(actorProfile, auth || {})) {
      throw new MembershipAdministrationError("permission-denied", "Solo administración puede realizar esta operación.");
    }
    return actorUid;
  }

  async function listAuthUsers(auth) {
    await requireAdministrator(auth);
    const users = [];
    let pageToken;
    do {
      const remaining = AUTH_DIRECTORY_LIMIT - users.length;
      if (remaining <= 0) break;
      const page = await authAdmin.listUsers(Math.min(1000, remaining), pageToken);
      users.push(...(page.users || []).map(publicAuthUser));
      pageToken = page.pageToken || undefined;
    } while (pageToken);

    return {
      users,
      truncated: Boolean(pageToken),
      totalReturned: users.length
    };
  }

  async function setUserMembership(auth, data = {}) {
    const actorUid = await requireAdministrator(auth);
    const targetUid = requireUid(data.uidUsuario);
    const tipoMembresia = normalizeMembershipType(data.tipoMembresia);
    const targetRef = db.doc(`usuarios/${targetUid}`);
    const currentDate = now();

    return db.runTransaction(async (transaction) => {
      const targetSnapshot = await transaction.get(targetRef);
      if (!targetSnapshot.exists) {
        throw new MembershipAdministrationError(
          "failed-precondition",
          "La cuenta todavía no tiene un perfil de usuario. Debe completar su registro antes de asignar una membresía."
        );
      }
      const targetProfile = targetSnapshot.data() || {};
      if (isAdmin(targetProfile, {})) {
        throw new MembershipAdministrationError(
          "failed-precondition",
          "La administración se controla por rol y no por membresía."
        );
      }
      if (targetProfile.tieneCuenta === false) {
        throw new MembershipAdministrationError(
          "failed-precondition",
          "La membresía solo se asigna a usuarios con una cuenta de acceso."
        );
      }

      const update = {
        tipoMembresia,
        membresiaActualizadaEn: currentDate.toISOString(),
        membresiaActualizadaPorUid: actorUid
      };
      if (isProfessional(targetProfile)) {
        update.planCuentaProfesional = tipoMembresia === MEMBERSHIP_TYPES.PRO
          ? AUTHORIZED_PROFESSIONAL_PLAN
          : FREE_PROFESSIONAL_PLAN;
        update.limitePacientes = tipoMembresia === MEMBERSHIP_TYPES.PRO
          ? null
          : FREE_PATIENT_LIMIT;
      }

      transaction.update(targetRef, update);
      return {
        tipoMembresia,
        uid: targetUid
      };
    });
  }

  return Object.freeze({ listAuthUsers, setUserMembership });
}

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createMembershipAdministrationService({
      authAdmin: admin.auth(),
      db: admin.firestore()
    });
  }
  return serviceInstance;
}

function callable(name, handler) {
  return onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    try {
      return await handler(getService(), request);
    } catch (error) {
      if (error instanceof MembershipAdministrationError) {
        throw new HttpsError(error.code, error.message);
      }
      logger.error(`[MEMBERSHIP_ADMIN] Error en ${name}`, {
        code: error?.code || error?.name || "internal"
      });
      throw new HttpsError("internal", "No fue posible completar la operación de membresía.");
    }
  });
}

const listAdminAuthUsers = callable(
  "listAdminAuthUsers",
  (service, request) => service.listAuthUsers(request.auth)
);
const setUserMembership = callable(
  "setUserMembership",
  (service, request) => service.setUserMembership(request.auth, request.data || {})
);

module.exports = {
  AUTH_DIRECTORY_LIMIT,
  MEMBERSHIP_TYPES,
  MembershipAdministrationError,
  createMembershipAdministrationService,
  listAdminAuthUsers,
  normalizeMembershipType,
  publicAuthUser,
  setUserMembership
};
