import { getFeatureTips } from "./featureTips.js";
import { getPageHeader, isPublicPage, pageIdFromLocation } from "./pageHeaderRegistry.js";
import { auth } from "../firebase.js";
import { renderizarFotoPerfil } from "../services/profilePhotoService.js";

const DEBUG_PREFIX = "[GLOBAL HEADER]";
const RECENT_KEY = "cognicion.globalHeader.featureRecent";
let stylesPromise;

function log(message, data) { console.debug(`${DEBUG_PREFIX} ${message}`, data ?? ""); }

function loadStyles() {
  if (stylesPromise) return stylesPromise;
  stylesPromise = new Promise((resolve) => {
    if (document.querySelector('link[data-global-app-header-styles]')) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/global-app-header.css?v=2.114-navbar-unificada-v1";
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
  if (pageId === "apuntes") return document.querySelector("header.topbar-apuntes") || null;
  if (pageId === "mi-nube") return document.querySelector("header.topbar-mi-nube") || null;
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
  return document.querySelector(
    "body > header:not([data-navbar-global-unificada]), body > .topbar, body > .barra-superior"
  ) || null;
}

function svgNavegacion(tipo) {
  const rutas = {
    explorar: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"></path>',
    panel: '<path d="M4 4h16v16H4z"></path><path d="M4 9h16M9 9v11"></path>',
    inicio: '<path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10M9 20v-6h6v6"></path>',
    campana: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    mensajes: '<path d="M4 5h16v11H8l-4 3V5Z"></path><path d="M8 9h8M8 12h5"></path>',
    configuracion: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path>',
    salir: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"></path>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${rutas[tipo] || ""}</svg>`;
}

function plantillaExplorarFunciones() {
  return `
    <details class="navbar-global-explorar">
      <summary>${svgNavegacion("explorar")}<span>Explorar funciones</span></summary>
      <div class="navbar-global-explorar-panel">
        <a href="medico.html"><strong>Panel médico</strong><small>Pacientes, notas y seguimiento clínico</small></a>
        <a href="escalas.html"><strong>Escalas clínicas</strong><small>Evaluaciones e instrumentos clínicos</small></a>
        <a href="calculadoras-medicas.html"><strong>Calculadoras</strong><small>Índices y cálculos médicos</small></a>
        <a href="biblioteca.html"><strong>Biblioteca médica</strong><small>Recursos de consulta clínica</small></a>
        <a href="mi-nube.html"><strong>Mi nube</strong><small>Archivos y apuntes privados</small></a>
        <a href="rehabilitacion-cognitiva.html"><strong>Rehabilitación cognitiva</strong><small>Ejercicios y seguimiento</small></a>
        <a href="laboratorio-farmacologia.html"><strong>Laboratorios</strong><small>Farmacología, neurofisiología y modelado</small></a>
        <a href="estadistica.html"><strong>Estadística médica</strong><small>Variables, tablas y gráficas</small></a>
      </div>
    </details>`;
}

function obtenerHostAccesosUnico() {
  const existentes = [...document.querySelectorAll("[data-accesos-rapidos]")];
  const principal = existentes.find((host) => host.dataset.accesosInicializados === "true") || existentes[0] || document.createElement("div");
  principal.dataset.accesosRapidos = "";
  principal.dataset.globalHeaderAccess = "true";
  existentes.filter((host) => host !== principal).forEach((host) => host.remove());
  return principal;
}

function limpiarAccionesGlobalesContextuales(encabezado, navbar) {
  if (!encabezado || encabezado === navbar) return;
  encabezado.classList.add("encabezado-contextual-global");
  const selectores = [
    "[data-accesos-rapidos]",
    "[data-cognicion-theme-selector]",
    "#notificationsButton",
    "#mensajesButton",
    "[data-global-header-notifications]",
    "[data-global-notifications-link]"
  ];
  encabezado.querySelectorAll(selectores.join(",")).forEach((elemento) => elemento.remove());
  encabezado.querySelectorAll("a, button").forEach((elemento) => {
    const href = elemento.getAttribute("href") || "";
    const onclick = elemento.getAttribute("onclick") || "";
    const texto = elemento.textContent.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
    const destinoGlobal = /(?:^|\/)dashboard\.html(?:#|$)/i.test(href)
      || /(?:^|\/)configuracion\.html(?:#|$)/i.test(href)
      || /dashboard\.html|configuracion\.html/i.test(onclick);
    const etiquetaGlobal = /^(inicio|dashboard|configuraci[oó]n|mensajes|notificaciones)$/.test(texto);
    if (destinoGlobal && etiquetaGlobal) elemento.remove();
  });
  log("Barra contextual preservada", { clases: encabezado.className });
}

async function cerrarSesionGlobal() {
  if (typeof window.cerrarSesion === "function") {
    await window.cerrarSesion();
    return;
  }
  const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  await signOut(auth);
  window.location.href = "login.html";
}

function conectarMenuPerfil(navbar) {
  const menu = navbar.querySelector("[data-menu-perfil-global]");
  const explorar = navbar.querySelector(".navbar-global-explorar");
  const cerrarPerfil = () => { if (menu) menu.open = false; };
  const cerrarExplorar = () => { if (explorar) explorar.open = false; };
  const cerrarMenus = () => {
    cerrarPerfil();
    cerrarExplorar();
  };
  const notificaciones = navbar.querySelector("[data-menu-notificaciones]");
  const mensajes = navbar.querySelector("[data-menu-mensajes]");
  const salir = navbar.querySelector("[data-menu-cerrar-sesion]");
  const onDocumentClick = (event) => {
    if (menu?.open && !menu.contains(event.target)) cerrarPerfil();
    if (explorar?.open && !explorar.contains(event.target)) cerrarExplorar();
  };
  const onKeydown = (event) => { if (event.key === "Escape") cerrarMenus(); };
  const onPerfilToggle = () => { if (menu?.open) cerrarExplorar(); };
  const onExplorarToggle = () => { if (explorar?.open) cerrarPerfil(); };
  notificaciones?.addEventListener("click", () => {
    cerrarPerfil();
    if (typeof window.alternarNotificaciones === "function") window.alternarNotificaciones();
    else window.location.href = "dashboard.html#avisosDashboardModulo";
  });
  mensajes?.addEventListener("click", () => {
    cerrarPerfil();
    if (typeof window.alternarMensajes === "function") void window.alternarMensajes(true);
    else window.location.href = "dashboard.html#mensajesPanel";
  });
  salir?.addEventListener("click", () => void cerrarSesionGlobal().catch((error) => console.error(`${DEBUG_PREFIX} Error al cerrar sesión`, error)));
  navbar.querySelectorAll(".menu-perfil-global a").forEach((enlace) => enlace.addEventListener("click", cerrarPerfil));
  menu?.addEventListener("toggle", onPerfilToggle);
  explorar?.addEventListener("toggle", onExplorarToggle);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
  return () => {
    menu?.removeEventListener("toggle", onPerfilToggle);
    explorar?.removeEventListener("toggle", onExplorarToggle);
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeydown);
  };
}

async function crearNavbarUnificada(pageId, encabezadoContextual) {
  const reutilizaDashboard = pageId === "dashboard" && encabezadoContextual;
  const navbar = reutilizaDashboard ? encabezadoContextual : document.createElement("header");
  const hostAccesos = obtenerHostAccesosUnico();
  navbar.replaceChildren();
  navbar.dataset.navbarGlobalUnificada = "true";
  navbar.dataset.globalAppHeader = "true";
  navbar.className = "navbar-global-unificada global-app-header";
  navbar.setAttribute("role", "banner");
  navbar.setAttribute("aria-label", "Navegación global de COGNICIÓN");
  navbar.innerHTML = `
    <div class="navbar-global-contenido">
      <a class="navbar-global-marca" href="dashboard.html" aria-label="Ir al Dashboard de COGNICIÓN">
        <img src="assets/favicon-cognicion-128.png" alt="" width="44" height="44" decoding="async">
        <span><strong>COGNICIÓN</strong><small>Plataforma clínica integral.</small></span>
      </a>
      <nav class="navbar-global-principal" aria-label="Funciones globales">
        ${plantillaExplorarFunciones()}
        <a class="navbar-global-panel-medico" href="medico.html">${svgNavegacion("panel")}<span>Panel médico</span></a>
      </nav>
      <div class="navbar-global-acciones">
        <div data-host-accesos-global></div>
        <details class="menu-perfil-global" data-menu-perfil-global>
          <summary aria-label="Abrir menú del usuario">
            <span class="avatar-navbar-global" data-avatar-navbar-global role="img" aria-label="Avatar del usuario">DR</span>
            <span class="menu-perfil-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="menu-perfil-global-panel">
            <a href="dashboard.html">${svgNavegacion("inicio")}<span>Inicio</span></a>
            <button id="notificationsButton" type="button" data-menu-notificaciones>${svgNavegacion("campana")}<span>Notificaciones</span></button>
            <button id="mensajesButton" type="button" data-menu-mensajes>${svgNavegacion("mensajes")}<span>Mensajes</span></button>
            <a href="configuracion.html">${svgNavegacion("configuracion")}<span>Configuración</span></a>
            <section class="menu-perfil-tema" aria-label="Tema de la interfaz">
              <span>Tema</span>
              <div data-cognicion-theme-selector></div>
            </section>
            <button type="button" data-menu-cerrar-sesion>${svgNavegacion("salir")}<span>Cerrar sesión</span></button>
          </div>
        </details>
      </div>
    </div>`;
  navbar.querySelector("[data-host-accesos-global]")?.replaceWith(hostAccesos);
  if (!reutilizaDashboard) document.body.prepend(navbar);
  limpiarAccionesGlobalesContextuales(encabezadoContextual, navbar);
  const usuario = auth.currentUser;
  const avatar = navbar.querySelector("[data-avatar-navbar-global]");
  renderizarFotoPerfil(avatar, {
    url: usuario?.photoURL || "",
    nombre: usuario?.displayName || usuario?.email || "DR",
    alt: usuario?.photoURL ? "Foto de perfil del usuario" : "Avatar predeterminado del usuario"
  });
  const [{ inicializarAccesosRapidos }, { inicializarSelectorTema }] = await Promise.all([
    import("./accesosRapidos.js"),
    import("./themeSelector.js")
  ]);
  inicializarAccesosRapidos(navbar);
  inicializarSelectorTema(navbar);
  return { navbar, destruirMenu: conectarMenuPerfil(navbar) };
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
  const externalHost = document.querySelector("[data-global-header-discovery-host]");
  let discovery = externalHost?.querySelector(".global-header-discovery") || header.querySelector(".global-header-discovery");
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
  if (externalHost) externalHost.append(discovery);
  else {
    const actions = header.querySelector(".topbar-actions, .global-header-actions");
    if (actions) actions.before(discovery);
    else header.append(discovery);
  }
  return discovery;
}

function ensureMedicoActions(header) {
  if (header.querySelector(".global-header-actions")) return;
  const actions = document.createElement("div");
  actions.className = "global-header-actions";
  actions.innerHTML = `<div data-accesos-rapidos data-global-header-access></div>`;
  header.append(actions);
}

function asegurarAccionNotificaciones(header) {
  if (header.querySelector('[aria-label*="notific" i], [data-global-header-notifications]')) return;
  const campanaTemporal = document.querySelector('[data-global-notifications-link]');
  if (campanaTemporal) {
    const barraTemporal = campanaTemporal.closest("[data-accesos-rapidos-global]");
    campanaTemporal.remove();
    if (barraTemporal && !barraTemporal.children.length) barraTemporal.remove();
    log("Campana temporal sustituida por la acción del encabezado");
  }
  const actions = header.querySelector(".global-header-actions");
  if (!actions) return;
  const enlace = document.createElement("a");
  enlace.className = "accion-global-medico accion-global-icono global-header-notifications";
  enlace.href = "dashboard.html#avisosDashboardModulo";
  enlace.dataset.globalHeaderNotifications = "true";
  enlace.setAttribute("aria-label", "Abrir notificaciones");
  enlace.innerHTML = `<span class="icono-lineal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg></span>`;
  actions.prepend(enlace);
}

function ensureGlobalActions(header, pageId) {
  if (pageId === "dashboard" || header.querySelector("[data-accesos-rapidos]")) return;
  const actions = document.createElement("div");
  actions.className = "global-header-actions";
  const existingAccess = document.querySelector("[data-accesos-rapidos]");
  const legacyHost = existingAccess?.closest("[data-accesos-rapidos-global]");
  if (existingAccess) {
    existingAccess.dataset.globalHeaderAccess = "true";
    actions.append(existingAccess);
    if (legacyHost && !legacyHost.children.length) legacyHost.remove();
    log("Accesos rápidos adoptados por el encabezado", { pageId });
  } else {
    actions.innerHTML = `<div data-accesos-rapidos data-global-header-access></div>`;
  }
  header.append(actions);
}

function updateIdentity(header, page, marcarComoGlobal = true) {
  if (marcarComoGlobal) {
    header.dataset.globalAppHeader = "true";
    header.classList.add("global-app-header");
    header.setAttribute("role", "banner");
    header.setAttribute("aria-label", `Encabezado de ${page.title}`);
    header.style.setProperty("--global-header-height", `${Math.ceil(header.getBoundingClientRect().height || 96)}px`);
  }
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
  const identityHost = state.identityHeader || state.header;
  const titleNode = identityHost.querySelector("[data-global-header-title]") || identityHost.querySelector(".brand-name");
  const descriptionNode = identityHost.querySelector("[data-global-header-description]") || identityHost.querySelector(".brand-subtitle");
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
  if (!selectors.length) return () => {};
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
  if (isPublicPage(pageId)) {
    log("Página pública, navbar autenticada omitida", { pageId });
    return null;
  }
  await auth.authStateReady?.();
  if (!auth.currentUser) {
    log("Sesión no autenticada, navbar omitida", { pageId });
    return null;
  }
  log("Inicializando", { pageId });
  await loadStyles();
  const contextualHeader = findHeader(pageId);
  const page = getPageHeader(pageId);
  const { navbar: header, destruirMenu } = await crearNavbarUnificada(pageId, contextualHeader);
  let identityHeader = contextualHeader && contextualHeader !== header ? contextualHeader : header;
  let contextoMinimo = null;
  if (identityHeader === header && pageId !== "dashboard" && !document.querySelector("[data-global-header-discovery-host]")) {
    contextoMinimo = document.createElement("section");
    contextoMinimo.className = "encabezado-contextual-minimo";
    contextoMinimo.dataset.globalHeaderHost = "true";
    header.after(contextoMinimo);
    identityHeader = contextoMinimo;
  }
  if ((contextoMinimo || ["paciente", "nota", "historia"].includes(pageId)) && identityHeader !== header) ensureBranding(identityHeader, pageId);
  if (identityHeader !== header) updateIdentity(identityHeader, page, false);
  const discovery = ensureDiscovery(identityHeader);
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
    destruirMenu();
    resizeObserver?.disconnect();
    header.removeAttribute("data-global-app-header");
    header.classList.remove("global-app-header");
    contextoMinimo?.remove();
    if (header !== contextualHeader) header.remove();
    delete globalThis.__cognicionGlobalHeader;
    log("Encabezado destruido", { pageId });
  };
  globalThis.__cognicionGlobalHeader = { header, identityHeader, pageId, destroy, baseTitle: page.title };
  destroyContext = createContextController(pageId);
  log("Página detectada", { pageId });
  log("Título aplicado", { title: page.title });
  log("Accesos rápidos conectados");
  log("Barra contextual preservada", { pageId });
  return globalThis.__cognicionGlobalHeader;
}

export function scheduleGlobalAppHeader() {
  const mount = () => void mountGlobalAppHeader().catch((error) => console.error(`${DEBUG_PREFIX} Error`, error));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
