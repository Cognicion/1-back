import { segmentarConversacionClinica } from "./clinicalPipeline.js";

export const CONVERSATION_SEGMENTATION_SCHEMA_VERSION = "conversation_segmentation_v1";
export const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v2_2026-07-18";
export const CONVERSATION_SEGMENTATION_CLIENT_VERSION = "conversation_segmentation_client_blocks_v2_2026-07-19";

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

export function crearClaveBloqueSegmentacion({
  sourceTranscriptHash = "",
  blockContentHash = "",
  contextHash = "",
  promptVersion = CONVERSATION_SEGMENTATION_PROMPT_VERSION,
  model = "external_callable",
  segmenterVersion = CONVERSATION_SEGMENTATION_CLIENT_VERSION
} = {}) {
  return [
    "block",
    segmenterVersion,
    promptVersion,
    model || "external_callable",
    sourceTranscriptHash || "sin-transcript",
    blockContentHash || "sin-block",
    contextHash || "sin-context"
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

function describirBloque({ localUtterances = [], block = {}, index = 0, totalBlocks = 0, sourceTranscriptHash = "", model = "external_callable" } = {}) {
  const context = contextoRango(localUtterances, block.start, block.end);
  const blockText = textoRango(localUtterances, block.start, block.end);
  const blockContentHash = hashTextoEstable(blockText);
  const contextHash = hashTextoEstable(`${context.before}\n---\n${context.after}`);
  const blockKey = crearClaveBloqueSegmentacion({
    sourceTranscriptHash,
    blockContentHash,
    contextHash,
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    model,
    segmenterVersion: CONVERSATION_SEGMENTATION_CLIENT_VERSION
  });
  return {
    ...block,
    blockIndex: index,
    blockNumber: index + 1,
    totalBlocks,
    blockId: `block-${index + 1}`,
    blockKey,
    sourceTranscriptHash,
    blockContentHash,
    contextHash,
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    model,
    segmenterVersion: CONVERSATION_SEGMENTATION_CLIENT_VERSION,
    context,
    blockText,
    sourceSegmentIds: localUtterances.slice(block.start, block.end + 1).map((utterance) => utterance.id || utterance.utteranceId).filter(Boolean)
  };
}

function cacheBloqueValido(block = {}, cached = null) {
  if (!cached || cached.status !== "completed" || !Array.isArray(cached.utterances) || !cached.utterances.length) return false;
  return cached.blockKey === block.blockKey
    && cached.sourceTranscriptHash === block.sourceTranscriptHash
    && cached.blockContentHash === block.blockContentHash
    && cached.contextHash === block.contextHash
    && cached.promptVersion === block.promptVersion
    && cached.model === block.model
    && cached.segmenterVersion === block.segmenterVersion;
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

    const rawBlocks = seleccionarBloquesProblematicos(local.utterances, { forceExternal: payload.forceExternal });
    if (!rawBlocks.length) {
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

    const model = payload.model || "external_callable";
    const sourceTranscriptHash = payload.sourceTranscriptHash || hashTextoEstable(texto(payload.text || payload.correctedTranscript || payload.confirmedTranscript));
    const blocks = rawBlocks.map((block, index) => describirBloque({
      localUtterances: local.utterances,
      block,
      index,
      totalBlocks: rawBlocks.length,
      sourceTranscriptHash,
      model
    }));
    const cachedByKey = new Map((payload.cachedBlocks || payload.cachedBlockManifest?.blocks || [])
      .filter(Boolean)
      .map((block) => [block.blockKey, block]));
    const onlyBlockKeys = new Set(Array.isArray(payload.onlyBlockKeys) ? payload.onlyBlockKeys.filter(Boolean) : []);
    const blockResults = new Array(blocks.length);
    const saveBlock = typeof payload.onBlockSettled === "function" ? payload.onBlockSettled : async () => {};
    let successfulCount = 0;
    let settledCount = 0;
    let providerCount = 0;
    let cachedCount = 0;
    let failedCountRunning = 0;
    const emitProgress = (stage = "external_block", extra = {}) => {
      onProgress({
        stage,
        clientRequestId,
        blockCount: blocks.length,
        completedBlocks: successfulCount,
        processedBlocks: settledCount,
        pendingBlocks: Math.max(0, blocks.length - successfulCount - failedCountRunning),
        cachedBlockCount: cachedCount,
        providerBlockCount: providerCount,
        failedBlockCount: failedCountRunning,
        blockManifest: blocks.map((block, index) => {
          const result = blockResults[index];
          return result ? {
            blockIndex: index,
            blockNumber: block.blockNumber,
            start: block.start,
            end: block.end,
            blockKey: block.blockKey,
            status: result.status,
            durationMs: result.durationMs || 0,
            source: result.source || "",
            requestId: result.requestId || ""
          } : {
            blockIndex: index,
            blockNumber: block.blockNumber,
            start: block.start,
            end: block.end,
            blockKey: block.blockKey,
            status: "pending",
            source: ""
          };
        }),
        ...extra
      });
    };

    emitProgress("block_manifest_ready", { recoveredBlocks: 0 });
    for (let index = 0; index < blocks.length; index += 1) {
      const cached = cachedByKey.get(blocks[index].blockKey);
      if (!cacheBloqueValido(blocks[index], cached)) continue;
      cachedCount += 1;
      successfulCount += 1;
      settledCount += 1;
      blockResults[index] = {
        ...blocks[index],
        ...cached,
        status: "success",
        source: "cache",
        utterances: cached.utterances || [],
        warnings: cached.warnings || [],
        requestId: cached.requestId || `${clientRequestId}:cache:b${index + 1}`,
        durationMs: cached.durationMs || 0
      };
      emitProgress("block_cache_hit", { blockId: blocks[index].blockId });
    }

    const processOne = async (index) => {
      const block = blocks[index];
      if (blockResults[index]) return;
      if (onlyBlockKeys.size && !onlyBlockKeys.has(block.blockKey)) {
        blockResults[index] = { ...block, status: "pending", source: "basic", utterances: [] };
        return;
      }
      if (payload.abortSignal?.aborted) {
        const cancelled = { ...block, status: "cancelled", source: "basic", utterances: [], providerFailure: { code: "cancelled", requestId: clientRequestId, retryable: true } };
        blockResults[index] = cancelled;
        settledCount += 1;
        await saveBlock(cancelled);
        return;
      }
      const requestBlockId = `${clientRequestId}:b${index + 1}`;
      emitProgress("external_block", { blockId: requestBlockId });
      const blockStarted = Date.now();
      try {
        const response = await this.callable({
          transcript: block.blockText,
          transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
          clientRequestId: requestBlockId,
          blockId: requestBlockId,
          blockKey: block.blockKey,
          chunkIndex: index + 1,
          chunkCount: blocks.length,
          locale: payload.locale || "es-MX",
          requestedMode: "linguistic",
          contextBefore: block.context.before,
          contextAfter: block.context.after,
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
        providerCount += 1;
        successfulCount += 1;
        settledCount += 1;
        const completed = {
          ...block,
          blockId: requestBlockId,
          status: "success",
          source: "provider",
          utterances: normalized.utterances,
          warnings: normalized.warnings || [],
          requestId: data.requestId || requestBlockId,
          durationMs: Date.now() - blockStarted,
          completedAt: new Date().toISOString()
        };
        blockResults[index] = completed;
        await saveBlock({
          ...completed,
          status: "completed"
        });
        emitProgress("block_completed", { blockId: requestBlockId });
    } catch (error) {
      if (!this.fallbackToLocal) throw error;
      const providerFailure = {
        name: error?.name || "",
        code: error?.code || error?.status || "",
        message: String(error?.message || error || "Error no especificado"),
        details: error?.details || error?.customData || null,
        stage: error?.details?.stage || "client_or_callable",
        requestId: error?.details?.requestId || requestBlockId || clientRequestId,
        retryable: Boolean(error?.details?.retryable)
      };
        failedCountRunning += 1;
        settledCount += 1;
        const failed = {
          ...block,
          blockId: requestBlockId,
          status: "failed",
          source: "basic",
          utterances: [],
          providerFailure,
          durationMs: Date.now() - blockStarted,
          failedAt: new Date().toISOString()
        };
        blockResults[index] = failed;
        await saveBlock(failed);
        emitProgress("block_failed", { blockId: requestBlockId });
      }
    };

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(2, blocks.length) }, async () => {
      while (nextIndex < blocks.length) {
        const index = nextIndex;
        nextIndex += 1;
        await processOne(index);
        if (payload.abortSignal?.aborted) break;
      }
    });
    await Promise.all(workers);

    const normalizedBlockResults = blocks.map((block, index) => blockResults[index] || { ...block, status: "pending", source: "basic", utterances: [] });
    const successCount = normalizedBlockResults.filter((block) => block.status === "success" || block.status === "completed").length;
    const failedCount = normalizedBlockResults.filter((block) => !["success", "completed"].includes(block.status)).length;
    const mergedUtterances = reconciliarBloques(local.utterances, normalizedBlockResults.map((block) => ({
      ...block,
      status: ["success", "completed"].includes(block.status) ? "success" : "failed"
    })));
    const finalProvider = successCount === blocks.length && blocks.length === 1 && blocks[0].start === 0 && blocks[0].end === local.utterances.length - 1
      ? "external"
      : (successCount > 0 ? "hybrid" : "rule_based");
    const warnings = [
      ...(local.warnings || []),
      ...normalizedBlockResults.flatMap((block) => block.warnings || []),
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
      providerFailure: failedCount ? normalizedBlockResults.find((block) => block.providerFailure)?.providerFailure || null : null,
      failedBlocks: normalizedBlockResults.filter((block) => !["success", "completed"].includes(block.status)).map((block) => ({ start: block.start, end: block.end, blockId: block.blockId, blockKey: block.blockKey })),
      blockManifest: {
        sourceTranscriptHash,
        promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
        model,
        segmenterVersion: CONVERSATION_SEGMENTATION_CLIENT_VERSION,
        totalBlocks: blocks.length,
        blocks: normalizedBlockResults.map((block, index) => ({
          blockIndex: index,
          blockNumber: index + 1,
          start: block.start,
          end: block.end,
          blockKey: block.blockKey,
          sourceTranscriptHash: block.sourceTranscriptHash,
          blockContentHash: block.blockContentHash,
          contextHash: block.contextHash,
          promptVersion: block.promptVersion,
          model: block.model,
          segmenterVersion: block.segmenterVersion,
          status: ["success", "completed"].includes(block.status) ? "completed" : block.status,
          source: block.source || "basic",
          durationMs: block.durationMs || 0,
          requestId: block.requestId || "",
          utterances: block.utterances || [],
          warnings: block.warnings || [],
          providerFailure: block.providerFailure || null
        }))
      },
      metrics: {
        clientRequestId,
        elapsedMs: Date.now() - startedAt,
        blockCount: blocks.length,
        externalBlockCount: successCount,
        cachedBlockCount: cachedCount,
        providerBlockCount: providerCount,
        failedBlockCount: failedCount,
        basicFallbackBlockCount: failedCount,
        totalBlockCount: blocks.length,
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
