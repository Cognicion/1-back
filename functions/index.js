const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const { randomUUID } = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { runSegmentClinicalConversation } = require("./segmentationHandler");
const { runGenerateStructuredNoteFromDictation } = require("./noteGenerationHandler");
const { discoverTextPatterns } = require("./patternDiscoveryHandler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const {
  analyzePatientClinicalContext,
  listAuthorizedSofiaPatients,
  getClinicalKnowledgeAdmin,
  rebuildClinicalEmbeddingIndexAdmin,
  rebuildClinicalPatternMatricesAdmin,
  processClinicalAnalyticsWrite,
  processClinicalPatientWrite
} = require("./clinicalAnalytics/handlers");
const { runUnifiedSofia } = require("./sofiaOrchestrator/orchestrator");
const {
  getPatientPatternProfile,
  refreshPatientPatternProfileHandler,
  reviewPatientPatternResult,
  searchAuthorizedPatternPatients
} = require("./clinicalAnalytics/patientPatternHandlers");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
if (!admin.apps.length) admin.initializeApp();
const adminDb = admin.firestore();
const cloudStorageFunctions = require("./cloudStorage/handlers");
const cloudAdminModerationFunctions = require("./cloudAdminModeration/handlers");
const accountLinkingFunctions = require("./accountLinking/handlers");
const {
  registerProfessional,
  registerProfessionalWithCode
} = require("./accountSecurity/professionalRegistration");
const professionalPatientAccessFunctions = require("./accountSecurity/professionalPatientAccess");
const {
  listAuthorizedPatientIds,
  listProfessionalDirectory
} = require("./accountSecurity/professionalDirectory");
const { releasePatientSlotsForPatient } = require("./accountSecurity/professionalPatientQuota");
const {
  AccountDeletionError,
  beginAccountDeletionPreflight,
  cancelAccountDeletionPreflight,
  markAccountDeletion,
  promoteAccountDeletionPreflight
} = require("./accountSecurity/accountDeletion");
const { isPatient } = require("./accountLinking/validation");

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const TIPOS_COLABORADOR_VALIDOS = new Set(["colaborador", "destacado", "estrella"]);
const ROLES_ADMIN_VALIDOS = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);
const RAICES_NOTA_VALIDAS = new Set(["usuarios", "pacientes", "root"]);
const COLECCIONES_NOTA_VALIDAS = new Set(["notasMedicas", "notas", "notasClinicas"]);
const OPCIONES_ELIMINACION_PACIENTE = Object.freeze({
  timeoutSeconds: 540,
  memory: "1GiB"
});
const CONCURRENCIA_ELIMINACION_PACIENTE = 20;
const TAMANO_PAGINA_STORAGE_ELIMINACION = 500;
const PATRON_ID_DOCUMENTO_ELIMINACION = /^[A-Za-z0-9_-]{1,160}$/u;
const CAMPOS_AUDITORIA_PACIENTE = Object.freeze([
  "pacienteUid",
  "uidPaciente",
  "pacienteId",
  "idPaciente",
  "patientId",
  "usuarioUid",
  "userUid"
]);
const DURACION_BLOQUEO_ELIMINACION_MS = 10 * 60 * 1000;

function normalizarRolAdmin(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function datosUsuarioEsAdmin(datos = {}) {
  const roles = Array.isArray(datos.roles) ? datos.roles : Object.entries(datos.roles || {}).filter(([, activo]) => activo).map(([rol]) => rol);
  const permisos = Array.isArray(datos.permisos) ? datos.permisos : Object.entries(datos.permisos || {}).filter(([, activo]) => activo).map(([permiso]) => permiso);
  return [datos.rol, datos.role, datos.tipoRol, datos.tipoUsuario, datos.perfil, datos.cargoSistema, ...roles, ...permisos]
    .some((valor) => ROLES_ADMIN_VALIDOS.has(normalizarRolAdmin(valor)))
    || datos.admin === true || datos.esAdmin === true || datos.isAdmin === true || datos.claims?.admin === true;
}

function contieneUidPaciente(valor, uidPaciente, clave = "") {
  if (valor === uidPaciente && normalizarRolAdmin(clave) === "vinculadoa") return true;
  if (valor === uidPaciente && /(paciente|patient|usuario).*(uid|id)|(uid|id).*(paciente|patient|usuario)/i.test(clave)) return true;
  if (Array.isArray(valor)) return valor.some((item) => contieneUidPaciente(item, uidPaciente, clave));
  if (valor && typeof valor === "object") return Object.entries(valor).some(([subClave, subValor]) => contieneUidPaciente(subValor, uidPaciente, subClave));
  return false;
}

function documentoPerteneceAPaciente(ruta, datos, uidPaciente) {
  const segmentos = ruta.split("/");
  if ((segmentos[0] === "usuarios" || segmentos[0] === "pacientes") && segmentos[1] === uidPaciente) return true;
  if (segmentos[0] === "auditoria") return false;
  return Object.entries(datos || {}).some(([clave, valor]) => contieneUidPaciente(valor, uidPaciente, clave));
}

async function eliminarDocumentoYDescendientes(ref) {
  await adminDb.recursiveDelete(ref);
}

function datosUsuarioEsProfesionalClinico(datos = {}) {
  if (!datos || typeof datos !== "object" || datosUsuarioEsAdmin(datos) || isPatient(datos)) return false;
  const roles = Array.isArray(datos.roles)
    ? datos.roles
    : Object.entries(datos.roles || {}).filter(([, activo]) => activo).map(([rol]) => rol);
  const valores = [
    datos.rol,
    datos.role,
    datos.rolUsuario,
    datos.tipoRol,
    datos.tipoUsuario,
    datos.tipoCuenta,
    datos.tipoProfesional,
    datos.profesion,
    datos.profession,
    datos.especialidad,
    datos.specialty,
    ...roles
  ];
  const rolesProfesionalesHeredados = new Set([
    "doctor",
    "doctora",
    "psiquiatra",
    "psiquiatria",
    "medicinageneral",
    "medicinainterna",
    "internista",
    "pediatra",
    "pediatria",
    "paidopsiquiatra",
    "paidopsiquiatria",
    "asesorsaludmental"
  ]);
  return valores.filter(Boolean).some((valor) => {
    const rol = normalizarRolAdmin(valor);
    return rol.includes("medico")
      || rol.includes("medica")
      || rol.includes("psicolog")
      || rol.includes("enfermer")
      || rolesProfesionalesHeredados.has(rol);
  });
}

async function asegurarCuentaCallableActiva(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const uid = request.auth.uid;
  const [profileSnapshot, deletionSnapshot] = await Promise.all([
    adminDb.doc(`usuarios/${uid}`).get(),
    adminDb.doc(`accountDeletionTombstones/${uid}`).get()
  ]);
  if (deletionSnapshot.exists) {
    throw new HttpsError("failed-precondition", "La cuenta está en proceso de eliminación.");
  }
  if (!profileSnapshot.exists) {
    throw new HttpsError("permission-denied", "No se encontró un perfil activo para esta cuenta.");
  }
  const profile = profileSnapshot.data() || {};
  const accountState = normalizarRolAdmin(profile.estadoCuenta || profile.estado || profile.status || "activo");
  if (profile.activo === false
    || profile.active === false
    || ["desactivado", "deshabilitado", "suspendido", "eliminado", "disabled", "suspended", "deleted"].includes(accountState)) {
    throw new HttpsError("failed-precondition", "La cuenta no está activa.");
  }
  return profile;
}

function conCuentaCallableActiva(handler) {
  return async (request) => {
    await asegurarCuentaCallableActiva(request);
    return handler(request);
  };
}

function crearLimitadorConcurrencia(maximo = CONCURRENCIA_ELIMINACION_PACIENTE) {
  let operacionesActivas = 0;
  const pendientes = [];

  const continuar = () => {
    while (operacionesActivas < maximo && pendientes.length) {
      const { operacion, resolve, reject } = pendientes.shift();
      operacionesActivas += 1;
      Promise.resolve()
        .then(operacion)
        .then(resolve, reject)
        .finally(() => {
          operacionesActivas -= 1;
          continuar();
        });
    }
  };

  return (operacion) => new Promise((resolve, reject) => {
    pendientes.push({ operacion, resolve, reject });
    continuar();
  });
}

async function completarOperacionesEliminacion(operaciones) {
  const resultados = await Promise.allSettled(operaciones);
  const fallo = resultados.find((resultado) => resultado.status === "rejected");
  if (fallo) throw fallo.reason;
}

function resolverReferenciaNotaSolicitud(uidPaciente, recursoId) {
  const valor = String(recursoId || "").trim();
  if (!uidPaciente || uidPaciente.includes("/") || !valor) {
    throw new HttpsError("invalid-argument", "La solicitud no identifica la nota y el paciente.");
  }

  const partes = valor.split("::");
  const compuesta = partes.length === 3;
  if (partes.length !== 1 && !compuesta) {
    throw new HttpsError("failed-precondition", "El identificador de la nota no es válido.");
  }

  const raiz = compuesta ? partes[0] : "usuarios";
  const coleccion = compuesta ? partes[1] : "notasMedicas";
  const notaId = compuesta ? partes[2] : valor;
  if (!RAICES_NOTA_VALIDAS.has(raiz) || !COLECCIONES_NOTA_VALIDAS.has(coleccion) || !notaId || notaId.includes("/")) {
    throw new HttpsError("failed-precondition", "La solicitud apunta a una ubicación de nota no permitida.");
  }

  const referencia = raiz === "root"
    ? adminDb.doc(`${coleccion}/${notaId}`)
    : adminDb.doc(`${raiz}/${uidPaciente}/${coleccion}/${notaId}`);
  return { referencia, raiz, coleccion, notaId, recursoId: valor };
}

function notaRaizPertenecePaciente(datos = {}, uidPaciente = "") {
  return [datos.uidPaciente, datos.idPaciente, datos.pacienteId, datos.pacienteUid]
    .some((valor) => String(valor || "") === uidPaciente);
}

async function eliminarSubcoleccionesNota(referencia) {
  const subcolecciones = await referencia.listCollections();
  for (const subcoleccion of subcolecciones) await adminDb.recursiveDelete(subcoleccion);
  return subcolecciones.length;
}

async function eliminarDocumentosRelacionadosEnColecciones(uidPaciente, resumen, opciones = {}) {
  const coleccionesRaiz = await adminDb.listCollections();
  const rutasPreservadas = opciones.rutasPreservadas || new Set();
  const ejecutarLimitado = crearLimitadorConcurrencia();

  async function visitarColeccion(coleccion) {
    const snapshot = await ejecutarLimitado(() => coleccion.get());
    await Promise.all(snapshot.docs.map(async (snap) => {
      const ref = snap.ref;
      if (!rutasPreservadas.has(ref.path) && documentoPerteneceAPaciente(ref.path, snap.data(), uidPaciente)) {
        await ejecutarLimitado(() => eliminarDocumentoYDescendientes(ref));
        resumen.documentosRelacionados = (resumen.documentosRelacionados || 0) + 1;
        return;
      }
      const subcolecciones = await ejecutarLimitado(() => ref.listCollections());
      await Promise.all(subcolecciones.map((subcoleccion) => visitarColeccion(subcoleccion)));
    }));
  }

  await Promise.all(coleccionesRaiz
    .filter((coleccion) => coleccion.id !== "auditoria")
    .map((coleccion) => visitarColeccion(coleccion)));
}

async function eliminarAuditoriaPaciente(uidPaciente, resumen) {
  const referencias = new Map();
  await Promise.all(CAMPOS_AUDITORIA_PACIENTE.map(async (campo) => {
    const snapshot = await adminDb.collection("auditoria").where(campo, "==", uidPaciente).get();
    snapshot.docs.forEach((documento) => referencias.set(documento.ref.path, documento.ref));
  }));

  const ejecutarLimitado = crearLimitadorConcurrencia();
  await Promise.all([...referencias.values()]
    .map((referencia) => ejecutarLimitado(() => eliminarDocumentoYDescendientes(referencia))));
  resumen.auditoriaPaciente = referencias.size;
}

async function eliminarArchivosPaciente(uidPaciente, resumen) {
  const bucket = admin.storage().bucket();
  const ejecutarLimitado = crearLimitadorConcurrencia();
  const uidEscapado = uidPaciente.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`(?:^|/|-)${uidEscapado}(?:/|$|[._-])`);
  let consulta = { autoPaginate: false, maxResults: TAMANO_PAGINA_STORAGE_ELIMINACION };
  let totalEliminados = 0;

  while (consulta) {
    const [archivos, siguienteConsulta] = await bucket.getFiles(consulta);
    const relacionados = archivos.filter((archivo) => patron.test(archivo.name));
    await Promise.all(relacionados
      .map((archivo) => ejecutarLimitado(() => archivo.delete())));
    totalEliminados += relacionados.length;
    consulta = siguienteConsulta || null;
  }

  resumen.archivosStorage = (resumen.archivosStorage || 0) + totalEliminados;
}

function validarIdDocumentoEliminacion(valor, etiqueta = "Cuenta") {
  const id = String(valor || "").trim();
  if (!PATRON_ID_DOCUMENTO_ELIMINACION.test(id)) {
    throw new AccountDeletionError("failed-precondition", `${etiqueta} contiene un identificador no válido.`);
  }
  return id;
}

function unirIdsExpedientesVinculados(uidPaciente, idsPersistidos = [], idsDescubiertos = []) {
  const uidDestino = validarIdDocumentoEliminacion(uidPaciente, "La cuenta de paciente");
  if (!Array.isArray(idsPersistidos) || !Array.isArray(idsDescubiertos)) {
    throw new AccountDeletionError(
      "failed-precondition",
      "La eliminación contiene una lista de expedientes vinculados no válida."
    );
  }
  return [...new Set([...idsPersistidos, ...idsDescubiertos]
    .map((id) => validarIdDocumentoEliminacion(id, "Un expediente vinculado"))
    .filter((id) => id !== uidDestino))];
}

async function persistirIdsExpedientesVinculados(accountDeletionRef, uidPaciente, idsDescubiertos) {
  return adminDb.runTransaction(async (transaccion) => {
    const tombstoneSnapshot = await transaccion.get(accountDeletionRef);
    const tombstone = tombstoneSnapshot.exists ? tombstoneSnapshot.data() || {} : null;
    if (!tombstone
        || tombstone.accountUid !== uidPaciente
        || tombstone.accountType !== "paciente") {
      throw new AccountDeletionError(
        "failed-precondition",
        "No se pudo confirmar la eliminación del paciente antes de conservar sus expedientes vinculados."
      );
    }
    const linkedOriginUids = unirIdsExpedientesVinculados(
      uidPaciente,
      tombstone.linkedOriginUids || [],
      idsDescubiertos
    );
    transaccion.set(accountDeletionRef, {
      linkedOriginUids,
      linkedOriginUidsUpdatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return linkedOriginUids;
  });
}

async function marcarExpedientesVinculadosParaEliminacion(uidPaciente, adminUid, accountDeletionRef) {
  const snapshot = await adminDb.collection("usuarios").where("vinculadoA", "==", uidPaciente).get();
  const idsDescubiertos = snapshot.docs.map((documentSnapshot) => documentSnapshot.id);
  const linkedOriginUids = await persistirIdsExpedientesVinculados(
    accountDeletionRef,
    uidPaciente,
    idsDescubiertos
  );
  return Promise.all(linkedOriginUids
    .map(async (linkedOriginUid) => ({
      id: linkedOriginUid,
      tombstoneRef: await markAccountDeletion({
        adminUid,
        db: adminDb,
        guardAccountRef: adminDb.doc(`usuarios/${linkedOriginUid}`),
        type: "expediente_vinculado",
        uid: linkedOriginUid
      })
    })));
}

async function eliminarCuentaAutenticacionPaciente(uidPaciente, resumen) {
  try {
    await admin.auth().deleteUser(uidPaciente);
    resumen.cuentaAutenticacion = "eliminada";
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    resumen.cuentaAutenticacion = "no_existia";
  }
}

async function limpiarReferenciasProfesional(professionalUid, resumen) {
  const snapshot = await adminDb.collection("usuarios").get();
  const ejecutarLimitado = crearLimitadorConcurrencia();
  let perfilesActualizados = 0;
  let permisosEliminados = 0;
  await Promise.all(snapshot.docs
    .filter((documentSnapshot) => documentSnapshot.id !== professionalUid
      && isPatient(documentSnapshot.data() || {}))
    .map((documentSnapshot) => ejecutarLimitado(async () => {
      const patient = documentSnapshot.data() || {};
      const patch = professionalPatientAccessFunctions.patientAccessRemovalPatch(patient, professionalUid);
      const permissionRef = documentSnapshot.ref.collection("permisosMedicos").doc(professionalUid);
      const permissionSnapshot = await permissionRef.get();
      const operations = [];
      if (Object.keys(patch).length > 0) {
        operations.push(documentSnapshot.ref.update(patch));
        perfilesActualizados += 1;
      }
      if (permissionSnapshot.exists) {
        operations.push(permissionRef.delete());
        permisosEliminados += 1;
      }
      await Promise.all(operations);
    })));
  resumen.referenciasProfesionalActualizadas = perfilesActualizados;
  resumen.permisosProfesionalEliminados = permisosEliminados;
}

async function asegurarProfesionalSinExpedientesProvisionales(professionalUid) {
  const patientsSnapshot = await adminDb.collection("usuarios").get();
  const provisionalPatients = patientsSnapshot.docs.filter((documentSnapshot) => (
    isPatient(documentSnapshot.data() || {})
      && documentSnapshot.data()?.tieneCuenta === false
  ));
  const related = await Promise.all(provisionalPatients.map(async (documentSnapshot) => {
    const patient = documentSnapshot.data() || {};
    const directRelationship = Object.keys(
      professionalPatientAccessFunctions.patientAccessRemovalPatch(patient, professionalUid)
    ).length > 0;
    if (directRelationship) return documentSnapshot.id;
    const permissionSnapshot = await documentSnapshot.ref.collection("permisosMedicos").doc(professionalUid).get();
    return permissionSnapshot.exists ? documentSnapshot.id : null;
  }));
  const patientIds = related.filter(Boolean);
  if (patientIds.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `Reasigna o retira primero ${patientIds.length} expediente(s) provisional(es) vinculados a este profesional.`
    );
  }
}

async function asegurarProfesionalSinVinculacionesActivas(professionalUid) {
  const snapshot = await adminDb.collection("codigosVinculacion")
    .where("estadoProceso", "==", "reservado")
    .get();
  const active = snapshot.docs.some((documentSnapshot) => {
    const code = documentSnapshot.data() || {};
    return code.medicoUid === professionalUid
      || code.reservadoPorUid === professionalUid
      || code.emitidoPorUid === professionalUid;
  });
  if (active) {
    throw new HttpsError(
      "failed-precondition",
      "Este profesional participa en una vinculación activa. Finalízala o cancélala antes de eliminar la cuenta."
    );
  }
}

function solicitudEliminacionPacienteValida(solicitud, uidPaciente) {
  return Boolean(solicitud)
    && (solicitud.tipo === "solicitud_eliminacion" || solicitud.categoria === "solicitud_eliminacion")
    && solicitud.recursoTipo === "paciente"
    && solicitud.pacienteUid === uidPaciente;
}

async function reclamarSolicitudEliminacionPaciente(solicitudRef, uidPaciente, adminUid) {
  const ahora = Timestamp.now();
  return adminDb.runTransaction(async (transaccion) => {
    const solicitudSnap = await transaccion.get(solicitudRef);
    const solicitud = solicitudSnap.exists ? solicitudSnap.data() : null;
    if (!solicitudEliminacionPacienteValida(solicitud, uidPaciente)) {
      throw new HttpsError("failed-precondition", "La solicitud de eliminación no es válida para este paciente.");
    }

    const inicioPrevio = solicitud.eliminacionIniciadaEn?.toMillis?.() || 0;
    const bloqueoVigente = solicitud.estado === "procesando_eliminacion"
      && Date.now() - inicioPrevio < DURACION_BLOQUEO_ELIMINACION_MS;
    if (bloqueoVigente) {
      throw new HttpsError("already-exists", "La eliminación de este paciente ya está en curso.");
    }

    transaccion.update(solicitudRef, {
      estado: "procesando_eliminacion",
      eliminacionIniciadaEn: ahora,
      eliminacionIniciadaPorUid: adminUid
    });
    return solicitud;
  });
}

exports.eliminarPacienteDefinitivamente = onCall(OPCIONES_ELIMINACION_PACIENTE, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const adminUid = request.auth.uid;
  const uidPaciente = String(request.data?.pacienteUid || "").trim();
  const solicitudId = String(request.data?.solicitudId || "").trim();
  if (!uidPaciente || uidPaciente.includes("/") || !solicitudId || solicitudId.includes("/")) {
    throw new HttpsError("invalid-argument", "La eliminación debe originarse en una solicitud válida.");
  }

  const [adminSnap, adminDeletionSnapshot] = await Promise.all([
    adminDb.doc(`usuarios/${adminUid}`).get(),
    adminDb.doc(`accountDeletionTombstones/${adminUid}`).get()
  ]);
  if (adminDeletionSnapshot.exists) {
    throw new HttpsError("failed-precondition", "La cuenta administrativa está en proceso de eliminación.");
  }
  if (adminUid !== ADMIN_UID && (!adminSnap.exists || !datosUsuarioEsAdmin(adminSnap.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para eliminar pacientes.");
  }
  if (uidPaciente === adminUid || uidPaciente === ADMIN_UID) {
    throw new HttpsError("failed-precondition", "No se puede eliminar la cuenta administrativa activa.");
  }
  const solicitudRef = adminDb.doc(`reportesUsuarios/${solicitudId}`);
  const solicitud = await reclamarSolicitudEliminacionPaciente(solicitudRef, uidPaciente, adminUid);
  const inicio = Date.now();
  let etapa = "marcar_cuenta_en_eliminacion";

  try {
    const accountDeletionRef = await markAccountDeletion({
      adminUid,
      db: adminDb,
      guardAccountRef: adminDb.doc(`usuarios/${uidPaciente}`),
      type: "paciente",
      uid: uidPaciente
    });
    logger.info("Eliminación definitiva de paciente iniciada.", { etapa: "inicio" });
    etapa = "leer_paciente";
    const pacienteSnap = await adminDb.doc(`usuarios/${uidPaciente}`).get();
    const paciente = pacienteSnap.exists ? pacienteSnap.data() : {};
    const nombrePaciente = paciente.nombre || paciente.nombreCompleto || solicitud.pacienteNombre || request.data?.pacienteNombre || "Paciente sin nombre";
    const motivo = String(solicitud.motivoSolicitud || request.data?.motivo || "").trim();
    const resumen = { uidPaciente, nombrePaciente };
    etapa = "marcar_expedientes_vinculados";
    const expedientesVinculados = await marcarExpedientesVinculadosParaEliminacion(
      uidPaciente,
      adminUid,
      accountDeletionRef
    );
    const idsPaciente = [uidPaciente, ...expedientesVinculados.map(({ id }) => id)];
    resumen.expedientesVinculadosEliminados = expedientesVinculados.length;

    etapa = "cuenta_autenticacion";
    await eliminarCuentaAutenticacionPaciente(uidPaciente, resumen);

    etapa = "raices_paciente";
    await completarOperacionesEliminacion(idsPaciente.flatMap((patientId) => [
      eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${patientId}`)),
      eliminarDocumentoYDescendientes(adminDb.doc(`pacientes/${patientId}`)),
      eliminarDocumentoYDescendientes(adminDb.doc(`rehabilitacion_cognitiva/${patientId}`))
    ]));
    logger.info("Raíces del paciente eliminadas.", { etapa, duracionMs: Date.now() - inicio });

    etapa = "liberar_cuotas_profesionales";
    const cuotasLiberadas = await Promise.all(idsPaciente.map((patientId) => (
      releasePatientSlotsForPatient({ db: adminDb, patientUid: patientId })
    )));
    resumen.cuotasProfesionalesLiberadas = cuotasLiberadas
      .reduce((total, result) => total + result.released, 0);

    etapa = "referencias_archivos_auditoria";
    await completarOperacionesEliminacion([
      eliminarDocumentosRelacionadosEnColecciones(uidPaciente, resumen, {
        rutasPreservadas: new Set([solicitudRef.path])
      }),
      ...idsPaciente.map((patientId) => eliminarArchivosPaciente(patientId, resumen)),
      eliminarAuditoriaPaciente(uidPaciente, resumen)
    ]);
    logger.info("Referencias y archivos del paciente eliminados.", {
      etapa,
      duracionMs: Date.now() - inicio,
      documentosRelacionados: resumen.documentosRelacionados || 0,
      archivosStorage: resumen.archivosStorage || 0,
      auditoriaPaciente: resumen.auditoriaPaciente || 0
    });

    etapa = "auditoria_final";
    const auditoriaRef = adminDb.collection("auditoria").doc();
    const batch = adminDb.batch();
    batch.delete(solicitudRef);
    batch.set(auditoriaRef, {
      accion: "Paciente eliminado definitivamente",
      modulo: "Panel administracion",
      descripcion: "El administrador eliminó definitivamente un paciente y toda su información asociada.",
      usuarioUid: adminUid,
      usuarioNombre: request.auth.token?.email || adminUid,
      usuarioRol: "admin",
      pacienteUid: uidPaciente,
      pacienteNombre: nombrePaciente,
      exito: true,
      detalles: { motivo, solicitudId, ...resumen },
      fecha: FieldValue.serverTimestamp(),
      fechaTexto: new Date().toISOString()
    });
    batch.set(accountDeletionRef, {
      deletionPhase: "completed",
      deletionState: "completed",
      deletionCompletedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    expedientesVinculados.forEach(({ tombstoneRef }) => batch.set(tombstoneRef, {
      deletionPhase: "completed",
      deletionState: "completed",
      deletionCompletedAt: FieldValue.serverTimestamp()
    }, { merge: true }));
    await batch.commit();
    logger.info("Eliminación definitiva de paciente completada.", {
      etapa: "completada",
      duracionMs: Date.now() - inicio
    });
    return { ok: true, ...resumen };
  } catch (error) {
    await solicitudRef.set({
      estado: "error_eliminacion",
      eliminacionErrorEn: FieldValue.serverTimestamp(),
      eliminacionErrorCodigo: String(error?.code || "internal")
    }, { merge: true }).catch(() => {});
    logger.error("Falló la eliminación definitiva de paciente.", {
      etapa,
      duracionMs: Date.now() - inicio,
      codigo: String(error?.code || "internal")
    });
    if (error instanceof HttpsError) throw error;
    if (error instanceof AccountDeletionError) throw new HttpsError(error.code, error.message);
    throw new HttpsError("internal", "No se pudo completar la eliminación. La solicitud quedó disponible para reintentar.");
  }
});

exports.eliminarProfesionalDefinitivamente = onCall(OPCIONES_ELIMINACION_PACIENTE, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const adminUid = request.auth.uid;
  const professionalUid = String(request.data?.profesionalUid || "").trim();
  if (!professionalUid || professionalUid.includes("/") || professionalUid === adminUid || professionalUid === ADMIN_UID) {
    throw new HttpsError("invalid-argument", "La cuenta profesional indicada no es válida.");
  }
  const [adminSnapshot, adminDeletionSnapshot, professionalSnapshot, deletionSnapshot] = await Promise.all([
    adminDb.doc(`usuarios/${adminUid}`).get(),
    adminDb.doc(`accountDeletionTombstones/${adminUid}`).get(),
    adminDb.doc(`usuarios/${professionalUid}`).get(),
    adminDb.doc(`accountDeletionTombstones/${professionalUid}`).get()
  ]);
  if (adminDeletionSnapshot.exists) {
    throw new HttpsError("failed-precondition", "La cuenta administrativa está en proceso de eliminación.");
  }
  if (adminUid !== ADMIN_UID && (!adminSnapshot.exists || !datosUsuarioEsAdmin(adminSnapshot.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para eliminar profesionales.");
  }
  const professional = professionalSnapshot.exists ? professionalSnapshot.data() || {} : null;
  const resumableDeletion = deletionSnapshot.exists
    && deletionSnapshot.data()?.accountType === "profesional"
    && deletionSnapshot.data()?.accountUid === professionalUid;
  if ((!professional || !datosUsuarioEsProfesionalClinico(professional)) && !resumableDeletion) {
    throw new HttpsError("failed-precondition", "La cuenta indicada no corresponde a un profesional eliminable.");
  }

  const resumen = { profesionalUid: professionalUid };
  const deletionAttemptId = randomUUID();
  let deletionPreflight;
  try {
    deletionPreflight = await beginAccountDeletionPreflight({
      adminUid,
      attemptId: deletionAttemptId,
      db: adminDb,
      guardAccountRef: adminDb.doc(`usuarios/${professionalUid}`),
      type: "profesional",
      uid: professionalUid
    });
  } catch (error) {
    if (error instanceof AccountDeletionError) throw new HttpsError(error.code, error.message);
    throw error;
  }
  const accountDeletionRef = deletionPreflight.reference;
  if (deletionPreflight.completed) {
    return { ok: true, alreadyDeleted: true, ...resumen };
  }
  try {
    await Promise.all([
      asegurarProfesionalSinExpedientesProvisionales(professionalUid),
      asegurarProfesionalSinVinculacionesActivas(professionalUid)
    ]);
    if (deletionPreflight.acquired) {
      await promoteAccountDeletionPreflight({
        attemptId: deletionAttemptId,
        db: adminDb,
        uid: professionalUid
      });
    }
  } catch (error) {
    if (deletionPreflight.acquired) {
      await cancelAccountDeletionPreflight({
        attemptId: deletionAttemptId,
        db: adminDb,
        uid: professionalUid
      }).catch((rollbackError) => {
        logger.error("No se pudo liberar la validación de eliminación profesional.", {
          code: String(rollbackError?.code || "internal")
        });
      });
    }
    if (error instanceof AccountDeletionError) throw new HttpsError(error.code, error.message);
    throw error;
  }
  await eliminarCuentaAutenticacionPaciente(professionalUid, resumen);
  await completarOperacionesEliminacion([
    eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${professionalUid}`)),
    eliminarArchivosPaciente(professionalUid, resumen),
    limpiarReferenciasProfesional(professionalUid, resumen)
  ]);
  await accountDeletionRef.set({
    deletionPhase: "completed",
    deletionState: "completed",
    deletionCompletedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  logger.info("Cuenta profesional eliminada por administración.", { etapa: "completada" });
  return { ok: true, ...resumen };
});

exports.eliminarNotaDesdeSolicitud = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  await asegurarCuentaCallableActiva(request);
  const adminUid = request.auth.uid;
  const solicitudId = String(request.data?.solicitudId || "").trim();
  if (!solicitudId || solicitudId.includes("/")) {
    throw new HttpsError("invalid-argument", "Falta una solicitud de eliminación válida.");
  }

  const adminSnap = await adminDb.doc(`usuarios/${adminUid}`).get();
  if (adminUid !== ADMIN_UID && (!adminSnap.exists || !datosUsuarioEsAdmin(adminSnap.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para eliminar notas.");
  }

  const solicitudRef = adminDb.doc(`reportesUsuarios/${solicitudId}`);
  const solicitudSnap = await solicitudRef.get();
  const solicitud = solicitudSnap.exists ? solicitudSnap.data() : null;
  if (!solicitud || (solicitud.tipo !== "solicitud_eliminacion" && solicitud.categoria !== "solicitud_eliminacion") || solicitud.recursoTipo !== "nota_medica") {
    throw new HttpsError("failed-precondition", "La solicitud de eliminación no corresponde a una nota médica.");
  }

  const uidPaciente = String(solicitud.pacienteUid || "").trim();
  const recursoId = String(solicitud.recursoId || "").trim();
  const notaObjetivo = resolverReferenciaNotaSolicitud(uidPaciente, recursoId);
  const notaSnap = await notaObjetivo.referencia.get();
  if (!notaSnap.exists) throw new HttpsError("not-found", "La nota solicitada ya no existe o no pudo localizarse.");
  if (notaObjetivo.raiz === "root" && !notaRaizPertenecePaciente(notaSnap.data(), uidPaciente)) {
    throw new HttpsError("failed-precondition", "La nota indicada no pertenece al paciente de la solicitud.");
  }

  const pacienteSnap = await adminDb.doc(`usuarios/${uidPaciente}`).get();
  const paciente = pacienteSnap.exists ? pacienteSnap.data() : {};
  const nombrePaciente = paciente.nombre || paciente.nombreCompleto || solicitud.pacienteNombre || "Paciente sin nombre";
  const nota = notaSnap.data() || {};
  const subcoleccionesEliminadas = await eliminarSubcoleccionesNota(notaObjetivo.referencia);
  const auditoriaRef = adminDb.collection("auditoria").doc();
  const batch = adminDb.batch();
  batch.delete(notaObjetivo.referencia);
  batch.delete(solicitudRef);
  batch.set(auditoriaRef, {
    accion: "Nota médica eliminada definitivamente",
    modulo: "Panel administracion",
    descripcion: "El administrador eliminó definitivamente una nota médica a partir de una solicitud válida.",
    usuarioUid: adminUid,
    usuarioNombre: request.auth.token?.email || adminUid,
    usuarioRol: "admin",
    pacienteUid: uidPaciente,
    pacienteNombre: nombrePaciente,
    exito: true,
    detalles: {
      solicitudId,
      notaId: recursoId,
      notaIdOriginal: notaObjetivo.notaId,
      coleccion: notaObjetivo.coleccion,
      raiz: notaObjetivo.raiz,
      motivo: String(solicitud.motivoSolicitud || "").trim(),
      estadoNota: nota.estadoNota || nota.estado || "",
      subcoleccionesEliminadas
    },
    fecha: FieldValue.serverTimestamp(),
    fechaTexto: new Date().toISOString()
  });
  await batch.commit();

  return {
    ok: true,
    solicitudId,
    pacienteUid: uidPaciente,
    notaId: recursoId,
    notaIdOriginal: notaObjetivo.notaId,
    subcoleccionesEliminadas
  };
});

exports.actualizarReconocimientoColaborador = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  await asegurarCuentaCallableActiva(request);
  const adminUid = request.auth.uid;
  const usuarioId = String(request.data?.usuarioId || "").trim();
  const tipo = request.data?.tipo ? String(request.data.tipo).trim() : null;
  if (!usuarioId) throw new HttpsError("invalid-argument", "Falta el usuario objetivo.");
  if (usuarioId === adminUid) throw new HttpsError("permission-denied", "No puedes asignarte este reconocimiento.");
  if (tipo !== null && !TIPOS_COLABORADOR_VALIDOS.has(tipo)) throw new HttpsError("invalid-argument", "Tipo de colaborador no permitido.");

  const adminSnap = await adminDb.doc(`usuarios/${adminUid}`).get();
  if (adminUid !== ADMIN_UID && (!adminSnap.exists || !datosUsuarioEsAdmin(adminSnap.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para esta operación.");
  }

  const usuarioRef = adminDb.doc(`usuarios/${usuarioId}`);
  const usuarioSnap = await usuarioRef.get();
  if (!usuarioSnap.exists) throw new HttpsError("not-found", "Usuario objetivo no encontrado.");
  const anterior = usuarioSnap.data()?.colaborador || {};
  const valorAnterior = { activo: anterior.activo === true, tipo: anterior.activo === true ? anterior.tipo || null : null };
  const activo = Boolean(tipo);
  const valorNuevo = { activo, tipo: activo ? tipo : null };
  const marcaTiempo = activo ? FieldValue.serverTimestamp() : null;
  const nuevoColaborador = {
    activo,
    tipo: valorNuevo.tipo,
    fechaAsignacion: marcaTiempo,
    asignadoPor: activo ? adminUid : null
  };
  const auditoriaRef = adminDb.collection("auditoria").doc();
  const batch = adminDb.batch();
  batch.update(usuarioRef, { colaborador: nuevoColaborador });
  batch.set(auditoriaRef, {
    accion: "actualizar_tipo_colaborador",
    modulo: "Panel administracion",
    usuarioObjetivoId: usuarioId,
    valorAnterior,
    valorNuevo,
    realizadoPor: adminUid,
    exito: true,
    fecha: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { ok: true, valorAnterior, valorNuevo };
});

exports.discoverTextPatterns = onCall({ region: "us-central1", timeoutSeconds: 300, memory: "1GiB" }, conCuentaCallableActiva(async (request) => {
  return discoverTextPatterns({ request, db: adminDb });
}));

exports.analyzePatientClinicalContext = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "1GiB" }, conCuentaCallableActiva(async (request) => analyzePatientClinicalContext({ request, db: adminDb })));
exports.listAuthorizedSofiaPatients = onCall({ region: "us-central1", timeoutSeconds: 60 }, conCuentaCallableActiva(async (request) => listAuthorizedSofiaPatients({ request, db: adminDb })));
exports.searchAuthorizedPatternPatients = onCall({ region: "us-central1", timeoutSeconds: 60 }, conCuentaCallableActiva(async (request) => searchAuthorizedPatternPatients({ request, db: adminDb })));
exports.getPatientPatternProfile = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "1GiB" }, conCuentaCallableActiva(async (request) => getPatientPatternProfile({ request, db: adminDb })));
exports.refreshPatientPatternProfile = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "1GiB" }, conCuentaCallableActiva(async (request) => refreshPatientPatternProfileHandler({ request, db: adminDb })));
exports.reviewPatientPatternResult = onCall({ region: "us-central1", timeoutSeconds: 60 }, conCuentaCallableActiva(async (request) => reviewPatientPatternResult({ request, db: adminDb })));
exports.getClinicalKnowledgeAdmin = onCall({ region: "us-central1", timeoutSeconds: 60 }, conCuentaCallableActiva(async (request) => getClinicalKnowledgeAdmin({ request, db: adminDb })));
exports.rebuildClinicalPatternMatricesAdmin = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "1GiB" }, conCuentaCallableActiva(async (request) => rebuildClinicalPatternMatricesAdmin({ request, db: adminDb })));
exports.rebuildClinicalEmbeddingIndexAdmin = onCall({
  region: "us-central1",
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 540,
  memory: "1GiB"
}, conCuentaCallableActiva(async (request) => rebuildClinicalEmbeddingIndexAdmin({
  request,
  db: adminDb,
  apiKey: OPENAI_API_KEY.value(),
  OpenAIClass: OpenAI
})));
exports.clinicalAnalyticsOnRecordWrite = onDocumentWritten({
  region: "us-central1",
  document: "usuarios/{patientId}/{collectionId}/{recordId}",
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 300,
  memory: "1GiB"
}, async (event) => processClinicalAnalyticsWrite({
  event,
  db: adminDb,
  apiKey: OPENAI_API_KEY.value(),
  OpenAIClass: OpenAI
}));
exports.clinicalAnalyticsOnLegacyPatientRecordWrite = onDocumentWritten({
  region: "us-central1",
  document: "pacientes/{patientId}/{collectionId}/{recordId}",
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 300,
  memory: "1GiB"
}, async (event) => processClinicalAnalyticsWrite({
  event,
  db: adminDb,
  apiKey: OPENAI_API_KEY.value(),
  OpenAIClass: OpenAI,
  sourceRoot: "pacientes"
}));
exports.clinicalAnalyticsOnPatientWrite = onDocumentWritten({
  region: "us-central1",
  document: "usuarios/{patientId}",
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 300,
  memory: "1GiB"
}, async (event) => processClinicalPatientWrite({
  event,
  db: adminDb,
  apiKey: OPENAI_API_KEY.value(),
  OpenAIClass: OpenAI
}));

exports.chatSofiaUnified = onCall(
  {
    region: "us-central1",
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: "1GiB"
  },
  conCuentaCallableActiva(async (request) => runUnifiedSofia({
    request,
    db: adminDb,
    apiKey: OPENAI_API_KEY.value(),
    OpenAIClass: OpenAI
  }))
);

exports.chatSofia = onCall(
  {
    secrets: [OPENAI_API_KEY],
  },
  conCuentaCallableActiva(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const mensaje = request.data?.mensaje;

    if (!mensaje || typeof mensaje !== "string") {
      throw new HttpsError("invalid-argument", "Mensaje inválido.");
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const response = await client.responses.create({
  model: "gpt-5.5",
  instructions: `
Eres SOFÍA (Sistema de Orientación, Formación e Inteligencia Asistida), el motor de inteligencia artificial de Cognición.

Actualmente te encuentras en fase Alpha de investigación y desarrollo.

Tu propósito es asistir a profesionales de la salud, investigadores y, progresivamente, pacientes.

No eres un chatbot genérico.

Formas parte de la plataforma Cognición y debes responder de acuerdo con sus principios científicos, clínicos y éticos.

Principios:

- Prioriza información basada en evidencia científica.
- Nunca inventes datos clínicos.
- Nunca inventes referencias científicas.
- Si no sabes una respuesta, dilo claramente.
- Diferencia siempre entre hechos, hipótesis y opiniones.
- No sustituyes el juicio clínico.
- Explica conceptos complejos con claridad.
- Mantén un lenguaje profesional, respetuoso y humano.
- Sé concisa cuando la pregunta sea simple y detallada cuando el usuario lo solicite.
- Si la información es insuficiente, indica qué datos faltan antes de sacar conclusiones.

Actualmente todavía no tienes acceso a expedientes clínicos, memoria conversacional permanente, escalas ni herramientas clínicas. No afirmes disponer de información que aún no ha sido proporcionada.

Tu objetivo es potenciar el razonamiento del profesional de la salud, no reemplazarlo.
`,
  input: mensaje,
});

    return {
      respuesta: response.output_text || "No pude generar respuesta.",
    };
  })
);

const STRUCTURED_NOTE_PROMPT_VERSION = "voice_note_fray_aldo_evolucion_v2_2026-07-18";
const STRUCTURED_NOTE_PROMPT = `
Version del prompt: voice_note_fray_aldo_evolucion_v2_2026-07-18.
Eres un asistente especializado en documentacion psiquiatrica institucional.

Recibiras la transcripcion de una conversacion entre profesional, paciente y posiblemente familiares, sin etiquetas fiables. Distingue preguntas, respuestas, observaciones, recapitulaciones y plan. Las preguntas del profesional no constituyen hallazgos clinicos ni deben atribuirse al paciente.

Genera una propuesta para una nota psiquiatrica de alta calidad en estilo Formato Fray - Aldo:
1. Evolucion o padecimiento actual.
2. Exploracion fisica/neurologica, examen mental y resultados.
3. Comentario y analisis.
4. Plan.

ESTILO OBLIGATORIO PARA EVOLUCION NARRATIVA INSTITUCIONAL:
La Evolucion no debe redactarse como resumen exhaustivo por dominios, interrogatorio reconstruido ni acumulacion de respuestas. Debe imitar el estilo narrativo institucional de Observacion/UCEP.

Para evolucion intrahospitalaria, redacta entre tres y cinco parrafos fluidos:
1. Inicio con nombre, sexo, edad, dia de estancia, servicio y criterio clinico solo si estan disponibles en expediente o transcripcion. Si no hay criterio documentado, usa "bajo seguimiento por [problema clinico documentado]". Si no hay turno, usa "Durante la valoracion..." o "Durante el periodo evaluado...".
2. Describe brevemente donde y como fue abordado el paciente, posicion si fue dictada, aceptacion de entrevista, cooperacion, actitud y conducta general durante el turno. Esto debe ocupar solo una o dos oraciones.
3. Integra solo cambios y sintomas clinicamente relevantes: evolucion intrahospitalaria, sintomas principales, riesgo, respuesta al tratamiento, funcionamiento, red de apoyo, conciencia de enfermedad y proyeccion a futuro cuando existan.
4. Diferencia antecedentes de situacion actual. Conserva negaciones, incertidumbre, temporalidad y procedencia. Incluye solo citas breves de valor clinico con "sic. Pac." o "sic. Fam.".
5. Cierra con sueño, alimentacion, diuresis, evacuaciones, sintomas fisicos, efectos adversos y eventualidades medicas, si fueron documentados. Puede cerrar con "Sin otras eventualidades medicas reportadas durante el turno" solo si corresponde.

No incluyas en Evolucion: preguntas copiadas, dialogos, "sabe aproximadamente que fecha es", "quiero preguntarle", "voy a resumir", instrucciones del profesional, ordenes del plan, analisis diagnostico extenso, examen mental completo, atencion/memoria/lenguaje/curso formal/afecto completo/juicio/introspeccion/funciones cognitivas/inteligencia, etiquetas tecnicas, advertencias automaticas, fragmentos truncados, parentesis rotos ni frases inconclusas.

Para ingreso adapta a padecimiento actual cronologico, pero para documentType de evolucion usa siempre la evolucion narrativa institucional selectiva.

El examen mental debe ser narrativo y seguir este orden cuando los datos existan: sexo y edad aparente, talla, complexion, integridad y conformacion, vestimenta, higiene y alino, lugar, posicion, aceptacion de entrevista, expresion facial, marcha, psicomotricidad, conciencia, orientacion, actitud, atencion, contacto visual, habla, semantica, prosodia y sintaxis, discurso, espontaneidad, latencia, curso del pensamiento, velocidad, contenido, ideas delirantes, ideas de muerte, ideacion suicida, plan e intencion, heteroagresividad, sensopercepcion, animo, afecto, juicio, funciones cognitivas, inteligencia, advertencia de padecimiento, introspeccion, control de impulsos y proyeccion a futuro.

El Comentario debe comenzar con "Se trata de paciente..." e integrar sindrome, curso, antecedentes, riesgo, juicio, conducta, sustancias, confiabilidad, diferenciales y justificacion de manejo, sin repetir la Evolucion. Usa cautela clinica: "continua cursando predominantemente con", "debe interpretarse con cautela", "resulta indispensable continuar corroborando", "continua beneficiandose de manejo intrahospitalario" cuando corresponda.

El Plan debe contener unicamente acciones futuras confirmadas. No conviertas "valorar" en "iniciar". No conviertas tratamientos previos en actuales.

Reglas innegociables:
No inventes informacion. No completes hallazgos normales. No cambies negaciones. No cambies medicamentos, dosis, cifras, fechas ni nombres. No infieras sexo por nombre; usa el expediente o deja pendiente. No confundas riesgo historico con actual. No copies la transcripcion. No incluyas alertas tecnicas en el texto clinico. Conserva citas textuales y utiliza "sic. Pac." o "sic. Fam." segun informante. Devuelve JSON valido conforme al esquema.

Devuelve JSON estricto con:
{
  "transcriptSessionId": "",
  "patientId": "",
  "encounterId": "",
  "documentType": "",
  "writingStyle": "",
  "schemaVersion": "voice_note_soap_v1",
  "evolutionOrSubjective": { "text": "", "sourceSegmentIds": [] },
  "objective": {
    "vitalSigns": [],
    "physicalNeurologicalExam": "",
    "mentalStatusExam": "",
    "results": "",
    "sourceSegmentIds": []
  },
  "analysis": {
    "text": "",
    "riskAssessment": {
      "deathIdeation": {},
      "suicidalIdeation": {},
      "plan": {},
      "intent": {},
      "meansAccess": {},
      "attempts": {},
      "selfHarm": {},
      "protectiveFactors": {},
      "currentRiskUncertainty": {}
    },
    "diagnosticReasoning": "",
    "differentialDiagnoses": [],
    "medicalConditionsToRuleOut": [],
    "sourceSegmentIds": []
  },
  "plan": { "text": "", "items": [], "sourceSegmentIds": [] },
  "unresolvedItems": [],
  "validationIssues": [],
  "speakerAssignments": [],
  "diagnosisProposals": [],
  "indicationProposals": []
}
`;

function extraerJson(texto = "") {
  const limpio = String(texto || "").trim();
  if (!limpio) return null;
  try { return JSON.parse(limpio); } catch {}
  const match = limpio.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

exports.segmentClinicalConversation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  conCuentaCallableActiva(async (request) => {
    return runSegmentClinicalConversation({
      data: request.data || {},
      auth: request.auth || null,
      apiKey: OPENAI_API_KEY.value(),
      env: process.env,
      OpenAIClass: OpenAI,
      HttpsErrorClass: HttpsError,
      logger: console
    });
  })
);

exports.generateStructuredNoteFromDictation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 90,
    memory: "512MiB"
  },
  conCuentaCallableActiva(async (request) => {
    return runGenerateStructuredNoteFromDictation({
      data: request.data || {},
      auth: request.auth || null,
      apiKey: OPENAI_API_KEY.value(),
      env: process.env,
      OpenAIClass: OpenAI,
      HttpsErrorClass: HttpsError,
      logger: console,
      adminDb
    });
  })
);

exports.reserveCloudUpload = cloudStorageFunctions.reserveCloudUpload;
exports.confirmCloudUpload = cloudStorageFunctions.confirmCloudUpload;
exports.cancelCloudUpload = cloudStorageFunctions.cancelCloudUpload;
exports.createCloudFolder = cloudStorageFunctions.createCloudFolder;
exports.renameCloudItem = cloudStorageFunctions.renameCloudItem;
exports.moveCloudItem = cloudStorageFunctions.moveCloudItem;
exports.trashCloudItem = cloudStorageFunctions.trashCloudItem;
exports.restoreCloudItem = cloudStorageFunctions.restoreCloudItem;
exports.permanentlyDeleteCloudItem = cloudStorageFunctions.permanentlyDeleteCloudItem;
exports.reconcileCloudStorageUsage = cloudStorageFunctions.reconcileCloudStorageUsage;
exports.cloudFileFinalized = cloudStorageFunctions.cloudFileFinalized;
exports.cloudFileDeleted = cloudStorageFunctions.cloudFileDeleted;
exports.cleanupExpiredCloudReservations = cloudStorageFunctions.cleanupExpiredCloudReservations;
exports.listAdminCloudFiles = cloudAdminModerationFunctions.listAdminCloudFiles;
exports.requestAdminCloudFileAccess = cloudAdminModerationFunctions.requestAdminCloudFileAccess;
exports.manageAccountLinking = accountLinkingFunctions.manageAccountLinking;
exports.createProvisionalPatient = professionalPatientAccessFunctions.createProvisionalPatient;
exports.discardUnregisteredAccount = professionalPatientAccessFunctions.discardUnregisteredAccount;
exports.managePatientPermission = professionalPatientAccessFunctions.managePatientPermission;
exports.registerPatientProfile = professionalPatientAccessFunctions.registerPatientProfile;
exports.listAuthorizedPatientIds = listAuthorizedPatientIds;
exports.listProfessionalDirectory = listProfessionalDirectory;
exports.registerProfessional = registerProfessional;
exports.registerProfessionalWithCode = registerProfessionalWithCode;
