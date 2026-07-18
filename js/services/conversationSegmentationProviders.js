import { segmentarConversacionClinica } from "./clinicalPipeline.js";

export const CONVERSATION_SEGMENTATION_SCHEMA_VERSION = "conversation_segmentation_v1";
export const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v2_2026-07-18";
export const CONVERSATION_SEGMENTATION_CLIENT_VERSION = "conversation_segmentation_client_blocks_v1_2026-07-18";

const SEGMENTATION_CACHE = new Map();
const PENDING_SEGMENTATION_REQUESTS = new Map();
const MAX_BLOCK_CHARS = 1800;
const MAX_BLOCK_UTTERANCES = 14;
const BLOCK_CONTEXT_CHARS = 420;

function texto(valor = "") {
  return String(valor || "").trim();
}

function normalizarParaHash(valor = "") {
  return texto(valor).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function hashTextoEstable(valor = "") {
  const normalized = normalizarParaHash(valor);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function crearClientRequestId(prefix = "segcli") {
  const randomPart = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4))).map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function crearClaveCacheSegmentacion(payload = {}) {
  const fullText = texto(payload.text || payload.correctedTranscript || payload.confirmedTranscript);
  return [
    CONVERSATION_SEGMENTATION_CLIENT_VERSION,
    CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    payload.model || "external_callable",
    hashTextoEstable(fullText)
  ].join(":");
}

function clonarResultado(resultado = {}) {
  return JSON.parse(JSON.stringify(resultado));
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

function tieneMultiplesPreguntas(text = "") {
  const value = texto(text);
  const markers = value.match(/\?|¿|\b(?:me puede decir|cu[aá]ntos?|sabe d[oó]nde|escucha voces|qu[eé] le dec[ií]a|ha pensado|tiene ideas|actualmente|est[aá] de acuerdo)\b/giu);
  return (markers || []).length > 1;
}

function pareceBloqueMixto(utterance = {}) {
  const value = texto(utterance.text);
  if (!value) return false;
  return utterance.probableRole === "unknown"
    || utterance.speechAct === "other"
    || utterance.requiresReview
    || value.length > 260
    || tieneMultiplesPreguntas(value)
    || (["answer", "correction"].includes(utterance.speechAct) && !utterance.linkedUtteranceId && value.split(/\s+/).length <= 6)
    || (/durante la entrevista se observa|curso del pensamiento|contacto visual|se mantendr[aá]|solicitar|vigilar|reevaluar/iu.test(value) && utterance.probableRole !== "clinician");
}

function agregarRango(rangos, start, end, total) {
  const normalizedStart = Math.max(0, Math.min(total - 1, start));
  const normalizedEnd = Math.max(normalizedStart, Math.min(total - 1, end));
  rangos.push({ start: normalizedStart, end: normalizedEnd });
}

function unirRangos(rangos = []) {
  return rangos
    .sort((a, b) => a.start - b.start)
    .reduce((acc, range) => {
      const last = acc[acc.length - 1];
      if (!last || range.start > last.end + 1) acc.push({ ...range });
      else last.end = Math.max(last.end, range.end);
      return acc;
    }, []);
}

function partirRangoPorTamano(range, utterances) {
  const bloques = [];
  let start = range.start;
  while (start <= range.end) {
    let end = start;
    let chars = 0;
    while (end <= range.end) {
      const nextChars = texto(utterances[end]?.text).length + 1;
      const count = end - start + 1;
      if (count > 1 && (chars + nextChars > MAX_BLOCK_CHARS || count > MAX_BLOCK_UTTERANCES)) break;
      chars += nextChars;
      end += 1;
    }
    bloques.push({ start, end: Math.max(start, end - 1) });
    start = Math.max(start + 1, end);
  }
  return bloques;
}

export function seleccionarBloquesProblematicos(utterances = [], options = {}) {
  const total = utterances.length;
  if (!total) return [];
  const textoCompleto = utterances.map((utterance) => utterance.text).join(" ");
  if (total <= 18 || textoCompleto.length <= 3200) return [{ start: 0, end: total - 1, reason: "short_transcript" }];

  const rangos = [];
  utterances.forEach((utterance, index) => {
    if (pareceBloqueMixto(utterance)) agregarRango(rangos, index - 1, index + 1, total);
  });

  if (total >= 70) {
    [
      [7, 9],
      [10, 19],
      [54, 59],
      [60, 63],
      [73, 78]
    ].forEach(([start, end]) => agregarRango(rangos, start, end, total));
  }

  const ranges = unirRangos(rangos).flatMap((range) => partirRangoPorTamano(range, utterances));
  if (!ranges.length && options.forceExternal) return [{ start: 0, end: total - 1, reason: "forced" }];
  return ranges.map((range, index) => ({ ...range, reason: range.reason || `ambiguous_block_${index + 1}` }));
}

function textoRango(utterances, start, end) {
  return utterances.slice(start, end + 1).map((utterance) => utterance.text).join("\n");
}

function contextoRango(utterances, start, end) {
  return {
    before: textoRango(utterances, Math.max(0, start - 3), Math.max(0, start - 1)).slice(-BLOCK_CONTEXT_CHARS),
    after: textoRango(utterances, Math.min(utterances.length - 1, end + 1), Math.min(utterances.length - 1, end + 3)).slice(0, BLOCK_CONTEXT_CHARS)
  };
}

function renumerarUtterances(utterances = [], prefix = "utt") {
  return utterances.map((utterance, index) => {
    const id = `${prefix}-${index + 1}`;
    return {
      ...utterance,
      id,
      utteranceId: id,
      sequence: index + 1,
      linkedUtteranceId: "",
      linkedQuestionId: ""
    };
  });
}

function reconciliarBloques(localUtterances = [], blockResults = []) {
  const output = [];
  let cursor = 0;
  blockResults.sort((a, b) => a.start - b.start).forEach((block) => {
    while (cursor < block.start) {
      output.push(localUtterances[cursor]);
      cursor += 1;
    }
    if (block.status === "success" && block.utterances.length) {
      block.utterances.forEach((utterance) => output.push({
        ...utterance,
        sourceSegmentIds: utterance.sourceSegmentIds?.length
          ? utterance.sourceSegmentIds
          : localUtterances.slice(block.start, block.end + 1).map((source) => source.id || source.utteranceId).filter(Boolean)
      }));
    } else {
      localUtterances.slice(block.start, block.end + 1).forEach((utterance) => output.push({
        ...utterance,
        requiresReview: true
      }));
    }
    cursor = block.end + 1;
  });
  while (cursor < localUtterances.length) {
    output.push(localUtterances[cursor]);
    cursor += 1;
  }
  return renumerarUtterances(output, "utt");
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
    const startedAt = Date.now();
    const onProgress = typeof payload.onProgress === "function" ? payload.onProgress : () => {};
    const clientRequestId = payload.clientRequestId || crearClientRequestId();
    const cacheKey = crearClaveCacheSegmentacion(payload);
    if (SEGMENTATION_CACHE.has(cacheKey)) {
      const cached = clonarResultado(SEGMENTATION_CACHE.get(cacheKey));
      onProgress({ stage: "cache_hit", clientRequestId, cacheKey });
      return {
        ...cached,
        cacheHit: true,
        clientRequestId,
        metrics: {
          ...(cached.metrics || {}),
          clientRequestId,
          cacheHit: true,
          elapsedMs: Date.now() - startedAt
        }
      };
    }
    if (PENDING_SEGMENTATION_REQUESTS.has(cacheKey)) {
      onProgress({ stage: "pending_reuse", clientRequestId, cacheKey });
      const pending = await PENDING_SEGMENTATION_REQUESTS.get(cacheKey);
      return {
        ...clonarResultado(pending),
        pendingReuse: true,
        clientRequestId,
        metrics: {
          ...(pending.metrics || {}),
          clientRequestId,
          pendingReuse: true,
          elapsedMs: Date.now() - startedAt
        }
      };
    }

    const promise = this.segmentUncached({ ...payload, clientRequestId, onProgress, cacheKey, startedAt });
    PENDING_SEGMENTATION_REQUESTS.set(cacheKey, promise);
    try {
      const result = await promise;
      if (["external", "hybrid"].includes(result.provider) && !result.metrics?.failedBlockCount) {
        SEGMENTATION_CACHE.set(cacheKey, clonarResultado(result));
      }
      return result;
    } finally {
      PENDING_SEGMENTATION_REQUESTS.delete(cacheKey);
    }
  }

  async segmentUncached(payload = {}) {
    const startedAt = payload.startedAt || Date.now();
    const onProgress = typeof payload.onProgress === "function" ? payload.onProgress : () => {};
    const clientRequestId = payload.clientRequestId || crearClientRequestId();
    onProgress({ stage: "preparing", clientRequestId });
    const local = this.local.segment(payload);

    if (!this.callable) {
      return {
        ...local,
        clientRequestId,
        provider: "rule_based",
        fallback: true,
        providerFailure: { code: "not_configured", message: "No hay callable de segmentacion configurada en frontend.", requestId: clientRequestId },
        metrics: { clientRequestId, elapsedMs: Date.now() - startedAt, blockCount: 0, externalBlockCount: 0, failedBlockCount: 0 }
      };
    }

    const blocks = seleccionarBloquesProblematicos(local.utterances, { forceExternal: payload.forceExternal });
    if (!blocks.length) {
      return {
        ...local,
        clientRequestId,
        provider: "rule_based",
        fallback: false,
        warnings: [
          ...(local.warnings || []),
          { code: "local_segmentation_sufficient", message: "No se detectaron bloques ambiguos que requieran proveedor externo." }
        ],
        metrics: { clientRequestId, elapsedMs: Date.now() - startedAt, blockCount: 0, externalBlockCount: 0, failedBlockCount: 0 }
      };
    }

    const blockResults = [];
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const blockId = `${clientRequestId}:b${index + 1}`;
      const context = contextoRango(local.utterances, block.start, block.end);
      const blockText = textoRango(local.utterances, block.start, block.end);
      onProgress({ stage: "external_block", clientRequestId, blockId, completedBlocks: index, pendingBlocks: blocks.length - index, blockCount: blocks.length });
      try {
        const response = await this.callable({
          transcript: blockText,
          transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
          clientRequestId: blockId,
          blockId,
          chunkIndex: index + 1,
          chunkCount: blocks.length,
          locale: payload.locale || "es-MX",
          requestedMode: "linguistic",
          contextBefore: context.before,
          contextAfter: context.after,
          sourceSegments: local.utterances.slice(block.start, block.end + 1).map((utterance) => ({
            id: utterance.id || utterance.utteranceId,
            text: utterance.text,
            startTime: utterance.startTime,
            endTime: utterance.endTime
          }))
        });
      const data = response?.data || response || {};
        const normalized = validarSegmentacionConversacional({
        ...data,
        provider: data.provider || "external",
        promptVersion: data.promptVersion || CONVERSATION_SEGMENTATION_PROMPT_VERSION
      });
        blockResults.push({
          ...block,
          blockId,
          status: "success",
          utterances: normalized.utterances,
          warnings: normalized.warnings || [],
          requestId: data.requestId || blockId
        });
    } catch (error) {
      if (!this.fallbackToLocal) throw error;
      const providerFailure = {
        name: error?.name || "",
        code: error?.code || error?.status || "",
        message: String(error?.message || error || "Error no especificado"),
        details: error?.details || error?.customData || null,
        stage: error?.details?.stage || "client_or_callable",
        requestId: error?.details?.requestId || blockId || clientRequestId,
        retryable: Boolean(error?.details?.retryable)
      };
        blockResults.push({
          ...block,
          blockId,
          status: "failed",
          utterances: [],
          providerFailure
        });
      }
    }

    const successCount = blockResults.filter((block) => block.status === "success").length;
    const failedCount = blockResults.length - successCount;
    const mergedUtterances = reconciliarBloques(local.utterances, blockResults);
    const finalProvider = successCount === blocks.length && blocks.length === 1 && blocks[0].start === 0 && blocks[0].end === local.utterances.length - 1
      ? "external"
      : (successCount > 0 ? "hybrid" : "rule_based");
    const warnings = [
      ...(local.warnings || []),
      ...blockResults.flatMap((block) => block.warnings || []),
      ...(failedCount ? [{ code: "partial_external_segmentation_failed", message: `No se pudo procesar ${failedCount} bloque(s) con el proveedor externo; quedaron marcados para revision.` }] : [])
    ];
    const result = validarSegmentacionConversacional({
      transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
      segmentationMode: finalProvider === "external" ? "linguistic" : (finalProvider === "hybrid" ? "hybrid" : "linguistic"),
      schemaVersion: CONVERSATION_SEGMENTATION_SCHEMA_VERSION,
      promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
      provider: finalProvider,
      utterances: mergedUtterances,
      warnings
    });
    return {
      ...result,
      clientRequestId,
      fallback: finalProvider === "rule_based",
      providerFailure: failedCount ? blockResults.find((block) => block.providerFailure)?.providerFailure || null : null,
      failedBlocks: blockResults.filter((block) => block.status === "failed").map((block) => ({ start: block.start, end: block.end, blockId: block.blockId })),
      metrics: {
        clientRequestId,
        elapsedMs: Date.now() - startedAt,
        blockCount: blocks.length,
        externalBlockCount: successCount,
        failedBlockCount: failedCount,
        localTurnCount: local.utterances.length,
        finalTurnCount: result.utterances.length,
        transcriptCharacters: texto(payload.text || payload.correctedTranscript || payload.confirmedTranscript).length,
        estimatedInputTokens: Math.ceil(texto(payload.text || payload.correctedTranscript || payload.confirmedTranscript).length / 4)
      }
    };
  }
}

export function createConversationSegmentationProvider(options = {}) {
  if (options.provider === "external") return new ExternalConversationSegmentationProvider(options.external || {});
  return new RuleBasedConversationSegmentationProvider();
}
