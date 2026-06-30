import { db } from "../firebase.js";

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

const coleccionEstudios = (uidPaciente) =>
  collection(db, "usuarios", uidPaciente, "estudios");

export async function crearEstudio(uidPaciente, datos) {
  return await addDoc(coleccionEstudios(uidPaciente), {
    ...datos,
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString()
  });
}

export async function listarEstudios(uidPaciente) {
  const q = query(coleccionEstudios(uidPaciente), orderBy("fecha", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((docEstudio) => ({
    id: docEstudio.id,
    ...docEstudio.data()
  }));
}

export async function actualizarEstudio(uidPaciente, estudioId, datos) {
  await updateDoc(
    doc(db, "usuarios", uidPaciente, "estudios", estudioId),
    {
      ...datos,
      fechaActualizacion: new Date().toISOString()
    }
  );
}

export async function eliminarEstudio(uidPaciente, estudioId) {
  await deleteDoc(doc(db, "usuarios", uidPaciente, "estudios", estudioId));
}
