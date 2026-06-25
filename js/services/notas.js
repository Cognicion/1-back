import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function guardarNota(uidPaciente, datosNota) {
  await addDoc(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    {
      ...datosNota,
      fecha: new Date().toISOString()
    }
  );
}

export async function obtenerHistorialNotas(uidPaciente) {
  const q = query(
    collection(db, "usuarios", uidPaciente, "notasMedicas"),
    orderBy("fecha", "desc")
  );

  return await getDocs(q);
}
