const renderControllers = new WeakMap();

const STATUS_PRESENTATION = Object.freeze({
  present: { label: "Presente", tone: "present" },
  absent: { label: "Ausente / negado", tone: "absent" },
  historical: { label: "Histórico", tone: "historical" },
  possible: { label: "Posible", tone: "possible" },
  contradictory: { label: "Contradictorio", tone: "contradictory" },
  insufficient_data: { label: "Datos insuficientes", tone: "insufficient" }
});

const ANALYSIS_STATE_LABELS = Object.freeze({
  not_analyzed: "Sin analizar",
  analyzing: "Analizando",
  current: "Actual",
  outdated: "Pendiente de actualización",
  error: "Error de análisis"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value, includeTime = false) {
  if (value === null || value === undefined || value === "") return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)} %` : "No disponible";
}

function displayValue(value) {
  if (value === true) return "Presente";
  if (value === false) return "Ausente";
  if (value === null || value === undefined || value === "") return "No determinado";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusPresentation(status) {
  return STATUS_PRESENTATION[status] || STATUS_PRESENTATION.insufficient_data;
}

function clinicalStatusFromSpanish(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ({
    presente: "present",
    ausente: "absent",
    historico: "historical",
    posible: "possible",
    contradictorio: "contradictory",
    "datos insuficientes": "insufficient_data"
  })[normalized] || null;
}

function evidenceRows(evidence = []) {
  if (!evidence.length) return `<p class="pattern-empty">No existe evidencia documental almacenada para este patrón.</p>`;
  return evidence.map((item) => `
    <article class="pattern-evidence">
      <header>
        <strong>${escapeHtml(sourceLabel(item.sourceType))}</strong>
        <span>${escapeHtml(formatDate(item.documentDate || item.sourceDate))}${item.sourceAvailable === false ? " · fuente ya no disponible" : ""}</span>
      </header>
      ${item.excerpt ? `<blockquote>“${escapeHtml(item.excerpt)}”</blockquote>` : `<p>Dato estructurado sin fragmento textual.</p>`}
      <dl>
        <div><dt>Estado</dt><dd>${escapeHtml(item.polarity === "negative" ? "Negado" : item.polarity === "uncertain" ? "Incierto" : "Observado")}</dd></div>
        <div><dt>Tiempo clínico estimado</dt><dd>${escapeHtml(item.estimatedClinicalTime ? formatDate(item.estimatedClinicalTime) : "No determinado")}</dd></div>
        <div><dt>Precisión temporal</dt><dd>${escapeHtml(temporalPrecisionLabel(item.temporalPrecision))}</dd></div>
        <div><dt>Confianza de extracción</dt><dd>${escapeHtml(percent(item.confidence))}</dd></div>
        <div><dt>Regla aplicada</dt><dd>${escapeHtml(item.ruleApplied || "No disponible")}</dd></div>
      </dl>
      ${item.sourceDocumentId ? `<button type="button" class="pattern-link" data-pattern-action="source" data-source-id="${escapeHtml(item.sourceDocumentId)}">Ver fuente</button>` : ""}
    </article>`).join("");
}

function sourceLabel(type) {
  return ({ note: "Nota clínica", history: "Historia clínica", scale: "Escala", interview: "Entrevista", laboratory: "Laboratorio / estudio", treatment: "Tratamiento", other: "Documento clínico" })[type] || "Documento clínico";
}

function temporalPrecisionLabel(value) {
  return ({ exact: "Exacta", day: "Día", approximate: "Aproximada", interval: "Intervalo", historical: "Histórica", unknown: "Desconocida" })[value] || "Desconocida";
}

function observationRows(observations = []) {
  if (!observations.length) return `<p class="pattern-empty">Sin observaciones longitudinales.</p>`;
  return `<ol class="pattern-observation-list">${observations.map((item) => `
    <li>
      <time datetime="${escapeHtml(item.timestamp || "")}">${escapeHtml(formatDate(item.timestamp))}</time>
      <strong>${escapeHtml(statusPresentation(item.status).label)}</strong>
      <span>Confianza de extracción: ${escapeHtml(percent(item.confidence))}</span>
      <span>${item.sourceAvailable === false ? "Fuente ya no disponible" : item.clinicianReviewed ? "Confirmado por médico" : "Pendiente de revisión médica"}</span>
    </li>`).join("")}</ol>`;
}

function patternCard(pattern) {
  const presentation = statusPresentation(pattern.status);
  const latest = pattern.currentState?.effectiveAt || pattern.lastUpdated;
  const instrument = pattern.instruments?.at(-1);
  return `
    <article class="pattern-card tone-${presentation.tone}" data-pattern-id="${escapeHtml(pattern.id)}">
      <header class="pattern-card__header">
        <div><span class="pattern-status-dot" aria-hidden="true"></span><h3>${escapeHtml(pattern.label)}</h3></div>
        <span class="pattern-status">${escapeHtml(presentation.label)}</span>
      </header>
      <dl class="pattern-card__metrics">
        <div><dt>Confianza de extracción</dt><dd>${pattern.observations?.length ? escapeHtml(percent(pattern.confidence)) : "No calculable"}</dd></div>
        <div><dt>Última evidencia</dt><dd>${escapeHtml(latest ? formatDate(latest) : "No disponible")}</dd></div>
        <div><dt>Observaciones</dt><dd>${escapeHtml(pattern.observations?.length || 0)}</dd></div>
        ${instrument ? `<div><dt>Instrumento asociado</dt><dd>${escapeHtml(instrument.abbreviation || instrument.instrumentName)}</dd></div>` : ""}
      </dl>
      <div class="pattern-card__actions">
        <button type="button" data-pattern-action="ask" data-pattern-key="${escapeHtml(pattern.key)}" data-instrument-id="${escapeHtml(instrument?.id || "")}">Preguntar a SOFÍA</button>
        ${pattern.observations?.length ? `<button type="button" data-pattern-action="confirm" data-observation-id="${escapeHtml(pattern.currentState?.sourceObservationId || "")}">Confirmar</button><button type="button" data-pattern-action="correct" data-observation-id="${escapeHtml(pattern.currentState?.sourceObservationId || "")}">Corregir</button>` : ""}
      </div>
      <details class="pattern-detail">
        <summary>Ver evidencia</summary>
        ${evidenceRows(pattern.evidence)}
      </details>
      <details class="pattern-detail">
        <summary>Ver evolución</summary>
        ${observationRows(pattern.observations)}
      </details>
      ${pattern.key === "suicidal_ideation" ? bssSection(pattern.instruments || []) : ""}
    </article>`;
}

function bssStatus(instrument) {
  if (instrument.scoreStatus === "complete") return `<strong>BSS: ${escapeHtml(instrument.rawScore)} / ${escapeHtml(instrument.maximumScore)}</strong><span class="instrument-complete">Cálculo completo</span>`;
  if (instrument.scoreStatus === "partial") return `<strong>BSS: No calculable completamente</strong><span>Suma de reactivos conocidos: ${escapeHtml(instrument.partialSum)}</span>`;
  return `<strong>BSS: No calculable</strong><span>No hay reactivos puntuables suficientes.</span>`;
}

function bssItems(instrument) {
  if (!instrument.itemResults?.length) return `<p class="pattern-empty">No hay detalle de reactivos almacenado. Un total reportado sin reactivos no se reconstruye.</p>`;
  return `<div class="bss-items" role="table" aria-label="Reactivos BSS">
    <div class="bss-item bss-item--header" role="row"><span>Ítem</span><span>Valor</span><span>Estado</span><span>Confianza</span><span>Revisión</span></div>
    ${instrument.itemResults.map((item) => `<details class="bss-item" role="row">
      <summary>
        <span>${escapeHtml(item.itemNumber)}</span><span>${escapeHtml(item.value)}</span><span>Evaluado</span><span>${escapeHtml(percent(item.confidence))}</span><span>${item.clinicianReviewed ? "Médico" : "Pendiente"}</span>
      </summary>
      <div class="bss-item__detail">
        <p><strong>Dato inferido:</strong> ${escapeHtml(item.value)}</p>
        <p><strong>Evidencia:</strong> ${item.evidence ? `“${escapeHtml(item.evidence)}”` : "Sin fragmento textual almacenado"}</p>
        <p><strong>Fuente:</strong> ${escapeHtml(sourceLabel(item.sourceType))} · ${escapeHtml(formatDate(item.sourceDate))}</p>
        <p><strong>Temporalidad:</strong> ${escapeHtml(item.estimatedClinicalTime ? formatDate(item.estimatedClinicalTime) : "No determinada")}</p>
        <p><strong>Regla aplicada:</strong> ${escapeHtml(item.ruleApplied || "No disponible")}</p>
        <button type="button" class="pattern-link" data-pattern-action="review-bss-item" data-instrument-id="${escapeHtml(instrument.id)}" data-item-number="${escapeHtml(item.itemNumber)}" data-item-value="${escapeHtml(item.value)}">Revisar reactivo</button>
      </div>
    </details>`).join("")}
  </div>`;
}

function bssParameters(parameters = []) {
  if (!parameters.length) return `<p class="pattern-empty">No existen parámetros semánticos normalizados almacenados.</p>`;
  return `<dl class="bss-parameters">${parameters.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(displayValue(item.value))}</dd></div>`).join("")}</dl>`;
}

function bssSection(instruments = []) {
  if (!instruments.length) return `<section class="instrument-card"><h4>Escala de Ideación Suicida de Beck</h4><p class="pattern-empty">No existe una evaluación BSS trazable en el perfil.</p></section>`;
  return instruments.map((instrument) => `
    <section class="instrument-card">
      <header><div><span>Escala de Ideación Suicida de Beck${instrument.superseded ? " · versión previa" : ""}${instrument.sourceAvailable === false ? " · fuente ya no disponible" : ""}</span>${bssStatus(instrument)}</div><time>${escapeHtml(formatDate(instrument.timestamp))}</time></header>
      <dl class="instrument-summary">
        <div><dt>Cobertura</dt><dd>${escapeHtml(instrument.coveredItems)} / ${escapeHtml(instrument.requiredItems)} reactivos (${escapeHtml(percent(instrument.coverage))})</dd></div>
        <div><dt>Estado</dt><dd>${instrument.clinicianReviewed ? "Revisado por médico" : "Pendiente de revisión"}</dd></div>
        ${instrument.missingItems?.length ? `<div><dt>Faltantes</dt><dd>${escapeHtml(instrument.missingItems.join(", "))}</dd></div>` : ""}
        ${instrument.scoreStatus === "complete" ? `<div><dt>BSS normalizado</dt><dd>${escapeHtml(Number(instrument.normalizedScore).toFixed(3))} (BSS/38; no es probabilidad)</dd></div>` : ""}
      </dl>
      ${instrument.clinicianReviewed ? "" : `<div class="pattern-card__actions"><button type="button" data-pattern-action="confirm-bss" data-instrument-id="${escapeHtml(instrument.id)}">Confirmar cálculo</button></div>`}
      <details class="pattern-detail"><summary>Ver cómo se calculó</summary>${bssItems(instrument)}</details>
      <details class="pattern-detail"><summary>Parámetros utilizados</summary>${bssParameters(instrument.parameters)}</details>
    </section>`).join("");
}

function variableTable(variables = []) {
  if (!variables.length) return `<p class="pattern-empty">No se extrajeron variables estructuradas.</p>`;
  return `<div class="pattern-table-wrap"><table class="pattern-table"><thead><tr><th>Variable</th><th>Dominio</th><th>Valor</th><th>Fecha</th><th>Confianza de extracción</th><th>Fuente</th></tr></thead><tbody>${variables.map((item) => `<tr>
    <td>${escapeHtml(String(item.canonicalName || item.variableId).replaceAll("_", " "))}</td>
    <td>${escapeHtml(domainLabel(item.domain))}</td>
    <td>${escapeHtml(displayValue(item.displayValue ?? item.value))}</td>
    <td>${escapeHtml(formatDate(item.observedAt))}</td>
    <td>${escapeHtml(percent(item.confidence))}</td>
    <td>${escapeHtml(sourceLabelForRecord(item.provenance?.sourceRecordType))}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function domainLabel(domain) {
  return ({ demographics: "Demografía", history: "Antecedentes", social: "Social", diagnosis: "Diagnósticos", treatment: "Tratamientos", symptoms: "Síntomas", mental_exam: "Examen mental", scales: "Escalas", laboratories: "Laboratorios", vitals: "Signos vitales", events: "Eventos" })[domain] || String(domain || "Otro");
}

function sourceLabelForRecord(recordType) {
  return ({
    patientProfile: "Perfil del paciente",
    notasMedicas: "Notas médicas",
    notas: "Notas clínicas",
    notasClinicas: "Notas clínicas",
    notasRapidas: "Notas rápidas",
    notasFlotantes: "Notas flotantes",
    documentosImportados: "Documentos importados",
    historiaClinica: "Historia clínica",
    escalasAplicadas: "Escalas aplicadas",
    resultadosEscalas: "Resultados de escalas",
    interconsultas: "Interconsultas",
    laboratorios: "Laboratorios",
    estudios: "Estudios",
    tratamientos: "Tratamientos",
    indicaciones: "Indicaciones",
    recetas: "Recetas"
  })[recordType] || String(recordType || "No determinada").replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function featureLabel(feature) {
  return ({
    suicidalIdeation: "Ideación suicida",
    suicidalIdeationBSS: "Ideación suicida · BSS normalizada",
    treatmentAbandonment: "Suspensión o abandono de tratamiento",
    substanceUse: "Uso de sustancias",
    inadequateFamilySupport: "Soporte familiar inadecuado",
    chronicMedicalCondition: "Enfermedad médica crónica"
  })[feature] || String(feature || "Variable sin etiqueta").replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2");
}

function vectorTable(features = []) {
  if (!features.length) return `<p class="pattern-empty">No hay variables matemáticas disponibles.</p>`;
  return `<div class="pattern-table-wrap"><table class="pattern-table"><thead><tr><th>Dimensión</th><th>Valor bruto</th><th>Valor normalizado</th><th>Cobertura</th><th>Fecha</th></tr></thead><tbody>${features.map((item) => `<tr>
    <td><strong>${escapeHtml(featureLabel(item.feature))}</strong><small>${escapeHtml(item.meaning || "")}</small></td>
    <td>${escapeHtml(displayValue(item.rawValue))}</td><td>${escapeHtml(item.normalizedValue === null || item.normalizedValue === undefined ? "No disponible" : Number(item.normalizedValue).toFixed(3))}</td>
    <td>${escapeHtml(percent(item.coverage))}</td><td>${escapeHtml(formatDate(item.timestamp))}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function semanticVariable(profile) {
  const pattern = profile.patterns?.find((item) => item.key === "suicidal_ideation");
  const instrument = (profile.instruments || []).filter((item) => item.superseded !== true && item.sourceAvailable !== false && item.scoreStatus === "complete").at(-1);
  const attempts = (profile.clinicalVariables || []).filter((item) => item.variableId === "suicide_attempt" && item.value === true);
  const parameter = (key) => instrument?.parameters?.find((item) => item.key === key)?.value;
  return `<div class="semantic-variable">
    <div><span class="pattern-eyebrow">Variable semántica</span><h3>Ideación suicida</h3><p>Estado derivado: <strong>${escapeHtml(statusPresentation(pattern?.status).label)}</strong></p></div>
    <dl>
      <div><dt>Fuente cuantitativa principal</dt><dd>${instrument ? "BSS" : "No disponible"}</dd></div>
      <div><dt>Valor</dt><dd>${instrument ? `${escapeHtml(Number(instrument.normalizedScore).toFixed(3))} (BSS/38)` : "No disponible"}</dd></div>
      <div><dt>Intentos previos</dt><dd>${attempts.length ? "Documentados" : "No determinados"}</dd></div>
      <div><dt>Plan actual</dt><dd>${escapeHtml(displayValue(parameter("plan")))}</dd></div>
      <div><dt>Acceso al método</dt><dd>${escapeHtml(displayValue(parameter("methodAccess")))}</dd></div>
      <div><dt>Conducta preparatoria</dt><dd>${escapeHtml(displayValue(parameter("preparatoryBehavior")))}</dd></div>
    </dl>
    <p>Cadena trazable: evidencia documental → patrón semántico → instrumento BSS → variable matemática. El valor normalizado no es una probabilidad de suicidio.</p>
  </div>`;
}

function bssChart(instruments = []) {
  const points = instruments.filter((item) => item.superseded !== true && item.sourceAvailable !== false && item.scoreStatus === "complete" && Number.isFinite(Number(item.rawScore)));
  if (points.length < 2) return `<p class="pattern-empty">Se requieren al menos dos BSS completas para mostrar evolución.</p>`;
  const width = 560;
  const height = 190;
  const padding = 34;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);
  const coordinates = points.map((item, index) => ({
    ...item,
    x: padding + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: padding + chartHeight - (Number(item.rawScore) / 38) * chartHeight
  }));
  return `<div class="bss-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución longitudinal de puntajes BSS completos">
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" />
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
    <polyline points="${coordinates.map((item) => `${item.x},${item.y}`).join(" ")}" />
    ${coordinates.map((item) => `<g><circle cx="${item.x}" cy="${item.y}" r="5"><title>${escapeHtml(formatDate(item.timestamp))}: BSS ${escapeHtml(item.rawScore)}/38, cobertura ${escapeHtml(percent(item.coverage))}</title></circle><text x="${item.x}" y="${item.y - 10}" text-anchor="middle">${escapeHtml(item.rawScore)}</text></g>`).join("")}
  </svg><ol>${coordinates.map((item) => `<li><strong>${escapeHtml(formatDate(item.timestamp))}:</strong> ${escapeHtml(item.rawScore)}/38 · cobertura ${escapeHtml(percent(item.coverage))} · ${item.clinicianReviewed ? "revisado" : "pendiente de revisión"}</li>`).join("")}</ol></div>`;
}

function summary(profile) {
  const patterns = profile.patterns || [];
  const active = patterns.filter((item) => item.status === "present").length;
  const historical = patterns.filter((item) => item.status === "historical").length;
  const incomplete = patterns.filter((item) => ["possible", "contradictory", "insufficient_data"].includes(item.status)).length;
  return `<div class="pattern-summary"><span><strong>${active}</strong> presentes</span><span><strong>${historical}</strong> históricos</span><span><strong>${incomplete}</strong> incompletos / por aclarar</span><span><strong>${profile.dataQuality?.observationCount || 0}</strong> observaciones</span></div>`;
}

function bindActions(container, response, options) {
  renderControllers.get(container)?.abort();
  const controller = new AbortController();
  renderControllers.set(container, controller);
  container.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pattern-action]");
    if (!button || !container.contains(button)) return;
    const action = button.dataset.patternAction;
    const pattern = response.profile.patterns?.find((item) => item.key === button.dataset.patternKey || item.currentState?.sourceObservationId === button.dataset.observationId);
    if (action === "ask") await options.onAsk?.({ patientId: response.patient?.id || response.profile.patientId, patternId: pattern?.id || button.dataset.patternKey, instrumentId: button.dataset.instrumentId || null, contextType: "clinical_pattern" });
    else if (action === "confirm") await options.onConfirm?.({ patientId: response.profile.patientId, observationId: button.dataset.observationId, pattern });
    else if (action === "correct") await options.onCorrect?.({ patientId: response.profile.patientId, observationId: button.dataset.observationId, pattern });
    else if (action === "confirm-bss") await options.onConfirmInstrument?.({ patientId: response.profile.patientId, instrumentId: button.dataset.instrumentId });
    else if (action === "review-bss-item") await options.onReviewBssItem?.({ patientId: response.profile.patientId, instrumentId: button.dataset.instrumentId, itemNumber: Number(button.dataset.itemNumber), value: Number(button.dataset.itemValue) });
    else if (action === "source") await options.onOpenSource?.({ patientId: response.profile.patientId, sourceDocumentId: button.dataset.sourceId });
    else if (action === "refresh") await options.onRefresh?.({ patientId: response.profile.patientId });
  }, { signal: controller.signal });
}

export function renderPatientPatternProfile(container, response = {}, options = {}) {
  if (!container) return;
  const profile = response.profile;
  if (!profile) {
    container.innerHTML = `<p class="pattern-error">No se recibió un PatientPatternProfile válido.</p>`;
    return;
  }
  const patient = response.patient || {};
  container.innerHTML = `
    <section class="patient-pattern-dashboard">
      <header class="pattern-profile-header">
        <div><span class="pattern-eyebrow">Paciente seleccionado</span><h2>${escapeHtml(patient.label || "Paciente autorizado")}</h2><p>${patient.age !== null && patient.age !== undefined ? `${escapeHtml(patient.age)} años · ` : ""}Expediente: ${escapeHtml(patient.recordNumber || "No disponible")}</p></div>
        <div class="pattern-analysis-state"><span>${escapeHtml(ANALYSIS_STATE_LABELS[profile.analysisState] || profile.analysisState)}</span><time>${escapeHtml(formatDate(profile.updatedAt, true))}</time><button type="button" data-pattern-action="refresh">Recalcular</button></div>
      </header>
      ${summary(profile)}
      <section class="pattern-dashboard-section"><div class="pattern-section-title"><div><span>Patrones actuales</span><h2>Patrones clínicos detectados</h2></div><p>La confianza mostrada corresponde a extracción semántica, no a riesgo.</p></div><div class="pattern-card-grid">${(profile.patterns || []).map(patternCard).join("")}</div></section>
      <section class="pattern-dashboard-section"><div class="pattern-section-title"><div><span>Evidencia → patrón → variable</span><h2>Representación semántica y matemática</h2></div><p>Permite recorrer el dato clínico sin destruir su fuente original.</p></div>${semanticVariable(profile)}</section>
      <section class="pattern-dashboard-section"><div class="pattern-section-title"><div><span>Trayectoria</span><h2>BSS longitudinal</h2></div><p>Comparación descriptiva de evaluaciones completas y temporalmente registradas.</p></div>${bssChart(profile.instruments || [])}</section>
      <details class="pattern-dashboard-section pattern-collapsible"><summary>Variables clínicas estructuradas (${escapeHtml(profile.clinicalVariables?.length || 0)})</summary>${variableTable(profile.clinicalVariables)}</details>
      <details class="pattern-dashboard-section pattern-collapsible"><summary>Variables matemáticas para el vector (${escapeHtml(profile.quantitativeFeatures?.length || 0)})</summary>${vectorTable(profile.quantitativeFeatures)}</details>
      <footer class="pattern-clinical-notice">${escapeHtml(profile.notice || "Análisis de apoyo clínico. No sustituye el juicio profesional.")}</footer>
    </section>`;
  bindActions(container, response, options);
}

export function renderPatientPatternError(container, error) {
  if (!container) return;
  const code = String(error?.code || "").toLowerCase();
  const message = code.includes("permission-denied")
    ? "No tienes autorización para consultar este expediente."
    : code.includes("unauthenticated")
      ? "Tu sesión ya no está activa. Inicia sesión nuevamente."
      : code.includes("unavailable")
        ? "El servicio de análisis no está disponible temporalmente."
        : "No se pudo cargar el perfil de patrones. Intenta nuevamente más tarde.";
  container.innerHTML = `<p class="pattern-error">${escapeHtml(message)}</p>`;
}

export { ANALYSIS_STATE_LABELS, STATUS_PRESENTATION, clinicalStatusFromSpanish, escapeHtml, formatDate };
