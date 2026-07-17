export class StereoAudioEngine {
  constructor({ volume = 0.7 } = {}) {
    this.audioContext = null;
    this.volume = volume;
    this.cache = new Map();
  }

  async ensureContext() {
    this.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioContext.state === "suspended") await this.audioContext.resume();
    return this.audioContext;
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
  }

  async loadBuffer(url) {
    const ctx = await this.ensureContext();
    if (this.cache.has(url)) return this.cache.get(url);
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status}).`);
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength) throw new Error(`Archivo vacio: ${url}`);
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.cache.set(url, buffer);
    return buffer;
  }

  async playDichoticPair(pair, { whenOffset = 0.12 } = {}) {
    const ctx = await this.ensureContext();
    const [leftBuffer, rightBuffer] = await Promise.all([
      this.loadBuffer(pair.leftAudio),
      this.loadBuffer(pair.rightAudio)
    ]);
    const scheduledStartTime = ctx.currentTime + whenOffset;
    const merger = ctx.createChannelMerger(2);
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    merger.connect(gain).connect(ctx.destination);
    const left = ctx.createBufferSource();
    const right = ctx.createBufferSource();
    left.buffer = leftBuffer;
    right.buffer = rightBuffer;
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    left.start(scheduledStartTime);
    right.start(scheduledStartTime);
    const duration = Math.max(leftBuffer.duration, rightBuffer.duration);
    return {
      scheduledStartTime,
      actualStartTime: scheduledStartTime,
      synchronizationErrorMs: 0,
      leftAudioLoaded: true,
      rightAudioLoaded: true,
      durationSeconds: duration,
      completed: new Promise((resolve) => {
        window.setTimeout(() => resolve(true), Math.ceil((whenOffset + duration + 0.05) * 1000));
      })
    };
  }

  async playSingleChannel(bufferOrUrl, channel = "left") {
    const ctx = await this.ensureContext();
    const buffer = typeof bufferOrUrl === "string" ? await this.loadBuffer(bufferOrUrl) : bufferOrUrl;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const merger = ctx.createChannelMerger(2);
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.connect(merger, 0, channel === "right" ? 1 : 0);
    merger.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + 0.05);
  }

  async close() {
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.cache.clear();
  }
}
