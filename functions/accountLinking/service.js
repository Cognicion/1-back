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
  assertPatientProfile,
  codeIsExpired,
  isAdmin,
  isProfessional,
  normalizeCode,
  patientAllowsProfessionalAccess,
  requireAction,
  requireAuthenticatedUid,
  requireDocumentId
} = require("./validation");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PROCESS_AVAILABLE = "disponible";
const PROCESS_RESERVED = "reservado";
const PROCESS_COMPLETED = "completado";
const SECURITY_VERSION = 1;

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

function uniqueIds(...values) {
  return [...new Set(values.flat().filter((value) => typeof value === "string" && value.length > 0))];
}

function candidateProfessionalIds(origin = {}, destination = {}, requiredProfessionalUid = "") {
  const direct = AUTHORIZATION_DIRECT_FIELDS.flatMap((field) => [origin[field], destination[field]]);
  const arrays = AUTHORIZATION_ARRAY_FIELDS.flatMap((field) => [origin[field], destination[field]])
    .filter(Array.isArray)
    .flat();
  return uniqueIds(requiredProfessionalUid, direct, arrays).slice(0, MAX_AUTHORIZED_PROFESSIONALS);
}

function withoutSecurityFields(origin = {}) {
  return Object.fromEntries(Object.entries(origin).filter(([field]) => (
    !SECURITY_PROFILE_FIELDS.has(field)
      && !AUTHORIZATION_DIRECT_FIELDS.includes(field)
      && !AUTHORIZATION_ARRAY_FIELDS.includes(field)
  )));
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

function assertProfessionalAccess(actorProfile, auth, patientProfile, permission, actorUid) {
  if (!isProfessional(actorProfile, auth)) {
    throw new AccountLinkingError("permission-denied", "Solo personal clínico autorizado puede realizar esta operación.");
  }
  if (!isAdmin(actorProfile, auth)
      && !patientAllowsProfessionalAccess(patientProfile, actorUid, permission)) {
    throw new AccountLinkingError("permission-denied", "No tienes acceso al expediente indicado.");
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
        const [codeSnapshot, actorSnapshot, patientSnapshot, accessSnapshot] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(actorRef),
          transaction.get(patientRef),
          transaction.get(accessRef)
        ]);

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
        const [codeSnapshot, actorSnapshot] = await Promise.all([
          transaction.get(codeRef),
          transaction.get(actorRef)
        ]);

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
      const [codeSnapshot, actorSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(actorRef)
      ]);
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
      const [originSnapshot, destinationSnapshot, professionalSnapshot, accessSnapshot] = await Promise.all([
        transaction.get(originRef),
        transaction.get(destinationRef),
        transaction.get(professionalRef),
        transaction.get(accessRef)
      ]);

      const originProfile = snapshotData(originSnapshot, "No se encontró el expediente previo.");
      const destinationProfile = snapshotData(destinationSnapshot, "No se encontró la cuenta del paciente.");
      const professionalProfile = snapshotData(professionalSnapshot, "No se encontró el perfil profesional.");
      assertPatientProfile(originProfile, { requireProvisional: true });
      assertPatientProfile(destinationProfile, { requireAccount: true });

      if (expectedType === "medico_a_paciente") {
        if (!isProfessional(professionalProfile, { uid: requiredProfessionalUid })) {
          throw new AccountLinkingError("permission-denied", "El emisor del código ya no es un profesional autorizado.");
        }
        if (!isAdmin(professionalProfile, { uid: requiredProfessionalUid })
            && !patientAllowsProfessionalAccess(originProfile, requiredProfessionalUid, accessSnapshot.data?.() || {})) {
          throw new AccountLinkingError("permission-denied", "El código no fue emitido para un expediente autorizado.");
        }
        assertPatientProfile(actorProfile, { requireAccount: true });
      } else {
        assertProfessionalAccess(professionalProfile, auth, originProfile, accessSnapshot.data?.() || {}, actorUid);
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
      if (originProfile.vinculacionReservaEstado === PROCESS_RESERVED && !originIsReservedForThisLink) {
        throw new AccountLinkingError("aborted", "Este expediente está siendo vinculado con otra cuenta.");
      }
      if (isResume && !originIsReservedForThisLink) {
        throw new AccountLinkingError("aborted", "La reserva del expediente dejó de ser válida.");
      }

      if (!isResume) {
        transaction.update(codeRef, {
          estadoProceso: PROCESS_RESERVED,
          reservadoPorUid: actorUid,
          accionReservada: action,
          origenReservadoUid: originUid,
          destinoReservadoUid: destinationUid,
          fechaReserva: timestampIso(now)
        });
        transaction.set(originRef, {
          vinculacionReservaEstado: PROCESS_RESERVED,
          vinculacionReservaCodigo: code,
          vinculacionReservaActorUid: actorUid,
          vinculacionReservaAccion: action,
          vinculacionReservaDestinoUid: destinationUid
        }, { merge: true });
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

  async function verifiedProfessionals(origin, destination, requiredProfessionalUid) {
    const candidates = candidateProfessionalIds(origin, destination, requiredProfessionalUid);
    const profiles = await Promise.all(candidates.map(async (uid) => {
      const snapshot = await db.doc(userPath(uid)).get();
      return snapshot.exists && isProfessional(snapshot.data() || {}, { uid }) ? uid : null;
    }));
    return profiles.filter(Boolean);
  }

  async function mergePatientRecords(context) {
    const originRef = db.doc(userPath(context.originUid));
    const destinationRef = db.doc(userPath(context.destinationUid));
    const [originSnapshot, destinationSnapshot] = await Promise.all([
      originRef.get(),
      destinationRef.get()
    ]);
    const origin = snapshotData(originSnapshot, "No se encontró el expediente previo.");
    const destination = snapshotData(destinationSnapshot, "No se encontró la cuenta del paciente.");

    if (origin.estado === "vinculado" && origin.vinculadoA !== context.destinationUid) {
      throw new AccountLinkingError("already-exists", "Este expediente ya está vinculado a otra cuenta.");
    }
    assertPatientProfile(origin, { requireProvisional: origin.estado !== "vinculado" });
    assertPatientProfile(destination, { requireAccount: true });

    for (const collectionName of USER_SUBCOLLECTIONS) {
      // Los permisos se reconstruyen más abajo únicamente para perfiles profesionales verificados.
      if (collectionName === "permisosMedicos") continue;
      await copyCollection(userPath(context.originUid), userPath(context.destinationUid), collectionName);
    }
    await copyLegacyData(context.originUid, context.destinationUid);

    const professionalUids = await verifiedProfessionals(origin, destination, context.requiredProfessionalUid);
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

    await destinationRef.set({
      ...destination,
      ...withoutSecurityFields(origin),
      nombre: destination.nombre || origin.nombre || "",
      email: destination.email || origin.email || "",
      rol: "paciente",
      tieneCuenta: true,
      estado: "activo",
      creadoPor: primaryProfessionalUid,
      ownerUid: primaryProfessionalUid,
      createdByUid: primaryProfessionalUid,
      medicoUid: primaryProfessionalUid,
      medicoTratanteUid: professionalUids.includes(origin.medicoTratanteUid)
        ? origin.medicoTratanteUid
        : primaryProfessionalUid,
      medicoTratante: origin.medicoTratante || destination.medicoTratante || "",
      medicosAutorizados: professionalUids,
      expedienteVinculadoDesde: context.originUid,
      fechaVinculacionExpediente: linkedAt
    }, { merge: true });

    await originRef.set({
      estado: "vinculado",
      vinculadoA: context.destinationUid,
      tieneCuenta: false,
      fechaVinculacionExpediente: linkedAt
    }, { merge: true });

    for (const professionalUid of professionalUids) {
      await db.doc(permissionPath(context.destinationUid, professionalUid)).set({
        lectura: true,
        agregarNotas: true,
        editarPaciente: true,
        administrarPermisos: true,
        rolPermiso: "tratante",
        fechaOtorgamiento: linkedAt,
        otorgadoPor: context.destinationUid,
        origenVinculacion: context.originUid
      }, { merge: true });
    }

    return {
      pacienteUid: context.destinationUid,
      expedientePrevioUid: context.originUid,
      pacienteNombre: destination.nombre || origin.nombre || ""
    };
  }

  async function finalizeLink(reservation, result) {
    const { context } = reservation;
    return db.runTransaction(async (transaction) => {
      const codeRef = db.doc(codePath(context.code));
      const originRef = db.doc(userPath(context.originUid));
      const [codeSnapshot, originSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(originRef)
      ]);
      const codeData = snapshotData(codeSnapshot, "Código de vinculación no encontrado.");
      const originData = snapshotData(originSnapshot, "No se encontró el expediente previo.");

      if (completionMatches(codeData, context)) return storedResult(codeData);
      if (!reservationMatches(codeData, context) || codeData.usado === true) {
        throw new AccountLinkingError("aborted", "La reserva de vinculación dejó de ser válida.");
      }
      if (!originReservationMatches(originData, context) || originData.vinculadoA !== context.destinationUid) {
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
        vinculacionReservaEstado: PROCESS_COMPLETED
      });
      return result;
    });
  }

  async function link(auth, payload, action) {
    const reservation = await reserveLink(auth, payload, action);
    const result = reservation.alreadyComplete
      ? reservation.result
      : await finalizeLink(reservation, await mergePatientRecords(reservation.context));

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
