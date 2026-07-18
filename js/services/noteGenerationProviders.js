import { generarNotaAutomatica } from "./notaAutomatica.js";
import { PROVIDER_STATUS } from "./transcriptionProviders.js";

export class NoteGenerationProvider {
  constructor(config = {}) {
    this.config = config;
    this.status = PROVIDER_STATUS.NOT_CONFIGURED;
  }
  capability() {
    return { status: this.status };
  }
  generate() {
    throw new Error("NoteGenerationProvider.generate debe implementarse.");
  }
}

function normalizarPayloadEntrada(transcript, patient = {}, options = {}) {
  if (transcript && typeof transcript === "object" && !Array.isArray(transcript) && ("confirmedTranscript" in transcript || "correctedTranscript" in transcript)) {
    return {
      ...transcript,
      authorizedPatientContext: transcript.authorizedPatientContext || patient || {},
      selectedDocumentType: transcript.selectedDocumentType || options.tipoNota || options.selectedDocumentType || "evolucion_observacion",
      selectedWritingStyle: transcript.selectedWritingStyle || options.selectedWritingStyle || options.formato || "formato_fray_narrativo"
    };
  }
  return {
    transcriptSessionId: options.sessionId || "",
    userId: options.userId || "",
    patientId: options.patientId || patient?.id || patient?.uid || "",
    encounterId: options.encounterId || "",
    confirmedTranscript: String(transcript || ""),
    pendingTranscript: "",
    correctedTranscript: String(transcript || ""),
    transcriptSegments: Array.isArray(transcript) ? transcript : [],
    speakers: [],
    provenance: { source: "dictado_por_voz", status: "legacy_text_input" },
    selectedDocumentType: options.tipoNota || options.selectedDocumentType || "evolucion_observacion",
    selectedWritingStyle: options.selectedWritingStyle || options.formato || "formato_fray_narrativo",
    existingNoteFields: options.existingNoteFields || {},
    authorizedPatientContext: patient || {}
  };
}

function seccionesExternasAGeneratedSections(data = {}) {
  if (Array.isArray(data.generatedSections)) return data.generatedSections;
  if (data.evolutionOrSubjective || data.subjective || data.objective || data.analysis || data.plan) {
    const soap = data;
    return [
      { section: "soap_subjective", fieldTarget: "subjective", title: "EVOLUCION / SUBJETIVO", content: soap.evolutionOrSubjective?.text || soap.subjective?.text, sourceStatementIds: soap.evolutionOrSubjective?.sourceSegmentIds || soap.subjective?.sourceSegmentIds || [] },
      { section: "soap_physical_exam", fieldTarget: "physicalExam", title: "OBJETIVO - Exploración física y neurológica", content: soap.objective?.physicalNeurologicalExam, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
      { section: "soap_mental_status", fieldTarget: "mentalStatusExam", title: "OBJETIVO - Examen mental", content: soap.objective?.mentalStatusExam, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
      { section: "soap_results", fieldTarget: "results", title: "OBJETIVO - Resultados", content: soap.objective?.results, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
      { section: "soap_analysis", fieldTarget: "analysis", title: "ANÁLISIS", content: soap.analysis?.text, sourceStatementIds: soap.analysis?.sourceSegmentIds || [] },
      { section: "soap_plan", fieldTarget: "plan", title: "PLAN", content: soap.plan?.text, sourceStatementIds: soap.plan?.sourceSegmentIds || [] }
    ].map((section) => ({
      ...section,
      id: `external-${section.section}`,
      content: String(section.content || "").trim(),
      accepted: false,
      reviewStatus: "pendiente_revision",
      version: 1,
      insertable: true
    })).filter((section) => section.content);
  }
  const sections = data.sections || {};
  const mapa = [
    ["motivo", "motivo_consulta", "Motivo / criterio"],
    ["antecedentes", "antecedentes_psiquiatricos", "Antecedentes"],
    ["padecimientoActual", "padecimiento_actual", "Padecimiento actual"],
    ["evolucion", "padecimiento_actual", "Evolucion"],
    ["exploracionFisica", "exploracion_fisica", "Exploracion fisica y neurologica"],
    ["examenMental", "examen_mental", "Examen mental"],
    ["resultados", "resultados_auxiliares", "Resultados"],
    ["comentarioClinico", "comentario_clinico", "Comentario clinico"],
    ["plan", "plan", "Plan"],
    ["pronostico", "pronostico", "Pronostico"],
    ["destino", "destino", "Destino"]
  ];
  return mapa
    .map(([key, section, title]) => ({
      id: `external-${section}`,
      section,
      title,
      content: String(sections[key] || "").trim(),
      sourceStatementIds: [],
      accepted: false,
      reviewStatus: "pendiente_revision",
      version: 1,
      insertable: true
    }))
    .filter((section) => section.content);
}

function normalizarSalidaExterna(data = {}, payload = {}) {
  const generatedSections = seccionesExternasAGeneratedSections(data);
  if (!generatedSections.length) throw new Error("El proveedor no devolvio secciones validas.");
  return {
    ...data,
    provider: "external_structured_backend",
    providerStatus: "disponible",
    generatedSections,
    outputs: data.outputs || {
      nota_medica_estructurada: generatedSections.map((section) => `${section.title.toUpperCase()}\n${section.content}`).join("\n\n"),
      redaccion_clinica_conservadora: generatedSections.map((section) => section.content).join("\n\n"),
      literal_corregida: payload.correctedTranscript || payload.confirmedTranscript || ""
    },
    generatedClinicalText: data.evolutionOrSubjective || data.subjective || data.objective || data.analysis || data.plan ? {
      evolutionOrSubjective: data.evolutionOrSubjective || data.subjective || {},
      subjective: data.subjective || data.evolutionOrSubjective || {},
      objective: data.objective || {},
      analysis: data.analysis || {},
      plan: data.plan || {}
    } : data.generatedClinicalText,
    clinicalStatements: data.clinicalStatements || [],
    medicationStatements: data.medications || data.medicationStatements || [],
    substanceUseStatements: data.substances || data.substanceUseStatements || [],
    riskStatements: data.riskStatements || [],
    diagnosisStatements: data.diagnosisProposals || data.diagnosisStatements || [],
    planItems: data.planItems || [],
    medicalOrderProposals: data.indicationProposals || data.medicalOrderProposals || [],
    validationIssues: data.validationIssues || [],
    insertionAllowed: false,
    reviewStatus: "pendiente"
  };
}

export class RuleBasedNoteGenerationProvider extends NoteGenerationProvider {
  constructor(config = {}) {
    super(config);
    this.status = PROVIDER_STATUS.AVAILABLE;
  }
  capability() {
    return {
      id: "rule_based_local",
      status: this.status,
      configured: true,
      isExternalAI: false,
      notice: "Procesamiento local basado en reglas. La redaccion avanzada no esta disponible."
    };
  }
  generate(transcript, patient = {}, options = {}) {
    const payload = normalizarPayloadEntrada(transcript, patient, options);
    const text = payload.correctedTranscript || payload.confirmedTranscript || "";
    return generarNotaAutomatica(text, payload.authorizedPatientContext || patient, {
      ...options,
      patientId: payload.patientId,
      userId: payload.userId,
      sessionId: payload.transcriptSessionId,
      encounterId: payload.encounterId,
      tipoNota: payload.selectedDocumentType,
      selectedDocumentType: payload.selectedDocumentType,
      selectedWritingStyle: payload.selectedWritingStyle,
      existingNoteFields: payload.existingNoteFields,
      authorizedPatientContext: payload.authorizedPatientContext,
      transcriptPayload: payload
    });
  }
}

export class ExternalStructuredNoteGenerationProvider extends NoteGenerationProvider {
  constructor(config = {}) {
    super(config);
    this.fallback = new RuleBasedNoteGenerationProvider(config.localFallback || {});
    this.status = (config.callable || config.backendEndpoint) ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.NOT_CONFIGURED;
  }
  capability() {
    const configured = Boolean(this.config.callable || this.config.backendEndpoint);
    return {
      id: "external_structured_backend",
      status: this.status,
      configured,
      isExternalAI: configured,
      notice: configured
        ? "Proveedor generativo estructurado conectado via backend/Cloud Functions. Revise cada apartado antes de insertar."
        : "Procesamiento local basado en reglas. La redaccion avanzada no esta disponible."
    };
  }
  async generate(transcript, patient = {}, options = {}) {
    const payload = normalizarPayloadEntrada(transcript, patient, options);
    if (!this.config.callable && !this.config.backendEndpoint) {
      return this.fallback.generate(payload, patient, options);
    }
    try {
      const response = this.config.callable
        ? await this.config.callable(payload)
        : await fetch(this.config.backendEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
      return normalizarSalidaExterna(response?.data || response || {}, payload);
    } catch (error) {
      if (this.config.fallbackToLocal === false) throw error;
      const fallback = this.fallback.generate(payload, patient, options);
      fallback.metadata = {
        ...(fallback.metadata || {}),
        externalProviderError: String(error?.message || error),
        processingDisclosure: "Procesamiento local basado en reglas. La redaccion avanzada no esta disponible."
      };
      fallback.providerStatus = "fallback_local";
      return fallback;
    }
  }
}

export class ExternalNoteGenerationProvider extends ExternalStructuredNoteGenerationProvider {}

export function createNoteGenerationProvider(config = {}) {
  if (config.provider === "external") return new ExternalStructuredNoteGenerationProvider(config.external || {});
  return new RuleBasedNoteGenerationProvider(config.local || {});
}
