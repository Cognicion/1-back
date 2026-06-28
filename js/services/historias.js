import { db } from "../firebase.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function guardarHistoriaClinica(uidPaciente, datosHistoria) {
  await setDoc(
    doc(db, "usuarios", uidPaciente, "historiaClinica", "historiaInicial"),
    {
      ...datosHistoria,
      fechaActualizacion: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function obtenerHistoriaClinica(uidPaciente) {
  return await getDoc(
    doc(db, "usuarios", uidPaciente, "historiaClinica", "historiaInicial")
  );
}