/* Bootstrap síncrono: debe permanecer como script clásico y ejecutarse antes de cualquier CSS visible. */
(function () {
  const GLOBAL_THEME_KEY = "cognicion:theme:last";
  const LEGACY_KEYS = ["cognicion.apariencia.modoInterfaz", "theme"];
  const root = document.documentElement;
  const isValid = (value) => value === "dark" || value === "light";
  const read = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const readImmediateTheme = () => {
    const globalTheme = read(GLOBAL_THEME_KEY);
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
    } catch (_) { /* se usa claro como fallback seguro */ }
    return "light";
  };
  const apply = () => {
    const storedTheme = readImmediateTheme();
    const appliedTheme = isValid(storedTheme) ? storedTheme : "light";
    root.dataset.theme = appliedTheme;
    root.style.colorScheme = appliedTheme;
    root.style.backgroundColor = appliedTheme === "dark" ? "#050505" : "#f3f3f1";
    root.dataset.themeReady = "true";
    root.__cognicionThemeBootstrap = { storedTheme, appliedTheme };
    if (window.performance?.mark) window.performance.mark("cognicion:theme-bootstrap:applied");
    console.debug("[ThemeBootstrap] aplicado antes del primer render", { storedTheme, appliedTheme, source: "localStorage" });
    return appliedTheme;
  };
  window.aplicarTemaLocalInmediato = apply;
  apply();
  window.addEventListener("pageshow", apply);
}());
