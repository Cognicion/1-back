import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  guardarConfiguracionEstilo,
  establecerConfiguracionEstiloPredeterminada
} from "./services/voiceNoteStyleConfigService.js?v=20260719-format-entitlements";

const params = new URLSearchParams(location.search);
const SECTION_CATALOG = [
  ["evolution", "Evolucion"],
  ["subjective", "Subjetivo"],
  ["currentIllness", "Padecimiento actual"],
  ["reasonForConsultation", "Motivo de consulta"],
  ["familyHistory", "Antecedentes heredofamiliares"],
  ["pathologicalHistory", "Antecedentes personales patologicos"],
  ["nonPathologicalHistory", "Antecedentes personales no patologicos"],
  ["perinatalHistory", "Antecedentes perinatales"],
  ["psychomotorDevelopment", "Desarrollo psicomotor"],
  ["gynecoObstetricHistory", "Antecedentes ginecoobstetricos"],
  ["systemsReview", "Interrogatorio por aparatos y sistemas"],
  ["physicalExam", "Exploracion fisica"],
  ["neurologicalExam", "Exploracion neurologica"],
  ["mentalExam", "Examen mental"],
  ["vitalSigns", "Signos vitales"],
  ["anthropometry", "Antropometria"],
  ["studyResults", "Resultados de estudios"],
  ["laboratories", "Laboratorios"],
  ["imaging", "Gabinete"],
  ["clinicalScales", "Escalas clinicas"],
  ["riskAssessment", "Evaluacion de riesgo"],
  ["clinicalAnalysis", "Analisis clinico"],
  ["diagnosticImpression", "Impresion diagnostica"],
  ["diagnoses", "Diagnosticos"],
  ["prognosis", "Pronostico"],
  ["plan", "Plan"],
  ["pharmacologicalTreatment", "Tratamiento farmacologico"],
  ["nonPharmacologicalTreatment", "Tratamiento no farmacologico"],
  ["indications", "Indicaciones"],
  ["psychoeducation", "Psicoeducacion"],
  ["supportNetwork", "Red de apoyo"],
  ["followUp", "Seguimiento"],
  ["destination", "Destino"],
  ["recommendations", "Recomendaciones"],
  ["referrals", "Referencias"],
  ["freeSection", "Apartado libre"]
];

const DEFAULT_SECTIONS = ["evolution", "mentalExam", "clinicalAnalysis", "plan"].map((key, index) => {
  const [, displayName] = SECTION_CATALOG.find(([itemKey]) => itemKey === key) || [key, key];
  return {
    internalKey: key,
    displayName,
    enabled: true,
    hidden: false,
    order: index + 1,
    required: false,
    condition: "data_available",
    sourceDomains: key === "mentalExam" ? ["mental_exam_components"] : ["patient_report", "clinician_manual_observation"],
    format: "narrative",
    detailLevel: "intermediate",
    allowQuotes: key === "evolution",
    allowManualObservations: ["evolution", "mentalExam"].includes(key),
    instructions: "",
    destinationField: key
  };
});

const state = {
  user: null,
  sections: structuredClone(DEFAULT_SECTIONS)
};

const $ = (id) => document.getElementById(id);
const clean = (value = "") => String(value || "").replace(/<[^>]*>/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

function options(list, selected) {
  return list.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function sectionCatalogOptions(selected) {
  return options(SECTION_CATALOG, selected);
}

function renderSections() {
  const container = $("styleSections");
  if (!container) return;
  state.sections.sort((a, b) => a.order - b.order);
  container.innerHTML = state.sections.map((section, index) => `
    <article class="style-section-card" data-section-index="${index}">
      <div class="style-section-grid">
        <label>Apartado base
          <select data-section-field="internalKey">${sectionCatalogOptions(section.internalKey)}</select>
        </label>
        <label>Nombre visible
          <input data-section-field="displayName" value="${clean(section.displayName)}" maxlength="80">
        </label>
        <label>Estado
          <select data-section-field="enabled">
            <option value="true" ${section.enabled ? "selected" : ""}>Incluir</option>
            <option value="false" ${!section.enabled ? "selected" : ""}>Omitir</option>
          </select>
        </label>
        <label>Oculto del editor
          <select data-section-field="hidden">
            <option value="false" ${!section.hidden ? "selected" : ""}>Visible</option>
            <option value="true" ${section.hidden ? "selected" : ""}>Oculto</option>
          </select>
        </label>
        <label>Condicion
          <select data-section-field="condition">
            <option value="always" ${section.condition === "always" ? "selected" : ""}>Siempre</option>
            <option value="data_available" ${section.condition === "data_available" ? "selected" : ""}>Solo si existen datos</option>
            <option value="manual" ${section.condition === "manual" ? "selected" : ""}>Solo si se selecciona manualmente</option>
          </select>
        </label>
        <label>Formato
          <select data-section-field="format">
            <option value="narrative" ${section.format === "narrative" ? "selected" : ""}>Narrativa</option>
            <option value="paragraph" ${section.format === "paragraph" ? "selected" : ""}>Parrafo</option>
            <option value="list" ${section.format === "list" ? "selected" : ""}>Lista</option>
            <option value="structured" ${section.format === "structured" ? "selected" : ""}>Estructurada</option>
          </select>
        </label>
        <label>Instrucciones
          <textarea data-section-field="instructions" maxlength="400">${clean(section.instructions)}</textarea>
        </label>
      </div>
      <div class="style-section-actions">
        <button type="button" data-section-action="up" class="boton-secundario">Subir</button>
        <button type="button" data-section-action="down" class="boton-secundario">Bajar</button>
        <button type="button" data-section-action="duplicate" class="boton-secundario">Duplicar</button>
        <button type="button" data-section-action="remove" class="boton-secundario">Eliminar</button>
      </div>
    </article>
  `).join("");
}

function readSectionsFromDom() {
  document.querySelectorAll("[data-section-index]").forEach((card) => {
    const index = Number(card.dataset.sectionIndex);
    const section = state.sections[index];
    if (!section) return;
    card.querySelectorAll("[data-section-field]").forEach((field) => {
      const key = field.dataset.sectionField;
      if (key === "enabled" || key === "hidden") section[key] = field.value === "true";
      else if (key === "internalKey") {
        section.internalKey = field.value;
        if (!section.displayName) section.displayName = SECTION_CATALOG.find(([itemKey]) => itemKey === field.value)?.[1] || field.value;
      } else section[key] = clean(field.value);
    });
  });
}

function buildConfig(status = "draft") {
  readSectionsFromDom();
  const now = new Date().toISOString();
  return {
    id: `custom-style-${Date.now().toString(36)}`,
    userId: state.user?.uid || "",
    name: clean($("styleName")?.value).slice(0, 80) || "Estilo personalizado",
    description: clean($("styleDescription")?.value).slice(0, 180),
    version: 1,
    context: $("styleCareSetting")?.value || "private_practice",
    type: "solo_estructura_y_visibilidad",
    isDefault: $("styleDefault")?.value === "true",
    componentOrder: state.sections.map((section) => section.internalKey),
    componentStates: {},
    structuralPreferences: {
      specialty: $("styleSpecialty")?.value || "psychiatry",
      careSetting: $("styleCareSetting")?.value || "private_practice",
      modality: $("styleModality")?.value || "in_person",
      detailLevel: $("styleDetailLevel")?.value || "intermediate",
      tone: $("styleTone")?.value || "institutional",
      visibility: $("styleVisibility")?.value || "private",
      status,
      sections: state.sections
    },
    quotePreferences: {
      mode: $("styleQuoteMode")?.value || "omit"
    },
    standardizedDefaults: {},
    containsClinicalDefaults: false,
    createdAt: now,
    updatedAt: now
  };
}

async function saveStyle(status = "saved") {
  if (!state.user?.uid) throw new Error("Sesion no disponible.");
  const config = await guardarConfiguracionEstilo(state.user.uid, buildConfig(status));
  if (config.isDefault) await establecerConfiguracionEstiloPredeterminada(state.user.uid, config.id);
  $("styleStatus").textContent = status === "draft" ? "Borrador guardado." : "Estilo guardado.";
}

function renderPreview() {
  const config = buildConfig("preview");
  const sections = config.structuralPreferences.sections
    .filter((section) => section.enabled && !section.hidden)
    .map((section) => `${section.displayName}\nTexto ficticio de ejemplo para revisar estructura.`)
    .join("\n\n");
  $("stylePreview").textContent = `Vista previa — datos ficticios\n\n${sections || "Sin apartados activos."}`;
}

function returnToVoice() {
  const returnUrl = params.get("returnUrl");
  if (returnUrl) {
    location.href = returnUrl;
    return;
  }
  const qs = new URLSearchParams();
  ["patientId", "id", "encounterId", "noteId"].forEach((key) => {
    const value = params.get(key);
    if (value) qs.set(key, value);
  });
  location.href = `nota-por-voz.html${qs.toString() ? `?${qs}` : ""}`;
}

function connectEvents() {
  $("btnReturnVoiceStyle")?.addEventListener("click", returnToVoice);
  $("btnCancelStyle")?.addEventListener("click", returnToVoice);
  $("btnPreviewStyle")?.addEventListener("click", renderPreview);
  $("btnSaveDraftStyle")?.addEventListener("click", () => saveStyle("draft").catch((error) => alert(error.message)));
  $("btnSaveStyle")?.addEventListener("click", () => saveStyle("saved").catch((error) => alert(error.message)));
  $("btnAddSection")?.addEventListener("click", () => {
    readSectionsFromDom();
    const next = structuredClone(DEFAULT_SECTIONS[0]);
    next.internalKey = "freeSection";
    next.displayName = "Apartado libre";
    next.order = state.sections.length + 1;
    state.sections.push(next);
    renderSections();
  });
  $("styleSections")?.addEventListener("click", (event) => {
    const action = event.target?.dataset?.sectionAction;
    if (!action) return;
    readSectionsFromDom();
    const index = Number(event.target.closest("[data-section-index]")?.dataset?.sectionIndex);
    if (!Number.isInteger(index)) return;
    if (action === "remove") state.sections.splice(index, 1);
    if (action === "duplicate") state.sections.splice(index + 1, 0, { ...state.sections[index], internalKey: `${state.sections[index].internalKey}_${Date.now().toString(36)}` });
    if (action === "up" && index > 0) [state.sections[index - 1], state.sections[index]] = [state.sections[index], state.sections[index - 1]];
    if (action === "down" && index < state.sections.length - 1) [state.sections[index + 1], state.sections[index]] = [state.sections[index], state.sections[index + 1]];
    state.sections.forEach((section, order) => { section.order = order + 1; });
    renderSections();
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  state.user = user;
  renderSections();
  connectEvents();
});
