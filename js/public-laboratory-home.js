(() => {
  const root = document.documentElement;
  const header = document.querySelector("[data-public-header]");
  const menuToggle = header?.querySelector(".public-menu-toggle");
  const mobileMenu = document.getElementById("publicMobileMenu");
  const scrollTopButton = document.getElementById("scrollTopIndex");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const validThemes = new Set(["light", "dark", "biocelular"]);
  const themeStorageKeys = ["cognicion:theme:last", "cognicion.apariencia.tema"];

  function currentTheme() {
    return validThemes.has(root.dataset.theme) ? root.dataset.theme : "biocelular";
  }

  function updateThemeControls(theme) {
    document.querySelectorAll("[data-public-theme]").forEach((button) => {
      const active = button.dataset.publicTheme === theme;
      button.setAttribute("aria-pressed", String(active));
    });
    if (themeColor) {
      themeColor.content = theme === "light" ? "#edf6fb" : theme === "biocelular" ? "#120609" : "#02060b";
    }
  }

  function storeTheme(theme) {
    try {
      themeStorageKeys.forEach((key) => localStorage.setItem(key, theme));
    } catch {
      // La apariencia continúa funcionando aunque el navegador bloquee almacenamiento.
    }
  }

  async function applyPublicTheme(theme) {
    if (!validThemes.has(theme)) return;
    const previousTheme = currentTheme();
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "light" ? "light" : "dark";
    root.style.backgroundColor = theme === "light" ? "#edf6fb" : theme === "biocelular" ? "#120609" : "#02060b";
    storeTheme(theme);
    updateThemeControls(theme);

    if (theme === "biocelular") {
      try {
        const { activateBiocellularTheme } = await import("./themes/biocellularThemeController.js");
        await activateBiocellularTheme();
      } catch (error) {
        console.warn("[PUBLIC HOME] No se pudo activar el fondo biocelular.", error);
      }
    } else if (previousTheme === "biocelular") {
      if (globalThis.__cognicionBiocellularDeactivate) globalThis.__cognicionBiocellularDeactivate();
      else {
        void import("./themes/biocellularThemeController.js")
          .then(({ deactivateBiocellularTheme }) => deactivateBiocellularTheme())
          .catch((error) => console.warn("[PUBLIC HOME] No se pudo limpiar el fondo biocelular.", error));
      }
    }
  }

  function closeMobileMenu({ restoreFocus = false } = {}) {
    if (!mobileMenu || !menuToggle || mobileMenu.hidden) return;
    mobileMenu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menú");
    if (restoreFocus) menuToggle.focus();
  }

  function toggleMobileMenu() {
    if (!mobileMenu || !menuToggle) return;
    const opening = mobileMenu.hidden;
    mobileMenu.hidden = !opening;
    menuToggle.setAttribute("aria-expanded", String(opening));
    menuToggle.setAttribute("aria-label", opening ? "Cerrar menú" : "Abrir menú");
    if (opening) mobileMenu.querySelector("a, button")?.focus();
  }

  menuToggle?.addEventListener("click", toggleMobileMenu);

  header?.addEventListener("click", (event) => {
    const themeButton = event.target.closest("[data-public-theme]");
    if (themeButton) {
      void applyPublicTheme(themeButton.dataset.publicTheme);
      themeButton.closest("details")?.removeAttribute("open");
      return;
    }
    if (event.target.closest(".public-mobile-menu a")) closeMobileMenu();
  });

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".public-theme-menu[open]").forEach((details) => {
      if (!details.contains(event.target)) details.removeAttribute("open");
    });
    if (mobileMenu && menuToggle && !mobileMenu.hidden && !header?.contains(event.target)) closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".public-theme-menu[open]").forEach((details) => details.removeAttribute("open"));
    closeMobileMenu({ restoreFocus: true });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) closeMobileMenu();
  }, { passive: true });

  function updateScrollTop() {
    scrollTopButton?.classList.toggle("is-visible", window.scrollY > 520);
  }

  window.addEventListener("scroll", updateScrollTop, { passive: true });
  scrollTopButton?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  updateThemeControls(currentTheme());
  updateScrollTop();
})();
