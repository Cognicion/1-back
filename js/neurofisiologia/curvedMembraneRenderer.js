import { formato } from "./equationRegistry.js";
import { estadoActualEducativo } from "./learningModeController.js";

const ION_STYLE = {
  na: { label: "Na+", color: "#fb923c", shape: "circle", charge: 1 },
  k: { label: "K+", color: "#34d399", shape: "diamond", charge: 1 },
  cl: { label: "Cl-", color: "#a78bfa", shape: "circle", charge: -1 },
  ca: { label: "Ca2+", color: "#facc15", shape: "circle", charge: 2 },
  a: { label: "A-", color: "#94a3b8", shape: "hex", charge: -1 }
};


const NT_STYLE = {
  glutamato: { label: "Glu", color: "#38bdf8", shape: "triad", receptor: "AMPA/NMDA", transportador: "EAAT", enzima: "ciclo Glu-Gln" },
  gaba: { label: "GABA", color: "#a78bfa", shape: "capsule", receptor: "GABA-A/B", transportador: "GAT", enzima: "GABA-T" },
  dopamina: { label: "DA", color: "#f472b6", shape: "amine", receptor: "D1/D2", transportador: "DAT", enzima: "MAO/COMT" },
  serotonina: { label: "5HT", color: "#fb7185", shape: "amine", receptor: "5-HT", transportador: "SERT", enzima: "MAO" },
  noradrenalina: { label: "NA", color: "#34d399", shape: "amine", receptor: "alfa/beta", transportador: "NET", enzima: "MAO/COMT" }
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
  const vistaSinaptica = ["terminal", "sinapsis", "farmacologia"].includes(uiMode.cameraMode);
  if (!vistaSinaptica) {
    dibujarMembranaCurva(ctx, geo, estado);
    if (uiMode.showCharges !== false) dibujarCargas(ctx, geo, estado, uiMode);
    dibujarCanales(ctx, geo, estado, uiMode);
    dibujarBombaNaK(ctx, geo, estado);
    dibujarFlujos(ctx, geo, estado, uiMode);
  }
  dibujarIones(ctx, geo, estado, uiMode);
  if (["axon", "general"].includes(uiMode.cameraMode)) dibujarAxon(ctx, geo, estado);
  if (["terminal", "sinapsis", "general", "farmacologia"].includes(uiMode.cameraMode)) dibujarTerminalSinapsis(ctx, geo, estado, uiMode);
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
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a + Math.PI / 2);
    dibujarCanalConSubdominios(ctx, 0, 0, ch.label, ch.ion, ch.state, { escala: .92 });
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
  const s = ION_STYLE[ion];
  if (!s) return;
  dibujarParticulaBio(ctx, { x, y, tipo: "ion", label: s.label, color: s.color, shape: s.shape, alpha, carga: s.charge, radio: ion === "ca" ? 7 : 8 });
}

function dibujarNeurotransmisor(ctx, x, y, tipoId, alpha = 1, radio = 5.2) {
  const nt = NT_STYLE[tipoId] || NT_STYLE.glutamato;
  dibujarParticulaBio(ctx, { x, y, tipo: "nt", label: nt.label, color: nt.color, shape: nt.shape, alpha, radio });
}

function dibujarFarmacoMolecula(ctx, x, y, farmaco, alpha = 1) {
  const esAbuso = /abuso|cocaina|anfetamina|alcohol|opioide|cannabis/i.test(`${farmaco?.nombre || ""} ${farmaco?.clase || ""}`);
  dibujarParticulaBio(ctx, { x, y, tipo: esAbuso ? "droga" : "farmaco", label: esAbuso ? "Dx" : "Fx", color: esAbuso ? "#f472b6" : "#22d3ee", shape: "molecule", alpha, radio: 8.5 });
}

function dibujarParticulaBio(ctx, p) {
  const alpha = p.alpha ?? 1;
  const r = p.radio || 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.tipo === "ion" ? "rgba(2,6,23,.82)" : "rgba(224,242,254,.82)";
  ctx.lineWidth = p.tipo === "ion" ? 1.3 : 1.1;
  ctx.shadowColor = p.tipo === "ion" ? "transparent" : p.color;
  ctx.shadowBlur = p.tipo === "ion" ? 0 : 9;
  if (p.shape === "diamond") {
    ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
  } else if (p.shape === "hex") {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  } else if (p.shape === "capsule") {
    roundRect(ctx, p.x - r * 1.25, p.y - r * .65, r * 2.5, r * 1.3, r * .65);
  } else if (p.shape === "triad") {
    ctx.beginPath(); ctx.arc(p.x - r * .52, p.y + r * .22, r * .52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x + r * .52, p.y + r * .22, r * .52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y - r * .46, r * .52, 0, Math.PI * 2);
  } else if (p.shape === "amine" || p.shape === "molecule") {
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x + r * .86, p.y + r * .46, r * .48, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x - r * .72, p.y + r * .62, r * .42, 0, Math.PI * 2);
  } else {
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = p.tipo === "ion" ? "#020617" : "#f8fbff";
  ctx.font = p.tipo === "ion" ? "800 8px Inter, sans-serif" : "900 7px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.label, p.x, p.y);
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
  const sx = geo.w * .60;
  const sy = geo.h * .52;
  const postX = geo.w * .84;
  const hendiduraX = geo.w * .74;
  const hendiduraW = Math.max(70, postX - hendiduraX - 20);
  ctx.save();
  dibujarAxonPresinaptico(ctx, geo, sx, sy, estado);
  dibujarBotonPresinaptico(ctx, geo, sx, sy, estado);
  dibujarHendiduraSinaptica(ctx, geo, hendiduraX, sy, hendiduraW, estado);
  dibujarMembranaPostsinaptica(ctx, geo, postX, sy, estado);
  dibujarMoleculasFarmacoSinapticas(ctx, geo, hendiduraX, sy, hendiduraW, estado);
  ctx.restore();
}

function dibujarAxonPresinaptico(ctx, geo, sx, sy, estado) {
  const y = sy - 14;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(56,189,248,.22)";
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(geo.w * .16, y);
  ctx.bezierCurveTo(geo.w * .30, y - 20, geo.w * .43, y + 16, sx - 82, sy - 6);
  ctx.stroke();
  ctx.strokeStyle = "rgba(224,242,254,.28)";
  ctx.lineWidth = 52;
  for (let i = 0; i < 5; i += 1) {
    const x = geo.w * (.20 + i * .075);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + geo.w * .035, y + 2);
    ctx.stroke();
  }
  const xWave = geo.w * (.17 + .42 * Math.max(0, Math.min(1, estado.posicionOnda || 0)));
  ctx.fillStyle = "rgba(56,189,248,.34)";
  ctx.shadowColor = "rgba(56,189,248,.72)";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(xWave, y, 24, 0, Math.PI * 2);
  ctx.fill();
  etiqueta(ctx, "axon presinaptico", geo.w * .18, y - 48, "#bae6fd");
  ctx.restore();
}

function dibujarBotonPresinaptico(ctx, geo, sx, sy, estado) {
  ctx.save();
  const grad = ctx.createRadialGradient(sx - 40, sy - 38, 10, sx, sy, 132);
  grad.addColorStop(0, "rgba(125,211,252,.34)");
  grad.addColorStop(.55, "rgba(14,116,144,.34)");
  grad.addColorStop(1, "rgba(15,23,42,.88)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(125,211,252,.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 92, sy - 72);
  ctx.bezierCurveTo(sx - 28, sy - 118, sx + 86, sy - 92, sx + 94, sy - 10);
  ctx.bezierCurveTo(sx + 106, sy + 80, sx - 8, sy + 104, sx - 82, sy + 58);
  ctx.bezierCurveTo(sx - 132, sy + 26, sx - 136, sy - 34, sx - 92, sy - 72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  dibujarMitocondriasPresinapticas(ctx, sx, sy);
  dibujarMicrotubulosTerminal(ctx, sx, sy);
  dibujarVesiculasSinapticas(ctx, sx, sy, estado);
  dibujarZonaActiva(ctx, sx, sy, estado);
  etiqueta(ctx, "boton presinaptico", sx - 96, sy - 98, "#7dd3fc");
  ctx.restore();
}

function dibujarMitocondriasPresinapticas(ctx, sx, sy) {
  [[-50, -42], [24, -50], [-8, 36]].forEach(([dx, dy], i) => {
    ctx.save();
    ctx.translate(sx + dx, sy + dy);
    ctx.rotate(i ? -.35 : .28);
    ctx.fillStyle = "rgba(148,163,184,.58)";
    ctx.strokeStyle = "rgba(203,213,225,.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(15,23,42,.72)";
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.bezierCurveTo(-7, -8, 0, 8, 6, 0); ctx.bezierCurveTo(10, -6, 14, 4, 18, 0);
    ctx.stroke();
    ctx.restore();
  });
}

function dibujarMicrotubulosTerminal(ctx, sx, sy) {
  ctx.save();
  ctx.strokeStyle = "rgba(96,165,250,.22)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(sx - 86, sy - 45 + i * 24);
    ctx.bezierCurveTo(sx - 34, sy - 54 + i * 15, sx + 18, sy - 32 + i * 10, sx + 62, sy - 18 + i * 7);
    ctx.stroke();
  }
  ctx.restore();
}

function dibujarVesiculasSinapticas(ctx, sx, sy, estado) {
  const total = Math.min(38, Math.max(12, Math.round(estado.sinapsis.vesiculasVisuales || 18)));
  for (let i = 0; i < total; i += 1) {
    const a = i * 2.399;
    const r = 16 + (i % 6) * 12;
    const x = sx - 12 + Math.cos(a) * r;
    const y = sy - 6 + Math.sin(a) * r * .78;
    const lista = i < estado.sinapsis.vesiculasListas;
    const fusion = i < estado.sinapsis.vesiculasFusionadas;
    const radio = fusion ? 12 : 9;
    ctx.save();
    ctx.fillStyle = fusion ? "rgba(250,204,21,.42)" : lista ? "rgba(56,189,248,.28)" : "rgba(167,139,250,.22)";
    ctx.strokeStyle = fusion ? "rgba(250,204,21,.92)" : "rgba(224,242,254,.62)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(224,242,254,.22)";
    ctx.beginPath(); ctx.arc(x, y, radio - 3, 0, Math.PI * 2); ctx.stroke();
    for (let n = 0; n < 5; n += 1) {
      dibujarNeurotransmisor(ctx, x + Math.cos(n * 1.26 + i) * 3.5, y + Math.sin(n * 1.26 + i) * 3.5, estado.sinapsis.tipoId, lista ? .9 : .42, 2.5);
    }
    if (fusion) {
      ctx.strokeStyle = "rgba(250,204,21,.75)";
      ctx.beginPath(); ctx.moveTo(x + radio - 1, y + 4); ctx.lineTo(sx + 104, sy + 72); ctx.stroke();
    }
    ctx.restore();
  }
  etiqueta(ctx, `${estado.sinapsis.tipo.nt} en vesiculas`, sx - 92, sy + 112, NT_STYLE[estado.sinapsis.tipoId]?.color || "#7dd3fc");
}

function dibujarZonaActiva(ctx, sx, sy, estado) {
  ctx.save();
  const y = sy + 72;
  ctx.strokeStyle = "rgba(250,204,21,.88)";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(sx + 22, y); ctx.lineTo(sx + 96, y); ctx.stroke();
  etiqueta(ctx, "zona activa", sx + 22, y + 22, "#fef9c3");
  const caAbierto = estado.terminalActiva || estado.sinapsis.caLocal > .25;
  for (let i = 0; i < 4; i += 1) {
    dibujarCanalConSubdominios(ctx, sx + 28 + i * 18, y - 18, "CaV", "ca", caAbierto ? "abierto" : "cerrado", { escala: .72, vertical: true });
  }
  ctx.restore();
}

function dibujarHendiduraSinaptica(ctx, geo, x, sy, w, estado) {
  ctx.save();
  const top = sy - 86;
  const h = 194;
  ctx.fillStyle = "rgba(2,6,23,.25)";
  ctx.strokeStyle = "rgba(125,211,252,.24)";
  ctx.setLineDash([5, 7]);
  ctx.strokeRect(x, top, w, h);
  ctx.setLineDash([]);
  etiqueta(ctx, "hendidura sinaptica", x - 4, top - 12, "#bae6fd");
  dibujarNeurotransmisoresHendidura(ctx, x, top, w, h, estado);
  dibujarTransportadoresYEnzimas(ctx, x, sy, w, estado);
  ctx.restore();
}

function dibujarNeurotransmisoresHendidura(ctx, x, top, w, h, estado) {
  const s = estado.sinapsis;
  const ntCount = Math.min(46, Math.max(4, Math.round(s.nt * 7)));
  const recaptura = s.recapturaActual || s.recaptura * s.nt;
  const degradacion = s.degradacionActual || s.degradacion * s.nt;
  const receptor = s.ocupacion || 0;
  for (let i = 0; i < ntCount; i += 1) {
    const fase = (estado.relojVisual * .38 + i * .137) % 1;
    const baseY = top + 28 + ((i * 29) % Math.max(32, h - 56));
    const liberado = pseudo(i * 19 + 3) < Math.min(.85, s.liberacionNt + .18);
    const vaReceptor = pseudo(i * 31 + 5) < receptor;
    const vaRecaptura = !vaReceptor && pseudo(i * 43 + 7) < recaptura / Math.max(.2, recaptura + degradacion + .35);
    const vaEnzima = !vaReceptor && !vaRecaptura && pseudo(i * 47 + 11) < degradacion / Math.max(.2, recaptura + degradacion + .35);
    let px = x + 12 + fase * Math.max(26, w - 34);
    let py = baseY + Math.sin(fase * Math.PI * 2 + i) * 10;
    if (vaReceptor) {
      px = x + w - 12 - (1 - fase) * 30;
      py = top + h * (.28 + .44 * pseudo(i + 91));
    } else if (vaRecaptura) {
      px = x + 10 + Math.sin(fase * Math.PI) * 34;
      py = top + h - 30 - Math.cos(fase * Math.PI) * 18;
    } else if (vaEnzima) {
      px = x + w - 64 + Math.sin(fase * Math.PI * 2 + i) * 16;
      py = top + h - 28 + Math.cos(fase * Math.PI * 2 + i) * 11;
    } else if (liberado) {
      px = x + 8 + fase * Math.max(26, w - 28);
    }
    dibujarNeurotransmisor(ctx, px, py, s.tipoId, .72 + .24 * pseudo(i + 17), vaReceptor ? 6.2 : 4.8);
  }
}

function dibujarTransportadoresYEnzimas(ctx, x, sy, w, estado) {
  const yBase = sy + 74;
  const nt = NT_STYLE[estado.sinapsis.tipoId] || NT_STYLE.glutamato;
  const recaptura = Math.max(.2, Number(estado.sinapsis.recaptura || 0.55));
  for (let i = 0; i < 4; i += 1) {
    const tx = x + 8 + i * 20;
    ctx.fillStyle = "rgba(34,211,238,.28)";
    ctx.strokeStyle = "rgba(125,211,252,.68)";
    roundRect(ctx, tx, yBase - 16, 12, 26, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(2,6,23,.82)";
    ctx.fillRect(tx + 4, yBase - 13, 4, 20);
    if (i < Math.round(recaptura * 4)) {
      ctx.fillStyle = nt.color;
      ctx.beginPath(); ctx.moveTo(tx + 6, yBase - 24); ctx.lineTo(tx + 13, yBase - 12); ctx.lineTo(tx - 1, yBase - 12); ctx.fill();
    }
  }
  const degradacion = Math.max(.15, Number(estado.sinapsis.degradacion || 0.35));
  for (let i = 0; i < 4; i += 1) {
    const ex = x + w - 78 + i * 18;
    const ey = yBase - 5 + (i % 2) * 12;
    ctx.fillStyle = i < Math.round(degradacion * 4) ? "rgba(250,204,21,.78)" : "rgba(250,204,21,.26)";
    ctx.strokeStyle = "rgba(254,249,195,.62)";
    ctx.beginPath();
    for (let n = 0; n < 6; n += 1) {
      const a = Math.PI / 6 + n * Math.PI / 3;
      const px = ex + Math.cos(a) * 7;
      const py = ey + Math.sin(a) * 7;
      if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#020617"; ctx.font = "800 5.5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("E", ex, ey);
  }
  ctx.fillStyle = "#cbd5e1"; ctx.font = "800 9px Inter, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(`${nt.transportador} recaptura`, x + 4, yBase + 24);
  ctx.fillText(`${nt.enzima}`, x + w - 90, yBase + 24);
}

function dibujarMembranaPostsinaptica(ctx, geo, x, sy, estado) {
  ctx.save();
  const y = sy;
  ctx.fillStyle = "rgba(15,23,42,.88)";
  ctx.strokeStyle = "rgba(125,211,252,.36)";
  roundRect(ctx, x, y - 112, 96, 244, 28); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(34,211,238,.10)";
  roundRect(ctx, x + 16, y - 96, 64, 212, 22); ctx.fill();
  etiqueta(ctx, "neurona postsinaptica", x - 8, y - 132, "#7dd3fc");
  const tipo = estado.sinapsis.tipoId;
  const receptores = tipo === "gaba"
    ? [["GABA-A", "cl", "potenciado"], ["GABA-B", "k", "metabotropico"], ["GAT", "na", "transportador"]]
    : tipo === "dopamina"
      ? [["D1/D2", "na", "metabotropico"], ["DAT", "na", "transportador"], ["K+", "k", "modulado"]]
      : tipo === "serotonina"
        ? [["5-HT1A", "k", "metabotropico"], ["5-HT2A", "ca", "modulado"], ["SERT", "na", "transportador"]]
        : tipo === "noradrenalina"
          ? [["alfa-2", "k", "metabotropico"], ["beta", "ca", "modulado"], ["NET", "na", "transportador"]]
          : [["AMPA", "na", "abierto"], ["NMDA", "ca", estado.sinapsis.receptorOcupado > .4 ? "abierto" : "bloqueo Mg"], ["EAAT/mGluR", "k", "transportador"]];
  receptores.forEach(([label, ion, state], i) => {
    dibujarReceptorPostsinaptico(ctx, x + 6, y - 80 + i * 62, label, ion, state, estado);
  });
  const post = Number(estado.sinapsis.postPotencial || 0);
  ctx.fillStyle = post >= 0 ? "rgba(34,211,238,.22)" : "rgba(167,139,250,.22)";
  ctx.beginPath(); ctx.arc(x + 92, y + Math.max(-82, Math.min(82, -post * 3)), 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 10px Inter, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`${formato(post,1)} mV`, x + 48, y + 126);
  ctx.restore();
}

function dibujarCanalConSubdominios(ctx, x, y, label, ion, state, opts = {}) {
  const escala = opts.escala || 1;
  const w = 30 * escala;
  const h = 68 * escala;
  const color = ION_STYLE[ion]?.color || "#7dd3fc";
  ctx.save();
  ctx.translate(x, y);
  if (opts.vertical) ctx.rotate(0);
  ctx.fillStyle = state === "bloqueado" ? "#475569" : state === "abierto" || state === "potenciado" ? color : "#0f172a";
  ctx.strokeStyle = state === "inactivado" ? "#fb7185" : color;
  ctx.lineWidth = 2 * escala;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10 * escala); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(2,6,23,.76)";
  roundRect(ctx, -w * .18, -h * .34, w * .36, h * .68, 5 * escala); ctx.fill();
  ctx.fillStyle = "rgba(224,242,254,.92)";
  ctx.beginPath(); ctx.arc(-w * .22, -h * .22, 3.2 * escala, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * .22, h * .22, 3.2 * escala, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(224,242,254,.58)";
  ctx.beginPath(); ctx.moveTo(-w * .38, 0); ctx.lineTo(w * .38, 0); ctx.stroke();
  if (escala >= .85) {
    ctx.fillStyle = "rgba(224,242,254,.82)";
    ctx.font = "700 6.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("poro", 0, 2);
    ctx.fillText("sensor", -w * .42, -h * .34);
    ctx.fillText("compuerta", w * .34, h * .38);
  }
  if (/bloqueo|bloqueado|inactivado/i.test(state)) {
    ctx.strokeStyle = "#f43f5e"; ctx.beginPath(); ctx.moveTo(-w * .42, -h * .30); ctx.lineTo(w * .42, h * .30); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = "#e0f2fe"; ctx.font = `${Math.max(7, 9 * escala)}px Inter, sans-serif`; ctx.textAlign = "center";
  ctx.fillText(label, x, y + h / 2 + 12 * escala);
}

function dibujarReceptorPostsinaptico(ctx, x, y, label, ion, state, estado) {
  const color = ION_STYLE[ion]?.color || "#7dd3fc";
  ctx.save();
  ctx.translate(x + 30, y + 22);
  ctx.fillStyle = /transportador/i.test(state) ? "rgba(34,211,238,.42)" : /metabotropico/i.test(state) ? "rgba(167,139,250,.42)" : color;
  ctx.strokeStyle = color; ctx.lineWidth = 1.8;
  roundRect(ctx, -14, -25, 28, 50, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(2,6,23,.82)"; roundRect(ctx, -5, -17, 10, 34, 4); ctx.fill();
  ctx.fillStyle = "rgba(224,242,254,.95)";
  ctx.beginPath(); ctx.arc(-9, -16, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(9, -16, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(224,242,254,.55)";
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
  ctx.fillStyle = "rgba(224,242,254,.82)";
  ctx.font = "700 6.5px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(/metabotropico/i.test(state) ? "GPCR" : "poro", 0, 2);
  ctx.fillText("sitio", 0, -29);
  ctx.restore();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 10px Inter, sans-serif"; ctx.textAlign = "left";
  ctx.fillText(label, x + 48, y + 18);
  ctx.fillStyle = "#9fb1c8"; ctx.font = "800 8px Inter, sans-serif";
function dibujarMoleculasFarmacoSinapticas(ctx, geo, x, sy, w, estado) {
  const activos = estado.farmacos?.activos || [];
  if (!activos.length) return;
  activos.slice(0, 5).forEach((farmaco, i) => {
    const fase = (estado.relojVisual * .22 + i * .19) % 1;
    const px = x + 18 + fase * Math.max(24, w - 36);
    const py = sy - 60 + Math.sin(fase * Math.PI * 2 + i) * 48;
    dibujarFarmacoMolecula(ctx, px, py, farmaco, .92);
    ctx.fillStyle = "#f8fbff"; ctx.font = "900 8px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(/droga de abuso/i.test(farmaco.clase || "") ? "droga" : "farmaco", px, py - 14);
  });
}

function dibujarLeyenda(ctx, w, h, estado, uiMode) {
  const x = w - 210, y = 18; ctx.save(); ctx.fillStyle = "rgba(2,6,23,.72)"; ctx.strokeStyle = "rgba(125,211,252,.22)"; roundRect(ctx, x, y, 190, 240, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 13px Inter, sans-serif"; ctx.fillText("Leyenda", x + 16, y + 24);
  [["na","Ion de sodio"],["k","Ion de potasio"],["cl","Ion cloruro"],["ca","Ion calcio"]].forEach(([ion, txt], i) => { dibujarIon(ctx, x + 24, y + 48 + i * 27, ion, 1); ctx.fillStyle = "#cbd5e1"; ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(txt, x + 44, y + 52 + i * 27); });
  ctx.fillStyle = "#facc15"; ctx.fillText("Bomba Na/K + ATP", x + 16, y + 162); dibujarNeurotransmisor(ctx, x + 25, y + 181, estado.sinapsis?.tipoId || "glutamato", 1, 5); ctx.fillStyle = "#cbd5e1"; ctx.fillText("Neurotransmisor", x + 44, y + 184); ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(x + 23, y + 204, 6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + 31, y + 208, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#cbd5e1"; ctx.fillText("Farmaco / droga", x + 44, y + 208); ctx.fillStyle = "#7dd3fc"; ctx.fillText(CAMERA_LABELS[uiMode.cameraMode || "membrana"], x + 16, y + 228);
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
  else if (id === "terminal") { x = w * 0.60; y = h * 0.52; r = 124; }
  else if (id === "sinapsis") { x = w * 0.75; y = h * 0.52; r = 104; }
  else if (id === "postsinapsis") { x = w * 0.84; y = h * 0.52; r = 112; }
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
  puntos.push({ id: "terminal", x: cssW * 0.60, y: cssH * 0.52, r: 124 });
  puntos.push({ id: "sinapsis", x: cssW * 0.75, y: cssH * 0.52, r: 104 });
  puntos.push({ id: "postsinapsis", x: cssW * 0.84, y: cssH * 0.52, r: 112 });
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
