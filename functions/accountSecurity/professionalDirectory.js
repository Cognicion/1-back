"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { requireAuthenticatedUid } = require("../accountLinking/validation");
const { accountDeletionTombstonePath } = require("./accountDeletion");
const {
  isAdmin,
  isProfessional,
  listAuthorizedPatientSnapshots
} = require("../clinicalAnalytics/access");

if (!admin.apps.length) admin.initializeApp();

const REGION = "us-central1";
const DIRECTORY_ROLES = Object.freeze([
  "admin",
  "medico",
  "psicologo",
  "enfermeria_salud_mental"
]);

class ProfessionalDirectoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProfessionalDirectoryError";
    this.code = code;
  }
}

function publicProfessionalProfile(snapshot) {
  const profile = snapshot.data() || {};
  return {
    id: snapshot.id,
    uid: snapshot.id,
    nombre: String(profile.nombre || "").trim().slice(0, 240),
    email: String(profile.email || profile.correo || "").trim().slice(0, 320),
    rol: String(profile.rol || "").trim().toLowerCase()
  };
}

function createProfessionalDirectoryService({ db }) {
  if (!db || typeof db.doc !== "function" || typeof db.collection !== "function") {
    throw new TypeError("Se requiere una instancia válida de Firestore Admin.");
  }

  async function activeActor(auth) {
    const actorUid = requireAuthenticatedUid(auth);
    const [actorSnapshot, deletionSnapshot] = await Promise.all([
      db.doc(`usuarios/${actorUid}`).get(),
      db.doc(accountDeletionTombstonePath(actorUid)).get()
    ]);
    if (deletionSnapshot.exists) {
      throw new ProfessionalDirectoryError("failed-precondition", "La cuenta está en proceso de eliminación.");
    }
    if (!actorSnapshot.exists) {
      throw new ProfessionalDirectoryError("failed-precondition", "Completa el registro antes de consultar el directorio.");
    }
    return { actor: actorSnapshot.data() || {}, actorUid };
  }

  async function list(auth) {
    const { actorUid } = await activeActor(auth);

    const snapshots = await Promise.all(DIRECTORY_ROLES.map((role) => (
      db.collection("usuarios").where("rol", "==", role).get()
    )));
    const professionals = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((documentSnapshot) => {
        if (documentSnapshot.id === actorUid) return;
        const profile = publicProfessionalProfile(documentSnapshot);
        if (DIRECTORY_ROLES.includes(profile.rol)) professionals.set(profile.id, profile);
      });
    });
    return {
      professionals: [...professionals.values()].sort((left, right) => (
        String(left.nombre || left.email).localeCompare(
          String(right.nombre || right.email),
          "es",
          { sensitivity: "base" }
        )
      ))
    };
  }

  async function listAuthorizedPatientIds(auth) {
    const { actor, actorUid } = await activeActor(auth);
    // Este endpoint alimenta el Panel Médico: un claim administrativo no debe
    // convertirlo en un directorio global. La administración usa sus flujos
    // propios; aquí cada paciente debe tener una relación clínica verificable.
    if (!isAdmin(actor, auth) && !isProfessional(actor)) return { patientIds: [] };
    const snapshots = await listAuthorizedPatientSnapshots({
      db,
      professionalProfile: actor,
      professionalUid: actorUid
    });
    return {
      patientIds: [...new Set(snapshots.map((snapshot) => snapshot.id))].sort()
    };
  }

  return Object.freeze({ list, listAuthorizedPatientIds });
}

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createProfessionalDirectoryService({ db: admin.firestore() });
  }
  return serviceInstance;
}

const listProfessionalDirectory = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  try {
    return await getService().list(request.auth);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProfessionalDirectoryError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error("[PROFESSIONAL_DIRECTORY] Error interno", {
      code: error?.code || error?.name || "internal"
    });
    throw new HttpsError("internal", "No fue posible consultar el directorio profesional.");
  }
});

const listAuthorizedPatientIds = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  try {
    return await getService().listAuthorizedPatientIds(request.auth);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof ProfessionalDirectoryError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error("[AUTHORIZED_PATIENT_DIRECTORY] Error interno", {
      code: error?.code || error?.name || "internal"
    });
    throw new HttpsError("internal", "No fue posible consultar los pacientes autorizados.");
  }
});

module.exports = {
  DIRECTORY_ROLES,
  ProfessionalDirectoryError,
  createProfessionalDirectoryService,
  listAuthorizedPatientIds,
  listProfessionalDirectory,
  publicProfessionalProfile
};
