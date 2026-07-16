export const PROVIDER_STATUS = Object.freeze({
  AVAILABLE: "disponible",
  NOT_CONFIGURED: "no_configurado",
  NOT_SUPPORTED: "no_compatible",
  OFFLINE: "sin_conexion",
  LIMIT_REACHED: "limite_alcanzado",
  TEMPORARY_ERROR: "error_temporal",
  PERMANENT_ERROR: "error_permanente"
});

export class TranscriptionProvider {
  constructor(config = {}) {
    this.config = config;
    this.status = PROVIDER_STATUS.NOT_CONFIGURED;
  }
  capability() { return { status: this.status }; }
  start() { throw new Error("TranscriptionProvider.start debe implementarse."); }
  stop() {}
  dispose() { this.stop(); }
}

export class WebSpeechTranscriptionProvider extends TranscriptionProvider {
  constructor({ windowRef = globalThis.window, maxRetries = 6, baseBackoffMs = 450, onResult, onError, onState, onStreamEnd } = {}) {
    super({ maxRetries, baseBackoffMs });
    this.windowRef = windowRef;
    this.Recognition = windowRef?.SpeechRecognition || windowRef?.webkitSpeechRecognition || null;
    this.status = this.Recognition ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.NOT_SUPPORTED;
    this.onResult = onResult;
    this.onError = onError;
    this.onState = onState;
    this.onStreamEnd = onStreamEnd;
    this.recognition = null;
    this.retryCount = 0;
    this.timer = null;
    this.activeContext = null;
    this.userStopped = true;
    this.lastError = "";
    this.streamSequence = 0;
  }

  capability() {
    return {
      id: "web_speech_api", status: this.status, configured: true,
      localProcessingGuaranteed: false,
      privacyNotice: "El procesamiento depende del navegador y puede usar servicios del proveedor. No se garantiza procesamiento local."
    };
  }

  contextMatches(context = {}) {
    return Boolean(this.activeContext && context.sessionId === this.activeContext.sessionId && context.patientId === this.activeContext.patientId);
  }

  createRecognition(context) {
    const streamSequence = this.streamSequence;
    const streamContext = { ...context, streamId: `${context.sessionId}:stream-${streamSequence}`, streamSequence };
    const recognition = new this.Recognition();
    recognition.lang = "es-MX";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      if (!this.contextMatches(context) || this.userStopped) return;
      this.retryCount = 0;
      this.onResult?.(event, { ...streamContext, provider: "web_speech_api" });
    };
    recognition.onerror = (event) => this.handleError(event, streamContext);
    recognition.onend = () => this.handleEnd(streamContext);
    recognition.cognicionStreamContext = streamContext;
    return recognition;
  }

  start(context = {}) {
    if (!this.Recognition) {
      this.status = PROVIDER_STATUS.NOT_SUPPORTED;
      throw new Error("Web Speech API no es compatible con este navegador.");
    }
    this.stop({ invalidate: false });
    this.activeContext = { sessionId: context.sessionId || "", patientId: context.patientId || "", encounterId: context.encounterId || "" };
    this.userStopped = false;
    this.lastError = "";
    this.streamSequence += 1;
    this.recognition = this.createRecognition(this.activeContext);
    this.recognition.start();
    this.status = PROVIDER_STATUS.AVAILABLE;
    this.onState?.({ state: "listening", retryCount: this.retryCount, context: this.activeContext });
  }

  handleError(event = {}, context) {
    if (!this.contextMatches(context) || this.userStopped) return;
    const code = event.error || "unknown";
    this.lastError = code;
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(code)) {
      this.status = PROVIDER_STATUS.PERMANENT_ERROR;
      this.userStopped = true;
    } else if (code === "network") {
      this.status = globalThis.navigator?.onLine === false ? PROVIDER_STATUS.OFFLINE : PROVIDER_STATUS.TEMPORARY_ERROR;
    } else if (code === "aborted" && this.userStopped) {
      return;
    } else {
      this.status = PROVIDER_STATUS.TEMPORARY_ERROR;
    }
    this.onError?.({ code, status: this.status, retryable: !this.userStopped, context: { ...context } });
  }

  handleEnd(context) {
    if (!this.contextMatches(context) || this.userStopped) return;
    this.onStreamEnd?.({ ...context, reason: this.lastError || "recognition-ended" });
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(this.lastError)) return;
    if (this.retryCount >= this.config.maxRetries) {
      this.status = PROVIDER_STATUS.LIMIT_REACHED;
      this.userStopped = true;
      this.onError?.({ code: "retry-limit", status: this.status, retryable: false, context: { ...context } });
      return;
    }
    const delay = Math.min(8000, this.config.baseBackoffMs * (2 ** this.retryCount));
    this.retryCount += 1;
    this.onState?.({ state: "reconnecting", retryCount: this.retryCount, delay, context: { ...context } });
    this.timer = this.windowRef.setTimeout(() => {
      if (!this.contextMatches(context) || this.userStopped) return;
      try {
        this.streamSequence += 1;
        this.recognition = this.createRecognition(this.activeContext);
        this.recognition.start();
        this.onState?.({ state: "listening", retryCount: this.retryCount, context: { ...context } });
      } catch (error) {
        this.lastError = "restart-failed";
        this.handleEnd(context);
      }
    }, delay);
  }

  stop({ invalidate = true } = {}) {
    this.userStopped = true;
    if (this.timer) this.windowRef?.clearTimeout?.(this.timer);
    this.timer = null;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch { /* ya detenido */ }
      try { recognition.abort?.(); } catch { /* no disponible */ }
    }
    if (invalidate) this.activeContext = null;
  }

  dispose() {
    this.stop();
    this.onResult = null;
    this.onError = null;
    this.onState = null;
    this.onStreamEnd = null;
  }
}

export class ExternalTranscriptionProvider extends TranscriptionProvider {
  constructor(config = {}) {
    super(config);
    this.status = config.backendEndpoint ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.NOT_CONFIGURED;
  }
  capability() {
    return { id: "external_backend", status: this.status, configured: Boolean(this.config.backendEndpoint),
      notice: "Requiere backend o Cloud Function; las claves nunca deben incluirse en el frontend." };
  }
}

export function createTranscriptionProvider(config = {}, handlers = {}) {
  const requested = config.provider || "auto";
  if (requested === "external") return new ExternalTranscriptionProvider(config.external || {});
  const web = new WebSpeechTranscriptionProvider({ ...handlers, ...(config.webSpeech || {}) });
  return web.capability().status === PROVIDER_STATUS.AVAILABLE ? web : new ExternalTranscriptionProvider(config.external || {});
}
