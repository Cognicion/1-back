import { CALCULATOR_CATALOG, CALCULATORS_BY_ID } from "./calculatorCatalog.js";
import { searchCalculators } from "./calculatorSearch.js";
import { readRecentCalculators, registerRecentCalculator } from "./calculatorRecents.js";
import { loadCalculatorModule } from "./calculatorLoader.js";

let activeLoadToken = 0;
let cleanupActive = null;
let initialized = false;
let lastTrigger = null;

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const getUid = () => window.getCognicionCalculatorUid?.() || document.body.dataset.uid || "sin_usuario";

function renderCard(item) { return `<button type="button" class="calculator-result" data-calculator-id="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(item.description)}</span><small>${esc(item.category)} · ${esc((item.specialties || []).join(" · "))}</small></button>`; }

function init() {
  if (initialized) return;
  initialized = true;
  const panel = document.getElementById("panelCalculadorasNota");
  const backdrop = document.getElementById("fondoCalculadorasNota");
  const search = document.getElementById("buscarCalculadoraNota");
  const results = document.getElementById("resultadosCalculadorasNota");
  const recents = document.getElementById("recientesCalculadorasNota");
  const content = document.getElementById("visorCalculadoraNota");
  const list = document.getElementById("listaCalculadorasNota");
  if (!panel || !search || !results || !recents || !content || !list) return;

  const renderResults = (items) => { results.innerHTML = items.length ? items.slice(0, 50).map(renderCard).join("") : `<p class="calculator-empty">No se encontraron calculadoras.</p>`; results.setAttribute("aria-label", `${items.length} calculadoras encontradas`); };
  const renderRecents = () => { const items = readRecentCalculators(CALCULATOR_CATALOG, { uid: getUid() }); recents.innerHTML = items.length ? items.map((item) => `<button type="button" class="calculator-recent" data-calculator-id="${esc(item.id)}">${esc(item.name)}</button>`).join("") : `<span class="calculator-empty">Aún no has utilizado calculadoras recientemente.</span>`; };
  const renderList = (items = CALCULATOR_CATALOG) => { list.innerHTML = items.length ? items.map(renderCard).join("") : `<p class="calculator-empty">No se encontraron calculadoras.</p>`; };
  const showSearch = () => { panel.classList.remove("calculator-show-content"); search.focus(); };
  const mount = async (id) => {
    const item = CALCULATORS_BY_ID.get(id); if (!item) return;
    const token = ++activeLoadToken; cleanupActive?.(); cleanupActive = null;
    panel.classList.add("calculator-show-content");
    content.innerHTML = `<p class="calculator-loading">Cargando calculadora…</p>`;
    try {
      const module = await loadCalculatorModule(id);
      if (token !== activeLoadToken) return;
      cleanupActive = item.kind === "conventional" ? module.mount(content, { uid: getUid() }) : await module.mountLegacyCalculator(content, item, { uid: getUid() });
      registerRecentCalculator(id, { uid: getUid() }); renderRecents();
    } catch (error) {
      if (token !== activeLoadToken) return;
      content.innerHTML = `<div class="calculator-error"><p>No se pudo cargar esta calculadora.</p><button type="button" data-retry-calculator="${esc(id)}">Reintentar</button></div>`;
      console.error("Error al cargar calculadora", { id, error, at: new Date().toISOString(), page: location.pathname });
    }
  };
  const onClick = (event) => { const button = event.target.closest("[data-calculator-id], [data-retry-calculator]"); if (button) void mount(button.dataset.calculatorId || button.dataset.retryCalculator); if (event.target === backdrop) window.cerrarCalculadorasNota(); };
  const onInput = () => { window.clearTimeout(onInput.timer); onInput.timer = window.setTimeout(() => { const matches = searchCalculators(CALCULATOR_CATALOG, search.value); renderResults(matches); renderList(matches); }, 100); };
  panel.addEventListener("click", onClick); search.addEventListener("input", onInput);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { window.cerrarCalculadorasNota(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.__calculatorDialogCleanup = () => { activeLoadToken++; cleanupActive?.(); cleanupActive = null; panel.removeEventListener("click", onClick); search.removeEventListener("input", onInput); };
  window.__calculatorDialogUnmount = () => { activeLoadToken++; cleanupActive?.(); cleanupActive = null; content.replaceChildren(); };
  window.__calculatorDialogRefreshRecents = renderRecents;
  renderList(); renderResults([]); renderRecents();
}

window.abrirCalculadorasNota = function () {
  lastTrigger = document.activeElement;
  init();
  window.__calculatorDialogRefreshRecents?.();
  const backdrop = document.getElementById("fondoCalculadorasNota"); const panel = document.getElementById("panelCalculadorasNota");
  backdrop?.classList.remove("oculto"); panel?.classList.add("abierto"); panel?.setAttribute("aria-hidden", "false"); document.body.classList.add("calculator-modal-open"); panel?.querySelector("input")?.focus();
};
window.cerrarCalculadorasNota = function () {
  const backdrop = document.getElementById("fondoCalculadorasNota"); const panel = document.getElementById("panelCalculadorasNota");
  window.__calculatorDialogUnmount?.();
  panel?.classList.remove("abierto"); panel?.setAttribute("aria-hidden", "true"); panel?.classList.remove("calculator-show-content"); document.body.classList.remove("calculator-modal-open");
  window.setTimeout(() => { if (!panel?.classList.contains("abierto")) backdrop?.classList.add("oculto"); }, 220); lastTrigger?.focus?.();
};
