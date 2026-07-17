import { db } from "../firebase.js";
import { normalizarTratamientoFrecuencia } from "../utils/frecuencias.js";

import {
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const coleccionTratamientos = (uidPaciente) =>
  collection(db, "usuarios", uidPaciente, "tratamientos");

export async function crearTratamiento(uidPaciente, datos) {
  return await addDoc(coleccionTratamientos(uidPaciente), {
    ...normalizarTratamientoFrecuencia(datos),
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString()
  });
}

export async function listarTratamientos(uidPaciente) {
  const q = query(coleccionTratamientos(uidPaciente), orderBy("fechaInicio", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((docTratamiento) => ({
    id: docTratamiento.id,
    ...normalizarTratamientoFrecuencia(docTratamiento.data())
  }));
}

export async function actualizarTratamiento(uidPaciente, tratamientoId, datos) {
  await updateDoc(
    doc(db, "usuarios", uidPaciente, "tratamientos", tratamientoId),
    {
      ...normalizarTratamientoFrecuencia(datos),
      fechaActualizacion: new Date().toISOString()
    }
  );
}

export async function eliminarTratamiento(uidPaciente, tratamientoId) {
  await deleteDoc(doc(db, "usuarios", uidPaciente, "tratamientos", tratamientoId));
}
