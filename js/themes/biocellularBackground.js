import { getBiocellularPreferences } from "./biocellularPreferences.js";

function readOptions() {
  try {
    return getBiocellularPreferences();
  } catch { return getBiocellularPreferences(); }
}

function quality(options, canvas) {
  const media = (query) => globalThis.matchMedia?.(query)?.matches ?? false;
  const mobile = media("(max-width: 720px)");
  const reduced = options.respectReducedMotion && media("(prefers-reduced-motion: reduce)");
  const staticMode = reduced || options.batterySaverStatic || (mobile && options.disableMobile);
  const counts = { desactivadas: 8, pocas: 72, medias: 108, muchas: 150 };
  const particleCount = mobile ? Math.min(28, counts[options.particles] || 72) : (counts[options.particles] || 72);
  return { mobile, reduced, staticMode, cellCount: mobile ? 2 : 5, vesicleCount: mobile ? 8 : 24, particleCount, fps: mobile ? 15 : (options.limitFps ? 30 : 45), dpr: Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5), canvas };
}

export function createBiocellularBackground(host, incomingOptions = {}) {
  const options = { animationEnabled: true, intensity: "baja", particles: "pocas", speed: "muy-lenta", ...readOptions(), ...incomingOptions };
  console.debug("[BIOCELULAR] Inicializando escena", { options });
  const canvas = document.createElement("canvas");
  canvas.className = "biocellular-background";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  console.debug("[BIOCELULAR] Canvas creado", { connected: canvas.isConnected });
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    console.warn("[BIOCELULAR] Fallback activado: Canvas 2D no disponible");
    return () => canvas.remove();
  }
  const profile = quality(options, canvas);
  const cells = Array.from({ length: profile.cellCount }, (_, index) => ({
    x: [.12, .78, .9, .25, .58][index], y: [.25, .18, .64, .78, .55][index], radius: [260, 330, 220, 290, 240][index], phase: index * 1.7, wobble: .04 + index * .008
  }));
  const vesicles = Array.from({ length: profile.vesicleCount }, (_, index) => ({
    x: (index * .173 + .08) % .92, y: (index * .317 + .11) % .86, radius: 8 + (index % 5) * 4, phase: index * .83
  }));
  const particles = Array.from({ length: profile.particleCount }, (_, index) => ({
    x: (index * .618 + .04) % 1, y: (index * .381 + .07) % 1, radius: 1.5 + (index % 4) * .7, phase: index * 1.73
  }));
  host.dataset.sceneCells = String(cells.length);
  host.dataset.sceneVesicles = String(vesicles.length);
  host.dataset.sceneParticles = String(particles.length);
  host.dataset.fps = String(profile.fps);
  host.dataset.dpr = String(profile.dpr);
  console.debug("[BIOCELULAR] Objetos de escena", { cells: cells.length, vesicles: vesicles.length, particles: particles.length });
  let width = 0, height = 0, raf = 0, last = 0, paused = false, disposed = false;
  let firstFrame = true;
  let pixelsChecked = false;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width || host.clientWidth || window.innerWidth);
    height = Math.max(1, rect.height || host.clientHeight || window.innerHeight);
    const dpr = profile.dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    console.debug("[BIOCELULAR SIZE] css", { width, height });
    console.debug("[BIOCELULAR SIZE] internal", { width: canvas.width, height: canvas.height });
    console.debug("[BIOCELULAR SIZE] dpr", dpr);
    console.debug("[BIOCELULAR SIZE] viewport", { width: window.innerWidth, height: window.innerHeight });
    console.debug("[BIOCELULAR] Resize aplicado", { width, height, canvasWidth: canvas.width, canvasHeight: canvas.height });
  };
  const irregularPath = (cell, time) => {
    const points = 22;
    ctx.beginPath();
    for (let index = 0; index <= points; index += 1) {
      const angle = index / points * Math.PI * 2;
      const wobble = 1 + Math.sin(angle * 3 + cell.phase + time * .0002) * cell.wobble + Math.cos(angle * 5 + cell.phase) * .025;
      const x = cell.x * width + Math.cos(angle) * cell.radius * wobble;
      const y = cell.y * height + Math.sin(angle) * cell.radius * wobble * .78;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const drawCell = (cell, time) => {
    const pulse = 1 + Math.sin(time * .00035 + cell.phase) * .035;
    ctx.save();
    ctx.translate(cell.x * width, cell.y * height);
    ctx.scale(pulse, pulse);
    ctx.translate(-cell.x * width, -cell.y * height);
    const glow = ctx.createRadialGradient(cell.x * width, cell.y * height, cell.radius * .08, cell.x * width, cell.y * height, cell.radius * 1.18);
    glow.addColorStop(0, "rgba(225,102,78,.42)");
    glow.addColorStop(.52, "rgba(156,39,57,.30)");
    glow.addColorStop(1, "rgba(32,5,13,0)");
    ctx.fillStyle = glow;
    irregularPath(cell, time);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,189,88,.62)";
    ctx.shadowColor = "rgba(225,102,78,.55)";
    ctx.shadowBlur = 22;
    irregularPath(cell, time);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(201,66,69,.72)";
    irregularPath({ ...cell, radius: cell.radius * .78, x: cell.x + .01, y: cell.y - .01 }, time);
    ctx.stroke();
    ctx.restore();
  };
  const drawVesicle = (vesicle, time) => {
    const x = vesicle.x * width + Math.sin(time * .00025 + vesicle.phase) * 10;
    const y = vesicle.y * height + Math.cos(time * .0002 + vesicle.phase) * 8;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, vesicle.radius * 2.4);
    glow.addColorStop(0, "rgba(255,189,88,.62)"); glow.addColorStop(.42, "rgba(225,102,78,.38)"); glow.addColorStop(1, "rgba(118,27,42,0)");
    ctx.save(); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, vesicle.radius * 2.4, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,189,88,.58)"; ctx.beginPath(); ctx.arc(x, y, vesicle.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  const drawParticle = (particle, time) => { const x = (particle.x * width + Math.sin(time * .00018 + particle.phase) * 12 + width) % width; const y = (particle.y * height + Math.cos(time * .00015 + particle.phase) * 10 + height) % height; ctx.save(); ctx.fillStyle = "rgba(255,241,213,.52)"; ctx.beginPath(); ctx.arc(x, y, particle.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  const inspectPixels = () => {
    if (pixelsChecked) return;
    pixelsChecked = true;
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let noTransparent = 0, distinctFromBackground = 0, maxAlpha = 0, luminance = 0;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha > 0) noTransparent += 1;
        if (alpha > 0 && (data[index] > 24 || data[index + 1] > 10 || data[index + 2] > 14)) distinctFromBackground += 1;
        maxAlpha = Math.max(maxAlpha, alpha);
        luminance += .2126 * data[index] + .7152 * data[index + 1] + .0722 * data[index + 2];
      }
      const total = data.length / 4;
      console.debug("[BIOCELULAR PIXELS] total", total);
      console.debug("[BIOCELULAR PIXELS] noTransparent", noTransparent);
      console.debug("[BIOCELULAR PIXELS] distinctFromBackground", distinctFromBackground);
      console.debug("[BIOCELULAR PIXELS] maxAlpha", maxAlpha);
      console.debug("[BIOCELULAR PIXELS] averageLuminance", total ? luminance / total : 0);
      if (noTransparent === 0 || distinctFromBackground === 0) {
        host.dataset.fallback = "true";
        host.dataset.biocellularState = "fallback";
        console.warn("[BIOCELULAR] Escena sin píxeles visibles, activando fallback");
      } else {
        host.dataset.biocellularState = "visiblePixelsConfirmed";
        console.debug("[BIOCELULAR] Escena visible");
        host.dataset.biocellularState = "running";
      }
    } catch (error) { host.dataset.fallback = "true"; console.warn("[BIOCELULAR] No se pudo inspeccionar el framebuffer; fallback activado", error); }
  };
  const drawDiagnostic = () => {
    ctx.save();
    ctx.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.fillStyle = "rgba(190,25,43,.96)"; ctx.beginPath(); ctx.arc(140, 140, 110, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(255,145,62,.98)"; ctx.beginPath(); ctx.arc(width * .5, height * .5, 160, 0, Math.PI * 2); ctx.stroke();
    for (let index = 0; index < 10; index += 1) { ctx.fillStyle = "rgba(255,221,93,.98)"; ctx.beginPath(); ctx.arc(40 + index * 42, height * .72 + (index % 2) * 16, 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(255,255,255,.9)"; for (let index = 0; index < 100; index += 1) { ctx.beginPath(); ctx.arc((index * 97) % Math.max(1, width), (index * 53) % Math.max(1, height), 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = "700 22px sans-serif"; ctx.fillText("BIOCELULAR CANVAS ACTIVO", 28, Math.min(height - 28, 48));
    ctx.strokeStyle = "rgba(255,255,0,.98)"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, Math.max(4, width - 4), Math.max(4, height - 4));
    ctx.restore();
  };
  const draw = (time) => {
    if (disposed) return;
    if (!paused && (profile.staticMode || !last || time - last >= 1000 / profile.fps)) {
      last = time;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none"; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);
      cells.forEach((cell) => drawCell(cell, time));
      vesicles.forEach((vesicle) => drawVesicle(vesicle, time));
      particles.forEach((particle) => drawParticle(particle, time));
      if (host.dataset.diagnostic === "true") drawDiagnostic();
      if (firstFrame) { firstFrame = false; host.dataset.biocellularState = "firstFrame"; console.debug("[BIOCELULAR] Primer frame renderizado", { width, height, staticMode: profile.staticMode, cells: cells.length, vesicles: vesicles.length, particles: particles.length }); inspectPixels(); }
    }
    raf = requestAnimationFrame(draw);
  };
  const visibility = () => { paused = Boolean(options.pauseHidden && document.visibilityState !== "visible"); console.debug(paused ? "[BIOCELULAR] Pausa por pestaña oculta" : "[BIOCELULAR] Animación reanudada"); if (!paused && !raf) raf = requestAnimationFrame(draw); };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(host); else window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", visibility, { passive: true }); resize(); host.dataset.biocellularState = "mounted"; raf = requestAnimationFrame(draw); console.debug("[BIOCELULAR] Render loop iniciado", { fps: profile.fps, dpr: profile.dpr });
  return () => { disposed = true; cancelAnimationFrame(raf); raf = 0; observer?.disconnect(); if (!observer) window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility); canvas.remove(); };
}
