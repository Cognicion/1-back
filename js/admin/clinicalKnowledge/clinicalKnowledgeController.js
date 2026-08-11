import { obtenerFunctions } from "../../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export async function initializeClinicalKnowledgePanel({ nav, main }) {
  if (!nav || !main || document.getElementById("seccionConocimientoSofiaAdmin")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.adminSection = "seccionConocimientoSofiaAdmin";
  button.textContent = "Conocimiento registrado por SOFÍA";
  nav.appendChild(button);
  const section = document.createElement("section");
  section.id = "seccionConocimientoSofiaAdmin";
  section.className = "card tabla-card admin-section clinical-knowledge-admin";
  section.innerHTML = `<div class="tabla-header"><div><h2>Conocimiento registrado por SOFÍA</h2><p>Variables, patrones y relaciones agregadas; no contiene identidad clínica directa.</p></div><button id="btnActualizarConocimientoSofiaAdmin" type="button">Actualizar</button></div><p id="estadoConocimientoSofiaAdmin">Cargando conocimiento agregado…</p><div id="resumenConocimientoSofiaAdmin" class="clinical-knowledge-summary"></div><div id="tablasConocimientoSofiaAdmin"></div>`;
  main.appendChild(section);
  const load = async () => {
    const status = section.querySelector("#estadoConocimientoSofiaAdmin");
    status.textContent = "Consultando resultados agregados…";
    try {
      const functions = await obtenerFunctions();
      const result = (await httpsCallable(functions, "getClinicalKnowledgeAdmin")({ limit: 100 })).data || {};
      renderKnowledge(section, result);
      status.textContent = "Conocimiento agregado actualizado.";
    } catch (error) {
      console.error("[SOFÍA Knowledge] No se pudo cargar el panel", error);
      status.textContent = "No se pudo cargar el conocimiento agregado.";
    }
  };
  section.querySelector("#btnActualizarConocimientoSofiaAdmin").addEventListener("click", load);
  await load();
}

function renderKnowledge(section, data) {
  section.querySelector("#resumenConocimientoSofiaAdmin").innerHTML = [["Variables", data.variables?.length || 0], ["Patrones", data.patterns?.length || 0], ["Relaciones", data.relationships?.length || 0], ["Probabilidades", data.probabilities?.length || 0], ["Fuentes", data.evidence?.length || 0]].map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("");
  const rows = (items, columns) => `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr></thead><tbody>${(items || []).slice(0, 100).map((item) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(item))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${columns.length}">Sin datos agregados.</td></tr>`}</tbody></table></div>`;
  section.querySelector("#tablasConocimientoSofiaAdmin").innerHTML = `<h3>Variables registradas</h3>${rows(data.variables, [{ label: "Variable", value: (item) => item.canonicalName || item.variableId }, { label: "Dominio", value: (item) => item.domain }, { label: "Observaciones", value: (item) => item.observations }, { label: "Primera observación", value: (item) => item.firstObservedAt }, { label: "Última observación", value: (item) => item.lastObservedAt }])}<h3>Patrones y relaciones</h3>${rows([...(data.patterns || []), ...(data.relationships || [])], [{ label: "Identificador", value: (item) => item.patternId || item.relationshipId }, { label: "Tipo", value: (item) => item.patternType || item.relationshipType }, { label: "Variables", value: (item) => (item.variables || [item.variableA, item.variableB]).filter(Boolean).join(" → ") }, { label: "Soporte / n", value: (item) => item.supportCount || `${item.numerator || 0}/${item.denominator || 0}` }, { label: "Fuente", value: (item) => item.sourceType }])}<h3>Probabilidades</h3>${rows(data.probabilities, [{ label: "Evento", value: (item) => item.event }, { label: "Condición", value: (item) => item.condition }, { label: "Resultado", value: (item) => item.insufficientEvidence ? "Evidencia insuficiente" : `${Math.round((item.probability || 0) * 100)}% (n=${item.numerator}/${item.denominator})` }, { label: "Intervalo", value: (item) => item.ciLower === null ? "—" : `${Math.round(item.ciLower * 100)}–${Math.round(item.ciUpper * 100)}%` }])}<h3>Fuentes</h3>${rows(data.evidence, [{ label: "Fuente", value: (item) => item.evidenceId }, { label: "Título", value: (item) => item.title }, { label: "Tipo", value: (item) => item.evidenceType }])}`;
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
