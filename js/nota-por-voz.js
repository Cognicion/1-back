import { auth, obtenerFunctions } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerUsuario, listarPacientes, medicoPuedeVer } from "./services/usuarios.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { createNoteGenerationProvider } from "./services/noteGenerationProviders.js";
import { createConversationSegmentationProvider } from "./services/conversationSegmentationProviders.js";
import { segmentarConversacionClinica } from "./services/clinicalPipeline.js";
import {
  VOICE_NOTE_TYPES,
  VOICE_NOTE_STYLES,
  VOICE_NOTE_FIELD_REGISTRY,
  calcularDecadaDeVida,
  crearTransferSections,
  generarNotaVoz,
  guardarDraftGeneradoVozFirestore,
  guardarSesionVozFirestore,
  guardarTranscripcionVozFirestore,
  leerNotaExistente,
  transferirNotaVozABorrador
} from "./services/voiceNoteGenerationService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const params = new URLSearchParams(location.search);
const state = {
  user: null,
  perfil: null,
  patientId: params.get("id") || params.get("patientId") || "",
  encounterId: params.get("encounterId") || params.get("atencionId") || params.get("encuentro") || "actual",
  noteId: params.get("noteId") || params.get("notaId") || "",
  returnUrl: params.get("returnUrl") || "",
  patient: null,
  provider: null,
  segmentationProvider: null,
  generated: null,
  transferSections: [],
  transferredNoteId: "",
  conversationSegments: [],
  conversationWarnings: [],
  conversationUndo: [],
  conversationRedo: []
};

const $ = (id) => document.getElementById(id);

function escaparHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function calcularEdad(fechaNacimiento = "") {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return Number.isInteger(edad) && edad >= 0 ? edad : null;
}

function obtenerFechaNacimiento(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.fechaNacimiento || institucional.fechaNacimiento || datos.fecha_nacimiento || datos.fechaDeNacimiento || datos.fechaNac || datos.nacimiento || "";
}

function obtenerSexoExpediente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.sexo || institucional.sexo || datos.genero || institucional.genero || "";
}

function crearPatientContext(datos = state.patient || {}) {
  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edad = Number(datos.edad);
  return {
    id: state.patientId,
    nombreCompleto: obtenerNombrePacienteParaMostrar(datos) || datos.nombreCompleto || datos.nombre || "",
    fechaNacimiento,
    edad: Number.isInteger(edad) ? edad : calcularEdad(fechaNacimiento),
    sexo: obtenerSexoExpediente(datos),
    servicio: $("voiceServicio")?.value || datos.servicio || datos.servicioActual || "",
    diagnosticosActivos: datos.historialDiagnosticos || datos.diagnosticos || [],
    medicamentosActivos: datos.tratamientos || datos.tratamiento || [],
    alergias: datos.alergias || datos.datosClinicosResumen?.alergias || []
  };
}

function opcionesSelect(select, opciones, selected = "") {
  if (!select) return;
  select.innerHTML = opciones.map(([value, label]) =>
    `<option value="${escaparHTML(value)}" ${value === selected ? "selected" : ""}>${escaparHTML(label)}</option>`
  ).join("");
}

function actualizarLinks() {
  const qs = state.patientId ? `?id=${encodeURIComponent(state.patientId)}` : "";
  $("linkPacienteVoz")?.setAttribute("href", state.patientId ? `paciente.html${qs}` : "paciente.html");
  $("linkNotaTradicional")?.setAttribute("href", state.patientId ? `nota.html${qs}` : "nota.html");
  $("linkNotaVoz")?.setAttribute("href", state.patientId ? `nota-por-voz.html${qs}` : "nota-por-voz.html");
}

function mostrarPaso(step) {
  document.querySelectorAll(".voice-step-panel").forEach((panel) => {
    panel.hidden = panel.id !== `step-${step}`;
  });
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.classList.toggle("activo", button.dataset.stepTarget === step);
  });
  if (step === "transcripcion") sincronizarTranscripcionRevision();
  if (step === "revisar") renderRevision();
}

function snapshotDictado() {
  const base = window.cognicionDictado?.snapshot?.() || {};
  const corrected = $("voiceCorrectedTranscript")?.value?.trim() || $("textoDictadoClinico")?.value?.trim() || base.correctedTranscript || base.confirmedTranscript || "";
  return {
    ...base,
    correctedTranscript: corrected,
    confirmedTranscript: base.confirmedTranscript || corrected,
    patientId: state.patientId || base.patientId,
    encounterId: state.encounterId || base.encounterId
  };
}

function sincronizarTranscripcionRevision() {
  const textarea = $("voiceCorrectedTranscript");
  const texto = $("textoDictadoClinico")?.value || window.cognicionDictado?.snapshot?.().correctedTranscript || "";
function renderSegmentosConversacionales(texto = "") {
  const contenedor = $("voiceConversationSegments");
  if (!contenedor) return;
  const segmentos = segmentarConversacionClinica(texto);
  state.conversationSegments = Array.from(segmentos);
  state.conversationWarnings = segmentos.warnings || [];
  renderSegmentosConversacionalesActuales();
}

async function obtenerProveedorSegmentacion() {
  if (state.segmentationProvider) return state.segmentationProvider;
  try {
    const functionsInstance = await obtenerFunctions();
    state.segmentationProvider = createConversationSegmentationProvider({
      provider: "external",
      external: {
        callable: httpsCallable(functionsInstance, "segmentClinicalConversation"),
        fallbackToLocal: true
      }
    });
  } catch {
    state.segmentationProvider = createConversationSegmentationProvider({ provider: "local" });
  }
  return state.segmentationProvider;
}

async function segmentarConProveedor() {
  const texto = $("voiceCorrectedTranscript")?.value || $("textoDictadoClinico")?.value || "";
  if (!texto.trim()) {
    alert("No hay transcripcion para segmentar.");
    return;
  }
  setText("voiceSegmentationStatus", "Segmentando conversacion...");
  const provider = await obtenerProveedorSegmentacion();
  const result = await provider.segment({
    transcriptId: snapshotDictado().transcriptSessionId || "manual",
    transcriptSessionId: snapshotDictado().transcriptSessionId || "manual",
    patientId: state.patientId,
    encounterId: state.encounterId,
    text: texto,
    correctedTranscript: texto,
    transcriptSegments: snapshotDictado().transcriptSegments || []
  });
  state.conversationSegments = result.utterances || [];
  state.conversationWarnings = result.warnings || [];
  renderSegmentosConversacionalesActuales();
  setText("voiceSegmentationStatus", `Proveedor: ${result.provider || "local"} · turnos: ${state.conversationSegments.length}${result.fallback ? " · fallback" : ""}`);
}

const ROLE_LABELS = {
  clinician: "Profesional",
  patient: "Paciente",
  relative: "Familiar",
  unknown: "Desconocido"
};

const ACT_LABELS = {
  question: "Pregunta",
  answer: "Respuesta",
  observation: "Observacion",
  clinical_summary: "Resumen",
  clinical_assessment: "Analisis",
  plan: "Plan",
  correction: "Correccion",
  other: "Otro"
};

function etiquetaRolActo(segmento = {}) {
  return `${ROLE_LABELS[segmento.probableRole] || segmento.probableRole || "Desconocido"} · ${ACT_LABELS[segmento.speechAct] || segmento.speechAct || "Otro"}`;
}

function guardarHistorialSegmentacion() {
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  if (state.conversationUndo.length > 30) state.conversationUndo.shift();
  state.conversationRedo = [];
}

function normalizarSegmentosConversacion() {
  state.conversationSegments.forEach((segmento, index) => {
    segmento.sequence = index + 1;
    segmento.id ||= `utt-${index + 1}`;
    segmento.utteranceId ||= segmento.id;
    segmento.isQuestion = segmento.speechAct === "question";
    segmento.isAnswer = ["answer", "correction"].includes(segmento.speechAct);
  });
}

function opcionesSegmentacion(options, value) {
  return Object.entries(options).map(([key, label]) =>
    `<option value="${escaparHTML(key)}" ${key === value ? "selected" : ""}>${escaparHTML(label)}</option>`
  ).join("");
}

function renderSegmentosConversacionalesActuales() {
  const contenedor = $("voiceConversationSegments");
  if (!contenedor) return;
  normalizarSegmentosConversacion();
  const segmentos = state.conversationSegments.slice(0, 120);
  const advertencias = state.conversationWarnings || [];
  contenedor.innerHTML = `
    <div class="voice-segmentation-summary">
      <span>${segmentos.length} turnos</span>
      <span>Modo: linguistico</span>
      <span>${advertencias.length ? "Revisar advertencias" : "Segmentacion basica. Revise los hablantes."}</span>
      <button type="button" data-seg-undo ${state.conversationUndo.length ? "" : "disabled"}>Deshacer</button>
      <button type="button" data-seg-redo ${state.conversationRedo.length ? "" : "disabled"}>Rehacer</button>
    </div>
    ${advertencias.length ? `<div class="voice-segmentation-warnings">${advertencias.map((warning) => `<p>${escaparHTML(warning.message || "Requiere revision.")}</p>`).join("")}</div>` : ""}
    ${segmentos.length ? segmentos.map((segmento, index) => `
      <article class="voice-segment voice-segment-${escaparHTML(segmento.probableRole || "unknown")}">
        <header>
          <strong>${escaparHTML(etiquetaRolActo(segmento))}</strong>
          <span>#${segmento.sequence}</span>
        </header>
        <p>${escaparHTML(segmento.text || segmento.originalText || "")}</p>
        ${segmento.linkedUtteranceId || segmento.linkedQuestionId ? `<small>Vinculado con: ${escaparHTML(segmento.linkedUtteranceId || segmento.linkedQuestionId)}</small>` : ""}
        <div class="voice-segment-controls">
          <label>Rol
            <select data-seg-role="${index}">${opcionesSegmentacion(ROLE_LABELS, segmento.probableRole || "unknown")}</select>
          </label>
          <label>Acto
            <select data-seg-act="${index}">${opcionesSegmentacion(ACT_LABELS, segmento.speechAct || "other")}</select>
          </label>
          <button type="button" data-seg-split="${index}">Dividir</button>
          <button type="button" data-seg-join="${index}" ${index === 0 ? "disabled" : ""}>Unir con anterior</button>
        </div>
      </article>
    `).join("") : "Sin segmentos."}
  `;

  contenedor.querySelector("[data-seg-undo]")?.addEventListener("click", deshacerSegmentacion);
  contenedor.querySelector("[data-seg-redo]")?.addEventListener("click", rehacerSegmentacion);
  contenedor.querySelectorAll("[data-seg-role]").forEach((select) => {
    select.addEventListener("change", () => {
      guardarHistorialSegmentacion();
      state.conversationSegments[Number(select.dataset.segRole)].probableRole = select.value;
      renderSegmentosConversacionalesActuales();
    });
  });
  contenedor.querySelectorAll("[data-seg-act]").forEach((select) => {
    select.addEventListener("change", () => {
      guardarHistorialSegmentacion();
      state.conversationSegments[Number(select.dataset.segAct)].speechAct = select.value;
      renderSegmentosConversacionalesActuales();
    });
  });
  contenedor.querySelectorAll("[data-seg-split]").forEach((button) => {
    button.addEventListener("click", () => dividirSegmentoConversacional(Number(button.dataset.segSplit)));
  });
  contenedor.querySelectorAll("[data-seg-join]").forEach((button) => {
    button.addEventListener("click", () => unirSegmentoConversacional(Number(button.dataset.segJoin)));
  });
}

function dividirSegmentoConversacional(index) {
  const segmento = state.conversationSegments[index];
  if (!segmento) return;
  const base = segmento.text || segmento.originalText || "";
  const palabras = base.split(/\s+/).filter(Boolean);
  if (palabras.length < 4) return;
  guardarHistorialSegmentacion();
  const mitad = Math.max(2, Math.floor(palabras.length / 2));
  const primero = palabras.slice(0, mitad).join(" ");
  const segundo = palabras.slice(mitad).join(" ");
  const idNuevo = `utt-manual-${Date.now()}`;
  state.conversationSegments.splice(index, 1,
    { ...segmento, text: primero, originalText: primero },
    { ...segmento, id: idNuevo, utteranceId: idNuevo, text: segundo, originalText: segundo, requiresReview: true }
  );
  renderSegmentosConversacionalesActuales();
}

function unirSegmentoConversacional(index) {
  if (index <= 0 || !state.conversationSegments[index]) return;
  guardarHistorialSegmentacion();
  const anterior = state.conversationSegments[index - 1];
  const actual = state.conversationSegments[index];
  anterior.text = `${anterior.text || anterior.originalText || ""} ${actual.text || actual.originalText || ""}`.trim();
  anterior.originalText = `${anterior.originalText || ""} ${actual.originalText || actual.text || ""}`.trim();
  anterior.requiresReview = true;
  state.conversationSegments.splice(index, 1);
  renderSegmentosConversacionalesActuales();
}

function deshacerSegmentacion() {
  const previo = state.conversationUndo.pop();
  if (!previo) return;
  state.conversationRedo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(previo);
  renderSegmentosConversacionalesActuales();
}

function rehacerSegmentacion() {
  const siguiente = state.conversationRedo.pop();
  if (!siguiente) return;
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(siguiente);
  renderSegmentosConversacionalesActuales();
}
      ${segmento.linkedQuestionId ? `<small>Vinculado con: ${escaparHTML(segmento.linkedQuestionId)}</small>` : ""}
    </article>
  `).join("") : "Sin segmentos.";
}

async function cargarPaciente(patientId) {
  if (!patientId) return;
  if (!(await medicoPuedeVer(state.user.uid, patientId))) {
    alert("No tienes permiso para acceder a este paciente.");
    location.href = "medico.html";
    return;
  }
  const datos = await obtenerUsuario(patientId);
  state.patient = datos || {};
  state.patientId = patientId;
  const selector = $("uidPaciente");
  if (selector && !Array.from(selector.options).some((option) => option.value === patientId)) {
    const option = document.createElement("option");
    option.value = patientId;
    option.textContent = obtenerNombrePacienteParaMostrar(datos || {}) || patientId;
    selector.appendChild(option);
  }
  if (selector) selector.value = patientId;
  const ctx = crearPatientContext(datos || {});
  const decada = Number.isInteger(ctx.edad) ? calcularDecadaDeVida(ctx.edad) : null;
  const servicio = $("voiceServicio");
  if (servicio) servicio.value ||= ctx.servicio || "";
  $("voicePatientSummary").textContent = [
    ctx.nombreCompleto || "Paciente sin nombre",
    Number.isInteger(ctx.edad) ? `${ctx.edad} anos (${decada}a decada)` : "edad pendiente",
    ctx.sexo ? `sexo expediente: ${ctx.sexo}` : "sexo pendiente en expediente",
    `pacienteId: ${patientId}`
  ].join(" · ");
  actualizarLinks();
}

async function cargarListaPacientes() {
  const selector = $("uidPaciente");
  if (!selector) return;
  selector.innerHTML = '<option value="">Seleccionar paciente</option>';
  const snap = await listarPacientes(state.user.uid);
  snap.forEach((docPaciente) => {
    const datos = docPaciente.data();
    const option = document.createElement("option");
    option.value = docPaciente.id;
    option.textContent = obtenerNombrePacienteParaMostrar(datos || {}) || datos.nombre || docPaciente.id;
    selector.appendChild(option);
  });
  if (state.patientId) await cargarPaciente(state.patientId);
}

async function obtenerProveedor() {
  if (state.provider) return state.provider;
  const functionsInstance = await obtenerFunctions();
  state.provider = createNoteGenerationProvider({
    provider: "external",
    external: {
      callable: httpsCallable(functionsInstance, "generateStructuredNoteFromDictation"),
      fallbackToLocal: true
    }
  });
  const capability = state.provider.capability();
  setText("voiceProviderStatus", `Proveedor: ${capability.isExternalAI ? "externo" : "local"} · fallback disponible`);
  return state.provider;
}

async function generarNota() {
  if (!state.patientId) {
    alert("Selecciona un paciente.");
    return;
  }
  const snapshot = snapshotDictado();
  if (!snapshot.correctedTranscript?.trim()) {
    alert("Revisa la transcripcion antes de generar.");
    return;
  }
  const provider = await obtenerProveedor();
  const options = {
    patientId: state.patientId,
    encounterId: $("voiceEncounterId")?.value || state.encounterId,
    noteId: $("voiceNoteId")?.value || state.noteId,
    documentType: $("voiceDocumentType")?.value || "evolucion_observacion",
    writingStyle: $("voiceWritingStyle")?.value || "formato_fray_narrativo",
    service: $("voiceServicio")?.value || "",
    existingNoteFields: await obtenerCamposDestinoExistentes()
  };
  setText("voiceGenerationProgress", "Generando propuesta estructurada. No se modifica la nota tradicional.");
  const generated = await generarNotaVoz({
    provider,
    snapshot,
    patientContext: crearPatientContext(),
    options,
    userId: state.user.uid
  });
  state.generated = generated;
  state.transferSections = generated.transferSections || crearTransferSections(generated, snapshot.correctedTranscript, crearPatientContext());
  setText("voiceProviderStatus", `Proveedor: ${generated.provider || "desconocido"} · estado: ${generated.providerStatus || generated.metadata?.generatedStatus || "en revision"}`);
  setText("voicePromptVersion", `Prompt: ${generated.promptVersion || generated.metadata?.promptVersion || "fallback local"}`);
  setText("voiceSchemaStatus", `Esquema validado: ${state.transferSections.length ? "si" : "pendiente"}`);
  await guardarSesionVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    encounterId: options.encounterId,
    sessionId: snapshot.transcriptSessionId || "manual",
    status: "generated",
    data: {
      provider: generated.provider || "",
      promptVersion: generated.promptVersion || "",
      documentType: options.documentType
    }
  });
  await guardarTranscripcionVozFirestore({ userId: state.user.uid, sessionId: snapshot.transcriptSessionId || "manual", transcript: snapshot });
  await guardarDraftGeneradoVozFirestore({ userId: state.user.uid, patientId: state.patientId, sessionId: snapshot.transcriptSessionId || "manual", generated });
  setText("voiceGenerationProgress", generated.metadata?.processingDisclosure || "Propuesta generada. Revise cada apartado antes de transferir.");
  renderRevision();
  mostrarPaso("revisar");
}

async function obtenerCamposDestinoExistentes() {
  const noteId = $("voiceNoteId")?.value || state.noteId;
  const nota = await leerNotaExistente(state.patientId, noteId).catch(() => null);
  const observacion = nota?.observacionFray || {};
  return {
    evolutionOrSubjective: { ...VOICE_NOTE_FIELD_REGISTRY.evolutionOrSubjective, value: nota?.subjetivo || "" },
    physicalNeurologicalExam: { ...VOICE_NOTE_FIELD_REGISTRY.physicalNeurologicalExam, value: observacion.exploracionFisicaNeurologica || "" },
    mentalStatusExam: { ...VOICE_NOTE_FIELD_REGISTRY.mentalStatusExam, value: nota?.objetivo || "" },
    results: { ...VOICE_NOTE_FIELD_REGISTRY.results, value: observacion.resultadosEstudios || "" },
    analysis: { ...VOICE_NOTE_FIELD_REGISTRY.analysis, value: nota?.analisis || "" },
    plan: { ...VOICE_NOTE_FIELD_REGISTRY.plan, value: nota?.plan || "" }
  };
}

function renderRevision() {
  renderWarnings();
  const contenedor = $("voiceReviewCards");
  if (!contenedor) return;
  const sections = state.transferSections || [];
  contenedor.innerHTML = sections.length ? sections.map((section, index) => `
    <article class="voice-review-card">
      <header>
        <div>
          <small>Destino: ${escaparHTML(section.field?.label || "")}</small>
          <h3>${escaparHTML(section.title)}</h3>
        </div>
        <label><input type="checkbox" data-section-include="${index}" ${section.include ? "checked" : ""} ${section.blocked ? "disabled" : ""}> Incluir</label>
      </header>
      ${section.blocked ? `<p class="voice-summary">No se puede transferir hasta corregir las advertencias criticas de este apartado.</p>` : ""}
      <label>Modo de transferencia
        <select data-section-mode="${index}">
          <option value="insert_if_empty" ${section.mode === "insert_if_empty" ? "selected" : ""}>Insertar si esta vacio</option>
          <option value="combine" ${section.mode === "combine" ? "selected" : ""}>Combinar</option>
          <option value="replace" ${section.mode === "replace" ? "selected" : ""}>Reemplazar con confirmacion</option>
          <option value="exclude" ${section.mode === "exclude" ? "selected" : ""}>Excluir</option>
        </select>
      </label>
      <textarea data-section-content="${index}">${escaparHTML(section.content)}</textarea>
      <details>
        <summary>Ver fuentes y advertencias</summary>
        <p>Fragmentos: ${section.sourceSegmentIds?.length || "sin marcas especificas"}</p>
        <ul>${(section.warnings || []).map((issue) => `<li>${escaparHTML(issue.message || issue.summary || "")}</li>`).join("")}</ul>
      </details>
    </article>
  `).join("") : "<p>No hay apartados clinicos transferibles.</p>";

  contenedor.querySelectorAll("[data-section-include]").forEach((input) => {
    input.addEventListener("change", () => {
      state.transferSections[Number(input.dataset.sectionInclude)].include = input.checked;
    });
  });
  contenedor.querySelectorAll("[data-section-mode]").forEach((select) => {
    select.addEventListener("change", () => {
      const section = state.transferSections[Number(select.dataset.sectionMode)];
      section.mode = select.value;
      if (select.value === "exclude") section.include = false;
      renderRevision();
    });
  });
  contenedor.querySelectorAll("[data-section-content]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.transferSections[Number(textarea.dataset.sectionContent)].content = textarea.value;
    });
  });
}

function renderWarnings() {
  const contenedor = $("voiceWarningsList");
  if (!contenedor) return;
  const warnings = state.generated?.validationIssues || [];
  contenedor.innerHTML = warnings.length ? warnings.map((warning) => `
    <article class="voice-warning-item">
      <strong>${escaparHTML(warning.category || warning.displayTitle || warning.concept || "Dato incierto")}</strong>
      <p>${escaparHTML(warning.summary || warning.message || "Requiere revision profesional.")}</p>
    </article>
  `).join("") : "<p>Sin advertencias agrupadas; la revision profesional sigue siendo obligatoria.</p>";
}

async function transferir() {
  if (!state.generated) {
    alert("Primero genera y revisa la nota.");
    return;
  }
  const selectedTarget = document.querySelector("input[name='voiceTransferTarget']:checked")?.value || "new";
  if (selectedTarget === "later") {
    setText("voiceTransferSummary", "Sesion conservada. Puedes volver despues desde este paciente.");
    return;
  }
  const sections = state.transferSections.filter((section) => section.include && !section.blocked && section.mode !== "exclude");
  if (!sections.length) {
    alert("Selecciona al menos un apartado revisado para transferir.");
    return;
  }
  const replaceSections = sections.filter((section) => section.mode === "replace");
  if (replaceSections.length && !confirm(`Se reemplazara contenido en: ${replaceSections.map((s) => s.field?.label).join(", ")}. Confirma para continuar.`)) return;
  const noteId = selectedTarget === "existing" ? ($("voiceNoteId")?.value || state.noteId) : "";
  const confirmado = await transferirNotaVozABorrador({
    patientId: state.patientId,
    noteId,
    patient: state.patient,
    user: {
      uid: state.user.uid,
      email: state.user.email,
      nombre: state.perfil?.nombre || state.perfil?.nombreCompleto || state.user.displayName || state.user.email
    },
    sections,
    documentType: $("voiceDocumentType")?.value || "evolucion_observacion",
    draftMetadata: {
      sessionId: snapshotDictado().transcriptSessionId || "",
      encounterId: $("voiceEncounterId")?.value || state.encounterId,
      provider: state.generated.provider || "",
      promptVersion: state.generated.promptVersion || "",
      source: "nota_por_voz_y_automatica"
    }
  });
  state.transferredNoteId = confirmado.id;
  $("voiceNoteId").value = confirmado.id;
  await guardarDraftGeneradoVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    sessionId: snapshotDictado().transcriptSessionId || "manual",
    generated: state.generated,
    transferredNoteId: confirmado.id
  });
  setText("voiceTransferSummary", `Borrador ${confirmado.id} transferido y verificado. No se firmo ni se guardo como definitivo.`);
}

function abrirNotaTradicional() {
  const qs = new URLSearchParams();
  if (state.patientId) qs.set("id", state.patientId);
  if (state.transferredNoteId || $("voiceNoteId")?.value) qs.set("notaId", state.transferredNoteId || $("voiceNoteId").value);
  location.href = `nota.html?${qs.toString()}`;
}

function conectarEventos() {
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => mostrarPaso(button.dataset.stepTarget));
  });
  document.querySelectorAll("[data-step-next]").forEach((button) => {
    button.addEventListener("click", () => mostrarPaso(button.dataset.stepNext));
  });
  $("uidPaciente")?.addEventListener("change", async (event) => {
    state.patientId = event.target.value;
    await cargarPaciente(state.patientId);
  });
  $("voiceCorrectedTranscript")?.addEventListener("input", (event) => renderSegmentosConversacionales(event.target.value));
  $("btnSegmentarConversacionVoz")?.addEventListener("click", () => segmentarConProveedor().catch((error) => {
    console.error("No se pudo segmentar la conversacion:", error);
    setText("voiceSegmentationStatus", "No se pudo segmentar con proveedor. Revise la transcripcion.");
  }));
  $("btnPrepararMicrofono")?.addEventListener("click", () => window.probarMicrofono?.());
  $("btnGenerarNotaVoz")?.addEventListener("click", () => generarNota().catch((error) => {
    console.error("No se pudo generar nota por voz:", error);
    setText("voiceGenerationProgress", error.message || "No se pudo generar la nota.");
  }));
  $("btnTransferirNotaVoz")?.addEventListener("click", () => transferir().catch((error) => {
    console.error("No se pudo transferir la nota:", error);
    alert(error.message || "No se pudo transferir la nota.");
  }));
  $("btnAbrirNotaTradicional")?.addEventListener("click", abrirNotaTradicional);
  $("btnVolverVoz")?.addEventListener("click", () => {
    if (state.returnUrl) location.href = state.returnUrl;
    else if (state.patientId) location.href = `paciente.html?id=${encodeURIComponent(state.patientId)}`;
    else location.href = "medico.html";
  });
}

async function init() {
  iniciarMonitoreoSesion("Nota por voz y automatica");
  opcionesSelect($("voiceDocumentType"), VOICE_NOTE_TYPES, "evolucion_observacion");
  opcionesSelect($("voiceWritingStyle"), VOICE_NOTE_STYLES, "formato_fray_narrativo");
  $("voiceEncounterId").value = state.encounterId;
  $("voiceNoteId").value = state.noteId;
  conectarEventos();
  actualizarLinks();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      location.href = "login.html";
      return;
    }
    state.user = user;
    const perfil = await obtenerUsuario(user.uid);
    if (!perfil || (perfil.rol !== "admin" && !usuarioEsPersonalClinico(perfil.rol))) {
      alert("Acceso restringido al personal clinico.");
      location.href = "dashboard.html";
      return;
    }
    state.perfil = perfil;
    await cargarListaPacientes();
    if (state.patientId) await cargarPaciente(state.patientId);
    await obtenerProveedor();
  });
}

init();

window.cognicionNotaPorVoz = {
  get state() { return state; },
  renderSegmentosConversacionales,
  generarNota,
  transferir
};
