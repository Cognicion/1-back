const CLAVE_MODO_INTERFAZ = "cognicion.apariencia.modoInterfaz";
const MODOS_VALIDOS = new Set(["dark", "light"]);

function leerModo() {
  try {
    return MODOS_VALIDOS.has(localStorage.getItem(CLAVE_MODO_INTERFAZ))
      ? localStorage.getItem(CLAVE_MODO_INTERFAZ)
      : "dark";
  } catch (error) {
    return "dark";
  }
}

function aplicarModo(modo) {
  const modoSeguro = MODOS_VALIDOS.has(modo) ? modo : "dark";
  document.documentElement.dataset.theme = modoSeguro;
  document.documentElement.style.colorScheme = modoSeguro;
  document.body?.classList.toggle("tema-claro", modoSeguro === "light");
  document.body?.classList.toggle("tema-oscuro", modoSeguro === "dark");
  try {
    localStorage.setItem(CLAVE_MODO_INTERFAZ, modoSeguro);
  } catch (error) {
    console.warn("No se pudo guardar el tema local.", error);
  }
  return modoSeguro;
}

function renderizarSelector(contenedor) {
  contenedor.innerHTML = `
    <div class="cognicion-theme-selector" role="group" aria-label="Selector de tema">
      <span class="cognicion-theme-label">Tema:</span>
      <button type="button" data-cognicion-theme="light" aria-pressed="false">Claro</button>
      <button type="button" data-cognicion-theme="dark" aria-pressed="false">Oscuro</button>
    </div>
  `;
  actualizarEstados(contenedor, leerModo());
}

function actualizarEstados(contenedor, modo) {
  contenedor.querySelectorAll("[data-cognicion-theme]").forEach((boton) => {
    const activo = boton.dataset.cognicionTheme === modo;
    boton.setAttribute("aria-pressed", String(activo));
  });
}

function inicializar() {
  const modoInicial = aplicarModo(leerModo());
  document.querySelectorAll("[data-cognicion-theme-selector]").forEach((contenedor) => {
    renderizarSelector(contenedor);
    actualizarEstados(contenedor, modoInicial);
    contenedor.addEventListener("click", (event) => {
      const boton = event.target.closest("[data-cognicion-theme]");
      if (!boton) return;
      const modo = aplicarModo(boton.dataset.cognicionTheme);
      document.querySelectorAll("[data-cognicion-theme-selector]").forEach((otro) => {
        actualizarEstados(otro, modo);
      });
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializar, { once: true });
} else {
  inicializar();
}
