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
  section.innerHTML = `
    <div class="tabla-header">
      <div>
        <h2>Conocimiento registrado por SOFÍA</h2>
        <p>Matrices y patrones agregados de perfiles desidentificados; no contiene filas clínicas ni identidad directa.</p>
      </div>
      <div class="patrones-acciones">
        <button id="btnActualizarConocimientoSofiaAdmin" type="button">Actualizar vista</button>
        <button id="btnRecalcularMatricesSofiaAdmin" type="button">Recalcular matrices</button>
      </div>
    </div>
    <p id="estadoConocimientoSofiaAdmin">Cargando conocimiento agregado…</p>
    <div id="resumenConocimientoSofiaAdmin" class="clinical-knowledge-summary"></div>
    <div id="tablasConocimientoSofiaAdmin"></div>`;
  main.appendChild(section);

  const load = async () => {
    const status = section.querySelector("#estadoConocimientoSofiaAdmin");
    status.textContent = "Consultando resultados agregados…";
    try {
      const functions = await obtenerFunctions();
      const result = (await httpsCallable(functions, "getClinicalKnowledgeAdmin")({ limit: 100 })).data || {};
      renderKnowledge(section, result);
      status.textContent = matrixStatusText(result.matrixStatus);
    } catch (error) {
      console.error("[SOFÍA Knowledge] No se pudo cargar el panel", error);
      status.textContent = "No se pudo cargar el conocimiento agregado.";
    }
  };

  const rebuild = async () => {
    const status = section.querySelector("#estadoConocimientoSofiaAdmin");
    const rebuildButton = section.querySelector("#btnRecalcularMatricesSofiaAdmin");
    rebuildButton.disabled = true;
    status.textContent = "Construyendo perfiles desidentificados y matrices; puede tardar varios minutos…";
    try {
      const functions = await obtenerFunctions();
      const result = (await httpsCallable(functions, "rebuildClinicalPatternMatricesAdmin")({})).data || {};
      console.debug("[SOFÍA Knowledge] Matrices reconstruidas", result);
      await load();
    } catch (error) {
      console.error("[SOFÍA Knowledge] No se pudieron reconstruir las matrices", error);
      status.textContent = "No se publicaron matrices parciales. Revisa la traza de la función.";
    } finally {
      rebuildButton.disabled = false;
    }
  };

  section.querySelector("#btnActualizarConocimientoSofiaAdmin").addEventListener("click", load);
  section.querySelector("#btnRecalcularMatricesSofiaAdmin").addEventListener("click", rebuild);
  await load();
}

function matrixStatusText(status = {}) {
  if (!status.generatedAt) return "Las matrices todavía no se han generado.";
  const date = new Date(status.generatedAt);
  const suffix = Number.isNaN(date.getTime()) ? status.generatedAt : date.toLocaleString("es-MX");
  return status.stale
    ? `Matrices pendientes de actualización desde ${suffix}.`
    : `Matrices vigentes para ${status.cohortSize || 0} perfiles desidentificados · ${suffix}.`;
}

function renderKnowledge(section, data) {
  const matrices = data.matrices || {};
  const matrixAssociations = Object.values(matrices).reduce((sum, matrix) => sum + (matrix?.associations?.length || 0), 0);
  section.querySelector("#resumenConocimientoSofiaAdmin").innerHTML = [
    ["Variables", data.variables?.length || 0],
    ["Patrones previos", data.patterns?.length || 0],
    ["Matrices", Object.values(matrices).filter(Boolean).length],
    ["Asociaciones matriciales", matrixAssociations],
    ["Probabilidades", data.probabilities?.length || 0],
    ["Fuentes", data.evidence?.length || 0]
  ].map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("");

  const mixed = matrices.mixed?.associations || [];
  const documentation = matrices.documentation?.associations || [];
  const temporal = matrices.temporal?.associations || [];
  section.querySelector("#tablasConocimientoSofiaAdmin").innerHTML = `
    <h3>Matriz mixta de variables</h3>
    <p>Selecciona Pearson/Spearman, punto-biserial, V de Cramér o η² según los tipos de datos. Los valores q usan Benjamini–Hochberg.</p>
    ${rows(mixed, associationColumns())}
    <h3>Matriz de presencia y documentación</h3>
    <p>Busca qué variables suelen documentarse juntas o ausentarse de forma sistemática.</p>
    ${rows(documentation, associationColumns())}
    <h3>Matriz de secuencias temporales</h3>
    <p>Secuencias observadas en múltiples pacientes; son asociaciones temporales y no implican causalidad.</p>
    ${rows(temporal, [
      { label: "Variable inicial", value: (item) => item.variableA },
      { label: "Variable posterior", value: (item) => item.variableB },
      { label: "Soporte", value: (item) => `${item.numerator || 0}/${item.denominator || 0}` },
      { label: "Probabilidad empírica", value: (item) => formatProbability(item) },
      { label: "Lift", value: (item) => formatNumber(item.lift, 3) },
      { label: "Estado", value: (item) => evidenceLabel(item.evidenceStatus) }
    ])}
    <h3>Variables registradas</h3>
    ${rows(data.variables, [
      { label: "Variable", value: (item) => item.canonicalName || item.variableId },
      { label: "Dominio", value: (item) => item.domain },
      { label: "Observaciones", value: (item) => item.observations },
      { label: "Primera observación", value: (item) => item.firstObservedAt },
      { label: "Última observación", value: (item) => item.lastObservedAt }
    ])}
    <h3>Fuentes metodológicas</h3>
    ${rows(data.evidence, [
      { label: "Fuente", value: (item) => item.evidenceId },
      { label: "Título", value: (item) => item.title },
      { label: "Tipo", value: (item) => item.evidenceType }
    ])}`;
}

function associationColumns() {
  return [
    { label: "Variable A", value: (item) => item.canonicalNameA || item.variableA },
    { label: "Variable B", value: (item) => item.canonicalNameB || item.variableB },
    { label: "Dominios", value: (item) => `${item.domainA || "—"} ↔ ${item.domainB || "—"}` },
    { label: "Método", value: (item) => item.method },
    { label: "Efecto", value: (item) => `${item.effectMetric || "efecto"}: ${formatNumber(item.effectSize, 3)}` },
    { label: "n", value: (item) => item.sampleSize },
    { label: "q", value: (item) => formatNumber(item.adjustedPValue, 4) },
    { label: "Estado", value: (item) => evidenceLabel(item.evidenceStatus) }
  ];
}

function rows(items, columns) {
  return `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr></thead><tbody>${(items || []).slice(0, 100).map((item) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(item))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${columns.length}">Sin datos agregados suficientes.</td></tr>`}</tbody></table></div>`;
}

function formatNumber(value, digits) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function formatProbability(item) {
  if (!Number.isFinite(Number(item.probability))) return "Evidencia insuficiente";
  const percentage = Math.round(Number(item.probability) * 100);
  const interval = Number.isFinite(Number(item.ciLower)) && Number.isFinite(Number(item.ciUpper))
    ? ` · IC ${Math.round(item.ciLower * 100)}–${Math.round(item.ciUpper * 100)}%`
    : "";
  return `${percentage}% (n=${item.numerator}/${item.denominator})${interval}`;
}

function evidenceLabel(value) {
  return ({
    screened_candidate: "Candidato tras corrección",
    exploratory_not_confirmed: "Exploratorio; no confirmado",
    effect_below_threshold: "Efecto bajo",
    observational_ready: "Observación suficiente",
    insufficient_evidence: "Evidencia insuficiente"
  })[value] || value || "Exploratorio";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
