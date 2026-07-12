import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";

export const TEMAS_COGNICION = Object.freeze({
  CLASICA: "clasica",
  LABORATORIO: "laboratorio"
});

export const OPCIONES_TEMA_COGNICION = [
  {
    id: TEMAS_COGNICION.CLASICA,
    nombre: "Clasica",
    descripcion: "Conserva exactamente la interfaz actual de Cognicion."
  },
  {
    id: TEMAS_COGNICION.LABORATORIO,
    nombre: "Laboratorio",
    descripcion: "Activa una capa visual futurista tipo panel medico avanzado."
  }
];

const CLAVE_LOCAL = "cognicion.apariencia.tema";

export function normalizarTemaCognicion(tema) {
  const valor = String(tema || "").toLowerCase().trim();
  return OPCIONES_TEMA_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : TEMAS_COGNICION.CLASICA;
}

export function obtenerTemaLocalCognicion() {
  try {
    return normalizarTemaCognicion(localStorage.getItem(CLAVE_LOCAL));
  } catch (error) {
    return TEMAS_COGNICION.CLASICA;
  }
}

export function guardarTemaLocalCognicion(tema) {
  const temaSeguro = normalizarTemaCognicion(tema);
  try {
    localStorage.setItem(CLAVE_LOCAL, temaSeguro);
  } catch (error) {
    console.warn("No se pudo guardar la apariencia local.", error);
  }
  return temaSeguro;
}

export function aplicarTemaCognicion(tema) {
  const temaSeguro = normalizarTemaCognicion(tema);
  const root = document.documentElement;
  document.body?.classList.toggle("tema-laboratorio", temaSeguro === TEMAS_COGNICION.LABORATORIO);
  root.dataset.cognicionTheme = temaSeguro;
  return temaSeguro;
}

export function aplicarAparienciaGuardada() {
  return aplicarTemaCognicion(obtenerTemaLocalCognicion());
}

export async function obtenerPreferenciaAparienciaUsuario(uid) {
  if (!uid) return obtenerTemaLocalCognicion();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const datos = snap.exists() ? snap.data() : {};
    return normalizarTemaCognicion(
      datos?.preferencias?.apariencia?.tema ||
      datos?.apariencia?.tema ||
      datos?.temaApariencia ||
      obtenerTemaLocalCognicion()
    );
  } catch (error) {
    console.warn("No se pudo leer la apariencia del usuario.", error);
    return obtenerTemaLocalCognicion();
  }
}

export async function sincronizarAparienciaUsuario(uid) {
  const tema = await obtenerPreferenciaAparienciaUsuario(uid);
  guardarTemaLocalCognicion(tema);
  aplicarTemaCognicion(tema);
  return tema;
}

export async function guardarPreferenciaAparienciaUsuario(uid, tema) {
  const temaSeguro = guardarTemaLocalCognicion(tema);
  aplicarTemaCognicion(temaSeguro);
  if (uid) {
    await setDoc(doc(db, "usuarios", uid), {
      preferencias: {
        apariencia: {
          tema: temaSeguro,
          actualizadoEn: serverTimestamp()
        }
      }
    }, { merge: true });
  }
  return temaSeguro;
}