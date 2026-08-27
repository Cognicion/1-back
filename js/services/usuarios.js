import { db } from "../firebase.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";
import { isAdministrator } from "../utils/roles.js?v=20260719-admin-universal-modules";
import { registerPatientNameParts } from "../modules/patient-transfer/parsing/patientNameDictionaries.js?v=20260814-patient-name-dictionary-v1";
import {
    administrarPermisoPaciente,
    crearIdOperacionPaciente,
    crearPacienteProvisionalSeguro,
    listarIdsPacientesAutorizadosSeguro
} from "./professionalPatientAccessService.js?v=20260827-panel-pacientes-fallback-v1";
import {
    patientAllowsProfessionalAccess,
    patientListCacheKey,
    resolveAuthorizedPatientDirectory
} from "./patientAccessCore.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    getDocs,
    query,
    where,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export { crearIdOperacionPaciente };


const TTL_USUARIO_MS = 2 * 60 * 1000;
const TTL_LISTA_PACIENTES_MS = 45 * 1000;
const cacheUsuarios = new Map();
const solicitudesUsuariosPendientes = new Map();
const cacheListasPacientes = new Map();
const solicitudesListasPacientes = new Map();
const cachePermisosMedico = new Map();
const solicitudesPermisosMedico = new Map();

function completarDatosConExpedienteCognicion(datos = {}, expedienteCognicion = "") {
    return {
        ...datos,
        expedienteCognicion,
        datosInstitucionales: {
            ...(datos.datosInstitucionales || {}),
            expedienteCognicion
        }
    };
}

function leerCacheVigente(cache, clave, ttlMs) {
    const registro = cache.get(clave);
    if (!registro) return null;
    if (Date.now() - registro.timestamp > ttlMs) {
        cache.delete(clave);
        return null;
    }
    return registro.data;
}

function guardarCache(cache, clave, data) {
    cache.set(clave, { data, timestamp: Date.now() });
    return data;
}

export function invalidarCacheUsuario(uid = "") {
    if (uid) {
        cacheUsuarios.delete(uid);
        solicitudesUsuariosPendientes.delete(uid);
        return;
    }
    cacheUsuarios.clear();
    solicitudesUsuariosPendientes.clear();
}

function invalidarListasPacientes() {
    cacheListasPacientes.clear();
    solicitudesListasPacientes.clear();
    cachePermisosMedico.clear();
    solicitudesPermisosMedico.clear();
}

export async function obtenerUsuario(uid, opciones = {}){

    if (!uid) return null;
    if (!opciones.forzar) {
        const cache = leerCacheVigente(cacheUsuarios, uid, TTL_USUARIO_MS);
        if (cache) return cache;
        if (solicitudesUsuariosPendientes.has(uid)) return solicitudesUsuariosPendientes.get(uid);
    }

    const solicitud = getDoc(
        doc(db,"usuarios",uid)
    )
        .then((snap) => {
            if(!snap.exists()) return guardarCache(cacheUsuarios, uid, null);
            return guardarCache(cacheUsuarios, uid, snap.data());
        })
        .finally(() => solicitudesUsuariosPendientes.delete(uid));

    solicitudesUsuariosPendientes.set(uid, solicitud);
    return solicitud;

}



function crearResultadoPacientesDesdeDocs(docs) {
    return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach(callback) {
            docs.forEach(callback);
        }
    };
}

function esCuentaProfesionalGratuita(perfil = {}) {
    return perfil.planCuentaProfesional === "profesional_gratuito"
        || perfil.modalidadRegistroProfesional === "gratuita";
}

async function listarPacientesGratuitosPorAsignacion(uidProfesional) {
    const asignaciones = await getDocs(collection(
        db,
        "usuarios",
        uidProfesional,
        "patientQuotaAssignments"
    ));
    const documentos = await Promise.all(asignaciones.docs
        .filter((asignacion) => asignacion.data()?.estado === "activo")
        .map(async (asignacion) => {
            const [documentoPaciente, permisoProfesional] = await Promise.all([
                getDoc(doc(db, "usuarios", asignacion.id)),
                getDoc(doc(
                    db,
                    "usuarios",
                    asignacion.id,
                    "permisosMedicos",
                    uidProfesional
                ))
            ]);
            if (!documentoPaciente.exists()) return null;
            const datosPaciente = documentoPaciente.data();
            const datosConPermiso = permisoProfesional.exists()
                ? {
                    ...datosPaciente,
                    permisosMedicos: {
                        ...(datosPaciente.permisosMedicos || {}),
                        [uidProfesional]: permisoProfesional.data()
                    }
                }
                : datosPaciente;
            return patientAllowsProfessionalAccess(datosConPermiso, uidProfesional)
                ? documentoPaciente
                : null;
        }));
    const docs = documentos
        .filter(Boolean)
        .sort((a, b) => {
            const nombreA = obtenerNombrePacienteParaMostrar(a.data());
            const nombreB = obtenerNombrePacienteParaMostrar(b.data());
            return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
        });
    return crearResultadoPacientesDesdeDocs(docs);
}

function ordenarDocumentosPacientes(documentos = []) {
    return [...documentos].sort((a, b) => {
        const nombreA = obtenerNombrePacienteParaMostrar(a.data());
        const nombreB = obtenerNombrePacienteParaMostrar(b.data());
        return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    });
}

async function listarPacientesAdministradorCompatibilidad() {
    const usuariosRef = collection(db, "usuarios");
    const snapshot = await getDocs(query(
        usuariosRef,
        where("rol", "==", "paciente")
    ));
    return crearResultadoPacientesDesdeDocs(ordenarDocumentosPacientes(snapshot.docs));
}

async function listarPacientesPorIds(patientIds = []) {
    const resultados = await Promise.allSettled(patientIds
        .filter((patientUid) => typeof patientUid === "string" && patientUid && !patientUid.includes("/"))
        .map((patientUid) => getDoc(doc(db, "usuarios", patientUid))));
    const pacientes = new Map();
    let primerError = null;
    resultados.forEach((resultado) => {
        if (resultado.status === "rejected") {
            primerError = primerError || resultado.reason;
            return;
        }
        if (resultado.value.exists()) pacientes.set(resultado.value.id, resultado.value);
    });
    if (!pacientes.size && primerError && resultados.length) throw primerError;
    return crearResultadoPacientesDesdeDocs(ordenarDocumentosPacientes(pacientes.values()));
}

export async function listarPacientes(uidMedico = "", opciones = {}){

    if (!uidMedico) {
        throw new Error("missing_actor_user_id");
    }

    const claveCache = patientListCacheKey(uidMedico);
    if (!opciones.forzar) {
        const cache = leerCacheVigente(cacheListasPacientes, claveCache, TTL_LISTA_PACIENTES_MS);
        if (cache) return cache;
        if (solicitudesListasPacientes.has(claveCache)) return solicitudesListasPacientes.get(claveCache);
    }

    const solicitud = listarPacientesSinCache(uidMedico)
        .then((resultado) => guardarCache(cacheListasPacientes, claveCache, resultado))
        .finally(() => solicitudesListasPacientes.delete(claveCache));

    solicitudesListasPacientes.set(claveCache, solicitud);
    return solicitud;

}

async function listarPacientesSinCache(uidMedico = ""){

    if (!uidMedico) {
        throw new Error("missing_actor_user_id");
    }

    const perfilProfesional = await obtenerUsuario(uidMedico);
    const administrador = isAdministrator(perfilProfesional || {});
    const administradorConConsultaDirecta = String(perfilProfesional?.rol || "").trim().toLowerCase() === "admin";
    if (!administrador && esCuentaProfesionalGratuita(perfilProfesional || {})) {
        return listarPacientesGratuitosPorAsignacion(uidMedico);
    }

    const directorio = await resolveAuthorizedPatientDirectory({
        administrator: administradorConConsultaDirecta,
        loadPrimary: listarIdsPacientesAutorizadosSeguro
    });
    if (directorio.source !== "primary") {
        console.warn(
            "[PATIENT_LIST] listAuthorizedPatientIds no esta disponible; se usa la consulta administrativa de compatibilidad."
        );
    }
    if (directorio.mode === "admin-query") {
        return listarPacientesAdministradorCompatibilidad();
    }
    return listarPacientesPorIds(directorio.patientIds);

}



export async function actualizarUsuario(uid,datos){

    await updateDoc(
        doc(db,"usuarios",uid),
        datos
    );
    invalidarCacheUsuario(uid);
    invalidarListasPacientes();

}



export async function crearUsuario(uid,datos){

    await setDoc(
        doc(db,"usuarios",uid),
        datos
    );
    invalidarCacheUsuario(uid);
    invalidarListasPacientes();

}

export async function crearPacienteProvisional(datos, operationId = ""){

    const stableOperationId = String(operationId || datos?.transferOperationId || "").trim()
        || crearIdOperacionPaciente();

    let payload = {
        ...datos,
        rol:"paciente",
        tieneCuenta:false,
        fechaCreacion:new Date().toISOString()
    };

    console.table(Object.entries(payload).map(([campo, valor]) => ({
        campo,
        tipo: typeof valor,
        constructor: valor?.constructor?.name || null,
        esNodo: typeof Node !== "undefined" && valor instanceof Node
    })));
    console.debug("[NUEVO PACIENTE] payload.imc", {
        tipo: typeof payload.imc,
        constructor: payload.imc?.constructor?.name || null,
        esInput: typeof HTMLInputElement !== "undefined" && payload.imc instanceof HTMLInputElement
    });
    if (typeof HTMLInputElement !== "undefined" && payload.imc instanceof HTMLInputElement) {
        throw new Error("Valor DOM inválido en payload.imc");
    }

    const resultado = await crearPacienteProvisionalSeguro(payload, stableOperationId);
    const expedienteCognicion = String(resultado.expedienteCognicion || "").trim();
    if (expedienteCognicion) {
        payload = completarDatosConExpedienteCognicion(payload, expedienteCognicion);
    }
    const refPaciente = { id: resultado.id, expedienteCognicion };
    registerPatientNameParts({
        nombres: payload.nombres,
        apellidoPaterno: payload.apellidoPaterno,
        apellidoMaterno: payload.apellidoMaterno
    });
    invalidarListasPacientes();
    return refPaciente;

}

export async function solicitarEliminacionPaciente(uid, solicitadoPor, datosSolicitud = {}){
    const { crearDatosSolicitudEliminacion } = await import("./reportes.js?v=20260716-1");
    const fechaSolicitud = new Date().toISOString();
    const datosReporte = crearDatosSolicitudEliminacion({
        ...datosSolicitud,
        recursoTipo:"paciente",
        recursoId:uid,
        pacienteUid:uid,
        usuarioUid:datosSolicitud.usuarioUid || solicitadoPor || ""
    });
    const referenciaReporte = doc(collection(db, "reportesUsuarios"));
    const lote = writeBatch(db);

    lote.update(doc(db,"usuarios",uid), {
        estado:"suspendido",
        eliminacionSolicitada:true,
        fechaSolicitudEliminacion:fechaSolicitud,
        solicitadoPor:solicitadoPor
    });
    lote.set(referenciaReporte, {
        ...datosReporte,
        fechaISO:fechaSolicitud,
        fechaCreacion:serverTimestamp()
    });

    await lote.commit();
    return referenciaReporte;

}

export async function medicoPuedeVer(uidMedico, pacienteId) {
    if (!uidMedico || !pacienteId) return false;

    const claveCache = `${uidMedico}:${pacienteId}`;
    const permisoCache = leerCacheVigente(cachePermisosMedico, claveCache, TTL_LISTA_PACIENTES_MS);
    if (permisoCache !== null) return permisoCache;
    if (solicitudesPermisosMedico.has(claveCache)) return solicitudesPermisosMedico.get(claveCache);

    const solicitud = medicoPuedeVerSinCache(uidMedico, pacienteId)
        .then((resultado) => guardarCache(cachePermisosMedico, claveCache, resultado))
        .finally(() => solicitudesPermisosMedico.delete(claveCache));

    solicitudesPermisosMedico.set(claveCache, solicitud);
    return solicitud;
}

async function medicoPuedeVerSinCache(uidMedico, pacienteId) {

    const pacienteRef = doc(db, "usuarios", pacienteId);
    const pacienteSnap = await getDoc(pacienteRef);

    if (!pacienteSnap.exists()) return false;

    const paciente = pacienteSnap.data();
    if (patientAllowsProfessionalAccess(paciente, uidMedico)) return true;

    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedico
    );


    
    const permisoSnap = await getDoc(permisoRef);

    if (!permisoSnap.exists()) return false;

    return permisoSnap.data().lectura === true && patientAllowsProfessionalAccess({
        ...paciente,
        permisosMedicos: {
            ...(paciente.permisosMedicos || {}),
            [uidMedico]: permisoSnap.data()
        }
    }, uidMedico);
}

export { patientAllowsProfessionalAccess as canProfessionalAccessPatient };

export function permisosPorRol(tipoPermiso) {
    const permisos = {
        tratante: {
            lectura: true,
            agregarNotas: true,
            editarPaciente: true,
            administrarPermisos: true,
            rolPermiso: "tratante"
        },
        colaborador: {
            lectura: true,
            agregarNotas: true,
            editarPaciente: false,
            administrarPermisos: false,
            rolPermiso: "colaborador"
        },
        estudiante: {
            lectura: true,
            agregarNotas: false,
            editarPaciente: false,
            administrarPermisos: false,
            rolPermiso: "estudiante"
        }
    };

    return permisos[tipoPermiso] || permisos.estudiante;
}

export async function otorgarPermisoMedico(pacienteId, profesionalDestino, tipoPermiso, otorgadoPor) {
    const destino = String(profesionalDestino || "").trim();
    const destinoEsCorreo = destino.includes("@");
    await administrarPermisoPaciente({
        accion: "otorgar",
        pacienteId,
        profesionalCorreo: destinoEsCorreo ? destino.toLowerCase() : "",
        profesionalUid: destinoEsCorreo ? "" : destino,
        tipoPermiso,
        otorgadoPor
    });
    invalidarListasPacientes();
}

export async function obtenerPermisoMedico(pacienteId, uidMedico) {
    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedico
    );

    const snap = await getDoc(permisoRef);

    if (!snap.exists()) return null;

    return snap.data();
}

export async function listarPermisosMedicos(pacienteId) {
    const ref = collection(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos"
    );

    const snap = await getDocs(ref);

    return snap.docs.map((docPermiso) => ({
        uid: docPermiso.id,
        ...docPermiso.data()
    }));
}

export async function cambiarRolPermisoMedico(
    pacienteId,
    uidMedico,
    nuevoRol,
    modificadoPor
) {
    await administrarPermisoPaciente({
        accion: "actualizar",
        pacienteId,
        profesionalUid: uidMedico,
        tipoPermiso: nuevoRol,
        modificadoPor
    });
    invalidarListasPacientes();
}

export async function revocarPermisoMedico(
    pacienteId,
    uidMedico
) {
    await administrarPermisoPaciente({
        accion: "revocar",
        pacienteId,
        profesionalUid: uidMedico
    });
    invalidarListasPacientes();
}
