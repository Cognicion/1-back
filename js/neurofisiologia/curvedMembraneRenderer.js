import { formato } from "./equationRegistry.js";
import { estadoActualEducativo } from "./learningModeController.js";

const ION_STYLE = {
  na: { label: "Na+", color: "#fb923c", shape: "circle", charge: 1 },
  k: { label: "K+", color: "#34d399", shape: "diamond", charge: 1 },
  cl: { label: "Cl-", color: "#a78bfa", shape: "circle", charge: -1 },
  ca: { label: "Ca2+", color: "#facc15", shape: "circle", charge: 2 },
  a: { label: "A-", color: "#94a3b8", shape: "hex", charge: -1 }
};

const CAMERA_LABELS = {
  membrana: "Vista de membrana",
  axon: "Vista de axon",
  terminal: "Vista de terminal presinaptica",
  sinapsis: "Vista de sinapsis",
  general: "Vista general",
  farmacologia: "Vista farmacologica",
  matematica: "Vista matematica"
};

const ZONAS_NEURO_INFO = {
  extracelular: { titulo: "Espacio extracelular", detalle: "Predominan Na+, Cl- y Ca2+. El gradiente electroquimico favorece entrada de Na+ y Ca2+ cuando sus canales abren.", camara: "membrana" },
  intracelular: { titulo: "Citoplasma axonal", detalle: "Predominan K+ y aniones intracelulares. La salida de K+ contribuye a repolarizacion e hiperpolarizacion.", camara: "membrana" },
  membrana: { titulo: "Bicapa lipidica", detalle: "Barrera hidrofobica: los iones requieren canales, transportadores o bombas para cruzarla.", camara: "membrana" },
  naV: { titulo: "Canal de Na+ dependiente de voltaje", detalle: "Se activa con despolarizacion. La entrada rapida de Na+ inicia la fase ascendente del potencial de accion.", camara: "membrana" },
  kLeak: { titulo: "Canal de fuga de K+", detalle: "Mantiene permeabilidad basal al potasio y estabiliza el potencial de reposo cercano a EK.", camara: "membrana" },
  naLeak: { titulo: "Canal de fuga de Na+", detalle: "Permite pequena entrada basal de sodio; participa en la conductancia de reposo junto con otros canales.", camara: "membrana" },
  kV: { titulo: "Canal de K+ dependiente de voltaje", detalle: "Abre con retraso durante el potencial de accion. La salida de K+ repolariza la membrana.", camara: "membrana" },
  cl: { titulo: "Canal de Cl- / GABA-A", detalle: "La entrada o redistribucion de Cl- suele estabilizar o hiperpolarizar la membrana en sinapsis inhibitorias.", camara: "sinapsis" },
  caV: { titulo: "Canal de Ca2+ voltaje-dependiente", detalle: "En la terminal presinaptica, la entrada de Ca2+ dispara fusion vesicular y liberacion de neurotransmisor.", camara: "terminal" },
  pump: { titulo: "Bomba Na+/K+ ATPasa", detalle: "Transporte activo primario: usa ATP para expulsar 3 Na+ e introducir 2 K+, preservando gradientes ionicos.", camara: "membrana" },
  axon: { titulo: "Axon y conduccion", detalle: "La onda de despolarizacion avanza por corrientes locales; la mielina reduce capacitancia y acelera conduccion saltatoria.", camara: "axon" },
  terminal: { titulo: "Terminal presinaptica", detalle: "Contiene vesiculas sinapticas. Al llegar el potencial de accion aumenta Ca2+ local y crece la probabilidad de liberacion.", camara: "terminal" },
  sinapsis: { titulo: "Hendidura sinaptica", detalle: "El neurotransmisor difunde, se une a receptores y luego se retira por recaptura o degradacion enzimatica.", camara: "sinapsis" },
  postsinapsis: { titulo: "Membrana postsinaptica", detalle: "Los receptores transforman la senal quimica en corrientes ionicas excitadoras o inhibitorias.", camara: "sinapsis" },
  leyenda: { titulo: "Leyenda de iones", detalle: "Los colores distinguen Na+, K+, Cl- y Ca2+. Las particulas son representacion educativa del flujo, no conteo real.", camara: "general" }
};

export function renderizarMembranaCurvaIntegrada(canvas, overlay, estado, uiMode = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(720, Math.round(rect.width || canvas.clientWidth || 1060));
  const cssH = Math.max(460, Math.round(rect.height || canvas.clientHeight || 560));
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const geo = crearGeometria(cssW, cssH, uiMode.cameraMode || "membrana");
  dibujarFondo(ctx, cssW, cssH, geo, estado, uiMode);
  ctx.save();
  aplicarCamaraCanvas(ctx, cssW, cssH, uiMode);
  dibujarCompartimentos(ctx, geo);
  dibujarMembranaCurva(ctx, geo, estado);
  if (uiMode.showCharges !== false) dibujarCargas(ctx, geo, estado, uiMode);
  dibujarCanales(ctx, geo, estado, uiMode);
  dibujarIones(ctx, geo, estado, uiMode);
  dibujarBombaNaK(ctx, geo, estado);
  if (["axon", "general", "farmacologia"].includes(uiMode.cameraMode)) dibujarAxon(ctx, geo, estado);
  if (["terminal", "sinapsis", "general", "farmacologia"].includes(uiMode.cameraMode)) dibujarTerminalSinapsis(ctx, geo, estado, uiMode);
  dibujarFlujos(ctx, geo, estado, uiMode);
  dibujarFocoSeleccionado(ctx, geo, cssW, cssH, estado, uiMode);
  ctx.restore();
  dibujarLeyenda(ctx, cssW, cssH, estado, uiMode);
  actualizarOverlay(overlay, estado, uiMode);
}

function camaraCanvas(uiMode = {}) {
  return {
    zoom: Math.max(0.55, Math.min(3.4, Number(uiMode.cameraZoom || 1))),
    panX: Math.max(-1400, Math.min(1400, Number(uiMode.cameraPanX || 0))),
    panY: Math.max(-1000, Math.min(1000, Number(uiMode.cameraPanY || 0)))
  };
}

function aplicarCamaraCanvas(ctx, w, h, uiMode = {}) {
  const cam = camaraCanvas(uiMode);
  ctx.translate(w / 2 + cam.panX, h / 2 + cam.panY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-w / 2, -h / 2);
}

function pantallaAMundo(x, y, w, h, uiMode = {}) {
  const cam = camaraCanvas(uiMode);
  return {
    x: (x - w / 2 - cam.panX) / cam.zoom + w / 2,
    y: (y - h / 2 - cam.panY) / cam.zoom + h / 2
  };
}

function crearGeometria(w, h, modo) {
  const zoom = modo === "general" ? 0.78 : modo === "sinapsis" ? 0.9 : modo === "axon" ? 0.86 : 1;
  return {
    w, h, modo,
    cx: modo === "sinapsis" ? w * 0.34 : w * 0.48,
    cy: h * 1.02,
    rOuter: Math.min(w, h) * 0.92 * zoom,
    thickness: Math.max(42, Math.min(64, h * 0.09)),
    arcStart: Math.PI * 1.04,
    arcEnd: Math.PI * 1.93
  };
}

function puntoEnArco(geo, t, offset = 0) {
  const a = geo.arcStart + (geo.arcEnd - geo.arcStart) * t;
  const r = geo.rOuter - geo.thickness / 2 + offset;
  return { x: geo.cx + Math.cos(a) * r, y: geo.cy + Math.sin(a) * r, a };
}

function normalEnArco(a) {
  return { x: Math.cos(a), y: Math.sin(a) };
}

function dibujarFondo(ctx, w, h, geo, estado, uiMode) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#061827"); grad.addColorStop(0.5, "#020617"); grad.addColorStop(1, "#07101f");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = "rgba(125,211,252,.08)";
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.rOuter * 1.05, Math.PI, Math.PI * 2); ctx.fill();
}

function dibujarCompartimentos(ctx, geo) {
  ctx.save();
  ctx.fillStyle = "rgba(19,178,214,.16)";
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.rOuter - geo.thickness, Math.PI, Math.PI * 2); ctx.lineTo(geo.cx + geo.rOuter, geo.cy); ctx.fill();
  etiqueta(ctx, "EXTRACELULAR", geo.w * 0.08, geo.h * 0.12, "#7dd3fc");
  etiqueta(ctx, "INTRACELULAR", geo.w * 0.12, geo.h * 0.82, "#bae6fd");
  ctx.restore();
}

function dibujarMembranaCurva(ctx, geo, estado) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(250, 204, 21, .82)"; ctx.lineWidth = geo.thickness;
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.rOuter - geo.thickness / 2, geo.arcStart, geo.arcEnd); ctx.stroke();
  ctx.strokeStyle = "rgba(2, 6, 23, .92)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.rOuter, geo.arcStart, geo.arcEnd); ctx.stroke();
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.rOuter - geo.thickness, geo.arcStart, geo.arcEnd); ctx.stroke();
  dibujarFosfolipidos(ctx, geo);
  ctx.strokeStyle = "rgba(56,189,248,.24)"; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 34; i += 1) {
    const t = i / 34; const p = puntoEnArco(geo, t); const n = normalEnArco(p.a);
    ctx.beginPath(); ctx.moveTo(p.x + n.x * 18, p.y + n.y * 18); ctx.lineTo(p.x - n.x * 18, p.y - n.y * 18); ctx.stroke();
  }
  ctx.restore();
}

function dibujarFosfolipidos(ctx, geo) {
  ctx.save();
  for (let i = 0; i <= 44; i += 1) {
    const t = i / 44;
    const p = puntoEnArco(geo, t);
    const n = normalEnArco(p.a);
    const outer = { x: p.x + n.x * 18, y: p.y + n.y * 18 };
    const inner = { x: p.x - n.x * 18, y: p.y - n.y * 18 };
    ctx.strokeStyle = "rgba(15,23,42,.72)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(outer.x - n.x * 5, outer.y - n.y * 5);
    ctx.lineTo(p.x - n.x * 3, p.y - n.y * 3);
    ctx.moveTo(inner.x + n.x * 5, inner.y + n.y * 5);
    ctx.lineTo(p.x + n.x * 3, p.y + n.y * 3);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? "#60a5fa" : "#7dd3fc";
    ctx.beginPath(); ctx.arc(outer.x, outer.y, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(inner.x, inner.y, 4.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(224,242,254,.86)";
  ctx.font = "800 10px Inter, sans-serif";
  const ref = puntoEnArco(geo, 0.08, 34);
  ctx.fillText("cabezas fosfolipidicas", ref.x - 42, ref.y - 8);
  ctx.restore();
}
function canalesModelo(estado) {
  const naOpen = estado.Vm > -45 && estado.canales.sodio !== "Inactivado";
  const kOpen = estado.Vm > -55 || String(estado.canales.potasio).includes("Abierto");
  const caOpen = estado.terminalActiva || estado.sinapsis.caLocal > 0.25;
  const fxs = estado.farmacos?.efectos || {};
  return [
    { id: "naV", ion: "na", t: 0.18, label: "NaV", state: fxs.bloqueoNa > .65 ? "bloqueado" : naOpen ? "abierto" : estado.canales.sodio === "Inactivado" ? "inactivado" : "cerrado" },
    { id: "kLeak", ion: "k", t: 0.29, label: "K fuga", state: "abierto" },
    { id: "naLeak", ion: "na", t: 0.39, label: "Na fuga", state: "abierto" },
    { id: "kV", ion: "k", t: 0.50, label: "KV", state: fxs.bloqueoK > .65 ? "bloqueado" : kOpen ? "abierto" : "cerrado" },
    { id: "cl", ion: "cl", t: 0.61, label: estado.sinapsis.tipoId === "gaba" ? "GABA-A" : "Cl", state: fxs.gaba > .25 && estado.sinapsis.tipoId === "gaba" ? "potenciado" : "cerrado" },
    { id: "caV", ion: "ca", t: 0.72, label: "CaV", state: fxs.bloqueoCa > .55 ? "bloqueado" : caOpen ? "abierto" : "cerrado" },
    { id: "pump", ion: "na", t: 0.84, label: "Na/K", state: "bomba" }
  ];
}

function dibujarCanales(ctx, geo, estado) {
  canalesModelo(estado).forEach((ch) => {
    const p = puntoEnArco(geo, ch.t); const n = normalEnArco(p.a);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2);
    const color = ION_STYLE[ch.ion]?.color || "#7dd3fc";
    ctx.fillStyle = ch.state === "bloqueado" ? "#475569" : ch.state === "abierto" || ch.state === "potenciado" || ch.state === "bomba" ? color : "#0f172a";
    ctx.strokeStyle = ch.state === "inactivado" ? "#fb7185" : color; ctx.lineWidth = 2;
    roundRect(ctx, -14, -34, 28, 68, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ch.state === "abierto" || ch.state === "potenciado" || ch.state === "bomba" ? "rgba(2,6,23,.8)" : "rgba(148,163,184,.7)";
    roundRect(ctx, -5, -25, 10, 50, 5); ctx.fill();
    if (ch.state === "inactivado" || ch.state === "bloqueado") { ctx.strokeStyle = "#f43f5e"; ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(12, 20); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = "#e0f2fe"; ctx.font = "700 10px Inter, sans-serif"; ctx.fillText(ch.label, p.x + n.x * 30 - 16, p.y + n.y * 30);
  });
}

function dibujarIones(ctx, geo, estado, uiMode) {
  const densidad = ({ "muy-baja": 34, baja: 62, media: 110, alta: 170 })[uiMode.particleDensity || "baja"] || 62;
  const slow = ({ "muy-lenta": 0.18, lenta: 0.35, normal: 0.7 })[uiMode.particleSpeed || "lenta"] || 0.35;
  const t = estado.relojVisual * slow;
  const ratios = { na: [0.72, 0.12], k: [0.16, 0.70], cl: [0.42, 0.20], ca: [0.16, 0.03], a: [0.02, 0.34] };
  Object.entries(ratios).forEach(([ion, [extraRatio, intraRatio]], ionIndex) => {
    if (uiMode.ionFilter && uiMode.ionFilter !== "todos" && uiMode.ionFilter !== ion) return;
    const total = ion === "ca" ? Math.max(8, Math.floor(densidad * 0.18)) : Math.floor(densidad * Math.max(extraRatio, intraRatio) / 1.5);
    for (let i = 0; i < total; i += 1) {
      const extra = i / total < extraRatio / (extraRatio + intraRatio);
      const p = posicionIon(geo, i, ionIndex, t, extra);
      dibujarIon(ctx, p.x, p.y, ion, 0.75 + 0.25 * pseudo(i + ionIndex * 97));
    }
  });
}

function posicionIon(geo, i, ionIndex, t, extra) {
  const seed = i * 37 + ionIndex * 101;
  const x = (0.06 + pseudo(seed) * 0.86) * geo.w + Math.sin(t + seed) * 8;
  const y = extra ? (0.06 + pseudo(seed + 3) * 0.38) * geo.h : (0.54 + pseudo(seed + 9) * 0.38) * geo.h;
  const near = pseudo(seed + 11) < 0.35;
  return near ? puntoEnArco(geo, pseudo(seed + 17), extra ? 38 + pseudo(seed) * 30 : -38 - pseudo(seed) * 42) : { x, y };
}

function dibujarIon(ctx, x, y, ion, alpha = 1) {
  const s = ION_STYLE[ion]; if (!s) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = s.color; ctx.strokeStyle = "rgba(2,6,23,.8)"; ctx.lineWidth = 1.4;
  if (s.shape === "diamond") { ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); }
  else { ctx.beginPath(); ctx.arc(x, y, ion === "ca" ? 7 : 8, 0, Math.PI * 2); }
  ctx.fill(); ctx.stroke(); ctx.fillStyle = "#020617"; ctx.font = "800 8px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s.label, x, y);
  ctx.restore();
}

function dibujarFlujos(ctx, geo, estado) {
  const flujos = [
    { ion: "na", val: -estado.INa, channel: "naV" },
    { ion: "k", val: estado.IK, channel: "kV" },
    { ion: "ca", val: estado.sinapsis.caLocal * 24, channel: "caV" }
  ];
  const channels = Object.fromEntries(canalesModelo(estado).map((c) => [c.id, c]));
  flujos.forEach((f) => {
    const ch = channels[f.channel]; if (!ch || Math.abs(f.val) < 2) return;
    const p = puntoEnArco(geo, ch.t); const n = normalEnArco(p.a); const count = Math.min(10, Math.max(2, Math.round(Math.abs(f.val) / 35)));
    const inward = f.ion === "na" || f.ion === "ca" ? f.val > 0 : f.val < 0;
    for (let i = 0; i < count; i += 1) {
      const velocidadIon = f.ion === "k" ? 0.16 : f.ion === "ca" ? 0.22 : 0.28;
      const phase = (estado.relojVisual * velocidadIon + i / count) % 1;
      const amplitud = f.ion === "k" ? 78 : 116;
      const d = inward ? amplitud / 2 - phase * amplitud : -amplitud / 2 + phase * amplitud;
      dibujarIon(ctx, p.x + n.x * d + Math.sin(i) * 3, p.y + n.y * d + Math.cos(i) * 3, f.ion, 0.95);
    }
  });
}

function dibujarCargas(ctx, geo, estado, uiMode) {
  if (uiMode.reducedMotion) return;
  const polaridad = Math.max(-1, Math.min(1, -estado.Vm / 80));
  for (let i = 0; i < 24; i += 1) {
    const p1 = puntoEnArco(geo, i / 23, 28); const p2 = puntoEnArco(geo, i / 23, -28);
    ctx.fillStyle = polaridad > 0 ? "rgba(96,165,250,.55)" : "rgba(248,113,113,.55)"; ctx.fillText("+", p1.x, p1.y);
    ctx.fillStyle = polaridad > 0 ? "rgba(248,113,113,.55)" : "rgba(96,165,250,.55)"; ctx.fillText("-", p2.x, p2.y);
  }
}

function dibujarBombaNaK(ctx, geo, estado) {
  const p = puntoEnArco(geo, 0.84); const n = normalEnArco(p.a); const fase = (estado.relojVisual * Math.max(.1, estado.membrana.bombaNaK)) % 1;
  ctx.save(); ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2; ctx.fillStyle = "rgba(113,63,18,.55)";
  ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fef9c3"; ctx.font = "800 9px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("ATP", p.x, p.y + 4);
  for (let i = 0; i < 3; i += 1) dibujarIon(ctx, p.x - n.x * (38 - fase * 72) + i * 6 - 6, p.y - n.y * (38 - fase * 72), "na", .9);
  for (let i = 0; i < 2; i += 1) dibujarIon(ctx, p.x + n.x * (42 - fase * 72) + i * 7 - 4, p.y + n.y * (42 - fase * 72), "k", .9);
  ctx.restore();
}

function dibujarAxon(ctx, geo, estado) {
  const y = geo.h * .70; ctx.save(); ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(125,211,252,.26)"; ctx.lineWidth = 28; ctx.beginPath(); ctx.moveTo(geo.w * .12, y); ctx.lineTo(geo.w * .88, y); ctx.stroke();
  if (estado.axon.mielina) for (let i = 0; i < 7; i += 1) { const x = geo.w * (.16 + i * .1); ctx.strokeStyle = "rgba(224,242,254,.38)"; ctx.lineWidth = 44; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + geo.w * .055, y); ctx.stroke(); ctx.fillStyle = "#22d3ee"; ctx.fillRect(x + geo.w * .061, y - 32, 5, 64); }
  const xWave = geo.w * (.12 + .76 * Math.max(0, Math.min(1, estado.posicionOnda || 0))); ctx.fillStyle = "rgba(56,189,248,.38)"; ctx.beginPath(); ctx.arc(xWave, y, 34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function dibujarTerminalSinapsis(ctx, geo, estado) {
  const sx = geo.w * .72, sy = geo.h * .58; ctx.save();
  ctx.fillStyle = "rgba(14,116,144,.28)"; ctx.strokeStyle = "rgba(125,211,252,.28)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(sx, sy, 110, 86, -.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    const mx = sx - 48 + i * 43, my = sy - 42 + (i % 2) * 30;
    ctx.fillStyle = "rgba(148,163,184,.55)"; ctx.strokeStyle = "rgba(203,213,225,.75)";
    ctx.beginPath(); ctx.ellipse(mx, my, 18, 9, .35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(15,23,42,.7)"; ctx.beginPath(); ctx.moveTo(mx - 9, my); ctx.quadraticCurveTo(mx - 3, my - 7, mx + 3, my); ctx.quadraticCurveTo(mx + 8, my + 7, mx + 12, my); ctx.stroke();
  }
  const total = Math.min(32, Math.max(8, Math.round(estado.sinapsis.vesiculasVisuales || 18)));
  for (let i = 0; i < total; i += 1) { const a = i * 2.399; const r = 14 + (i % 5) * 12; const x = sx + Math.cos(a) * r; const y = sy + Math.sin(a) * r; ctx.fillStyle = i < estado.sinapsis.vesiculasFusionadas ? "#facc15" : i < estado.sinapsis.vesiculasListas ? "#38bdf8" : "#a78bfa"; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(224,242,254,.45)"; ctx.stroke(); }
  ctx.strokeStyle = "rgba(250,204,21,.78)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx + 70, sy + 55); ctx.lineTo(sx + 112, sy + 55); ctx.stroke();
  ctx.fillStyle = "rgba(15,23,42,.7)"; ctx.fillRect(sx + 122, sy - 90, 70, 180);
  ctx.strokeStyle = "rgba(125,211,252,.35)"; ctx.strokeRect(sx + 122, sy - 90, 70, 180);
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i % 2 ? "#22d3ee" : "#a78bfa";
    roundRect(ctx, sx + 118, sy - 72 + i * 34, 16, 24, 7); ctx.fill();
    ctx.fillStyle = "#38bdf8";
    roundRect(ctx, sx + 178, sy - 70 + i * 34, 12, 22, 6); ctx.fill();
  }
  const ntCount = Math.min(26, Math.round(estado.sinapsis.nt * 5));
  for (let i = 0; i < ntCount; i += 1) { ctx.fillStyle = estado.sinapsis.tipo.color; ctx.beginPath(); ctx.arc(sx + 125 + (i * 19) % 62, sy - 70 + (i * 31) % 140, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#e0f2fe"; ctx.font = "800 10px Inter, sans-serif"; ctx.fillText(estado.sinapsis.tipo.nt, sx + 130, sy - 105); ctx.fillText("zona activa / receptores / transportadores", sx - 18, sy + 104);
  ctx.restore();
}

function dibujarLeyenda(ctx, w, h, estado, uiMode) {
  const x = w - 210, y = 18; ctx.save(); ctx.fillStyle = "rgba(2,6,23,.72)"; ctx.strokeStyle = "rgba(125,211,252,.22)"; roundRect(ctx, x, y, 190, 190, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 13px Inter, sans-serif"; ctx.fillText("Leyenda", x + 16, y + 24);
  [["na","Ion de sodio"],["k","Ion de potasio"],["cl","Ion cloruro"],["ca","Ion calcio"]].forEach(([ion, txt], i) => { dibujarIon(ctx, x + 24, y + 48 + i * 27, ion, 1); ctx.fillStyle = "#cbd5e1"; ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(txt, x + 44, y + 52 + i * 27); });
  ctx.fillStyle = "#facc15"; ctx.fillText("Bomba Na/K + ATP", x + 16, y + 162); ctx.fillStyle = "#7dd3fc"; ctx.fillText(CAMERA_LABELS[uiMode.cameraMode || "membrana"], x + 16, y + 180);
  ctx.restore();
}

function dibujarFocoSeleccionado(ctx, geo, w, h, estado, uiMode) {
  const id = uiMode.focusedStructure;
  if (!id || id === "reposo") return;
  const canal = canalesModelo(estado).find((ch) => ch.id === id);
  let x = null, y = null, r = 36;
  if (canal) {
    const p = puntoEnArco(geo, canal.t);
    x = p.x; y = p.y; r = canal.id === "pump" ? 48 : 40;
  } else if (id === "membrana") {
    const p = puntoEnArco(geo, 0.5);
    x = p.x; y = p.y; r = 54;
  } else if (id === "axon") { x = w * 0.50; y = h * 0.70; r = 88; }
  else if (id === "terminal") { x = w * 0.72; y = h * 0.58; r = 118; }
  else if (id === "sinapsis") { x = w * 0.84; y = h * 0.58; r = 92; }
  else if (id === "postsinapsis") { x = w * 0.91; y = h * 0.58; r = 94; }
  else if (id === "leyenda") { x = w - 115; y = 110; r = 120; }
  else if (id === "extracelular") { x = w * 0.18; y = h * 0.18; r = 82; }
  else if (id === "intracelular") { x = w * 0.18; y = h * 0.78; r = 82; }
  if (x === null || y === null) return;
  ctx.save();
  ctx.strokeStyle = "rgba(34,211,238,.92)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(34,211,238,.7)";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
export function identificarZonaNeuroCanvas(canvas, estado, uiMode = {}, clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const xPantalla = clientX - rect.left;
  const yPantalla = clientY - rect.top;
  const cssW = Math.max(720, Math.round(rect.width || canvas.clientWidth || 1060));
  const cssH = Math.max(460, Math.round(rect.height || canvas.clientHeight || 560));
  const { x, y } = pantallaAMundo(xPantalla, yPantalla, cssW, cssH, uiMode);
  const geo = crearGeometria(cssW, cssH, uiMode.cameraMode || "membrana");
  const puntos = [];
  canalesModelo(estado).forEach((ch) => {
    const p = puntoEnArco(geo, ch.t);
    puntos.push({ id: ch.id, x: p.x, y: p.y, r: ch.id === "pump" ? 42 : 34 });
  });
  puntos.push({ id: "axon", x: cssW * 0.50, y: cssH * 0.70, r: 70 });
  puntos.push({ id: "terminal", x: cssW * 0.72, y: cssH * 0.58, r: 110 });
  puntos.push({ id: "sinapsis", x: cssW * 0.84, y: cssH * 0.58, r: 88 });
  puntos.push({ id: "postsinapsis", x: cssW * 0.91, y: cssH * 0.58, r: 88 });
  puntos.push({ id: "leyenda", x: cssW - 115, y: 110, r: 115 });
  const cercano = puntos
    .map((p) => ({ ...p, d: Math.hypot(x - p.x, y - p.y) }))
    .filter((p) => p.d <= p.r)
    .sort((a, b) => a.d - b.d)[0];
  if (cercano && ZONAS_NEURO_INFO[cercano.id]) return zonaInfo(cercano.id);
  const distanciaMembrana = Math.abs(Math.hypot(x - geo.cx, y - geo.cy) - (geo.rOuter - geo.thickness / 2));
  let angulo = Math.atan2(y - geo.cy, x - geo.cx);
  if (angulo < 0) angulo += Math.PI * 2;
  if (angulo >= geo.arcStart && angulo <= geo.arcEnd && distanciaMembrana < geo.thickness * 0.78) return zonaInfo("membrana");
  if (y < cssH * 0.48) return zonaInfo("extracelular");
  if (y > cssH * 0.54) return zonaInfo("intracelular");
  return null;
}

function actualizarOverlay(overlay, estado, uiMode) {
  if (!overlay) return;
  const info = estadoActualEducativo(estado, uiMode);
  const zoom = Math.round(camaraCanvas(uiMode).zoom * 100);
  overlay.innerHTML = `<div class="neuro-canvas-hud"><span>${CAMERA_LABELS[uiMode.cameraMode || "membrana"]} | zoom ${zoom}%</span><b>${info.fase}</b><em>Rueda = zoom | arrastrar = desplazar | doble clic = recentrar</em><em>Vm ${formato(estado.Vm,1)} mV | INa ${formato(estado.INa,1)} | IK ${formato(estado.IK,1)} | Ca ${formato(estado.sinapsis.caLocal,2)}</em></div>`;
}

function etiqueta(ctx, text, x, y, color) { ctx.fillStyle = color; ctx.font = "900 11px Inter, sans-serif"; ctx.letterSpacing = "2px"; ctx.fillText(text, x, y); }
function pseudo(n) { return Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }