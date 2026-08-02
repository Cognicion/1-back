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
    link.href = "css/theme/biocellular.css";
    document.head.append(link);
  }
}

export async function activateBiocellularTheme() {
  if (document.documentElement.dataset.theme !== "biocelular") return;
  if (cleanup || activating) return activating;
  activating = Promise.resolve().then(() => {
    loadStylesheet();
    let host = document.getElementById(HOST_ID);
    if (!host) { host = document.createElement("div"); host.id = HOST_ID; host.setAttribute("aria-hidden", "true"); document.body?.prepend(host); }
    cleanup = createBiocellularBackground(host);
  }).finally(() => { activating = null; });
  return activating;
}

export function deactivateBiocellularTheme() {
  cleanup?.(); cleanup = null;
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
  loadStylesheet();
  let host = document.getElementById(HOST_ID);
  if (!host) { host = document.createElement("div"); host.id = HOST_ID; host.setAttribute("aria-hidden", "true"); document.body?.prepend(host); }
  cleanup = createBiocellularBackground(host, options);
}

globalThis.__cognicionBiocellularDeactivate = deactivateBiocellularTheme;
globalThis.__cognicionBiocellularRefresh = refreshBiocellularTheme;
