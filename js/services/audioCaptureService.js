export class AudioCaptureService {
  constructor({ onLevel, onWarning } = {}) {
    this.onLevel = onLevel;
    this.onWarning = onWarning;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.frame = null;
    this.silenceSince = null;
    this.lastMeasurement = { rms: 0, level: 0, warnings: [] };
  }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((item) => item.kind === "audioinput");
  }

  async start(deviceId = "") {
    await this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("El navegador no permite acceder al micrófono.");
    }

    const constraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.measure();
    }
    return this.stream;
  }

  measure() {
    if (!this.analyser) return this.lastMeasurement;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(100, Math.round(rms * 260));
    this.onLevel?.(level);

    if (level < 4) {
      this.silenceSince ||= Date.now();
      if (Date.now() - this.silenceSince > 8500) this.onWarning?.("No se detecta voz. Revisa el micrófono.");
      else this.onWarning?.("Nivel bajo.");
    } else if (level > 92) {
      this.silenceSince = null;
      this.onWarning?.("Volumen muy alto; puede saturar.");
    } else {
      this.silenceSince = null;
      this.onWarning?.("Micrófono activo.");
    }

    this.lastMeasurement = {
      rms,
      level,
      warnings: level < 4
        ? [Date.now() - (this.silenceSince || Date.now()) > 8500 ? "No se detecta voz. Revisa el microfono." : "Nivel bajo."]
        : level > 92
          ? ["Volumen muy alto; puede saturar."]
          : ["Microfono activo."]
    };
    this.frame = requestAnimationFrame(() => this.measure());
    return this.lastMeasurement;
  }

  async stop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.stream = null;
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // Algunos navegadores cierran el contexto de audio automáticamente.
      }
    }
    this.audioContext = null;
    this.analyser = null;
    this.lastMeasurement = { rms: 0, level: 0, warnings: [] };
    this.onLevel?.(0);
  }
}
