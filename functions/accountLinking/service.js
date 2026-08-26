"use strict";

const { randomInt } = require("node:crypto");
const {
  ACCOUNT_LINKING_ACTIONS,
  CODE_LIFETIME_DAYS,
  LEGACY_PATIENT_DOCUMENTS,
  LEGACY_PATIENT_SUBCOLLECTIONS,
  MAX_AUTHORIZED_PROFESSIONALS,
  USER_SUBCOLLECTIONS
} = require("./config");
const { AccountLinkingError } = require("./errors");
const {
  ProfessionalPatientQuotaError,
  moveProfessionalPatientSlotInTransaction,
  quotaAssignmentPath
} = require("../accountSecurity/professionalPatientQuota");
const { accountDeletionTombstonePath } = require("../accountSecurity/accountDeletion");
const {
  assertPatientProfile,
  codeIsExpired,
  isAdmin,
  isProfessional,
  normalizeCode,
  requireAction,
  requireAuthenticatedUid,
  requireDocumentId
} = require("./validation");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PROCESS_AVAILABLE = "disponible";
const PROCESS_RESERVED = "reservado";
const PROCESS_COMPLETED = "completado";
const SECURITY_VERSION = 1;
const LINK_PERMISSION_ROLES = Object.freeze({
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

const SECURITY_PROFILE_FIELDS = new Set([
  "admin",
  "cargoSistema",
  "claims",
  "colaborador",
  "customClaims",
  "esAdmin",
  "estado",
  "isAdmin",
  "isSuperAdmin",
  "perfil",
  "permisos",
  "permisosMedicos",
  "rol",
  "role",
  "roles",
  "tipoRol",
  "tipoUsuario",
  "tieneCuenta",
  "uid",
  "userUid",
  "usuarioUid",
  "pacienteUid",
  "vinculacionReservaAccion",
  "vinculacionReservaActorUid",
  "vinculacionReservaCodigo",
  "vinculacionReservaDestinoUid",
  "vinculacionReservaEstado",
  "vinculadoA"
]);

const AUTHORIZATION_DIRECT_FIELDS = Object.freeze([
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

const AUTHORIZATION_ARRAY_FIELDS = Object.freeze([
  "medicosAutorizados",
  "medicosAutorizadosUid",
  "profesionalesAutorizados",
  "profesionalesAutorizadosIds",
  "medicosAsignados",
  "equipoClinico",
  "equipoClinicoIds",
  "clinicosAutorizados"
]);

function defaultCodeGenerator() {
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    body += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `COG-${body.slice(0, 4)}-${body.slice(4)}`;
}

function timestampIso(now) {
  return now().toISOString();
}

function expirationIso(now) {
  return new Date(now().getTime() + CODE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function userPath(uid) {
  return `usuarios/${uid}`;
}

function permissionPath(patientUid, professionalUid) {
  return `usuarios/${patientUid}/permisosMedicos/${professionalUid}`;
}

function codePath(code) {
  return `codigosVinculacion/${code}`;
}

function snapshotData(snapshot, message) {
  if (!snapshot?.exists) throw new AccountLinkingError("not-found", message);
  return snapshot.data() || {};
}

function assertAccountNotDeleting(snapshot, message = "La cuenta está en proceso de eliminación.") {
  if (snapshot?.exists) throw new AccountLinkingError("failed-precondition", message);
}

function uniqueIds(...values) {
  return [...new Set(values.flat().filter((value) => typeof value === "string" && value.length > 0))];
}

function linkedPermissionData(permission = null, fallbackRole = "tratante") {
  const normalizedFallbackRole = Object.hasOwn(LINK_PERMISSION_ROLES, fallbackRole)
    ? fallbackRole
    : "estudiante";
  if (permission === true) return { ...LINK_PERMISSION_ROLES.estudiante };
  if (!permission || typeof permission !== "object") {
    return { ...LINK_PERMISSION_ROLES[normalizedFallbackRole] };
  }
  const requestedRole = String(permission.rolPermiso || "").trim().toLowerCase();
  const role = Object.hasOwn(LINK_PERMISSION_ROLES, requestedRole)
    ? requestedRole
    : permission.administrarPermisos === true || permission.editarPaciente === true
      ? "tratante"
      : permission.agregarNotas === true
        ? "colaborador"
        : normalizedFallbackRole;
  const defaults = LINK_PERMISSION_ROLES[role];
  return {
    lectura: permission.lectura === true || permission.read === true || permission.activo === true,
    agregarNotas: typeof permission.agregarNotas === "boolean" ? permission.agregarNotas : defaults.agregarNotas,
    editarPaciente: typeof permission.editarPaciente === "boolean" ? permission.editarPaciente : defaults.editarPaciente,
    administrarPermisos: typeof permission.administrarPermisos === "boolean"
      ? permission.administrarPermisos
      : defaults.administrarPermisos,
    rolPermiso: role
  };
}

function candidateProfessionalIds(origin = {}, destination = {}, requiredProfessionalUid = "") {
  const direct = AUTHORIZATION_DIRECT_FIELDS.flatMap((field) => [origin[field], destination[field]]);
  const arrays = AUTHORIZATION_ARRAY_FIELDS.flatMap((field) => [origin[field], destination[field]])
    .filter(Array.isArray)
    .flat();
  const scalarDirectIds = uniqueIds(requiredProfessionalUid, direct);
  const scalarDirectSet = new Set(scalarDirectIds);
  return {
    arrayOnlyIds: uniqueIds(arrays).filter((uid) => !scalarDirectSet.has(uid)),
    scalarDirectIds
  };
}

function permissionGrantsProfessionalAccess(permission) {
  return permission === true
    || permission?.lectura === true
    || permission?.read === true
    || permission?.activo === true
    || permission?.agregarNotas === true
    || permission?.editarPaciente === true
    || permission?.administrarPermisos === true;
}

function embeddedProfessionalRecords(patient = {}) {
  const permissionsByUid = new Map();
  for (const permissions of [patient.permisos, patient.permisosMedicos]) {
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) continue;
    for (const [uid, permission] of Object.entries(permissions)) {
      if (permissionGrantsProfessionalAccess(permission)) permissionsByUid.set(uid, permission);
    }
  }
  return [...permissionsByUid].map(([uid, permission]) => ({ permission, uid }));
}

function withoutSecurityFields(origin = {}) {
  return Object.fromEntries(Object.entries(origin).filter(([field]) => (
    !SECURITY_PROFILE_FIELDS.has(field)
      && !AUTHORIZATION_DIRECT_FIELDS.includes(field)
      && !AUTHORIZATION_ARRAY_FIELDS.includes(field)
  )));
}

function linkedOriginAccessRetirementPatch(retiredAt) {
  return {
    ...Object.fromEntries(AUTHORIZATION_DIRECT_FIELDS.map((field) => [field, ""])),
    ...Object.fromEntries(AUTHORIZATION_ARRAY_FIELDS.map((field) => [field, []])),
    accesoRetiradoTrasVinculacion: true,
    fechaRetiroAccesoVinculacion: retiredAt,
    medicoTratante: "",
    permisos: {},
    permisosMedicos: {}
  };
}

function reservationMatches(codeData = {}, context = {}) {
  return codeData.estadoProceso === PROCESS_RESERVED
    && codeData.reservadoPorUid === context.actorUid
    && codeData.accionReservada === context.action
    && codeData.origenReservadoUid === context.originUid
    && codeData.destinoReservadoUid === context.destinationUid;
}

function completionMatches(codeData = {}, context = {}) {
  return codeData.usado === true
    && codeData.estadoProceso === PROCESS_COMPLETED
    && codeData.reservadoPorUid === context.actorUid
    && codeData.accionReservada === context.action
    && codeData.origenReservadoUid === context.originUid
    && codeData.destinoReservadoUid === context.destinationUid;
}

function originReservationMatches(origin = {}, context = {}) {
  return origin.vinculacionReservaEstado === PROCESS_RESERVED
    && origin.vinculacionReservaCodigo === context.code
    && origin.vinculacionReservaActorUid === context.actorUid
    && origin.vinculacionReservaAccion === context.action
    && origin.vinculacionReservaDestinoUid === context.destinationUid;
}

function storedResult(codeData = {}) {
  const result = codeData.resultadoVinculacion;
  if (!result || typeof result !== "object") {
    throw new AccountLinkingError("already-exists", "Este código ya fue utilizado.");
  }
  return {
    pacienteUid: String(result.pacienteUid || ""),
    expedientePrevioUid: String(result.expedientePrevioUid || ""),
    pacienteNombre: String(result.pacienteNombre || "")
  };
}

function assertSecureIssuedCode(codeData, code, expectedType, expectedIssuerUid) {
  if (codeData.codigo !== code || codeData.versionSeguridad !== SECURITY_VERSION) {
    throw new AccountLinkingError(
      "failed-precondition",
      "Este código no cuenta con validación de seguridad. Genera uno nuevo."
    );
  }
  if (codeData.tipo !== expectedType) {
    const message = expectedType === "medico_a_paciente"
      ? "Este código fue generado por un paciente. Debe usarlo el médico desde el expediente previo."
      : "Este código fue generado por un médico. Debe introducirlo el paciente al crear su cuenta.";
    throw new AccountLinkingError("failed-precondition", message);
  }
  if (expectedIssuerUid && codeData.emitidoPorUid !== expectedIssuerUid) {
    throw new AccountLinkingError("permission-denied", "El emisor del código no es válido.");
  }
}

function patientAllowsLinkingAdministration(patient = {}, professionalUid = "", permission = {}) {
  if (!professionalUid || (patient.estado === "vinculado" && patient.vinculadoA)) return false;
  if (AUTHORIZATION_DIRECT_FIELDS.some((field) => patient[field] === professionalUid)) return true;

  const embeddedPermission = patient.permisosMedicos?.[professionalUid]
    || patient.permisos?.[professionalUid];
  return embeddedPermission?.administrarPermisos === true
    || permission?.administrarPermisos === true;
}

function assertProfessionalAccess(actorProfile, auth, patientProfile, permission, actorUid) {
  if (!isProfessional(actorProfile, auth)) {
    throw new AccountLinkingError("permission-denied", "Solo personal clínico autorizado puede realizar esta operación.");
  }
  if (!isAdmin(actorProfile, auth)
      && !patientAllowsLinkingAdministration(patientProfile, actorUid, permission)) {
    throw new AccountLinkingError("permission-denied", "No tienes permiso para administrar el expediente indicado.");
  }
}

function createAccountLinkingService({ db, now = () => new Date(), generateCode = defaultCodeGenerator, hooks = {} }) {
  if (!db) throw new TypeError("Account linking requires a Firestore instance.");

  async function createDoctorCode(auth, payload) {
    const actorUid = requireAuthenticatedUid(auth);
    const patientUid = requireDocumentId(payload.pacienteId, "Expediente");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = normalizeCode(generateCode());
      const result = await db.runTransaction(async (transaction) => {
        const codeRef = db.doc(codePath(code));
        const actorRef = db.doc(userPath(actorUid));
        const patientRef = db.doc(userPath(patientUid));
        const accessRef = db.doc(permissionPath(patientUid, actorUid));
        const actorDeletionRef = db.doc(accountDeletionTombstonePath(actorUid));
        const patientDeletionRef = db.doc(accountDeletionTombstonePath(patientUid));
        const [
          codeSnapshot,
          actorSnapshot,
          patientSnapshot,
          accessSnapshot,
          actorDeletionSnapshot,
          patientDeletionSnapshot
        ] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(actorRef),
          transaction.get(patientRef),
          transaction.get(accessRef),
          transaction.get(actorDeletionRef),
          transaction.get(patientDeletionRef)
        ]);

        assertAccountNotDeleting(actorDeletionSnapshot, "La cuenta profesional está en proceso de eliminación.");
        assertAccountNotDeleting(patientDeletionSnapshot, "El expediente está en proceso de eliminación.");
        const actorProfile = snapshotData(actorSnapshot, "No se encontró el perfil autenticado.");
        const patientProfile = snapshotData(patientSnapshot, "No se encontró el expediente del paciente.");
        assertPatientProfile(patientProfile, { requireProvisional: true });
        assertProfessionalAccess(actorProfile, auth, patientProfile, accessSnapshot.data?.() || {}, actorUid);
        if (codeSnapshot.exists) return null;

        const createdAt = timestampIso(now);
        transaction.create(codeRef, {
          codigo: code,
          usado: false,
          fechaCreacion: createdAt,
          expiraEn: expirationIso(now),
          tipo: "medico_a_paciente",
          pacienteProvisionalId: patientUid,
          pacienteNombre: patientProfile.nombre || "",
          medicoUid: actorUid,
          emitidoPorUid: actorUid,
          versionSeguridad: SECURITY_VERSION,
          estadoProceso: PROCESS_AVAILABLE
        });
        transaction.set(patientRef, {
          codigoVinculacionActivo: code,
          fechaCodigoVinculacion: createdAt
        }, { merge: true });
        return code;
      });

      if (result) return result;
    }
    throw new AccountLinkingError("resource-exhausted", "No fue posible generar un código único. Inténtalo de nuevo.");
  }

  async function createPatientCode(auth) {
    const actorUid = requireAuthenticatedUid(auth);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = normalizeCode(generateCode());
      const result = await db.runTransaction(async (transaction) => {
        const codeRef = db.doc(codePath(code));
        const actorRef = db.doc(userPath(actorUid));
        const actorDeletionRef = db.doc(accountDeletionTombstonePath(actorUid));
        const [codeSnapshot, actorSnapshot, actorDeletionSnapshot] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(actorRef),
          transaction.get(actorDeletionRef)
        ]);

        assertAccountNotDeleting(actorDeletionSnapshot, "La cuenta del paciente está en proceso de eliminación.");
        const actorProfile = snapshotData(actorSnapshot, "No se encontró la cuenta del paciente.");
        assertPatientProfile(actorProfile, { requireAccount: true });
        if (codeSnapshot.exists) return null;

        transaction.create(codeRef, {
          codigo: code,
          usado: false,
          fechaCreacion: timestampIso(now),
          expiraEn: expirationIso(now),
          tipo: "paciente_a_medico",
          pacienteCuentaUid: actorUid,
          pacienteNombre: actorProfile.nombre || actorProfile.email || "",
          emitidoPorUid: actorUid,
          versionSeguridad: SECURITY_VERSION,
          estadoProceso: PROCESS_AVAILABLE
        });
        return code;
      });

      if (result) return result;
    }
    throw new AccountLinkingError("resource-exhausted", "No fue posible generar un código único. Inténtalo de nuevo.");
  }

  async function reserveLink(auth, payload, action) {
    const actorUid = requireAuthenticatedUid(auth);
    const code = normalizeCode(payload.codigo);
    const expectedType = action === ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE
      ? "medico_a_paciente"
      : "paciente_a_medico";
    const suppliedOriginUid = expectedType === "paciente_a_medico"
      ? requireDocumentId(payload.expedienteProvisionalId, "Expediente")
      : null;

    return db.runTransaction(async (transaction) => {
      const codeRef = db.doc(codePath(code));
      const actorRef = db.doc(userPath(actorUid));
      const actorDeletionRef = db.doc(accountDeletionTombstonePath(actorUid));
      const [codeSnapshot, actorSnapshot, actorDeletionSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(actorRef),
        transaction.get(actorDeletionRef)
      ]);
      assertAccountNotDeleting(actorDeletionSnapshot, "La cuenta autenticada está en proceso de eliminación.");
      const codeData = snapshotData(codeSnapshot, "Código de vinculación no encontrado.");
      const actorProfile = snapshotData(actorSnapshot, "No se encontró el perfil autenticado.");
      assertSecureIssuedCode(codeData, code, expectedType, null);

      let originUid;
      let destinationUid;
      let requiredProfessionalUid;
      let issuerUid;

      if (expectedType === "medico_a_paciente") {
        originUid = requireDocumentId(codeData.pacienteProvisionalId, "Expediente de origen");
        destinationUid = actorUid;
        requiredProfessionalUid = requireDocumentId(codeData.medicoUid, "Profesional emisor");
        issuerUid = requiredProfessionalUid;
      } else {
        originUid = suppliedOriginUid;
        destinationUid = requireDocumentId(codeData.pacienteCuentaUid, "Cuenta de destino");
        requiredProfessionalUid = actorUid;
        issuerUid = destinationUid;
      }

      const context = { action, actorUid, code, destinationUid, originUid, requiredProfessionalUid };
      assertSecureIssuedCode(codeData, code, expectedType, issuerUid);

      if (completionMatches(codeData, context)) {
        return { alreadyComplete: true, codeData, context, result: storedResult(codeData) };
      }
      if (codeData.usado === true) {
        throw new AccountLinkingError("already-exists", "Este código ya fue utilizado.");
      }

      const isResume = reservationMatches(codeData, context);
      if (codeData.estadoProceso === PROCESS_RESERVED && !isResume) {
        throw new AccountLinkingError("aborted", "Este código está siendo utilizado en otra vinculación.");
      }
      if (!isResume && codeData.estadoProceso && codeData.estadoProceso !== PROCESS_AVAILABLE) {
        throw new AccountLinkingError("failed-precondition", "El estado del código no es válido.");
      }
      if (!isResume && codeIsExpired(codeData, now().getTime())) {
        throw new AccountLinkingError("deadline-exceeded", "Este código ya expiró.");
      }

      const originRef = db.doc(userPath(originUid));
      const destinationRef = db.doc(userPath(destinationUid));
      const professionalRef = db.doc(userPath(requiredProfessionalUid));
      const accessRef = db.doc(permissionPath(originUid, requiredProfessionalUid));
      const originDeletionRef = db.doc(accountDeletionTombstonePath(originUid));
      const destinationDeletionRef = db.doc(accountDeletionTombstonePath(destinationUid));
      const professionalDeletionRef = db.doc(accountDeletionTombstonePath(requiredProfessionalUid));
      const [
        originSnapshot,
        destinationSnapshot,
        professionalSnapshot,
        accessSnapshot,
        originDeletionSnapshot,
        destinationDeletionSnapshot,
        professionalDeletionSnapshot
      ] = await Promise.all([
        transaction.get(originRef),
        transaction.get(destinationRef),
        transaction.get(professionalRef),
        transaction.get(accessRef),
        transaction.get(originDeletionRef),
        transaction.get(destinationDeletionRef),
        transaction.get(professionalDeletionRef)
      ]);

      assertAccountNotDeleting(originDeletionSnapshot, "El expediente previo está en proceso de eliminación.");
      assertAccountNotDeleting(destinationDeletionSnapshot, "La cuenta del paciente está en proceso de eliminación.");
      assertAccountNotDeleting(professionalDeletionSnapshot, "La cuenta profesional está en proceso de eliminación.");
      const originProfile = snapshotData(originSnapshot, "No se encontró el expediente previo.");
      const destinationProfile = snapshotData(destinationSnapshot, "No se encontró la cuenta del paciente.");
      const professionalProfile = snapshotData(professionalSnapshot, "No se encontró el perfil profesional.");
      assertPatientProfile(originProfile, { requireProvisional: originProfile.estado !== "vinculado" });
      assertPatientProfile(destinationProfile, { requireAccount: true });
      const resumesLinkedOrigin = isResume
        && originProfile.estado === "vinculado"
        && originProfile.vinculadoA === destinationUid;

      if (expectedType === "medico_a_paciente") {
        if (!isProfessional(professionalProfile, { uid: requiredProfessionalUid })) {
          throw new AccountLinkingError("permission-denied", "El emisor del código ya no es un profesional autorizado.");
        }
        if (!isAdmin(professionalProfile, { uid: requiredProfessionalUid })
            && !resumesLinkedOrigin
            && !patientAllowsLinkingAdministration(
              originProfile,
              requiredProfessionalUid,
              accessSnapshot.data?.() || {}
            )) {
          throw new AccountLinkingError("permission-denied", "El código no fue emitido para un expediente autorizado.");
        }
        assertPatientProfile(actorProfile, { requireAccount: true });
      } else {
        if (resumesLinkedOrigin) {
          if (!isProfessional(professionalProfile, auth)) {
            throw new AccountLinkingError("permission-denied", "El perfil profesional no coincide con la sesión.");
          }
        } else {
          assertProfessionalAccess(professionalProfile, auth, originProfile, accessSnapshot.data?.() || {}, actorUid);
        }
        if (!isProfessional(actorProfile, auth)) {
          throw new AccountLinkingError("permission-denied", "El perfil profesional no coincide con la sesión.");
        }
      }

      if (originProfile.estado === "vinculado") {
        if (!isResume || originProfile.vinculadoA !== destinationUid) {
          throw new AccountLinkingError("already-exists", "Este expediente ya está vinculado a una cuenta de paciente.");
        }
      }

      const originIsReservedForThisLink = originReservationMatches(originProfile, context);
      const destinationIsReservedForThisLink = originReservationMatches(destinationProfile, context);
      if (originProfile.vinculacionReservaEstado === PROCESS_RESERVED && !originIsReservedForThisLink) {
        throw new AccountLinkingError("aborted", "Este expediente está siendo vinculado con otra cuenta.");
      }
      if (destinationProfile.vinculacionReservaEstado === PROCESS_RESERVED && !destinationIsReservedForThisLink) {
        throw new AccountLinkingError("aborted", "La cuenta de destino está participando en otra vinculación.");
      }
      if (isResume && (!originIsReservedForThisLink || !destinationIsReservedForThisLink)) {
        throw new AccountLinkingError("aborted", "La reserva del expediente dejó de ser válida.");
      }

      if (!isResume) {
        const reservationFields = {
          vinculacionReservaEstado: PROCESS_RESERVED,
          vinculacionReservaCodigo: code,
          vinculacionReservaActorUid: actorUid,
          vinculacionReservaAccion: action,
          vinculacionReservaDestinoUid: destinationUid
        };
        transaction.update(codeRef, {
          estadoProceso: PROCESS_RESERVED,
          reservadoPorUid: actorUid,
          accionReservada: action,
          origenReservadoUid: originUid,
          destinoReservadoUid: destinationUid,
          fechaReserva: timestampIso(now)
        });
        transaction.set(originRef, reservationFields, { merge: true });
        transaction.set(destinationRef, reservationFields, { merge: true });
      }

      return { alreadyComplete: false, codeData, context };
    });
  }

  async function copyCollection(originRoot, destinationRoot, collectionName) {
    const snapshot = await db.collection(`${originRoot}/${collectionName}`).get();
    for (const sourceDocument of snapshot.docs) {
      await hooks.beforeCopy?.({ collectionName, documentId: sourceDocument.id });
      await db.doc(`${destinationRoot}/${collectionName}/${sourceDocument.id}`)
        .set(sourceDocument.data(), { merge: true });
    }
  }

  async function copyLegacyData(originUid, destinationUid) {
    for (const collectionName of LEGACY_PATIENT_SUBCOLLECTIONS) {
      await copyCollection(`pacientes/${originUid}`, `pacientes/${destinationUid}`, collectionName);
    }

    for (const [collectionName, documentId] of LEGACY_PATIENT_DOCUMENTS) {
      const sourceSnapshot = await db.doc(`pacientes/${originUid}/${collectionName}/${documentId}`).get();
      if (!sourceSnapshot.exists) continue;
      await hooks.beforeCopy?.({ collectionName, documentId });
      await db.doc(`pacientes/${destinationUid}/${collectionName}/${documentId}`)
        .set(sourceSnapshot.data(), { merge: true });
    }
  }

  async function permissionProfessionalRecords(patientUid) {
    if (!patientUid) return [];
    const snapshot = await db.collection(`${userPath(patientUid)}/permisosMedicos`).get();
    return snapshot.docs
      .filter((permission) => permissionGrantsProfessionalAccess(permission.data()))
      .map((permission) => ({
        permission: permission.data() || {},
        uid: permission.id
      }));
  }

  async function verifiedProfessionals(origin, destination, requiredProfessionalUid, originUid, destinationUid) {
    const [originPermissions, destinationPermissions] = await Promise.all([
      permissionProfessionalRecords(originUid),
      permissionProfessionalRecords(destinationUid)
    ]);
    const originEmbeddedPermissions = embeddedProfessionalRecords(origin);
    const destinationEmbeddedPermissions = embeddedProfessionalRecords(destination);
    const { arrayOnlyIds, scalarDirectIds } = candidateProfessionalIds(
      origin,
      destination,
      requiredProfessionalUid
    );
    const candidates = [...new Set([
      ...scalarDirectIds,
      ...arrayOnlyIds,
      ...originEmbeddedPermissions.map(({ uid }) => uid),
      ...destinationEmbeddedPermissions.map(({ uid }) => uid),
      ...originPermissions.map(({ uid }) => uid),
      ...destinationPermissions.map(({ uid }) => uid)
    ])];
    if (candidates.length > MAX_AUTHORIZED_PROFESSIONALS) {
      throw new AccountLinkingError(
        "failed-precondition",
        `El expediente supera el máximo de ${MAX_AUTHORIZED_PROFESSIONALS} profesionales autorizados para una vinculación segura.`
      );
    }
    const profiles = await Promise.all(candidates.map(async (uid) => {
      const snapshot = await db.doc(userPath(uid)).get();
      return snapshot.exists && isProfessional(snapshot.data() || {}, { uid }) ? uid : null;
    }));
    const verifiedUids = profiles.filter(Boolean);
    const directUidSet = new Set(scalarDirectIds);
    const permissionsByUid = new Map();
    for (const records of [
      originEmbeddedPermissions,
      originPermissions,
      destinationEmbeddedPermissions,
      destinationPermissions
    ]) {
      for (const { permission, uid } of records) permissionsByUid.set(uid, permission);
    }
    return verifiedUids.map((uid) => ({
      direct: directUidSet.has(uid),
      permission: linkedPermissionData(
        permissionsByUid.get(uid),
        directUidSet.has(uid) ? "tratante" : "estudiante"
      ),
      uid
    }));
  }

  async function mergePatientRecords(context) {
    const originRef = db.doc(userPath(context.originUid));
    const destinationRef = db.doc(userPath(context.destinationUid));
    const originDeletionRef = db.doc(accountDeletionTombstonePath(context.originUid));
    const destinationDeletionRef = db.doc(accountDeletionTombstonePath(context.destinationUid));
    const [originSnapshot, destinationSnapshot, originDeletionSnapshot, destinationDeletionSnapshot] = await Promise.all([
      originRef.get(),
      destinationRef.get(),
      originDeletionRef.get(),
      destinationDeletionRef.get()
    ]);
    assertAccountNotDeleting(originDeletionSnapshot, "El expediente previo está en proceso de eliminación.");
    assertAccountNotDeleting(destinationDeletionSnapshot, "La cuenta del paciente está en proceso de eliminación.");
    const origin = snapshotData(originSnapshot, "No se encontró el expediente previo.");
    const destination = snapshotData(destinationSnapshot, "No se encontró la cuenta del paciente.");

    if (origin.estado === "vinculado" && origin.vinculadoA !== context.destinationUid) {
      throw new AccountLinkingError("already-exists", "Este expediente ya está vinculado a otra cuenta.");
    }
    assertPatientProfile(origin, { requireProvisional: origin.estado !== "vinculado" });
    assertPatientProfile(destination, { requireAccount: true });

    const professionalContexts = await verifiedProfessionals(
      origin,
      destination,
      context.requiredProfessionalUid,
      context.originUid,
      context.destinationUid
    );
    const professionalUids = professionalContexts.map(({ uid }) => uid);
    const directProfessionalUids = professionalContexts
      .filter(({ direct }) => direct)
      .map(({ uid }) => uid);
    if (!professionalUids.includes(context.requiredProfessionalUid)) {
      throw new AccountLinkingError("permission-denied", "El profesional autorizado ya no está disponible.");
    }
    const primaryProfessionalUid = [
      origin.creadoPor,
      origin.medicoTratanteUid,
      destination.creadoPor,
      destination.medicoTratanteUid,
      context.requiredProfessionalUid
    ].find((uid) => professionalUids.includes(uid)) || context.requiredProfessionalUid;
    const linkedAt = timestampIso(now);

    const quotaContexts = professionalContexts.map(({ permission, uid: professionalUid }) => ({
      destinationAssignmentRef: db.doc(quotaAssignmentPath(professionalUid, context.destinationUid)),
      originAssignmentRef: db.doc(quotaAssignmentPath(professionalUid, context.originUid)),
      permission,
      permissionRef: db.doc(permissionPath(context.destinationUid, professionalUid)),
      professionalDeletionRef: db.doc(accountDeletionTombstonePath(professionalUid)),
      professionalRef: db.doc(userPath(professionalUid)),
      professionalUid
    }));

    try {
      await hooks.beforeMergeTransaction?.({ context });
      await db.runTransaction(async (transaction) => {
        const [
          currentOriginSnapshot,
          currentDestinationSnapshot,
          currentOriginDeletionSnapshot,
          currentDestinationDeletionSnapshot,
          quotaSnapshots
        ] = await Promise.all([
          transaction.get(originRef),
          transaction.get(destinationRef),
          transaction.get(originDeletionRef),
          transaction.get(destinationDeletionRef),
          Promise.all(quotaContexts.map(async (quotaContext) => {
            const [
              professionalSnapshot,
              originAssignmentSnapshot,
              destinationAssignmentSnapshot,
              professionalDeletionSnapshot
            ] = await Promise.all([
              transaction.get(quotaContext.professionalRef),
              transaction.get(quotaContext.originAssignmentRef),
              transaction.get(quotaContext.destinationAssignmentRef),
              transaction.get(quotaContext.professionalDeletionRef)
            ]);
            return {
              destinationAssignmentSnapshot,
              originAssignmentSnapshot,
              professionalDeletionSnapshot,
              professionalSnapshot,
              quotaContext
            };
          }))
        ]);
        assertAccountNotDeleting(currentOriginDeletionSnapshot, "El expediente previo está en proceso de eliminación.");
        assertAccountNotDeleting(currentDestinationDeletionSnapshot, "La cuenta del paciente está en proceso de eliminación.");
        const currentOrigin = snapshotData(currentOriginSnapshot, "No se encontró el expediente previo.");
        const currentDestination = snapshotData(currentDestinationSnapshot, "No se encontró la cuenta del paciente.");
        if (currentOrigin.estado === "vinculado" && currentOrigin.vinculadoA !== context.destinationUid) {
          throw new AccountLinkingError("already-exists", "Este expediente ya está vinculado a otra cuenta.");
        }
        assertPatientProfile(currentOrigin, { requireProvisional: currentOrigin.estado !== "vinculado" });
        assertPatientProfile(currentDestination, { requireAccount: true });

        for (const {
          destinationAssignmentSnapshot,
          originAssignmentSnapshot,
          professionalDeletionSnapshot,
          professionalSnapshot,
          quotaContext
        } of quotaSnapshots) {
          assertAccountNotDeleting(professionalDeletionSnapshot, "Una cuenta profesional autorizada está en proceso de eliminación.");
          if (!professionalSnapshot.exists || !isProfessional(professionalSnapshot.data() || {}, { uid: quotaContext.professionalUid })) {
            throw new AccountLinkingError("permission-denied", "Un profesional autorizado ya no está disponible.");
          }
          moveProfessionalPatientSlotInTransaction({
            destinationExists: destinationAssignmentSnapshot.exists,
            destinationPatientUid: context.destinationUid,
            destinationRef: quotaContext.destinationAssignmentRef,
            now: now(),
            originExists: originAssignmentSnapshot.exists,
            originRef: quotaContext.originAssignmentRef,
            professionalProfile: professionalSnapshot.data() || {},
            professionalRef: quotaContext.professionalRef,
            professionalUid: quotaContext.professionalUid,
            source: "vinculacion_cuenta",
            transaction
          });
        }

        transaction.set(destinationRef, {
          ...currentDestination,
          ...withoutSecurityFields(currentOrigin),
          nombre: currentDestination.nombre || currentOrigin.nombre || "",
          email: currentDestination.email || currentOrigin.email || "",
          rol: "paciente",
          tieneCuenta: true,
          estado: "activo",
          creadoPor: primaryProfessionalUid,
          ownerUid: primaryProfessionalUid,
          createdByUid: primaryProfessionalUid,
          medicoUid: primaryProfessionalUid,
          medicoTratanteUid: professionalUids.includes(currentOrigin.medicoTratanteUid)
            ? currentOrigin.medicoTratanteUid
            : primaryProfessionalUid,
          medicoTratante: currentOrigin.medicoTratante || currentDestination.medicoTratante || "",
          medicosAutorizados: directProfessionalUids,
          expedienteVinculadoDesde: context.originUid,
          fechaVinculacionExpediente: linkedAt
        }, { merge: true });
        transaction.set(originRef, {
          estado: "vinculado",
          vinculadoA: context.destinationUid,
          tieneCuenta: false,
          fechaVinculacionExpediente: linkedAt
        }, { merge: true });
        for (const { permission, permissionRef } of quotaContexts) {
          transaction.set(permissionRef, {
            ...permission,
            fechaOtorgamiento: linkedAt,
            otorgadoPor: context.destinationUid,
            origenVinculacion: context.originUid
          });
        }
      });
    } catch (error) {
      if (error instanceof ProfessionalPatientQuotaError) {
        throw new AccountLinkingError(error.code, error.message, error.details || {});
      }
      throw error;
    }

    for (const collectionName of USER_SUBCOLLECTIONS) {
      // Los permisos se reconstruyen dentro de la transacción únicamente para
      // perfiles profesionales verificados. El resto se copia después de que
      // raíces y cuota quedaron consolidadas de forma atómica y reintentable.
      if (collectionName === "permisosMedicos") continue;
      await copyCollection(userPath(context.originUid), userPath(context.destinationUid), collectionName);
    }
    await copyLegacyData(context.originUid, context.destinationUid);

    return {
      pacienteUid: context.destinationUid,
      expedientePrevioUid: context.originUid,
      pacienteNombre: destination.nombre || origin.nombre || ""
    };
  }

  async function releaseUncommittedReservation(reservation) {
    if (!reservation || reservation.alreadyComplete) return false;
    const { context } = reservation;
    return db.runTransaction(async (transaction) => {
      const codeRef = db.doc(codePath(context.code));
      const originRef = db.doc(userPath(context.originUid));
      const destinationRef = db.doc(userPath(context.destinationUid));
      const [codeSnapshot, originSnapshot, destinationSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(originRef),
        transaction.get(destinationRef)
      ]);
      if (!codeSnapshot.exists || !originSnapshot.exists || !destinationSnapshot.exists) return false;
      const codeData = codeSnapshot.data() || {};
      const originData = originSnapshot.data() || {};
      const destinationData = destinationSnapshot.data() || {};
      if (!reservationMatches(codeData, context)
          || !originReservationMatches(originData, context)
          || !originReservationMatches(destinationData, context)
          || (originData.estado === "vinculado" && originData.vinculadoA === context.destinationUid)) {
        return false;
      }
      const releasedFields = {
        vinculacionReservaAccion: "",
        vinculacionReservaActorUid: "",
        vinculacionReservaCodigo: "",
        vinculacionReservaDestinoUid: "",
        vinculacionReservaEstado: PROCESS_AVAILABLE
      };
      transaction.update(codeRef, {
        accionReservada: "",
        destinoReservadoUid: "",
        estadoProceso: PROCESS_AVAILABLE,
        fechaLiberacionReserva: timestampIso(now),
        origenReservadoUid: "",
        reservadoPorUid: ""
      });
      transaction.set(originRef, releasedFields, { merge: true });
      transaction.set(destinationRef, releasedFields, { merge: true });
      return true;
    });
  }

  async function finalizeLink(reservation, result) {
    const { context } = reservation;
    const originPermissions = await db.collection(`${userPath(context.originUid)}/permisosMedicos`).get();
    return db.runTransaction(async (transaction) => {
      const codeRef = db.doc(codePath(context.code));
      const originRef = db.doc(userPath(context.originUid));
      const destinationRef = db.doc(userPath(context.destinationUid));
      const originDeletionRef = db.doc(accountDeletionTombstonePath(context.originUid));
      const destinationDeletionRef = db.doc(accountDeletionTombstonePath(context.destinationUid));
      const [
        codeSnapshot,
        originSnapshot,
        destinationSnapshot,
        originDeletionSnapshot,
        destinationDeletionSnapshot
      ] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(originRef),
        transaction.get(destinationRef),
        transaction.get(originDeletionRef),
        transaction.get(destinationDeletionRef)
      ]);
      assertAccountNotDeleting(originDeletionSnapshot, "El expediente previo está en proceso de eliminación.");
      assertAccountNotDeleting(destinationDeletionSnapshot, "La cuenta del paciente está en proceso de eliminación.");
      const codeData = snapshotData(codeSnapshot, "Código de vinculación no encontrado.");
      const originData = snapshotData(originSnapshot, "No se encontró el expediente previo.");
      const destinationData = snapshotData(destinationSnapshot, "No se encontró la cuenta del paciente.");

      if (completionMatches(codeData, context)) return storedResult(codeData);
      if (!reservationMatches(codeData, context) || codeData.usado === true) {
        throw new AccountLinkingError("aborted", "La reserva de vinculación dejó de ser válida.");
      }
      if (!originReservationMatches(originData, context)
          || !originReservationMatches(destinationData, context)
          || originData.vinculadoA !== context.destinationUid) {
        throw new AccountLinkingError("aborted", "La reserva del expediente dejó de ser válida.");
      }

      const update = {
        usado: true,
        usadoPor: context.actorUid,
        fechaUso: timestampIso(now),
        estadoProceso: PROCESS_COMPLETED,
        fechaFinalizacion: timestampIso(now),
        resultadoVinculacion: result
      };
      if (context.action === ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE) {
        update.expedienteProvisionalId = context.originUid;
      }
      transaction.update(codeRef, update);
      transaction.update(originRef, {
        ...linkedOriginAccessRetirementPatch(timestampIso(now)),
        vinculacionReservaEstado: PROCESS_COMPLETED
      });
      originPermissions.docs.forEach((permission) => transaction.delete(permission.ref));
      transaction.update(destinationRef, {
        vinculacionReservaEstado: PROCESS_COMPLETED
      });
      return result;
    });
  }

  async function retireCompletedLinkedOrigin(context) {
    const permissions = await db.collection(`${userPath(context.originUid)}/permisosMedicos`).get();
    return db.runTransaction(async (transaction) => {
      const codeRef = db.doc(codePath(context.code));
      const originRef = db.doc(userPath(context.originUid));
      const [codeSnapshot, originSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(originRef)
      ]);
      if (!originSnapshot.exists) return false;
      const codeData = snapshotData(codeSnapshot, "Código de vinculación no encontrado.");
      const origin = originSnapshot.data() || {};
      if (!completionMatches(codeData, context) || origin.vinculadoA !== context.destinationUid) {
        throw new AccountLinkingError("aborted", "La vinculación completada no coincide con el expediente de origen.");
      }
      transaction.set(originRef, linkedOriginAccessRetirementPatch(timestampIso(now)), { merge: true });
      permissions.docs.forEach((permission) => transaction.delete(permission.ref));
      return true;
    });
  }

  async function link(auth, payload, action) {
    const reservation = await reserveLink(auth, payload, action);
    let result;
    try {
      result = reservation.alreadyComplete
        ? reservation.result
        : await finalizeLink(reservation, await mergePatientRecords(reservation.context));
      await retireCompletedLinkedOrigin(reservation.context);
    } catch (error) {
      await releaseUncommittedReservation(reservation).catch(() => undefined);
      throw error;
    }

    return action === ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE
      ? { ...result, codigo: reservation.context.code, medicoUid: reservation.context.requiredProfessionalUid }
      : { ...result, codigo: reservation.context.code };
  }

  async function execute(auth, payload = {}) {
    const action = requireAction(payload.accion);
    switch (action) {
      case ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE:
        return { codigo: await createDoctorCode(auth, payload) };
      case ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE:
        return { codigo: await createPatientCode(auth) };
      case ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE:
      case ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE:
        return link(auth, payload, action);
      default:
        throw new AccountLinkingError("invalid-argument", "Operación de vinculación no válida.");
    }
  }

  return {
    createDoctorCode,
    createPatientCode,
    execute,
    link,
    reserveLink
  };
}

module.exports = {
  PROCESS_AVAILABLE,
  PROCESS_COMPLETED,
  PROCESS_RESERVED,
  SECURITY_VERSION,
  createAccountLinkingService,
  defaultCodeGenerator
};
