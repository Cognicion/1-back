import { getFeatureTips } from "./featureTips.js";
import { getPageHeader, isPublicPage, pageIdFromLocation } from "./pageHeaderRegistry.js";

const DEBUG_PREFIX = "[GLOBAL HEADER]";
const RECENT_KEY = "cognicion.globalHeader.featureRecent";
const MIGRATED_PAGES = new Set(["dashboard", "medico", "paciente", "nota", "historia"]);
let stylesPromise;

function log(message, data) { console.debug(`${DEBUG_PREFIX} ${message}`, data ?? ""); }

function loadStyles() {
  if (stylesPromise) return stylesPromise;
  stylesPromise = new Promise((resolve) => {
    if (document.querySelector('link[data-global-app-header-styles]')) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/global-app-header.css";
    link.dataset.globalAppHeaderStyles = "true";
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    document.head.appendChild(link);
  });
  return stylesPromise;
}

function readRecent() {
  try { const value = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function saveRecent(ids) { try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(-4))); } catch { /* opcional */ } }

function findHeader(pageId) {
  if (pageId === "dashboard") return document.querySelector("body > header, header") || null;
  if (pageId === "medico") return document.querySelector("header.header-medico") || null;
  if (pageId === "paciente") return document.querySelector(".topbar") || null;
  if (pageId === "nota") return document.querySelector(".barra-superior") || null;
  if (pageId === "historia") {
    let header = document.querySelector("[data-global-header-host]");
    if (!header) {
      header = document.createElement("header");
      header.dataset.globalHeaderHost = "true";
      document.body.prepend(header);
      log("Encabezado global creado para página sin barra compatible", { pageId });
    }
    return header;
  }
  return null;
}

function ensureBranding(header, pageId) {
  if (header.querySelector("[data-global-header-branding]")) return;
  const existingLogo = header.querySelector("img.logo-mini, img.logo-header, img[alt*='Cogn']");
  const branding = document.createElement("div");
  branding.className = "global-header-branding";
  branding.dataset.globalHeaderBranding = "true";
  if (!existingLogo) {
    const logo = document.createElement("img");
    logo.src = "assets/favicon-cognicion.png";
    logo.alt = "Cognición";
    logo.width = 44;
    logo.height = 44;
    logo.decoding = "async";
    branding.append(logo);
  }
  const identity = document.createElement("div");
  identity.className = "global-header-identity";
  identity.innerHTML = `<strong data-global-header-title></strong><span data-global-header-description></span>`;
  branding.append(identity);
  const insertionPoint = existingLogo?.nextSibling || header.firstChild;
  header.insertBefore(branding, insertionPoint || null);
  log("Encabezado existente adoptado", { pageId });
}

function ensureDiscovery(header) {
  let discovery = header.querySelector(".global-header-discovery");
  if (discovery) return discovery;
  discovery = document.createElement("section");
  discovery.className = "global-header-discovery";
  discovery.setAttribute("aria-label", "Descubrimiento de funciones");
  discovery.innerHTML = `
    <span class="global-header-discovery__icon" aria-hidden="true">✦</span>
    <span class="global-header-discovery__text" aria-live="polite"></span>
    <span class="global-header-discovery__actions">
      <a data-global-tip-open hidden>Ver</a>
      <button type="button" data-global-tip-next aria-label="Mostrar otra sugerencia">›</button>
    </span>`;
  const actions = header.querySelector(".topbar-actions, .global-header-actions");
  if (actions) actions.before(discovery);
  else header.append(discovery);
  return discovery;
}

function ensureMedicoActions(header) {
  if (header.querySelector(".global-header-actions")) return;
  const actions = document.createElement("div");
  actions.className = "global-header-actions";
  actions.innerHTML = `<div data-accesos-rapidos data-global-header-access></div>`;
  header.append(actions);
}

function ensureGlobalActions(header, pageId) {
  if (pageId === "dashboard" || header.querySelector("[data-accesos-rapidos]")) return;
  const actions = document.createElement("div");
  actions.className = "global-header-actions";
  actions.innerHTML = `<div data-accesos-rapidos data-global-header-access></div>`;
  header.append(actions);
}

function updateIdentity(header, page) {
  header.dataset.globalAppHeader = "true";
  header.classList.add("global-app-header");
  header.setAttribute("role", "banner");
  header.setAttribute("aria-label", `Encabezado de ${page.title}`);
  header.style.setProperty("--global-header-height", `${Math.ceil(header.getBoundingClientRect().height || 96)}px`);
  const title = header.querySelector("[data-global-header-title]") || header.querySelector(".brand-name");
  const description = header.querySelector("[data-global-header-description]") || header.querySelector(".brand-subtitle");
  if (title) { title.textContent = page.title; title.dataset.globalHeaderDynamic = "true"; }
  if (description) { description.textContent = page.description; description.dataset.globalHeaderDynamic = "true"; }
}

function isPrivacyEnabled() {
  return document.documentElement.dataset.privacy === "true" ||
    document.body?.dataset.privacy === "true" ||
    document.body?.classList.contains("modo-privacidad");
}

function cleanContext(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || /^(cargando|selecciona un paciente|paciente seleccionado|historia clínica|no se pudieron|no se pudo|acceso no autorizado|paciente no)/i.test(text)) return "";
  if (isPrivacyEnabled()) {
    log("Privacidad aplicada");
    return "Paciente seleccionado";
  }
  return text;
}

export function updateGlobalHeader({ title, description, context } = {}) {
  const state = globalThis.__cognicionGlobalHeader;
  if (!state?.header) return false;
  const titleNode = state.header.querySelector("[data-global-header-title]") || state.header.querySelector(".brand-name");
  const descriptionNode = state.header.querySelector("[data-global-header-description]") || state.header.querySelector(".brand-subtitle");
  const nextTitle = title || state.baseTitle;
  const safeContext = cleanContext(context);
  if (titleNode) titleNode.textContent = safeContext ? `${nextTitle} · ${safeContext}` : nextTitle;
  if (descriptionNode && description) descriptionNode.textContent = description;
  state.context = safeContext;
  log("Título dinámico actualizado", { title: nextTitle, hasContext: Boolean(safeContext) });
  return true;
}

if (typeof window !== "undefined") window.updateGlobalHeader = updateGlobalHeader;

function createContextController(pageId) {
  const selectors = {
    paciente: ["#nombrePaciente"],
    nota: ["#nombrePacienteNota"],
    historia: ["#nombrePaciente", "#datosPaciente"]
  }[pageId] || [];
  let lastContext = "";
  const refresh = () => {
    const context = selectors.map((selector) => document.querySelector(selector)?.textContent || "")
      .map(cleanContext).find(Boolean) || "";
    if (context === lastContext) return;
    lastContext = context;
    updateGlobalHeader({ context });
    if (context) log("Contexto de paciente recibido", { pageId });
  };
  const observer = new MutationObserver(refresh);
  if (!document.body) return () => {};
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  refresh();
  return () => observer.disconnect();
}

function createDiscoveryController(discovery, page, pageId) {
  const text = discovery.querySelector(".global-header-discovery__text");
  const next = discovery.querySelector("[data-global-tip-next]");
  const open = discovery.querySelector("[data-global-tip-open]");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let role = document.documentElement.dataset.role || "";
  let tips = getFeatureTips({ pageId, pageCategories: page.featureCategories, role });
  let index = 0;
  let timer = 0;
  let paused = false;
  let modalOpen = false;
  let recent = readRecent();
  const interval = 30000;

  const selectTip = (manual = false) => {
    if (!tips.length) return;
    const available = tips.filter((tip) => !recent.includes(tip.id));
    const pool = available.length ? available : tips;
    const tip = pool[index % pool.length];
    index += 1;
    recent = [...recent.filter((id) => id !== tip.id), tip.id];
    saveRecent(recent);
    if (manual || reduce?.matches) {
      discovery.classList.remove("is-changing");
      text.textContent = tip.text;
    } else {
      discovery.classList.add("is-changing");
      window.setTimeout(() => { text.textContent = tip.text; discovery.classList.remove("is-changing"); }, 180);
    }
    if (tip.route) { open.hidden = false; open.href = tip.route; open.textContent = "Ver"; open.setAttribute("aria-label", `Abrir ${tip.text}`); }
    log("Sugerencia mostrada", { id: tip.id, pageId });
  };
  const schedule = () => {
    window.clearTimeout(timer);
    if (paused || document.hidden || modalOpen || reduce?.matches || tips.length < 2) return;
    timer = window.setTimeout(() => { selectTip(); schedule(); }, interval);
    log("Temporizador iniciado", { interval });
  };
  const pause = () => { paused = true; window.clearTimeout(timer); log("Temporizador pausado"); };
  const resume = () => { paused = false; schedule(); };
  const onVisibility = () => document.hidden ? pause() : resume();
  const onEnter = pause;
  const onLeave = resume;
  const onNext = () => { selectTip(true); schedule(); };
  const modalObserver = new MutationObserver(() => {
    modalOpen = Boolean(document.querySelector("[role=dialog]:not([hidden]), dialog[open], .modal.show, .modal.abierto"));
    modalOpen ? pause() : resume();
  });
  discovery.addEventListener("mouseenter", onEnter);
  discovery.addEventListener("mouseleave", onLeave);
  next.addEventListener("click", onNext);
  document.addEventListener("visibilitychange", onVisibility);
  modalObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
  selectTip(true);
  schedule();
  log("Sugerencias disponibles", { count: tips.length });
  return () => {
    window.clearTimeout(timer);
    discovery.removeEventListener("mouseenter", onEnter);
    discovery.removeEventListener("mouseleave", onLeave);
    next.removeEventListener("click", onNext);
    document.removeEventListener("visibilitychange", onVisibility);
    modalObserver.disconnect();
  };
}

export async function mountGlobalAppHeader() {
  if (globalThis.__cognicionGlobalHeader?.destroy) return globalThis.__cognicionGlobalHeader;
  const pageId = pageIdFromLocation();
  if (isPublicPage(pageId) || !MIGRATED_PAGES.has(pageId)) {
    log("Página fuera de la fase actual", { pageId });
    return null;
  }
  log("Inicializando", { pageId });
  await loadStyles();
  const header = findHeader(pageId);
  if (!header) { console.warn(`${DEBUG_PREFIX} Error: encabezado existente no encontrado`, { pageId }); return null; }
  const page = getPageHeader(pageId);
  if (["paciente", "nota", "historia"].includes(pageId)) ensureBranding(header, pageId);
  ensureGlobalActions(header, pageId);
  updateIdentity(header, page);
  if (pageId === "medico") ensureMedicoActions(header);
  const discovery = ensureDiscovery(header);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const height = Math.ceil(header.getBoundingClientRect().height || 96);
    document.documentElement.style.setProperty("--global-header-height", `${height}px`);
  }) : null;
  resizeObserver?.observe(header);
  document.documentElement.style.setProperty("--global-header-height", `${Math.ceil(header.getBoundingClientRect().height || 96)}px`);
  const destroyDiscovery = createDiscoveryController(discovery, page, pageId);
  let destroyContext = () => {};
  const destroy = () => {
    destroyDiscovery();
    destroyContext();
    resizeObserver?.disconnect();
    header.removeAttribute("data-global-app-header");
    header.classList.remove("global-app-header");
    delete globalThis.__cognicionGlobalHeader;
    log("Encabezado destruido", { pageId });
  };
  globalThis.__cognicionGlobalHeader = { header, pageId, destroy, baseTitle: page.title };
  destroyContext = createContextController(pageId);
  log("Página detectada", { pageId });
  log("Título aplicado", { title: page.title });
  if (header.querySelector("[data-accesos-rapidos]")) {
    import("./accesosRapidos.js").then(({ inicializarAccesosRapidos }) => inicializarAccesosRapidos(header)).catch((error) => console.warn(`${DEBUG_PREFIX} Error en Accesos rápidos`, error));
    log("Accesos rápidos conectados");
  }
  log("Barra contextual preservada", { pageId });
  return globalThis.__cognicionGlobalHeader;
}

export function scheduleGlobalAppHeader() {
  const mount = () => void mountGlobalAppHeader().catch((error) => console.error(`${DEBUG_PREFIX} Error`, error));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
