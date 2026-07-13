import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";

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
    nombre: "Futurista Claro",
    icono: "\u2600\uFE0F",
    descripcion: "Una version luminosa, limpia y medica, conservando acentos cian y el lenguaje futurista."
  }
];

const CLAVE_LOCAL = "cognicion.apariencia.tema";
const CLAVE_LOCAL_MODO = "cognicion.apariencia.modoInterfaz";

export function normalizarTemaCognicion(tema) {
  const valor = String(tema || "").toLowerCase().trim();
  return OPCIONES_TEMA_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : TEMAS_COGNICION.CLASICA;
}


export function normalizarModoInterfazCognicion(modo) {
  const valor = String(modo || "").toLowerCase().trim();
  return OPCIONES_MODO_INTERFAZ_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : MODOS_INTERFAZ_COGNICION.OSCURO;
}

export function obtenerModoInterfazLocalCognicion() {
  try {
    return normalizarModoInterfazCognicion(localStorage.getItem(CLAVE_LOCAL_MODO));
  } catch (error) {
    return MODOS_INTERFAZ_COGNICION.OSCURO;
  }
}

export function guardarModoInterfazLocalCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  try {
    localStorage.setItem(CLAVE_LOCAL_MODO, modoSeguro);
  } catch (error) {
    console.warn("No se pudo guardar el modo de interfaz local.", error);
  }
  return modoSeguro;
}

export function aplicarModoInterfazCognicion(modo) {
  const modoSeguro = normalizarModoInterfazCognicion(modo);
  const root = document.documentElement;
  const esClaro = modoSeguro === MODOS_INTERFAZ_COGNICION.CLARO;
  root.dataset.theme = modoSeguro;
  root.dataset.cognicionInterface = modoSeguro;
  root.style.colorScheme = esClaro ? "light" : "dark";
  document.body?.classList.toggle("tema-claro", esClaro);
  document.body?.classList.toggle("tema-oscuro", !esClaro);
  return modoSeguro;
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
  aplicarModoInterfazCognicion(obtenerModoInterfazLocalCognicion());
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
export async function obtenerModoInterfazUsuario(uid) {
  if (!uid) return obtenerModoInterfazLocalCognicion();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const datos = snap.exists() ? snap.data() : {};
    return normalizarModoInterfazCognicion(
      datos?.preferencias?.apariencia?.modoInterfaz ||
      datos?.apariencia?.modoInterfaz ||
      datos?.modoInterfaz ||
      obtenerModoInterfazLocalCognicion()
    );
  } catch (error) {
    console.warn("No se pudo leer el modo de interfaz del usuario.", error);
    return obtenerModoInterfazLocalCognicion();
  }
}

export async function sincronizarAparienciaUsuario(uid) {
  const [tema, modoInterfaz] = await Promise.all([
    obtenerPreferenciaAparienciaUsuario(uid),
    obtenerModoInterfazUsuario(uid)
  ]);
  guardarTemaLocalCognicion(tema);
  guardarModoInterfazLocalCognicion(modoInterfaz);
  aplicarModoInterfazCognicion(modoInterfaz);
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
  aplicarModoInterfazCognicion(modoSeguro);
  if (uid) {
    await setDoc(doc(db, "usuarios", uid), {
      preferencias: {
        apariencia: {
          modoInterfaz: modoSeguro,
          modoInterfazActualizadoEn: serverTimestamp()
        }
      }
    }, { merge: true });
  }
  return modoSeguro;
}