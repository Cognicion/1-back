import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";
import {
  applyTheme,
  initializeThemeForUser,
  normalizeTheme,
  setThemeForUser
} from "./themeService.js";
import { getBiocellularPreferences, saveBiocellularPreferences } from "../themes/biocellularPreferences.js";

const TEMA_LABORATORIO = "laboratorio";

export const MODOS_INTERFAZ_COGNICION = Object.freeze({
  OSCURO: "dark",
  CLARO: "light",
  BIOCELULAR: "biocelular"
});

export const OPCIONES_MODO_INTERFAZ_COGNICION = [
  {
    id: MODOS_INTERFAZ_COGNICION.BIOCELULAR,
    nombre: "Biocelular",
    icono: "◉",
    descripcion: "Tema predeterminado. Entorno microscópico orgánico con animación ligera o fondo estático según el dispositivo."
  },
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
    descripcion: "Fondo blanco, superficies pastel configurables y texto oscuro."
  }
];

export const PALETAS_CLARAS_COGNICION = Object.freeze({
  MENTA: "menta",
  CIELO: "cielo",
  LAVANDA: "lavanda",
  DURAZNO: "durazno"
});

export const OPCIONES_PALETA_CLARA_COGNICION = [
  { id: PALETAS_CLARAS_COGNICION.MENTA, nombre: "Menta", descripcion: "Verde claro, fresco y clínico." },
  { id: PALETAS_CLARAS_COGNICION.CIELO, nombre: "Cielo", descripcion: "Azul pastel sereno y luminoso." },
  { id: PALETAS_CLARAS_COGNICION.LAVANDA, nombre: "Lavanda", descripcion: "Violeta suave y descansado." },
  { id: PALETAS_CLARAS_COGNICION.DURAZNO, nombre: "Durazno", descripcion: "Cálido, amable y discreto." }
];

const CLAVE_LOCAL = "cognicion.apariencia.tema";
const CLAVE_PALETA_CLARA = "cognicion.apariencia.paletaClara";
const TEMA_PREDETERMINADO_COGNICION = TEMA_LABORATORIO;
const MODO_PREDETERMINADO_COGNICION = MODOS_INTERFAZ_COGNICION.BIOCELULAR;
const cacheAparienciaUsuario = new Map();

export function normalizarTemaCognicion() {
  return TEMA_PREDETERMINADO_COGNICION;
}


export function normalizarModoInterfazCognicion(modo) {
  return normalizeTheme(modo);
}

export function normalizarPaletaClaraCognicion(paleta) {
  const valor = String(paleta || "").toLowerCase().trim();
  return OPCIONES_PALETA_CLARA_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : PALETAS_CLARAS_COGNICION.MENTA;
}

export function obtenerPaletaClaraLocalCognicion() {
  try {
    return normalizarPaletaClaraCognicion(localStorage.getItem(CLAVE_PALETA_CLARA));
  } catch (_) {
    return PALETAS_CLARAS_COGNICION.MENTA;
  }
}

export function aplicarPaletaClaraCognicion(paleta) {
  const paletaSegura = normalizarPaletaClaraCognicion(paleta);
  document.documentElement.dataset.paletaClara = paletaSegura;
  return paletaSegura;
}

export function guardarPaletaClaraLocalCognicion(paleta) {
  const paletaSegura = aplicarPaletaClaraCognicion(paleta);
  try { localStorage.setItem(CLAVE_PALETA_CLARA, paletaSegura); } catch (_) { /* almacenamiento no disponible */ }
  return paletaSegura;
}

export function obtenerModoInterfazLocalCognicion() {
  return normalizarModoInterfazCognicion(document.documentElement.dataset.theme);
}

export function guardarModoInterfazLocalCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  try { localStorage.setItem("cognicion:theme:last", modoSeguro); } catch (_) { /* almacenamiento no disponible */ }
  return modoSeguro;
}

export function aplicarModoInterfazCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  return applyTheme(modoSeguro);
}
export function obtenerTemaLocalCognicion() {
  try {
    localStorage.setItem(CLAVE_LOCAL, TEMA_PREDETERMINADO_COGNICION);
  } catch (_) { /* almacenamiento no disponible */ }
  return TEMA_PREDETERMINADO_COGNICION;
}

export function guardarTemaLocalCognicion() {
  try {
    localStorage.setItem(CLAVE_LOCAL, TEMA_PREDETERMINADO_COGNICION);
  } catch (error) {
    console.warn("No se pudo guardar la apariencia local.", error);
  }
  return TEMA_PREDETERMINADO_COGNICION;
}

export function aplicarTemaCognicion() {
  const root = document.documentElement;
  document.body?.classList.add("tema-laboratorio");
  root.dataset.cognicionTheme = TEMA_PREDETERMINADO_COGNICION;
  return TEMA_PREDETERMINADO_COGNICION;
}

export function aplicarAparienciaGuardada() {
  applyTheme(document.documentElement.dataset.theme || MODO_PREDETERMINADO_COGNICION);
  return aplicarTemaCognicion(obtenerTemaLocalCognicion());
}

export async function obtenerPreferenciaAparienciaUsuario(uid) {
  void uid;
  return obtenerTemaLocalCognicion();
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
  const biocellularRemoto = datos?.preferencias?.apariencia?.biocelular;
  const modoRemoto = datos?.preferencias?.apariencia?.modoInterfaz || datos?.preferencias?.tema || datos?.apariencia?.modoInterfaz || datos?.modoInterfaz;
  const paletaClaraRemota = datos?.preferencias?.apariencia?.paletaClara || datos?.apariencia?.paletaClara;
  const tema = TEMA_PREDETERMINADO_COGNICION;
  const modoInterfaz = normalizarModoInterfazCognicion(modoRemoto);
  guardarTemaLocalCognicion(tema);
  guardarPaletaClaraLocalCognicion(paletaClaraRemota || obtenerPaletaClaraLocalCognicion());
  if (biocellularRemoto && typeof biocellularRemoto === "object") saveBiocellularPreferences(biocellularRemoto);
  await initializeThemeForUser(uid ? { uid } : null, datos);
  aplicarTemaCognicion(tema);
  return tema;
}

export async function guardarPreferenciasBiocellularUsuario(uid, preferences) {
  const value = saveBiocellularPreferences(preferences);
  if (uid) {
    await setDoc(doc(db, "usuarios", uid), { preferencias: { apariencia: { biocelular: value } } }, { merge: true });
  }
  return value;
}
export async function guardarModoInterfazUsuario(uid, modo) {
  const modoSeguro = guardarModoInterfazLocalCognicion(modo);
  return setThemeForUser(uid ? { uid } : null, modoSeguro);
}

export async function guardarPaletaClaraUsuario(uid, paleta) {
  const paletaSegura = guardarPaletaClaraLocalCognicion(paleta);
  if (uid) {
    await setDoc(doc(db, "usuarios", uid), {
      preferencias: { apariencia: { paletaClara: paletaSegura } }
    }, { merge: true });
  }
  return paletaSegura;
}
