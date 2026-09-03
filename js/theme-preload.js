/* Bootstrap síncrono: debe permanecer como script clásico y ejecutarse antes de cualquier CSS visible. */
(function () {
  const GLOBAL_THEME_KEY = "cognicion:theme:last";
  const VISUAL_THEME_KEY = "cognicion.apariencia.tema";
  const LIGHT_PALETTE_KEY = "cognicion.apariencia.paletaClara";
  const LEGACY_KEYS = ["cognicion.apariencia.modoInterfaz", "theme"];
  const DEFAULT_THEME = "biocelular";
  const root = document.documentElement;
  const launchParameters = new URLSearchParams(window.location.search);
  const bootstrapName = String(window.name || "");
  const bootstrapPrefix = "cognicion-adhd-bridge:";
  const bootstrapToken = bootstrapName.startsWith(bootstrapPrefix) ? bootstrapName.slice(bootstrapPrefix.length) : "";
  let embeddedBySameOriginHost = false;
  try {
    embeddedBySameOriginHost = window.self !== window.top && window.parent.location.origin === window.location.origin;
  } catch (_) {
    embeddedBySameOriginHost = false;
  }
  const embeddedAdhdTask = launchParameters.get("adhd") === "1"
    && launchParameters.get("embed") === "1"
    && embeddedBySameOriginHost
    && /^[a-zA-Z0-9_-]{8,160}$/u.test(bootstrapToken);
  if (embeddedAdhdTask) {
    root.dataset.cognicionEmbed = "adhd-task";
    const embedStyles = document.createElement("link");
    embedStyles.rel = "stylesheet";
    embedStyles.href = "css/adhd-task-embed.css?v=20260902-adhd-task-embed-v1";
    embedStyles.dataset.adhdTaskEmbedStyles = "true";
    document.head.appendChild(embedStyles);
  }
  // Claro está temporalmente deshabilitado. Se migra a Oscuro antes de que
  // cualquier CSS visible pueda pintar la interfaz.
  const normalizarTemaGuardado = (value) => value === "light" ? "dark" : value;
  const isValid = (value) => value === "dark" || value === "biocelular";
  const read = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const readImmediateTheme = () => {
    const globalTheme = normalizarTemaGuardado(read(GLOBAL_THEME_KEY));
    const visualTheme = normalizarTemaGuardado(read(VISUAL_THEME_KEY));
    if (isValid(globalTheme)) return globalTheme;
    for (const legacyKey of LEGACY_KEYS) {
      const legacyTheme = normalizarTemaGuardado(read(legacyKey));
      if (isValid(legacyTheme)) return legacyTheme;
    }
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("cognicion:theme:")) {
          const storedTheme = normalizarTemaGuardado(localStorage.getItem(key));
          if (isValid(storedTheme)) return storedTheme;
        }
      }
    } catch (_) { /* se usa Biocelular como fallback seguro */ }
    return isValid(visualTheme) ? visualTheme : DEFAULT_THEME;
  };
  const apply = () => {
    const storedTheme = readImmediateTheme();
    const appliedTheme = isValid(storedTheme) ? storedTheme : DEFAULT_THEME;
    if (read(GLOBAL_THEME_KEY) === "light" || read(VISUAL_THEME_KEY) === "light") {
      try {
        localStorage.setItem(GLOBAL_THEME_KEY, "dark");
        localStorage.setItem(VISUAL_THEME_KEY, "dark");
      } catch (_) { /* almacenamiento no disponible */ }
      console.info("[TEMA] Preferencia Claro migrada a Oscuro");
    }
    root.dataset.theme = appliedTheme;
    root.dataset.paletaClara = read(LIGHT_PALETTE_KEY) || "menta";
    root.dataset.cognicionTheme = "laboratorio";
    try { localStorage.setItem(VISUAL_THEME_KEY, "laboratorio"); } catch (_) { /* almacenamiento no disponible */ }
    root.style.colorScheme = appliedTheme === "light" ? "light" : "dark";
    root.style.backgroundColor = appliedTheme === "light"
      ? "#e9ede6"
      : appliedTheme === "biocelular" ? "#120609" : "#050505";
    root.dataset.themeReady = "true";
    if (appliedTheme === "biocelular" && !document.getElementById("cognicion-biocellular-theme-css")) {
      const link = document.createElement("link");
      link.id = "cognicion-biocellular-theme-css";
      link.rel = "stylesheet";
      link.href = "css/theme/biocellular.css?v=20260812-content-roots";
      document.head.appendChild(link);
    }
    if (appliedTheme === "biocelular" && !embeddedAdhdTask) {
      void import("./themes/biocellularThemeController.js?v=2.046-diagnostico-visual")
        .then(({ activateBiocellularTheme }) => activateBiocellularTheme())
        .catch((error) => console.error("[BIOCELULAR] Error en bootstrap temprano", error));
    }
    root.__cognicionThemeBootstrap = { storedTheme, appliedTheme };
    if (window.performance?.mark) window.performance.mark("cognicion:theme-bootstrap:applied");
    console.debug("[ThemeBootstrap] aplicado antes del primer render", { storedTheme, appliedTheme, source: "localStorage" });
    return appliedTheme;
  };
  window.aplicarTemaLocalInmediato = apply;
  apply();
  window.addEventListener("pageshow", apply);
  // El encabezado se carga de forma diferida y solo monta la fase autenticada validada.
  window.addEventListener("DOMContentLoaded", () => {
    if (embeddedAdhdTask) return;
    void import("./components/globalAppHeader.js?v=2.115-navbar-unica-v2")
      .then(({ scheduleGlobalAppHeader }) => scheduleGlobalAppHeader())
      .catch((error) => console.warn("[GLOBAL HEADER] Error de carga", error));
  }, { once: true });
}());
