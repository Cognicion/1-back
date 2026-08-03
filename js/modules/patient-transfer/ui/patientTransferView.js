import { FIELD_RULES, NOTE_TYPE_RULES } from "../../importacionDocx/docxImportConfig.js";

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
        ${candidates.map((candidate) => option(candidate.id, `${candidate.name} ${candidate.expediente ? `· ${candidate.expediente}` : ""}`)).join("")}
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
    const documents = group.documents.map((doc) => {
      const typeKey = modal.querySelector(`[data-transfer-note-type="${doc.id}"]`)?.value || "tipo_no_reconocido";
      const rule = NOTE_TYPE_RULES.find((item) => item.key === typeKey) || { key: "tipo_no_reconocido", label: "Tipo no reconocido" };
      return {
        ...doc,
        omitted: modal.querySelector(`[data-transfer-omit-doc="${doc.id}"]`)?.checked || false,
        confirmedType: rule
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
          <strong>${result.status === "completed" ? "Traspaso completado" : result.status}</strong>
          <span>Paciente: ${escapeHtml(result.patientId || "sin paciente")} · Notas importadas: ${result.notesCreated || 0}</span>
          ${result.error ? `<small>${escapeHtml(result.error)}</small>` : ""}
          ${result.patientId ? `<a href="paciente.html?id=${encodeURIComponent(result.patientId)}" target="_blank" rel="noopener">Abrir expediente</a>` : ""}
        </article>`).join("")}
    </section>`;
}
