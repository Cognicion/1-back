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
  if (transcript && typeof transcript === "object" && !Array.isArray(transcript) && transcript.patientContext && transcript.noteConfiguration && transcript.transcript) {
    return {
      ...transcript,
      authorizedPatientContext: transcript.authorizedPatientContext || transcript.patientContext || patient || {},
      selectedDocumentType: transcript.selectedDocumentType || transcript.noteConfiguration?.noteType || options.tipoNota || options.selectedDocumentType || "evolucion_observacion",
      selectedWritingStyle: transcript.selectedWritingStyle || transcript.noteConfiguration?.styleId || options.selectedWritingStyle || options.formato || "evolucion_narrativa_institucional",
      correctedTranscript: transcript.correctedTranscript || (transcript.transcript?.utterances || []).map((utterance) => utterance.text || "").join("\n"),
      confirmedTranscript: transcript.confirmedTranscript || (transcript.transcript?.utterances || []).map((utterance) => utterance.text || "").join("\n")
    };
  }
  if (transcript && typeof transcript === "object" && !Array.isArray(transcript) && ("confirmedTranscript" in transcript || "correctedTranscript" in transcript)) {
    return {
      ...transcript,
      authorizedPatientContext: transcript.authorizedPatientContext || patient || {},
      selectedDocumentType: transcript.selectedDocumentType || options.tipoNota || options.selectedDocumentType || "evolucion_observacion",
      selectedWritingStyle: transcript.selectedWritingStyle || options.selectedWritingStyle || options.formato || "evolucion_narrativa_institucional"
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
    selectedWritingStyle: options.selectedWritingStyle || options.formato || "evolucion_narrativa_institucional",
    existingNoteFields: options.existingNoteFields || {},
    authorizedPatientContext: patient || {}
  };
}

function seccionesExternasAGeneratedSections(data = {}) {
  if (Array.isArray(data.generatedSections)) return data.generatedSections;
  if (data.sections?.evolution) {
    const evolution = data.sections.evolution;
    const content = String(evolution.text || "").trim();
    return content ? [{
      id: "external-evolution",
      section: "soap_subjective",
      fieldTarget: "evolutionOrSubjective",
      title: "Evolucion/Subjetivo",
      content,
      sourceStatementIds: evolution.sourceUtteranceIds || [],
      sourceUtteranceIds: evolution.sourceUtteranceIds || [],
      accepted: false,
      reviewStatus: "pendiente_revision",
      version: 1,
      insertable: true
    }] : [];
  }
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
  const evolution = data.sections?.evolution;
  return {
    ...data,
    provider: data.provider || "external",
    providerStatus: "disponible",
    promptVersion: data.promptVersion || payload.noteConfiguration?.promptVersion || "",
    schemaVersion: data.schemaVersion || "voice_note_evolution_v1",
    validatorVersion: data.validatorVersion || "",
    generatedSections,
    outputs: data.outputs || {
      nota_medica_estructurada: generatedSections.map((section) => `${section.title.toUpperCase()}\n${section.content}`).join("\n\n"),
      redaccion_clinica_conservadora: generatedSections.map((section) => section.content).join("\n\n"),
      literal_corregida: payload.correctedTranscript || payload.confirmedTranscript || ""
    },
    generatedClinicalText: evolution ? {
      evolutionOrSubjective: {
        text: evolution.text || "",
        sourceSegmentIds: evolution.sourceUtteranceIds || [],
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        warnings: evolution.warnings || [],
        requiresReview: evolution.requiresReview !== false,
        confidence: evolution.confidence ?? null
      },
      subjective: {
        text: evolution.text || "",
        sourceSegmentIds: evolution.sourceUtteranceIds || [],
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        warnings: evolution.warnings || [],
        requiresReview: evolution.requiresReview !== false,
        confidence: evolution.confidence ?? null
      },
      objective: {},
      analysis: {},
      plan: {}
    } : (data.evolutionOrSubjective || data.subjective || data.objective || data.analysis || data.plan ? {
      evolutionOrSubjective: data.evolutionOrSubjective || data.subjective || {},
      subjective: data.subjective || data.evolutionOrSubjective || {},
      objective: data.objective || {},
      analysis: data.analysis || {},
      plan: data.plan || {}
    } : data.generatedClinicalText),
    clinicalStatements: data.clinicalStatements || [],
    medicationStatements: data.medications || data.medicationStatements || [],
    substanceUseStatements: data.substances || data.substanceUseStatements || [],
    riskStatements: data.riskStatements || [],
    diagnosisStatements: data.diagnosisProposals || data.diagnosisStatements || [],
    planItems: data.planItems || [],
    medicalOrderProposals: data.indicationProposals || data.medicalOrderProposals || [],
    validationIssues: data.validationIssues || data.globalWarnings || evolution?.warnings || [],
    insertionAllowed: false,
    reviewStatus: "pendiente"
  };
}

function describirErrorProveedor(error) {
  return {
    name: error?.name || "",
    code: error?.code || error?.status || "",
    message: String(error?.message || error || "Error no especificado"),
    details: error?.details || error?.customData || null
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
      const providerError = describirErrorProveedor(error);
      const fallback = this.fallback.generate(payload, patient, options);
      fallback.metadata = {
        ...(fallback.metadata || {}),
        externalProviderError: providerError.message,
        externalProviderFailure: providerError,
        processingDisclosure: "Procesamiento local basado en reglas. La redaccion avanzada no esta disponible."
      };
      fallback.validationIssues = [
        ...(fallback.validationIssues || []),
        {
          id: "external_provider_failed",
          category: "Dato incierto",
          severity: "high",
          message: `No se pudo usar el proveedor generativo externo (${providerError.code || providerError.name || "sin_codigo"}): ${providerError.message}`,
          requiresExplicitReview: true
        }
      ];
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
