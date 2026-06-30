import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const coleccionNotasRapidas = (uidPaciente) =>
  collection(db, "usuarios", uidPaciente, "notasRapidas");

export async function crearNotaRapida(uidPaciente, datos) {
  return await addDoc(coleccionNotasRapidas(uidPaciente), {
    ...datos,
    fechaISO: new Date().toISOString()
  });
}

export async function listarNotasRapidas(uidPaciente) {
  const q = query(coleccionNotasRapidas(uidPaciente), orderBy("fechaISO", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((docNota) => ({
    id: docNota.id,
    ...docNota.data()
  }));
}
