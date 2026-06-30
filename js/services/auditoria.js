import { db } from "../firebase.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function registrarEventoAuditoria({
  accion,
  modulo,
  descripcion,
  usuarioUid,
  usuarioNombre = "",
  usuarioRol = "",
  pacienteUid = "",
  pacienteNombre = "",
  exito = true,
  detalles = {}
}) {

    console.log("Entré a registrarEventoAuditoria");

  try {
    const navegador = navigator.userAgent;
    const idioma = navigator.language;
    const plataforma = navigator.platform;

    await addDoc(collection(db, "auditoria"), {
      accion,
      modulo,
      descripcion,

      usuarioUid,
      usuarioNombre,
      usuarioRol,

      pacienteUid,
      pacienteNombre,

      exito,
      detalles,

      navegador,
      idioma,
      plataforma,

      fecha: serverTimestamp(),
      fechaTexto: new Date().toISOString()
    });

  } catch (error) {
  console.error("ERROR AUDITORÍA:", error);
  throw error;
}
}