import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase.js";

export const TEMAS_COGNICION = Object.freeze({
  CLASICA: "clasica",
  LABORATORIO: "laboratorio"
});

export const MODOS_INTERFAZ_COGNICION = Object.freeze({
  OSCURO: "dark",
  CLARO: "light",
  CLARO_GRIS: "light-gray",
  CLARO_MENTA: "light-mint",
  CLARO_LAVANDA: "light-lavender"
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
    nombre: "Claro Azul Pastel",
    icono: "\u2600\uFE0F",
    descripcion: "Fondos blancos con tarjetas azul pastel, acentos cian y texto azul oscuro."
  },
  {
    id: MODOS_INTERFAZ_COGNICION.CLARO_GRIS,
    nombre: "Claro Gris Clinico",
    icono: "\u25FB\uFE0F",
    descripcion: "Base blanca y gris perla, sobria y muy legible para trabajo clinico prolongado."
  },
  {
    id: MODOS_INTERFAZ_COGNICION.CLARO_MENTA,
    nombre: "Claro Menta",
    icono: "\u{1F9EA}",
    descripcion: "Blanco, menta y cian suave para una apariencia limpia de laboratorio medico."
  },
  {
    id: MODOS_INTERFAZ_COGNICION.CLARO_LAVANDA,
    nombre: "Claro Lavanda",
    icono: "\u2726",
    descripcion: "Blanco con lavanda suave y azul, pensado para una lectura calmada y elegante."
  }
];

const CLAVE_LOCAL = "cognicion.apariencia.tema";
const CLAVE_LOCAL_MODO = "cognicion.apariencia.modoInterfaz";
const TEMA_PREDETERMINADO_COGNICION = TEMAS_COGNICION.LABORATORIO;
const MODO_PREDETERMINADO_COGNICION = MODOS_INTERFAZ_COGNICION.OSCURO;
const cacheAparienciaUsuario = new Map();

export function normalizarTemaCognicion(tema) {
  const valor = String(tema || "").toLowerCase().trim();
  return OPCIONES_TEMA_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : TEMA_PREDETERMINADO_COGNICION;
}


export function normalizarModoInterfazCognicion(modo) {
  const valor = String(modo || "").toLowerCase().trim();
  return OPCIONES_MODO_INTERFAZ_COGNICION.some((opcion) => opcion.id === valor)
    ? valor
    : MODO_PREDETERMINADO_COGNICION;
}

export function obtenerModoInterfazLocalCognicion() {
  try {
    const guardado = localStorage.getItem(CLAVE_LOCAL_MODO);
    return guardado ? normalizarModoInterfazCognicion(guardado) : MODO_PREDETERMINADO_COGNICION;
  } catch (error) {
    return MODO_PREDETERMINADO_COGNICION;
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
  const esClaro = modoSeguro !== MODOS_INTERFAZ_COGNICION.OSCURO;
  root.dataset.theme = modoSeguro;
  root.dataset.cognicionInterface = modoSeguro;
  root.style.colorScheme = esClaro ? "light" : "dark";
  document.body?.classList.toggle("tema-claro", esClaro);
  document.body?.classList.toggle("tema-oscuro", !esClaro);
  document.body?.classList.remove("tema-claro-azul", "tema-claro-gris", "tema-claro-menta", "tema-claro-lavanda");
  if (esClaro) {
    const claseModo = {
      [MODOS_INTERFAZ_COGNICION.CLARO]: "tema-claro-azul",
      [MODOS_INTERFAZ_COGNICION.CLARO_GRIS]: "tema-claro-gris",
      [MODOS_INTERFAZ_COGNICION.CLARO_MENTA]: "tema-claro-menta",
      [MODOS_INTERFAZ_COGNICION.CLARO_LAVANDA]: "tema-claro-lavanda"
    }[modoSeguro] || "tema-claro-azul";
    document.body?.classList.add(claseModo);
  }
  return modoSeguro;
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
  aplicarModoInterfazCognicion(obtenerModoInterfazLocalCognicion());
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
  if (!uid) return obtenerModoInterfazLocalCognicion();
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const datos = snap.exists() ? snap.data() : {};
    const modoRemoto = datos?.preferencias?.apariencia?.modoInterfaz || datos?.apariencia?.modoInterfaz || datos?.modoInterfaz;
    return modoRemoto ? normalizarModoInterfazCognicion(modoRemoto) : obtenerModoInterfazLocalCognicion();
  } catch (error) {
    console.warn("No se pudo leer el modo de interfaz del usuario.", error);
    return obtenerModoInterfazLocalCognicion();
  }
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
  const modoRemoto = datos?.preferencias?.apariencia?.modoInterfaz || datos?.apariencia?.modoInterfaz || datos?.modoInterfaz;
  const tema = temaRemoto ? normalizarTemaCognicion(temaRemoto) : obtenerTemaLocalCognicion();
  const modoInterfaz = modoRemoto ? normalizarModoInterfazCognicion(modoRemoto) : obtenerModoInterfazLocalCognicion();
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
