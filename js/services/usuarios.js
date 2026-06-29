import { db } from "../firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
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



export async function listarPacientes(){

    const q = query(
        collection(db,"usuarios"),
        where("rol","==","paciente")
    );

    return await getDocs(q);

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

export function medicoPuedeVer(uidMedico, paciente) {
  if (!paciente || !uidMedico) return false;

  if (paciente.medicoTratanteUid === uidMedico) return true;

  return paciente.permisos?.[uidMedico]?.lectura === true;
}