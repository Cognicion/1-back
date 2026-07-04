import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function guardarNota(uidPaciente, datosNota) {
  const referencia = await addDoc(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    {
      ...datosNota,
      fecha: new Date().toISOString()
    }
  );
  return referencia.id;
}

export async function obtenerHistorialNotas(uidPaciente) {
  const q = query(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    orderBy("fecha", "desc")
  );

  return await getDocs(q);
}

export async function actualizarNota(uidPaciente, notaId, datosEdicion) {
  await updateDoc(
    doc(db, "usuarios", uidPaciente, "notasMedicas", notaId),
    {
      notaEditada: datosEdicion,
      ediciones: arrayUnion(datosEdicion),
      fechaUltimaEdicion: new Date().toISOString()
    }
  );
}
