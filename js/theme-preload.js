/* Bootstrap síncrono: debe permanecer como script clásico y ejecutarse antes de cualquier CSS visible. */
(function () {
  const GLOBAL_THEME_KEY = "cognicion:theme:last";
  const VISUAL_THEME_KEY = "cognicion.apariencia.tema";
  const LEGACY_KEYS = ["cognicion.apariencia.modoInterfaz", "theme"];
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
    } catch (_) { /* se usa oscuro como fallback seguro */ }
    return isValid(visualTheme) ? visualTheme : "dark";
  };
  const apply = () => {
    const storedTheme = readImmediateTheme();
    const appliedTheme = isValid(storedTheme) ? storedTheme : "dark";
    root.dataset.theme = appliedTheme;
    root.dataset.cognicionTheme = read(VISUAL_THEME_KEY) || "laboratorio";
    root.style.colorScheme = appliedTheme === "light" ? "light" : "dark";
    root.style.backgroundColor = appliedTheme === "dark" ? "#050505" : "#f3f3f1";
    root.dataset.themeReady = "true";
    if (appliedTheme === "biocelular" && !document.getElementById("cognicion-biocellular-theme-css")) {
      const link = document.createElement("link");
      link.id = "cognicion-biocellular-theme-css";
      link.rel = "stylesheet";
      link.href = "css/theme/biocellular.css";
      document.head.appendChild(link);
    }
    if (appliedTheme === "biocelular") {
      void import("./js/themes/biocellularThemeController.js")
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
}());
