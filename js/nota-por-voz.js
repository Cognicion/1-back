import { auth, obtenerFunctions } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerUsuario, listarPacientes, medicoPuedeVer } from "./services/usuarios.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { createNoteGenerationProvider } from "./services/noteGenerationProviders.js?v=20260719-preflight-observations";
import { createConversationSegmentationProvider, crearClientRequestId } from "./services/conversationSegmentationProviders.js?v=20260719-evolution-v2-validation";
import { segmentarConversacionClinica } from "./services/clinicalPipeline.js";
import {
  VOICE_NOTE_FIELD_REGISTRY,
  VOICE_NOTE_PROMPT_VERSION,
  VOICE_NOTE_SCHEMA_VERSION,
  VOICE_NOTE_VALIDATOR_VERSION,
  calcularDecadaDeVida,
  crearTransferSections,
  generarNotaVoz,
  guardarDraftGeneradoVozFirestore,
  guardarSesionVozFirestore,
  guardarTranscripcionVozFirestore,
  leerNotaExistente,
  transferirNotaVozABorrador
} from "./services/voiceNoteGenerationService.js?v=20260719-preflight-observations";
import { buscarBorradorNotaClinica } from "./services/notas.js?v=20260716-2";
import {
  VOICE_NOTE_SESSION_SCHEMA_VERSION,
  buscarSesionesNotaVozLocales,
  eliminarSesionNotaVozLocal,
  guardarSegmentacionNotaVozLocal,
  guardarSesionNotaVozLocal,
  hashTextoVoz,
  limpiarSesionesNotaVozVencidas,
  obtenerSegmentacionNotaVozLocal
} from "./services/voiceNoteSessionPersistence.js?v=20260718-session-persistence";
import {
  VOICE_NOTE_CATALOG_VERSION,
  VOICE_NOTE_STYLE_CATALOG_VERSION,
  getCompatibleVoiceStyles,
  getDefaultVoiceNoteType,
  getDefaultVoiceStyle,
  getVoiceNoteType,
  getVoiceNoteStyle,
  getVoiceNoteTypesForService
} from "./services/voiceNoteCatalogService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const params = new URLSearchParams(location.search);
const initialPatientId = params.get("patientId")
  || params.get("id")
  || params.get("pacienteId")
  || params.get("uidPaciente")
  || "";
const state = {
  user: null,
  perfil: null,
  patientId: initialPatientId,
  encounterId: params.get("encounterId") || params.get("atencionId") || params.get("encuentro") || params.get("encuentroId") || "",
  noteId: params.get("noteId") || params.get("notaId") || "",
  returnUrl: params.get("returnUrl") || "",
  patient: null,
  contextReady: false,
  initialPatientLocked: Boolean(initialPatientId),
  provider: null,
  segmentationProvider: null,
  generated: null,
  transferSections: [],
  transferredNoteId: "",
  conversationSegments: [],
  conversationWarnings: [],
  conversationSegmentationMode: "rule_based",
  segmentationMetadata: null,
  conversationUndo: [],
  conversationRedo: [],
  activeSegmentationRequest: null,
  activeGenerationRequest: null,
  isHydratingSession: true,
  persistenceReady: false,
  persistenceTimer: null,
  recoverableSession: null,
  selectedStep: "preparar",
  lastSavedSessionKey: "",
  generationPreferences: {
    includePatientQuotes: false,
    maxPatientQuotes: 1,
    quotePriority: "automatic"
  },
  encounterObservation: {
    modality: "",
    location: "",
    locationOther: "",
    position: "",
    activities: [],
    behaviors: [],
    interactions: [],
    appearance: [],
    psychomotor: [],
    freeText: "",
    freeTextConfirmed: false
  }
};

const OBSERVATION_DESTINATIONS = [
  ["evolution", "Evolucion"],
  ["mentalStatusExam", "Examen mental"],
  ["both", "Ambos"]
];

const OBSERVATION_GROUPS = {
  activities: [
    ["asleep", "Se encontraba dormido", "evolution"],
    ["resting", "Se encontraba en reposo", "evolution"],
    ["talking_other_person", "Se encontraba conversando con otra persona", "evolution"],
    ["eating", "Se encontraba comiendo", "evolution"],
    ["doing_activity", "Se encontraba realizando una actividad", "evolution"],
    ["walking", "Se encontraba deambulando", "evolution"],
    ["isolated", "Se encontraba aislado", "evolution"],
    ["other_activity", "Otra actividad", "evolution"]
  ],
  behaviors: [
    ["calm", "Tranquilo", "evolution"],
    ["irritable", "Irritable", "evolution"],
    ["restless", "Inquieto", "evolution"],
    ["agitated", "Agitado", "evolution"],
    ["crying", "Llorando", "evolution"],
    ["somnolent", "Somnoliento", "evolution"],
    ["hostile", "Hostil", "evolution"],
    ["suspicious", "Suspicaz", "evolution"],
    ["cooperative", "Cooperador", "evolution"],
    ["poorly_cooperative", "Poco cooperador", "evolution"],
    ["declined_interview", "No acepto la entrevista", "evolution"],
    ["disorganized_behavior", "Conducta desorganizada", "evolution"],
    ["no_particular_behavior", "Sin conducta particular que documentar", "evolution"]
  ],
  interactions: [
    ["alone", "Se encontraba solo", "evolution"],
    ["talking_patient", "Conversaba con otro paciente", "evolution"],
    ["talking_relative", "Conversaba con un familiar", "evolution"],
    ["talking_staff", "Conversaba con personal de salud", "evolution"],
    ["adequate_interaction", "Interactuaba adecuadamente con otros usuarios", "evolution"],
    ["isolated_from_users", "Permanecia aislado de otros usuarios", "evolution"],
    ["other_interaction", "Otra interaccion", "evolution"]
  ],
  appearance: [
    ["institutional_clothing", "Vestimenta institucional", "mentalStatusExam"],
    ["personal_clothing", "Vestimenta particular", "mentalStatusExam"],
    ["adequate_grooming", "Adecuada higiene y alino", "mentalStatusExam"],
    ["partially_poor_grooming", "Higiene y alino parcialmente descuidados", "mentalStatusExam"],
    ["poor_grooming", "Higiene y alino descuidados", "mentalStatusExam"],
    ["visible_crying", "Llanto evidente", "both"],
    ["visible_injury_manual", "Lesion visible descrita manualmente", "mentalStatusExam"],
    ["other_appearance", "Otra observacion", "mentalStatusExam"]
  ],
  psychomotor: [
    ["preserved", "Conservada", "mentalStatusExam"],
    ["psychomotor_agitation", "Agitacion psicomotriz", "mentalStatusExam"],
    ["psychomotor_retardation", "Retardo psicomotor", "mentalStatusExam"],
    ["restlessness", "Inquietud", "mentalStatusExam"],
    ["observable_tremor", "Temblor observable", "mentalStatusExam"],
    ["involuntary_movements", "Movimientos involuntarios", "mentalStatusExam"],
    ["normal_gait_observed", "Marcha observable sin alteraciones", "mentalStatusExam"],
    ["gait_not_assessable", "Marcha no valorable", "mentalStatusExam"],
    ["other_psychomotor", "Otra", "mentalStatusExam"]
  ]
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
    servicio: $("voiceServicio")?.value || obtenerServicioPaciente(datos),
    diagnosticosActivos: datos.historialDiagnosticos || datos.diagnosticos || [],
    medicamentosActivos: datos.tratamientos || datos.tratamiento || [],
    alergias: datos.alergias || datos.datosClinicosResumen?.alergias || []
  };
}

function opcionesSelect(select, opciones, selected = "") {
  if (!select) return;
  const normalizadas = (opciones || []).map((opcion) => Array.isArray(opcion)
    ? { value: opcion[0], label: opcion[1] }
    : { value: opcion.id || opcion.value || "", label: opcion.label || opcion.text || opcion.id || "" }
  ).filter((opcion) => opcion.value);
  select.innerHTML = normalizadas.length
    ? normalizadas.map(({ value, label }) =>
        `<option value="${escaparHTML(value)}" ${value === selected ? "selected" : ""}>${escaparHTML(label)}</option>`
      ).join("")
    : '<option value="">Sin opciones disponibles</option>';
}

function sanitizarObservacionLibre(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function defaultEncounterObservation() {
  return {
    modality: "",
    location: "",
    locationOther: "",
    position: "",
    activities: [],
    behaviors: [],
    interactions: [],
    appearance: [],
    psychomotor: [],
    freeText: "",
    freeTextConfirmed: false
  };
}

function normalizarDestinationSections(value = "evolution") {
  if (value === "both") return ["evolution", "mentalStatusExam"];
  if (value === "mentalStatusExam") return ["mentalStatusExam"];
  return ["evolution"];
}

function normalizarObservationItem(item = {}, fallbackDestination = "evolution") {
  if (!item || typeof item !== "object") return null;
  const value = String(item.value || "").trim();
  if (!value) return null;
  return {
    value,
    label: String(item.label || value).trim(),
    destination: item.destination || fallbackDestination,
    destinationSections: Array.isArray(item.destinationSections)
      ? item.destinationSections.filter(Boolean)
      : normalizarDestinationSections(item.destination || fallbackDestination)
  };
}

function normalizarEncounterObservation(value = {}) {
  const base = defaultEncounterObservation();
  const obs = value && typeof value === "object" ? value : {};
  const normalizada = {
    ...base,
    modality: String(obs.modality || "").trim(),
    location: String(obs.location || "").trim(),
    locationOther: sanitizarObservacionLibre(obs.locationOther || "").slice(0, 80),
    position: String(obs.position || "").trim(),
    freeText: sanitizarObservacionLibre(obs.freeText || ""),
    freeTextConfirmed: Boolean(obs.freeTextConfirmed)
  };
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    normalizada[groupKey] = Array.isArray(obs[groupKey])
      ? obs[groupKey].map((item) => normalizarObservationItem(item)).filter(Boolean)
      : [];
  });
  return normalizada;
}

function leerPreferenciasGeneracion() {
  const includePatientQuotes = document.querySelector("input[name='voiceIncludeQuotes']:checked")?.value === "true";
  return {
    includePatientQuotes,
    maxPatientQuotes: includePatientQuotes ? Math.min(3, Math.max(1, Number($("voiceMaxPatientQuotes")?.value || 1))) : 0,
    quotePriority: includePatientQuotes ? ($("voiceQuotePriority")?.value || "automatic") : "automatic"
  };
}

function leerObservacionEncuentro() {
  const obs = {
    modality: $("voiceObservationModality")?.value || "",
    location: $("voiceObservationLocation")?.value || "",
    locationOther: $("voiceObservationLocationOther")?.value || "",
    position: $("voiceObservationPosition")?.value || "",
    freeText: $("voiceFreeObservation")?.value || "",
    freeTextConfirmed: Boolean($("voiceFreeObservationConfirmed")?.checked)
  };
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    obs[groupKey] = Array.from(document.querySelectorAll(`[data-observation-group="${groupKey}"] input[type="checkbox"]:checked`)).map((input) => ({
      value: input.value,
      label: input.dataset.label || input.value,
      destination: document.querySelector(`[data-observation-destination="${groupKey}:${input.value}"]`)?.value || input.dataset.defaultDestination || "evolution"
    }));
  });
  return normalizarEncounterObservation(obs);
}

function contarObservacionesManuales(obs = state.encounterObservation) {
  const observation = normalizarEncounterObservation(obs);
  let count = 0;
  if (observation.modality) count += 1;
  if (observation.location) count += 1;
  if (observation.position) count += 1;
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    count += observation[groupKey].length;
  });
  if (observation.freeText && observation.freeTextConfirmed) count += 1;
  return count;
}

function validarObservacionesPrevias(obs = state.encounterObservation, prefs = state.generationPreferences) {
  const observation = normalizarEncounterObservation(obs);
  const issues = [];
  const has = (group, value) => observation[group]?.some((item) => item.value === value);
  if (has("behaviors", "calm") && has("behaviors", "agitated")) issues.push("tranquilo + agitado");
  if (has("behaviors", "cooperative") && has("behaviors", "declined_interview")) issues.push("cooperador + no acepto entrevista");
  if (observation.position && observation.position !== "alterna_posiciones") {
    const positionActivityConflict = observation.position === "sedente" && has("activities", "walking");
    if (positionActivityConflict) issues.push("sedente + deambulando");
  }
  if (has("activities", "asleep") && (has("activities", "talking_other_person") || has("interactions", "talking_relative") || has("interactions", "talking_patient"))) issues.push("dormido + conversando");
  if (has("interactions", "alone") && (has("interactions", "talking_relative") || has("interactions", "talking_patient") || has("interactions", "talking_staff"))) issues.push("solo + conversando");
  if (has("psychomotor", "preserved") && has("psychomotor", "psychomotor_agitation")) issues.push("psicomotricidad conservada + agitacion psicomotriz");
  if (has("appearance", "adequate_grooming") && (has("appearance", "partially_poor_grooming") || has("appearance", "poor_grooming"))) issues.push("higiene adecuada + higiene descuidada");
  if (has("psychomotor", "normal_gait_observed") && has("psychomotor", "gait_not_assessable")) issues.push("marcha normal + marcha no valorable");
  if (observation.freeText && !observation.freeTextConfirmed) issues.push("texto libre sin confirmacion profesional");
  if (observation.modality === "llamada_telefonica") {
    const visualGroups = ["appearance", "psychomotor"];
    if (observation.location || observation.position || visualGroups.some((group) => observation[group]?.length)) {
      issues.push("hallazgos visuales incompatibles con llamada telefonica");
    }
  }
  if (prefs.includePatientQuotes) {
    const literalPatientUtterance = state.conversationSegments.some((utterance) => utterance.probableRole === "patient" && String(utterance.text || "").trim().length > 4);
    if (!literalPatientUtterance) issues.push("sic. Pac. sin utterances literales del paciente");
  }
  return issues;
}

function actualizarVistaPreviaConfiguracion() {
  state.generationPreferences = leerPreferenciasGeneracion();
  state.encounterObservation = leerObservacionEncuentro();
  const includeQuotes = state.generationPreferences.includePatientQuotes;
  const maxSelect = $("voiceMaxPatientQuotes");
  const prioritySelect = $("voiceQuotePriority");
  if (maxSelect) maxSelect.disabled = !includeQuotes;
  if (prioritySelect) prioritySelect.disabled = !includeQuotes;
  setText("voiceQuoteDescription", includeQuotes
    ? "Se podran incluir citas textuales breves y clinicamente relevantes pronunciadas por el paciente."
    : "La informacion se redactara mediante parafrasis clinica, sin citas textuales.");
  const locationOtherWrap = $("voiceObservationLocationOtherWrap");
  if (locationOtherWrap) locationOtherWrap.hidden = state.encounterObservation.location !== "otro";
  const counter = $("voiceFreeObservationCounter");
  if (counter) counter.textContent = `${($("voiceFreeObservation")?.value || "").length}/500`;
  const issues = validarObservacionesPrevias();
  const validation = $("voiceObservationValidation");
  if (validation) {
    validation.hidden = !issues.length;
    validation.textContent = issues.length ? `Estas observaciones son incompatibles. Revise la seleccion: ${issues.join("; ")}.` : "";
  }
  setText("voicePreflightSummary", `Se incorporaran ${contarObservacionesManuales()} observaciones manuales. Las citas textuales estan ${includeQuotes ? "activadas" : "desactivadas"}.`);
}

function invalidarNotaGeneradaPorConfiguracion() {
  if (!state.generated) return;
  state.generated = null;
  state.transferSections = [];
  renderRevision();
  setText("voiceGenerationProgress", "La configuracion previa cambio. La segmentacion se conserva; regenere la Evolucion.");
}

function obtenerServicioPaciente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.servicioInstitucional
    || datos.servicio
    || datos.servicioActual
    || institucional.servicioInstitucional
    || institucional.servicio
    || institucional.servicioActual
    || "";
}

function obtenerExpedientePaciente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.expedienteCognicion
    || institucional.expedienteCognicion
    || datos.expediente
    || datos.numeroExpediente
    || institucional.expediente
    || institucional.numeroExpediente
    || "Sin expediente";
}

function resolverEncounterId(datos = {}, patientId = state.patientId) {
  const institucional = datos.datosInstitucionales || {};
  const actual = String(state.encounterId || "").trim();
  if (actual && actual !== "actual") return actual;
  return datos.encounterId
    || datos.encuentroId
    || datos.atencionId
    || datos.encuentroActivoId
    || datos.atencionActualId
    || datos.ingresoActivoId
    || institucional.encounterId
    || institucional.encuentroId
    || institucional.atencionId
    || datos.ultimaConsulta
    || (patientId ? `paciente:${patientId}` : "");
}

function construirQueryContexto(extra = {}) {
  const qs = new URLSearchParams();
  if (state.patientId) {
    qs.set("patientId", state.patientId);
    qs.set("id", state.patientId);
  }
  if (state.encounterId) qs.set("encounterId", state.encounterId);
  if (state.noteId) qs.set("noteId", state.noteId);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  return qs.toString();
}

function actualizarLinks() {
  const qsBase = construirQueryContexto();
  const qsPaciente = state.patientId ? `?id=${encodeURIComponent(state.patientId)}` : "";
  const qsNota = construirQueryContexto(state.noteId ? { notaId: state.noteId } : {});
  $("linkPacienteVoz")?.setAttribute("href", state.patientId ? `paciente.html${qsPaciente}` : "paciente.html");
  $("linkNotaTradicional")?.setAttribute("href", qsNota ? `nota.html?${qsNota}` : "nota.html");
  const versionedVoiceUrl = qsBase ? `nota-por-voz.html?v=20260719-preflight-observations&${qsBase}` : "nota-por-voz.html?v=20260719-preflight-observations";
  $("linkNotaVoz")?.setAttribute("href", versionedVoiceUrl);
}

function setPreparacionHabilitada(enabled, message = "") {
  state.contextReady = Boolean(enabled);
  ["btnPrepararMicrofono", "btnGenerarNotaVoz", "btnTransferirNotaVoz"].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = !enabled;
  });
  document.querySelectorAll("[data-step-next='grabar'], [data-step-next='generar']").forEach((button) => {
    button.disabled = !enabled;
  });
  if (message) setText("voiceContextStatus", message);
}

function actualizarResumenPlantilla() {
  const typeId = $("voiceDocumentType")?.value || "";
  const styleId = $("voiceWritingStyle")?.value || "";
  const tipo = getVoiceNoteType(typeId);
  const estilo = getVoiceNoteStyle(styleId);
  const destino = tipo?.destinationFields?.length
    ? tipo.destinationFields.map((key) => VOICE_NOTE_FIELD_REGISTRY[key]?.label || key).join(", ")
    : "No transfiere apartados clínicos";
  const summary = [
    tipo ? `Tipo: ${tipo.label}` : "Tipo pendiente",
    estilo ? `Estilo: ${estilo.label}` : "Estilo pendiente",
    tipo?.templateId ? `Plantilla lógica: ${tipo.templateId}` : "",
    `Destino: ${destino}`,
    `Catálogo: ${VOICE_NOTE_CATALOG_VERSION} / ${VOICE_NOTE_STYLE_CATALOG_VERSION}`
  ].filter(Boolean).join(" · ");
  setText("voiceTemplateSummary", summary);
}

function cargarCatalogosVoz(servicio = "") {
  const tipos = getVoiceNoteTypesForService(servicio);
  const tipoActual = $("voiceDocumentType")?.value || state.documentType || "";
  const tipoDefault = tipos.some((tipo) => tipo.id === tipoActual)
    ? tipoActual
    : getDefaultVoiceNoteType(servicio);
  const tipoSeleccionado = tipos.some((tipo) => tipo.id === tipoDefault) ? tipoDefault : tipos[0]?.id || "nota_completa";
  opcionesSelect($("voiceDocumentType"), tipos, tipoSeleccionado);

  const estilos = getCompatibleVoiceStyles(tipoSeleccionado);
  const estiloActual = $("voiceWritingStyle")?.value || state.writingStyle || "";
  const estiloDefault = estilos.some((estilo) => estilo.id === estiloActual)
    ? estiloActual
    : getDefaultVoiceStyle(tipoSeleccionado);
  const estiloSeleccionado = estilos.some((estilo) => estilo.id === estiloDefault) ? estiloDefault : estilos[0]?.id || "institucional_psiquiatrico_detallado";
  opcionesSelect($("voiceWritingStyle"), estilos, estiloSeleccionado);
  state.documentType = tipoSeleccionado;
  state.writingStyle = estiloSeleccionado;
  actualizarResumenPlantilla();
}

function renderPreflightControls() {
  Object.entries(OBSERVATION_GROUPS).forEach(([groupKey, options]) => {
    const container = document.querySelector(`[data-observation-group="${groupKey}"]`);
    if (!container) return;
    container.innerHTML = options.map(([value, label, defaultDestination]) => `
      <div class="voice-checkbox-item">
        <label>
          <input type="checkbox" value="${escaparHTML(value)}" data-label="${escaparHTML(label)}" data-default-destination="${escaparHTML(defaultDestination)}">
          <span>${escaparHTML(label)}</span>
        </label>
        <select data-observation-destination="${escaparHTML(`${groupKey}:${value}`)}" aria-label="Destino de ${escaparHTML(label)}">
          ${OBSERVATION_DESTINATIONS.map(([destValue, destLabel]) => `<option value="${escaparHTML(destValue)}" ${destValue === defaultDestination ? "selected" : ""}>${escaparHTML(destLabel)}</option>`).join("")}
        </select>
      </div>
    `).join("");
  });
  aplicarPreflightStateAControles();
  actualizarVistaPreviaConfiguracion();
}

function aplicarPreflightStateAControles() {
  const prefs = state.generationPreferences || {};
  const includeValue = prefs.includePatientQuotes ? "true" : "false";
  const includeRadio = document.querySelector(`input[name="voiceIncludeQuotes"][value="${includeValue}"]`);
  if (includeRadio) includeRadio.checked = true;
  if ($("voiceMaxPatientQuotes")) $("voiceMaxPatientQuotes").value = String(prefs.maxPatientQuotes || 1);
  if ($("voiceQuotePriority")) $("voiceQuotePriority").value = prefs.quotePriority || "automatic";

  const obs = normalizarEncounterObservation(state.encounterObservation);
  if ($("voiceObservationModality")) $("voiceObservationModality").value = obs.modality;
  if ($("voiceObservationLocation")) $("voiceObservationLocation").value = obs.location;
  if ($("voiceObservationLocationOther")) $("voiceObservationLocationOther").value = obs.locationOther;
  if ($("voiceObservationPosition")) $("voiceObservationPosition").value = obs.position;
  if ($("voiceFreeObservation")) $("voiceFreeObservation").value = obs.freeText;
  if ($("voiceFreeObservationConfirmed")) $("voiceFreeObservationConfirmed").checked = obs.freeTextConfirmed;
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    const selected = new Map(obs[groupKey].map((item) => [item.value, item.destination || (item.destinationSections?.length > 1 ? "both" : item.destinationSections?.[0] || "evolution")]));
    document.querySelectorAll(`[data-observation-group="${groupKey}"] input[type="checkbox"]`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
    document.querySelectorAll(`[data-observation-destination^="${groupKey}:"]`).forEach((select) => {
      const value = select.dataset.observationDestination.split(":").slice(1).join(":");
      if (selected.has(value)) select.value = selected.get(value);
    });
  });
}

function hayDatosVoz() {
  const textoDictado = $("textoDictadoClinico")?.value?.trim();
  const textoCorregido = $("voiceCorrectedTranscript")?.value?.trim();
  const dictadoActivo = ["listening", "paused", "reconnecting", "processing", "completed"]
    .includes(window.cognicionDictado?.diagnostico?.().state || "");
  return Boolean(textoDictado || textoCorregido || state.conversationSegments.length || state.generated || dictadoActivo);
}

function contextoPersistenciaVoz() {
  return {
    userId: state.user?.uid || "",
    patientId: state.patientId || "",
    encounterId: $("voiceEncounterId")?.value?.trim() || state.encounterId || ""
  };
}

function configuracionNotaActual() {
  const noteType = $("voiceDocumentType")?.value || state.documentType || getDefaultVoiceNoteType($("voiceServicio")?.value || "");
  const styleId = $("voiceWritingStyle")?.value || state.writingStyle || getDefaultVoiceStyle(noteType);
  const tipo = getVoiceNoteType(noteType);
  return {
    noteType,
    styleId,
    templateId: tipo?.templateId || "",
    promptVersion: VOICE_NOTE_PROMPT_VERSION
  };
}

function generatedNotePersistible() {
  const editedEvolution = state.transferSections?.find((section) => section.key === "evolutionOrSubjective" || section.fieldTarget === "evolutionOrSubjective");
  const evolution = state.generated?.sections?.evolution
    || state.generated?.generatedClinicalText?.evolutionOrSubjective
    || state.generated?.generatedClinicalText?.subjective
    || null;
  const text = editedEvolution?.content || evolution?.text || "";
  if (!text) return null;
  return {
    evolution: {
      text,
      sourceUtteranceIds: evolution.sourceUtteranceIds || evolution.sourceSegmentIds || [],
      confidence: evolution.confidence ?? null,
      requiresReview: evolution.requiresReview !== false,
      warnings: evolution.warnings || []
    },
    provider: state.generated?.provider || "",
    model: state.generated?.model || "",
    promptVersion: state.generated?.promptVersion || VOICE_NOTE_PROMPT_VERSION,
    schemaVersion: state.generated?.schemaVersion || VOICE_NOTE_SCHEMA_VERSION,
    generationPreferences: state.generated?.generationPreferences || state.generationPreferences,
    encounterObservation: state.generated?.encounterObservation || state.encounterObservation,
    generatedAt: state.generated?.generatedAt || new Date().toISOString()
  };
}

function construirBorradorSesionVoz() {
  const context = contextoPersistenciaVoz();
  const snapshot = snapshotDictado();
  const corrected = $("voiceCorrectedTranscript")?.value?.trim() || snapshot.correctedTranscript || "";
  const original = $("textoDictadoClinico")?.value?.trim() || snapshot.confirmedTranscript || corrected;
  const transcriptHash = hashTextoVoz(corrected || original);
  const sessionId = snapshot.transcriptSessionId || window.cognicionDictado?.sessionId || "manual";
  return {
    schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
    sessionId,
    ...context,
    createdAt: snapshot.provenance?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: state.selectedStep || "preparar",
    noteConfiguration: configuracionNotaActual(),
    generationPreferences: state.generationPreferences || leerPreferenciasGeneracion(),
    encounterObservation: state.encounterObservation || leerObservacionEncuentro(),
    transcript: {
      original,
      corrected,
      transcriptId: snapshot.transcriptSessionId || sessionId,
      transcriptHash,
      sourceSegments: snapshot.transcriptSegments || []
    },
    segmentation: {
      provider: state.segmentationMetadata?.provider || (state.conversationSegments.length ? state.conversationSegmentationMode : ""),
      mode: state.conversationSegmentationMode || "rule_based",
      promptVersion: state.segmentationMetadata?.promptVersion || "",
      model: state.segmentationMetadata?.model || "",
      transcriptHash: state.segmentationMetadata?.transcriptHash || transcriptHash,
      utterances: state.conversationSegments || [],
      warnings: state.conversationWarnings || [],
      completedBlocks: state.segmentationMetadata?.completedBlocks ?? state.segmentationMetadata?.externalBlockCount ?? 0,
      totalBlocks: state.segmentationMetadata?.totalBlocks ?? state.segmentationMetadata?.blockCount ?? 0,
      pendingBlocks: state.segmentationMetadata?.pendingBlocks ?? 0,
      manuallyEdited: Boolean(state.segmentationMetadata?.manuallyEdited),
      generatedAt: state.segmentationMetadata?.generatedAt || ""
    },
    generatedNote: generatedNotePersistible(),
    uiState: {
      selectedStep: state.selectedStep || "preparar",
      expandedWarnings: []
    }
  };
}

function programarPersistenciaVoz(reason = "update") {
  if (state.isHydratingSession || !state.persistenceReady) return;
  if (state.persistenceTimer) window.clearTimeout(state.persistenceTimer);
  state.persistenceTimer = window.setTimeout(() => persistirSesionVoz(reason), 850);
}

async function persistirSesionVoz(reason = "update") {
  if (state.isHydratingSession || !state.persistenceReady || !state.user?.uid || !state.patientId) return null;
  const draft = construirBorradorSesionVoz();
  if (!draft.transcript.corrected && !draft.transcript.original && !draft.segmentation.utterances.length && !draft.generatedNote) return null;
  const saved = await guardarSesionNotaVozLocal(draft);
  state.lastSavedSessionKey = saved?.key || state.lastSavedSessionKey;
  if (draft.segmentation.utterances.length && ["external", "hybrid"].includes(draft.segmentation.provider || draft.segmentation.mode)) {
    await guardarSegmentacionNotaVozLocal({
      ...contextoPersistenciaVoz(),
      transcriptHash: draft.transcript.transcriptHash,
      promptVersion: draft.segmentation.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: draft.segmentation.model || "external_callable",
      segmenterVersion: "conversation_segmentation_client_blocks_v1_2026-07-18",
      provider: draft.segmentation.provider,
      mode: draft.segmentation.mode,
      utterances: draft.segmentation.utterances,
      warnings: draft.segmentation.warnings,
      completedBlocks: draft.segmentation.completedBlocks,
      totalBlocks: draft.segmentation.totalBlocks,
      pendingBlocks: draft.segmentation.pendingBlocks,
      generatedAt: draft.segmentation.generatedAt || new Date().toISOString(),
      reason
    });
  }
  return saved;
}

function flushPersistenciaVoz(reason = "flush") {
  if (state.persistenceTimer) {
    window.clearTimeout(state.persistenceTimer);
    state.persistenceTimer = null;
  }
  return persistirSesionVoz(reason).catch((error) => {
    console.warn("No se pudo guardar la sesion de nota por voz:", error?.name || "error");
    return null;
  });
}

function mostrarPanelRecuperacionSesion(session = null) {
  const panel = $("voiceSessionRecovery");
  if (!panel) return;
  state.recoverableSession = session;
  panel.hidden = !session;
  if (!session) return;
  const transcriptLength = String(session.transcript?.corrected || session.transcript?.original || "").length;
  const utteranceCount = session.segmentation?.utterances?.length || 0;
  const blocks = session.segmentation?.totalBlocks
    ? `${session.segmentation.completedBlocks || 0}/${session.segmentation.totalBlocks} bloques`
    : "bloques no registrados";
  setText("voiceSessionRecoverySummary", [
    `Paciente: ${session.patientId}`,
    `Encuentro: ${session.encounterId}`,
    `Fecha: ${session.updatedAt || session.createdAt || "sin fecha"}`,
    `Etapa: ${session.currentStep || session.uiState?.selectedStep || "sin etapa"}`,
    `Transcripcion: ${transcriptLength} caracteres`,
    `Segmentacion: ${session.segmentation?.provider || session.segmentation?.mode || "pendiente"} · ${utteranceCount} turnos · ${blocks}`,
    session.generatedNote?.evolution?.text ? "Evolucion generada: si" : "Evolucion generada: no"
  ].join(" · "));
}

async function buscarSesionRecuperableVoz() {
  if (!state.user?.uid || !state.patientId || !state.encounterId) return null;
  const sesiones = await buscarSesionesNotaVozLocales(contextoPersistenciaVoz());
  const session = sesiones[0] || null;
  mostrarPanelRecuperacionSesion(session);
  if (session) setText("voiceContextStatus", "Se encontro una sesion local de nota por voz para este paciente y encuentro.");
  return session;
}

function reconstruirGeneratedDesdeSesion(session = {}) {
  const evolution = session.generatedNote?.evolution;
  if (!evolution?.text) return null;
  return {
    provider: session.generatedNote.provider || "external",
    model: session.generatedNote.model || "",
    promptVersion: session.generatedNote.promptVersion || VOICE_NOTE_PROMPT_VERSION,
    schemaVersion: session.generatedNote.schemaVersion || VOICE_NOTE_SCHEMA_VERSION,
    sections: {
      evolution: {
        text: evolution.text,
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        confidence: evolution.confidence ?? null,
        requiresReview: evolution.requiresReview !== false,
        warnings: evolution.warnings || []
      }
    },
    generatedClinicalText: {
      evolutionOrSubjective: {
        text: evolution.text,
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        sourceSegmentIds: evolution.sourceUtteranceIds || [],
        warnings: evolution.warnings || [],
        requiresReview: evolution.requiresReview !== false
      },
      subjective: {
        text: evolution.text,
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        sourceSegmentIds: evolution.sourceUtteranceIds || [],
        warnings: evolution.warnings || [],
        requiresReview: evolution.requiresReview !== false
      },
      objective: {},
      analysis: {},
      plan: {}
    },
    validationIssues: evolution.warnings || []
  };
}

async function recuperarSesionVoz(session = state.recoverableSession) {
  if (!session) return;
  state.isHydratingSession = true;
  const context = contextoPersistenciaVoz();
  if (session.userId !== context.userId || session.patientId !== context.patientId || session.encounterId !== context.encounterId) {
    alert("La sesion guardada pertenece a otro paciente o encuentro.");
    state.isHydratingSession = false;
    return;
  }
  const restoredOriginal = session.transcript?.original || session.transcript?.corrected || "";
  const restoredCorrected = session.transcript?.corrected || session.transcript?.original || "";
  const restoredHash = hashTextoVoz(restoredCorrected || restoredOriginal);
  const segmentationHash = session.segmentation?.transcriptHash || session.transcript?.transcriptHash || "";
  const segmentationMatchesTranscript = !session.segmentation?.utterances?.length || !segmentationHash || segmentationHash === restoredHash;
  $("textoDictadoClinico").value = restoredOriginal;
  $("voiceCorrectedTranscript").value = restoredCorrected;
  window.cognicionDictado?.restoreFromSnapshot?.({
    sessionId: session.sessionId,
    transcriptSessionId: session.transcript?.transcriptId || session.sessionId,
    text: restoredOriginal,
    correctedTranscript: restoredCorrected,
    confirmedTranscript: restoredOriginal,
    confirmedSegments: session.transcript?.sourceSegments || [],
    patientId: session.patientId,
    userId: session.userId,
    encounterId: session.encounterId
  });
  if (session.noteConfiguration?.noteType && $("voiceDocumentType")) $("voiceDocumentType").value = session.noteConfiguration.noteType;
  if (session.noteConfiguration?.styleId && $("voiceWritingStyle")) $("voiceWritingStyle").value = session.noteConfiguration.styleId;
  state.documentType = $("voiceDocumentType")?.value || session.noteConfiguration?.noteType || state.documentType;
  state.writingStyle = $("voiceWritingStyle")?.value || session.noteConfiguration?.styleId || state.writingStyle;
  state.generationPreferences = {
    includePatientQuotes: Boolean(session.generationPreferences?.includePatientQuotes),
    maxPatientQuotes: Math.min(3, Math.max(1, Number(session.generationPreferences?.maxPatientQuotes || 1))),
    quotePriority: session.generationPreferences?.quotePriority || "automatic"
  };
  if (!session.generationPreferences && session.generatedNote?.generationPreferences) {
    state.generationPreferences = {
      includePatientQuotes: Boolean(session.generatedNote.generationPreferences.includePatientQuotes),
      maxPatientQuotes: Math.min(3, Math.max(1, Number(session.generatedNote.generationPreferences.maxPatientQuotes || 1))),
      quotePriority: session.generatedNote.generationPreferences.quotePriority || "automatic"
    };
  }
  state.encounterObservation = normalizarEncounterObservation(session.encounterObservation || {});
  if (!session.encounterObservation && session.generatedNote?.encounterObservation) {
    state.encounterObservation = normalizarEncounterObservation(session.generatedNote.encounterObservation);
  }
  aplicarPreflightStateAControles();
  actualizarVistaPreviaConfiguracion();
  state.conversationSegments = segmentationMatchesTranscript ? (session.segmentation?.utterances || []) : [];
  state.conversationWarnings = segmentationMatchesTranscript
    ? (session.segmentation?.warnings || [])
    : [{ code: "transcript_hash_mismatch", message: "La transcripcion cambio desde la segmentacion guardada. Reprocese los fragmentos afectados." }];
  state.conversationSegmentationMode = segmentationMatchesTranscript
    ? (session.segmentation?.mode || session.segmentation?.provider || "rule_based")
    : "rule_based";
  state.segmentationMetadata = {
    provider: session.segmentation?.provider || state.conversationSegmentationMode,
    mode: state.conversationSegmentationMode,
    promptVersion: session.segmentation?.promptVersion || "",
    model: session.segmentation?.model || "",
    transcriptHash: segmentationMatchesTranscript ? (segmentationHash || restoredHash) : restoredHash,
    completedBlocks: segmentationMatchesTranscript ? (session.segmentation?.completedBlocks || 0) : 0,
    totalBlocks: segmentationMatchesTranscript ? (session.segmentation?.totalBlocks || 0) : 0,
    pendingBlocks: segmentationMatchesTranscript ? (session.segmentation?.pendingBlocks || 0) : 0,
    manuallyEdited: Boolean(session.segmentation?.manuallyEdited),
    generatedAt: session.segmentation?.generatedAt || ""
  };
  state.generated = segmentationMatchesTranscript ? reconstruirGeneratedDesdeSesion(session) : null;
  state.transferSections = state.generated
    ? crearTransferSections(state.generated, $("voiceCorrectedTranscript")?.value || "", crearPatientContext())
    : [];
  state.lastSavedSessionKey = session.key || "";
  actualizarResumenPlantilla();
  renderSegmentosConversacionalesActuales();
  renderRevision();
  setText("voiceSegmentationStatus", state.conversationSegments.length
    ? `Segmentacion recuperada. Proveedor: ${state.segmentationMetadata.provider || "local"} · modo: ${state.conversationSegmentationMode} · turnos: ${state.conversationSegments.length}.`
    : "Transcripcion recuperada. Segmentacion pendiente o invalidada por cambios en el texto.");
  setText("voiceGenerationProgress", state.generated ? "Evolucion recuperada. Revise antes de transferir." : "La generacion no modifica la nota tradicional.");
  mostrarPanelRecuperacionSesion(null);
  state.isHydratingSession = false;
  state.persistenceReady = true;
  mostrarPaso(session.uiState?.selectedStep || session.currentStep || "transcripcion");
  await flushPersistenciaVoz("session-restored");
}

async function descartarSesionVoz(session = state.recoverableSession) {
  if (!session) return;
  const tieneContenido = Boolean(session.transcript?.corrected || session.transcript?.original || session.segmentation?.utterances?.length || session.generatedNote?.evolution?.text);
  if (tieneContenido && !confirm("Se eliminara la sesion local recuperable de este paciente y encuentro. La nota tradicional no se modificara.")) return;
  await eliminarSesionNotaVozLocal(session);
  mostrarPanelRecuperacionSesion(null);
  state.persistenceReady = true;
  state.isHydratingSession = false;
  setText("voiceContextStatus", "Sesion local descartada.");
}

async function iniciarNuevaSesionVoz() {
  mostrarPanelRecuperacionSesion(null);
  state.recoverableSession = null;
  state.persistenceReady = true;
  state.isHydratingSession = false;
  setText("voiceContextStatus", "Nueva sesion lista. El borrador anterior se conserva aislado hasta vencer o descartarse.");
}

function mostrarPaso(step) {
  if (!state.contextReady && step !== "preparar") {
    alert("Primero carga y valida el paciente.");
    return;
  }
  state.selectedStep = step;
  document.querySelectorAll(".voice-step-panel").forEach((panel) => {
    panel.hidden = panel.id !== `step-${step}`;
  });
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.classList.toggle("activo", button.dataset.stepTarget === step);
  });
  if (step === "transcripcion") sincronizarTranscripcionRevision();
  if (step === "revisar") renderRevision();
  programarPersistenciaVoz("step-change");
}

function snapshotDictado() {
  const base = window.cognicionDictado?.snapshot?.() || {};
  const corrected = $("voiceCorrectedTranscript")?.value?.trim() || $("textoDictadoClinico")?.value?.trim() || base.correctedTranscript || base.confirmedTranscript || "";
  const encounterId = $("voiceEncounterId")?.value?.trim() || state.encounterId || base.encounterId || "";
  return {
    ...base,
    correctedTranscript: corrected,
    confirmedTranscript: base.confirmedTranscript || corrected,
    patientId: state.patientId || base.patientId,
    encounterId
  };
}

function validarAislamientoSesion(snapshot = snapshotDictado()) {
  if (!state.user?.uid) throw new Error("No se pudo validar la sesión del usuario.");
  if (!state.patientId || !state.patient) throw new Error("Primero carga y valida el paciente.");
  const snapshotPatientId = snapshot.patientId || "";
  const snapshotEncounterId = snapshot.encounterId || "";
  const encounterId = $("voiceEncounterId")?.value?.trim() || state.encounterId || "";
  if (snapshotPatientId && snapshotPatientId !== state.patientId) {
    throw new Error("La sesión de dictado pertenece a otro paciente. Recupera o limpia la transcripción antes de continuar.");
  }
  if (snapshotEncounterId && encounterId && snapshotEncounterId !== encounterId) {
    throw new Error("La sesión de dictado pertenece a otro encuentro. Recupera o limpia la transcripción antes de continuar.");
  }
  return { encounterId };
}

function sincronizarTranscripcionRevision() {
  const textarea = $("voiceCorrectedTranscript");
  const texto = $("textoDictadoClinico")?.value || window.cognicionDictado?.snapshot?.().correctedTranscript || "";
  if (textarea && !textarea.value.trim()) textarea.value = texto;
  const textoRevision = textarea?.value || texto;
  const hashActual = hashTextoVoz(textoRevision);
  if (state.conversationSegments.length && state.segmentationMetadata?.transcriptHash === hashActual) {
    renderSegmentosConversacionalesActuales();
    return;
  }
  renderSegmentosConversacionales(textoRevision);
}

function renderSegmentosConversacionales(texto = "") {
  const contenedor = $("voiceConversationSegments");
  if (!contenedor) return;
  const segmentos = segmentarConversacionClinica(texto);
  state.conversationSegments = Array.from(segmentos);
  state.conversationWarnings = segmentos.warnings || [];
  state.conversationSegmentationMode = "rule_based";
  state.segmentationMetadata = {
    provider: "rule_based",
    mode: "linguistic",
    transcriptHash: hashTextoVoz(texto),
    promptVersion: "",
    model: "",
    generatedAt: new Date().toISOString()
  };
  renderSegmentosConversacionalesActuales();
  programarPersistenciaVoz("local-segmentation");
}

async function obtenerProveedorSegmentacion() {
  if (state.segmentationProvider) return state.segmentationProvider;
  try {
    const functionsInstance = await obtenerFunctions();
    state.segmentationProvider = createConversationSegmentationProvider({
      provider: "external",
      external: {
        callable: httpsCallable(functionsInstance, "segmentClinicalConversation", { timeout: 55000 }),
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
  if (state.activeSegmentationRequest) return state.activeSegmentationRequest;
  const clientRequestId = crearClientRequestId();
  const button = $("btnSegmentarConversacionVoz");
  if (button) button.disabled = true;
  setText("voiceSegmentationStatus", "Preparando transcripcion...");
  renderDetalleTecnicoSegmentacion(null);
  const provider = await obtenerProveedorSegmentacion();
  const snapshot = snapshotDictado();
  validarAislamientoSesion(snapshot);
  const transcriptHash = hashTextoVoz(texto);
  const cached = await obtenerSegmentacionNotaVozLocal({
    ...contextoPersistenciaVoz(),
    transcriptHash,
    promptVersion: "conversation_segmentation_es_mx_v2_2026-07-18",
    model: "external_callable",
    segmenterVersion: "conversation_segmentation_client_blocks_v1_2026-07-18"
  });
  if (cached?.utterances?.length) {
    state.conversationSegments = cached.utterances || [];
    state.conversationWarnings = cached.warnings || [];
    state.conversationSegmentationMode = cached.mode || cached.provider || "hybrid";
    state.segmentationMetadata = {
      provider: cached.provider || state.conversationSegmentationMode,
      mode: cached.mode || state.conversationSegmentationMode,
      promptVersion: cached.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: cached.model || "external_callable",
      transcriptHash: cached.transcriptHash || transcriptHash,
      completedBlocks: cached.completedBlocks || 0,
      totalBlocks: cached.totalBlocks || 0,
      pendingBlocks: cached.pendingBlocks || 0,
      generatedAt: cached.generatedAt || cached.updatedAt || new Date().toISOString()
    };
    renderSegmentosConversacionalesActuales();
    setText("voiceSegmentationStatus", `Segmentacion recuperada. Proveedor: ${state.segmentationMetadata.provider || "hybrid"} · modo: ${state.conversationSegmentationMode} · turnos: ${state.conversationSegments.length}. No se consumio proveedor externo.`);
    renderDetalleTecnicoSegmentacion(null, {
      clientRequestId,
      stage: "persistent_cache_hit",
      blockCount: state.segmentationMetadata.totalBlocks || 0,
      completedBlocks: state.segmentationMetadata.completedBlocks || 0,
      pendingBlocks: state.segmentationMetadata.pendingBlocks || 0
    });
    if (button) button.disabled = false;
    programarPersistenciaVoz("segmentation-cache-hit");
    return { provider: state.segmentationMetadata.provider, segmentationMode: state.conversationSegmentationMode, utterances: state.conversationSegments, warnings: state.conversationWarnings, cacheHit: true };
  }
  const progressLabels = {
    preparing: "Preparando transcripcion...",
    cache_hit: "Segmentacion guardada.",
    pending_reuse: "Ya hay una segmentacion en proceso...",
    external_block: "Revisando fragmentos ambiguos..."
  };
  state.activeSegmentationRequest = provider.segment({
    transcriptId: snapshot.transcriptSessionId || "manual",
    transcriptSessionId: snapshot.transcriptSessionId || "manual",
    clientRequestId,
    text: texto,
    correctedTranscript: texto,
    transcriptSegments: snapshot.transcriptSegments || [],
    onProgress(progress = {}) {
      const base = progressLabels[progress.stage] || "Identificando hablantes...";
      const suffix = progress.blockCount
        ? ` Bloques: ${progress.completedBlocks || 0}/${progress.blockCount}.`
        : "";
      setText("voiceSegmentationStatus", `${base}${suffix}`);
      renderDetalleTecnicoSegmentacion(null, {
        clientRequestId: progress.clientRequestId || clientRequestId,
        stage: progress.stage || "preparing",
        blockCount: progress.blockCount || 0,
        completedBlocks: progress.completedBlocks || 0,
        pendingBlocks: progress.pendingBlocks || 0
      });
    }
  });
  try {
    const result = await state.activeSegmentationRequest;
    state.conversationSegments = result.utterances || [];
    state.conversationWarnings = result.warnings || [];
    state.conversationSegmentationMode = result.segmentationMode || result.mode || result.provider || "hybrid";
    state.segmentationMetadata = {
      provider: result.provider || state.conversationSegmentationMode,
      mode: result.segmentationMode || result.mode || state.conversationSegmentationMode,
      promptVersion: result.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: result.model || "external_callable",
      transcriptHash,
      completedBlocks: result.metrics?.externalBlockCount || 0,
      totalBlocks: result.metrics?.blockCount || 0,
      pendingBlocks: Math.max(0, (result.metrics?.blockCount || 0) - (result.metrics?.externalBlockCount || 0)),
      generatedAt: new Date().toISOString()
    };
    state.segmentationFailure = result.providerFailure || null;
    renderSegmentosConversacionalesActuales();
    renderDetalleTecnicoSegmentacion(state.segmentationFailure, result.metrics || { clientRequestId });
    if (result.providerFailure) {
      const externalBlocks = Number(result.metrics?.externalBlockCount || 0);
      if (externalBlocks > 0) {
        setText("voiceSegmentationStatus", `Segmentacion avanzada parcialmente disponible. Proveedor: ${result.provider || "hybrid"} · turnos: ${state.conversationSegments.length}`);
      } else {
        setText("voiceSegmentationStatus", "Segmentacion avanzada no disponible. Se conservo la segmentacion basica.");
      }
    } else {
      const cacheText = result.cacheHit ? " Segmentacion guardada reutilizada." : "";
      setText("voiceSegmentationStatus", `Segmentacion completada. Proveedor: ${result.provider || "external"} · modo: ${result.segmentationMode || result.mode || "linguistic"} · turnos: ${state.conversationSegments.length}.${cacheText}`);
    }
    programarPersistenciaVoz("segmentation-complete");
    return result;
  } finally {
    state.activeSegmentationRequest = null;
    if (button) button.disabled = false;
  }
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

function renderDetalleTecnicoSegmentacion(failure = null, metrics = null) {
  const panel = $("voiceSegmentationTechnicalDetail");
  if (!panel) return;
  if (!failure && !metrics) {
    panel.hidden = true;
    panel.open = false;
    return;
  }
  const details = failure?.details || {};
  panel.hidden = false;
  setText("voiceSegmentationTechnicalCode", failure?.code || failure?.name || (metrics?.cacheHit ? "cache_hit" : "ok"));
  setText("voiceSegmentationTechnicalStage", failure?.stage || details.stage || metrics?.stage || "completada");
  setText("voiceSegmentationTechnicalRequestId", failure?.requestId || details.requestId || metrics?.clientRequestId || "no_disponible");
  setText("voiceSegmentationTechnicalRetryable", (failure?.retryable || details.retryable) ? "si" : "no");
  setText("voiceSegmentationTechnicalDuration", Number.isFinite(Number(metrics?.elapsedMs)) ? `${Math.round(Number(metrics.elapsedMs))} ms` : "-");
  setText("voiceSegmentationTechnicalBlocks", Number.isFinite(Number(metrics?.blockCount)) ? `${metrics.externalBlockCount || metrics.completedBlocks || 0}/${metrics.blockCount}` : "-");
}

function etiquetaRolActo(segmento = {}) {
  return `${ROLE_LABELS[segmento.probableRole] || segmento.probableRole || "Desconocido"} · ${ACT_LABELS[segmento.speechAct] || segmento.speechAct || "Otro"}`;
}

function guardarHistorialSegmentacion() {
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  if (state.conversationUndo.length > 30) state.conversationUndo.shift();
  state.conversationRedo = [];
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
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
      <span>Modo: ${escaparHTML(state.conversationSegmentationMode || "linguistico")}</span>
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
      programarPersistenciaVoz("manual-role-edit");
    });
  });
  contenedor.querySelectorAll("[data-seg-act]").forEach((select) => {
    select.addEventListener("change", () => {
      guardarHistorialSegmentacion();
      state.conversationSegments[Number(select.dataset.segAct)].speechAct = select.value;
      renderSegmentosConversacionalesActuales();
      programarPersistenciaVoz("manual-act-edit");
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
  programarPersistenciaVoz("manual-split");
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
  programarPersistenciaVoz("manual-merge");
}

function deshacerSegmentacion() {
  const previo = state.conversationUndo.pop();
  if (!previo) return;
  state.conversationRedo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(previo);
  renderSegmentosConversacionalesActuales();
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
  programarPersistenciaVoz("manual-undo");
}

function rehacerSegmentacion() {
  const siguiente = state.conversationRedo.pop();
  if (!siguiente) return;
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(siguiente);
  renderSegmentosConversacionalesActuales();
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
  programarPersistenciaVoz("manual-redo");
}

async function cargarPaciente(patientId) {
  state.persistenceReady = false;
  state.isHydratingSession = true;
  setPreparacionHabilitada(false, "Validando paciente...");
  if (!patientId || !state.user?.uid) {
    state.patient = null;
    setText("voicePatientSummary", "Selecciona un paciente para iniciar.");
    setPreparacionHabilitada(false, "Paciente pendiente.");
    state.isHydratingSession = false;
    return;
  }
  if (!(await medicoPuedeVer(state.user.uid, patientId))) {
    alert("No tienes permiso para acceder a este paciente.");
    location.href = "medico.html";
    return;
  }
  const datos = await obtenerUsuario(patientId);
  if (!datos) {
    state.patient = null;
    setText("voicePatientSummary", "No se encontró el paciente solicitado o no está disponible.");
    setPreparacionHabilitada(false, "Paciente no disponible.");
    state.isHydratingSession = false;
    return;
  }
  state.patient = datos || {};
  state.patientId = patientId;
  state.encounterId = resolverEncounterId(datos, patientId);
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
  const servicioPaciente = obtenerServicioPaciente(datos);
  if (servicio) servicio.value = servicio.value || servicioPaciente || "";
  if ($("voiceEncounterId")) $("voiceEncounterId").value = state.encounterId;
  const borrador = await buscarBorradorNotaClinica(patientId, { atencionId: state.encounterId, usuarioId: state.user.uid }).catch(() => null);
  if (!state.noteId && borrador?.id) state.noteId = borrador.id;
  if ($("voiceNoteId")) $("voiceNoteId").value = state.noteId || "";
  cargarCatalogosVoz(servicio?.value || servicioPaciente);
  setText("voicePatientSummary", [
    ctx.nombreCompleto || "Paciente sin nombre",
    Number.isInteger(ctx.edad) ? `${ctx.edad} anos (${decada}a decada)` : "edad pendiente",
    ctx.sexo ? `sexo expediente: ${ctx.sexo}` : "sexo pendiente en expediente",
    `expediente: ${obtenerExpedientePaciente(datos)}`,
    servicio?.value ? `servicio: ${servicio.value}` : "servicio pendiente",
    `encuentro: ${state.encounterId}`,
    state.noteId ? `borrador destino: ${state.noteId}` : "sin borrador destino"
  ].join(" · "));
  setPreparacionHabilitada(true, "Paciente validado. Puedes preparar el micrófono.");
  actualizarLinks();
  await limpiarSesionesNotaVozVencidas();
  const recuperable = await buscarSesionRecuperableVoz();
  if (!recuperable) {
    state.persistenceReady = true;
    state.isHydratingSession = false;
    programarPersistenciaVoz("context-ready");
  }
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
  if (state.patientId) selector.value = state.patientId;
}

async function obtenerProveedor() {
  if (state.provider) return state.provider;
  const functionsInstance = await obtenerFunctions();
  state.provider = createNoteGenerationProvider({
    provider: "external",
    external: {
      callable: httpsCallable(functionsInstance, "generateStructuredNoteFromDictation"),
      fallbackToLocal: false
    }
  });
  const capability = state.provider.capability();
  setText("voiceProviderStatus", `Proveedor: ${capability.isExternalAI ? "externo" : "local"} · fallback disponible`);
  setText("voicePromptVersion", `Prompt: listo · ${VOICE_NOTE_PROMPT_VERSION}`);
  setText("voiceSchemaStatus", `Esquema: listo · ${VOICE_NOTE_SCHEMA_VERSION}`);
  return state.provider;
}

async function generarNota() {
  if (state.activeGenerationRequest) return state.activeGenerationRequest;
  if (!state.patientId) {
    alert("Selecciona un paciente.");
    return;
  }
  const snapshot = snapshotDictado();
  const { encounterId } = validarAislamientoSesion(snapshot);
  if (!snapshot.correctedTranscript?.trim()) {
    alert("Revisa la transcripcion antes de generar.");
    return;
  }
  state.generationPreferences = leerPreferenciasGeneracion();
  state.encounterObservation = leerObservacionEncuentro();
  const preflightIssues = validarObservacionesPrevias(state.encounterObservation, state.generationPreferences);
  actualizarVistaPreviaConfiguracion();
  if (preflightIssues.length) {
    alert(`Estas observaciones son incompatibles. Revise la seleccion: ${preflightIssues.join("; ")}.`);
    return;
  }
  const provider = await obtenerProveedor();
  const documentType = $("voiceDocumentType")?.value || getDefaultVoiceNoteType($("voiceServicio")?.value || "");
  const writingStyle = $("voiceWritingStyle")?.value || getDefaultVoiceStyle(documentType);
  const tipo = getVoiceNoteType(documentType);
  const estilo = getVoiceNoteStyle(writingStyle);
  const clientRequestId = crearClientRequestId("note");
  const options = {
    clientRequestId,
    patientId: state.patientId,
    encounterId,
    noteId: $("voiceNoteId")?.value || state.noteId,
    documentType,
    writingStyle,
    templateId: tipo?.templateId || "",
    promptVersion: estilo?.promptVersion || "",
    service: $("voiceServicio")?.value || "",
    conversationSegments: state.conversationSegments || [],
    segmentationMode: state.conversationSegmentationMode || "hybrid",
    segmentationWarnings: state.conversationWarnings || [],
    generationPreferences: state.generationPreferences,
    encounterObservation: state.encounterObservation,
    existingNoteFields: await obtenerCamposDestinoExistentes()
  };
  const button = $("btnGenerarNotaVoz");
  if (button) button.disabled = true;
  const startedAt = Date.now();
  setText("voiceProviderStatus", "Proveedor: externo · redactando");
  setText("voicePromptVersion", `Prompt: listo · ${VOICE_NOTE_PROMPT_VERSION}`);
  setText("voiceSchemaStatus", `Esquema: listo · ${VOICE_NOTE_SCHEMA_VERSION}`);
  setText("voiceGenerationProgress", `Redactando Evolucion... Solicitud ${clientRequestId}. No se modifica la nota tradicional.`);
  state.activeGenerationRequest = generarNotaVoz({
    provider,
    snapshot,
    patientContext: crearPatientContext(),
    options,
    userId: state.user.uid
  });
  let generated;
  try {
    generated = await state.activeGenerationRequest;
  } catch (error) {
    const details = error?.details || {};
    const code = error?.code || details.code || "sin_codigo";
    const validationCodes = Array.isArray(details.validationCodes) ? details.validationCodes : [];
    const validationText = validationCodes.length ? ` Codigos: ${validationCodes.join(", ")}.` : "";
    const attemptText = details.attempt ? ` Intento ${details.attempt}/2.` : "";
    setText("voiceProviderStatus", `Proveedor: externo · error: ${code}`);
    setText("voiceSchemaStatus", `Esquema: no validado · ${VOICE_NOTE_SCHEMA_VERSION}`);
    setText("voiceGenerationProgress", `No fue posible validar la Evolucion. Segmentacion conservada. RequestId: ${details.requestId || clientRequestId}. Etapa: ${details.stage || "no_especificada"}.${attemptText}${validationText} Validador: ${details.validatorVersion || VOICE_NOTE_VALIDATOR_VERSION}. Puedes reintentar generacion.`);
    return;
  } finally {
    state.activeGenerationRequest = null;
    if (button) button.disabled = false;
  }
  state.generated = generated;
  state.generated.generationPreferences = state.generationPreferences;
  state.generated.encounterObservation = state.encounterObservation;
  state.transferSections = generated.transferSections || crearTransferSections(generated, snapshot.correctedTranscript, crearPatientContext());
  const externalFailure = generated.metadata?.externalProviderFailure;
  setText("voiceProviderStatus", `Proveedor: ${generated.provider || "desconocido"} · estado: ${generated.providerStatus || generated.metadata?.generatedStatus || "en revision"}${externalFailure ? ` · causa fallback: ${externalFailure.code || externalFailure.name || "sin codigo"}` : ""}`);
  setText("voicePromptVersion", `Prompt: ${generated.promptVersion || generated.metadata?.promptVersion || "fallback local"}`);
  setText("voiceSchemaStatus", `Esquema validado: ${state.transferSections.length ? generated.schemaVersion || VOICE_NOTE_SCHEMA_VERSION : "pendiente"} · ${generated.validatorVersion || VOICE_NOTE_VALIDATOR_VERSION}`);
  await guardarSesionVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    encounterId: options.encounterId,
    sessionId: snapshot.transcriptSessionId || "manual",
    status: "generated",
    data: {
      provider: generated.provider || "",
      promptVersion: generated.promptVersion || "",
      documentType: options.documentType,
      writingStyle: options.writingStyle,
      templateId: options.templateId,
      catalogVersion: VOICE_NOTE_CATALOG_VERSION,
      styleCatalogVersion: VOICE_NOTE_STYLE_CATALOG_VERSION
    }
  });
  await guardarTranscripcionVozFirestore({ userId: state.user.uid, sessionId: snapshot.transcriptSessionId || "manual", transcript: snapshot });
  await guardarDraftGeneradoVozFirestore({ userId: state.user.uid, patientId: state.patientId, sessionId: snapshot.transcriptSessionId || "manual", generated });
  setText("voiceGenerationProgress", generated.metadata?.processingDisclosure || `Evolucion generada en ${Math.round((Date.now() - startedAt) / 1000)} s. Revise el apartado antes de transferir.`);
  await flushPersistenciaVoz("generation-complete");
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
      programarPersistenciaVoz("review-include-change");
    });
  });
  contenedor.querySelectorAll("[data-section-mode]").forEach((select) => {
    select.addEventListener("change", () => {
      const section = state.transferSections[Number(select.dataset.sectionMode)];
      section.mode = select.value;
      if (select.value === "exclude") section.include = false;
      programarPersistenciaVoz("review-mode-change");
      renderRevision();
    });
  });
  contenedor.querySelectorAll("[data-section-content]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.transferSections[Number(textarea.dataset.sectionContent)].content = textarea.value;
      programarPersistenciaVoz("generated-note-edit");
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
  const snapshot = snapshotDictado();
  const { encounterId } = validarAislamientoSesion(snapshot);
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
    documentType: $("voiceDocumentType")?.value || getDefaultVoiceNoteType($("voiceServicio")?.value || ""),
    draftMetadata: {
      sessionId: snapshot.transcriptSessionId || "",
      encounterId,
      provider: state.generated.provider || "",
      promptVersion: state.generated.promptVersion || "",
      documentType: $("voiceDocumentType")?.value || "",
      writingStyle: $("voiceWritingStyle")?.value || "",
      source: "nota_por_voz_y_automatica"
    }
  });
  state.transferredNoteId = confirmado.id;
  state.noteId = confirmado.id;
  $("voiceNoteId").value = confirmado.id;
  await guardarDraftGeneradoVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    sessionId: snapshotDictado().transcriptSessionId || "manual",
    generated: state.generated,
    transferredNoteId: confirmado.id
  });
  setText("voiceTransferSummary", `Borrador ${confirmado.id} transferido y verificado. No se firmo ni se guardo como definitivo.`);
  await eliminarSesionNotaVozLocal(construirBorradorSesionVoz());
}

function abrirNotaTradicional() {
  const qs = new URLSearchParams();
  if (state.patientId) qs.set("id", state.patientId);
  if (state.encounterId) qs.set("encounterId", state.encounterId);
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
    const nuevoPaciente = event.target.value;
    if (nuevoPaciente !== state.patientId && hayDatosVoz()) {
      const continuar = confirm("Cambiar de paciente cerrará el contexto actual del dictado. Limpia o guarda la transcripción antes de continuar. ¿Deseas cambiar de todos modos?");
      if (!continuar) {
        event.target.value = state.patientId || "";
        return;
      }
      await flushPersistenciaVoz("patient-change");
      state.generated = null;
      state.transferSections = [];
      state.conversationSegments = [];
      state.conversationWarnings = [];
      state.segmentationMetadata = null;
    }
    state.patientId = nuevoPaciente;
    state.encounterId = "";
    state.noteId = "";
    await cargarPaciente(state.patientId);
  });
  $("voiceDocumentType")?.addEventListener("change", () => {
    const typeId = $("voiceDocumentType")?.value || "";
    const estilos = getCompatibleVoiceStyles(typeId);
    const actual = $("voiceWritingStyle")?.value || "";
    const selected = estilos.some((style) => style.id === actual) ? actual : getDefaultVoiceStyle(typeId);
    opcionesSelect($("voiceWritingStyle"), estilos, selected);
    state.documentType = typeId;
    state.writingStyle = $("voiceWritingStyle")?.value || selected;
    actualizarResumenPlantilla();
    programarPersistenciaVoz("document-type-change");
  });
  $("voiceWritingStyle")?.addEventListener("change", () => {
    state.writingStyle = $("voiceWritingStyle")?.value || "";
    actualizarResumenPlantilla();
    programarPersistenciaVoz("style-change");
  });
  $("voiceServicio")?.addEventListener("change", () => {
    cargarCatalogosVoz($("voiceServicio")?.value || "");
    programarPersistenciaVoz("service-change");
  });
  $("voiceEncounterId")?.addEventListener("input", () => {
    state.encounterId = $("voiceEncounterId")?.value?.trim() || "";
    actualizarLinks();
    programarPersistenciaVoz("encounter-change");
  });
  $("voiceNoteId")?.addEventListener("input", () => {
    state.noteId = $("voiceNoteId")?.value?.trim() || "";
    actualizarLinks();
    programarPersistenciaVoz("note-change");
  });
  document.querySelectorAll(
    "input[name='voiceIncludeQuotes'], #voiceMaxPatientQuotes, #voiceQuotePriority, #voiceObservationModality, #voiceObservationLocation, #voiceObservationLocationOther, #voiceObservationPosition, #voiceFreeObservation, #voiceFreeObservationConfirmed"
  ).forEach((node) => {
    const eventName = (node.tagName === "TEXTAREA" || (node.tagName === "INPUT" && node.type === "text")) ? "input" : "change";
    node.addEventListener(eventName, () => {
      actualizarVistaPreviaConfiguracion();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("preflight-change");
    });
  });
  document.querySelectorAll("[data-observation-group] input, [data-observation-destination]").forEach((node) => {
    node.addEventListener("change", () => {
      actualizarVistaPreviaConfiguracion();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("preflight-observation-change");
    });
  });
  $("btnResetVoiceObservation")?.addEventListener("click", () => {
    state.generationPreferences = {
      includePatientQuotes: false,
      maxPatientQuotes: 1,
      quotePriority: "automatic"
    };
    state.encounterObservation = defaultEncounterObservation();
    aplicarPreflightStateAControles();
    actualizarVistaPreviaConfiguracion();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("preflight-reset");
  });
  $("textoDictadoClinico")?.addEventListener("input", () => {
    programarPersistenciaVoz("dictation-input");
  });
  $("voiceCorrectedTranscript")?.addEventListener("input", (event) => {
    renderSegmentosConversacionales(event.target.value);
    programarPersistenciaVoz("transcript-edit");
  });
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
  $("btnRecuperarSesionVoz")?.addEventListener("click", () => recuperarSesionVoz().catch((error) => {
    console.error("No se pudo recuperar la sesion de voz:", error);
    alert(error.message || "No se pudo recuperar la sesion.");
  }));
  $("btnDescartarSesionVoz")?.addEventListener("click", () => descartarSesionVoz().catch((error) => {
    console.error("No se pudo descartar la sesion de voz:", error);
  }));
  $("btnNuevaSesionVoz")?.addEventListener("click", () => iniciarNuevaSesionVoz().catch((error) => {
    console.error("No se pudo iniciar nueva sesion de voz:", error);
  }));
  $("btnVolverVoz")?.addEventListener("click", async () => {
    await flushPersistenciaVoz("internal-navigation");
    if (state.returnUrl) location.href = state.returnUrl;
    else if (state.patientId) location.href = `paciente.html?id=${encodeURIComponent(state.patientId)}`;
    else location.href = "medico.html";
  });
  window.addEventListener("pagehide", () => {
    flushPersistenciaVoz("pagehide");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistenciaVoz("visibility-hidden");
  });
}

async function init() {
  iniciarMonitoreoSesion("Nota por voz y automatica");
  setPreparacionHabilitada(false, "Cargando contexto del paciente...");
  cargarCatalogosVoz("");
  renderPreflightControls();
  if ($("voiceEncounterId")) $("voiceEncounterId").value = state.encounterId;
  if ($("voiceNoteId")) $("voiceNoteId").value = state.noteId;
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
    if (state.patientId) {
      await cargarPaciente(state.patientId);
    } else {
      await cargarListaPacientes();
      setPreparacionHabilitada(false, "Selecciona un paciente para iniciar.");
    }
    window.setTimeout(() => obtenerProveedor().catch(() => {
      setText("voiceProviderStatus", "Proveedor: local o pendiente");
    }), 0);
  });
}

init();

window.cognicionNotaPorVoz = {
  get state() { return state; },
  renderSegmentosConversacionales,
  generarNota,
  transferir
};
