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
        <button id="btnConstruirIndiceSemanticoAdmin" type="button">Construir índice semántico</button>
      </div>
    </div>
    <p id="estadoConocimientoSofiaAdmin">Cargando conocimiento agregado…</p>
    <p id="estadoIndiceSemanticoSofiaAdmin" class="clinical-embedding-status" aria-live="polite">Índice semántico pendiente de consulta.</p>
    <p class="clinical-knowledge-caution"><strong>Lectura exploratoria:</strong> las interpretaciones propuestas describen asociaciones observadas en datos desidentificados. Las categorías de magnitud son operativas y dependen del contexto. No implican causalidad, no predicen a una persona y no sustituyen el juicio profesional.</p>
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

  let embeddingJobId = null;
  const rebuildEmbeddings = async () => {
    const status = section.querySelector("#estadoIndiceSemanticoSofiaAdmin");
    const rebuildButton = section.querySelector("#btnConstruirIndiceSemanticoAdmin");
    rebuildButton.disabled = true;
    rebuildButton.textContent = embeddingJobId ? "Continuando índice…" : "Construyendo índice…";
    status.textContent = "Indexando archivos clínicos desidentificados por lotes. Puedes seguir usando el resto del panel.";
    try {
      const functions = await obtenerFunctions();
      const rebuildCallable = httpsCallable(functions, "rebuildClinicalEmbeddingIndexAdmin", { timeout: 540000 });
      let result;
      do {
        result = (await rebuildCallable(embeddingJobId ? { jobId: embeddingJobId } : {})).data || {};
        embeddingJobId = result.jobId || embeddingJobId;
        const totals = result.totals || {};
        status.textContent = `Índice semántico: ${totals.processedRecords || 0} archivos revisados, ${totals.indexedRecords || 0} indexados, ${totals.skippedRecords || 0} sin cambios y ${totals.failedRecords || 0} con error.`;
        console.debug("[SOFÍA Knowledge] Lote semántico procesado", {
          status: result.status,
          hasMore: result.hasMore,
          processedRecords: totals.processedRecords || 0,
          indexedRecords: totals.indexedRecords || 0,
          failedRecords: totals.failedRecords || 0,
          directIdentifiersIncluded: false
        });
      } while (result?.hasMore === true);
      embeddingJobId = null;
      await load();
    } catch (error) {
      console.error("[SOFÍA Knowledge] No se pudo continuar el índice semántico", error);
      status.textContent = "La construcción se detuvo. Pulsa nuevamente para continuar el trabajo por lotes.";
    } finally {
      rebuildButton.disabled = false;
      rebuildButton.textContent = embeddingJobId ? "Continuar índice semántico" : "Construir índice semántico";
    }
  };

  section.querySelector("#btnActualizarConocimientoSofiaAdmin").addEventListener("click", load);
  section.querySelector("#btnRecalcularMatricesSofiaAdmin").addEventListener("click", rebuild);
  section.querySelector("#btnConstruirIndiceSemanticoAdmin").addEventListener("click", rebuildEmbeddings);
  await load();
}

function matrixStatusText(status = {}) {
  if (!status.generatedAt) return "Las matrices todavía no se han generado.";
  const date = new Date(status.generatedAt);
  const suffix = Number.isNaN(date.getTime()) ? status.generatedAt : date.toLocaleString("es-MX");
  if (status.versionOutdated) {
    return `Matrices disponibles, pero generadas con el motor ${status.matrixEngineVersion || "anterior"}. Recalcula para aplicar el motor ${status.currentMatrixEngineVersion || "actual"} · ${suffix}.`;
  }
  return status.stale
    ? `Matrices pendientes de actualización desde ${suffix}.`
    : `Matrices vigentes para ${status.cohortSize || 0} perfiles desidentificados · ${suffix}.`;
}

function renderKnowledge(section, data) {
  const matrices = data.matrices || {};
  const embeddings = data.embeddingKnowledge || {};
  const embeddingStatus = embeddings.status || {};
  const matrixAssociations = Object.values(matrices).reduce((sum, matrix) => sum + (matrix?.associations?.length || 0), 0);
  section.querySelector("#resumenConocimientoSofiaAdmin").innerHTML = [
    ["Variables", data.variables?.length || 0],
    ["Patrones acumulados", data.patterns?.length || 0],
    ["Matrices", Object.values(matrices).filter(Boolean).length],
    ["Asociaciones mostradas", matrixAssociations],
    ["Probabilidades", data.probabilities?.length || 0],
    ["Fuentes", data.evidence?.length || 0],
    ["Archivos semánticos", embeddingStatus.indexedRecords || 0],
    ["Fragmentos vectoriales", embeddingStatus.indexedFragments || 0],
    ["Relaciones semánticas", embeddings.relations?.length || 0]
  ].map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("");

  section.querySelector("#estadoIndiceSemanticoSofiaAdmin").textContent = embeddingStatusText(embeddings);

  const mixed = matrices.mixed?.associations || [];
  const documentation = matrices.documentation?.associations || [];
  const temporal = matrices.temporal?.associations || [];
  section.querySelector("#tablasConocimientoSofiaAdmin").innerHTML = `
    <h3>Índice semántico de archivos clínicos</h3>
    <p>Representa contenido desidentificado mediante embeddings generados en backend. El navegador recibe métricas agregadas: no recibe vectores, texto clínico, identidad ni filas por paciente.</p>
    <div class="clinical-embedding-metadata">
      <span><strong>Modelo</strong>${embeddingStatus.embeddingModel || "No inicializado"}</span>
      <span><strong>Dimensiones</strong>${embeddingStatus.embeddingDimensions || "—"}</span>
      <span><strong>Versión del motor</strong>${embeddingStatus.embeddingEngineVersion || "—"}</span>
      <span><strong>Índice vectorial</strong>${embeddingIndexLabel(embeddingStatus.relationIndexStatus)}</span>
      <span><strong>Texto clínico persistido</strong>No</span>
      <span><strong>Vectores expuestos al navegador</strong>No</span>
    </div>
    <h3>Cobertura del índice por fuente</h3>
    ${rows(embeddings.sources, [
      { label: "Fuente clínica", value: (item) => item.sourceLabel || humanizeTechnical(item.sourceCollection) },
      { label: "Dominio", value: (item) => humanizeTechnical(item.sourceDomain) },
      { label: "Archivos indexados", value: (item) => item.indexedRecords || 0 },
      { label: "Fragmentos", value: (item) => item.indexedFragments || 0 },
      { label: "Errores", value: (item) => item.failedRecords || 0 },
      { label: "Última actualización", value: (item) => formatDateTime(item.lastProcessedAt) }
    ])}
    <h3>Relaciones semánticas entre archivos</h3>
    <p>Solo se muestran afinidades repetidas en al menos ${embeddings.privacy?.minimumCrossPatientPairs || 3} pares de pacientes desidentificados. La similitud no es una probabilidad ni demuestra causalidad.</p>
    ${rows(embeddings.relations, [
      { label: "Fuente A", value: (item) => item.sourceLabelA || humanizeTechnical(item.sourceCollectionA) },
      { label: "Fuente B", value: (item) => item.sourceLabelB || humanizeTechnical(item.sourceCollectionB) },
      { label: "Dominios", value: (item) => `${humanizeTechnical(item.sourceDomainA)} ↔ ${humanizeTechnical(item.sourceDomainB)}` },
      { label: "Pares desidentificados", value: (item) => item.patientPairCount || 0 },
      { label: "Coincidencias", value: (item) => item.relationCount || 0 },
      { label: "Similitud coseno media", value: (item) => formatNumber(item.meanSimilarity, 3) },
      { label: "Rango", value: (item) => `${formatNumber(item.minimumSimilarity, 3)} a ${formatNumber(item.maximumSimilarity, 3)}` },
      { label: "Interpretación posible", className: "clinical-knowledge-interpretation", value: (item) => item.possibleInterpretationEs || "Relación exploratoria pendiente de interpretación." },
      { label: "Estado", value: (item) => evidenceLabel(item.evidenceStatus) }
    ])}
    <h3>Matriz mixta de variables</h3>
    <p>Selecciona el método según los tipos de datos. Incluye magnitud, cobertura, incertidumbre y corrección de Benjamini–Hochberg para comparaciones múltiples.</p>
    ${rows(mixed, associationColumns())}
    <h3>Matriz de presencia y documentación</h3>
    <p>Busca qué variables suelen documentarse juntas o ausentarse de forma sistemática.</p>
    ${rows(documentation, associationColumns())}
    <h3>Matriz de secuencias temporales</h3>
    <p>Secuencias observadas en múltiples pacientes; son asociaciones temporales y no implican causalidad.</p>
    ${rows(temporal, [
      { label: "Variable inicial", value: (item) => variableLabel(item, "A") },
      { label: "Variable posterior", value: (item) => variableLabel(item, "B") },
      { label: "Soporte", value: (item) => `${item.numerator || 0}/${item.denominator || 0}` },
      { label: "Probabilidad empírica", value: (item) => formatProbability(item) },
      { label: "Frecuencia basal", value: (item) => formatPercentage(item.baselineProbability) },
      { label: "Multiplicador basal", value: (item) => formatNumber(item.lift, 2) },
      { label: "Interpretación posible", className: "clinical-knowledge-interpretation", value: (item) => interpretationLabel(item) },
      { label: "Estado", value: (item) => item.evidenceStatusLabel || evidenceLabel(item.evidenceStatus) }
    ])}
    <h3>Variables registradas</h3>
    ${rows(data.variables, [
      { label: "Variable", value: (item) => item.variableLabel || humanizeTechnical(item.canonicalName || item.variableId) },
      { label: "Dominio", value: (item) => item.domainLabel || humanizeTechnical(item.domain) },
      { label: "Tipo estadístico", value: (item) => item.statisticalTypeLabel || humanizeTechnical(item.statisticalType) },
      { label: "Unidad", value: (item) => item.unitLabel || "Sin unidad" },
      { label: "Observaciones", value: (item) => item.observations },
      { label: "Primera observación", value: (item) => item.firstObservedAt },
      { label: "Última observación", value: (item) => item.lastObservedAt }
    ])}
    <h3>Fuentes metodológicas</h3>
    ${rows(data.evidence, [
      { label: "Referencia", value: (item) => `${item.authors || "Autor institucional"}${item.year ? ` (${item.year})` : ""}` },
      { label: "Título", value: (item) => item.displayTitle || item.titleEs || item.title },
      { label: "Tipo", value: (item) => item.evidenceTypeLabel || humanizeTechnical(item.evidenceType) },
      { label: "Ámbito", value: (item) => item.domainLabel || humanizeTechnical(item.domain) }
    ])}
    <h3>Versiones analíticas</h3>
    ${rows(data.versionsEs || [], [
      { label: "Componente", value: (item) => item.componentLabel || humanizeTechnical(item.component) },
      { label: "Versión", value: (item) => item.version }
    ])}`;
}

function embeddingStatusText(embeddingKnowledge = {}) {
  const status = embeddingKnowledge.status || {};
  if (status.status === "not_initialized") return "El índice semántico aún no se ha construido.";
  const date = formatDateTime(status.lastProcessedAt);
  const failures = Number(status.failedRecords) || 0;
  const relationState = embeddingIndexLabel(status.relationIndexStatus);
  return `Índice semántico: ${status.indexedRecords || 0} archivos y ${status.indexedFragments || 0} fragmentos · relaciones: ${relationState} · errores: ${failures} · última actualización: ${date}.`;
}

function embeddingIndexLabel(value) {
  return ({
    ready: "Disponible",
    pending_vector_index: "Índice vectorial en construcción",
    degraded: "Disponible con incidencias",
    not_initialized: "No inicializado"
  })[value] || humanizeTechnical(value);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-MX");
}

function associationColumns() {
  return [
    { label: "Variable A", value: (item) => variableLabel(item, "A") },
    { label: "Variable B", value: (item) => variableLabel(item, "B") },
    { label: "Dominios", value: (item) => `${item.domainALabel || humanizeTechnical(item.domainA)} ↔ ${item.domainBLabel || humanizeTechnical(item.domainB)}` },
    { label: "Método", value: (item) => item.methodLabel || humanizeTechnical(item.method) },
    { label: "Medidas", value: (item) => effectLabel(item) },
    { label: "Magnitud y dirección", value: (item) => `${item.effectMagnitudeLabel || "No estimable"} · ${item.directionLabel || humanizeTechnical(item.direction)}` },
    { label: "Muestra", value: (item) => sampleLabel(item) },
    { label: "IC", value: (item) => correlationIntervalLabel(item) },
    { label: "q (tasa de falsos descubrimientos)", value: (item) => formatNumber(item.adjustedPValue, 4) },
    { label: "Interpretación posible", className: "clinical-knowledge-interpretation", value: (item) => interpretationLabel(item) },
    { label: "Estado", value: (item) => item.evidenceStatusLabel || evidenceLabel(item.evidenceStatus) }
  ];
}

function rows(items, columns) {
  return `<div class="table-scroll"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${(items || []).slice(0, 100).map((item) => `<tr>${columns.map((column) => `<td${column.className ? ` class="${escapeHtml(column.className)}"` : ""}>${escapeHtml(column.value(item))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${columns.length}">Sin datos agregados suficientes.</td></tr>`}</tbody></table></div>`;
}

function formatNumber(value, digits) {
  return isFiniteValue(value) ? Number(value).toFixed(digits) : "—";
}

function formatProbability(item) {
  if (!isFiniteValue(item.probability)) return "Evidencia insuficiente";
  const percentage = Math.round(Number(item.probability) * 100);
  const interval = isFiniteValue(item.ciLower) && isFiniteValue(item.ciUpper)
    ? ` · IC ${Math.round(item.ciLower * 100)}–${Math.round(item.ciUpper * 100)}%`
    : "";
  return `${percentage}% (n=${item.numerator}/${item.denominator})${interval}`;
}

function formatPercentage(value, digits = 0) {
  return isFiniteValue(value) ? `${(Number(value) * 100).toFixed(digits).replace(/\.0+$/, "")}%` : "—";
}

function isFiniteValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function variableLabel(item, side) {
  const raw = item[`canonicalName${side}`] || item[`variable${side}`];
  const legacyLabels = {
    diagnosis: "diagnóstico",
    treatment: "tratamiento",
    mood: "estado de ánimo",
    anxiety: "ansiedad",
    insomnia: "insomnio",
    suicidal_ideation: "ideación suicida",
    agitation: "agitación",
    cognition: "cognición",
    improvement: "mejoría",
    relapse: "recaída",
    treatment_suspension: "suspensión del tratamiento",
    substance_use: "consumo de sustancias",
    suicide_attempt: "intento suicida",
    hospitalization: "hospitalización",
    readmission: "reingreso"
  };
  return item[`variable${side}Label`] || legacyLabels[raw] || humanizeTechnical(raw);
}

function effectLabel(item) {
  const primary = `${item.effectMetricLabel || humanizeTechnical(item.effectMetric) || "Medida"}: ${formatNumber(item.effectSize, 3)}`;
  if (!isFiniteValue(item.secondaryEffectSize)) return primary;
  return `${primary} · rho de Spearman: ${formatNumber(item.secondaryEffectSize, 3)}`;
}

function sampleLabel(item) {
  const sample = Number(item.sampleSize);
  const cohort = Number(item.cohortSize);
  if (!isFiniteValue(item.sampleSize)) return "—";
  if (!isFiniteValue(item.cohortSize) || cohort <= 0) return `n=${sample}`;
  return `n=${sample}/${cohort} · ${formatPercentage(item.coverageRate ?? (sample / cohort), 1)}`;
}

function correlationIntervalLabel(item) {
  if (!isFiniteValue(item.ciLower) || !isFiniteValue(item.ciUpper)) return "No estimado";
  return `${formatPercentage(item.confidenceLevel || 0.95)}: ${formatNumber(item.ciLower, 3)} a ${formatNumber(item.ciUpper, 3)}`;
}

function interpretationLabel(item) {
  if (item.possibleInterpretationEs) return item.possibleInterpretationEs;
  const a = variableLabel(item, "A");
  const b = variableLabel(item, "B");
  if (item.matrixType === "temporal_sequences") {
    return `Se observó ${b} después de ${a} en ${formatProbability(item)}. Es una secuencia observacional; no implica causalidad ni predicción individual.`;
  }
  return `Se observó una asociación entre ${a} y ${b} con n=${item.sampleSize || "no disponible"}. Es un resultado exploratorio; no implica causalidad ni debe usarse por sí solo para decisiones clínicas.`;
}

function humanizeTechnical(value) {
  const exact = {
    demographics: "Demográficos",
    history: "Antecedentes",
    diagnosis: "Diagnósticos",
    treatment: "Tratamientos",
    symptoms: "Síntomas",
    scales: "Escalas",
    laboratories: "Laboratorios",
    vitals: "Signos vitales",
    events: "Eventos",
    documentation: "Documentación",
    platform_usage: "Uso de la plataforma",
    perfil_clinico: "Perfil clínico",
    documentacion: "Documentación",
    antecedentes: "Antecedentes",
    tratamientos: "Tratamientos",
    estudios: "Estudios",
    laboratorios: "Laboratorios",
    signos_vitales: "Signos vitales",
    escalas: "Escalas",
    rehabilitacion: "Rehabilitación",
    eventos: "Eventos",
    registered_sex: "sexo registrado",
    suicidal_ideation: "ideación suicida",
    treatment_suspension: "suspensión del tratamiento",
    substance_use: "consumo de sustancias",
    suicide_attempt: "intento suicida",
    improvement: "mejoría",
    hospitalization: "hospitalización",
    mood: "estado de ánimo",
    anxiety: "ansiedad",
    agitation: "agitación",
    cognition: "cognición"
  };
  const text = String(value || "").trim();
  if (!text) return "—";
  if (exact[text]) return exact[text];
  return text
    .replace(/([a-záéíóúñ])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\bdiagnostico\b/gi, "diagnóstico")
    .replace(/\bideacion\b/gi, "ideación")
    .replace(/\bsuspension\b/gi, "suspensión")
    .replace(/\bobservaciones\b/gi, "observaciones")
    .replace(/\bobservacion\b/gi, "observación")
    .replace(/\bultimo\b/gi, "último")
    .replace(/\banimo\b/gi, "ánimo");
}

function evidenceLabel(value) {
  return ({
    screened_candidate: "Candidato tras corrección",
    exploratory_not_confirmed: "Exploratorio; no confirmado",
    effect_below_threshold: "Efecto bajo",
    observational_ready: "Observación suficiente",
    insufficient_evidence: "Evidencia insuficiente",
    privacy_suppressed: "Oculto por privacidad"
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
