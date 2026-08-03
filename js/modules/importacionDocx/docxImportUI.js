import { FIELD_RULES } from "./clinicalFieldParser.js";
import { SECTION_RULES } from "./clinicalSectionParser.js";

function escaparHTML(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const SECTION_LABELS = {
  motivoConsulta: "Motivo de consulta",
  padecimientoActual: "Padecimiento actual / Subjetivo",
  antecedentesHeredofamiliares: "Antecedentes heredofamiliares",
  antecedentesPersonales: "Antecedentes personales",
  objetivo: "Objetivo / Exploracion fisica",
  examenMental: "Examen mental",
  analisis: "Analisis",
  diagnosticos: "Diagnosticos",
  tratamiento: "Tratamiento",
  plan: "Plan",
  pronostico: "Pronostico",
  destino: "Destino"
};

export function asegurarImportacionDocxUI() {
  let modal = document.getElementById("modalImportacionDocx");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "modalImportacionDocx";
  modal.className = "docx-import-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="docx-import-panel" role="dialog" aria-modal="true" aria-labelledby="tituloImportacionDocx">
      <div class="docx-import-header">
        <div>
          <p>Importacion local deterministica</p>
          <h2 id="tituloImportacionDocx">Importar paciente / nota desde DOCX</h2>
        </div>
        <button type="button" data-docx-cerrar aria-label="Cerrar">x</button>
      </div>
      <div class="docx-import-body">
        <section class="docx-dropzone" data-docx-dropzone>
          <input id="archivoImportacionDocx" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
          <strong>Arrastra un archivo DOCX</strong>
          <span>o selecciona un documento clinico de Word</span>
          <button type="button" data-docx-seleccionar>Seleccionar archivo</button>
        </section>
        <div class="docx-import-progress" hidden>
          <div><span data-docx-estado>Esperando archivo...</span><span data-docx-porcentaje>0%</span></div>
          <progress data-docx-progress max="100" value="0"></progress>
        </div>
        <div data-docx-error class="docx-import-error" hidden></div>
        <div data-docx-duplicado class="docx-import-warning" hidden></div>
        <section data-docx-preview class="docx-import-preview" hidden></section>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

export function abrirImportacionDocxUI() {
  const modal = asegurarImportacionDocxUI();
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

export function cerrarImportacionDocxUI() {
  const modal = document.getElementById("modalImportacionDocx");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

export function mostrarErrorDocx(mensaje = "", detalles = null) {
  const error = document.querySelector("[data-docx-error]");
  if (!error) return;
  error.hidden = !mensaje;
  if (!mensaje) {
    error.innerHTML = "";
    return;
  }
  error.innerHTML = `
    <strong>${escaparHTML(mensaje)}</strong>
    <div class="docx-import-error-actions">
      <button type="button" data-docx-reintentar>Reintentar</button>
      <button type="button" data-docx-cancelar>Cerrar</button>
      ${detalles ? `<details><summary>Ver detalles tecnicos</summary><pre>${escaparHTML(JSON.stringify(detalles, null, 2))}</pre></details>` : ""}
    </div>
  `;
}

export function mostrarDuplicadoDocx(duplicado) {
  const aviso = document.querySelector("[data-docx-duplicado]");
  if (!aviso) return;
  aviso.hidden = !duplicado;
  aviso.textContent = duplicado
    ? "Este documento parece haber sido importado anteriormente. Revisa antes de confirmar para evitar duplicados."
    : "";
}

export function actualizarProgresoDocx(valor, texto) {
  const contenedor = document.querySelector(".docx-import-progress");
  const progress = document.querySelector("[data-docx-progress]");
  const estado = document.querySelector("[data-docx-estado]");
  const porcentaje = document.querySelector("[data-docx-porcentaje]");
  if (contenedor) contenedor.hidden = false;
  if (progress) progress.value = valor;
  if (estado) estado.textContent = texto;
  if (porcentaje) porcentaje.textContent = `${valor}%`;
}

function htmlCampos(campos = {}) {
  return FIELD_RULES.map((regla) => `
    <label>
      ${escaparHTML(regla.label)}
      <input data-docx-campo="${escaparHTML(regla.key)}" value="${escaparHTML(campos[regla.key] || "")}">
    </label>
  `).join("");
}

function htmlSecciones(secciones = {}) {
  const keys = Object.keys(SECTION_RULES);
  return keys.map((key) => `
    <label>
      ${escaparHTML(SECTION_LABELS[key] || key)}
      <textarea data-docx-seccion="${escaparHTML(key)}">${escaparHTML(secciones[key] || "")}</textarea>
    </label>
  `).join("");
}

function htmlPacientes(candidatos = []) {
  return `
    <select data-docx-paciente-existente>
      <option value="">Seleccionar paciente</option>
      ${candidatos.map((paciente) => `
        <option value="${escaparHTML(paciente.id)}">
          ${escaparHTML(paciente.nombre)}${paciente.expediente ? ` - ${escaparHTML(paciente.expediente)}` : ""}${paciente.score ? ` (posible coincidencia)` : ""}
        </option>
      `).join("")}
    </select>
  `;
}

export function renderizarPreviewDocx({ resultado, pacientes = [] }) {
  const preview = document.querySelector("[data-docx-preview]");
  if (!preview) return;
  const camposNoEncontrados = resultado.camposNoEncontrados || [];
  preview.hidden = false;
  preview.innerHTML = `
    <div class="docx-preview-grid">
      <section class="docx-preview-card">
        <h3>Paciente detectado</h3>
        <div class="docx-field-grid">${htmlCampos(resultado.campos)}</div>
      </section>
      <section class="docx-preview-card">
        <h3>Resumen de extraccion</h3>
        <p><strong>Tipo sugerido:</strong> ${escaparHTML(resultado.tipoNota.label)}</p>
        <p><strong>Bloques:</strong> ${escaparHTML(String(resultado.estructura.length))}</p>
        <p><strong>Secciones encontradas:</strong> ${escaparHTML(resultado.seccionesEncontradas.join(", ") || "Ninguna")}</p>
        <p><strong>Campos no encontrados:</strong> ${escaparHTML(camposNoEncontrados.join(", ") || "Ninguno")}</p>
      </section>
    </div>
    <section class="docx-preview-card">
      <h3>Creacion</h3>
      <div class="docx-import-mode">
        <label><input type="radio" name="docxImportMode" value="nuevo" checked> Crear nuevo paciente y agregar nota</label>
        <label><input type="radio" name="docxImportMode" value="existente"> Agregar nota a paciente existente</label>
      </div>
      <div class="docx-paciente-existente" data-docx-paciente-wrap hidden>
        ${htmlPacientes(pacientes)}
      </div>
    </section>
    <section class="docx-preview-card">
      <h3>Secciones clinicas</h3>
      <div class="docx-section-grid">${htmlSecciones(resultado.secciones)}</div>
    </section>
    <section class="docx-preview-card">
      <h3>Texto extraido</h3>
      <textarea data-docx-texto>${escaparHTML(resultado.textoPlano)}</textarea>
    </section>
    <div class="docx-import-actions">
      <button type="button" data-docx-cancelar>Cancelar</button>
      <button type="button" data-docx-confirmar>Confirmar importacion</button>
    </div>
  `;

  preview.querySelectorAll('input[name="docxImportMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const wrap = preview.querySelector("[data-docx-paciente-wrap]");
      if (wrap) wrap.hidden = radio.value !== "existente" || !radio.checked;
    });
  });
}

export function leerCorreccionesDocx() {
  const preview = document.querySelector("[data-docx-preview]");
  const campos = {};
  const secciones = {};
  preview?.querySelectorAll("[data-docx-campo]").forEach((input) => {
    campos[input.dataset.docxCampo] = input.value.trim();
  });
  preview?.querySelectorAll("[data-docx-seccion]").forEach((textarea) => {
    secciones[textarea.dataset.docxSeccion] = textarea.value.trim();
  });
  const textoPlano = preview?.querySelector("[data-docx-texto]")?.value || "";
  const modo = preview?.querySelector('input[name="docxImportMode"]:checked')?.value || "nuevo";
  const pacienteIdSeleccionado = preview?.querySelector("[data-docx-paciente-existente]")?.value || "";
  return { campos, secciones, textoPlano, modo, pacienteIdSeleccionado };
}
