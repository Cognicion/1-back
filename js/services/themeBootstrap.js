const embeddedAdhdTask = document.documentElement.dataset.cognicionEmbed === "adhd-task";

if (!embeddedAdhdTask) {
  void Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
    import("../firebase.js"),
    import("./themeService.js")
  ]).then(([{ onAuthStateChanged }, { auth }, { applyTheme, initializeThemeForUser }]) => {
    applyTheme(document.documentElement.dataset.theme || "biocelular");
    document.documentElement.style.removeProperty("background-color");
    console.debug("[ThemeBootstrap] inicialización modular completada", { theme: document.documentElement.dataset.theme });
    onAuthStateChanged(auth, (user) => { void initializeThemeForUser(user); });
  }).catch((error) => console.error("[ThemeBootstrap] No se pudo completar la inicialización modular", error));
}
