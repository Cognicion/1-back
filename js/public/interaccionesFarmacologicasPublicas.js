import {
  analizarInteraccionesPublicas,
  buscarMedicamentosParaConsulta,
  crearSeleccionMedicamento,
  resumirAnalisisPublico
} from "../services/interaccionesPublicas.js?v=20260811-pharmacology-ssot-v1";
import { registrarUsoConsultaInteracciones } from "../services/analyticsInteraccionesFarmacologicas.js";

const SEVERIDAD_ORDEN = ["contraindicada", "alta", "moderada", "baja", "informativa"];

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderSuggestions(root, matches, query) {
  const suggestions = root.querySelector("[data-interaction-suggestions]");
  if (!suggestions) return;
  if (!query.trim()) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }
  if (!matches.length) {
    suggestions.hidden = false;
    suggestions.innerHTML = '<p class="public-interactions-empty">No se encontraron medicamentos en el catálogo.</p>';
    return;
  }
  suggestions.hidden = false;
  suggestions.innerHTML = matches.flatMap(({ medicamento, presentaciones }) => {
    const opciones = presentaciones.length ? presentaciones : [null];
    return opciones.slice(0, 4).map((presentacion) => `
      <button type="button" class="public-interaction-suggestion" data-medication-id="${escapeHtml(medicamento.id)}" data-presentation="${escapeHtml(presentacion?.texto || "")}">
        <strong>${escapeHtml(medicamento.nombre)}</strong>
        <span>${escapeHtml(presentacion?.texto || "Principio activo; presentación no especificada")}</span>
      </button>
    `);
  }).join("");
}

function renderSelected(root, selections) {
  const list = root.querySelector("[data-interaction-selected]");
  const count = root.querySelector("[data-interaction-count]");
  if (count) count.textContent = String(selections.length);
  if (!list) return;
  list.innerHTML = selections.length
    ? selections.map((selection, index) => `
      <li class="public-interaction-selected-item">
        <span><strong>${escapeHtml(selection.nombre)}</strong>${selection.presentacion ? ` · ${escapeHtml(selection.presentacion)}` : ""}</span>
        <button type="button" data-remove-medication="${index}" aria-label="Quitar ${escapeHtml(selection.nombre)}">×</button>
      </li>
    `).join("")
    : '<li class="public-interactions-empty">Aún no has agregado medicamentos.</li>';
}

function renderResults(root, alertas) {
  const results = root.querySelector("[data-interaction-results]");
  if (!results) return;
  if (!alertas.length) {
    results.innerHTML = '<div class="public-interactions-ok">No se encontraron interacciones en la base actual para esta selección.</div>';
    return;
  }
  const grupos = new Map();
  SEVERIDAD_ORDEN.forEach((severidad) => grupos.set(severidad, []));
  alertas.forEach((alerta) => (grupos.get(alerta.severidad) || grupos.get("informativa")).push(alerta));
  results.innerHTML = [...grupos.entries()].filter(([, items]) => items.length).map(([severidad, items]) => `
    <section class="public-interaction-severity public-interaction-severity-${severidad}">
      <h4>${escapeHtml(severidad)}</h4>
      ${items.map((alerta) => `
        <article class="public-interaction-alert">
          <h5>${escapeHtml(alerta.titulo || "Interacción farmacológica")}</h5>
          <p class="public-interaction-drugs">${escapeHtml((alerta.medicamentos || []).join(" + "))}</p>
          ${alerta.mecanismo ? `<p><strong>Mecanismo:</strong> ${escapeHtml(alerta.mecanismo)}</p>` : ""}
          <p><strong>Efecto clínico:</strong> ${escapeHtml(alerta.efectoClinico || alerta.efecto || "")}</p>
          <p><strong>Recomendación:</strong> ${escapeHtml(alerta.recomendacion || "Revisar con juicio clínico.")}</p>
          ${alerta.fuentes?.length ? `<small>Fuente: ${escapeHtml(alerta.fuentes[0])}</small>` : ""}
        </article>
      `).join("")}
    </section>
  `).join("");
}

export function inicializarConsultaInteraccionesPublicas() {
  const root = document.querySelector("[data-public-interactions]");
  const openButton = document.querySelector("[data-open-public-interactions]");
  if (!root || !openButton) return;

  const state = { selections: [], matches: [], opened: false };
  const search = root.querySelector("[data-interaction-search]");
  const close = () => {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    state.opened = false;
  };
  const open = () => {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    state.opened = true;
    search?.focus();
    void registrarUsoConsultaInteracciones({ eventType: "interaction_tool_opened", selectedMedicationIds: state.selections.map((item) => item.clinicalMedicationId) });
  };

  openButton.addEventListener("click", open);
  root.querySelectorAll("[data-close-public-interactions]").forEach((button) => button.addEventListener("click", close));
  root.addEventListener("click", (event) => {
    if (event.target === root) close();
    const suggestion = event.target.closest("[data-medication-id]");
    if (suggestion) {
      const match = state.matches.find((item) => item.medicamento.id === suggestion.dataset.medicationId);
      if (!match) return;
      if (state.selections.some((item) => item.clinicalMedicationId === match.medicamento.id)) {
        root.querySelector("[data-interaction-status]").textContent = "Ese principio activo ya está seleccionado; las presentaciones no generan duplicidad.";
        return;
      }
      const presentation = (match.medicamento.presentaciones || []).find((item) => item.texto === suggestion.dataset.presentation) || null;
      state.selections.push(crearSeleccionMedicamento(match.medicamento, presentation));
      renderSelected(root, state.selections);
      if (search) search.value = "";
      renderSuggestions(root, [], "");
    }
    const remove = event.target.closest("[data-remove-medication]");
    if (remove) {
      state.selections.splice(Number(remove.dataset.removeMedication), 1);
      renderSelected(root, state.selections);
    }
  });
  search?.addEventListener("input", () => {
    state.matches = buscarMedicamentosParaConsulta(search.value);
    renderSuggestions(root, state.matches, search.value);
  });
  root.querySelector("[data-clear-interactions]")?.addEventListener("click", () => {
    state.selections = [];
    renderSelected(root, state.selections);
    renderResults(root, []);
    if (search) search.value = "";
    renderSuggestions(root, [], "");
  });
  root.querySelector("[data-analyze-interactions]")?.addEventListener("click", () => {
    const alertas = analizarInteraccionesPublicas(state.selections);
    renderResults(root, alertas);
    const resumen = resumirAnalisisPublico(alertas);
    root.querySelector("[data-interaction-status]").textContent = `${resumen.resultCount} alerta(s) encontrada(s).`;
    void registrarUsoConsultaInteracciones({
      eventType: "interaction_tool_analyzed",
      selectedMedicationIds: state.selections.map((item) => item.clinicalMedicationId),
      ...resumen
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.opened) close();
  });
  renderSelected(root, state.selections);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicializarConsultaInteraccionesPublicas);
else inicializarConsultaInteraccionesPublicas();
