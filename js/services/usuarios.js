import { db } from "../firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    query,
    where,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



export async function obtenerUsuario(uid){

    const snap = await getDoc(
        doc(db,"usuarios",uid)
    );

    if(!snap.exists()) return null;

    return snap.data();

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

export async function listarPacientes(uidMedico = ""){

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

    const docs = Array.from(pacientes.values()).sort((a,b) => {
        const nombreA = (a.data().nombre || a.data().nombreCompleto || "").toString();
        const nombreB = (b.data().nombre || b.data().nombreCompleto || "").toString();
        return nombreA.localeCompare(nombreB, "es", { sensitivity: "base" });
    });

    return crearResultadoPacientesDesdeDocs(docs);

}



export async function actualizarUsuario(uid,datos){

    await updateDoc(
        doc(db,"usuarios",uid),
        datos
    );

}



export async function crearUsuario(uid,datos){

    await setDoc(
        doc(db,"usuarios",uid),
        datos
    );

}

export async function crearPacienteProvisional(datos){

    return await addDoc(
        collection(db,"usuarios"),
        {
            ...datos,
            rol:"paciente",
            tieneCuenta:false,
            fechaCreacion:new Date().toISOString()
        }
    );

}

export async function solicitarEliminacionPaciente(uid, solicitadoPor){

    await updateDoc(
        doc(db,"usuarios",uid),
        {
            estado:"suspendido",
            eliminacionSolicitada:true,
            fechaSolicitudEliminacion:new Date().toISOString(),
            solicitadoPor:solicitadoPor
        }
    );

}

export async function medicoPuedeVer(uidMedico, pacienteId) {
    if (!uidMedico || !pacienteId) return false;

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
}

export async function buscarMedicoPorCorreo(correo) {
    const q = query(
        collection(db, "usuarios"),
        where("email", "==", correo),
        where("rol", "==", "medico")
    );

    const snap = await getDocs(q);

    if (snap.empty) return null;

    const docMedico = snap.docs[0];

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
}
