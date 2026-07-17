import { normalizarComparacion, normalizarTextoClinicoConservador } from "./clinicalTextNormalizer.js";

function crearIdSegmento({ sessionId, streamId = "stream-0", resultIndex, isFinal = false }) {
  return [sessionId || "sesion", streamId, resultIndex ? Date.now(), isFinal ? "final" : "provisional"].join("-");
}

function unirTexto(base = "", fragmento = "") {
  const textoBase = String(base || "").trimEnd();
  const parte = String(fragmento || "").trim();
  if (!parte) return textoBase;
  if (!textoBase) return parte;
  return `${textoBase} ${parte}`.replace(/\s+/g, " ").trim();
}

function contieneFragmento(textoCompleto = "", fragmento = "") {
  const base = normalizarComparacion(textoCompleto);
  const parte = normalizarComparacion(fragmento);
  if (!parte) return true;
  return base === parte || base.endsWith(` ${parte}`) || base.includes(` ${parte} `);
}

function ordenarPorReconocimiento(a, b) {
  if (a.streamSequence !== b.streamSequence) return a.streamSequence - b.streamSequence;
  return a.resultIndex - b.resultIndex;
}

export class TranscriptAssembler {
  constructor({ sessionId, patientId = "", userId = "", encounterId = "" } = {}) {
    this.sessionId = sessionId || globalThis.crypto?.randomUUID?.() || `dictado-${Date.now()}`;
    this.patientId = patientId;
    this.userId = userId;
    this.encounterId = encounterId;
    this.confirmedSegments = [];
    this.pendingSegments = [];
    this.interimResults = new Map();
    this.manualEdits = [];
    this.segments = new Map();
    this.manualText = "";
    this.manualRevision = 0;
    this.createdAt = new Date().toISOString();
  }

  setContext({ sessionId, patientId, userId, encounterId } = {}) {
    if (sessionId) this.sessionId = sessionId;
    if (patientId !== undefined) this.patientId = patientId;
    if (userId !== undefined) this.userId = userId;
    if (encounterId !== undefined) this.encounterId = encounterId;
  }

  setManualText(texto = "", { recordEdit = true } = {}) {
    const siguiente = String(texto || "");
    if (recordEdit && siguiente !== this.manualText) {
      this.manualEdits.push({ revision: this.manualRevision + 1, text: siguiente, at: new Date().toISOString() });
      this.manualEdits = this.manualEdits.slice(-50);
    }
    this.manualText = siguiente;
    this.manualRevision += 1;
  }

  getText() { return this.manualText; }

  getPendingText({ onlyNotIncluded = false } = {}) {
    return this.pendingSegments.slice().sort(ordenarPorReconocimiento)
      .filter((item) => !onlyNotIncluded || !item.includedInText)
      .map((item) => item.normalizedText).join(" ").trim();
  }

  getProvisional() {
    return Array.from(this.interimResults.values()).sort(ordenarPorReconocimiento).map((item) => item.normalizedText).join(" ").trim();
  }

  getReviewText() {
    return unirTexto(this.manualText, this.getPendingText({ onlyNotIncluded: true }));
  }

  stats() {
    const confianzas = this.confirmedSegments.map((s) => Number(s.confidence)).filter((v) => Number.isFinite(v) && v > 0);
    return {
      sessionId: this.sessionId,
      processed: this.confirmedSegments.length,
      finalSegments: this.confirmedSegments.length,
      pending: this.pendingSegments.length,
      provisional: this.interimResults.size,
      failed: Array.from(this.segments.values()).filter((s) => s.status === "failed").length,
      total: this.confirmedSegments.length + this.pendingSegments.length + this.interimResults.size,
      manualRevision: this.manualRevision,
      averageConfidence: confianzas.length ? confianzas.reduce((sum, value) => sum + value, 0) / confianzas.length : null
    };
  }

  toJSON() {
    return {
      sessionId: this.sessionId, patientId: this.patientId, userId: this.userId, encounterId: this.encounterId,
      text: this.manualText, pendingText: this.getPendingText(), provisional: this.getProvisional(),
      confirmedSegments: this.confirmedSegments, pendingSegments: this.pendingSegments,
      interimResults: Array.from(this.interimResults.entries()), manualEdits: this.manualEdits,
      manualRevision: this.manualRevision, createdAt: this.createdAt, updatedAt: new Date().toISOString(),
      segments: Array.from(this.segments.values())
    };
  }

  restore(snapshot = {}) {
    this.sessionId = snapshot.sessionId || this.sessionId;
    this.patientId = snapshot.patientId || this.patientId;
    this.userId = snapshot.userId || this.userId;
    this.encounterId = snapshot.encounterId || this.encounterId;
    this.manualText = snapshot.text || "";
    this.manualRevision = Number(snapshot.manualRevision || 0);
    this.createdAt = snapshot.createdAt || this.createdAt;
    this.confirmedSegments = Array.isArray(snapshot.confirmedSegments) ? snapshot.confirmedSegments : [];
    this.pendingSegments = Array.isArray(snapshot.pendingSegments) ? snapshot.pendingSegments : [];
    this.interimResults = new Map(Array.isArray(snapshot.interimResults) ? snapshot.interimResults : []);
    this.manualEdits = Array.isArray(snapshot.manualEdits) ? snapshot.manualEdits : [];
    this.segments = new Map((snapshot.segments || []).map((segment) => [segment.id, segment]));
  }

  addRecognitionResult({
    sessionId = this.sessionId, patientId = this.patientId, streamId = "stream-0", streamSequence = 0,
    resultIndex, transcript, confidence = null, isFinal = false, provider = "web_speech_api",
    speaker = "hablante_no_identificado"
  } = {}) {
    if (sessionId !== this.sessionId || patientId !== this.patientId) {
      return { changed: false, rejected: true, reason: "context_mismatch", text: this.manualText, provisional: this.getProvisional() };
    }
    const normalizado = normalizarTextoClinicoConservador(transcript || "");
    const texto = normalizado.normalizedText;
    const provisionalKey = `${streamId}:${resultIndex}`;
    if (!texto) {
      this.interimResults.delete(provisionalKey);
      return { changed: false, text: this.manualText, provisional: this.getProvisional() };
    }
    const segmento = {
      id: crearIdSegmento({ sessionId: this.sessionId, streamId, resultIndex, isFinal }),
      sessionId: this.sessionId, patientId: this.patientId, userId: this.userId, encounterId: this.encounterId,
      streamId, streamSequence, resultIndex, startTime: null, endTime: null,
      status: isFinal ? "confirmed" : "provisional", originalText: String(transcript || ""),
      normalizedText: texto, confidence: Number.isFinite(Number(confidence)) && Number(confidence) > 0 ? Number(confidence) : null,
      speaker, provider, transformations: normalizado.transformations, updatedAt: new Date().toISOString()
    };

    if (!isFinal) {
      this.interimResults.set(provisionalKey, segmento);
      this.segments.set(segmento.id, segmento);
      return { changed: true, text: this.manualText, provisional: this.getProvisional() };
    }

    this.interimResults.delete(provisionalKey);
    const alreadyConfirmed = this.confirmedSegments.some((item) => item.streamId === streamId && item.resultIndex === resultIndex);
    if (alreadyConfirmed) return { changed: false, text: this.manualText, provisional: this.getProvisional() };

    const pendingIndex = this.pendingSegments.findIndex((item) => item.streamId === streamId && item.resultIndex === resultIndex);
    if (pendingIndex >= 0) this.pendingSegments.splice(pendingIndex, 1);
    this.confirmedSegments.push(segmento);
    this.confirmedSegments.sort(ordenarPorReconocimiento);
    this.segments.set(segmento.id, segmento);
    if (!contieneFragmento(this.manualText, texto)) this.manualText = unirTexto(this.manualText, texto);
    return { changed: true, text: this.manualText, provisional: this.getProvisional() };
  }

  preserveInterimsAsPending({ streamId = "" } = {}) {
    const entries = Array.from(this.interimResults.entries());
    for (const [key, item] of entries) {
      if (streamId && item.streamId !== streamId) continue;
      if (!this.pendingSegments.some((pending) => pending.streamId === item.streamId && pending.resultIndex === item.resultIndex)) {
        const pending = { ...item, id: item.id.replace(/-provisional$/, "-pendiente"), status: "pending", updatedAt: new Date().toISOString() };
        this.pendingSegments.push(pending);
        this.segments.set(pending.id, pending);
      }
      this.interimResults.delete(key);
    }
    this.pendingSegments.sort(ordenarPorReconocimiento);
    return this.getPendingText();
  }

  retainInterimResults(streamId, activeResultIndexes = []) {
    const active = new Set(activeResultIndexes.map((index) => `${streamId}:${index}`));
    for (const [key, item] of this.interimResults.entries()) {
      if (item.streamId === streamId && !active.has(key)) this.interimResults.delete(key);
    }
    return this.getProvisional();
  }

  includePendingInText() {
    for (const item of this.pendingSegments) {
      if (!item.includedInText && !contieneFragmento(this.manualText, item.normalizedText)) {
        this.manualText = unirTexto(this.manualText, item.normalizedText);
      }
      item.includedInText = true;
    }
    return this.manualText;
  }

  undoLastSentence() {
    const nuevo = this.manualText.trimEnd().replace(/[^.!?\n]+[.!?]?\s*$/u, "").trimEnd();
    this.setManualText(nuevo);
    return nuevo;
  }

  clear() {
    this.confirmedSegments = [];
    this.pendingSegments = [];
    this.interimResults.clear();
    this.manualEdits = [];
    this.segments.clear();
    this.manualText = "";
    this.manualRevision += 1;
  }
}
