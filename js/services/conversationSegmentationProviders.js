import { segmentarConversacionClinica } from "./clinicalPipeline.js";

export const CONVERSATION_SEGMENTATION_SCHEMA_VERSION = "conversation_segmentation_v1";
export const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v2_2026-07-18";

function texto(valor = "") {
  return String(valor || "").trim();
}

export function validarSegmentacionConversacional(resultado = {}) {
  const utterances = Array.isArray(resultado.utterances) ? resultado.utterances : [];
  return {
    transcriptId: texto(resultado.transcriptId),
    segmentationMode: ["acoustic", "linguistic", "hybrid", "manual"].includes(resultado.segmentationMode)
      ? resultado.segmentationMode
      : "linguistic",
    schemaVersion: resultado.schemaVersion || CONVERSATION_SEGMENTATION_SCHEMA_VERSION,
    promptVersion: resultado.promptVersion || "",
    provider: resultado.provider || "",
    utterances: utterances.map((utterance, index) => ({
      id: utterance.id || utterance.utteranceId || `utt-${index + 1}`,
      utteranceId: utterance.utteranceId || utterance.id || `utt-${index + 1}`,
      sequence: Number.isFinite(Number(utterance.sequence)) ? Number(utterance.sequence) : index + 1,
      startTime: Number.isFinite(Number(utterance.startTime)) ? Number(utterance.startTime) : null,
      endTime: Number.isFinite(Number(utterance.endTime)) ? Number(utterance.endTime) : null,
      text: texto(utterance.text),
      originalText: texto(utterance.originalText || utterance.text),
      probableRole: ["clinician", "patient", "relative", "unknown"].includes(utterance.probableRole) ? utterance.probableRole : "unknown",
      speechAct: ["question", "answer", "observation", "clinical_summary", "clinical_assessment", "plan", "correction", "other"].includes(utterance.speechAct) ? utterance.speechAct : "other",
      linkedUtteranceId: texto(utterance.linkedUtteranceId || utterance.linkedQuestionId),
      linkedQuestionId: texto(utterance.linkedQuestionId || utterance.linkedUtteranceId),
      confidence: Number.isFinite(Number(utterance.confidence)) ? Number(utterance.confidence) : null,
      sourceSegmentIds: Array.isArray(utterance.sourceSegmentIds) ? utterance.sourceSegmentIds : [],
      requiresReview: utterance.requiresReview !== false
    })).filter((utterance) => utterance.text),
    warnings: Array.isArray(resultado.warnings) ? resultado.warnings : []
  };
}

export class RuleBasedConversationSegmentationProvider {
  constructor() {
    this.provider = "rule_based";
  }

  segment(payload = {}) {
    const text = texto(payload.text || payload.correctedTranscript || payload.confirmedTranscript);
    const utterances = segmentarConversacionClinica(text);
    return validarSegmentacionConversacional({
      transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
      segmentationMode: "linguistic",
      schemaVersion: CONVERSATION_SEGMENTATION_SCHEMA_VERSION,
      promptVersion: "rule_based_conversation_segmentation_v1",
      provider: this.provider,
      utterances,
      warnings: [
        ...(utterances.warnings || []),
        { code: "basic_segmentation", message: "Segmentacion basica. Revise los hablantes." }
      ]
    });
  }
}

export class ExternalConversationSegmentationProvider {
  constructor({ callable, fallbackToLocal = true } = {}) {
    this.callable = callable;
    this.fallbackToLocal = fallbackToLocal;
    this.local = new RuleBasedConversationSegmentationProvider();
    this.provider = "external";
  }

  async segment(payload = {}) {
    if (!this.callable) {
      const local = this.local.segment(payload);
      return {
        ...local,
        provider: "rule_based",
        fallback: true,
        providerFailure: { code: "not_configured", message: "No hay callable de segmentacion configurada en frontend." }
      };
    }

    try {
      const response = await this.callable(payload);
      const data = response?.data || response || {};
      return validarSegmentacionConversacional({
        ...data,
        provider: data.provider || "external",
        promptVersion: data.promptVersion || CONVERSATION_SEGMENTATION_PROMPT_VERSION
      });
    } catch (error) {
      if (!this.fallbackToLocal) throw error;
      const providerFailure = {
        name: error?.name || "",
        code: error?.code || error?.status || "",
        message: String(error?.message || error || "Error no especificado"),
        details: error?.details || error?.customData || null,
        stage: error?.details?.stage || "",
        requestId: error?.details?.requestId || "",
        retryable: Boolean(error?.details?.retryable)
      };
      const local = this.local.segment(payload);
      return {
        ...local,
        fallback: true,
        providerFailure,
        warnings: [
          ...(local.warnings || []),
          { code: "external_segmentation_failed", message: `No se pudo usar el proveedor externo (${providerFailure.code || providerFailure.name || "sin_codigo"}): ${providerFailure.message}` }
        ]
      };
    }
  }
}

export function createConversationSegmentationProvider(options = {}) {
  if (options.provider === "external") return new ExternalConversationSegmentationProvider(options.external || {});
  return new RuleBasedConversationSegmentationProvider();
}
