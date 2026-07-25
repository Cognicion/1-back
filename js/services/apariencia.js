import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";
import {
  applyTheme,
  initializeThemeForUser,
  normalizeTheme,
  setThemeForUser
} from "./themeService.js";

export const TEMAS_COGNICION = Object.freeze({
  CLASICA: "clasica",
  LABORATORIO: "laboratorio"
});

export const MODOS_INTERFAZ_COGNICION = Object.freeze({
  OSCURO: "dark",
  CLARO: "light"
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

export const OPCIONES_MODO_INTERFAZ_COGNICION = [
  {
    id: MODOS_INTERFAZ_COGNICION.OSCURO,
    nombre: "Futurista Oscuro",
    icono: "\u{1F319}",
    descripcion: "La identidad oscura original de COGNICION Labs. Alto contraste, profundidad y brillo azul clinico."
  },
  {
    id: MODOS_INTERFAZ_COGNICION.CLARO,
    nombre: "Claro",
    icono: "\u2600\uFE0F",
    descripcion: "Gris neutro, paneles blancos, texto oscuro y acento verde profundo."
  }
];

const CLAVE_LOCAL = "cognicion.apariencia.tema";
const TEMA_PREDETERMINADO_COGNICION = TEMAS_COGNICION.LABORATORIO;
const MODO_PREDETERMINADO_COGNICION = MODOS_INTERFAZ_COGNICION.CLARO;
const cacheAparienciaUsuario = new Map();

export function normalizarTemaCognicion(tema) {
  const valor = String(tema || "").toLowerCase().trim();
  return OPCIONES_TEMA_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : TEMA_PREDETERMINADO_COGNICION;
}


export function normalizarModoInterfazCognicion(modo) {
  return normalizeTheme(modo);
}

export function obtenerModoInterfazLocalCognicion() {
  return normalizarModoInterfazCognicion(document.documentElement.dataset.theme);
}

export function guardarModoInterfazLocalCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  return modoSeguro;
}

export function aplicarModoInterfazCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  return applyTheme(modoSeguro);
}
export function obtenerTemaLocalCognicion() {
  try {
    const guardado = localStorage.getItem(CLAVE_LOCAL);
    return guardado ? normalizarTemaCognicion(guardado) : TEMA_PREDETERMINADO_COGNICION;
  } catch (error) {
    return TEMA_PREDETERMINADO_COGNICION;
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
  applyTheme("light");
  return aplicarTemaCognicion(obtenerTemaLocalCognicion());
}

export async function obtenerPreferenciaAparienciaUsuario(uid) {
  if (!uid) return obtenerTemaLocalCognicion();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const datos = snap.exists() ? snap.data() : {};
    const temaRemoto = datos?.preferencias?.apariencia?.tema || datos?.apariencia?.tema || datos?.temaApariencia;
    return temaRemoto ? normalizarTemaCognicion(temaRemoto) : obtenerTemaLocalCognicion();
  } catch (error) {
    console.warn("No se pudo leer la apariencia del usuario.", error);
    return obtenerTemaLocalCognicion();
  }
}
export async function obtenerModoInterfazUsuario(uid) {
  return initializeThemeForUser(uid ? { uid } : null);
}

export async function sincronizarAparienciaUsuario(uid, datosUsuario = null) {
  let datos = datosUsuario;
  if (uid && datos) {
    cacheAparienciaUsuario.set(uid, Promise.resolve({
      exists: () => true,
      data: () => datos
    }));
  }
  if (uid && !datos) {
    try {
      if (!cacheAparienciaUsuario.has(uid)) {
        cacheAparienciaUsuario.set(uid, getDoc(doc(db, "usuarios", uid)));
      }
      const snap = await cacheAparienciaUsuario.get(uid);
      datos = snap.exists() ? snap.data() : {};
    } catch (error) {
      console.warn("No se pudo leer la apariencia del usuario.", error);
      datos = {};
    }
  }
  const temaRemoto = datos?.preferencias?.apariencia?.tema || datos?.apariencia?.tema || datos?.temaApariencia;
  const modoRemoto = datos?.preferencias?.apariencia?.modoInterfaz || datos?.preferencias?.tema || datos?.apariencia?.modoInterfaz || datos?.modoInterfaz;
  const tema = temaRemoto ? normalizarTemaCognicion(temaRemoto) : obtenerTemaLocalCognicion();
  const modoInterfaz = normalizarModoInterfazCognicion(modoRemoto);
  guardarTemaLocalCognicion(tema);
  await initializeThemeForUser(uid ? { uid } : null, datos);
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
export async function guardarModoInterfazUsuario(uid, modo) {
  const modoSeguro = guardarModoInterfazLocalCognicion(modo);
  return setThemeForUser(uid ? { uid } : null, modoSeguro);
}
