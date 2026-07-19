import { segmentarConversacionClinica } from "./clinicalPipeline.js";

export const CONVERSATION_SEGMENTATION_SCHEMA_VERSION = "conversation_segmentation_v1";
export const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v2_2026-07-18";
export const CONVERSATION_SEGMENTATION_CLIENT_VERSION = "conversation_segmentation_client_blocks_v2_2026-07-19";

const SEGMENTATION_CACHE = new Map();
const PENDING_SEGMENTATION_REQUESTS = new Map();
const MAX_BLOCK_CHARS = 1800;
const MAX_BLOCK_UTTERANCES = 14;
const BLOCK_CONTEXT_CHARS = 420;
const MAX_CHILD_BLOCK_CHARS = 900;
const MAX_CHILD_BLOCK_UTTERANCES = 5;
const MAX_BLOCK_ATTEMPTS = 2;
const MAX_CHILD_ATTEMPTS = 2;
const MAX_SPLIT_LEVEL = 2;

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
  segmenterVersion = CONVERSATION_SEGMENTATION_CLIENT_VERSION,
  parentBlockContentHash = "",
  childContentHash = "",
  childContextHash = "",
  splitLevel = 0
} = {}) {
  const parts = [
    "block",
    segmenterVersion,
    promptVersion,
    model || "external_callable",
    sourceTranscriptHash || "sin-transcript",
    blockContentHash || "sin-block",
    contextHash || "sin-context"
  ];
  if (Number(splitLevel || 0) > 0) {
    parts.push(
      `split-${Number(splitLevel || 0)}`,
      parentBlockContentHash || "sin-parent",
      childContentHash || "sin-child",
      childContextHash || "sin-child-context"
    );
  }
  return parts.join(":");
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
  const splitLevel = Number(block.splitLevel || 0);
  const parentBlockContentHash = block.parentBlockContentHash || "";
  const childContentHash = splitLevel > 0 ? blockContentHash : "";
  const childContextHash = splitLevel > 0 ? contextHash : "";
  const blockKey = crearClaveBloqueSegmentacion({
    sourceTranscriptHash,
    blockContentHash,
    contextHash,
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    model,
    segmenterVersion: CONVERSATION_SEGMENTATION_CLIENT_VERSION,
    parentBlockContentHash,
    childContentHash,
    childContextHash,
    splitLevel
  });
  return {
    ...block,
    blockIndex: index,
    blockNumber: index + 1,
    totalBlocks,
    blockId: block.blockId || (splitLevel > 0 ? `block-${index + 1}${String.fromCharCode(65 + Number(block.childIndex || 0))}` : `block-${index + 1}`),
    blockKey,
    sourceTranscriptHash,
    blockContentHash,
    contextHash,
    splitLevel,
    parentBlockId: block.parentBlockId || "",
    parentBlockKey: block.parentBlockKey || "",
    parentBlockIndex: Number.isFinite(Number(block.parentBlockIndex)) ? Number(block.parentBlockIndex) : null,
    parentBlockContentHash,
    childContentHash,
    childContextHash,
    childIndex: Number.isFinite(Number(block.childIndex)) ? Number(block.childIndex) : null,
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    model,
    segmenterVersion: CONVERSATION_SEGMENTATION_CLIENT_VERSION,
    context,
    blockText,
    sourceSegmentIds: localUtterances.slice(block.start, block.end + 1).map((utterance) => utterance.id || utterance.utteranceId).filter(Boolean)
  };
}

function bloqueRequiereSplit(cached = {}) {
  return cached?.status === "requires_split"
    || (cached?.status === "failed" && Number(cached.consecutiveTimeouts || 0) >= 2)
    || (cached?.providerFailure?.code === "functions/deadline-exceeded" && Number(cached.attemptCount || 0) >= MAX_BLOCK_ATTEMPTS);
}

function codigoTimeout(error = {}) {
  const code = String(error?.code || error?.status || error?.providerFailure?.code || "");
  return code.includes("deadline") || code.includes("timeout");
}

function siguienteLimiteSeguro(localUtterances = [], start = 0, parentEnd = 0) {
  let end = start;
  let chars = 0;
  while (end <= parentEnd) {
    const current = localUtterances[end] || {};
    const next = localUtterances[end + 1] || null;
    chars += texto(current.text).length + 1;
    const count = end - start + 1;
    const shouldKeepPair = current.speechAct === "question"
      && next
      && end < parentEnd
      && ["answer", "correction"].includes(next.speechAct);
    const shouldKeepCorrection = next
      && end < parentEnd
      && next.speechAct === "correction";
    if (!shouldKeepPair && !shouldKeepCorrection && count >= 2 && (chars >= MAX_CHILD_BLOCK_CHARS || count >= MAX_CHILD_BLOCK_UTTERANCES)) break;
    end += 1;
  }
  return Math.max(start, Math.min(parentEnd, end));
}

function subdividirBloqueSeguro(parent = {}, localUtterances = []) {
  const splitLevel = Number(parent.splitLevel || 0) + 1;
  if (splitLevel > MAX_SPLIT_LEVEL || parent.start >= parent.end) return [];
  const children = [];
  let start = parent.start;
  while (start <= parent.end) {
    const end = siguienteLimiteSeguro(localUtterances, start, parent.end);
    children.push({
      start,
      end,
      reason: "adaptive_split",
      splitLevel,
      parentBlockId: parent.blockId,
      parentBlockKey: parent.blockKey,
      parentBlockIndex: parent.blockIndex,
      parentBlockContentHash: parent.blockContentHash,
      childIndex: children.length,
      blockId: `${parent.blockId}${String.fromCharCode(65 + children.length)}`
    });
    start = end + 1;
  }
  if (children.length < 2 && parent.end > parent.start) {
    const middle = Math.max(parent.start, Math.floor((parent.start + parent.end) / 2));
    return [
      { ...children[0], start: parent.start, end: middle, childIndex: 0, blockId: `${parent.blockId}A` },
      { ...children[0], start: middle + 1, end: parent.end, childIndex: 1, blockId: `${parent.blockId}B` }
    ];
  }
  return children;
}

function cacheBloqueValido(block = {}, cached = null) {
  if (!cached || !["completed", "completed_from_children"].includes(cached.status) || !Array.isArray(cached.utterances) || !cached.utterances.length) return false;
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
    const cachedParentsByIndex = new Map((payload.cachedBlocks || payload.cachedBlockManifest?.blocks || [])
      .filter((block) => block && !block.parentBlockId && !block.parentBlockKey && Number.isFinite(Number(block.blockIndex)))
      .map((block) => [Number(block.blockIndex), block]));
    const obtenerCacheBloque = (block, index) => {
      const direct = cachedByKey.get(block.blockKey);
      if (cacheBloqueValido(block, direct)) return direct;
      const byIndex = cachedParentsByIndex.get(Number(index));
      if (cacheBloqueValido(block, byIndex)) return byIndex;
      return direct || byIndex || null;
    };
    const onlyBlockKeys = new Set(Array.isArray(payload.onlyBlockKeys) ? payload.onlyBlockKeys.filter(Boolean) : []);
    const blockResults = new Array(blocks.length);
    const childResultsByParent = new Map();
    const splitChildrenByParent = new Map();
    const splitLeafBlocksByParent = new Map();
    const saveBlock = typeof payload.onBlockSettled === "function" ? payload.onBlockSettled : async () => {};
    let successfulCount = 0;
    let settledCount = 0;
    let providerCount = 0;
    let cachedCount = 0;
    let failedCountRunning = 0;
    const manifestBlocks = () => {
      const rows = [];
      blocks.forEach((block, index) => {
        const result = blockResults[index];
        rows.push(result ? {
          blockIndex: index,
          blockNumber: block.blockNumber,
          start: block.start,
          end: block.end,
          blockKey: block.blockKey,
          blockId: block.blockId || "",
          sourceTranscriptHash: block.sourceTranscriptHash,
          blockContentHash: block.blockContentHash,
          contextHash: block.contextHash,
          promptVersion: block.promptVersion,
          model: block.model,
          segmenterVersion: block.segmenterVersion,
          parentBlockContentHash: block.parentBlockContentHash || "",
          childContentHash: block.childContentHash || "",
          childContextHash: block.childContextHash || "",
          status: result.status,
          durationMs: result.durationMs || 0,
          source: result.source || "",
          requestId: result.requestId || "",
          attemptCount: result.attemptCount || 0,
          consecutiveTimeouts: result.consecutiveTimeouts || 0,
          lastErrorCode: result.lastErrorCode || result.providerFailure?.code || "",
          lastDurationMs: result.lastDurationMs || result.durationMs || 0,
          splitLevel: result.splitLevel || 0,
          childBlockIds: result.childBlockIds || []
        } : {
          blockIndex: index,
          blockNumber: block.blockNumber,
          start: block.start,
          end: block.end,
          blockKey: block.blockKey,
          blockId: block.blockId || "",
          sourceTranscriptHash: block.sourceTranscriptHash,
          blockContentHash: block.blockContentHash,
          contextHash: block.contextHash,
          promptVersion: block.promptVersion,
          model: block.model,
          segmenterVersion: block.segmenterVersion,
          parentBlockContentHash: block.parentBlockContentHash || "",
          childContentHash: block.childContentHash || "",
          childContextHash: block.childContextHash || "",
          status: "pending",
          source: "",
          attemptCount: obtenerCacheBloque(block, index)?.attemptCount || 0,
          consecutiveTimeouts: obtenerCacheBloque(block, index)?.consecutiveTimeouts || 0,
          splitLevel: block.splitLevel || 0
        });
        (splitChildrenByParent.get(index) || []).forEach((child) => {
          const childResult = childResultsByParent.get(index)?.get(child.blockKey);
          rows.push(childResult ? {
            ...child,
            ...childResult,
            status: childResult.status,
            sourceTranscriptHash: child.sourceTranscriptHash,
            blockContentHash: child.blockContentHash,
            contextHash: child.contextHash,
            promptVersion: child.promptVersion,
            model: child.model,
            segmenterVersion: child.segmenterVersion,
            parentBlockContentHash: child.parentBlockContentHash || "",
            childContentHash: child.childContentHash || "",
            childContextHash: child.childContextHash || "",
            source: childResult.source || "",
            durationMs: childResult.durationMs || 0,
            requestId: childResult.requestId || "",
            parentBlockId: block.blockId,
            parentBlockKey: block.blockKey,
            splitLevel: child.splitLevel || 1
          } : {
            ...child,
            status: "pending",
            source: "",
            parentBlockId: block.blockId,
            parentBlockKey: block.blockKey,
            splitLevel: child.splitLevel || 1
          });
        });
      });
      return rows;
    };
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
        blockManifest: manifestBlocks(),
        ...extra
      });
    };

    emitProgress("block_manifest_ready", { recoveredBlocks: 0 });
    for (let index = 0; index < blocks.length; index += 1) {
      const cached = obtenerCacheBloque(blocks[index], index);
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

    const processingUnits = [];
    const prepararSplit = (parent, parentIndex) => {
      const childRanges = subdividirBloqueSeguro(parent, local.utterances);
      const children = childRanges.map((childRange) => describirBloque({
        localUtterances: local.utterances,
        block: childRange,
        index: parentIndex,
        totalBlocks: blocks.length,
        sourceTranscriptHash,
        model
      }));
      const rows = [];
      const leaves = [];
      children.forEach((child) => {
        rows.push(child);
        const cachedChild = cachedByKey.get(child.blockKey);
        if (bloqueRequiereSplit(cachedChild) && Number(child.splitLevel || 0) < MAX_SPLIT_LEVEL) {
          const grandchildren = subdividirBloqueSeguro(child, local.utterances).map((grandchildRange) => describirBloque({
            localUtterances: local.utterances,
            block: grandchildRange,
            index: parentIndex,
            totalBlocks: blocks.length,
            sourceTranscriptHash,
            model
          }));
          rows.push(...grandchildren);
          leaves.push(...grandchildren);
        } else {
          leaves.push(child);
        }
      });
      splitChildrenByParent.set(parentIndex, rows);
      splitLeafBlocksByParent.set(parentIndex, leaves);
      childResultsByParent.set(parentIndex, new Map());
      blockResults[parentIndex] = {
        ...parent,
        status: "requires_split",
        source: "basic",
        utterances: [],
        attemptCount: obtenerCacheBloque(parent, parentIndex)?.attemptCount || MAX_BLOCK_ATTEMPTS,
        consecutiveTimeouts: obtenerCacheBloque(parent, parentIndex)?.consecutiveTimeouts || MAX_BLOCK_ATTEMPTS,
        splitLevel: parent.splitLevel || 0,
        childBlockIds: children.map((child) => child.blockId),
        providerFailure: obtenerCacheBloque(parent, parentIndex)?.providerFailure || null
      };
      leaves.forEach((child) => {
        const cachedChild = cachedByKey.get(child.blockKey);
        if (cacheBloqueValido(child, cachedChild)) {
          cachedCount += 1;
          const childCompleted = {
            ...child,
            ...cachedChild,
            status: "success",
            source: "cache",
            utterances: cachedChild.utterances || [],
            warnings: cachedChild.warnings || [],
            requestId: cachedChild.requestId || `${clientRequestId}:cache:${child.blockId}`,
            durationMs: cachedChild.durationMs || 0
          };
          childResultsByParent.get(parentIndex).set(child.blockKey, childCompleted);
        } else {
          processingUnits.push({ parentIndex, block: child, isChild: true });
        }
      });
    };

    blocks.forEach((block, index) => {
      if (blockResults[index]?.status === "success") return;
      const cached = obtenerCacheBloque(block, index);
      if (bloqueRequiereSplit(cached)) {
        prepararSplit(block, index);
        return;
      }
      processingUnits.push({ parentIndex: index, block, isChild: false });
    });

    const finalizarPadreDesdeHijos = async (parentIndex) => {
      const children = splitLeafBlocksByParent.get(parentIndex) || splitChildrenByParent.get(parentIndex) || [];
      if (!children.length) return false;
      const results = childResultsByParent.get(parentIndex) || new Map();
      const childResults = children.map((child) => results.get(child.blockKey)).filter(Boolean);
      if (childResults.length !== children.length) return false;
      if (!childResults.every((child) => ["success", "completed"].includes(child.status))) return false;
      const parent = blocks[parentIndex];
      const completed = {
        ...parent,
        status: "success",
        source: childResults.some((child) => child.source === "provider") ? "provider" : "cache",
        utterances: childResults.flatMap((child) => child.utterances || []),
        warnings: childResults.flatMap((child) => child.warnings || []),
        durationMs: childResults.reduce((sum, child) => sum + Number(child.durationMs || 0), 0),
        completedAt: new Date().toISOString(),
        completedFromChildren: true,
        childBlockIds: children.map((child) => child.blockId),
        splitLevel: Math.max(...children.map((child) => Number(child.splitLevel || 1)))
      };
      blockResults[parentIndex] = completed;
      successfulCount += 1;
      await saveBlock({
        ...completed,
        status: "completed_from_children"
      });
      emitProgress("block_completed_from_children", { blockId: parent.blockId });
      return true;
    };

    await Promise.all(blocks.map((_block, index) => finalizarPadreDesdeHijos(index)));

    const processOne = async (unit) => {
      const { parentIndex, block, isChild } = unit;
      if (!isChild && blockResults[parentIndex]?.status === "success") return;
      const allowedByFilter = !onlyBlockKeys.size
        || onlyBlockKeys.has(block.blockKey)
        || (isChild && onlyBlockKeys.has(block.parentBlockKey));
      if (!allowedByFilter) {
        if (!isChild && !blockResults[parentIndex]) blockResults[parentIndex] = { ...block, status: "pending", source: "basic", utterances: [] };
        return;
      }
      const cachedPreviousForUnit = cachedByKey.get(block.blockKey) || {};
      if (isChild && Number(cachedPreviousForUnit.attemptCount || 0) >= MAX_CHILD_ATTEMPTS && Number(block.splitLevel || 0) >= MAX_SPLIT_LEVEL) {
        const exhausted = {
          ...block,
          status: "failed",
          source: "basic",
          utterances: [],
          attemptCount: Number(cachedPreviousForUnit.attemptCount || 0),
          consecutiveTimeouts: Number(cachedPreviousForUnit.consecutiveTimeouts || 0),
          lastErrorCode: cachedPreviousForUnit.lastErrorCode || cachedPreviousForUnit.providerFailure?.code || "max_attempts_reached",
          providerFailure: {
            code: cachedPreviousForUnit.lastErrorCode || cachedPreviousForUnit.providerFailure?.code || "max_attempts_reached",
            stage: "adaptive_split",
            retryable: false
          },
          requiresReview: true
        };
        childResultsByParent.get(parentIndex)?.set(block.blockKey, exhausted);
        failedCountRunning += 1;
        settledCount += 1;
        await saveBlock(exhausted);
        emitProgress("block_failed_max_attempts", { blockId: block.blockId });
        return;
      }
      if (payload.abortSignal?.aborted) {
        const cancelled = { ...block, status: "cancelled", source: "basic", utterances: [], providerFailure: { code: "cancelled", requestId: clientRequestId, retryable: true } };
        if (isChild) childResultsByParent.get(parentIndex)?.set(block.blockKey, cancelled);
        else blockResults[parentIndex] = cancelled;
        settledCount += 1;
        await saveBlock(cancelled);
        return;
      }
      const requestBlockId = isChild
        ? `${clientRequestId}:b${parentIndex + 1}${String.fromCharCode(65 + Number(block.childIndex || 0))}`
        : `${clientRequestId}:b${parentIndex + 1}`;
      emitProgress("external_block", { blockId: requestBlockId });
      const blockStarted = Date.now();
      try {
        const response = await this.callable({
          transcript: block.blockText,
          transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
          clientRequestId: requestBlockId,
          blockId: requestBlockId,
          blockKey: block.blockKey,
          chunkIndex: parentIndex + 1,
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
        if (isChild) {
          childResultsByParent.get(parentIndex)?.set(block.blockKey, completed);
        } else {
          successfulCount += 1;
          blockResults[parentIndex] = completed;
        }
        await saveBlock({
          ...completed,
          status: "completed"
        });
        if (isChild) await finalizarPadreDesdeHijos(parentIndex);
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
        const cachedPrevious = cachedByKey.get(block.blockKey) || {};
        const attemptCount = Number(cachedPrevious.attemptCount || 0) + 1;
        const consecutiveTimeouts = codigoTimeout(error)
          ? Number(cachedPrevious.consecutiveTimeouts || 0) + 1
          : 0;
        const shouldSplit = !isChild && consecutiveTimeouts >= MAX_BLOCK_ATTEMPTS && Number(block.splitLevel || 0) < MAX_SPLIT_LEVEL;
        const childRanges = shouldSplit ? subdividirBloqueSeguro(block, local.utterances) : [];
        if (shouldSplit && childRanges.length) {
          const children = childRanges.map((childRange) => describirBloque({
            localUtterances: local.utterances,
            block: childRange,
            index: parentIndex,
            totalBlocks: blocks.length,
            sourceTranscriptHash,
            model
          }));
          splitChildrenByParent.set(parentIndex, children);
          splitLeafBlocksByParent.set(parentIndex, children);
          if (!childResultsByParent.has(parentIndex)) childResultsByParent.set(parentIndex, new Map());
        }
        const failed = {
          ...block,
          blockId: requestBlockId,
          status: shouldSplit && childRanges.length ? "requires_split" : "failed",
          source: "basic",
          utterances: [],
          providerFailure,
          attemptCount,
          consecutiveTimeouts,
          lastErrorCode: providerFailure.code,
          lastDurationMs: Date.now() - blockStarted,
          splitLevel: block.splitLevel || 0,
          parentBlockId: block.parentBlockId || "",
          childBlockIds: (splitChildrenByParent.get(parentIndex) || []).map((child) => child.blockId),
          durationMs: Date.now() - blockStarted,
          failedAt: new Date().toISOString()
        };
        if (isChild) childResultsByParent.get(parentIndex)?.set(block.blockKey, failed);
        else blockResults[parentIndex] = failed;
        await saveBlock(failed);
        emitProgress("block_failed", { blockId: requestBlockId });
      }
    };

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(2, Math.max(1, processingUnits.length)) }, async () => {
      while (nextIndex < processingUnits.length) {
        const unit = processingUnits[nextIndex];
        nextIndex += 1;
        await processOne(unit);
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
    const finalProvider = failedCount > 0 && successCount > 0
      ? "hybrid_review_required"
      : (successCount === blocks.length && blocks.length === 1 && blocks[0].start === 0 && blocks[0].end === local.utterances.length - 1
      ? "external"
      : (successCount > 0 ? "hybrid" : "rule_based"));
    const finalManifestRows = manifestBlocks();
    const warnings = [
      ...(local.warnings || []),
      ...normalizedBlockResults.flatMap((block) => block.warnings || []),
      ...(failedCount ? [{ code: "partial_external_segmentation_failed", message: `No se pudo procesar ${failedCount} bloque(s) con el proveedor externo; quedaron marcados para revision.` }] : [])
    ];
    const result = validarSegmentacionConversacional({
      transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
      segmentationMode: finalProvider === "external" ? "linguistic" : (finalProvider.startsWith("hybrid") ? "hybrid" : "linguistic"),
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
        blocks: finalManifestRows.map((block, index) => ({
          blockIndex: Number.isFinite(Number(block.blockIndex)) ? Number(block.blockIndex) : index,
          blockNumber: block.blockNumber || index + 1,
          start: block.start,
          end: block.end,
          blockKey: block.blockKey,
          blockId: block.blockId || "",
          parentBlockId: block.parentBlockId || "",
          parentBlockKey: block.parentBlockKey || "",
          parentBlockIndex: Number.isFinite(Number(block.parentBlockIndex)) ? Number(block.parentBlockIndex) : null,
          sourceTranscriptHash: block.sourceTranscriptHash,
          blockContentHash: block.blockContentHash,
          contextHash: block.contextHash,
          parentBlockContentHash: block.parentBlockContentHash || "",
          childContentHash: block.childContentHash || "",
          childContextHash: block.childContextHash || "",
          promptVersion: block.promptVersion,
          model: block.model,
          segmenterVersion: block.segmenterVersion,
          status: block.completedFromChildren ? "completed_from_children" : (["success", "completed"].includes(block.status) ? "completed" : block.status),
          source: block.source || "basic",
          durationMs: block.durationMs || 0,
          requestId: block.requestId || "",
          attemptCount: block.attemptCount || 0,
          consecutiveTimeouts: block.consecutiveTimeouts || 0,
          lastErrorCode: block.lastErrorCode || block.providerFailure?.code || "",
          lastDurationMs: block.lastDurationMs || block.durationMs || 0,
          splitLevel: block.splitLevel || 0,
          childBlockIds: block.childBlockIds || [],
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
