import { FIELD_RULES, NOTE_TYPE_RULES } from "../../importacionDocx/docxImportConfig.js";
import { construirNombreCompletoPaciente } from "../../../utils/nombresPacientes.js";
import { parseMedicationSchedules } from "../parsing/clinicalCandidateParser.js?v=20260804-duplicate-diagnosis-v1";
import { buildPatientMatchExplanation, normalizeRecordNumber } from "../parsing/patientDuplicateMatcher.js";

let root = null;

function fileSize(bytes = 0) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function option(value, label, selected = false) {
  return `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatMedicationSchedule(schedule = []) {
  const quantityLabel = (value) => ({ 0.25: "¼", 0.5: "½", 0.75: "¾" }[value] || value);
  return Array.isArray(schedule) && schedule.length
    ? schedule.map((item) => `${item.time}${item.quantity != null ? ` · ${quantityLabel(item.quantity)} ${item.administrationUnit || ""}` : ""}`).join("; ")
    : "";
}

function debugEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("cognicion.debug.patientTransfer") === "1";
}

function fieldStatus(field) {
  if (!field) return "No encontrado";
  if (field.conflict) return "Conflicto";
  if (field.sourceLocation?.sourceType === "table") return "Detectado desde tabla";
  return "Detectado desde encabezado";
}

function ensureRoot() {
  if (root) return root;
  root = document.createElement("div");
  root.className = "patient-transfer-modal";
  root.innerHTML = `
    <section class="patient-transfer-panel" role="dialog" aria-modal="true" aria-labelledby="patientTransferTitle">
      <header class="patient-transfer-header">
        <div>
          <p>Importacion documental</p>
          <h2 id="patientTransferTitle">Importar pacientes y notas externas</h2>
          <span>Cargue notas clínicas externas para crear pacientes nuevos o agregar notas a pacientes existentes.</span>
          <small>La informacion detectada debera revisarse antes de guardarse.</small>
        </div>
        <button type="button" data-transfer-close aria-label="Cerrar">Cerrar</button>
      </header>
      <div class="patient-transfer-body">
        <div class="patient-transfer-dropzone" data-transfer-dropzone>
          <strong>Arrastre uno o varios DOCX</strong>
          <span>Tambien puede seleccionarlos desde su equipo.</span>
          <button type="button" data-transfer-select>Seleccionar archivos</button>
          <input id="patientTransferInput" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden>
        </div>
        <div class="patient-transfer-progress">
          <div><span data-transfer-status>Esperando documentos...</span><strong data-transfer-count>0 archivos</strong></div>
          <progress value="0" max="100" data-transfer-progress></progress>
        </div>
        <div class="patient-transfer-error" data-transfer-error hidden></div>
        <div class="patient-transfer-file-list" data-transfer-files></div>
        <div class="patient-transfer-review" data-transfer-review></div>
        <div class="patient-transfer-actions">
          <button type="button" data-transfer-cancel>Cancelar</button>
          <button type="button" data-transfer-analyze>Analizar documentos</button>
          <button type="button" data-transfer-save disabled>Confirmar traspaso</button>
        </div>
      </div>
    </section>`;
  document.body.appendChild(root);
  return root;
}

export function openPatientTransferView() {
  ensureRoot().classList.add("abierto");
}

export function closePatientTransferView() {
  root?.classList.remove("abierto");
}

export function getPatientTransferRoot() {
  return ensureRoot();
}

export function setPatientTransferMessage(message = "", progress = 0) {
  const modal = ensureRoot();
  modal.querySelector("[data-transfer-status]").textContent = message;
  modal.querySelector("[data-transfer-progress]").value = progress;
}

export function setPatientTransferVisualStatus(status = "idle") {
  ensureRoot().dataset.transferStatus = status;
}

export function showPatientTransferError(message = "") {
  const box = ensureRoot().querySelector("[data-transfer-error]");
  box.hidden = !message;
  box.textContent = message;
}

export function setTransferSavingState(isSaving = false) {
  const modal = ensureRoot();
  modal.dataset.saving = isSaving ? "true" : "false";
  modal.querySelector("[data-transfer-save]").disabled = isSaving;
  modal.querySelector("[data-transfer-analyze]").disabled = isSaving;
  modal.querySelector("[data-transfer-select]").disabled = isSaving;
  modal.querySelectorAll("[data-transfer-remove-file]").forEach((button) => {
    button.disabled = isSaving;
  });
  modal.querySelectorAll("[data-transfer-file-multiple-mode], [data-transfer-review-multiple-mode]").forEach((control) => {
    control.disabled = isSaving;
  });
}

export function isTransferSaving() {
  return ensureRoot().dataset.saving === "true";
}

function renderMultipleNotesModeOptions({ documentId, mode = "auto", context = "file", disabled = false }) {
  const normalizedMode = ["auto", "single", "multiple"].includes(mode) ? mode : "auto";
  const attribute = context === "review" ? "data-transfer-review-multiple-mode" : "data-transfer-file-multiple-mode";
  const name = `transfer-${context}-multiple-mode-${documentId}`;
  return `
    <div class="patient-transfer-file-mode-options" role="radiogroup" aria-label="Tipo de contenido del documento">
      <label><input type="radio" name="${name}" value="auto" ${attribute}="${documentId}" ${normalizedMode === "auto" ? "checked" : ""} ${disabled ? "disabled" : ""}> Detectar automáticamente</label>
      <label><input type="radio" name="${name}" value="single" ${attribute}="${documentId}" ${normalizedMode === "single" ? "checked" : ""} ${disabled ? "disabled" : ""}> Una sola nota</label>
      <label><input type="radio" name="${name}" value="multiple" ${attribute}="${documentId}" ${normalizedMode === "multiple" ? "checked" : ""} ${disabled ? "disabled" : ""}> Varias notas</label>
    </div>`;
}

export function renderTransferFiles(files = []) {
  const modal = ensureRoot();
  modal.querySelector("[data-transfer-count]").textContent = `${files.length} archivos`;
  modal.querySelector("[data-transfer-files]").innerHTML = files.length ? files.map((item) => {
    const modeHelpId = `transfer-file-mode-help-${item.id}`;
    const modeLocked = ["validating", "extracting", "analyzing"].includes(item.status);
    return `
    <article class="patient-transfer-file ${item.status || ""}" data-transfer-file-card="${item.id}">
      <div class="patient-transfer-file-main">
        <strong>${escapeHtml(item.file.name)}</strong>
        <span>${fileSize(item.file.size)} · ${escapeHtml(item.statusLabel || "Pendiente")}</span>
        ${item.error ? `<small>${escapeHtml(item.error)}</small>` : ""}
        <fieldset class="patient-transfer-file-mode" aria-describedby="${modeHelpId}">
          <legend>¿Este archivo contiene más de una nota?</legend>
          ${renderMultipleNotesModeOptions({ documentId: item.id, mode: item.multipleNotesMode, disabled: modeLocked })}
          <small id="${modeHelpId}">Actívela cuando el documento incluya varias evoluciones, notas de ingreso, egreso o registros de fechas distintas.</small>
          ${item.needsReanalysis ? `<small class="patient-transfer-reanalysis-message">La forma de segmentación cambió. Vuelva a analizar el documento.</small>` : ""}
        </fieldset>
      </div>
      <button type="button" data-transfer-remove-file="${item.id}">Eliminar</button>
    </article>`;
  }).join("") : "";
}

function renderCandidateSelect(group) {
  const candidates = group.candidates || [];
  if (!candidates.length) return `<p class="patient-transfer-muted">Sin coincidencias existentes detectadas.</p>`;
  return `
    <label>Paciente existente
      <select data-transfer-existing="${group.id}">
        <option value="">Seleccionar paciente</option>
        ${candidates.map((candidate) => option(candidate.id, `${candidate.name} ${candidate.expediente ? `· ${candidate.expediente}` : ""}`, candidate.id === group.selectedPatientId)).join("")}
      </select>
    </label>`;
}

function medicationCatalogStatusLabel(candidate = {}) {
  const labels = {
    exact: "Coincidencia exacta",
    high: "Coincidencia probable",
    medium: "Varias coincidencias",
    low: "Coincidencia débil",
    none: "No encontrado"
  };
  return labels[candidate.catalogMatchStatus] || labels.none;
}

function medicationCatalogOptions(candidate = {}) {
  const alternatives = Array.isArray(candidate.catalogAlternatives) ? candidate.catalogAlternatives : [];
  const selectedId = candidate.catalogMedicationId || "";
  return [
    option("", "Ninguno / medicamento no catalogado", !selectedId),
    ...alternatives.map((item) => option(item.id, item.genericName || item.name || item.id, item.id === selectedId))
  ].join("");
}

function renderDuplicateWarning(group) {
  const matches = group.possibleMatches || group.candidates || [];
  const strongest = matches.find((match) => match.showAlert !== false && ["media", "alta", "muy_alta"].includes(match.level));
  if (!strongest) return "";
  const explanation = buildPatientMatchExplanation(strongest);
  const resolution = group.selectedResolution || null;
  const matched = explanation.matchedFields.map((field) => `<li>✓ ${escapeHtml(field.label)}${field.candidateValue ? `: ${escapeHtml(field.candidateValue)}` : ""}</li>`).join("");
  const conflicts = explanation.conflictingFields.map((field) => `<li>• ${escapeHtml(field.label)}: dato del documento ${escapeHtml(field.candidateValue)} / registrado ${escapeHtml(field.existingValue)}</li>`).join("");
  const documentFields = group.confirmedFields || group.fields || {};
  const existingFields = strongest.patient || {};
  const comparisonFields = [
    ["Nombre completo", documentFields.nombre || documentFields.nombreCompleto, existingFields.nombreCompleto || existingFields.nombre || strongest.name],
    ["Nombres", documentFields.nombres, existingFields.nombres],
    ["Apellido paterno", documentFields.apellidoPaterno, existingFields.apellidoPaterno],
    ["Apellido materno", documentFields.apellidoMaterno, existingFields.apellidoMaterno],
    ["Fecha de nacimiento", documentFields.fechaNacimiento, existingFields.fechaNacimiento],
    ["Expediente", documentFields.expediente, existingFields.expediente || existingFields.numeroExpediente],
    ["CURP", documentFields.curp, existingFields.curp],
    ["Sexo", documentFields.sexo, existingFields.sexo],
    ["Género", documentFields.genero, existingFields.genero || existingFields.identidadGenero],
    ["Institución", documentFields.institucion, existingFields.institucion || existingFields.institucionPaciente],
    ["Servicio", documentFields.servicio, existingFields.servicio],
    ["Cama", documentFields.cama, existingFields.cama]
  ];
  const comparisonTable = comparisonFields.map(([label, candidateValue, existingValue]) => {
    const left = candidateValue?.value ?? candidateValue ?? "";
    const right = existingValue || "";
    const marker = left && right ? (String(left).trim().toLowerCase() === String(right).trim().toLowerCase() ? "✓" : "⚠") : "—";
    return `<tr><th>${escapeHtml(label)}</th><td>${marker} ${escapeHtml(left || "No disponible")}</td><td>${escapeHtml(right || "No disponible")}</td></tr>`;
  }).join("");
  const tone = `patient-transfer-duplicate-warning--${explanation.level}`;
  const recommendation = explanation.recommendedAction === "link-existing"
    ? "Es probable que sea el mismo paciente; revise y seleccione una decisión."
    : "No se recomienda asociar automáticamente. Revise los datos antes de decidir.";
  return `<section class="patient-transfer-warning patient-transfer-duplicate-warning ${tone}" aria-label="Posible coincidencia de paciente">
    <strong>${explanation.level === "muy_alta" ? "POSIBLE COINCIDENCIA MUY ALTA" : `POSIBLE COINCIDENCIA ${explanation.levelLabel.toUpperCase()}`}</strong>
    <p>${escapeHtml(explanation.summary)}</p>
    <p>Paciente posiblemente coincidente: <b>${escapeHtml(strongest.name || strongest.patient?.nombreCompleto || "Paciente encontrado durante la búsqueda")}</b></p>
    ${matched ? `<p>Coincidencias:</p><ul>${matched}</ul>` : ""}
    ${conflicts ? `<p>Diferencias:</p><ul>${conflicts}</ul>` : "<p>Diferencias: no se detectaron campos contradictorios entre los datos disponibles.</p>"}
    <p><b>Nivel:</b> ${escapeHtml(explanation.levelLabel)}${strongest.score ? ` · Puntaje: ${strongest.score}` : ""}</p>
    <p><b>Recomendación:</b> ${recommendation}</p>
    <details><summary>Comparar datos</summary><table class="patient-transfer-data-table"><thead><tr><th>Campo</th><th>Dato del documento</th><th>Dato registrado</th></tr></thead><tbody>${comparisonTable}</tbody></table></details>
    <fieldset class="patient-transfer-duplicate-resolution">
      <legend>Decisión para este paciente</legend>
      <label><input type="radio" name="duplicate-resolution-${group.id}" value="link-existing" data-transfer-duplicate-resolution="${group.id}" data-patient-id="${escapeHtml(strongest.patientId || strongest.id || "")}" ${resolution === "link-existing" ? "checked" : ""}> Asociar las notas al paciente existente</label>
      <label><input type="radio" name="duplicate-resolution-${group.id}" value="create-new" data-transfer-duplicate-resolution="${group.id}" ${resolution === "create-new" ? "checked" : ""}> Crear un paciente nuevo de todas formas</label>
      <label><input type="radio" name="duplicate-resolution-${group.id}" value="omit" data-transfer-duplicate-resolution="${group.id}" ${resolution === "omit" ? "checked" : ""}> Omitir este paciente</label>
    </fieldset>
    ${strongest.patientId || strongest.id ? `<a href="paciente.html?id=${encodeURIComponent(strongest.patientId || strongest.id)}" target="_blank" rel="noopener">Ver expediente existente</a>` : ""}
  </section>`;
}

function renderFields(group) {
  return FIELD_RULES.map((rule) => {
    const field = group.fields?.[rule.key];
    return `
      <label>${rule.label}
        <input data-transfer-field="${group.id}:${rule.key}" value="${escapeHtml(field?.value || "")}" placeholder="${rule.label}">
        <small>${fieldStatus(field)}${field ? ` · confianza ${field.confidence}` : ""}</small>
      </label>`;
  }).join("");
}

function renderExtractionDebug(doc) {
  if (!debugEnabled()) return "";
  const fields = Object.entries(doc.fields || {}).map(([key, field]) => `
    <tr>
      <td>${escapeHtml(key)}</td>
      <td>${escapeHtml(field.value || "")}</td>
      <td>${escapeHtml(field.rawValue || "")}</td>
      <td>${escapeHtml(field.detectionMethod || "")}</td>
      <td>${escapeHtml(JSON.stringify(field.sourceLocation || {}))}</td>
    </tr>`).join("");
  return `
    <details class="patient-transfer-debug">
      <summary>Ver extraccion</summary>
      <h4>Texto reconstruido</h4>
      <pre>${escapeHtml(doc.fullText || "")}</pre>
      <h4>Campos detectados</h4>
      <table>
        <thead><tr><th>Campo</th><th>Valor</th><th>Valor original</th><th>Regla</th><th>Origen</th></tr></thead>
        <tbody>${fields || `<tr><td colspan="5">Sin campos detectados.</td></tr>`}</tbody>
      </table>
      <h4>Bloques</h4>
      <pre>${escapeHtml(JSON.stringify((doc.blocks || []).slice(0, 30), null, 2))}</pre>
    </details>`;
}

function renderDiagnosisCandidates(doc) {
  const candidates = doc.diagnosisCandidates || [];
  const emptyDiagnosisMessage = "No se detectaron diagnosticos explicitos";
  return `<section class="patient-transfer-candidates"><h4>Diagnósticos detectados</h4>${candidates.length ? candidates.map((candidate) => `
    <article>
      <label><input type="checkbox" data-transfer-dx-include="${doc.id}:${candidate.id}" ${candidate.selectedForImport ? "checked" : ""}> Incluir</label>
      <textarea rows="2" data-transfer-dx-name="${doc.id}:${candidate.id}" title="${escapeHtml(candidate.diagnosisName || candidate.normalizedLabel || candidate.rawText || "")}" placeholder="Diagnóstico">${escapeHtml(candidate.diagnosisName || candidate.normalizedLabel || candidate.rawText || "")}</textarea>
      <input data-transfer-dx-code="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.code || "")}" placeholder="Código">
      <select data-transfer-dx-system="${doc.id}:${candidate.id}">${["", "CIE-10", "CIE-11", "DSM-5"].map((item) => option(item, item || "Sin sistema", item === (candidate.system || candidate.codingSystem || ""))).join("")}</select>
      <select data-transfer-dx-status="${doc.id}:${candidate.id}">${["Confirmado", "Probable", "A descartar", "Diferencial", "En seguimiento", "Antecedente", "Remisión", "Descartado"].map((item) => option(item, item, item === (candidate.status || candidate.statusSuggestion))).join("")}</select>
      <label><input type="checkbox" data-transfer-dx-principal="${doc.id}:${candidate.id}" ${candidate.isPrimary || candidate.principal ? "checked" : ""}> Principal</label>
      <small>Fuente: ${escapeHtml(candidate.sourceSection || "")} · ${escapeHtml(candidate.temporality || "")} · ${escapeHtml(candidate.rawText || "")}</small>
    </article>`).join("") : "<p>No se detectaron diagnósticos explícitos en este documento.</p>"}</section>`;
}

function renderTreatmentCandidates(doc) {
  const candidates = doc.treatmentCandidates || [];
  if (!candidates.length) return `
    <section class="patient-transfer-candidates">
      <h4>Tratamientos detectados</h4>
      <p>No se detectaron tratamientos explicitos.</p>
    </section>`;
  return `
    <section class="patient-transfer-candidates">
      <h4>Tratamientos detectados</h4>
      ${candidates.map((candidate) => `
        <article>
          <label><input type="checkbox" data-transfer-tx-include="${doc.id}:${candidate.id}" ${candidate.selectedForImport ? "checked" : ""}> Incluir</label>
          <input data-transfer-tx-name="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.medicationName || "")}" placeholder="Medicamento">
          <input data-transfer-tx-presentation="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.presentation || "")}" placeholder="Presentación">
          <input data-transfer-tx-strength="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.strengthValue ?? candidate.dose ?? "")}" placeholder="Concentración">
          <input data-transfer-tx-strength-unit="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.strengthUnit || candidate.doseUnit || "")}" placeholder="Unidad">
          <input data-transfer-tx-admin-quantity="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.administrationQuantity ?? "")}" placeholder="Cantidad">
          <input data-transfer-tx-admin-unit="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.administrationUnit || "")}" placeholder="Unidad">
          <input data-transfer-tx-route="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.route || "")}" placeholder="Via">
          <input data-transfer-tx-frequency="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.frequencyRaw || "")}" placeholder="Frecuencia">
          <input data-transfer-tx-schedule="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.scheduleText || formatMedicationSchedule(candidate.schedule))}" placeholder="Horario">
          <select data-transfer-tx-status="${doc.id}:${candidate.id}">
            ${["Inicia", "Continua", "Continúa", "Aumenta", "Disminuye", "Suspende", "Cambia presentación", "Pendiente traer", "Antecedente", "Otro"].map((item) => option(item, item, item === (candidate.action || candidate.statusSuggestion))).join("")}
          </select>
          <small>Fuente: ${escapeHtml(candidate.sourceSection || "")} · ${escapeHtml(candidate.temporality || "")} · ${escapeHtml(candidate.sourceText || "")}</small>
        </article>`).join("")}
    </section>`;
}

function renderVitalSignsCandidates(doc) {
  const candidates = doc.vitalSignsCandidates || [];
  if (!candidates.length) return "";
  return `
    <section class="patient-transfer-candidates">
      <h4>Signos vitales detectados</h4>
      ${candidates.map((candidate) => {
        const vital = candidate.vitalSigns || {};
        const pressure = vital.bloodPressure ? `${vital.bloodPressure.systolic}/${vital.bloodPressure.diastolic} mmHg` : "";
        return `
          <article>
            <label><input type="checkbox" data-transfer-vitals-include="${doc.id}:${candidate.id}" checked> Incluir</label>
            <input data-transfer-vitals-pa="${doc.id}:${candidate.id}" value="${escapeHtml(pressure)}" placeholder="PA">
            <input data-transfer-vitals-temp="${doc.id}:${candidate.id}" value="${escapeHtml(vital.temperature?.value ?? "")}" placeholder="Temperatura">
            <input data-transfer-vitals-fc="${doc.id}:${candidate.id}" value="${escapeHtml(vital.heartRate?.value ?? "")}" placeholder="FC">
            <input data-transfer-vitals-fr="${doc.id}:${candidate.id}" value="${escapeHtml(vital.respiratoryRate?.value ?? "")}" placeholder="FR">
            <input data-transfer-vitals-sato2="${doc.id}:${candidate.id}" value="${escapeHtml(vital.oxygenSaturation?.value ?? "")}" placeholder="SatO2">
            <input data-transfer-vitals-peso="${doc.id}:${candidate.id}" value="${escapeHtml(vital.weight?.value ?? "")}" placeholder="Peso">
            <input data-transfer-vitals-talla="${doc.id}:${candidate.id}" value="${escapeHtml(vital.height?.value ?? "")}" placeholder="Talla">
            <input data-transfer-vitals-imc="${doc.id}:${candidate.id}" value="${escapeHtml(vital.bmi?.value ?? vital.bmiCalculated?.value ?? "")}" placeholder="IMC">
            <small>Fuente: tabla ${escapeHtml(candidate.sourceLocation?.tableIndex ?? "")}</small>
          </article>`;
      }).join("")}
    </section>`;
}

function safeControlToken(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function subjectiveControlId(documentId = "", noteId = "") {
  return `patient-transfer-subjective-${safeControlToken(documentId)}-${safeControlToken(noteId)}`;
}

function segmentControlKey(doc, segment, candidate) {
  return `${doc.id}:${segment.id}:${candidate.id}`;
}

function candidatesForType(segment = {}, candidateType = "") {
  return candidateType === "diagnosis"
    ? (segment.diagnosisCandidates || [])
    : candidateType === "treatment"
      ? (segment.treatmentCandidates || [])
      : [];
}

/**
 * Define qué candidatos pueden seleccionarse de forma masiva. Las decisiones
 * clínicas y de catálogo ya tomadas no se modifican aquí.
 */
export function isTransferCandidateSelectable(candidate = {}, candidateType = "") {
  if (!candidate || candidate.omitted || candidate.invalidated || candidate.isImportable === false || candidate.importable === false || candidate.discardedByUser) {
    return false;
  }
  return candidateType !== "treatment" || !candidate.requiresCatalogReview;
}

export function getBulkSelectionState(candidates = [], candidateType = "", noteOmitted = false) {
  const selectable = (candidates || []).filter((candidate) => isTransferCandidateSelectable(candidate, candidateType));
  const selectedCount = selectable.filter((candidate) => candidate.include || candidate.selectedForImport).length;
  return {
    checked: selectable.length > 0 && selectedCount === selectable.length,
    indeterminate: selectedCount > 0 && selectedCount < selectable.length,
    disabled: Boolean(noteOmitted) || !selectable.length,
    selectableCount: selectable.length,
    selectedCount
  };
}

/**
 * Actualiza solo los candidatos de la nota y sección indicadas. El controlador
 * conserva el arreglo resultante como fuente de verdad antes de volver a pintar.
 */
export function applyBulkCandidateSelection(groups = [], { documentId = "", noteId = "", candidateType = "", selected = false } = {}) {
  let affectedCount = 0;
  let candidateCount = 0;
  const updatedGroups = (groups || []).map((group) => ({
    ...group,
    documents: (group.documents || []).map((document) => {
      if (document.id !== documentId) return document;
      return {
        ...document,
        noteSegments: (document.noteSegments || []).map((segment) => {
          if (segment.id !== noteId || segment.omitted || document.omitted || group.omitted) return segment;
          const candidates = candidatesForType(segment, candidateType);
          if (!candidates.length) return segment;
          candidateCount += candidates.length;
          const updatedCandidates = candidates.map((candidate) => {
            if (!isTransferCandidateSelectable(candidate, candidateType)) return candidate;
            affectedCount += 1;
            return {
              ...candidate,
              include: selected,
              selectedForImport: selected,
              confirmedByDoctor: selected
            };
          });
          return candidateType === "diagnosis"
            ? { ...segment, diagnosisCandidates: updatedCandidates }
            : { ...segment, treatmentCandidates: updatedCandidates };
        })
      };
    })
  }));
  return { groups: updatedGroups, candidateCount, affectedCount };
}

export function syncBulkSelectionControls(groups = []) {
  if (!root) return;
  root.querySelectorAll("[data-transfer-select-all]").forEach((control) => {
    const documentId = control.dataset.documentId || "";
    const noteId = control.dataset.noteId || "";
    const candidateType = control.dataset.candidateType || "";
    let owner = null;
    let document = null;
    for (const group of groups || []) {
      document = (group.documents || []).find((item) => item.id === documentId) || null;
      if (document) {
        owner = group;
        break;
      }
    }
    const segment = document?.noteSegments?.find((item) => item.id === noteId);
    if (!segment) return;
    const state = getBulkSelectionState(candidatesForType(segment, candidateType), candidateType, Boolean(owner?.omitted || document?.omitted || segment.omitted));
    control.checked = state.checked;
    control.indeterminate = state.indeterminate;
    control.disabled = state.disabled;
  });
}

function renderBulkSelectionControl(doc, segment, candidateType, label) {
  const candidates = candidatesForType(segment, candidateType);
  const state = getBulkSelectionState(candidates, candidateType, segment.omitted || doc.omitted);
  const controlId = `transfer-select-all-${doc.id}-${segment.id}-${candidateType}`;
  const help = candidateType === "diagnosis"
    ? "Selecciona todos los diagnósticos de esta nota"
    : "Selecciona todos los tratamientos de esta nota";
  console.info("[patient-transfer] select-all-render", {
    documentId: doc.id,
    noteId: segment.id,
    candidateType,
    selected: state.checked,
    candidateCount: candidates.length,
    affectedCount: 0
  });
  return `<label for="${escapeHtml(controlId)}" title="${help}"><input id="${escapeHtml(controlId)}" type="checkbox" data-action="toggle-all-candidates" data-transfer-select-all data-document-id="${escapeHtml(doc.id)}" data-note-id="${escapeHtml(segment.id)}" data-candidate-type="${candidateType}" ${state.checked ? "checked" : ""} ${state.disabled ? "disabled" : ""}> ${label}</label>`;
}

function renderSegmentVitalSigns(doc, segment) {
  const candidates = segment.vitalSignsCandidates || [];
  if (!candidates.length) return `<section class="patient-transfer-candidates"><h4>Signos vitales y somatometría</h4><p>No se detectaron signos vitales en esta nota.</p></section>`;
  return `<section class="patient-transfer-candidates patient-transfer-compact-section">
    <h4>Signos vitales y somatometría</h4>
    <div class="patient-transfer-table-scroll"><table class="patient-transfer-data-table patient-transfer-vitals-table">
      <thead><tr><th>Fecha</th><th>Hora</th><th title="Presión arterial">PA</th><th>Temperatura</th><th title="Frecuencia cardiaca">FC</th><th title="Frecuencia respiratoria">FR</th><th title="Saturación de oxígeno">SatO₂</th><th title="Glucemia capilar">Glucemia</th><th>Peso</th><th>Talla</th><th>IMC</th><th>Incluir</th></tr></thead>
      <tbody>${candidates.map((candidate) => {
        const vital = candidate.vitalSigns || {};
        const key = `${doc.id}:${candidate.id}`;
        const pressure = vital.bloodPressure ? `${vital.bloodPressure.systolic}/${vital.bloodPressure.diastolic}` : "";
        return `<tr>
          <td>${escapeHtml(segment.metadata?.documentDate || segment.date || "—")}</td><td>${escapeHtml(segment.metadata?.documentHour || segment.time || "—")}</td>
          <td><input aria-label="Presión arterial" data-transfer-vitals-pa="${key}" value="${escapeHtml(pressure)}"></td>
          <td><input aria-label="Temperatura" data-transfer-vitals-temp="${key}" value="${escapeHtml(vital.temperature?.value ?? "")}"></td>
          <td><input aria-label="Frecuencia cardiaca" data-transfer-vitals-fc="${key}" value="${escapeHtml(vital.heartRate?.value ?? "")}"></td>
          <td><input aria-label="Frecuencia respiratoria" data-transfer-vitals-fr="${key}" value="${escapeHtml(vital.respiratoryRate?.value ?? "")}"></td>
          <td><input aria-label="Saturación de oxígeno" data-transfer-vitals-sato2="${key}" value="${escapeHtml(vital.oxygenSaturation?.value ?? "")}"></td>
          <td><input aria-label="Glucemia capilar" data-transfer-vitals-glucose="${key}" value="${escapeHtml(vital.capillaryGlucose?.value ?? "")}"></td>
          <td><input aria-label="Peso" data-transfer-vitals-peso="${key}" value="${escapeHtml(vital.weight?.value ?? "")}"></td>
          <td><input aria-label="Talla" data-transfer-vitals-talla="${key}" value="${escapeHtml(vital.height?.value ?? "")}"></td>
          <td><input aria-label="IMC" data-transfer-vitals-imc="${key}" value="${escapeHtml(vital.bmi?.value ?? vital.bmiCalculated?.value ?? "")}"></td>
          <td><input aria-label="Incluir signos vitales" type="checkbox" data-transfer-vitals-include="${key}" ${candidate.include !== false ? "checked" : ""}></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>
  </section>`;
}

function renderSegmentDiagnosisCandidates(doc, segment) {
  const candidates = segment.diagnosisCandidates || [];
  console.info("[patient-transfer] diagnosis:rendered", JSON.stringify({ noteId: segment.id, candidatesCount: candidates.length }));
  return `<section class="patient-transfer-candidates"><div class="patient-transfer-candidates-header"><h4>Diagnósticos detectados</h4>${renderBulkSelectionControl(doc, segment, "diagnosis", "Incluir todos")}</div>${candidates.length ? `<div class="patient-transfer-table-scroll"><table class="patient-transfer-data-table">
    <thead><tr><th>Incluir</th><th>Diagnóstico</th><th>Código</th><th>Sistema</th><th>Estado</th><th>Principal</th><th>Fecha</th><th>Fuente</th></tr></thead><tbody>${candidates.map((candidate) => {
      const key = segmentControlKey(doc, segment, candidate);
      return `<tr>
        <td><input aria-label="Incluir diagnóstico" type="checkbox" data-transfer-dx-include="${key}" ${candidate.selectedForImport ? "checked" : ""}></td>
        <td><textarea rows="2" data-transfer-dx-name="${key}" title="${escapeHtml(candidate.diagnosisName || candidate.normalizedLabel || candidate.rawText || "")}" placeholder="Diagnóstico">${escapeHtml(candidate.diagnosisName || candidate.normalizedLabel || candidate.rawText || "")}</textarea></td>
        <td><input data-transfer-dx-code="${key}" value="${escapeHtml(candidate.code || "")}" placeholder="Código"></td>
        <td><select aria-label="Sistema diagnóstico" data-transfer-dx-system="${key}">${["", "CIE-10", "CIE-11", "DSM-5"].map((item) => option(item, item || "Sin sistema", item === (candidate.system || candidate.codingSystem || ""))).join("")}</select></td>
        <td><select data-transfer-dx-status="${key}">${["Confirmado", "Probable", "A descartar", "Diferencial", "En seguimiento", "Antecedente", "Remisión", "Descartado"].map((item) => option(item, item, item === (candidate.status || candidate.statusSuggestion))).join("")}</select></td>
        <td><input aria-label="Diagnóstico principal" type="checkbox" data-transfer-dx-principal="${key}" ${candidate.isPrimary || candidate.principal ? "checked" : ""}></td>
        <td>${escapeHtml(segment.metadata?.documentDate || segment.date || "")}</td>
        <td><details><summary>Ver fuente</summary><small>${escapeHtml(candidate.rawText || "")} · ${escapeHtml(candidate.detectionRule || "")}</small></details></td>
      </tr>`;
    }).join("")}</tbody></table></div>` : "<p>No se detectaron diagnósticos explícitos en esta nota.</p>"}</section>`;
}

function renderSegmentDiagnosisCandidatesLegacy(doc, segment) {
  const candidates = segment.diagnosisCandidates || [];
  return `
    <section class="patient-transfer-candidates">
      <h4>Diagnósticos detectados</h4>
      ${candidates.length ? `<div class="patient-transfer-table-scroll"><table class="patient-transfer-data-table">
        <thead><tr><th>Incluir</th><th>Diagnóstico</th><th>CIE-10</th><th>Estado</th><th>Principal</th><th>Fecha</th><th>Fuente</th></tr></thead><tbody>${candidates.map((candidate) => {
        const key = segmentControlKey(doc, segment, candidate);
        return `<tr>
          <td><input aria-label="Incluir diagnóstico" type="checkbox" data-transfer-dx-include="${key}" ${candidate.selectedForImport ? "checked" : ""}></td>
          <td><input data-transfer-dx-name="${key}" value="${escapeHtml(candidate.normalizedLabel || candidate.rawText || "")}" placeholder="Diagnóstico"></td>
          <td><input data-transfer-dx-code="${key}" value="${escapeHtml(candidate.code || "")}" placeholder="Código"><select aria-label="Sistema diagnóstico" data-transfer-dx-system="${key}">${["", "CIE-10", "CIE-11", "DSM-5"].map((item) => option(item, item || "Sin sistema", item === (candidate.codingSystem || ""))).join("")}</select></td>
          <td><select data-transfer-dx-status="${key}">${["Confirmado", "Probable", "A descartar", "Diferencial", "En seguimiento", "Antecedente", "Remisión", "Descartado"].map((item) => option(item, item, item === candidate.statusSuggestion)).join("")}</select></td>
          <td><input aria-label="Diagnóstico principal" type="checkbox" data-transfer-dx-principal="${key}" ${candidate.principal ? "checked" : ""}></td>
          <td>${escapeHtml(segment.metadata?.documentDate || segment.date || "")}</td>
          <td><details><summary>Ver fuente</summary><small>${escapeHtml(candidate.rawText || "")} · ${escapeHtml(candidate.detectionRule || "")}</small></details></td>
        </tr>`;
      }).join("")}</tbody></table></div>` : "<p>No se detectaron diagnósticos explícitos en esta nota.</p>"}
    </section>`;
}

function renderSegmentTreatmentCandidates(doc, segment) {
  const candidates = segment.treatmentCandidates || [];
  console.info("[patient-transfer] medications-rendered", JSON.stringify({
    noteId: segment.id,
    count: candidates.length
  }));
  return `
    <section class="patient-transfer-candidates">
      <div class="patient-transfer-candidates-header"><h4>Medicamentos detectados</h4>${renderBulkSelectionControl(doc, segment, "treatment", "Incluir todos")}</div>
      ${candidates.length ? `<div class="patient-transfer-table-scroll"><table class="patient-transfer-data-table">
        <thead><tr><th>Incluir</th><th>Medicamento</th><th>Catálogo</th><th>Presentación</th><th>Concentración</th><th>Dosis por toma</th><th>Vía</th><th>Frecuencia</th><th>Horario</th><th>Acción</th><th>Fecha</th><th>Fuente</th></tr></thead><tbody>${candidates.map((candidate) => {
        const key = segmentControlKey(doc, segment, candidate);
        const scheduleText = formatMedicationSchedule(candidate.schedule) || candidate.scheduleText || "";
        console.info("[patient-transfer] medication:rendered", JSON.stringify({ noteId: segment.id, medicationName: candidate.medicationName, strength: candidate.strengthValue ?? candidate.dose ?? null, route: candidate.route || "", frequency: candidate.frequencyRaw || "", schedulesCount: Array.isArray(candidate.schedule) ? candidate.schedule.length : 0, action: candidate.action || candidate.statusSuggestion || "" }));
        return `<tr>
          <td><input aria-label="Incluir medicamento" type="checkbox" data-transfer-tx-include="${key}" ${candidate.selectedForImport ? "checked" : ""}></td>
          <td><input data-transfer-tx-name="${key}" value="${escapeHtml(candidate.medicationName || "")}" placeholder="Medicamento"></td>
          <td><small>${escapeHtml(medicationCatalogStatusLabel(candidate))}${candidate.catalogPresentationMatch === false ? " · Presentación por revisar" : ""}</small><select data-transfer-tx-catalog="${key}" data-initial-value="${escapeHtml(candidate.catalogMedicationId || "")}" data-catalog-original-name="${escapeHtml(candidate.medicationName || "")}" aria-label="Medicamento del catálogo">${medicationCatalogOptions(candidate)}</select><small>Se vinculará con el catálogo para interacciones y advertencias.</small></td>
          <td><input data-transfer-tx-presentation="${key}" value="${escapeHtml(candidate.presentation || "")}" placeholder="Presentación"></td>
          <td><input data-transfer-tx-strength="${key}" value="${escapeHtml(candidate.strengthValue ?? candidate.dose ?? "")}" placeholder="Concentración"><input data-transfer-tx-strength-unit="${key}" value="${escapeHtml(candidate.strengthUnit || candidate.doseUnit || "")}" placeholder="Unidad"></td>
          <td><input data-transfer-tx-admin-quantity="${key}" value="${escapeHtml(candidate.administrationQuantity ?? "")}" placeholder="Cantidad"><input data-transfer-tx-admin-unit="${key}" value="${escapeHtml(candidate.administrationUnit || "")}" placeholder="Unidad"></td>
          <td><input data-transfer-tx-route="${key}" value="${escapeHtml(candidate.route || "")}" placeholder="Vía"></td>
          <td><input data-transfer-tx-frequency="${key}" value="${escapeHtml(candidate.frequencyRaw || "")}" placeholder="Frecuencia"></td>
          <td><input data-transfer-tx-schedule="${key}" value="${escapeHtml(scheduleText)}" placeholder="08:00 · 1 tableta"></td>
          <td><select data-transfer-tx-status="${key}">${["Inicia", "Continúa", "Aumenta", "Disminuye", "Suspende", "Cambia presentación", "Antecedente", "Otro"].map((item) => option(item, item, item === (candidate.action || candidate.statusSuggestion))).join("")}</select></td>
          <td>${escapeHtml(segment.metadata?.documentDate || segment.date || "")}</td>
          <td><details><summary>Ver fuente</summary><small>${escapeHtml(candidate.sourceText || "")}</small></details></td>
        </tr>`;
      }).join("")}</tbody></table></div>` : "<p>No se detectaron medicamentos explícitos en esta nota.</p>"}
    </section>`;
}

const TREATMENT_PLAN_TYPE_LABELS = {
  diet: "Dieta",
  nursingCare: "Cuidados de enfermeria",
  monitoring: "Vigilancia y monitorizacion",
  suicideRiskPrecautions: "Precauciones por riesgo suicida",
  selfHarmPrecautions: "Conducta autolesiva",
  fallRisk: "Riesgo de caida",
  allergies: "Alergias",
  medications: "Medicamentos",
  laboratoryOrders: "Laboratorios",
  imagingOrders: "Imagenologia",
  consultations: "Interconsultas",
  procedures: "Procedimientos",
  activity: "Actividad",
  hydration: "Hidratacion",
  isolation: "Aislamiento",
  restraints: "Contencion",
  psychotherapy: "Psicoterapia",
  psychoeducation: "Psicoeducacion",
  dischargePlanning: "Plan de egreso",
  followUp: "Seguimiento",
  otherInstruction: "Otras indicaciones"
};

function renderSegmentTreatmentPlanCandidates(doc, segment) {
  const candidates = (segment.treatmentPlanCandidates || []).filter((candidate) => candidate.instructionType !== "medications");
  const delegatedMedicationCount = (segment.treatmentCandidates || []).length;
  const groups = candidates.reduce((result, candidate) => {
    const key = candidate.instructionType || "otherInstruction";
    (result[key] ||= []).push(candidate);
    return result;
  }, {});
  return `<section class="patient-transfer-candidates patient-transfer-treatment-plan">
    <h4>Plan terapéutico detectado</h4>
    ${delegatedMedicationCount ? `<p>${delegatedMedicationCount} medicamento${delegatedMedicationCount === 1 ? "" : "s"} delegado${delegatedMedicationCount === 1 ? "" : "s"} al parser farmacológico. Revise la tabla “Medicamentos detectados”.</p>` : ""}
    ${candidates.length ? Object.entries(groups).map(([type, items]) => `<div class="patient-transfer-plan-group">
      <h5>${escapeHtml(TREATMENT_PLAN_TYPE_LABELS[type] || type)}</h5>
      ${items.map((candidate) => {
        const key = `${doc.id}:${segment.id}:${candidate.id}`;
        return `<label class="patient-transfer-plan-item">
          <input type="checkbox" data-transfer-plan-include="${key}" ${candidate.include || candidate.selectedForImport ? "checked" : ""}>
          <select data-transfer-plan-type="${key}">${Object.entries(TREATMENT_PLAN_TYPE_LABELS).map(([value, label]) => option(value, label, value === type)).join("")}</select>
          <textarea rows="2" data-transfer-plan-text="${key}">${escapeHtml(candidate.text || candidate.value || "")}</textarea>
          <small>Confianza: ${escapeHtml(candidate.confidence || "not-detected")} · ${escapeHtml(candidate.evidence?.[0]?.sourceHeading || "Plan terapéutico")}</small>
          <details><summary>Ver fuente</summary><small>${escapeHtml(candidate.evidence?.[0]?.rawText || candidate.text || "")}</small></details>
        </label>`;
      }).join("")}
    </div>`).join("") : "<p>No se detectaron indicaciones estructuradas.</p>"}
  </section>`;
}

function renderSegmentClinicalSections(doc, segment) {
  const fieldGroup = (fields) => `<section class="patient-transfer-clinical-sections">${fields.map(([label, key]) => `<label>${label}<textarea data-transfer-section="${doc.id}:${segment.id}:${key}" placeholder="No se detectó esta sección.">${escapeHtml(segment.sections?.[key] || "")}</textarea></label>`).join("")}</section>`;
  const subjectiveSource = segment.subjectiveExtraction?.sourceLabel || "";
  const subjectiveId = subjectiveControlId(doc.id, segment.id);
  const subjectiveText = segment.sections?.subjetivo ?? "";
  return `<h4>Secciones clínicas</h4>
    <section class="patient-transfer-clinical-sections"><label for="${subjectiveId}">Subjetivo / evolución</label><textarea id="${subjectiveId}" data-transfer-section="${doc.id}:${segment.id}:subjetivo" data-transfer-document-id="${doc.id}" data-note-id="${segment.id}" data-section-key="subjetivo" placeholder="No se detectó una sección de Subjetivo / Evolución.">${escapeHtml(subjectiveText)}</textarea>${subjectiveSource ? `<small>Fuente: ${escapeHtml(subjectiveSource)}</small>` : subjectiveText ? "" : "<small>No se detectó Subjetivo / evolución.</small>"}</section>
    ${fieldGroup([
      ["Exploración física / neurológica", "physicalNeurologicalExam"],
      ["Examen mental", "examenMental"],
      ["Análisis / comentario", "analisis"]
    ])}
    ${fieldGroup([["Diagnósticos", "diagnosticos"]])}
    ${renderSegmentDiagnosisCandidates(doc, segment)}
    ${fieldGroup([["Plan / indicaciones", "plan"], ["Medicamentos", "medicamentos"]])}
    ${renderSegmentTreatmentPlanCandidates(doc, segment)}
    ${renderSegmentTreatmentCandidates(doc, segment)}
    ${fieldGroup([["Pronóstico", "pronostico"], ["Destino", "destino"]])}`;
}

function renderNoteSegment(doc, segment, index) {
  const selected = segment.confirmedType?.key || segment.metadata?.suggestedType?.key || "tipo_no_reconocido";
  const date = segment.metadata?.documentDate || segment.date || "Sin fecha";
  const time = segment.metadata?.documentHour || segment.time || "Sin hora";
  const title = segment.confirmedType?.label || segment.metadata?.suggestedType?.label || segment.noteType || `Nota ${index + 1}`;
  console.info("[patient-transfer] note-segment:rendered", {
    noteId: segment.id,
    date,
    time,
    vitalSigns: (segment.vitalSignsCandidates || []).length,
    diagnoses: (segment.diagnosisCandidates || []).length,
    treatments: (segment.treatmentCandidates || []).length
  });
  return `<details class="patient-transfer-note-segment" data-transfer-segment="${segment.id}" ${index === 0 ? "open" : ""}>
    <summary><strong>${escapeHtml(title)}</strong><span>${escapeHtml(date)} · ${escapeHtml(time)}</span></summary>
    <header>
      <div><strong>Nota ${index + 1}</strong><small>Bloques ${segment.startBlockIndex}–${segment.endBlockIndex}</small></div>
      <div>
        <button type="button" data-transfer-split-segment="${segment.id}" data-transfer-document-id="${doc.id}">Dividir aquí</button>
        ${index < (doc.noteSegments || []).length - 1 ? `<button type="button" data-transfer-merge-segment="${segment.id}" data-transfer-document-id="${doc.id}">Unir con la siguiente</button>` : ""}
        <label><input type="checkbox" data-transfer-omit-segment="${doc.id}:${segment.id}" ${segment.omitted ? "checked" : ""}> Omitir nota</label>
      </div>
    </header>
    <div class="patient-transfer-note-grid">
      <label>Fecha<input type="text" data-transfer-segment-date="${doc.id}:${segment.id}" value="${escapeHtml(segment.metadata?.documentDate || segment.date || "")}" placeholder="DD/MM/AAAA"></label>
      <label>Hora<input type="time" data-transfer-segment-time="${doc.id}:${segment.id}" value="${escapeHtml(segment.metadata?.documentHour || segment.time || "")}"></label>
      <label>Tipo<select data-transfer-segment-type="${doc.id}:${segment.id}">
        ${NOTE_TYPE_RULES.map((rule) => option(rule.key, rule.label, rule.key === selected)).join("")}
        ${option("tipo_no_reconocido", "Tipo no reconocido", selected === "tipo_no_reconocido")}
      </select></label>
    </div>
    ${renderSegmentVitalSigns(doc, segment)}
    ${renderSegmentClinicalSections(doc, segment)}
    <details class="patient-transfer-original-text"><summary>Ver texto original</summary><pre>${escapeHtml(segment.rawText || "")}</pre></details>
  </details>`;
}

function renderDocument(doc, groups = [], currentGroupId = "") {
  const selected = doc.confirmedType?.key || doc.metadata?.suggestedType?.key || "tipo_no_reconocido";
  const mode = ["auto", "single", "multiple"].includes(doc.multipleNotesMode) ? doc.multipleNotesMode : "auto";
  const detectedNotes = doc.detectedNoteSummaries?.length ? doc.detectedNoteSummaries : doc.noteSegments || [];
  const detectedCount = detectedNotes.length;
  return `
    <details class="patient-transfer-note" open>
      <summary>${escapeHtml(doc.file.name)} <span>${escapeHtml(doc.duplicateStatusLabel || "Nuevo")}</span></summary>
      <div class="patient-transfer-note-grid">
        <label>Paciente probable
          <select data-transfer-document-target="${doc.id}">
            ${groups.map((group) => option(group.id, group.fields?.nombre?.value || group.id, group.id === currentGroupId)).join("")}
            ${option("__new__", "Crear grupo nuevo", false)}
          </select>
        </label>
        <label>Tipo documental
          <select data-transfer-note-type="${doc.id}">
            ${NOTE_TYPE_RULES.map((rule) => option(rule.key, rule.label, rule.key === selected)).join("")}
            ${option("tipo_no_reconocido", "Tipo no reconocido", selected === "tipo_no_reconocido")}
          </select>
        </label>
        <label><input type="checkbox" data-transfer-omit-doc="${doc.id}" ${doc.omitted ? "checked" : ""}> Omitir archivo</label>
      </div>
      <div class="patient-transfer-multiple-notes">
        <strong>Tipo de contenido</strong>
        ${renderMultipleNotesModeOptions({ documentId: doc.id, mode, context: "review" })}
        <small>La detección automática conserva las divisiones clínicas encontradas; una decisión manual requiere volver a analizar.</small>
        ${doc.segmentationNeedsReanalysis ? `<div class="patient-transfer-warning"><p>La forma de segmentación cambió. Vuelva a analizar el documento.</p></div>` : ""}
        ${(doc.probableMultipleNotes || detectedCount > 1) ? `<div class="patient-transfer-warning patient-transfer-detected-notes">
          <p>Se detectaron ${detectedCount} notas posibles.</p>
          ${mode === "multiple" ? `<small>Se analizará como varias notas.</small>` : ""}
          <ul>${detectedNotes.map((note) => `<li>${escapeHtml(note.date || "Sin fecha")} · ${escapeHtml(note.time || "Sin hora")}</li>`).join("")}</ul>
          ${(doc.noteSegments || []).length > 1 ? `<button type="button" data-transfer-review-divisions="${doc.id}">Revisar divisiones</button>` : ""}
          ${mode !== "single" ? `<button type="button" data-transfer-keep-single="${doc.id}">Tratar como una sola nota</button>` : ""}
        </div>` : ""}
      </div>
      <div class="patient-transfer-sections">
        <strong>Secciones encontradas</strong>
        <span>${Object.keys(doc.sections || {}).length ? Object.keys(doc.sections).join(", ") : "Sin secciones reconocidas"}</span>
      </div>
      <section class="patient-transfer-note-segments" id="transfer-note-segments-${doc.id}">
        ${(doc.noteSegments || []).map((segment, index) => renderNoteSegment(doc, segment, index)).join("")}
      </section>
      ${renderExtractionDebug(doc)}
    </details>`;
}

export function countTransferNotes(groups = []) {
  return groups.reduce((total, group) => group.omitted ? total : total + (group.documents || []).reduce((count, doc) => {
    if (doc.omitted) return count;
    const activeSegments = (doc.noteSegments || []).filter((segment) => !segment.omitted);
    return count + ((doc.noteSegments || []).length ? activeSegments.length : 1);
  }, 0), 0);
}

export function renderDetectedGroups(groups = []) {
  const modal = ensureRoot();
  const saveButton = modal.querySelector("[data-transfer-save]");
  saveButton.disabled = !groups.length;
  modal.querySelector("[data-transfer-review]").innerHTML = groups.length ? `
    <section class="patient-transfer-summary">
      <h3>Resumen del traspaso</h3>
      <p>Pacientes probables: ${groups.length} · Notas: ${countTransferNotes(groups)} · Con conflictos: ${groups.filter((group) => group.ambiguous).length}</p>
    </section>
    ${groups.map((group, index) => `
      <article class="patient-transfer-group">
        <header>
          <div>
            <p>Paciente probable ${index + 1}</p>
            <h3>${escapeHtml(group.fields?.nombre?.value || (group.fields?.expediente?.value ? "Paciente identificado por expediente" : "Paciente sin nombre detectado"))}</h3>
            <span>${group.fields?.expediente?.value ? `Expediente: ${escapeHtml(group.fields.expediente.value)}` : "Sin expediente detectado"}</span>
          </div>
          <label><input type="checkbox" data-transfer-omit-group="${group.id}" ${group.omitted ? "checked" : ""}> Omitir paciente</label>
        </header>
        ${group.ambiguous ? `<div class="patient-transfer-warning">Datos incompletos o contradictorios. Revise antes de guardar.</div>` : ""}
        ${renderDuplicateWarning(group)}
        <div class="patient-transfer-mode">
          <label><input type="radio" name="transfer-action-${group.id}" value="create" data-transfer-action="${group.id}" ${group.action !== "associate" ? "checked" : ""}> Crear paciente</label>
          <label><input type="radio" name="transfer-action-${group.id}" value="associate" data-transfer-action="${group.id}" ${group.action === "associate" ? "checked" : ""}> Asociar a paciente existente</label>
        </div>
        ${renderCandidateSelect(group)}
        <div class="patient-transfer-field-grid">${renderFields(group)}</div>
        <div class="patient-transfer-documents">${group.documents.map((doc) => renderDocument(doc, groups, group.id)).join("")}</div>
      </article>`).join("")}` : "";
  collectRenderedSubjectiveMetrics(groups).forEach((metrics) => {
    console.info("[patient-transfer] subjective:rendered", metrics);
    console.assert(
      metrics.subjectiveLength === metrics.renderedLength,
      `Longitud de Subjetivo distinta en ${metrics.noteId}: estado=${metrics.subjectiveLength}, render=${metrics.renderedLength}`
    );
  });
  syncBulkSelectionControls(groups);
}

export function collectRenderedSubjectiveMetrics(groups = []) {
  const modal = ensureRoot();
  return groups.flatMap((group) => (group.documents || []).flatMap((document) =>
    (document.noteSegments || []).map((segment) => {
      const textarea = modal.querySelector(`#${subjectiveControlId(document.id, segment.id)}`);
      return {
        noteId: segment.id,
        date: segment.metadata?.documentDate || segment.date || "",
        time: segment.metadata?.documentHour || segment.time || "",
        segmentStartBlock: segment.startBlockIndex ?? null,
        segmentEndBlock: segment.endBlockIndex ?? null,
        segmentBlockCount: (segment.blocks || []).length,
        segmentRawTextLength: String(segment.rawText || "").length,
        subjectiveStartBlock: segment.subjectiveExtraction?.startBlockIndex ?? null,
        subjectiveEndBlock: segment.subjectiveExtraction?.endBlockIndex ?? null,
        subjectiveLength: String(segment.sections?.subjetivo ?? "").length,
        renderedLength: String(textarea?.value ?? "").length
      };
    })
  ));
}

export function readTransferReview(groups = []) {
  const modal = ensureRoot();
  const reviewedCatalogMedicationId = (key, candidate, medicationName) => {
    const control = modal.querySelector(`[data-transfer-tx-catalog="${key}"]`);
    if (!control) return candidate.catalogMedicationId || null;
    const selectionChanged = control.value !== (control.dataset.initialValue || "");
    return selectionChanged || medicationName === (control.dataset.catalogOriginalName || "")
      ? (control.value || null)
      : null;
  };
  return groups.map((group) => {
    const actionControl = modal.querySelector(`[data-transfer-action="${group.id}"]:checked`)?.value || "create";
    const duplicateControl = modal.querySelector(`[data-transfer-duplicate-resolution="${group.id}"]:checked`);
    const selectedResolution = duplicateControl?.value || group.selectedResolution || null;
    const duplicateAction = selectedResolution || "";
    const selectedPatientId = duplicateAction === "link-existing"
      ? duplicateControl?.dataset.patientId || group.duplicateResolution?.matchedPatientId || ""
      : modal.querySelector(`[data-transfer-existing="${group.id}"]`)?.value || "";
    const action = duplicateAction === "link-existing" ? "associate" : duplicateAction === "omit" ? "omit" : actionControl;
    const confirmedFields = {};
    FIELD_RULES.forEach((rule) => {
      const rawValue = modal.querySelector(`[data-transfer-field="${group.id}:${rule.key}"]`)?.value?.trim() || "";
      confirmedFields[rule.key] = rule.key === "expediente" ? normalizeRecordNumber(rawValue) : rawValue;
      if (rule.key === "expediente") confirmedFields.expedienteOriginal = rawValue;
    });
    confirmedFields.nombre = construirNombreCompletoPaciente({
      nombres: confirmedFields.nombres,
      apellidoPaterno: confirmedFields.apellidoPaterno,
      apellidoMaterno: confirmedFields.apellidoMaterno
    }) || confirmedFields.nombre;
    const documents = group.documents.map((doc) => {
      const typeKey = modal.querySelector(`[data-transfer-note-type="${doc.id}"]`)?.value || "tipo_no_reconocido";
      const rule = NOTE_TYPE_RULES.find((item) => item.key === typeKey) || { key: "tipo_no_reconocido", label: "Tipo no reconocido" };
      const diagnosisCandidates = (doc.diagnosisCandidates || []).map((candidate) => ({
        ...candidate,
        include: modal.querySelector(`[data-transfer-dx-include="${doc.id}:${candidate.id}"]`)?.checked || false,
        selectedForImport: modal.querySelector(`[data-transfer-dx-include="${doc.id}:${candidate.id}"]`)?.checked || false,
        diagnosisName: modal.querySelector(`[data-transfer-dx-name="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.diagnosisName || candidate.normalizedLabel || "",
        normalizedLabel: modal.querySelector(`[data-transfer-dx-name="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.normalizedLabel || "",
        code: modal.querySelector(`[data-transfer-dx-code="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.code || "",
        codingSystem: modal.querySelector(`[data-transfer-dx-system="${doc.id}:${candidate.id}"]`)?.value || "",
        system: modal.querySelector(`[data-transfer-dx-system="${doc.id}:${candidate.id}"]`)?.value || candidate.system || candidate.codingSystem || "",
        statusSuggestion: modal.querySelector(`[data-transfer-dx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.statusSuggestion,
        status: modal.querySelector(`[data-transfer-dx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.status || candidate.statusSuggestion,
        principal: modal.querySelector(`[data-transfer-dx-principal="${doc.id}:${candidate.id}"]`)?.checked || false,
        isPrimary: modal.querySelector(`[data-transfer-dx-principal="${doc.id}:${candidate.id}"]`)?.checked || false,
        confirmedByDoctor: modal.querySelector(`[data-transfer-dx-include="${doc.id}:${candidate.id}"]`)?.checked || false
      }));
      const treatmentCandidates = (doc.treatmentCandidates || []).map((candidate) => {
        const key = `${doc.id}:${candidate.id}`;
        const medicationName = modal.querySelector(`[data-transfer-tx-name="${key}"]`)?.value?.trim() || "";
        return {
        ...candidate,
        include: modal.querySelector(`[data-transfer-tx-include="${doc.id}:${candidate.id}"]`)?.checked || false,
        selectedForImport: modal.querySelector(`[data-transfer-tx-include="${doc.id}:${candidate.id}"]`)?.checked || false,
        medicationName,
        catalogMedicationId: reviewedCatalogMedicationId(key, candidate, medicationName),
        presentation: modal.querySelector(`[data-transfer-tx-presentation="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.presentation || "",
        strengthValue: modal.querySelector(`[data-transfer-tx-strength="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.strengthValue || "",
        strengthUnit: modal.querySelector(`[data-transfer-tx-strength-unit="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.strengthUnit || candidate.doseUnit || "",
        administrationQuantity: modal.querySelector(`[data-transfer-tx-admin-quantity="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.administrationQuantity || "",
        administrationUnit: modal.querySelector(`[data-transfer-tx-admin-unit="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.administrationUnit || "",
        dose: modal.querySelector(`[data-transfer-tx-strength="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.dose || "",
        doseUnit: modal.querySelector(`[data-transfer-tx-strength-unit="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.doseUnit || "",
        route: modal.querySelector(`[data-transfer-tx-route="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        frequencyRaw: modal.querySelector(`[data-transfer-tx-frequency="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        scheduleText: modal.querySelector(`[data-transfer-tx-schedule="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.scheduleText || "",
        schedule: modal.querySelector(`[data-transfer-tx-schedule="${doc.id}:${candidate.id}"]`) ? parseMedicationSchedules(modal.querySelector(`[data-transfer-tx-schedule="${doc.id}:${candidate.id}"]`).value) : (candidate.schedule || []),
        action: modal.querySelector(`[data-transfer-tx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.action || candidate.statusSuggestion,
        statusSuggestion: modal.querySelector(`[data-transfer-tx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.statusSuggestion,
        confirmedByDoctor: modal.querySelector(`[data-transfer-tx-include="${doc.id}:${candidate.id}"]`)?.checked || false
      };
      });
      const vitalSignsCandidates = (doc.vitalSignsCandidates || []).map((candidate) => {
        const key = `${doc.id}:${candidate.id}`;
        const pa = modal.querySelector(`[data-transfer-vitals-pa="${key}"]`)?.value?.trim() || "";
        const pressureMatch = pa.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
        return {
          ...candidate,
          include: modal.querySelector(`[data-transfer-vitals-include="${key}"]`)?.checked || false,
          vitalSigns: {
            ...(candidate.vitalSigns || {}),
            bloodPressure: pressureMatch ? { systolic: Number(pressureMatch[1]), diastolic: Number(pressureMatch[2]), unit: "mmHg", rawValue: pa } : candidate.vitalSigns?.bloodPressure,
            temperature: { value: Number(modal.querySelector(`[data-transfer-vitals-temp="${key}"]`)?.value || NaN), unit: "°C" },
            heartRate: { value: Number(modal.querySelector(`[data-transfer-vitals-fc="${key}"]`)?.value || NaN), unit: "lpm" },
            respiratoryRate: { value: Number(modal.querySelector(`[data-transfer-vitals-fr="${key}"]`)?.value || NaN), unit: "rpm" },
            oxygenSaturation: { value: Number(modal.querySelector(`[data-transfer-vitals-sato2="${key}"]`)?.value || NaN), unit: "%" },
            capillaryGlucose: { value: Number(modal.querySelector(`[data-transfer-vitals-glucose="${key}"]`)?.value || NaN), unit: "mg/dL" },
            weight: { value: Number(modal.querySelector(`[data-transfer-vitals-peso="${key}"]`)?.value || NaN), unit: "kg" },
            height: { value: Number(modal.querySelector(`[data-transfer-vitals-talla="${key}"]`)?.value || NaN), unit: "m" },
            bmi: { value: Number(modal.querySelector(`[data-transfer-vitals-imc="${key}"]`)?.value || NaN), unit: "kg/m²" }
          }
        };
      });
      const noteSegments = (doc.noteSegments || []).map((segment) => {
        const prefix = `${doc.id}:${segment.id}`;
        const segmentSections = Object.fromEntries(Object.keys(segment.sections || {}).map((key) => [
          key,
          modal.querySelector(`[data-transfer-section="${prefix}:${key}"]`)?.value ?? segment.sections[key] ?? ""
        ]));
        const segmentDiagnoses = (segment.diagnosisCandidates || []).map((candidate) => {
          const key = `${prefix}:${candidate.id}`;
          const checked = modal.querySelector(`[data-transfer-dx-include="${key}"]`)?.checked || false;
          return {
            ...candidate,
            include: checked,
            selectedForImport: checked,
            normalizedLabel: modal.querySelector(`[data-transfer-dx-name="${key}"]`)?.value?.trim() || candidate.normalizedLabel || "",
            diagnosisName: modal.querySelector(`[data-transfer-dx-name="${key}"]`)?.value?.trim() || candidate.diagnosisName || candidate.normalizedLabel || "",
            code: modal.querySelector(`[data-transfer-dx-code="${key}"]`)?.value?.trim() || candidate.code || "",
            codingSystem: modal.querySelector(`[data-transfer-dx-system="${key}"]`)?.value || "",
            system: modal.querySelector(`[data-transfer-dx-system="${key}"]`)?.value || candidate.system || candidate.codingSystem || "",
            statusSuggestion: modal.querySelector(`[data-transfer-dx-status="${key}"]`)?.value || candidate.statusSuggestion,
            status: modal.querySelector(`[data-transfer-dx-status="${key}"]`)?.value || candidate.status || candidate.statusSuggestion,
            principal: modal.querySelector(`[data-transfer-dx-principal="${key}"]`)?.checked || false,
            isPrimary: modal.querySelector(`[data-transfer-dx-principal="${key}"]`)?.checked || false,
            confirmedByDoctor: checked
          };
        });
        const segmentTreatments = (segment.treatmentCandidates || []).map((candidate) => {
          const key = `${prefix}:${candidate.id}`;
          const checked = modal.querySelector(`[data-transfer-tx-include="${key}"]`)?.checked || false;
          const medicationName = modal.querySelector(`[data-transfer-tx-name="${key}"]`)?.value?.trim() || candidate.medicationName || "";
          return {
            ...candidate,
            include: checked,
            selectedForImport: checked,
            medicationName,
            catalogMedicationId: reviewedCatalogMedicationId(key, candidate, medicationName),
            presentation: modal.querySelector(`[data-transfer-tx-presentation="${key}"]`)?.value?.trim() || candidate.presentation || "",
            strengthValue: modal.querySelector(`[data-transfer-tx-strength="${key}"]`)?.value?.trim() || candidate.strengthValue || "",
            strengthUnit: modal.querySelector(`[data-transfer-tx-strength-unit="${key}"]`)?.value?.trim() || candidate.strengthUnit || candidate.doseUnit || "",
            administrationQuantity: modal.querySelector(`[data-transfer-tx-admin-quantity="${key}"]`)?.value?.trim() || candidate.administrationQuantity || "",
            administrationUnit: modal.querySelector(`[data-transfer-tx-admin-unit="${key}"]`)?.value?.trim() || candidate.administrationUnit || "",
            dose: modal.querySelector(`[data-transfer-tx-strength="${key}"]`)?.value?.trim() || candidate.dose || "",
            doseUnit: modal.querySelector(`[data-transfer-tx-strength-unit="${key}"]`)?.value?.trim() || candidate.doseUnit || "",
            route: modal.querySelector(`[data-transfer-tx-route="${key}"]`)?.value?.trim() || "",
            frequencyRaw: modal.querySelector(`[data-transfer-tx-frequency="${key}"]`)?.value?.trim() || "",
            scheduleText: modal.querySelector(`[data-transfer-tx-schedule="${key}"]`)?.value?.trim() || candidate.scheduleText || "",
            schedule: modal.querySelector(`[data-transfer-tx-schedule="${key}"]`) ? parseMedicationSchedules(modal.querySelector(`[data-transfer-tx-schedule="${key}"]`).value) : (candidate.schedule || []),
            action: modal.querySelector(`[data-transfer-tx-status="${key}"]`)?.value || candidate.action || candidate.statusSuggestion,
            statusSuggestion: modal.querySelector(`[data-transfer-tx-status="${key}"]`)?.value || candidate.statusSuggestion,
            confirmedByDoctor: checked
          };
        });
        const segmentTreatmentPlanCandidates = (segment.treatmentPlanCandidates || []).map((candidate) => {
          const key = `${prefix}:${candidate.id}`;
          const checked = modal.querySelector(`[data-transfer-plan-include="${key}"]`)?.checked || false;
          return {
            ...candidate,
            include: checked,
            selectedForImport: checked,
            instructionType: modal.querySelector(`[data-transfer-plan-type="${key}"]`)?.value || candidate.instructionType || "otherInstruction",
            text: modal.querySelector(`[data-transfer-plan-text="${key}"]`)?.value?.trim() || "",
            value: modal.querySelector(`[data-transfer-plan-text="${key}"]`)?.value?.trim() || ""
          };
        });
        const segmentTypeKey = modal.querySelector(`[data-transfer-segment-type="${prefix}"]`)?.value || segment.confirmedType?.key || "tipo_no_reconocido";
        const segmentType = NOTE_TYPE_RULES.find((item) => item.key === segmentTypeKey) || { key: "tipo_no_reconocido", label: "Tipo no reconocido" };
        return {
          ...segment,
          omitted: modal.querySelector(`[data-transfer-omit-segment="${prefix}"]`)?.checked || false,
          sections: segmentSections,
          metadata: {
            ...(segment.metadata || {}),
            documentDate: modal.querySelector(`[data-transfer-segment-date="${prefix}"]`)?.value || "",
            documentHour: modal.querySelector(`[data-transfer-segment-time="${prefix}"]`)?.value || ""
          },
          confirmedType: segmentType,
          diagnosisCandidates: segmentDiagnoses,
          treatmentCandidates: segmentTreatments,
          treatmentPlanCandidates: segmentTreatmentPlanCandidates,
          vitalSignsCandidates: (segment.vitalSignsCandidates || []).map((segmentVital) => vitalSignsCandidates.find((item) => item.id === segmentVital.id) || segmentVital)
        };
      });
      const primarySegment = noteSegments[0];
      return {
        ...doc,
        omitted: modal.querySelector(`[data-transfer-omit-doc="${doc.id}"]`)?.checked || false,
        multipleNotesMode: doc.multipleNotesMode || "auto",
        containsMultipleNotes: (doc.noteSegments || []).length > 1,
        confirmedType: rule,
        vitalSignsCandidates,
        noteSegments,
        sections: primarySegment?.sections || doc.sections,
        diagnosisCandidates: primarySegment?.diagnosisCandidates || diagnosisCandidates,
        treatmentCandidates: primarySegment?.treatmentCandidates || treatmentCandidates,
        treatmentPlanCandidates: primarySegment?.treatmentPlanCandidates || doc.treatmentPlanCandidates || []
      };
    });
    return {
      ...group,
      action,
      selectedPatientId,
      selectedResolution,
      selectedExistingPatientId: duplicateAction === "link-existing" ? selectedPatientId : null,
      duplicateResolution: duplicateControl ? {
        ...(group.duplicateResolution || {}),
        action: duplicateAction,
        matchedPatientId: duplicateControl.dataset.patientId || group.duplicateResolution?.matchedPatientId || "",
        resolvedAt: new Date().toISOString()
      } : group.duplicateResolution || null,
      confirmedFields,
      omitted: modal.querySelector(`[data-transfer-omit-group="${group.id}"]`)?.checked || false,
      documents
    };
  });
}

export function renderTransferResults(results = []) {
  ensureRoot().querySelector("[data-transfer-review]").innerHTML = `
    <section class="patient-transfer-summary">
      <h3>Resultado final</h3>
      ${results.map((result) => `
        <article class="patient-transfer-result ${result.status}">
          <strong>${result.status === "completed" ? "Traspaso completado" : result.status === "partially_completed" ? "Traspaso parcialmente completado" : "Traspaso no completado"}</strong>
          <span>Notas: ${result.notesCreated || 0} creadas / ${result.notesExisting || 0} ya existentes</span>
          <span>Signos vitales: ${result.vitalSignsCreated || 0} registrados / Somatometria: ${result.anthropometryCreated || 0}</span>
          <span>Diagnosticos: ${result.diagnosesCreated || 0} registrados / ${result.diagnosesOmitted || 0} omitidos</span>
          <span>Tratamientos: ${result.treatmentsCreated || 0} registrados / ${result.treatmentsOmitted || 0} omitidos</span>
          <span>Documento original: ${result.sourceSaved === false ? "No guardado" : "Guardado"} / Auditoria: ${result.auditRegistered === false ? "No registrada" : "Registrada"}</span>
          <span>Paciente: ${escapeHtml(result.patientName || (result.patientId ? "Paciente creado/asociado" : "No creado"))} · Notas importadas: ${result.notesCreated || 0}</span>
          <span>Paciente reutilizado: ${result.patientReused ? "si" : "no"} · Notas ya existentes: ${result.notesExisting || 0} · Duplicados evitados: ${result.duplicatesAvoided || 0}</span>
          ${result.stage ? `<span>Etapa: ${escapeHtml(result.stage)}</span>` : ""}
          ${result.error ? `<small>${escapeHtml(result.error)}</small>` : ""}
          ${result.patientId ? `<a href="paciente.html?id=${encodeURIComponent(result.patientId)}" target="_blank" rel="noopener">Abrir expediente</a>` : ""}
          ${result.patientId ? `<a href="paciente.html?id=${encodeURIComponent(result.patientId)}#diagnosticos" target="_blank" rel="noopener">Ver diagnósticos</a>` : ""}
          ${result.patientId ? `<a href="paciente.html?id=${encodeURIComponent(result.patientId)}#tratamientos" target="_blank" rel="noopener">Ver tratamiento</a>` : ""}
          ${result.status !== "completed" ? `<button type="button" data-transfer-retry>Reintentar</button><button type="button" data-transfer-back-review>Volver a revisión</button>` : ""}
          <button type="button" data-transfer-import-another>Importar otro paciente</button>
          <button type="button" data-transfer-close-result>Cerrar</button>
        </article>`).join("")}
    </section>`;
}

export function renderTransferFailure(error) {
  ensureRoot().querySelector("[data-transfer-review]").insertAdjacentHTML("afterbegin", `
    <section class="patient-transfer-summary">
      <h3>Traspaso no completado</h3>
      <p>Etapa: ${escapeHtml(error?.stage || "guardado")}</p>
      <p>Motivo: ${escapeHtml(error?.message || String(error || "Error desconocido"))}</p>
      <p>Detalle técnico: ${escapeHtml(error?.message || String(error || "Error desconocido"))}</p>
      <button type="button" data-transfer-retry>Reintentar</button>
      <button type="button" data-transfer-back-review>Volver a revisión</button>
      <button type="button" data-transfer-close-result>Cerrar</button>
    </section>
  `);
}

export function syncPatientNameInputs(event) {
  const input = event.target.closest("[data-transfer-field]");
  if (!input) return;
  const [groupId, key] = String(input.dataset.transferField || "").split(":");
  if (key === "expediente") {
    input.value = normalizeRecordNumber(input.value);
    return;
  }
  if (!groupId || !["nombres", "apellidoPaterno", "apellidoMaterno"].includes(key)) return;
  const modal = ensureRoot();
  const fullNameInput = modal.querySelector(`[data-transfer-field="${groupId}:nombre"]`);
  if (!fullNameInput) return;
  const nombres = modal.querySelector(`[data-transfer-field="${groupId}:nombres"]`)?.value || "";
  const apellidoPaterno = modal.querySelector(`[data-transfer-field="${groupId}:apellidoPaterno"]`)?.value || "";
  const apellidoMaterno = modal.querySelector(`[data-transfer-field="${groupId}:apellidoMaterno"]`)?.value || "";
  fullNameInput.value = construirNombreCompletoPaciente({ nombres, apellidoPaterno, apellidoMaterno });
}
