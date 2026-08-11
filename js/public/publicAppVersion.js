async function renderPublicAppVersion() {
  const badges = document.querySelectorAll("[data-public-app-version]");
  if (!badges.length) return;

  try {
    const versionModuleUrl = new URL("../config/appVersion.js", import.meta.url);
    versionModuleUrl.searchParams.set("cache", Date.now().toString());
    const { APP_VERSION } = await import(versionModuleUrl.href);

    badges.forEach((badge) => {
      badge.textContent = `v${APP_VERSION}`;
    });
  } catch (error) {
    console.warn("[PUBLIC VERSION] No fue posible mostrar la versión.", error);
  }
}

renderPublicAppVersion();
