import { db } from "../firebase.js";
import { guardarBorradorNotaClinica } from "./notas.js?v=20260716-2";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const VOICE_NOTE_SCHEMA_VERSION = "voice_note_soap_v1";

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

export const VOICE_NOTE_TYPES = Object.freeze([
  ["ingreso_observacion", "Ingreso a Observacion"],
  ["evolucion_observacion", "Evolucion de Observacion"],
  ["egreso_traslado_observacion", "Egreso/traslado de Observacion"],
  ["ingreso_ucep", "Ingreso a UCEP"],
  ["evolucion_ucep", "Evolucion de UCEP"],
  ["urgencias", "Urgencias"],
  ["referencia_navarro", "Referencia tipo Navarro"],
  ["contrarreferencia", "Contrarreferencia"],
  ["consulta_externa", "Consulta externa"],
  ["pediatria", "Pediatria"],
  ["paidopsiquiatria", "Paidopsiquiatria"],
  ["dictado_libre", "Dictado libre"],
  ["solo_transcripcion", "Solo transcripcion"]
]);

export const VOICE_NOTE_STYLES = Object.freeze([
  ["formato_fray_narrativo", "Formato Fray - narrativo institucional"],
  ["clinico_detallado", "Clinico detallado"],
  ["clinico_resumido", "Clinico resumido"],
  ["conservador_literal", "Conservador literal"],
  ["urgencias_referencia_breve", "Urgencias/referencia breve"],
  ["personalizado", "Personalizado"]
]);

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

  return issues;
}

export function crearTransferSections(generada = {}, transcripcion = "", contextoPaciente = {}) {
  const qualityIssues = validarCalidadNotaVoz(generada, transcripcion, contextoPaciente);
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
  return {
    transcriptSessionId: snapshot.transcriptSessionId || snapshot.sessionId || "",
    userId: userId || snapshot.userId || "",
    patientId: options.patientId || snapshot.patientId || patientContext.id || "",
    encounterId: options.encounterId || snapshot.encounterId || "actual",
    noteId: options.noteId || "",
    confirmedTranscript: texto(snapshot.confirmedTranscript || correctedTranscript),
    pendingTranscript: texto(snapshot.pendingTranscript || snapshot.pendingText || ""),
    correctedTranscript,
    transcriptSegments: snapshot.transcriptSegments || snapshot.confirmedSegments || [],
    speakers: snapshot.speakers || [],
    provenance: snapshot.provenance || { source: "dictado_por_voz" },
    selectedDocumentType: options.documentType || "evolucion_observacion",
    selectedWritingStyle: options.writingStyle || "formato_fray_narrativo",
    existingNoteFields: options.existingNoteFields || {},
    authorizedPatientContext: {
      source: "expediente",
      id: patientContext.id || options.patientId || "",
      nombreCompleto: patientContext.nombreCompleto || "",
      edad: Number.isInteger(patientContext.edad) ? patientContext.edad : null,
      sexo: patientContext.sexo || "",
      fechaNacimiento: patientContext.fechaNacimiento || "",
      servicio: options.service || patientContext.servicio || "",
      diagnosticosActivos: patientContext.diagnosticosActivos || [],
      medicamentosActivos: patientContext.medicamentosActivos || [],
      alergias: patientContext.alergias || []
    }
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
    existingNoteFields: payload.existingNoteFields,
    authorizedPatientContext: payload.authorizedPatientContext
  });
  const qualityIssues = validarCalidadNotaVoz(generada, payload.correctedTranscript, patientContext);
  return {
    ...generada,
    schemaVersion: VOICE_NOTE_SCHEMA_VERSION,
    transferSections: crearTransferSections(generada, payload.correctedTranscript, patientContext),
    validationIssues: agruparAdvertenciasVoz([...(generada.validationIssues || []), ...qualityIssues]),
    rawQualityIssues: qualityIssues
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
