function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "Sin fecha documentada";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function originLabel(origin) {
  return {
    structured: "Dato estructurado",
    report_text: "Extraído del informe",
    calculated: "Calculado"
  }[origin] || "Dato documentado";
}

function statusLabel(status) {
  return {
    available: "Datos disponibles",
    ecg_not_found: "Sin ECG identificado",
    insufficient_data: "Datos insuficientes"
  }[status] || "Estado no determinado";
}

function measurementCards(measurements = []) {
  if (!measurements.length) return `<p class="ecg-empty">No hay mediciones ECG estructuradas o extraíbles del informe.</p>`;
  return `<div class="ecg-measurements">${measurements.map((item) => `
    <article class="ecg-measurement">
      <small>${escapeHtml(originLabel(item.origin))}</small>
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.value)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</span>
      ${item.method ? `<em>Método: ${escapeHtml(item.method)}</em>` : ""}
    </article>`).join("")}</div>`;
}

function findingsList(findings = []) {
  if (!findings.length) return `<p class="ecg-empty">No se generaron observaciones interpretativas con los datos disponibles.</p>`;
  return `<div class="ecg-findings">${findings.map((item) => `
    <article class="ecg-finding ecg-finding--${escapeHtml(item.level)}">
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.level)}</span></div>
      <p>${escapeHtml(item.detail)}</p>
      <details>
        <summary>Base y límites</summary>
        <p><b>Base:</b> ${escapeHtml(item.basis)}</p>
        ${(item.limitations || []).length ? `<ul>${item.limitations.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}</ul>` : ""}
      </details>
    </article>`).join("")}</div>`;
}

function diagnosisList(items = []) {
  if (!items.length) return `<p class="ecg-empty">Sin diagnósticos o comorbilidades ECG-relevantes identificados en campos estructurados.</p>`;
  return `<ul class="ecg-context-list">${items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.status)}</span><small>${escapeHtml(item.relevance)}</small></li>`).join("")}</ul>`;
}

function medicationList(context = {}) {
  const medications = context.medications || [];
  const alerts = context.alerts || [];
  if (!medications.length && !alerts.length) {
    const pending = Number(context.coverage?.fuentePendiente || 0);
    return `<p class="ecg-empty">No se encontró una señal ECG específica en la base farmacológica actual.${pending ? ` ${pending} medicamento(s) tienen fuente pendiente.` : ""} Esto no equivale a ausencia de efecto.</p>`;
  }
  return `
    ${medications.length ? `<ul class="ecg-context-list">${medications.map((item) => `<li><strong>${escapeHtml(item.medication)}</strong><span>${escapeHtml((item.possibleEffects || []).join(" · "))}</span><small>${escapeHtml(item.interpretation)}</small></li>`).join("")}</ul>` : ""}
    ${alerts.length ? `<div class="ecg-medication-alerts">${alerts.map((item) => `<article><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.severity)}</small><p>${escapeHtml(item.effect)}</p>${item.professionalReview ? `<p><b>Revisión profesional:</b> ${escapeHtml(item.professionalReview)}</p>` : ""}</article>`).join("")}</div>` : ""}`;
}

function laboratoryList(items = []) {
  if (!items.length) return `<p class="ecg-empty">No hay potasio, magnesio, calcio, función renal o TSH estructurados para contextualizar.</p>`;
  const status = { low: "Bajo", high: "Alto", within_recorded_range: "Dentro del rango guardado", not_classified: "Sin clasificar" };
  return `<ul class="ecg-labs">${items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}${item.unit ? ` ${escapeHtml(item.unit)}` : ""}</span><small>${escapeHtml(status[item.status] || item.status)}${item.referenceRange ? ` · rango ${escapeHtml(item.referenceRange)}` : ""}${item.date ? ` · ${escapeHtml(formatDate(item.date))}` : ""}</small></li>`).join("")}</ul>`;
}

function referencesList(items = []) {
  return `<ul class="ecg-references">${items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><small>${escapeHtml(item.organization)} · ${escapeHtml(item.year)}${item.doi ? ` · DOI ${escapeHtml(item.doi)}` : ""}</small></li>`).join("")}</ul>`;
}

export function renderEcgInterpretation(container, result = {}) {
  if (!container) return;
  const context = result.context || {};
  const source = result.latestSource;
  container.className = "ecg-analysis";
  container.innerHTML = `
    <div class="ecg-analysis__header">
      <div>
        <strong>${escapeHtml(statusLabel(result.status))}</strong>
        <small>${source ? `${escapeHtml(source.label)} · ${escapeHtml(formatDate(source.date))}` : "No se encontró un estudio identificado como ECG/EKG/electrocardiograma."}</small>
      </div>
      <span>Apoyo clínico</span>
    </div>

    <section class="ecg-analysis__section" aria-labelledby="ecgMeasurementsTitle">
      <h3 id="ecgMeasurementsTitle">Datos del ECG</h3>
      ${measurementCards(result.measurements)}
      ${result.reportExcerpt ? `<details class="ecg-report"><summary>Ver informe documentado</summary><p>${escapeHtml(result.reportExcerpt)}</p></details>` : ""}
    </section>

    <section class="ecg-analysis__section" aria-labelledby="ecgFindingsTitle">
      <h3 id="ecgFindingsTitle">Interpretación contextual posible</h3>
      ${findingsList(result.findings)}
    </section>

    <div class="ecg-context-grid">
      <details open>
        <summary>Diagnósticos y comorbilidades</summary>
        ${diagnosisList(context.diagnoses)}
      </details>
      <details open>
        <summary>Fármacos</summary>
        ${medicationList(context.medications)}
      </details>
      <details>
        <summary>Electrolitos y factores de laboratorio</summary>
        ${laboratoryList(context.laboratories)}
      </details>
      <details>
        <summary>Datos faltantes</summary>
        ${(result.missingData || []).length ? `<ul>${result.missingData.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="ecg-empty">Sin faltantes estructurales identificados para esta vista.</p>`}
      </details>
    </div>

    <details class="ecg-methodology">
      <summary>Metodología, límites y fuentes</summary>
      <ul>${(result.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${referencesList(result.references)}
      <p><small>Motor ECG ${escapeHtml(result.interpretationVersion || "--")} · cálculo QTc ${escapeHtml(result.calculationVersion || "--")}</small></p>
    </details>
    <p class="ecg-analysis__notice">${escapeHtml(result.notice || "Interpretación de apoyo clínico. No sustituye el juicio profesional.")}</p>`;
}

export { escapeHtml as escapeEcgHtml };
