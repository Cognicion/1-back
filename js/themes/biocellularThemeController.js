import { createBiocellularBackground } from "./biocellularBackground.js";

const STYLE_ID = "cognicion-biocellular-theme-css";
const HOST_ID = "cognicion-biocellular-background";
let cleanup = null;
let activating = null;

function loadStylesheet() {
  let link = document.getElementById(STYLE_ID);
  if (!link) {
    link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "css/theme/biocellular.css?v=20260812-content-roots";
    document.head.append(link);
    console.debug("[BIOCELULAR] CSS cargado");
  }
}

function waitForBody() {
  if (document.body) return Promise.resolve();
  console.debug("[BIOCELULAR] Esperando DOMContentLoaded para encontrar el contenedor");
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

function diagnoseLayout(host) {
  const entries = [
    ["html", document.documentElement],
    ["body", document.body],
    ["main", document.querySelector("main")],
    ["hero", document.querySelector(".hero")],
    ["biocellular-background", host],
    ["canvas", host?.querySelector("canvas")]
  ];
  const colors = ["#ff00ff", "#00ffff", "#ffff00", "#00ff00", "#ff8800", "#ffffff"];
  const outlined = [];
  entries.forEach(([name, element], index) => {
    if (!element) return;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    console.debug("[BIOCELULAR LAYOUT] Elemento", name);
    console.debug("[BIOCELULAR LAYOUT] top", rect.top);
    console.debug("[BIOCELULAR LAYOUT] height", rect.height);
    console.debug("[BIOCELULAR LAYOUT] marginTop", style.marginTop);
    console.debug("[BIOCELULAR LAYOUT] paddingTop", style.paddingTop);
    console.debug("[BIOCELULAR LAYOUT] position", style.position);
    console.debug("[BIOCELULAR LAYOUT] display", style.display);
    console.debug("[BIOCELULAR LAYOUT] minHeight", style.minHeight);
    const previous = element.style.outline;
    element.style.outline = `2px solid ${colors[index]}`;
    outlined.push([element, previous]);
  });
  const login = document.querySelector("#login, .login-container, #loginForm, .login-form");
  document.body.classList.toggle("biocellular-login-page", Boolean(login));
  if (login) {
    const style = getComputedStyle(login);
    const rect = login.getBoundingClientRect();
    console.debug("[BIOCELULAR LOGIN] Elemento encontrado", login.id || login.className || login.tagName);
    console.debug("[BIOCELULAR LOGIN] display", style.display);
    console.debug("[BIOCELULAR LOGIN] visibility", style.visibility);
    console.debug("[BIOCELULAR LOGIN] opacity", style.opacity);
    console.debug("[BIOCELULAR LOGIN] position", style.position);
    console.debug("[BIOCELULAR LOGIN] zIndex", style.zIndex);
    console.debug("[BIOCELULAR LOGIN] boundingRect", { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    console.debug("[BIOCELULAR LOGIN] transform", style.transform);
    console.debug("[BIOCELULAR LOGIN] color", style.color);
    console.debug("[BIOCELULAR LOGIN] background", style.backgroundColor);
    console.debug("[BIOCELULAR LOGIN] pointerEvents", style.pointerEvents);
    if (host.dataset.diagnostic === "true") login.style.outline = "4px solid #39ff88";
  } else {
    console.warn("[BIOCELULAR LOGIN] Elemento no encontrado");
  }
  window.setTimeout(() => outlined.forEach(([element, outline]) => { element.style.outline = outline; }), 1500);
}

export async function activateBiocellularTheme() {
  if (document.documentElement.dataset.theme !== "biocelular") return;
  if (cleanup || activating) return activating;
  console.debug("[BIOCELULAR] Tema detectado");
  activating = waitForBody().then(() => {
    if (document.documentElement.dataset.theme !== "biocelular" || !document.body) return;
    loadStylesheet();
    let host = document.getElementById(HOST_ID);
    if (!host) { host = document.createElement("div"); host.id = HOST_ID; host.setAttribute("aria-hidden", "true"); document.body.prepend(host); }
    if (new URLSearchParams(location.search).has("biocellularDebug")) {
      host.dataset.diagnostic = "true";
      console.debug("[BIOCELULAR] Prueba visual diagnóstica activada");
    }
    console.debug("[BIOCELULAR] Contenedor encontrado", { id: HOST_ID, connected: host.isConnected });
    try {
      cleanup = createBiocellularBackground(host);
      diagnoseLayout(host);
      console.debug("[BIOCELULAR] Escena inicializada");
    } catch (error) {
      console.error("[BIOCELULAR] Error de inicialización; fallback activado", error);
    }
  }).finally(() => { activating = null; });
  return activating;
}

export function deactivateBiocellularTheme() {
  cleanup?.(); cleanup = null;
  document.body?.classList.remove("biocellular-login-page");
  console.debug("[BIOCELULAR] Recursos destruidos");
  document.getElementById(HOST_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

export function refreshBiocellularTheme(options = {}) {
  if (document.documentElement.dataset.theme !== "biocelular") return;
  deactivateBiocellularTheme();
  activateBiocellularThemeWithOptions(options);
}

async function activateBiocellularThemeWithOptions(options) {
  if (document.documentElement.dataset.theme !== "biocelular") return;
  await waitForBody();
  if (document.documentElement.dataset.theme !== "biocelular" || !document.body) return;
  loadStylesheet();
  let host = document.getElementById(HOST_ID);
  if (!host) { host = document.createElement("div"); host.id = HOST_ID; host.setAttribute("aria-hidden", "true"); document.body.prepend(host); }
  if (new URLSearchParams(location.search).has("biocellularDebug")) host.dataset.diagnostic = "true";
  console.debug("[BIOCELULAR] Contenedor encontrado", { id: HOST_ID, connected: host.isConnected });
  try {
    cleanup = createBiocellularBackground(host, options);
    diagnoseLayout(host);
    console.debug("[BIOCELULAR] Escena inicializada");
  } catch (error) {
    console.error("[BIOCELULAR] Error de inicialización; fallback activado", error);
  }
}

globalThis.__cognicionBiocellularDeactivate = deactivateBiocellularTheme;
globalThis.__cognicionBiocellularRefresh = refreshBiocellularTheme;
