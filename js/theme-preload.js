/* Bootstrap síncrono: debe permanecer como script clásico y ejecutarse antes de cualquier CSS visible. */
(function () {
  const GLOBAL_THEME_KEY = "cognicion:theme:last";
  const VISUAL_THEME_KEY = "cognicion.apariencia.tema";
  const LIGHT_PALETTE_KEY = "cognicion.apariencia.paletaClara";
  const LEGACY_KEYS = ["cognicion.apariencia.modoInterfaz", "theme"];
  const DEFAULT_THEME = "biocelular";
  const root = document.documentElement;
  const isValid = (value) => value === "dark" || value === "light" || value === "biocelular";
  const read = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const readImmediateTheme = () => {
    const globalTheme = read(GLOBAL_THEME_KEY);
    const visualTheme = read(VISUAL_THEME_KEY);
    if (isValid(globalTheme)) return globalTheme;
    for (const legacyKey of LEGACY_KEYS) {
      const legacyTheme = read(legacyKey);
      if (isValid(legacyTheme)) return legacyTheme;
    }
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("cognicion:theme:")) {
          const storedTheme = localStorage.getItem(key);
          if (isValid(storedTheme)) return storedTheme;
        }
      }
    } catch (_) { /* se usa Biocelular como fallback seguro */ }
    return isValid(visualTheme) ? visualTheme : DEFAULT_THEME;
  };
  const apply = () => {
    const storedTheme = readImmediateTheme();
    const appliedTheme = isValid(storedTheme) ? storedTheme : DEFAULT_THEME;
    root.dataset.theme = appliedTheme;
    root.dataset.paletaClara = read(LIGHT_PALETTE_KEY) || "menta";
    root.dataset.cognicionTheme = "laboratorio";
    try { localStorage.setItem(VISUAL_THEME_KEY, "laboratorio"); } catch (_) { /* almacenamiento no disponible */ }
    root.style.colorScheme = appliedTheme === "light" ? "light" : "dark";
    root.style.backgroundColor = appliedTheme === "light"
      ? "#ffffff"
      : appliedTheme === "biocelular" ? "#120609" : "#050505";
    root.dataset.themeReady = "true";
    if (appliedTheme === "biocelular" && !document.getElementById("cognicion-biocellular-theme-css")) {
      const link = document.createElement("link");
      link.id = "cognicion-biocellular-theme-css";
      link.rel = "stylesheet";
      link.href = "css/theme/biocellular.css";
      document.head.appendChild(link);
    }
    if (appliedTheme === "biocelular") {
      void import("./themes/biocellularThemeController.js")
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
    void import("./components/globalAppHeader.js")
      .then(({ scheduleGlobalAppHeader }) => scheduleGlobalAppHeader())
      .catch((error) => console.warn("[GLOBAL HEADER] Error de carga", error));
  }, { once: true });
}());
