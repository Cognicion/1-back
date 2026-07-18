export const APP_VERSION = "20260718-cache-v1";
export const FIRESTORE_DEVICE_PREF_KEY = "cognicion.dispositivoPersonal";

const STATIC_CACHE = `cognicion-static-${APP_VERSION}`;
const UPDATE_BANNER_ID = "cognicionUpdateBanner";
let registroPromise = null;

function puedeUsarServiceWorker() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined";
}

function ejecutarCuandoEsteLibre(callback) {
  if (typeof window === "undefined") return;
  const run = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 2500 });
    } else {
      window.setTimeout(callback, 800);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

function insertarManifestSiFalta() {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "./manifest.json?v=20260718-cache-v1";
  document.head?.appendChild(link);
}

function trabajoClinicoActivo() {
  const activo = document.activeElement;
  const editando = Boolean(activo?.matches?.("textarea, input, [contenteditable='true']"));
  const ruta = window.location.pathname.toLowerCase();
  const paginaClinica = /nota|paciente|nota-por-voz/.test(ruta);
  return editando && paginaClinica;
}

function mostrarAvisoActualizacion(registro) {
  if (typeof document === "undefined" || document.getElementById(UPDATE_BANNER_ID)) return;
  const banner = document.createElement("div");
  banner.id = UPDATE_BANNER_ID;
  banner.setAttribute("role", "status");
  banner.style.cssText = [
    "position:fixed",
    "left:16px",
    "right:16px",
    "bottom:16px",
    "z-index:2147483000",
    "display:flex",
    "gap:12px",
    "align-items:center",
    "justify-content:space-between",
    "max-width:560px",
    "margin:auto",
    "padding:12px 14px",
    "border-radius:12px",
    "box-shadow:0 16px 40px rgba(15,23,42,.22)",
    "background:#102033",
    "color:#fff",
    "font:14px/1.35 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  ].join(";");
  banner.innerHTML = `
    <span>Hay una actualizaci&oacute;n disponible.</span>
    <button type="button" style="border:0;border-radius:8px;padding:8px 12px;background:#e7f0ff;color:#102033;font-weight:700;cursor:pointer">Actualizar</button>
  `;
  banner.querySelector("button")?.addEventListener("click", () => {
    if (trabajoClinicoActivo() && !confirm("Hay texto clínico en edición. Antes de actualizar verifica que tu borrador esté guardado. ¿Actualizar ahora?")) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("cognicion.swReloaded") === APP_VERSION) return;
      sessionStorage.setItem("cognicion.swReloaded", APP_VERSION);
      window.location.reload();
    }, { once: true });
    registro.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  document.body?.appendChild(banner);
}

export function iniciarCacheCognicionDiferido() {
  if (!puedeUsarServiceWorker()) return Promise.resolve(null);
  if (registroPromise) return registroPromise;
  insertarManifestSiFalta();
  registroPromise = new Promise((resolve) => {
    ejecutarCuandoEsteLibre(async () => {
      try {
        const registro = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        if (registro.waiting) mostrarAvisoActualizacion(registro);
        registro.addEventListener("updatefound", () => {
          const worker = registro.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) mostrarAvisoActualizacion(registro);
          });
        });
        resolve(registro);
      } catch (error) {
        console.warn("No se pudo registrar el Service Worker de COGNICIÓN:", error?.name || "error");
        resolve(null);
      }
    });
  });
  return registroPromise;
}

export function esDispositivoPersonal() {
  try {
    return localStorage.getItem(FIRESTORE_DEVICE_PREF_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function establecerDispositivoPersonal(valor) {
  try {
    if (valor) localStorage.setItem(FIRESTORE_DEVICE_PREF_KEY, "1");
    else localStorage.removeItem(FIRESTORE_DEVICE_PREF_KEY);
  } catch (_) {
    // La preferencia es opcional.
  }
}

export async function limpiarCachesEstaticosCognicion() {
  if (!("caches" in globalThis)) return [];
  const keys = await caches.keys();
  const objetivos = keys.filter((key) => key.startsWith("cognicion-"));
  await Promise.all(objetivos.map((key) => caches.delete(key)));
  return objetivos;
}

export async function limpiarDatosClinicosLocalesCognicion({ confirmar = true } = {}) {
  if (confirmar && typeof confirm === "function") {
    const continuar = confirm("Esto eliminará borradores locales clínicos de COGNICIÓN guardados en este navegador. No borra datos de Firebase. ¿Continuar?");
    if (!continuar) return { indexedDB: false, legacyLocalStorageKeys: [] };
  }
  const legacyLocalStorageKeys = [
    "cognicion_indicaciones_generadas_ultimo"
  ];
  for (const key of legacyLocalStorageKeys) {
    try { localStorage.removeItem(key); } catch (_) { /* Preferencias bloqueadas por navegador. */ }
  }
  const { limpiarAlmacenClinicoLocalCognicion } = await import("./clinicalLocalStore.js");
  const indexedDB = await limpiarAlmacenClinicoLocalCognicion();
  return { indexedDB, legacyLocalStorageKeys };
}

export async function diagnosticoCacheCognicion() {
  const cachesDisponibles = "caches" in globalThis ? await caches.keys() : [];
  const registro = puedeUsarServiceWorker() ? await navigator.serviceWorker.getRegistration("./") : null;
  return {
    appVersion: APP_VERSION,
    staticCache: STATIC_CACHE,
    serviceWorker: Boolean(registro),
    serviceWorkerState: registro?.active?.state || registro?.waiting?.state || registro?.installing?.state || "no_registrado",
    caches: cachesDisponibles.filter((key) => key.startsWith("cognicion-")),
    firestorePersistentCacheEnabled: esDispositivoPersonal()
  };
}

export function exponerHerramientasCacheCognicion() {
  if (typeof window === "undefined") return;
  window.cognicionCache = {
    version: APP_VERSION,
    diagnostico: diagnosticoCacheCognicion,
    limpiarEstaticos: limpiarCachesEstaticosCognicion,
    limpiarDatosClinicosLocales: limpiarDatosClinicosLocalesCognicion,
    esDispositivoPersonal,
    establecerDispositivoPersonal
  };
}

exponerHerramientasCacheCognicion();
