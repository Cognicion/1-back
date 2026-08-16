import { db } from "../firebase.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";
import { registerPatientNameParts } from "../modules/patient-transfer/parsing/patientNameDictionaries.js?v=20260814-patient-name-dictionary-v1";
import { usuarioEsProfesionalTipoMedico } from "../utils/roles.js";
import {
    createAuthorizedPatientQueryDescriptors,
    patientAllowsProfessionalAccess,
    patientListCacheKey
} from "./patientAccessCore.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    collectionGroup,
    documentId,
    getDocs,
    query,
    where,
    addDoc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const TTL_USUARIO_MS = 2 * 60 * 1000;
const TTL_LISTA_PACIENTES_MS = 45 * 1000;
const cacheUsuarios = new Map();
const solicitudesUsuariosPendientes = new Map();
const cacheListasPacientes = new Map();
const solicitudesListasPacientes = new Map();
const cachePermisosMedico = new Map();
const solicitudesPermisosMedico = new Map();
let colaAsignacionExpedientesCognicion = Promise.resolve();

function obtenerExpedienteCognicion(datos = {}) {
    return String(
        datos.expedienteCognicion
        || datos.datosInstitucionales?.expedienteCognicion
        || ""
    ).trim();
}

function encolarAsignacionExpedienteCognicion(tarea) {
    const ejecucion = colaAsignacionExpedientesCognicion.then(tarea, tarea);
    colaAsignacionExpedientesCognicion = ejecucion.catch(() => undefined);
    return ejecucion;
}

async function obtenerSiguienteExpedienteCognicion() {
    const anio = String(new Date().getFullYear()).slice(-2);
    const usuarios = await getDocs(collection(db, "usuarios"));
    let consecutivoMayor = 999;

    usuarios.forEach((documentoUsuario) => {
        const coincidencia = /^C(\d+)-(\d{2})$/.exec(
            obtenerExpedienteCognicion(documentoUsuario.data())
        );
        if (coincidencia?.[2] === anio) {
            consecutivoMayor = Math.max(consecutivoMayor, Number(coincidencia[1]));
        }
    });

    return `C${consecutivoMayor + 1}-${anio}`;
}

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

export async function asegurarExpedienteCognicionPaciente(uidPaciente, datosConocidos = {}) {
    if (!uidPaciente) return datosConocidos;
    const expedienteExistente = obtenerExpedienteCognicion(datosConocidos);
    if (expedienteExistente) return datosConocidos;

    return encolarAsignacionExpedienteCognicion(async () => {
        const referencia = doc(db, "usuarios", uidPaciente);
        const documentoActual = await getDoc(referencia);
        if (!documentoActual.exists()) return datosConocidos;

        const datosActuales = documentoActual.data();
        const expedienteActual = obtenerExpedienteCognicion(datosActuales);
        if (expedienteActual) return datosActuales;

        const expedienteCognicion = await obtenerSiguienteExpedienteCognicion();
        const datosActualizados = completarDatosConExpedienteCognicion(datosActuales, expedienteCognicion);
        await updateDoc(referencia, {
            expedienteCognicion,
            datosInstitucionales: datosActualizados.datosInstitucionales
        });
        invalidarCacheUsuario(uidPaciente);
        console.info("[EXPEDIENTE COGNICION] Folio asignado", { expedienteCognicion });
        return datosActualizados;
    });
}

async function asegurarExpedientesCognicionEnDocumentos(documentos = []) {
    const pendientes = documentos.filter((documentoPaciente) => (
        documentoPaciente?.id
        && documentoPaciente.data()?.rol === "paciente"
        && !obtenerExpedienteCognicion(documentoPaciente.data())
    ));
    if (!pendientes.length) return;

    await encolarAsignacionExpedienteCognicion(async () => {
        const anio = String(new Date().getFullYear()).slice(-2);
        const usuarios = await getDocs(collection(db, "usuarios"));
        const datosActualesPorId = new Map();
        let consecutivoMayor = 999;

        usuarios.forEach((documentoUsuario) => {
            const datosUsuario = documentoUsuario.data();
            datosActualesPorId.set(documentoUsuario.id, datosUsuario);
            const coincidencia = /^C(\d+)-(\d{2})$/.exec(obtenerExpedienteCognicion(datosUsuario));
            if (coincidencia?.[2] === anio) {
                consecutivoMayor = Math.max(consecutivoMayor, Number(coincidencia[1]));
            }
        });

        pendientes.sort((a, b) => {
            const fechaA = String(a.data()?.fechaCreacion || "");
            const fechaB = String(b.data()?.fechaCreacion || "");
            return fechaA.localeCompare(fechaB) || a.id.localeCompare(b.id);
        });

        let lote = writeBatch(db);
        let operaciones = 0;
        let expedientesAsignados = 0;
        const confirmarLote = async () => {
            if (!operaciones) return;
            await lote.commit();
            lote = writeBatch(db);
            operaciones = 0;
        };

        for (const documentoPaciente of pendientes) {
            const datosActuales = datosActualesPorId.get(documentoPaciente.id) || documentoPaciente.data();
            if (obtenerExpedienteCognicion(datosActuales)) continue;
            consecutivoMayor += 1;
            const expedienteCognicion = `C${consecutivoMayor}-${anio}`;
            const datosCompletos = completarDatosConExpedienteCognicion(datosActuales, expedienteCognicion);
            lote.update(doc(db, "usuarios", documentoPaciente.id), {
                expedienteCognicion,
                datosInstitucionales: datosCompletos.datosInstitucionales
            });
            operaciones += 1;
            expedientesAsignados += 1;
            invalidarCacheUsuario(documentoPaciente.id);
            if (operaciones >= 400) await confirmarLote();
        }

        await confirmarLote();
        invalidarListasPacientes();
        if (expedientesAsignados) {
            console.info("[EXPEDIENTE COGNICION] Folios pendientes completados", {
                cantidad: expedientesAsignados,
                ultimoConsecutivo: consecutivoMayor,
                anio
            });
        }
    });
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

    const usuariosRef = collection(db,"usuarios");
    const consultas = createAuthorizedPatientQueryDescriptors(uidMedico).map((descriptor) =>
        query(usuariosRef, where(descriptor.field, descriptor.operator, descriptor.value))
    );

    const resultados = await Promise.allSettled(
        consultas.map((consulta) => getDocs(consulta))
    );
    const pacientes = new Map();
    let primerError = null;

    resultados.forEach((resultado) => {
        if (resultado.status === "rejected") {
            primerError = primerError || resultado.reason;
            return;
        }

        resultado.value.forEach((docPaciente) => {
            const datos = docPaciente.data();
            if (patientAllowsProfessionalAccess(datos, uidMedico)) {
                pacientes.set(docPaciente.id, docPaciente);
            }
        });
    });

    if (!pacientes.size && primerError && resultados.every((resultado) => resultado.status === "rejected")) {
        throw primerError;
    }

    try {
        const permisosSnap = await getDocs(query(
            collectionGroup(db, "permisosMedicos"),
            where(documentId(), "==", uidMedico),
            where("lectura", "==", true)
        ));

        const pacientesPorPermiso = await Promise.all(permisosSnap.docs.map(async (permisoDoc) => {
            const pacienteRef = permisoDoc.ref.parent.parent;
            if (!pacienteRef || pacientes.has(pacienteRef.id)) return null;
            const pacienteSnap = await getDoc(pacienteRef);
            if (!pacienteSnap.exists()) return null;
            const datos = pacienteSnap.data();
            return patientAllowsProfessionalAccess({
                ...datos,
                permisosMedicos: {
                    ...(datos.permisosMedicos || {}),
                    [uidMedico]: permisoDoc.data()
                }
            }, uidMedico) ? pacienteSnap : null;
        }));

        pacientesPorPermiso
            .filter(Boolean)
            .forEach((pacienteSnap) => pacientes.set(pacienteSnap.id, pacienteSnap));
    } catch (error) {
        console.warn("No se pudieron consultar permisos medicos agrupados:", error);
    }

    await asegurarExpedientesCognicionEnDocumentos(Array.from(pacientes.values())).catch((error) => {
        console.warn("[EXPEDIENTE COGNICION] No se pudieron completar todos los folios pendientes:", error);
    });

    const docs = Array.from(pacientes.values()).sort((a,b) => {
        const nombreA = obtenerNombrePacienteParaMostrar(a.data());
        const nombreB = obtenerNombrePacienteParaMostrar(b.data());
        return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    });

    return crearResultadoPacientesDesdeDocs(docs);

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

export async function crearPacienteProvisional(datos){

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

    const refPaciente = await encolarAsignacionExpedienteCognicion(async () => {
        const expedienteExistente = obtenerExpedienteCognicion(payload);
        const expedienteCognicion = expedienteExistente || await obtenerSiguienteExpedienteCognicion();
        payload = completarDatosConExpedienteCognicion(payload, expedienteCognicion);
        return addDoc(collection(db,"usuarios"), payload);
    });
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

export async function otorgarPermisoMedico(pacienteId, uidMedicoDestino, tipoPermiso, otorgadoPor) {
    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedicoDestino
    );

    await setDoc(permisoRef, {
        ...permisosPorRol(tipoPermiso),
        fechaOtorgamiento: new Date().toISOString(),
        otorgadoPor: otorgadoPor
    });
    invalidarListasPacientes();
}

export async function buscarMedicoPorCorreo(correo) {
  const q = query(
    collection(db, "usuarios"),
    where("email", "==", correo)
  );

  const snap = await getDocs(q);

  if (snap.empty) return null;

  const docMedico = snap.docs.find((docUsuario) => usuarioEsProfesionalTipoMedico(docUsuario.data().rol));
  if (!docMedico) return null;

  return {
        uid: docMedico.id,
        ...docMedico.data()
    };
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
    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedico
    );

    await updateDoc(permisoRef, {
        ...permisosPorRol(nuevoRol),
        fechaModificacion: new Date().toISOString(),
        modificadoPor
    });
    invalidarListasPacientes();
}

export async function revocarPermisoMedico(
    pacienteId,
    uidMedico
) {
    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedico
    );

    await deleteDoc(permisoRef);
    invalidarListasPacientes();
}
