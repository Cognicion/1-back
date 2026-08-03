import { FIELD_RULES, NOTE_TYPE_RULES } from "../../importacionDocx/docxImportConfig.js";
import { construirNombreCompletoPaciente } from "../../../utils/nombresPacientes.js";

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
          <h2 id="patientTransferTitle">Traspasar pacientes</h2>
          <span>Cargue notas clinicas previas en formato DOCX para crear pacientes y agregar sus antecedentes documentales a COGNICION.</span>
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
}

export function isTransferSaving() {
  return ensureRoot().dataset.saving === "true";
}

export function renderTransferFiles(files = []) {
  const modal = ensureRoot();
  modal.querySelector("[data-transfer-count]").textContent = `${files.length} archivos`;
  modal.querySelector("[data-transfer-files]").innerHTML = files.length ? files.map((item) => `
    <article class="patient-transfer-file ${item.status || ""}">
      <div>
        <strong>${escapeHtml(item.file.name)}</strong>
        <span>${fileSize(item.file.size)} · ${escapeHtml(item.statusLabel || "Pendiente")}</span>
        ${item.error ? `<small>${escapeHtml(item.error)}</small>` : ""}
      </div>
      <button type="button" data-transfer-remove-file="${item.id}">Eliminar</button>
    </article>`).join("") : "";
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
  if (!candidates.length) return "";
  return `
    <section class="patient-transfer-candidates">
      <h4>Diagnosticos detectados</h4>
      ${candidates.map((candidate) => `
        <article>
          <label><input type="checkbox" data-transfer-dx-include="${doc.id}:${candidate.id}"> Incluir</label>
          <input data-transfer-dx-name="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.normalizedLabel || candidate.rawText || "")}" placeholder="Diagnostico">
          <input data-transfer-dx-code="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.code || "")}" placeholder="Codigo">
          <select data-transfer-dx-system="${doc.id}:${candidate.id}">
            ${["", "CIE-10", "CIE-11", "DSM-5"].map((item) => option(item, item || "Sin sistema", item === (candidate.codingSystem || ""))).join("")}
          </select>
          <select data-transfer-dx-status="${doc.id}:${candidate.id}">
            ${["Confirmado", "Probable", "A descartar", "Diferencial", "En seguimiento", "Antecedente", "Remision", "Descartado"].map((item) => option(item, item, item === candidate.statusSuggestion)).join("")}
          </select>
          <label><input type="checkbox" data-transfer-dx-principal="${doc.id}:${candidate.id}"> Principal</label>
          <small>Fuente: ${escapeHtml(candidate.sourceSection || "")} - ${escapeHtml(candidate.rawText || "")}</small>
        </article>`).join("")}
    </section>`;
}

function renderTreatmentCandidates(doc) {
  const candidates = doc.treatmentCandidates || [];
  if (!candidates.length) return "";
  return `
    <section class="patient-transfer-candidates">
      <h4>Tratamientos detectados</h4>
      ${candidates.map((candidate) => `
        <article>
          <label><input type="checkbox" data-transfer-tx-include="${doc.id}:${candidate.id}"> Incluir</label>
          <input data-transfer-tx-name="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.medicationName || "")}" placeholder="Medicamento">
          <input data-transfer-tx-dose="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.dose || "")}" placeholder="Dosis">
          <input data-transfer-tx-unit="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.doseUnit || "")}" placeholder="Unidad">
          <input data-transfer-tx-route="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.route || "")}" placeholder="Via">
          <input data-transfer-tx-frequency="${doc.id}:${candidate.id}" value="${escapeHtml(candidate.frequencyRaw || "")}" placeholder="Frecuencia">
          <select data-transfer-tx-status="${doc.id}:${candidate.id}">
            ${["Inicia", "Continua", "Aumenta", "Disminuye", "Suspende", "Pendiente traer", "Antecedente", "Otro"].map((item) => option(item, item, item === candidate.statusSuggestion)).join("")}
          </select>
          <small>Fuente: ${escapeHtml(candidate.sourceSection || "")} - ${escapeHtml(candidate.sourceText || "")}</small>
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

function renderDocument(doc, groups = [], currentGroupId = "") {
  const selected = doc.confirmedType?.key || doc.metadata?.suggestedType?.key || "tipo_no_reconocido";
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
      <div class="patient-transfer-sections">
        <strong>Secciones encontradas</strong>
        <span>${Object.keys(doc.sections || {}).length ? Object.keys(doc.sections).join(", ") : "Sin secciones reconocidas"}</span>
      </div>
      ${renderVitalSignsCandidates(doc)}
      ${renderDiagnosisCandidates(doc)}
      ${renderTreatmentCandidates(doc)}
      ${renderExtractionDebug(doc)}
      <textarea readonly>${escapeHtml(doc.fullText || "")}</textarea>
    </details>`;
}

export function renderDetectedGroups(groups = []) {
  const modal = ensureRoot();
  const saveButton = modal.querySelector("[data-transfer-save]");
  saveButton.disabled = !groups.length;
  modal.querySelector("[data-transfer-review]").innerHTML = groups.length ? `
    <section class="patient-transfer-summary">
      <h3>Resumen del traspaso</h3>
      <p>Pacientes probables: ${groups.length} · Notas: ${groups.reduce((total, group) => total + group.documents.length, 0)} · Con conflictos: ${groups.filter((group) => group.ambiguous).length}</p>
    </section>
    ${groups.map((group, index) => `
      <article class="patient-transfer-group">
        <header>
          <div>
            <p>Paciente probable ${index + 1}</p>
            <h3>${escapeHtml(group.fields?.nombre?.value || "Paciente sin nombre detectado")}</h3>
            <span>${group.fields?.expediente?.value ? `Expediente: ${escapeHtml(group.fields.expediente.value)}` : "Sin expediente detectado"}</span>
          </div>
          <label><input type="checkbox" data-transfer-omit-group="${group.id}" ${group.omitted ? "checked" : ""}> Omitir paciente</label>
        </header>
        ${group.ambiguous ? `<div class="patient-transfer-warning">Datos incompletos o contradictorios. Revise antes de guardar.</div>` : ""}
        <div class="patient-transfer-mode">
          <label><input type="radio" name="transfer-action-${group.id}" value="create" data-transfer-action="${group.id}" ${group.action !== "associate" ? "checked" : ""}> Crear paciente</label>
          <label><input type="radio" name="transfer-action-${group.id}" value="associate" data-transfer-action="${group.id}" ${group.action === "associate" ? "checked" : ""}> Asociar a paciente existente</label>
        </div>
        ${renderCandidateSelect(group)}
        <div class="patient-transfer-field-grid">${renderFields(group)}</div>
        <div class="patient-transfer-documents">${group.documents.map((doc) => renderDocument(doc, groups, group.id)).join("")}</div>
      </article>`).join("")}` : "";
}

export function readTransferReview(groups = []) {
  const modal = ensureRoot();
  return groups.map((group) => {
    const action = modal.querySelector(`[data-transfer-action="${group.id}"]:checked`)?.value || "create";
    const selectedPatientId = modal.querySelector(`[data-transfer-existing="${group.id}"]`)?.value || "";
    const confirmedFields = {};
    FIELD_RULES.forEach((rule) => {
      confirmedFields[rule.key] = modal.querySelector(`[data-transfer-field="${group.id}:${rule.key}"]`)?.value?.trim() || "";
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
        normalizedLabel: modal.querySelector(`[data-transfer-dx-name="${doc.id}:${candidate.id}"]`)?.value?.trim() || candidate.normalizedLabel || "",
        code: modal.querySelector(`[data-transfer-dx-code="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        codingSystem: modal.querySelector(`[data-transfer-dx-system="${doc.id}:${candidate.id}"]`)?.value || "",
        statusSuggestion: modal.querySelector(`[data-transfer-dx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.statusSuggestion,
        principal: modal.querySelector(`[data-transfer-dx-principal="${doc.id}:${candidate.id}"]`)?.checked || false,
        confirmedByDoctor: modal.querySelector(`[data-transfer-dx-include="${doc.id}:${candidate.id}"]`)?.checked || false
      }));
      const treatmentCandidates = (doc.treatmentCandidates || []).map((candidate) => ({
        ...candidate,
        include: modal.querySelector(`[data-transfer-tx-include="${doc.id}:${candidate.id}"]`)?.checked || false,
        medicationName: modal.querySelector(`[data-transfer-tx-name="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        dose: modal.querySelector(`[data-transfer-tx-dose="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        doseUnit: modal.querySelector(`[data-transfer-tx-unit="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        route: modal.querySelector(`[data-transfer-tx-route="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        frequencyRaw: modal.querySelector(`[data-transfer-tx-frequency="${doc.id}:${candidate.id}"]`)?.value?.trim() || "",
        statusSuggestion: modal.querySelector(`[data-transfer-tx-status="${doc.id}:${candidate.id}"]`)?.value || candidate.statusSuggestion,
        confirmedByDoctor: modal.querySelector(`[data-transfer-tx-include="${doc.id}:${candidate.id}"]`)?.checked || false
      }));
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
            weight: { value: Number(modal.querySelector(`[data-transfer-vitals-peso="${key}"]`)?.value || NaN), unit: "kg" },
            height: { value: Number(modal.querySelector(`[data-transfer-vitals-talla="${key}"]`)?.value || NaN), unit: "m" },
            bmi: { value: Number(modal.querySelector(`[data-transfer-vitals-imc="${key}"]`)?.value || NaN), unit: "kg/m²" }
          }
        };
      });
      return {
        ...doc,
        omitted: modal.querySelector(`[data-transfer-omit-doc="${doc.id}"]`)?.checked || false,
        confirmedType: rule,
        vitalSignsCandidates,
        diagnosisCandidates,
        treatmentCandidates
      };
    });
    return {
      ...group,
      action,
      selectedPatientId,
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
          <strong>${result.status === "completed" ? "Traspaso completado" : "Traspaso no completado"}</strong>
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
    </section>
  `);
}

export function syncPatientNameInputs(event) {
  const input = event.target.closest("[data-transfer-field]");
  if (!input) return;
  const [groupId, key] = String(input.dataset.transferField || "").split(":");
  if (!groupId || !["nombres", "apellidoPaterno", "apellidoMaterno"].includes(key)) return;
  const modal = ensureRoot();
  const fullNameInput = modal.querySelector(`[data-transfer-field="${groupId}:nombre"]`);
  if (!fullNameInput) return;
  const nombres = modal.querySelector(`[data-transfer-field="${groupId}:nombres"]`)?.value || "";
  const apellidoPaterno = modal.querySelector(`[data-transfer-field="${groupId}:apellidoPaterno"]`)?.value || "";
  const apellidoMaterno = modal.querySelector(`[data-transfer-field="${groupId}:apellidoMaterno"]`)?.value || "";
  fullNameInput.value = construirNombreCompletoPaciente({ nombres, apellidoPaterno, apellidoMaterno });
}
