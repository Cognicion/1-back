import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from "./firebaseAppService.js";

export const CLAVE_VISITANTE_COGNICION = "cognicion_visitante_id";

function obtenerIdVisitante() {
  try {
    const existente = globalThis.localStorage?.getItem(CLAVE_VISITANTE_COGNICION);
    if (existente) return existente;
    const nuevo = globalThis.crypto?.randomUUID?.() || `visitante-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    globalThis.localStorage?.setItem(CLAVE_VISITANTE_COGNICION, nuevo);
    return nuevo;
  } catch (_) {
    return `visitante-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function datosUsuarioVisita(usuario = null, perfil = null) {
  return {
    usuarioUid: usuario?.uid || "",
    nombre: perfil?.nombre || usuario?.displayName || usuario?.email || "",
    email: perfil?.email || usuario?.email || "",
    rol: perfil?.rol || perfil?.role || ""
  };
}

export async function registrarVisita({ usuario = auth.currentUser, perfil = null } = {}) {
  const visitanteId = obtenerIdVisitante();
  const referencia = doc(collection(db, "visitas"), visitanteId);
  const datosUsuario = datosUsuarioVisita(usuario, perfil);
  const existente = await getDoc(referencia);
  const esRegistrado = Boolean(datosUsuario.usuarioUid);

  await setDoc(referencia, {
    visitanteId,
    tipo: esRegistrado ? "registrado" : "invitado",
    ...datosUsuario,
    primeraVisitaTexto: existente.exists()
      ? existente.data().primeraVisitaTexto || new Date().toISOString()
      : new Date().toISOString(),
    ultimaVisita: serverTimestamp(),
    ultimaVisitaTexto: new Date().toISOString(),
    ultimaRuta: globalThis.location?.pathname || "",
    userAgent: globalThis.navigator?.userAgent || ""
  }, { merge: true });

  return { visitanteId, tipo: esRegistrado ? "registrado" : "invitado" };
}
