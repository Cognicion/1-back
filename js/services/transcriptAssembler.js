import { normalizarComparacion, normalizarTextoClinicoConservador } from "./clinicalTextNormalizer.js";

function crearIdSegmento({ sessionId, resultIndex, alternativeIndex = 0, isFinal = false }) {
  return [
    sessionId || "sesion",
    resultIndex ?? Date.now(),
    alternativeIndex,
    isFinal ? "final" : "provisional"
  ].join("-");
}

function contieneFragmento(textoCompleto = "", fragmento = "") {
  const base = normalizarComparacion(textoCompleto);
  const parte = normalizarComparacion(fragmento);
  if (!parte) return true;
  return base.endsWith(parte) || base.includes(` ${parte} `);
}

function unirTexto(base = "", fragmento = "") {
  const textoBase = String(base || "").trimEnd();
  const parte = String(fragmento || "").trim();
  if (!parte) return textoBase;
  if (!textoBase) return parte;
  return `${textoBase}${/[\s\n]$/.test(textoBase) ? "" : " "}${parte}`.trim();
}

export class TranscriptAssembler {
  constructor({ sessionId, patientId = "", userId = "", encounterId = "" } = {}) {
    this.sessionId = sessionId || crypto.randomUUID?.() || `dictado-${Date.now()}`;
    this.patientId = patientId;
    this.userId = userId;
    this.encounterId = encounterId;
    this.segments = new Map();
    this.provisional = "";
    this.manualText = "";
    this.manualRevision = 0;
    this.lastFinalNormalized = "";
    this.lastFinalAt = 0;
    this.createdAt = new Date().toISOString();
  }

  setContext({ sessionId, patientId, userId, encounterId } = {}) {
    if (sessionId) this.sessionId = sessionId;
    if (patientId !== undefined) this.patientId = patientId;
    if (userId !== undefined) this.userId = userId;
    if (encounterId !== undefined) this.encounterId = encounterId;
  }

  setManualText(texto = "") {
    this.manualText = String(texto || "");
    this.manualRevision += 1;
  }

  getText() {
    return this.manualText;
  }

  getProvisional() {
    return this.provisional;
  }

  stats() {
    const lista = Array.from(this.segments.values());
    const confirmados = lista.filter((s) => s.status === "confirmed");
    const confianzas = confirmados
      .map((s) => Number(s.confidence))
      .filter((valor) => Number.isFinite(valor) && valor > 0);
    return {
      sessionId: this.sessionId,
      processed: confirmados.length,
      finalSegments: confirmados.length,
      pending: this.provisional ? 1 : 0,
      failed: lista.filter((s) => s.status === "failed").length,
      total: lista.length,
      manualRevision: this.manualRevision,
      averageConfidence: confianzas.length
        ? confianzas.reduce((suma, valor) => suma + valor, 0) / confianzas.length
        : null
    };
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      patientId: this.patientId,
      userId: this.userId,
      encounterId: this.encounterId,
      text: this.manualText,
      provisional: this.provisional,
      manualRevision: this.manualRevision,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      segments: Array.from(this.segments.values())
    };
  }

  restore(snapshot = {}) {
    this.sessionId = snapshot.sessionId || this.sessionId;
    this.patientId = snapshot.patientId || this.patientId;
    this.userId = snapshot.userId || this.userId;
    this.encounterId = snapshot.encounterId || this.encounterId;
    this.manualText = snapshot.text || "";
    this.provisional = snapshot.provisional || "";
    this.manualRevision = Number(snapshot.manualRevision || 0);
    this.createdAt = snapshot.createdAt || this.createdAt;
    this.segments = new Map((snapshot.segments || []).map((segmento) => [segmento.id, segmento]));
  }

  shouldSkipFinal(texto = "") {
    const normalizado = normalizarComparacion(texto);
    if (!normalizado) return true;
    const ahora = Date.now();
    if (normalizado === this.lastFinalNormalized && ahora - this.lastFinalAt < 4500) return true;
    return contieneFragmento(this.manualText, texto);
  }

  addRecognitionResult({
    sessionId = this.sessionId,
    patientId = this.patientId,
    resultIndex,
    transcript,
    confidence = null,
    isFinal = false,
    provider = "web_speech_api",
    speaker = "hablante_no_identificado"
  } = {}) {
    if (sessionId !== this.sessionId || patientId !== this.patientId) {
      return { changed: false, rejected: true, reason: "context_mismatch", text: this.manualText, provisional: this.provisional };
    }
    const normalizado = normalizarTextoClinicoConservador(transcript || "");
    const texto = normalizado.normalizedText;
    const id = crearIdSegmento({ sessionId: this.sessionId, resultIndex, isFinal });

    if (!texto) return { changed: false, text: this.manualText, provisional: this.provisional };

    const segmento = {
      id,
      sessionId: this.sessionId,
      patientId: this.patientId,
      userId: this.userId,
      encounterId: this.encounterId,
      startTime: null,
      endTime: null,
      status: isFinal ? "confirmed" : "provisional",
      originalText: String(transcript || ""),
      normalizedText: texto,
      confidence,
      speaker,
      provider,
      retryCount: 0,
      transformations: normalizado.transformations,
      createdAt: new Date().toISOString()
    };

    if (!isFinal) {
      this.provisional = texto;
      this.segments.set(id, segmento);
      return { changed: true, text: this.manualText, provisional: this.provisional };
    }

    this.provisional = "";
    if (this.shouldSkipFinal(texto)) {
      return { changed: false, text: this.manualText, provisional: this.provisional };
    }

    this.manualText = unirTexto(this.manualText, texto);
    this.lastFinalNormalized = normalizarComparacion(texto);
    this.lastFinalAt = Date.now();
    this.segments.set(id, segmento);
    return { changed: true, text: this.manualText, provisional: this.provisional };
  }

  undoLastSentence() {
    const nuevo = this.manualText.trimEnd().replace(/[^.!?\n]+[.!?]?\s*$/u, "").trimEnd();
    this.setManualText(nuevo);
    return nuevo;
  }

  clear() {
    this.segments.clear();
    this.provisional = "";
    this.manualText = "";
    this.manualRevision += 1;
  }
}
