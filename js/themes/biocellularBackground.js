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
  const counts = { desactivadas: 0, pocas: 22, medias: 38, muchas: 58 };
  return { mobile, reduced, staticMode, count: mobile ? Math.min(12, counts[options.particles] || 12) : counts[options.particles] || 22, fps: mobile ? 15 : (options.limitFps ? 30 : 45), dpr: Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75), canvas };
}

export function createBiocellularBackground(host, incomingOptions = {}) {
  const options = { ...readOptions(), ...incomingOptions };
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
  const particles = Array.from({ length: profile.count }, (_, index) => ({
    seed: index * 1.73 + Math.random(), x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3.5, drift: .0005 + Math.random() * .0015, phase: Math.random() * Math.PI * 2
  }));
  let width = 0, height = 0, raf = 0, last = 0, paused = false, disposed = false;
  let firstFrame = true;
  const resize = () => { const rect = host.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); const dpr = profile.dpr; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); console.debug("[BIOCELULAR] Resize aplicado", { width, height, canvasWidth: canvas.width, canvasHeight: canvas.height }); };
  const draw = (time) => {
    if (disposed) return;
    if (!paused && (profile.staticMode || !last || time - last >= 1000 / profile.fps)) {
      last = time;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(width * .58, height * .34, 0, width * .58, height * .34, Math.max(width, height) * .72);
      gradient.addColorStop(0, "rgba(139,29,45,.24)"); gradient.addColorStop(.52, "rgba(44,7,17,.13)"); gradient.addColorStop(1, "rgba(10,2,5,.62)"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
      const pulse = profile.staticMode ? 0 : Math.sin(time * (options.speed === "normal" ? .001 : .00035)) * 7;
      for (let i = 0; i < 4; i += 1) { const x = width * ([.15, .72, .9, .42][i]) + Math.sin(time * .00018 + i) * 18; const y = height * ([.2, .17, .58, .82][i]) + Math.cos(time * .00016 + i) * 14; const radius = Math.min(width, height) * ([.22, .16, .13, .2][i]) + pulse * (i % 2 ? .4 : -.25); const glow = ctx.createRadialGradient(x, y, radius * .08, x, y, radius); glow.addColorStop(0, "rgba(220,72,59,.16)"); glow.addColorStop(.58, "rgba(102,19,37,.10)"); glow.addColorStop(1, "rgba(16,3,9,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
      if (!profile.staticMode) particles.forEach((particle) => { particle.x = (particle.x + Math.sin(time * particle.drift + particle.phase) * .00012 + .00003) % 1; particle.y = (particle.y + Math.cos(time * particle.drift + particle.phase) * .00009 + .00002) % 1; ctx.fillStyle = `rgba(255, ${130 + Math.round(particle.seed * 30) % 70}, ${65 + Math.round(particle.seed * 30) % 45}, .${options.intensity === "alta" ? "68" : "42"})`; ctx.beginPath(); ctx.arc(particle.x * width, particle.y * height, particle.r, 0, Math.PI * 2); ctx.fill(); });
      if (firstFrame) { firstFrame = false; console.debug("[BIOCELULAR] Primer frame renderizado", { width, height, staticMode: profile.staticMode, particles: profile.count }); }
    }
    raf = requestAnimationFrame(draw);
  };
  const visibility = () => { paused = Boolean(options.pauseHidden && document.visibilityState !== "visible"); console.debug(paused ? "[BIOCELULAR] Pausa por pestaña oculta" : "[BIOCELULAR] Animación reanudada"); if (!paused && !raf) raf = requestAnimationFrame(draw); };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(host); else window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", visibility, { passive: true }); resize(); raf = requestAnimationFrame(draw); console.debug("[BIOCELULAR] Render loop iniciado", { fps: profile.fps, dpr: profile.dpr });
  return () => { disposed = true; cancelAnimationFrame(raf); raf = 0; observer?.disconnect(); if (!observer) window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility); canvas.remove(); };
}
