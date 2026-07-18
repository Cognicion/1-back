import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  FIRESTORE_DEVICE_PREF_KEY,
  iniciarCacheCognicionDiferido
} from "./cacheControlService.js";

const medirDashboardFirebase = window.location.pathname.endsWith("/dashboard.html") || window.location.pathname.endsWith("dashboard.html");

if (medirDashboardFirebase) {
  performance.mark?.("cognicion:firebase:init:start");
  console.time?.("COGNICION dashboard | Firebase init");
}

const firebaseConfig = {
  apiKey: "AIzaSyC9eSx4-5wvNebk2pXFT8dcuRbJqJe9Qp4",
  authDomain: "cognicion-57052.firebaseapp.com",
  projectId: "cognicion-57052",
  storageBucket: "cognicion-57052.firebasestorage.app",
  messagingSenderId: "1037684177162",
  appId: "1:1037684177162:web:537b09233b83f3e9b422f3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("No se pudo fijar persistencia local de Firebase Auth:", error?.code || error?.name || "error");
  return null;
});

function dispositivoPersonalConfirmado() {
  try {
    return globalThis.localStorage?.getItem(FIRESTORE_DEVICE_PREF_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function crearFirestoreCompartido() {
  const usarCachePersistente = dispositivoPersonalConfirmado();
  try {
    return initializeFirestore(app, {
      localCache: usarCachePersistente
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache()
    });
  } catch (error) {
    console.warn("No se pudo configurar cache local de Firestore; se usa configuracion predeterminada:", error?.code || error?.name || "error");
    return getFirestore(app);
  }
}

export const firestoreCacheMode = dispositivoPersonalConfirmado() ? "persistentLocalCache" : "memoryLocalCache";
export const db = crearFirestoreCompartido();

let functionsPromise = null;
let storagePromise = null;

export async function obtenerFunctions() {
  if (!functionsPromise) {
    functionsPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")
      .then(({ getFunctions }) => getFunctions(app, "us-central1"));
  }
  return functionsPromise;
}

export async function obtenerStorage() {
  if (!storagePromise) {
    storagePromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js")
      .then(({ getStorage }) => getStorage(app));
  }
  return storagePromise;
}

if (medirDashboardFirebase) {
  performance.mark?.("cognicion:firebase:init:end");
  performance.measure?.("COGNICION dashboard | Firebase init", "cognicion:firebase:init:start", "cognicion:firebase:init:end");
  console.timeEnd?.("COGNICION dashboard | Firebase init");
}

iniciarCacheCognicionDiferido();
