async function loadSofiaMascot() {
  console.debug("[SOFÍA Mascota] Loader iniciado");
  if (!document.body) {
    console.warn("[SOFÍA Mascota] document.body no disponible");
    return;
  }
  const enabled = document.body.dataset.sofiaMascot === "enabled";
  console.debug("[SOFÍA Mascota] Marca en body", { value: document.body.dataset.sofiaMascot, enabled });
  if (!enabled) {
    console.warn("[SOFÍA Mascota] Montaje cancelado: data-sofia-mascot no está habilitado");
    return;
  }
  try {
    const module = await import("./sofia-mascota/index.js");
    console.debug("[SOFÍA Mascota] Módulo importado", { exports: Object.keys(module) });
    if (typeof module.initializeSofiaMascot !== "function") throw new TypeError("initializeSofiaMascot no está exportada correctamente");
    await module.initializeSofiaMascot();
    console.debug("[SOFÍA Mascota] Inicialización solicitada");
  } catch (error) {
    console.error("[SOFÍA Mascota] Falló la carga o inicialización", error);
  }
}

function scheduleMascotLoad() {
  const run = () => { void loadSofiaMascot(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }
  run();
}

scheduleMascotLoad();
