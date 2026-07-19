import { db } from "../firebase.js";
import { guardarBorradorNotaClinica } from "./notas.js?v=20260716-2";
import { noteTypeOptions, writingStyleOptions } from "./voiceNoteCatalogService.js";
import { EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE, isEvolutionDocumentType, isEvolutionNarrativeStyle } from "./voiceNoteStyleTemplates.js";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const VOICE_NOTE_PROMPT_VERSION = "psychiatric_voice_note_es_mx_v2";
export const VOICE_NOTE_SCHEMA_VERSION = "voice_note_evolution_v1";
export const VOICE_NOTE_VALIDATOR_VERSION = "evolution_semantic_validator_v2";

function normalizarPreferenciasGeneracionVoz(value = {}) {
  const quoteMode = String(value.quoteMode || (value.includePatientQuotes ? "auto" : "omit"));
  const includePatientQuotes = quoteMode !== "omit" && Boolean(value.includePatientQuotes !== false);
  const rawMaxQuotes = Number(value.maxPatientQuotes);
  const maxPatientQuotes = includePatientQuotes
    ? (rawMaxQuotes === 0 ? 0 : Math.min(3, Math.max(1, Number.isFinite(rawMaxQuotes) ? rawMaxQuotes : 1)))
    : 0;
  return {
    quoteMode,
    includePatientQuotes,
    maxPatientQuotes,
    quotePriority: includePatientQuotes ? String(value.quotePriority || "automatic") : "automatic"
  };
}

function normalizarObservacionEncuentroVoz(value = {}) {
  const obs = value && typeof value === "object" ? value : {};
  const limpiar = (text = "") => String(text || "").replace(/<[^>]*>/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const normalizarGrupo = (items = []) => Array.isArray(items)
    ? items.map((item) => ({
        value: limpiar(item?.value),
        label: limpiar(item?.label || item?.value),
        destinationSections: Array.isArray(item?.destinationSections) ? item.destinationSections.filter(Boolean) : []
      })).filter((item) => item.value)
    : [];
  return {
    modality: limpiar(obs.modality),
    location: limpiar(obs.location),
    locationOther: limpiar(obs.locationOther).slice(0, 80),
    position: limpiar(obs.position),
    activities: normalizarGrupo(obs.activities),
    behaviors: normalizarGrupo(obs.behaviors),
    interactions: normalizarGrupo(obs.interactions),
    appearance: normalizarGrupo(obs.appearance),
    psychomotor: normalizarGrupo(obs.psychomotor),
    freeText: limpiar(obs.freeText).slice(0, 500),
    freeTextConfirmed: Boolean(obs.freeTextConfirmed)
  };
}

export const VOICE_NOTE_FIELD_REGISTRY = Object.freeze({
  evolutionOrSubjective: {
    fieldId: "subjetivo",
    noteKey: "subjetivo",
    label: "Subjetivo / Padecimiento actual o evolucion"
  },
  physicalNeurologicalExam: {
    fieldId: "obsExploracionFisicaNeurologica",
    noteKey: "observacionFray.exploracionFisicaNeurologica",
    label: "Exploracion fisica y neurologica"
  },
  mentalStatusExam: {
    fieldId: "objetivo",
    noteKey: "objetivo",
    label: "Objetivo / Examen mental"
  },
  results: {
    fieldId: "obsResultadosEstudios",
    noteKey: "observacionFray.resultadosEstudios",
    label: "Resultados relevantes de estudios diagnosticos"
  },
  analysis: {
    fieldId: "analisis",
    noteKey: "analisis",
    label: "Analisis clinico"
  },
  plan: {
    fieldId: "plan",
    noteKey: "plan",
    label: "Plan"
  }
});

export const VOICE_NOTE_TYPES = Object.freeze(noteTypeOptions());

export const VOICE_NOTE_STYLES = Object.freeze(writingStyleOptions());

export function calcularDecadaDeVida(edad) {
  if (!Number.isInteger(edad) || edad < 0) return null;
  return Math.floor(edad / 10) + 1;
}

function texto(valor = "") {
  return String(valor || "").trim();
}

function limpiarTextoClinico(valor = "") {
  return texto(valor)
    .replace(/^[-*\s]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contieneMensajeTecnico(valor = "") {
  const base = texto(valor);
  return /^Se detect[oó]\b/i.test(base)
    || /Confirmar con (?:paciente|madre|padre|pareja|informante)/i.test(base)
    || /(?:disfluencia|fragmento_extenso|posible error de reconocimiento)/i.test(base);
}

function contienePreguntaClinica(valor = "") {
  return /(^|\n)\s*[¿?]|(?:\bha escuchado voces\b|\btiene ideas suicidas\b|\btiene intenci[oó]n\b)\?/i.test(valor);
}

function pareceCopiaExcesiva(transcripcion = "", apartado = "") {
  const fuente = texto(transcripcion).toLowerCase();
  const salida = texto(apartado).toLowerCase();
  if (fuente.length < 280 || salida.length < 220) return false;
  const ventana = salida.slice(0, Math.min(360, salida.length));
  return fuente.includes(ventana);
}

function contarParrafos(valor = "") {
  return texto(valor).split(/\n{2,}/).map((parte) => parte.trim()).filter(Boolean).length;
}

function validarEvolucionNarrativaInstitucional(contenido = "", generada = {}) {
  const issues = [];
  const documentType = generada.documentType || generada.selectedDocumentType || "";
  const writingStyle = generada.writingStyle || generada.selectedWritingStyle || "";
  if (!isEvolutionDocumentType(documentType) || !isEvolutionNarrativeStyle(writingStyle)) return issues;
  if (!contenido) {
    issues.push({
      category: "Dato incierto",
      section: "evolutionOrSubjective",
      severity: "high",
      message: "No fue posible generar una evolución confiable. Revise la segmentación marcada."
    });
    return issues;
  }

  const forbidden = EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE.validation.forbiddenPatterns
    .map((pattern) => new RegExp(pattern, "i"));
  const blocking = [
    ...forbidden,
    /\bquiero revisar\b/i,
    /\best[aá] seguro de que\b/i,
    /\bdurante la entrevista se observa\b/i,
    /\bcontacto visual\b/i,
    /\bpsicomotricidad\b/i,
    /\bcurso del pensamiento\b/i,
    /\bjuicio comprometido\b/i,
    /\briesgo din[aá]mico\b/i,
    /\bpor el momento continuar[aá]\b/i,
    /\bse mantendr[aá]n?\b/i,
    /\bvigilar\b/i,
    /\([^)]*$/i,
    /\bde\)$/i,
    /\bno solamente quiero\b/i
  ];
  if (blocking.some((regex) => regex.test(contenido))) {
    issues.push({
      category: "Dato incierto",
      section: "evolutionOrSubjective",
      severity: "high",
      message: "La evolución contiene preguntas, instrucciones, plan, examen mental completo o texto técnico; debe regenerarse con estilo narrativo institucional."
    });
  }
  if (contarParrafos(contenido) > EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE.validation.maxParagraphs) {
    issues.push({
      category: "Dato incierto",
      section: "evolutionOrSubjective",
      severity: "high",
      message: "La evolución está excesivamente fragmentada; debe limitarse a tres a cinco párrafos narrativos."
    });
  }
  if (/\b(?:profesional|doctor|m[eé]dico)\b.*\b(?:pregunta|interroga|indica)\b/i.test(contenido)) {
    issues.push({
      category: "Hablante no identificado",
      section: "evolutionOrSubjective",
      severity: "high",
      message: "La evolución parece reconstruir el interrogatorio en lugar de redactar la evolución clínica."
    });
  }
  if (/\b(?:clonazepam|sertralina|risperidona|olanzapina|quetiapina)\b/i.test(contenido) && /\b(?:iniciar|continuar|solicitar|indicar|mantener)\b/i.test(contenido)) {
    issues.push({
      category: "Medicamento o dosis por confirmar",
      section: "evolutionOrSubjective",
      severity: "medium",
      message: "La evolución incluye lenguaje de indicación terapéutica; confirme que no corresponda al apartado Plan."
    });
  }
  return issues;
}

function obtenerSeccionesNormalizadas(generada = {}) {
  const soap = generada.generatedClinicalText || generada;
  return {
    evolutionOrSubjective: limpiarTextoClinico(
      soap.evolutionOrSubjective?.text
      || soap.subjective?.text
      || generada.subjective?.text
      || ""
    ),
    physicalNeurologicalExam: limpiarTextoClinico(
      soap.objective?.physicalNeurologicalExam
      || generada.objective?.physicalNeurologicalExam
      || ""
    ),
    mentalStatusExam: limpiarTextoClinico(
      soap.objective?.mentalStatusExam
      || generada.objective?.mentalStatusExam
      || ""
    ),
    results: limpiarTextoClinico(
      soap.objective?.results
      || generada.objective?.results
      || ""
    ),
    analysis: limpiarTextoClinico(
      soap.analysis?.text
      || generada.analysis?.text
      || ""
    ),
    plan: limpiarTextoClinico(
      soap.plan?.text
      || generada.plan?.text
      || ""
    )
  };
}

export function validarCalidadNotaVoz(generada = {}, transcripcion = "", contextoPaciente = {}) {
  const secciones = obtenerSeccionesNormalizadas(generada);
  const issues = [];
  const edad = Number(contextoPaciente.edad);
  const decada = calcularDecadaDeVida(Number.isInteger(edad) ? edad : null);

  Object.entries(secciones).forEach(([key, contenido]) => {
    if (!contenido) return;
    if (contieneMensajeTecnico(contenido)) {
      issues.push({ category: "Dato incierto", section: key, severity: "high", message: "El apartado contiene una advertencia tecnica y no puede transferirse." });
    }
    if (contienePreguntaClinica(contenido)) {
      issues.push({ category: "Hablante no identificado", section: key, severity: "medium", message: "El apartado parece conservar preguntas de la entrevista." });
    }
    if (pareceCopiaExcesiva(transcripcion, contenido)) {
      issues.push({ category: "Dato incierto", section: key, severity: "medium", message: "El apartado se parece demasiado a la transcripcion literal." });
    }
  });

  if (secciones.analysis && !/^Se trata de paciente\b/i.test(secciones.analysis)) {
    issues.push({ category: "Dato incierto", section: "analysis", severity: "medium", message: "El analisis no inicia con el estilo institucional esperado." });
  }
  if (decada && secciones.analysis && new RegExp(`\\b(?:1a|primera) decada\\b`, "i").test(secciones.analysis) && edad >= 10) {
    issues.push({ category: "Contradiccion", section: "analysis", severity: "high", message: `La decada de vida no corresponde a la edad (${edad} anos).` });
  }
  if (/\bsertralina\b/i.test(secciones.plan) && /\bvalorar inicio de antidepresivo\b/i.test(transcripcion) && !/\biniciar sertralina\b/i.test(transcripcion)) {
    issues.push({ category: "Medicamento o dosis por confirmar", section: "plan", severity: "high", message: "El plan convirtio una valoracion de antidepresivo en una indicacion especifica." });
  }
  issues.push(...validarEvolucionNarrativaInstitucional(secciones.evolutionOrSubjective, generada));

  return issues;
}

export function crearTransferSections(generada = {}, transcripcion = "", contextoPaciente = {}, extraIssues = []) {
  const qualityIssues = [...validarCalidadNotaVoz(generada, transcripcion, contextoPaciente), ...extraIssues];
  const blocked = new Set(qualityIssues.filter((issue) => issue.severity === "high").map((issue) => issue.section));
  const secciones = obtenerSeccionesNormalizadas(generada);
  const items = [
    ["evolutionOrSubjective", "Evolucion/Subjetivo", secciones.evolutionOrSubjective],
    ["physicalNeurologicalExam", "Exploracion fisica", secciones.physicalNeurologicalExam],
    ["mentalStatusExam", "Examen mental", secciones.mentalStatusExam],
    ["results", "Resultados", secciones.results],
    ["analysis", "Comentario y analisis", secciones.analysis],
    ["plan", "Plan", secciones.plan]
  ];

  return items
    .map(([key, title, content]) => ({
      key,
      title,
      content,
      field: VOICE_NOTE_FIELD_REGISTRY[key],
      include: Boolean(content) && !blocked.has(key),
      blocked: blocked.has(key),
      warnings: qualityIssues.filter((issue) => issue.section === key),
      mode: "insert_if_empty",
      sourceSegmentIds: generada.generatedClinicalText?.[key]?.sourceSegmentIds
        || generada[key]?.sourceSegmentIds
        || []
    }))
    .filter((item) => item.content);
}

export function agruparAdvertenciasVoz(issues = []) {
  const mapa = new Map();
  issues.forEach((issue) => {
    const category = issue.category || issue.concept || "Dato incierto";
    if (!mapa.has(category)) mapa.set(category, { category, occurrences: [], severity: issue.severity || "info" });
    const grupo = mapa.get(category);
    grupo.occurrences.push(issue);
    if (issue.severity === "high") grupo.severity = "high";
  });
  return Array.from(mapa.values()).map((grupo) => ({
    ...grupo,
    summary: `${grupo.category}: se identificaron ${grupo.occurrences.length} elemento(s) para revisar.`
  }));
}

export function construirPayloadGeneracionVoz({ snapshot = {}, patientContext = {}, options = {}, userId = "" } = {}) {
  const correctedTranscript = texto(snapshot.correctedTranscript || snapshot.confirmedTranscript || snapshot.text || "");
  const utterances = Array.isArray(options.conversationSegments) ? options.conversationSegments : [];
  const patientId = options.patientId || snapshot.patientId || patientContext.id || "";
  const encounterId = options.encounterId || snapshot.encounterId || "";
  const clientRequestId = options.clientRequestId || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const authorizedPatientContext = {
    source: "expediente",
    id: patientContext.id || patientId || "",
    patientId,
    encounterId,
    name: patientContext.nombreCompleto || patientContext.name || "",
    nombreCompleto: patientContext.nombreCompleto || patientContext.name || "",
    age: Number.isInteger(patientContext.edad) ? patientContext.edad : null,
    edad: Number.isInteger(patientContext.edad) ? patientContext.edad : null,
    sex: patientContext.sexo || patientContext.sex || "",
    sexo: patientContext.sexo || patientContext.sex || "",
    fechaNacimiento: patientContext.fechaNacimiento || "",
    service: options.service || patientContext.servicio || patientContext.service || "",
    servicio: options.service || patientContext.servicio || patientContext.service || "",
    hospitalizationDay: Number.isInteger(patientContext.diaEstancia) ? patientContext.diaEstancia : null,
    diaEstancia: Number.isInteger(patientContext.diaEstancia) ? patientContext.diaEstancia : null,
    admissionCriterion: patientContext.criterio || patientContext.admissionCriterion || "",
    criterio: patientContext.criterio || patientContext.admissionCriterion || "",
    diagnosticosActivos: patientContext.diagnosticosActivos || [],
    medicamentosActivos: patientContext.medicamentosActivos || [],
    alergias: patientContext.alergias || []
  };
  return {
    clientRequestId,
    patientContext: authorizedPatientContext,
    noteConfiguration: {
      noteType: options.documentType || "evolucion_observacion",
      styleId: options.writingStyle || "evolucion_narrativa_institucional",
      templateId: options.templateId || "",
      promptVersion: VOICE_NOTE_PROMPT_VERSION
    },
    generationPreferences: normalizarPreferenciasGeneracionVoz(options.generationPreferences || {}),
    encounterObservation: normalizarObservacionEncuentroVoz(options.encounterObservation || {}),
    selectedPatientQuotes: Array.isArray(options.selectedPatientQuotes) ? options.selectedPatientQuotes : [],
    mentalExamConfiguration: options.mentalExamConfiguration || {},
    transcript: {
      transcriptId: snapshot.transcriptSessionId || snapshot.sessionId || "",
      originalTextHash: options.originalTextHash || "",
      segmentationMode: options.segmentationMode || "hybrid",
      utterances
    },
    transcriptSessionId: snapshot.transcriptSessionId || snapshot.sessionId || "",
    userId: userId || snapshot.userId || "",
    patientId,
    encounterId,
    noteId: options.noteId || "",
    confirmedTranscript: texto(snapshot.confirmedTranscript || correctedTranscript),
    pendingTranscript: texto(snapshot.pendingTranscript || snapshot.pendingText || ""),
    correctedTranscript,
    transcriptSegments: snapshot.transcriptSegments || snapshot.confirmedSegments || [],
    conversationSegments: utterances,
    segmentationWarnings: Array.isArray(options.segmentationWarnings) ? options.segmentationWarnings : [],
    speakers: snapshot.speakers || [],
    provenance: snapshot.provenance || { source: "dictado_por_voz" },
    selectedDocumentType: options.documentType || "evolucion_observacion",
    selectedWritingStyle: options.writingStyle || "institucional_psiquiatrico_detallado",
    selectedTemplateId: options.templateId || "",
    selectedPromptVersion: options.promptVersion || "",
    existingNoteFields: options.existingNoteFields || {},
    authorizedPatientContext
  };
}

export async function generarNotaVoz({ provider, snapshot, patientContext, options, userId } = {}) {
  const payload = construirPayloadGeneracionVoz({ snapshot, patientContext, options, userId });
  if (payload.patientId && snapshot?.patientId && payload.patientId !== snapshot.patientId) {
    throw new Error("La sesion de dictado pertenece a otro paciente.");
  }
  if (!payload.correctedTranscript) throw new Error("No hay transcripcion revisada para generar.");
  if (payload.selectedDocumentType === "solo_transcripcion") {
    return {
      provider: "none",
      providerStatus: "solo_transcripcion",
      promptVersion: "",
      schemaVersion: VOICE_NOTE_SCHEMA_VERSION,
      generatedClinicalText: {},
      generatedSections: [],
      validationIssues: [{ category: "Informacion faltante", message: "Modo solo transcripcion: no se genero nota clinica." }]
    };
  }
  const generada = await provider.generate(payload, patientContext, {
    ...options,
    patientId: payload.patientId,
    userId: payload.userId,
    sessionId: payload.transcriptSessionId,
    encounterId: payload.encounterId,
    selectedDocumentType: payload.selectedDocumentType,
    selectedWritingStyle: payload.selectedWritingStyle,
    selectedTemplateId: payload.selectedTemplateId,
    selectedPromptVersion: payload.selectedPromptVersion,
    existingNoteFields: payload.existingNoteFields,
    authorizedPatientContext: payload.authorizedPatientContext
  });
  const qualityIssues = validarCalidadNotaVoz(generada, payload.correctedTranscript, patientContext);
  const additionalQualityIssues = [];
  const segmentacionBasica = payload.segmentationWarnings.some((warning) =>
    ["basic_segmentation", "external_segmentation_failed", "segmentation_low_resolution"].includes(warning.code)
  );
  const turnosAmbiguos = (payload.conversationSegments || []).filter((utterance) => {
    const palabras = String(utterance.text || utterance.originalText || "").trim().split(/\s+/).filter(Boolean).length;
    return utterance.probableRole === "unknown" || utterance.speechAct === "other" || palabras > 35;
  });
  if (segmentacionBasica && turnosAmbiguos.length) {
    additionalQualityIssues.push({
      category: "Hablante no identificado",
      section: "evolutionOrSubjective",
      severity: "high",
      message: `Segmentación básica con ${turnosAmbiguos.length} fragmento(s) ambiguo(s). Revise esos turnos antes de aceptar Evolución.`,
      evidence: turnosAmbiguos.slice(0, 6).map((utterance) => utterance.text || utterance.originalText || "")
    });
  }
  const allQualityIssues = [...qualityIssues, ...additionalQualityIssues];
  return {
    ...generada,
    schemaVersion: VOICE_NOTE_SCHEMA_VERSION,
    transferSections: crearTransferSections(generada, payload.correctedTranscript, patientContext, additionalQualityIssues),
    validationIssues: agruparAdvertenciasVoz([...(generada.validationIssues || []), ...allQualityIssues]),
    rawQualityIssues: allQualityIssues
  };
}

function fechaInput(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaInput(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function obtenerValorAnidado(objeto = {}, path = "") {
  return path.split(".").reduce((actual, key) => actual?.[key], objeto);
}

function asignarValorAnidado(objeto, path, value) {
  const parts = path.split(".");
  let target = objeto;
  parts.slice(0, -1).forEach((part) => {
    target[part] ||= {};
    target = target[part];
  });
  target[parts.at(-1)] = value;
}

function combinarTexto(actual = "", nuevo = "", mode = "insert_if_empty") {
  const previo = texto(actual);
  const siguiente = texto(nuevo);
  if (!siguiente) return previo;
  if (mode === "exclude") return previo;
  if (mode === "replace") return siguiente;
  if (mode === "insert_if_empty") return previo || siguiente;
  return previo ? `${previo}\n\n${siguiente}` : siguiente;
}

function textoSeccion(sections = [], key) {
  return sections.find((section) => section.key === key && section.include !== false)?.content || "";
}

export function construirNotaPayloadDesdeVoz({
  patient = {},
  user = {},
  sections = [],
  existingDraft = {},
  documentType = "evolucion_observacion",
  draftMetadata = {}
} = {}) {
  const observacionActual = existingDraft.observacionFray || {};
  const payload = {
    ...existingDraft,
    formatoNota: existingDraft.formatoNota || "cognicion",
    formatoInstitucional: existingDraft.formatoInstitucional || "",
    exportacionWord: existingDraft.exportacionWord || { habilitada: true, formato: "cognicion", plantillaSugerida: "cognicion" },
    pacienteId: patient.id || existingDraft.pacienteId || "",
    expedienteId: existingDraft.expedienteId || patient.expediente || patient.numeroExpediente || `paciente:${patient.id || ""}`,
    atencionId: existingDraft.atencionId || draftMetadata.encounterId || `paciente:${patient.id || ""}`,
    tipoAtencion: existingDraft.tipoAtencion || "expediente",
    usuarioId: user.uid || existingDraft.usuarioId || "",
    usuarioNombre: user.nombre || user.nombreCompleto || user.email || existingDraft.usuarioNombre || "",
    medicoResponsable: existingDraft.medicoResponsable || user.nombre || user.nombreCompleto || user.email || "",
    servicio: existingDraft.servicio || draftMetadata.service || patient.servicio || "",
    tratamiento: existingDraft.tratamiento || patient.tratamiento || patient.datosClinicosResumen?.tratamientoActivo || "",
    diagnosticos: existingDraft.diagnosticos || patient.historialDiagnosticos || [],
    diagnosticoCatalogoVisible: existingDraft.diagnosticoCatalogoVisible || patient.diagnosticoCatalogoVisible || "auto",
    ultimaConsulta: existingDraft.ultimaConsulta || patient.ultimaConsulta || "",
    proximaConsulta: existingDraft.proximaConsulta || patient.proximaConsulta || "",
    tipoNota: existingDraft.tipoNota || "completa",
    tipoNotaClave: existingDraft.tipoNotaClave || `completa:${documentType}`,
    notaRapida: existingDraft.notaRapida || "",
    subjetivo: existingDraft.subjetivo || "",
    objetivo: existingDraft.objetivo || "",
    analisis: existingDraft.analisis || "",
    plan: existingDraft.plan || "",
    observacionFray: {
      ...observacionActual,
      tipoNota: observacionActual.tipoNota || (documentType.includes("ingreso") ? "ingreso" : "evolucion"),
      fechaNota: observacionActual.fechaNota || fechaInput(),
      horaNota: observacionActual.horaNota || horaInput(),
      exploracionFisicaNeurologica: observacionActual.exploracionFisicaNeurologica || "",
      resultadosEstudios: observacionActual.resultadosEstudios || "",
      pronostico: observacionActual.pronostico || "",
      destino: observacionActual.destino || ""
    },
    camposDinamicos: existingDraft.camposDinamicos || {},
    voiceNoteTransfer: {
      ...(existingDraft.voiceNoteTransfer || {}),
      ...draftMetadata,
      transferredAt: new Date().toISOString(),
      schemaVersion: VOICE_NOTE_SCHEMA_VERSION
    }
  };

  sections.forEach((section) => {
    if (!section.include || section.blocked || !section.field?.noteKey) return;
    const current = obtenerValorAnidado(payload, section.field.noteKey);
    asignarValorAnidado(payload, section.field.noteKey, combinarTexto(current, section.content, section.mode || "insert_if_empty"));
  });

  if (!payload.subjetivo) payload.subjetivo = textoSeccion(sections, "evolutionOrSubjective");
  if (!payload.objetivo) payload.objetivo = textoSeccion(sections, "mentalStatusExam");
  if (!payload.analisis) payload.analisis = textoSeccion(sections, "analysis");
  if (!payload.plan) payload.plan = textoSeccion(sections, "plan");

  return payload;
}

export async function leerNotaExistente(uidPaciente, noteId = "") {
  if (!uidPaciente || !noteId) return null;
  const snap = await getDoc(doc(db, "usuarios", uidPaciente, "notasMedicas", noteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function transferirNotaVozABorrador({
  patientId,
  noteId = "",
  patient,
  user,
  sections,
  documentType,
  draftMetadata
} = {}) {
  if (!patientId) throw new Error("No se pudo identificar al paciente.");
  const existingDraft = await leerNotaExistente(patientId, noteId);
  const payload = construirNotaPayloadDesdeVoz({
    patient: { ...(patient || {}), id: patientId },
    user,
    sections,
    existingDraft: existingDraft || {},
    documentType,
    draftMetadata
  });
  const confirmado = await guardarBorradorNotaClinica(patientId, existingDraft?.id || noteId || "", payload);
  return confirmado;
}

export async function guardarSesionVozFirestore({ userId, patientId, encounterId, sessionId, status, data = {} } = {}) {
  if (!userId || !patientId || !sessionId) return null;
  const ref = doc(db, "usuarios", userId, "voiceNoteSessions", sessionId);
  await setDoc(ref, {
    userId,
    patientId,
    encounterId: encounterId || "",
    sessionId,
    status: status || "draft",
    schemaVersion: VOICE_NOTE_SCHEMA_VERSION,
    ...data,
    updatedAt: serverTimestamp(),
    createdAt: data.createdAt || serverTimestamp()
  }, { merge: true });
  return ref.id;
}

export async function guardarTranscripcionVozFirestore({ userId, sessionId, transcript = {}, status = "reviewed" } = {}) {
  if (!userId || !sessionId) return null;
  const ref = doc(collection(db, "usuarios", userId, "voiceTranscripts"));
  await setDoc(ref, {
    userId,
    sessionId,
    status,
    transcriptSessionId: transcript.transcriptSessionId || transcript.sessionId || sessionId,
    patientId: transcript.patientId || "",
    encounterId: transcript.encounterId || "",
    confirmedSegments: transcript.transcriptSegments || transcript.confirmedSegments || [],
    hasCorrectedTranscript: Boolean(texto(transcript.correctedTranscript || transcript.confirmedTranscript)),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function guardarDraftGeneradoVozFirestore({ userId, patientId, sessionId, generated = {}, transferredNoteId = "" } = {}) {
  if (!userId || !patientId || !sessionId) return null;
  const ref = doc(collection(db, "usuarios", userId, "generatedNoteDrafts"));
  await setDoc(ref, {
    userId,
    patientId,
    sessionId,
    provider: generated.provider || "",
    promptVersion: generated.promptVersion || generated.metadata?.promptVersion || "",
    schemaVersion: VOICE_NOTE_SCHEMA_VERSION,
    transferredNoteId,
    status: transferredNoteId ? "transferred" : "review",
    validationIssueCount: generated.validationIssues?.length || 0,
    sectionKeys: (generated.transferSections || []).map((section) => section.key),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });
  return ref.id;
}
