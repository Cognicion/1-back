import { db } from "../firebase.js";
import { obtenerNombrePacienteParaMostrar } from "../utils/nombresPacientes.js";
import { usuarioEsProfesionalTipoMedico } from "../utils/roles.js";

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

    const claveCache = uidMedico || "__todos__";
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
        const q = query(
            collection(db,"usuarios"),
            where("rol","==","paciente")
        );

        return await getDocs(q);
    }

    const usuariosRef = collection(db,"usuarios");
    const camposVinculo = [
        "creadoPor",
        "ownerUid",
        "createdByUid",
        "medicoUid",
        "medicoTratanteUid",
        "medicoTratanteUID"
    ];
    const consultas = camposVinculo.map((campo) =>
        query(usuariosRef, where(campo,"==",uidMedico))
    );

    consultas.push(
        query(usuariosRef, where("medicosAutorizados","array-contains",uidMedico))
    );

    consultas.push(
        query(usuariosRef, where("medicosAutorizadosUid","array-contains",uidMedico))
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
            if (datos.rol === "paciente") {
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
            return datos.rol === "paciente" ? pacienteSnap : null;
        }));

        pacientesPorPermiso
            .filter(Boolean)
            .forEach((pacienteSnap) => pacientes.set(pacienteSnap.id, pacienteSnap));
    } catch (error) {
        console.warn("No se pudieron consultar permisos medicos agrupados:", error);
    }

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

    const refPaciente = await addDoc(
        collection(db,"usuarios"),
        {
            ...datos,
            rol:"paciente",
            tieneCuenta:false,
            fechaCreacion:new Date().toISOString()
        }
    );
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
    const camposPropietario = [
        paciente.creadoPor,
        paciente.ownerUid,
        paciente.createdByUid,
        paciente.medicoUid,
        paciente.medicoTratanteUid,
        paciente.medicoTratanteUID
    ].filter(Boolean);

    if (camposPropietario.includes(uidMedico)) return true;

    if (Array.isArray(paciente.medicosAutorizados) && paciente.medicosAutorizados.includes(uidMedico)) return true;
    if (Array.isArray(paciente.medicosAutorizadosUid) && paciente.medicosAutorizadosUid.includes(uidMedico)) return true;
    if (paciente.permisosMedicos && paciente.permisosMedicos[uidMedico]?.lectura === true) return true;

    const permisoRef = doc(
        db,
        "usuarios",
        pacienteId,
        "permisosMedicos",
        uidMedico
    );


    
    const permisoSnap = await getDoc(permisoRef);

    if (!permisoSnap.exists()) return false;

    return permisoSnap.data().lectura === true;
}

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
