"use strict";

const crypto = require("node:crypto");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { AccountLinkingError } = require("../accountLinking/errors");
const { accountDeletionTombstonePath } = require("./accountDeletion");
const {
  assertPatientProfile,
  isAdmin,
  isProfessional,
  patientAllowsProfessionalAccess,
  requireAuthenticatedUid,
  requireDocumentId
} = require("../accountLinking/validation");
const {
  ProfessionalPatientQuotaError,
  assignPatientSlotInTransaction,
  isFreeProfessionalProfile,
  patientCountForProfile,
  patientLimitForProfile,
  quotaAssignmentPath
} = require("./professionalPatientQuota");

if (!admin.apps.length) admin.initializeApp();

const REGION = "us-central1";
const LEGAL_VERSION = "2026-08-01";
const INCOMPLETE_REGISTRATION_ACCOUNT_TYPE = "registro_incompleto";
const PATIENT_FOLIO_COUNTER_COLLECTION = "systemCounters";
const PATIENT_FOLIO_COUNTER_PREFIX = "expedienteCognicion";
const PATIENT_FOLIO_INITIAL_SEQUENCE = 999;
const PATIENT_CREATION_OPERATIONS_COLLECTION = "patientCreationOperations";
const PERMISSION_ROLES = Object.freeze({
  tratante: Object.freeze({
    lectura: true,
    agregarNotas: true,
    editarPaciente: true,
    administrarPermisos: true,
    rolPermiso: "tratante"
  }),
  colaborador: Object.freeze({
    lectura: true,
    agregarNotas: true,
    editarPaciente: false,
    administrarPermisos: false,
    rolPermiso: "colaborador"
  }),
  estudiante: Object.freeze({
    lectura: true,
    agregarNotas: false,
    editarPaciente: false,
    administrarPermisos: false,
    rolPermiso: "estudiante"
  })
});
const PATIENT_PERMISSION_ACTIONS = new Set(["otorgar", "actualizar", "revocar"]);
const PATIENT_DIRECT_ACCESS_FIELDS = Object.freeze([
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
]);
const PATIENT_ARRAY_ACCESS_FIELDS = Object.freeze([
  "medicosAutorizados",
  "medicosAutorizadosUid",
  "profesionalesAutorizados",
  "profesionalesAutorizadosIds",
  "medicosAsignados",
  "equipoClinico",
  "equipoClinicoIds",
  "clinicosAutorizados"
]);
const FORBIDDEN_PATIENT_FIELDS = new Set([
  "admin",
  "autorizadoPorAdminUid",
  "cargoSistema",
  "claims",
  "creadoConCodigoAutorizacion",
  "customClaims",
  "creadoPor",
  "expedienteCognicion",
  "ownerUid",
  "createdByUid",
  "medicoUid",
  "uidMedico",
  "medicoTratanteUid",
  "medicoTratanteUID",
  "medicoTratanteId",
  "idMedico",
  "professionalUid",
  "medicosAutorizados",
  "medicosAutorizadosUid",
  "profesionalesAutorizados",
  "profesionalesAutorizadosIds",
  "medicosAsignados",
  "equipoClinico",
  "equipoClinicoIds",
  "clinicosAutorizados",
  "permisosMedicos",
  "esAdmin",
  "isAdmin",
  "limitePacientes",
  "modalidadRegistroProfesional",
  "pacientesEnCuenta",
  "perfil",
  "perfilClinico",
  "perfilProfesional",
  "permisos",
  "permisosFormatos",
  "planCuentaProfesional",
  "rol",
  "role",
  "roles",
  "tipoCuenta",
  "tipoProfesional",
  "tipoRol",
  "tipoUsuario",
  "tieneCuenta",
  "vinculacionReservaAccion",
  "vinculacionReservaActorUid",
  "vinculacionReservaCodigo",
  "vinculacionReservaDestinoUid",
  "vinculacionReservaEstado",
  "vinculadoA"
]);

class ProfessionalPatientAccessError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProfessionalPatientAccessError";
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, label, maxLength = 200) {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maxLength) {
    throw new ProfessionalPatientAccessError(
      "invalid-argument",
      `${label} es obligatorio y debe tener como máximo ${maxLength} caracteres.`
    );
  }
  return normalized;
}

function normalizeEmail(value, label = "El correo") {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new ProfessionalPatientAccessError("invalid-argument", `${label} no es válido.`);
  }
  return email;
}

function normalizePermissionRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return Object.hasOwn(PERMISSION_ROLES, role) ? role : "estudiante";
}

function sanitizePatientPayload(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProfessionalPatientAccessError("invalid-argument", "Los datos del paciente no son válidos.");
  }
  return Object.fromEntries(Object.entries(value).filter(([field]) => (
    !FORBIDDEN_PATIENT_FIELDS.has(field)
      && field !== "__proto__"
      && field !== "constructor"
      && field !== "prototype"
  )));
}

function requirePatientCreationOperationId(value) {
  const operationId = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,159}$/u.test(operationId)) {
    throw new ProfessionalPatientAccessError(
      "invalid-argument",
      "La operación de alta del paciente no es válida."
    );
  }
  return operationId;
}

function patientCreationOperationPath(professionalUid, operationId) {
  return `usuarios/${professionalUid}/${PATIENT_CREATION_OPERATIONS_COLLECTION}/${operationId}`;
}

function canonicalFingerprintValue(value) {
  if (Array.isArray(value)) return value.map(canonicalFingerprintValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => [key, canonicalFingerprintValue(value[key])]));
}

function patientCreationPayloadFingerprint(patientPayload = {}) {
  const { fechaCreacion: _volatileCreationDate, ...stablePayload } = patientPayload;
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalFingerprintValue(stablePayload)))
    .digest("hex");
}

function completedPatientCreationResult({ actorUid, operationId, operationSnapshot, payloadFingerprint }) {
  if (!operationSnapshot?.exists) return null;
  const operation = operationSnapshot.data() || {};
  if (
    operation.estado !== "completada"
    || operation.operationId !== operationId
    || operation.professionalUid !== actorUid
    || !operation.patientUid
    || !operation.expedienteCognicion
  ) {
    throw new ProfessionalPatientAccessError(
      "failed-precondition",
      "La operación de alta existente no tiene un resultado válido."
    );
  }
  if (operation.payloadFingerprint !== payloadFingerprint) {
    throw new ProfessionalPatientAccessError(
      "already-exists",
      "Ese identificador de operación ya se utilizó para otro paciente."
    );
  }
  return {
    deduplicated: true,
    expedienteCognicion: operation.expedienteCognicion,
    id: operation.patientUid,
    quota: operation.quota || { current: null, limit: null }
  };
}

function patientFolioYear(date = new Date()) {
  return String(date.getFullYear()).slice(-2);
}

function patientFolioCounterPath(year) {
  return `${PATIENT_FOLIO_COUNTER_COLLECTION}/${PATIENT_FOLIO_COUNTER_PREFIX}-${year}`;
}

function patientFolioFromProfile(profile = {}) {
  return String(
    profile.expedienteCognicion
      || profile.datosInstitucionales?.expedienteCognicion
      || ""
  ).trim();
}

function patientFolioSequence(value, expectedYear) {
  const match = /^C(\d+)-(\d{2})$/u.exec(String(value || "").trim());
  if (!match || match[2] !== expectedYear) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

function storedCounterSequence(counter = {}) {
  const sequence = Number(counter.ultimoConsecutivo);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

async function maximumExistingPatientFolioSequence({ db, year }) {
  const snapshot = await db.collection("usuarios").get();
  return snapshot.docs.reduce((maximum, documentSnapshot) => {
    const sequence = patientFolioSequence(
      patientFolioFromProfile(documentSnapshot.data() || {}),
      year
    );
    return sequence === null ? maximum : Math.max(maximum, sequence);
  }, PATIENT_FOLIO_INITIAL_SEQUENCE);
}

async function initialPatientFolioSequence({ counterRef, db, year }) {
  const counterSnapshot = await counterRef.get();
  const storedSequence = counterSnapshot.exists
    ? storedCounterSequence(counterSnapshot.data() || {})
    : null;
  if (storedSequence !== null && storedSequence >= PATIENT_FOLIO_INITIAL_SEQUENCE) {
    return storedSequence;
  }
  return maximumExistingPatientFolioSequence({ db, year });
}

function permissionData(role, actorUid, now, extra = {}) {
  return {
    ...PERMISSION_ROLES[normalizePermissionRole(role)],
    ...extra,
    fechaOtorgamiento: now.toISOString(),
    otorgadoPor: actorUid
  };
}

function snapshotData(snapshot, message) {
  if (!snapshot?.exists) throw new ProfessionalPatientAccessError("not-found", message);
  return snapshot.data() || {};
}

function assertAccountNotDeleting(snapshot, message = "La cuenta está en proceso de eliminación.") {
  if (snapshot?.exists) {
    throw new ProfessionalPatientAccessError("failed-precondition", message);
  }
}

function profileHasDirectPatientAccess(patient = {}, professionalUid = "") {
  return patientAllowsProfessionalAccess(patient, professionalUid, {});
}

function profileHasOwnerOrTreatingAccess(patient = {}, professionalUid = "") {
  return Boolean(professionalUid)
    && PATIENT_DIRECT_ACCESS_FIELDS.some((field) => patient[field] === professionalUid);
}

function embeddedPatientPermissionRemovalPatch(patient = {}, professionalUid = "") {
  const patch = {};
  for (const field of ["permisosMedicos", "permisos"]) {
    if (patient[field] && typeof patient[field] === "object" && !Array.isArray(patient[field])
        && Object.hasOwn(patient[field], professionalUid)) {
      const nextPermissions = { ...patient[field] };
      delete nextPermissions[professionalUid];
      patch[field] = nextPermissions;
    }
  }
  return patch;
}

function patientAccessRemovalPatch(patient = {}, professionalUid = "") {
  const patch = embeddedPatientPermissionRemovalPatch(patient, professionalUid);
  for (const field of PATIENT_DIRECT_ACCESS_FIELDS) {
    if (patient[field] === professionalUid) patch[field] = "";
  }
  for (const field of PATIENT_ARRAY_ACCESS_FIELDS) {
    if (Array.isArray(patient[field]) && patient[field].includes(professionalUid)) {
      patch[field] = patient[field].filter((uid) => uid !== professionalUid);
    }
  }
  if (["medicoTratanteUid", "medicoTratanteUID", "medicoTratanteId", "idMedico"]
    .some((field) => patient[field] === professionalUid)) {
    patch.medicoTratante = "";
  }
  return patch;
}

function canManagePatientPermissions({ action, actorProfile, actorPermission = {}, actorUid, auth, patient, patientUid, targetUid }) {
  if (actorUid === patientUid || isAdmin(actorProfile, auth)) return true;
  if (action === "revocar" && actorUid === targetUid) return true;
  if (!isProfessional(actorProfile, auth)) return false;
  if (actorPermission.administrarPermisos === true) return true;
  const embeddedPermission = patient.permisosMedicos?.[actorUid] || patient.permisos?.[actorUid];
  if (embeddedPermission?.administrarPermisos === true) return true;
  return profileHasOwnerOrTreatingAccess(patient, actorUid);
}

function quotaResult(profile = {}) {
  return {
    current: patientCountForProfile(profile),
    limited: isFreeProfessionalProfile(profile),
    limit: patientLimitForProfile(profile)
  };
}

function createProfessionalPatientAccessService({ authAdmin = admin.auth(), db, now = () => new Date() }) {
  if (!db || typeof db.doc !== "function" || typeof db.runTransaction !== "function") {
    throw new TypeError("Se requiere una instancia válida de Firestore Admin.");
  }

  async function createProvisionalPatient(auth, data = {}) {
    const actorUid = requireAuthenticatedUid(auth);
    const operationId = requirePatientCreationOperationId(data.operationId);
    const patientPayload = sanitizePatientPayload(data.paciente || {});
    const name = requiredText(patientPayload.nombre || patientPayload.nombreCompleto, "El nombre del paciente", 240);
    const payloadFingerprint = patientCreationPayloadFingerprint(patientPayload);
    const professionalRef = db.doc(`usuarios/${actorUid}`);
    const professionalDeletionRef = db.doc(accountDeletionTombstonePath(actorUid));
    const operationRef = db.doc(patientCreationOperationPath(actorUid, operationId));
    const patientRef = db.collection("usuarios").doc();
    const assignmentRef = db.doc(quotaAssignmentPath(actorUid, patientRef.id));
    const currentDate = now();
    const folioYear = patientFolioYear(currentDate);
    const folioCounterRef = db.doc(patientFolioCounterPath(folioYear));
    const folioSequenceBaseline = await initialPatientFolioSequence({
      counterRef: folioCounterRef,
      db,
      year: folioYear
    });

    return db.runTransaction(async (transaction) => {
      const [
        professionalSnapshot,
        assignmentSnapshot,
        professionalDeletionSnapshot,
        folioCounterSnapshot,
        operationSnapshot
      ] = await Promise.all([
        transaction.get(professionalRef),
        transaction.get(assignmentRef),
        transaction.get(professionalDeletionRef),
        transaction.get(folioCounterRef),
        transaction.get(operationRef)
      ]);
      assertAccountNotDeleting(
        professionalDeletionSnapshot,
        "Esta cuenta profesional está en proceso de eliminación y no puede crear pacientes."
      );
      const professionalProfile = snapshotData(professionalSnapshot, "No se encontró el perfil profesional.");
      if (!isProfessional(professionalProfile, auth)) {
        throw new ProfessionalPatientAccessError(
          "permission-denied",
          "Solo una cuenta profesional puede crear expedientes de pacientes."
        );
      }
      const completedResult = completedPatientCreationResult({
        actorUid,
        operationId,
        operationSnapshot,
        payloadFingerprint
      });
      if (completedResult) return completedResult;

      const storedFolioSequence = folioCounterSnapshot.exists
        ? storedCounterSequence(folioCounterSnapshot.data() || {})
        : null;
      const nextFolioSequence = Math.max(
        PATIENT_FOLIO_INITIAL_SEQUENCE,
        folioSequenceBaseline,
        storedFolioSequence ?? PATIENT_FOLIO_INITIAL_SEQUENCE
      ) + 1;
      const expedienteCognicion = `C${nextFolioSequence}-${folioYear}`;
      const institutionalData = patientPayload.datosInstitucionales
        && typeof patientPayload.datosInstitucionales === "object"
        && !Array.isArray(patientPayload.datosInstitucionales)
        ? patientPayload.datosInstitucionales
        : {};

      const storedPatient = {
        ...patientPayload,
        nombre: name,
        rol: "paciente",
        tieneCuenta: false,
        estado: patientPayload.estado || "activo",
        creadoPor: actorUid,
        ownerUid: actorUid,
        createdByUid: actorUid,
        medicoUid: actorUid,
        medicoTratanteUid: actorUid,
        medicosAutorizados: [actorUid],
        expedienteCognicion,
        datosInstitucionales: {
          ...institutionalData,
          expedienteCognicion
        },
        fechaCreacion: patientPayload.fechaCreacion || currentDate.toISOString()
      };

      transaction.create(patientRef, storedPatient);
      const assigned = assignPatientSlotInTransaction({
        assignmentExists: assignmentSnapshot.exists,
        assignmentRef,
        now: currentDate,
        patientUid: patientRef.id,
        professionalProfile,
        professionalRef,
        professionalUid: actorUid,
        source: "alta_profesional",
        transaction
      });
      const quota = assigned.limited
        ? { current: assigned.count, limit: assigned.limit }
        : { current: null, limit: null };
      transaction.set(folioCounterRef, {
        actualizadoEn: currentDate.toISOString(),
        anio: folioYear,
        tipo: "expediente_cognicion",
        ultimoConsecutivo: nextFolioSequence,
        ...(!folioCounterSnapshot.exists ? {
          fechaInicializacion: currentDate.toISOString(),
          inicializadoDesdeMaximoExistente: folioSequenceBaseline
        } : {})
      }, { merge: true });
      transaction.create(operationRef, {
        completadaEn: currentDate.toISOString(),
        estado: "completada",
        expedienteCognicion,
        operationId,
        patientUid: patientRef.id,
        payloadFingerprint,
        professionalUid: actorUid,
        quota
      });

      return {
        deduplicated: false,
        expedienteCognicion,
        id: patientRef.id,
        quota
      };
    });
  }

  async function discardUnregisteredAccount(auth) {
    const uid = requireAuthenticatedUid(auth);
    const profileRef = db.doc(`usuarios/${uid}`);
    const deletionTombstoneRef = db.doc(accountDeletionTombstonePath(uid));
    const currentDate = now();

    await db.runTransaction(async (transaction) => {
      const [profileSnapshot, deletionTombstoneSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(deletionTombstoneRef)
      ]);
      if (profileSnapshot.exists) {
        throw new ProfessionalPatientAccessError(
          "failed-precondition",
          "La cuenta ya tiene un perfil y no puede descartarse como registro incompleto."
        );
      }
      if (deletionTombstoneSnapshot.exists) {
        const existing = deletionTombstoneSnapshot.data() || {};
        if (existing.accountUid !== uid || existing.accountType !== INCOMPLETE_REGISTRATION_ACCOUNT_TYPE) {
          throw new ProfessionalPatientAccessError(
            "failed-precondition",
            "La cuenta participa en otro proceso de eliminación."
          );
        }
        return;
      }
      transaction.create(deletionTombstoneRef, {
        accountType: INCOMPLETE_REGISTRATION_ACCOUNT_TYPE,
        accountUid: uid,
        deletionPhase: "destructive",
        deletionStartedAt: currentDate.toISOString(),
        deletionState: "in_progress",
        discardedByUid: uid
      });
    });

    try {
      await authAdmin.deleteUser(uid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    await db.runTransaction(async (transaction) => {
      const tombstoneSnapshot = await transaction.get(deletionTombstoneRef);
      const tombstone = tombstoneSnapshot.exists ? tombstoneSnapshot.data() || {} : {};
      if (tombstone.accountUid !== uid || tombstone.accountType !== INCOMPLETE_REGISTRATION_ACCOUNT_TYPE) {
        throw new ProfessionalPatientAccessError(
          "aborted",
          "No fue posible confirmar la limpieza del registro incompleto."
        );
      }
      transaction.update(deletionTombstoneRef, {
        deletionCompletedAt: currentDate.toISOString(),
        deletionPhase: "completed",
        deletionState: "completed"
      });
    });
    return { discarded: true };
  }

  async function findDoctorUidByEmail(email) {
    let authUser;
    try {
      authUser = await authAdmin.getUserByEmail(email);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new ProfessionalPatientAccessError(
          "not-found",
          "No se encontró un profesional registrado con ese correo."
        );
      }
      throw error;
    }

    if (authUser?.disabled === true) {
      throw new ProfessionalPatientAccessError(
        "failed-precondition",
        "La cuenta profesional indicada está deshabilitada."
      );
    }
    if (authUser?.emailVerified !== true) {
      throw new ProfessionalPatientAccessError(
        "failed-precondition",
        "El profesional debe verificar su correo antes de recibir pacientes por email."
      );
    }
    return requireDocumentId(authUser?.uid, "Profesional");
  }

  async function registerPatientProfile(auth, data = {}) {
    const patientUid = requireAuthenticatedUid(auth);
    const patientEmail = normalizeEmail(auth?.token?.email, "El correo de la cuenta autenticada");
    const name = requiredText(data.nombre, "El nombre", 160);
    if (data.aceptaAviso !== true || data.aceptaBeta !== true) {
      throw new ProfessionalPatientAccessError(
        "failed-precondition",
        "Debes aceptar el Aviso de Privacidad y el Consentimiento Beta."
      );
    }

    const usesLinkingCode = data.usaCodigoVinculacion === true;
    const doctorEmail = usesLinkingCode ? "" : normalizeEmail(data.correoMedico, "El correo del médico tratante");
    const doctorUid = doctorEmail ? await findDoctorUidByEmail(doctorEmail) : "";
    const patientRef = db.doc(`usuarios/${patientUid}`);
    const patientDeletionTombstoneRef = db.doc(accountDeletionTombstonePath(patientUid));
    const doctorRef = doctorUid ? db.doc(`usuarios/${doctorUid}`) : null;
    const doctorDeletionTombstoneRef = doctorUid
      ? db.doc(accountDeletionTombstonePath(doctorUid))
      : null;
    const permissionRef = doctorUid
      ? db.doc(`usuarios/${patientUid}/permisosMedicos/${doctorUid}`)
      : null;
    const assignmentRef = doctorUid
      ? db.doc(quotaAssignmentPath(doctorUid, patientUid))
      : null;
    const currentDate = now();
    const folioYear = patientFolioYear(currentDate);
    const folioCounterRef = db.doc(patientFolioCounterPath(folioYear));
    const folioSequenceBaseline = await initialPatientFolioSequence({
      counterRef: folioCounterRef,
      db,
      year: folioYear
    });

    return db.runTransaction(async (transaction) => {
      const [
        patientSnapshot,
        doctorSnapshot,
        assignmentSnapshot,
        patientDeletionTombstoneSnapshot,
        doctorDeletionTombstoneSnapshot,
        folioCounterSnapshot
      ] = await Promise.all([
        transaction.get(patientRef),
        doctorRef ? transaction.get(doctorRef) : Promise.resolve(null),
        assignmentRef ? transaction.get(assignmentRef) : Promise.resolve(null),
        transaction.get(patientDeletionTombstoneRef),
        doctorDeletionTombstoneRef ? transaction.get(doctorDeletionTombstoneRef) : Promise.resolve(null),
        transaction.get(folioCounterRef)
      ]);
      assertAccountNotDeleting(
        patientDeletionTombstoneSnapshot,
        "Esta cuenta está en proceso de eliminación y no puede volver a registrarse."
      );
      assertAccountNotDeleting(
        doctorDeletionTombstoneSnapshot,
        "La cuenta profesional indicada está en proceso de eliminación."
      );
      const doctorProfile = doctorRef
        ? snapshotData(doctorSnapshot, "No se encontró el perfil del médico tratante.")
        : null;
      if (doctorProfile && !isProfessional(doctorProfile, { uid: doctorUid })) {
        throw new ProfessionalPatientAccessError("failed-precondition", "El correo indicado no corresponde a un médico.");
      }

      const existing = patientSnapshot.exists ? patientSnapshot.data() || {} : null;
      if (existing) {
        if (existing.vinculacionReservaEstado === "reservado") {
          throw new ProfessionalPatientAccessError(
            "failed-precondition",
            "El perfil de paciente está en proceso de vinculación y no puede modificarse."
          );
        }
        if (existing.rol !== "paciente" || String(existing.email || "").trim().toLowerCase() !== patientEmail) {
          throw new ProfessionalPatientAccessError(
            "already-exists",
            "La cuenta autenticada ya tiene un perfil distinto registrado."
          );
        }
        const existingDoctorUid = String(
          existing.medicoTratanteUid || existing.medicoUid || existing.ownerUid || existing.creadoPor || ""
        );
        if (doctorUid && existingDoctorUid && existingDoctorUid !== doctorUid) {
          throw new ProfessionalPatientAccessError(
            "already-exists",
            "La cuenta de paciente ya está vinculada con otro profesional."
          );
        }
      }

      let expedienteCognicion = patientFolioFromProfile(existing || {});
      let nextFolioSequence = null;
      if (!expedienteCognicion) {
        const storedFolioSequence = folioCounterSnapshot.exists
          ? storedCounterSequence(folioCounterSnapshot.data() || {})
          : null;
        nextFolioSequence = Math.max(
          PATIENT_FOLIO_INITIAL_SEQUENCE,
          folioSequenceBaseline,
          storedFolioSequence ?? PATIENT_FOLIO_INITIAL_SEQUENCE
        ) + 1;
        expedienteCognicion = `C${nextFolioSequence}-${folioYear}`;
      }
      const existingInstitutionalData = existing?.datosInstitucionales
        && typeof existing.datosInstitucionales === "object"
        && !Array.isArray(existing.datosInstitucionales)
        ? existing.datosInstitucionales
        : {
            tipoPaciente: "privada",
            institucionPaciente: "",
            servicioInstitucional: "",
            expediente: "",
            cama: "",
            alergias: "",
            diasEstancia: ""
          };

      const patientProfile = {
        nombre: existing?.nombre || name,
        email: patientEmail,
        rol: "paciente",
        tieneCuenta: true,
        estado: "activo",
        tipoPaciente: existing?.tipoPaciente || "privada",
        expedienteCognicion,
        datosInstitucionales: {
          ...existingInstitutionalData,
          expedienteCognicion
        },
        creadoPor: doctorUid || existing?.creadoPor || "",
        medicoTratanteUid: doctorUid || existing?.medicoTratanteUid || "",
        medicoTratante: doctorProfile?.nombre || doctorEmail || existing?.medicoTratante || "",
        aceptoAvisoPrivacidad: true,
        fechaAceptacionAviso: existing?.fechaAceptacionAviso || currentDate.toISOString(),
        versionAvisoPrivacidad: existing?.versionAvisoPrivacidad || LEGAL_VERSION,
        fechaCreacion: existing?.fechaCreacion || currentDate.toISOString()
      };

      if (existing) transaction.set(patientRef, patientProfile, { merge: true });
      else transaction.create(patientRef, patientProfile);
      if (nextFolioSequence !== null) {
        transaction.set(folioCounterRef, {
          actualizadoEn: currentDate.toISOString(),
          anio: folioYear,
          tipo: "expediente_cognicion",
          ultimoConsecutivo: nextFolioSequence,
          ...(!folioCounterSnapshot.exists ? {
            fechaInicializacion: currentDate.toISOString(),
            inicializadoDesdeMaximoExistente: folioSequenceBaseline
          } : {})
        }, { merge: true });
      }

      let assigned = null;
      if (doctorRef) {
        assigned = assignPatientSlotInTransaction({
          assignmentExists: assignmentSnapshot.exists,
          assignmentRef,
          now: currentDate,
          patientUid,
          professionalProfile: doctorProfile,
          professionalRef: doctorRef,
          professionalUid: doctorUid,
          source: "registro_paciente",
          transaction
        });
        transaction.set(permissionRef, permissionData("tratante", patientUid, currentDate), { merge: true });
      }

      return {
        alreadyRegistered: Boolean(existing),
        medicoUid: doctorUid,
        pacienteUid: patientUid,
        quota: assigned?.limited
          ? { current: assigned.count, limit: assigned.limit }
          : { current: null, limit: null }
      };
    });
  }

  async function managePatientPermission(auth, data = {}) {
    const actorUid = requireAuthenticatedUid(auth);
    const action = String(data.accion || "").trim().toLowerCase();
    if (!PATIENT_PERMISSION_ACTIONS.has(action)) {
      throw new ProfessionalPatientAccessError("invalid-argument", "La operación de permisos no es válida.");
    }
    const patientUid = requireDocumentId(data.pacienteId, "Paciente");
    const targetEmail = action === "otorgar" && String(data.profesionalCorreo || "").trim()
      ? normalizeEmail(data.profesionalCorreo, "El correo del profesional")
      : "";
    const targetUid = targetEmail
      ? await findDoctorUidByEmail(targetEmail)
      : requireDocumentId(data.profesionalUid, "Profesional");
    const role = normalizePermissionRole(data.tipoPermiso);
    const actorRef = db.doc(`usuarios/${actorUid}`);
    const patientRef = db.doc(`usuarios/${patientUid}`);
    const targetRef = db.doc(`usuarios/${targetUid}`);
    const actorPermissionRef = db.doc(`usuarios/${patientUid}/permisosMedicos/${actorUid}`);
    const targetPermissionRef = db.doc(`usuarios/${patientUid}/permisosMedicos/${targetUid}`);
    const assignmentRef = db.doc(quotaAssignmentPath(targetUid, patientUid));
    const actorDeletionRef = db.doc(accountDeletionTombstonePath(actorUid));
    const patientDeletionRef = db.doc(accountDeletionTombstonePath(patientUid));
    const targetDeletionRef = db.doc(accountDeletionTombstonePath(targetUid));
    const currentDate = now();

    return db.runTransaction(async (transaction) => {
      const [
        actorSnapshot,
        patientSnapshot,
        targetSnapshot,
        actorPermissionSnapshot,
        targetPermissionSnapshot,
        assignmentSnapshot,
        actorDeletionSnapshot,
        patientDeletionSnapshot,
        targetDeletionSnapshot
      ] = await Promise.all([
        transaction.get(actorRef),
        transaction.get(patientRef),
        transaction.get(targetRef),
        transaction.get(actorPermissionRef),
        transaction.get(targetPermissionRef),
        transaction.get(assignmentRef),
        transaction.get(actorDeletionRef),
        transaction.get(patientDeletionRef),
        transaction.get(targetDeletionRef)
      ]);
      assertAccountNotDeleting(actorDeletionSnapshot, "La cuenta autenticada está en proceso de eliminación.");
      assertAccountNotDeleting(patientDeletionSnapshot, "El paciente está en proceso de eliminación.");
      assertAccountNotDeleting(targetDeletionSnapshot, "La cuenta profesional de destino está en proceso de eliminación.");
      const actorProfile = snapshotData(actorSnapshot, "No se encontró el perfil autenticado.");
      const patient = snapshotData(patientSnapshot, "No se encontró el paciente.");
      const targetProfile = snapshotData(targetSnapshot, "No se encontró el perfil profesional de destino.");
      assertPatientProfile(patient);
      if (patient.vinculacionReservaEstado === "reservado") {
        throw new ProfessionalPatientAccessError(
          "failed-precondition",
          "Los permisos no pueden cambiar mientras el expediente está en proceso de vinculación."
        );
      }
      if (patient.estado === "vinculado" && patient.vinculadoA) {
        throw new ProfessionalPatientAccessError(
          "failed-precondition",
          "Los permisos deben administrarse desde la cuenta de paciente vinculada."
        );
      }
      if (!canManagePatientPermissions({
        action,
        actorProfile,
        actorPermission: actorPermissionSnapshot.data?.() || {},
        actorUid,
        auth,
        patient,
        patientUid,
        targetUid
      })) {
        throw new ProfessionalPatientAccessError(
          "permission-denied",
          "No tienes permisos para administrar el acceso a este paciente."
        );
      }
      if (!isProfessional(targetProfile, { uid: targetUid })) {
        throw new ProfessionalPatientAccessError(
          "failed-precondition",
          "La cuenta de destino no corresponde a un profesional."
        );
      }

      if (action === "revocar") {
        if (targetPermissionSnapshot.exists) transaction.delete(targetPermissionRef);
        const accessPatch = patientAccessRemovalPatch(patient, targetUid);
        if (Object.keys(accessPatch).length) transaction.update(patientRef, accessPatch);
        const patientAfterRevocation = { ...patient, ...accessPatch };
        const keepsDirectAccess = profileHasDirectPatientAccess(patientAfterRevocation, targetUid);
        let quotaProfile = targetProfile;
        if (!keepsDirectAccess && assignmentSnapshot.exists) {
          transaction.delete(assignmentRef);
          if (isFreeProfessionalProfile(targetProfile)) {
            const nextCount = Math.max(0, patientCountForProfile(targetProfile) - 1);
            transaction.update(targetRef, {
              pacientesEnCuenta: nextCount
            });
            quotaProfile = { ...targetProfile, pacientesEnCuenta: nextCount };
          }
        }
        return { action, patientUid, professionalUid: targetUid, quota: quotaResult(quotaProfile) };
      }

      if (role !== "tratante"
          && profileHasOwnerOrTreatingAccess(patient, targetUid)) {
        throw new ProfessionalPatientAccessError(
          "failed-precondition",
          "Reasigna primero al profesional principal antes de cambiarlo a colaborador o estudiante."
        );
      }

      const legacyPermissionPatch = embeddedPatientPermissionRemovalPatch(patient, targetUid);
      if (Object.keys(legacyPermissionPatch).length) {
        transaction.update(patientRef, legacyPermissionPatch);
      }

      const assigned = assignPatientSlotInTransaction({
        assignmentExists: assignmentSnapshot.exists,
        assignmentRef,
        now: currentDate,
        patientUid,
        professionalProfile: targetProfile,
        professionalRef: targetRef,
        professionalUid: targetUid,
        source: "permiso_compartido",
        transaction
      });
      transaction.set(targetPermissionRef, {
        ...permissionData(role, actorUid, currentDate),
        ...(action === "actualizar" ? { fechaModificacion: currentDate.toISOString(), modificadoPor: actorUid } : {})
      }, { merge: action === "actualizar" });
      return {
        action,
        patientUid,
        professionalUid: targetUid,
        quota: assigned.limited
          ? { current: assigned.count, limit: assigned.limit }
          : { current: null, limit: null }
      };
    });
  }

  return Object.freeze({
    createProvisionalPatient,
    discardUnregisteredAccount,
    managePatientPermission,
    registerPatientProfile
  });
}

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createProfessionalPatientAccessService({ db: admin.firestore() });
  }
  return serviceInstance;
}

function toHttpsError(error, operation) {
  if (error instanceof HttpsError) return error;
  if (error instanceof AccountLinkingError
      || error instanceof ProfessionalPatientAccessError
      || error instanceof ProfessionalPatientQuotaError) {
    return new HttpsError(error.code, error.message, error.details || {});
  }
  logger.error("[PROFESSIONAL_PATIENT_ACCESS] Error interno", {
    operation,
    code: error?.code || error?.name || "internal"
  });
  return new HttpsError("internal", "No fue posible completar la operación con el paciente.");
}

function callable(operation, handler, options = {}) {
  return onCall({ region: REGION, timeoutSeconds: 60, ...options }, async (request) => {
    try {
      return await handler(getService(), request);
    } catch (error) {
      throw toHttpsError(error, operation);
    }
  });
}

const createProvisionalPatient = callable(
  "createProvisionalPatient",
  (service, request) => service.createProvisionalPatient(request.auth, request.data || {})
);
const discardUnregisteredAccount = callable(
  "discardUnregisteredAccount",
  (service, request) => service.discardUnregisteredAccount(request.auth)
);
const registerPatientProfile = callable(
  "registerPatientProfile",
  (service, request) => service.registerPatientProfile(request.auth, request.data || {})
);
const managePatientPermission = callable(
  "managePatientPermission",
  (service, request) => service.managePatientPermission(request.auth, request.data || {})
);
module.exports = {
  INCOMPLETE_REGISTRATION_ACCOUNT_TYPE,
  LEGAL_VERSION,
  PATIENT_FOLIO_COUNTER_COLLECTION,
  PATIENT_FOLIO_COUNTER_PREFIX,
  PATIENT_FOLIO_INITIAL_SEQUENCE,
  PATIENT_CREATION_OPERATIONS_COLLECTION,
  PATIENT_PERMISSION_ACTIONS,
  PATIENT_ARRAY_ACCESS_FIELDS,
  PATIENT_DIRECT_ACCESS_FIELDS,
  PERMISSION_ROLES,
  ProfessionalPatientAccessError,
  createProfessionalPatientAccessService,
  createProvisionalPatient,
  discardUnregisteredAccount,
  embeddedPatientPermissionRemovalPatch,
  managePatientPermission,
  normalizePermissionRole,
  patientFolioCounterPath,
  patientFolioFromProfile,
  patientFolioSequence,
  patientCreationOperationPath,
  patientCreationPayloadFingerprint,
  patientAccessRemovalPatch,
  requirePatientCreationOperationId,
  registerPatientProfile,
  sanitizePatientPayload,
  toHttpsError
};
