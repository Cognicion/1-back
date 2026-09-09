"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { isAdmin, isProfessional } = require("../clinicalAnalytics/access");
const { accountDeletionTombstonePath } = require("./accountDeletion");
const { FREE_PATIENT_LIMIT, FREE_PROFESSIONAL_PLAN, AUTHORIZED_PROFESSIONAL_PLAN } = require("./professionalRegistration");

if (!admin.apps.length) admin.initializeApp();

const REGION = "us-central1";
const AUTH_DIRECTORY_LIMIT = 5000;
const INCOMPLETE_REGISTRATION_ACCOUNT_TYPE = "registro_incompleto";
const MEMBERSHIP_TYPES = Object.freeze({
  FREE: "gratuita",
  PRO: "pro"
});
const PROFILE_ROLES = new Set([
  "paciente",
  "medico",
  "enfermeria_salud_mental",
  "psicologo"
]);

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

function normalizeProfileRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (PROFILE_ROLES.has(normalized)) return normalized;
  throw new MembershipAdministrationError(
    "invalid-argument",
    "Selecciona un rol de paciente o personal clínico. El rol Admin no puede asignarse al reparar un registro."
  );
}

function requiredProfileName(value) {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 160) {
    throw new MembershipAdministrationError(
      "invalid-argument",
      "El nombre es obligatorio y debe tener como máximo 160 caracteres."
    );
  }
  return normalized;
}

function professionalSpecialty(role) {
  if (role === "psicologo") return "Psicologia";
  if (role === "enfermeria_salud_mental") return "Enfermeria / Salud Mental";
  return "";
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
  if (!authAdmin
      || typeof authAdmin.deleteUser !== "function"
      || typeof authAdmin.getUser !== "function"
      || typeof authAdmin.listUsers !== "function") {
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

  async function completePendingAuthUserProfile(auth, data = {}) {
    const actorUid = await requireAdministrator(auth);
    const targetUid = requireUid(data.uidUsuario);
    if (targetUid === actorUid) {
      throw new MembershipAdministrationError(
        "invalid-argument",
        "La cuenta administrativa actual no puede repararse desde este flujo."
      );
    }

    const name = requiredProfileName(data.nombre);
    const role = normalizeProfileRole(data.rol);
    const membershipType = normalizeMembershipType(data.tipoMembresia);
    let authUser;
    try {
      authUser = await authAdmin.getUser(targetUid);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new MembershipAdministrationError(
          "not-found",
          "La cuenta ya no existe en Firebase Authentication. Actualiza la lista de usuarios."
        );
      }
      throw error;
    }

    const email = String(authUser.email || "").trim().toLowerCase();
    if (!email) {
      throw new MembershipAdministrationError(
        "failed-precondition",
        "La cuenta de Authentication no tiene un correo válido."
      );
    }
    if (authUser.emailVerified !== true) {
      throw new MembershipAdministrationError(
        "failed-precondition",
        "El usuario debe verificar su correo antes de que administración complete el perfil."
      );
    }
    if (authUser.disabled === true) {
      throw new MembershipAdministrationError(
        "failed-precondition",
        "La cuenta de Authentication está deshabilitada."
      );
    }

    const profileRef = db.doc(`usuarios/${targetUid}`);
    const tombstoneRef = db.doc(accountDeletionTombstonePath(targetUid));
    const currentDate = now();
    const timestamp = currentDate.toISOString();
    const isProfessionalRole = role !== "paciente";
    const profile = {
      nombre: name,
      email,
      rol: role,
      tieneCuenta: true,
      estado: "activo",
      unidad: "",
      institucion: "",
      fechaCreacion: String(authUser.metadata?.creationTime || timestamp),
      tipoMembresia: membershipType,
      registroCompletadoPorAdmin: true,
      registroCompletadoPorAdminUid: actorUid,
      registroCompletadoEn: timestamp,
      requiereConfirmacionConsentimientosLegales: true
    };
    if (isProfessionalRole) {
      Object.assign(profile, {
        especialidad: professionalSpecialty(role),
        cedula: "",
        modalidadRegistroProfesional: membershipType === MEMBERSHIP_TYPES.PRO
          ? "asignacion_admin"
          : "gratuita",
        planCuentaProfesional: membershipType === MEMBERSHIP_TYPES.PRO
          ? AUTHORIZED_PROFESSIONAL_PLAN
          : FREE_PROFESSIONAL_PLAN,
        limitePacientes: membershipType === MEMBERSHIP_TYPES.PRO
          ? null
          : FREE_PATIENT_LIMIT,
        pacientesEnCuenta: 0
      });
    }

    await db.runTransaction(async (transaction) => {
      const [profileSnapshot, tombstoneSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(tombstoneRef)
      ]);
      if (profileSnapshot.exists) {
        throw new MembershipAdministrationError(
          "already-exists",
          "La cuenta ya tiene un perfil. Actualiza la lista antes de modificarla."
        );
      }
      if (tombstoneSnapshot.exists) {
        throw new MembershipAdministrationError(
          "failed-precondition",
          "La cuenta participa en un proceso de eliminación y no puede repararse."
        );
      }
      transaction.set(profileRef, profile);
    });

    return {
      rol: role,
      tipoMembresia: membershipType,
      uid: targetUid
    };
  }

  async function deletePendingAuthUser(auth, data = {}) {
    const actorUid = await requireAdministrator(auth);
    const targetUid = requireUid(data.uidUsuario);
    if (targetUid === actorUid) {
      throw new MembershipAdministrationError(
        "invalid-argument",
        "La cuenta administrativa actual no puede eliminarse desde este flujo."
      );
    }

    const profileRef = db.doc(`usuarios/${targetUid}`);
    const tombstoneRef = db.doc(accountDeletionTombstonePath(targetUid));
    const currentDate = now();
    await db.runTransaction(async (transaction) => {
      const [profileSnapshot, tombstoneSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(tombstoneRef)
      ]);
      if (profileSnapshot.exists) {
        throw new MembershipAdministrationError(
          "failed-precondition",
          "La cuenta ya tiene un perfil. Debe eliminarse con el flujo correspondiente a su rol."
        );
      }
      if (tombstoneSnapshot.exists) {
        const tombstone = tombstoneSnapshot.data() || {};
        if (tombstone.accountUid !== targetUid
            || tombstone.accountType !== INCOMPLETE_REGISTRATION_ACCOUNT_TYPE) {
          throw new MembershipAdministrationError(
            "failed-precondition",
            "La cuenta participa en otro proceso de eliminación."
          );
        }
      }
      transaction.set(tombstoneRef, {
        accountType: INCOMPLETE_REGISTRATION_ACCOUNT_TYPE,
        accountUid: targetUid,
        deletedByAdminUid: actorUid,
        deletionPhase: "destructive",
        deletionStartedAt: currentDate.toISOString(),
        deletionState: "in_progress"
      }, { merge: true });
    });

    let authAlreadyMissing = false;
    try {
      await authAdmin.deleteUser(targetUid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
      authAlreadyMissing = true;
    }

    await db.runTransaction(async (transaction) => {
      const tombstoneSnapshot = await transaction.get(tombstoneRef);
      const tombstone = tombstoneSnapshot.exists ? tombstoneSnapshot.data() || {} : {};
      if (tombstone.accountUid !== targetUid
          || tombstone.accountType !== INCOMPLETE_REGISTRATION_ACCOUNT_TYPE) {
        throw new MembershipAdministrationError(
          "aborted",
          "No fue posible confirmar la eliminación del registro pendiente."
        );
      }
      transaction.update(tombstoneRef, {
        deletionCompletedAt: currentDate.toISOString(),
        deletionPhase: "completed",
        deletionState: "completed"
      });
    });

    return {
      auth: authAlreadyMissing ? "no_existia" : "eliminada",
      deleted: true,
      uid: targetUid
    };
  }

  return Object.freeze({
    completePendingAuthUserProfile,
    deletePendingAuthUser,
    listAuthUsers,
    setUserMembership
  });
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
      throw new HttpsError("internal", "No fue posible completar la operación administrativa de usuario.");
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
const completePendingAuthUserProfile = callable(
  "completePendingAuthUserProfile",
  (service, request) => service.completePendingAuthUserProfile(request.auth, request.data || {})
);
const deletePendingAuthUser = callable(
  "deletePendingAuthUser",
  (service, request) => service.deletePendingAuthUser(request.auth, request.data || {})
);

module.exports = {
  AUTH_DIRECTORY_LIMIT,
  INCOMPLETE_REGISTRATION_ACCOUNT_TYPE,
  MEMBERSHIP_TYPES,
  PROFILE_ROLES,
  MembershipAdministrationError,
  completePendingAuthUserProfile,
  createMembershipAdministrationService,
  deletePendingAuthUser,
  listAdminAuthUsers,
  normalizeMembershipType,
  normalizeProfileRole,
  publicAuthUser,
  setUserMembership
};
