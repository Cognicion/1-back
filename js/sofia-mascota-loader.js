async function loadSofiaMascot() {
  if (document.body.dataset.sofiaMascot !== "enabled") return;
  try {
    const { initializeSofiaMascot } = await import("./sofia-mascota/index.js");
    initializeSofiaMascot();
  } catch (error) {
    console.warn("[SOFÍA Mascota] El módulo no pudo cargarse; SOFÍA continúa sin mascota.", error);
  }
}

const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 0));
schedule(loadSofiaMascot);
