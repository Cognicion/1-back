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


const REGISTRO_PROTEINAS_MEMBRANA = {
  naV: { titulo: "Canal Nav", tipo: "canal voltaje-dependiente", proteina: "Nav", localizacion: "axon, segmento inicial y terminal", iones: ["na"], rechaza: ["k", "cl", "ca"], ecuacion: "INa = gNa*m^3*h*(Vm-ENa)", farmacos: ["fenitoina", "carbamazepina", "lamotrigina", "topiramato", "valproato"], funcion: "Entrada selectiva de Na+ durante despolarizacion." },
  kV: { titulo: "Canal Kv", tipo: "canal voltaje-dependiente", proteina: "Kv", localizacion: "axon y membrana", iones: ["k"], rechaza: ["na", "cl", "ca"], ecuacion: "IK = gK*n^4*(Vm-EK)", farmacos: ["bloqueador K+ experimental"], funcion: "Salida selectiva de K+ para repolarizacion." },
  kLeak: { titulo: "Canal de fuga de K+", tipo: "canal de fuga", proteina: "K2P/Kir simplificado", localizacion: "membrana neuronal", iones: ["k"], rechaza: ["na", "cl", "ca"], ecuacion: "IK_leak = gK_leak*(Vm-EK)", farmacos: [], funcion: "Permeabilidad basal a K+ que estabiliza el reposo." },
  naLeak: { titulo: "Canal de fuga de Na+", tipo: "canal de fuga", proteina: "NALCN simplificado", localizacion: "membrana neuronal", iones: ["na"], rechaza: ["k", "cl", "ca"], ecuacion: "INa_leak = gNa_leak*(Vm-ENa)", farmacos: [], funcion: "Entrada basal pequena de Na+ dentro del modelo educativo." },
  cl: { titulo: "Receptor/canal GABA-A", tipo: "canal activado por ligando", proteina: "GABA-A", localizacion: "postsinapsis inhibitoria", iones: ["cl"], rechaza: ["na", "k", "ca"], ecuacion: "ICl = gCl*(Vm-ECl)", farmacos: ["benzodiacepinas", "barbituricos", "antagonistas GABA-A"], funcion: "Conductancia de Cl- dependiente de GABA; tiende a estabilizar o hiperpolarizar." },
  caV: { titulo: "Canal Cav presinaptico", tipo: "canal voltaje-dependiente", proteina: "Cav2.x", localizacion: "zona activa presinaptica", iones: ["ca"], rechaza: ["na", "k", "cl"], ecuacion: "ICa = gCa*(Vm-ECa)", farmacos: ["pregabalina", "gabapentina", "bloqueadores Ca2+"], funcion: "Entrada local de Ca2+ que activa fusion vesicular." },
  pump: { titulo: "Na+/K+ ATPasa", tipo: "bomba ATPasa", proteina: "ATP1A/ATP1B", localizacion: "membrana neuronal", iones: ["na", "k"], rechaza: ["cl", "ca"], ecuacion: "3 Na+ salen / 2 K+ entran / ATP", farmacos: [], funcion: "Mantiene gradientes ionicos por transporte activo primario." },
  ampa: { titulo: "Receptor AMPA", tipo: "canal ionotropico", proteina: "GluA", localizacion: "postsinapsis glutamatergica", iones: ["na", "k"], rechaza: ["cl"], ecuacion: "IAMPA = gAMPA*(Vm-EAMPA)", farmacos: ["topiramato", "antagonistas AMPA"], funcion: "Respuesta excitadora rapida a glutamato." },
  nmda: { titulo: "Receptor NMDA", tipo: "canal ionotropico dependiente de voltaje/ligando", proteina: "GluN", localizacion: "postsinapsis glutamatergica", iones: ["na", "k", "ca"], rechaza: ["cl"], ecuacion: "INMDA = gNMDA*B(Vm)*(Vm-ENMDA)", farmacos: ["ketamina", "memantina"], funcion: "Entrada de Ca2+ y corriente excitadora modulada por bloqueo de Mg2+." },
  kainato: { titulo: "Receptor kainato", tipo: "canal ionotropico", proteina: "GluK", localizacion: "postsinapsis glutamatergica", iones: ["na", "k"], rechaza: ["cl"], ecuacion: "IKainato = gKainato*(Vm-Erev)", farmacos: [], funcion: "Componente excitador glutamatergico adicional." },
  gabaB: { titulo: "Receptor GABA-B", tipo: "GPCR", proteina: "GABBR", localizacion: "pre y postsinapsis", iones: ["k"], rechaza: ["na", "cl", "ca"], ecuacion: "modula GIRK y Cav", farmacos: ["agonistas GABA-B"], funcion: "Inhibicion lenta por aumento de K+ y menor entrada presinaptica de Ca2+." },
  alpha2delta: { titulo: "Subunidad alpha2delta", tipo: "subunidad auxiliar Cav", proteina: "CACNA2D", localizacion: "canal Cav presinaptico", iones: ["ca"], rechaza: ["na", "k", "cl"], ecuacion: "reduce gCa funcional y liberacion", farmacos: ["pregabalina", "gabapentina"], funcion: "Diana de pregabalina/gabapentina; no bloquea el poro de forma instantanea." },
  sv2a: { titulo: "SV2A", tipo: "proteina vesicular", proteina: "SV2A", localizacion: "vesicula sinaptica", iones: [], rechaza: [], ecuacion: "modula disponibilidad vesicular", farmacos: ["levetiracetam"], funcion: "Regula liberacion vesicular excesiva." },
  vmat2: { titulo: "VMAT2", tipo: "transportador vesicular", proteina: "SLC18A2", localizacion: "membrana de vesiculas de monoaminas", iones: [], rechaza: [], ecuacion: "monoamina/H+ antiporte", farmacos: ["anfetamina", "reserpina educativa"], funcion: "Carga dopamina, serotonina y noradrenalina dentro de vesiculas." },
  dat: { titulo: "DAT", tipo: "transportador de recaptura", proteina: "SLC6A3", localizacion: "presinapsis dopaminergica", iones: [], rechaza: [], ecuacion: "recaptura DA dependiente de Na+/Cl-", farmacos: ["cocaina", "metilfenidato", "anfetamina"], funcion: "Retira dopamina de la hendidura." },
  sert: { titulo: "SERT", tipo: "transportador de recaptura", proteina: "SLC6A4", localizacion: "presinapsis serotoninergica", iones: [], rechaza: [], ecuacion: "recaptura 5-HT dependiente de Na+/Cl-", farmacos: ["ISRS", "fluoxetina", "sertralina"], funcion: "Retira serotonina de la hendidura." },
  net: { titulo: "NET", tipo: "transportador de recaptura", proteina: "SLC6A2", localizacion: "presinapsis noradrenergica", iones: [], rechaza: [], ecuacion: "recaptura NA dependiente de Na+/Cl-", farmacos: ["triciclicos", "atomoxetina", "cocaina"], funcion: "Retira noradrenalina de la hendidura." },
  d2: { titulo: "Receptor D2", tipo: "GPCR Gi/o", proteina: "DRD2", localizacion: "postsinapsis/autorreceptor", iones: [], rechaza: [], ecuacion: "disminuye cAMP; modula K+/Ca2+", farmacos: ["haloperidol", "risperidona", "aripiprazol"], funcion: "Diana antipsicotica principal dentro del modelo educativo." },
  gabaA: { titulo: "Receptor GABA-A", tipo: "canal Cl- ionotropico", proteina: "GABA-A", localizacion: "postsinapsis", iones: ["cl"], rechaza: ["na", "k", "ca"], ecuacion: "ICl = gGABA*(Vm-ECl)", farmacos: ["benzodiacepinas", "barbituricos"], funcion: "Inhibicion rapida dependiente de GABA." },
  litio: { titulo: "Senalizacion por litio", tipo: "diana intracelular", proteina: "GSK3b/IP3 simplificado", localizacion: "citoplasma", iones: [], rechaza: [], ecuacion: "modulacion lenta de segundos mensajeros", farmacos: ["litio"], funcion: "No es bloqueo directo de canal; modula redes intracelulares lentamente." }
};

const RECEPTORES_POR_SINAPSIS = {
  glutamato: [["AMPA", "na", "abierto", "ampa"], ["NMDA", "ca", "bloqueo Mg", "nmda"], ["Kainato", "na", "ionotropico", "kainato"], ["mGluR", "k", "GPCR", "mGluR"]],
  gaba: [["GABA-A", "cl", "potenciado", "gabaA"], ["GABA-B", "k", "GPCR", "gabaB"], ["GAT", "na", "transportador", "gat"]],
  dopamina: [["D1", "na", "GPCR Gs", "d1"], ["D2", "k", "GPCR Gi", "d2"], ["D3/D4", "k", "GPCR", "d3"], ["DAT", "na", "transportador", "dat"]],
  serotonina: [["5-HT1A", "k", "GPCR Gi", "5ht1a"], ["5-HT2A", "ca", "GPCR Gq", "5ht2a"], ["5-HT2C", "ca", "GPCR", "5ht2c"], ["5-HT3", "na", "ionotropico", "5ht3"], ["SERT", "na", "transportador", "sert"]],
  noradrenalina: [["alpha-1", "ca", "GPCR Gq", "alpha1"], ["alpha-2", "k", "GPCR Gi", "alpha2"], ["beta-1", "ca", "GPCR Gs", "beta1"], ["beta-2", "ca", "GPCR Gs", "beta2"], ["NET", "na", "transportador", "net"]]
};

const RECEPTOR_EXTRA_INFO = {
  d1: { titulo: "Receptor D1", tipo: "GPCR Gs", proteina: "DRD1", farmacos: ["agonistas dopaminergicos"], funcion: "Facilita via cAMP/PKA de forma educativa." },
  d3: { titulo: "Receptores D3/D4", tipo: "GPCR Gi/o", proteina: "DRD3/DRD4", farmacos: ["antipsicoticos"], funcion: "Modulacion dopaminergica limbica y cortical simplificada." },
  "5ht1a": { titulo: "Receptor 5-HT1A", tipo: "GPCR Gi/o", proteina: "HTR1A", farmacos: ["buspirona", "ISRS indirectos"], funcion: "Autorreceptor/sitio postsinaptico serotoninergico." },
  "5ht2a": { titulo: "Receptor 5-HT2A", tipo: "GPCR Gq", proteina: "HTR2A", farmacos: ["antipsicoticos atipicos", "psicodelicos"], funcion: "Diana serotoninergica cortical relevante en neuropsicofarmacologia." },
  "5ht2c": { titulo: "Receptor 5-HT2C", tipo: "GPCR Gq", proteina: "HTR2C", farmacos: ["antipsicoticos", "agonistas 5-HT2C"], funcion: "Modula apetito, ansiedad y tono dopaminergico en modelo educativo." },
  "5ht3": { titulo: "Receptor 5-HT3", tipo: "canal ionotropico", proteina: "HTR3", farmacos: ["ondansetron"], funcion: "Canal cationico activado por serotonina." },
  alpha1: { titulo: "Receptor alpha-1", tipo: "GPCR Gq", proteina: "ADRA1", farmacos: ["prazosina", "antipsicoticos con bloqueo alpha"], funcion: "Excitabilidad noradrenergica postsinaptica." },
  alpha2: { titulo: "Receptor alpha-2", tipo: "GPCR Gi/o", proteina: "ADRA2", farmacos: ["clonidina", "guanfacina"], funcion: "Autorreceptor que reduce liberacion de noradrenalina." },
  beta1: { titulo: "Receptor beta-1", tipo: "GPCR Gs", proteina: "ADRB1", farmacos: ["betabloqueadores"], funcion: "Respuesta noradrenergica excitadora simplificada." },
  beta2: { titulo: "Receptor beta-2", tipo: "GPCR Gs", proteina: "ADRB2", farmacos: ["agonistas/bloqueadores beta"], funcion: "Modulacion adrenergica postsinaptica." },
  mGluR: { titulo: "Receptor mGluR", tipo: "GPCR glutamatergico", proteina: "GRM", farmacos: ["moduladores mGluR"], funcion: "Modulacion lenta de liberacion y excitabilidad." },
  gat: { titulo: "GAT", tipo: "transportador GABA", proteina: "SLC6A1", farmacos: ["tiagabina"], funcion: "Recaptura GABA dependiente de gradientes." },
  d4: { titulo: "Receptor D4", tipo: "GPCR Gi/o", proteina: "DRD4", farmacos: ["antipsicoticos"], funcion: "Diana dopaminergica cortical simplificada." },
  d5: { titulo: "Receptor D5", tipo: "GPCR Gs", proteina: "DRD5", farmacos: ["agonistas dopaminergicos"], funcion: "Subtipo D1-like representado para docencia." },
  muscarinicoM1: { titulo: "Receptor muscarinico M1", tipo: "GPCR Gq", proteina: "CHRM1", farmacos: ["anticolinergicos"], funcion: "Modulacion colinergica cognitiva y autonoma." },
  muscarinicoM2: { titulo: "Receptor muscarinico M2", tipo: "GPCR Gi", proteina: "CHRM2", farmacos: ["anticolinergicos"], funcion: "Autorreceptor colinergico simplificado." },
  muscarinicoM3: { titulo: "Receptor muscarinico M3", tipo: "GPCR Gq", proteina: "CHRM3", farmacos: ["anticolinergicos"], funcion: "Diana periferica importante para efectos adversos anticolinergicos." },
  muscarinicoM4: { titulo: "Receptor muscarinico M4", tipo: "GPCR Gi", proteina: "CHRM4", farmacos: ["moduladores muscarinicos"], funcion: "Modulacion estriatal y cortical educativa." },
  muscarinicoM5: { titulo: "Receptor muscarinico M5", tipo: "GPCR Gq", proteina: "CHRM5", farmacos: ["moduladores muscarinicos"], funcion: "Subtipo colinergico avanzado para mapa farmacologico." },
  nicotinico: { titulo: "Receptor nicotinico", tipo: "canal cationico", proteina: "nAChR", farmacos: ["nicotina", "vareniclina"], funcion: "Canal activado por acetilcolina/nicotina." },
  sigma: { titulo: "Receptor sigma", tipo: "diana moduladora", proteina: "sigma", farmacos: ["dextrometorfano educativo", "algunos antipsicoticos"], funcion: "Diana avanzada representada como modulador intracelular." },
  muOpioide: { titulo: "Receptor opioide mu", tipo: "GPCR Gi/o", proteina: "OPRM1", farmacos: ["opioides", "naloxona"], funcion: "Inhibe liberacion y modula vias de recompensa/dolor." },
  cb1: { titulo: "Receptor CB1", tipo: "GPCR Gi/o", proteina: "CNR1", farmacos: ["THC", "cannabinoides"], funcion: "Reduce liberacion presinaptica de neurotransmisores." }
};

const CAMERA_LABELS = {
  membrana: "Vista de membrana",
  axon: "Vista de axon",
  terminal: "Vista de terminal presinaptica",
  sinapsis: "Vista de sinapsis",
  general: "Vista general",
  farmacologia: "Vista farmacologica",
  matematica: "Vista matematica",
  modelo3d: "Modelo 3D fisico-quimico"
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
  if ((uiMode.cameraMode || "membrana") === "modelo3d") {
    renderizarModelo3DFisicoQuimico(ctx, cssW, cssH, estado, uiMode);
    actualizarOverlay3D(overlay, estado, uiMode);
    return;
  }
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
  const canales = [
    { id: "naV", t: 0.18, label: "Nav", state: fxs.bloqueoNa > .65 ? "bloqueado" : naOpen ? "abierto" : estado.canales.sodio === "Inactivado" ? "inactivado" : "cerrado", maxEventos: 9 },
    { id: "kLeak", t: 0.29, label: "K fuga", state: "abierto", maxEventos: 3 },
    { id: "naLeak", t: 0.39, label: "Na fuga", state: "abierto", maxEventos: 2 },
    { id: "kV", t: 0.50, label: "Kv", state: fxs.bloqueoK > .65 ? "bloqueado" : kOpen ? "abierto" : "cerrado", maxEventos: 7 },
    { id: "cl", t: 0.61, label: estado.sinapsis.tipoId === "gaba" ? "GABA-A" : "Cl", state: estado.sinapsis.tipoId === "gaba" && fxs.gaba > -.45 ? (fxs.gaba > .25 ? "potenciado" : "abierto") : "cerrado", maxEventos: 6 },
    { id: "caV", t: 0.72, label: "Cav", state: fxs.bloqueoCa > .75 ? "bloqueado" : caOpen ? "abierto" : "cerrado", maxEventos: 6 },
    { id: "pump", t: 0.84, label: "Na/K", state: "bomba", maxEventos: 5 }
  ];
  return canales.map((canal) => {
    const meta = REGISTRO_PROTEINAS_MEMBRANA[canal.id] || {};
    return { ...canal, ion: meta.iones?.[0] || "na", selectividad: meta.iones || [], rechaza: meta.rechaza || [], meta };
  });
}

function canalEstaFuncional(canal) {
  if (!canal) return false;
  if (canal.id === "pump") return true;
  return /abierto|potenciado|bomba/i.test(canal.state || "") && !/cerrado|inactivado|bloqueado/i.test(canal.state || "");
}

function canalPermiteIon(canal, ion) {
  if (!canalEstaFuncional(canal)) return false;
  return Array.isArray(canal.selectividad) && canal.selectividad.includes(ion);
}

function corrienteVisualPorCanal(flujo, canal) {
  if (!canalPermiteIon(canal, flujo.ion)) return 0;
  return Math.max(0, Math.min(canal.maxEventos || 6, Math.round(Math.abs(flujo.val) / (flujo.escala || 24))));
}

function farmacoActivo(estado, patron) {
  const activos = estado.farmacos?.activos || [];
  return activos.find((farmaco) => patron.test(`${farmaco.id || ""} ${farmaco.nombre || ""} ${farmaco.diana || ""} ${farmaco.clase || ""}`));
}

function tipoTransportadorMonoamina(tipoId) {
  if (tipoId === "dopamina") return "DAT";
  if (tipoId === "serotonina") return "SERT";
  if (tipoId === "noradrenalina") return "NET";
  if (tipoId === "gaba") return "GAT";
  return "EAAT";
}

function infoProteina(id, estado) {
  const base = REGISTRO_PROTEINAS_MEMBRANA[id] || RECEPTOR_EXTRA_INFO[id];
  if (!base) return null;
  const ion = base.iones?.length ? `Ion/NT: ${base.iones.map((i) => ION_STYLE[i]?.label || i).join(", ")}. ` : "";
  const rechaza = base.rechaza?.length ? `Rechaza: ${base.rechaza.map((i) => ION_STYLE[i]?.label || i).join(", ")}. ` : "";
  const farmacos = base.farmacos?.length ? `Farmacos/drogas: ${base.farmacos.join(", ")}. ` : "";
  return {
    titulo: base.titulo || id,
    detalle: `${base.tipo || "Diana"}. ${base.funcion || ""} ${ion}${rechaza}${farmacos}Ecuacion o variable: ${base.ecuacion || "modelo educativo simplificado"}. Estado actual: ${canalesModelo(estado).find((c) => c.id === id)?.state || "segun contexto sinaptico"}.`,
    camara: id === "caV" || id === "alpha2delta" || id === "sv2a" || id === "vmat2" ? "terminal" : "sinapsis"
  };
}

function zonaInfo(id, estado = null) {
  const base = ZONAS_NEURO_INFO[id] || {};
  const protein = estado ? infoProteina(id, estado) : null;
  return { ...base, ...(protein || {}), id, titulo: protein?.titulo || base.titulo || id, detalle: protein?.detalle || base.detalle || "Estructura del modelo educativo." };
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
  const densidadBase = ({ "muy-baja": 24, baja: 44, media: 74, alta: 108 })[uiMode.particleDensity || "baja"] || 44;
  const slow = ({ "muy-lenta": 0.045, lenta: 0.085, normal: 0.16 })[uiMode.particleSpeed || "lenta"] || 0.085;
  const t = estado.relojVisual * slow;
  const ratios = { na: [0.72, 0.12], k: [0.16, 0.70], cl: [0.42, 0.20], ca: [0.16, 0.03], a: [0.02, 0.34] };
  const actividad = actividadIonVisual(estado);
  Object.entries(ratios).forEach(([ion, [extraRatio, intraRatio]], ionIndex) => {
    if (uiMode.ionFilter && uiMode.ionFilter !== "todos" && uiMode.ionFilter !== ion) return;
    const base = ion === "ca" ? densidadBase * 0.18 : densidadBase * Math.max(extraRatio, intraRatio) / 1.55;
    const extraPorCorriente = ion === "k" ? Math.min(0.72, actividad.k) : ion === "na" ? Math.min(0.9, actividad.na) : ion === "ca" ? Math.min(0.7, actividad.ca) : 0.08;
    const total = Math.max(ion === "ca" ? 5 : 8, Math.floor(base * (0.72 + extraPorCorriente)));
    for (let i = 0; i < total; i += 1) {
      const extra = i / total < extraRatio / (extraRatio + intraRatio);
      const p = posicionIon(geo, i, ionIndex, t, extra);
      const alpha = ion === "k" ? 0.58 + 0.18 * pseudo(i + 73) : 0.70 + 0.22 * pseudo(i + ionIndex * 97);
      dibujarIon(ctx, p.x, p.y, ion, alpha);
    }
  });
}

function actividadIonVisual(estado) {
  return {
    na: Math.min(1, Math.abs(Number(estado.INa || 0)) / 260),
    k: Math.min(1, Math.abs(Number(estado.IK || 0)) / 320),
    ca: Math.min(1, Number(estado.sinapsis?.caLocal || 0) / 1.4),
    cl: 0.12
  };
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
    { ion: "na", val: -estado.INa, channel: "naV", escala: 28 },
    { ion: "k", val: estado.IK, channel: "kV", escala: 30 },
    { ion: "k", val: Math.max(2, Math.abs(estado.IK || 0) * .10), channel: "kLeak", escala: 18 },
    { ion: "na", val: Math.max(1.8, Math.abs(estado.INa || 0) * .035), channel: "naLeak", escala: 18 },
    { ion: "cl", val: estado.sinapsis.tipoId === "gaba" ? 6 + Math.max(0, estado.farmacos?.efectos?.gaba || 0) * 12 : 0, channel: "cl", escala: 12 },
    { ion: "ca", val: estado.sinapsis.caLocal * 24, channel: "caV", escala: 10 }
  ];
  const channels = Object.fromEntries(canalesModelo(estado).map((c) => [c.id, c]));
  flujos.forEach((f) => {
    const ch = channels[f.channel];
    const count = corrienteVisualPorCanal(f, ch);
    if (!count) return;
    const p = puntoEnArco(geo, ch.t);
    const n = normalEnArco(p.a);
    const inward = f.ion === "k" ? f.val < 0 : f.val > 0;
    const amplitud = f.ion === "k" ? 72 : f.ion === "cl" ? 68 : 96;
    const velocidadIon = f.ion === "k" ? 0.075 : f.ion === "ca" ? 0.10 : f.ion === "cl" ? 0.085 : 0.11;
    for (let i = 0; i < count; i += 1) {
      const phase = (estado.relojVisual * velocidadIon + i / Math.max(1, count)) % 1;
      const d = inward ? amplitud / 2 - phase * amplitud : -amplitud / 2 + phase * amplitud;
      const jitter = Math.sin(i * 1.7) * 2.4;
      dibujarIon(ctx, p.x + n.x * d + jitter, p.y + n.y * d + Math.cos(i) * 2.4, f.ion, 0.88);
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

function dibujarTerminalSinapsis(ctx, geo, estado, uiMode = {}) {
  dibujarSinapsisTipoLibro(ctx, geo, estado, uiMode);
}

function dibujarSinapsisTipoLibro(ctx, geo, estado, uiMode = {}) {
  const w = geo.w;
  const h = geo.h;
  const cx = w * 0.54;
  const terminalY = h * 0.28;
  const cleftY = h * 0.57;
  const postY = h * 0.78;
  const terminalW = Math.min(520, w * 0.58);
  const terminalH = Math.min(255, h * 0.44);
  const postW = Math.min(640, w * 0.68);
  const postH = Math.min(180, h * 0.28);
  ctx.save();
  dibujarAxonSuperiorLibro(ctx, cx, terminalY, terminalW, estado);
  dibujarTerminalLibro(ctx, cx, terminalY, terminalW, terminalH, estado);
  dibujarMembranaActivaLibro(ctx, cx, cleftY, terminalW, estado);
  dibujarHendiduraLibro(ctx, cx, cleftY, terminalW, postW, estado);
  dibujarPostsinapsisLibro(ctx, cx, postY, postW, postH, estado);
  dibujarEtiquetasSinapsisLibro(ctx, cx, terminalY, cleftY, postY, terminalW, postW, estado, uiMode);
  ctx.restore();
}

function dibujarAxonSuperiorLibro(ctx, cx, terminalY, terminalW, estado) {
  ctx.save();
  const top = terminalY - 250;
  const grad = ctx.createLinearGradient(cx, top, cx, terminalY - 80);
  grad.addColorStop(0, "rgba(125,211,252,.36)");
  grad.addColorStop(1, "rgba(56,189,248,.12)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(125,211,252,.44)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 72, top);
  ctx.bezierCurveTo(cx - 96, terminalY - 190, cx - 138, terminalY - 125, cx - terminalW * .36, terminalY - 70);
  ctx.lineTo(cx + terminalW * .36, terminalY - 70);
  ctx.bezierCurveTo(cx + 138, terminalY - 125, cx + 96, terminalY - 190, cx + 72, top);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  const avance = Math.max(0, Math.min(1, estado.posicionOnda || 0));
  const py = top + (terminalY - 92 - top) * avance;
  ctx.fillStyle = "rgba(250,204,21,.42)";
  ctx.shadowColor = "rgba(250,204,21,.72)";
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.moveTo(cx, py + 42);
  ctx.lineTo(cx - 20, py - 2);
  ctx.lineTo(cx + 20, py - 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function dibujarTerminalLibro(ctx, cx, cy, terminalW, terminalH, estado) {
  ctx.save();
  const left = cx - terminalW / 2;
  const top = cy - terminalH / 2;
  const grad = ctx.createRadialGradient(cx - 100, cy - 70, 20, cx, cy, terminalW * .58);
  grad.addColorStop(0, "rgba(254,240,180,.82)");
  grad.addColorStop(.55, "rgba(234,179,8,.34)");
  grad.addColorStop(1, "rgba(14,116,144,.28)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(125,211,252,.62)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(left + 64, top + 42);
  ctx.bezierCurveTo(left + 138, top - 14, left + terminalW - 120, top - 8, left + terminalW - 52, top + 54);
  ctx.bezierCurveTo(left + terminalW + 24, top + 140, left + terminalW - 44, top + terminalH - 16, cx + 86, top + terminalH - 2);
  ctx.bezierCurveTo(cx - 16, top + terminalH + 28, left - 24, top + terminalH - 34, left + 34, top + 90);
  ctx.bezierCurveTo(left + 40, top + 70, left + 42, top + 54, left + 64, top + 42);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  dibujarMosaicoFosfolipidoRecto(ctx, left + 70, top + terminalH - 25, terminalW - 140, 0, "abajo");
  dibujarMitocondriaLibro(ctx, cx - 122, cy - 36, .24);
  dibujarMitocondriaLibro(ctx, cx + 118, cy - 22, -.18);
  dibujarMicrotubulosLibro(ctx, cx, cy, terminalW);
  dibujarVesiculasLibro(ctx, cx, cy, terminalW, terminalH, estado);
  ctx.restore();
}

function dibujarMosaicoFosfolipidoRecto(ctx, x, y, ancho, rot = 0, orientacion = "abajo") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const dir = orientacion === "abajo" ? 1 : -1;
  ctx.strokeStyle = "rgba(2,6,23,.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= ancho; i += 13) {
    ctx.fillStyle = i % 26 ? "#7dd3fc" : "#38bdf8";
    ctx.beginPath(); ctx.arc(i, 0, 4.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(i, dir * 24, 4.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(i - 2, 4 * dir); ctx.lineTo(i - 5, 20 * dir); ctx.moveTo(i + 2, 4 * dir); ctx.lineTo(i + 5, 20 * dir); ctx.stroke();
    if (i % 65 === 0) { ctx.fillStyle = "rgba(250,204,21,.65)"; ctx.beginPath(); ctx.arc(i + 7, dir * 12, 3.2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function dibujarMitocondriaLibro(ctx, x, y, rot = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = "rgba(148,163,184,.72)";
  ctx.strokeStyle = "rgba(226,232,240,.82)";
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(51,65,85,.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-22, -2); ctx.bezierCurveTo(-14, -14, -4, 12, 6, -2); ctx.bezierCurveTo(14, -14, 20, 12, 26, -1);
  ctx.stroke();
  ctx.restore();
}

function dibujarMicrotubulosLibro(ctx, cx, cy, terminalW) {
  ctx.save();
  ctx.strokeStyle = "rgba(96,165,250,.26)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx - terminalW * .34, cy - 55 + i * 19);
    ctx.bezierCurveTo(cx - 100, cy - 72 + i * 12, cx + 28, cy - 28 + i * 6, cx + terminalW * .28, cy - 28 + i * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function dibujarVesiculasLibro(ctx, cx, cy, terminalW, terminalH, estado) {
  const total = Math.min(24, Math.max(10, Math.round(estado.sinapsis.vesiculasVisuales || 18)));
  const left = cx - terminalW / 2;
  const top = cy - terminalH / 2;
  const zonaActivaY = top + terminalH - 34;
  for (let i = 0; i < total; i += 1) {
    const fila = Math.floor(i / 6);
    const col = i % 6;
    const lista = i < estado.sinapsis.vesiculasListas;
    const fusion = i < estado.sinapsis.vesiculasFusionadas;
    const x = fusion ? cx - 92 + col * 42 : left + 105 + col * 56 + (fila % 2) * 18;
    const y = fusion ? zonaActivaY - 8 + Math.sin(i) * 4 : top + 72 + fila * 43 + Math.sin(i * 2.1) * 8;
    const r = fusion ? 18 : 16;
    ctx.save();
    ctx.fillStyle = fusion ? "rgba(250,204,21,.36)" : lista ? "rgba(125,211,252,.34)" : "rgba(125,211,252,.18)";
    ctx.strokeStyle = fusion ? "rgba(250,204,21,.9)" : "rgba(186,230,253,.75)";
    ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(224,242,254,.34)"; ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.stroke();
    for (let n = 0; n < 7; n += 1) dibujarNeurotransmisor(ctx, x + Math.cos(n * .9 + i) * 6, y + Math.sin(n * .9 + i) * 6, estado.sinapsis.tipoId, .88, 3.2);
    if (["dopamina", "serotonina", "noradrenalina"].includes(estado.sinapsis.tipoId) && i % 4 === 0) {
      ctx.fillStyle = "#e0f2fe"; ctx.font = "800 5.8px Inter, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("VMAT2", x, y - r - 3);
    }
    if (farmacoActivo(estado, /levetiracetam|sv2a/i) && i % 5 === 1) {
      ctx.strokeStyle = "#f472b6"; ctx.strokeRect(x - r - 2, y - r - 2, (r + 2) * 2, (r + 2) * 2);
      ctx.fillStyle = "#fbcfe8"; ctx.font = "800 5.8px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SV2A", x, y + r + 8);
    }
    ctx.restore();
  }
}

function dibujarMembranaActivaLibro(ctx, cx, cleftY, terminalW, estado) {
  const activeX = cx - terminalW * .18;
  const activeW = terminalW * .36;
  ctx.save();
  ctx.strokeStyle = "rgba(250,204,21,.9)";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(activeX, cleftY - 52); ctx.lineTo(activeX + activeW, cleftY - 52); ctx.stroke();
  ctx.fillStyle = "rgba(250,204,21,.18)";
  roundRect(ctx, activeX - 6, cleftY - 74, activeW + 12, 34, 16); ctx.fill();
  const caAbierto = estado.terminalActiva || estado.sinapsis.caLocal > .25;
  const gabapentinoide = farmacoActivo(estado, /pregabalina|gabapentina|alpha2delta/i);
  for (let i = 0; i < 5; i += 1) {
    const cxCanal = activeX + 22 + i * (activeW - 44) / 4;
    dibujarCanalConSubdominios(ctx, cxCanal, cleftY - 58, "CaV", "ca", caAbierto ? "abierto" : "cerrado", { escala: .68, vertical: true });
    dibujarSubunidadAlpha2Delta(ctx, cxCanal + 13, cleftY - 62, gabapentinoide);
  }
  if (gabapentinoide) dibujarAccionFarmaco(ctx, activeX + activeW + 24, cleftY - 92, activeX + activeW - 8, cleftY - 62, gabapentinoide.nombre || "Pregabalina", "alpha2delta");
  const fase = (estado.relojVisual * .18) % 1;
  for (let i = 0; i < 18; i += 1) {
    const t = (fase + i / 18) % 1;
    dibujarIon(ctx, activeX + 18 + (i % 5) * 34, cleftY + 42 - t * 98, "ca", .72);
  }
  ctx.restore();
}

function dibujarHendiduraLibro(ctx, cx, cleftY, terminalW, postW, estado) {
  const cleftX = cx - postW * .36;
  const cleftW = postW * .72;
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,.20)";
  ctx.strokeStyle = "rgba(125,211,252,.22)";
  ctx.setLineDash([6, 8]);
  roundRect(ctx, cleftX, cleftY - 44, cleftW, 82, 20); ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  const ntCount = Math.min(44, Math.max(6, Math.round(estado.sinapsis.nt * 8 + estado.sinapsis.liberacionNt * 18)));
  for (let i = 0; i < ntCount; i += 1) {
    const phase = (estado.relojVisual * .16 + i * .061) % 1;
    const px = cleftX + 34 + ((i * 47 + phase * 130) % Math.max(90, cleftW - 68));
    const py = cleftY - 30 + phase * 64 + Math.sin(i + phase * Math.PI * 2) * 5;
    dibujarNeurotransmisor(ctx, px, py, estado.sinapsis.tipoId, .72 + .24 * pseudo(i), 5.3);
  }
  dibujarTransportadoresEnzimasLibro(ctx, cx, cleftY, postW, estado);
  ctx.restore();
}

function dibujarTransportadoresEnzimasLibro(ctx, cx, cleftY, postW, estado) {
  const nt = NT_STYLE[estado.sinapsis.tipoId] || NT_STYLE.glutamato;
  const left = cx - postW * .31;
  ctx.save();
  for (let i = 0; i < 4; i += 1) {
    const x = left + i * 42;
    ctx.fillStyle = "rgba(34,211,238,.32)";
    ctx.strokeStyle = "rgba(125,211,252,.72)";
    roundRect(ctx, x, cleftY + 26, 18, 34, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e0f2fe"; ctx.font = "700 6px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(nt.transportador, x + 9, cleftY + 72);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = cx + postW * .18 + i * 25;
    const y = cleftY + 8 + (i % 2) * 20;
    ctx.fillStyle = "rgba(250,204,21,.72)";
    ctx.strokeStyle = "rgba(254,249,195,.72)";
    ctx.beginPath();
    for (let n = 0; n < 6; n += 1) {
      const a = Math.PI / 6 + n * Math.PI / 3;
      const px = x + Math.cos(a) * 8;
      const py = y + Math.sin(a) * 8;
      if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "#cbd5e1"; ctx.font = "800 9px Inter, sans-serif"; ctx.textAlign = "left";
  ctx.fillText("recaptura", left, cleftY + 88);
  ctx.fillText(`enzimas ${nt.enzima}`, cx + postW * .18, cleftY + 58);
  ctx.restore();
}

function receptoresParaSinapsis(tipo, estado) {
  const base = RECEPTORES_POR_SINAPSIS[tipo] || RECEPTORES_POR_SINAPSIS.glutamato;
  return base.map(([label, ion, state, id]) => [label, ion, label === "NMDA" ? (estado.sinapsis.receptorOcupado > .4 ? "abierto" : "bloqueo Mg") : state, id]);
}

function dibujarPostsinapsisLibro(ctx, cx, cy, postW, postH, estado) {
  const left = cx - postW / 2;
  const top = cy - postH / 2;
  ctx.save();
  const grad = ctx.createLinearGradient(cx, top, cx, top + postH);
  grad.addColorStop(0, "rgba(254,240,180,.68)");
  grad.addColorStop(1, "rgba(234,179,8,.25)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(125,211,252,.56)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(left + 48, top + 34);
  ctx.bezierCurveTo(left + 135, top - 18, left + postW - 140, top - 20, left + postW - 48, top + 32);
  ctx.bezierCurveTo(left + postW + 18, top + 92, left + postW - 56, top + postH + 10, cx + 70, top + postH - 4);
  ctx.bezierCurveTo(cx - 110, top + postH + 22, left - 24, top + 120, left + 48, top + 34);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  dibujarMosaicoFosfolipidoRecto(ctx, left + 100, top + 24, postW - 200, 0, "arriba");
  const tipo = estado.sinapsis.tipoId;
  const receptores = receptoresParaSinapsis(tipo, estado).slice(0, 5);
  receptores.forEach(([label, ion, state], i) => {
    dibujarReceptorPostsinaptico(ctx, cx - 185 + i * 92, top + 4, label, ion, state, estado);
  });
  const post = Number(estado.sinapsis.postPotencial || 0);
  ctx.fillStyle = post >= 0 ? "rgba(34,211,238,.22)" : "rgba(167,139,250,.22)";
  roundRect(ctx, cx - 70, top + 72, 140, 38, 18); ctx.fill();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 11px Inter, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`respuesta postsinaptica ${formato(post,1)} mV`, cx, top + 96);
  ctx.restore();
}

function dibujarEtiquetasSinapsisLibro(ctx, cx, terminalY, cleftY, postY, terminalW, postW, estado, uiMode) {
  const nivel = uiMode.learningLevel || "basico";
  if (nivel === "basico" || uiMode.labelMode === "none") {
    dibujarEtiquetaGuia(ctx, "neurona presinaptica", cx - terminalW * .62, terminalY - 165, cx - terminalW * .22, terminalY - 78, "#e0f2fe");
    dibujarEtiquetaGuia(ctx, "vesicula sinaptica", cx - terminalW * .68, terminalY - 40, cx - 90, terminalY - 10, "#bae6fd");
    dibujarEtiquetaGuia(ctx, "Ca2+ entra", cx - terminalW * .65, cleftY - 8, cx - 80, cleftY - 56, "#fef08a");
    dibujarEtiquetaGuia(ctx, "neurotransmisor", cx + postW * .26, cleftY - 12, cx + 70, cleftY, "#fef9c3");
    dibujarEtiquetaGuia(ctx, "neurona postsinaptica", cx - postW * .56, postY + 56, cx - postW * .18, postY - 48, "#e0f2fe");
    return;
  }
  dibujarEtiquetaGuia(ctx, "potencial de accion", cx - terminalW * .68, terminalY - 190, cx, terminalY - 138, "#fef08a");
  dibujarEtiquetaGuia(ctx, "mitocondria", cx + terminalW * .34, terminalY - 70, cx + 118, terminalY - 24, "#cbd5e1");
  dibujarEtiquetaGuia(ctx, "zona activa / SNARE", cx - terminalW * .58, cleftY - 64, cx - 35, cleftY - 52, "#facc15");
  dibujarEtiquetaGuia(ctx, "hendidura sinaptica", cx + postW * .32, cleftY + 52, cx + postW * .18, cleftY + 18, "#bae6fd");
  dibujarEtiquetaGuia(ctx, "receptores postsinapticos", cx + postW * .38, postY - 70, cx + 110, postY - 68, "#7dd3fc");
  dibujarEtiquetaGuia(ctx, "recaptura / degradacion", cx - postW * .52, cleftY + 86, cx - 150, cleftY + 52, "#cbd5e1");
}

function dibujarEtiquetaGuia(ctx, text, x, y, tx, ty, color) {
  ctx.save();
  ctx.strokeStyle = "rgba(226,232,240,.58)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "900 12px Inter, sans-serif";
  ctx.textAlign = x < tx ? "right" : "left";
  ctx.fillText(text, x, y - 5);
  ctx.fillStyle = "rgba(226,232,240,.9)";
  ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}


function crearCamara3D(w, h, uiMode = {}) {
  const zoom = Math.max(0.55, Math.min(3.4, Number(uiMode.cameraZoom || 1)));
  return { w, h, cx: w / 2 + Number(uiMode.cameraPanX || 0), cy: h / 2 + Number(uiMode.cameraPanY || 0), yaw: Number(uiMode.orbitYaw || -0.55), pitch: Number(uiMode.orbitPitch || 0.28), escala: Math.min(w, h) * 0.78 * zoom, perspectiva: 3.6 };
}

function proyectar3D(p, cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const f = cam.perspectiva / (cam.perspectiva + z2 + 2.1);
  return { x: cam.cx + x1 * cam.escala * f, y: cam.cy + y1 * cam.escala * f, z: z2, f };
}

function colorConAlpha(color, alpha) {
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function esfera3D(ctx, cam, p, r, color, etiqueta = "", alpha = 1) {
  const q = proyectar3D(p, cam);
  const rr = Math.max(2, r * cam.escala * q.f);
  const grad = ctx.createRadialGradient(q.x - rr * .35, q.y - rr * .35, 1, q.x, q.y, rr);
  grad.addColorStop(0, colorConAlpha("#ffffff", Math.min(.9, alpha)));
  grad.addColorStop(.32, colorConAlpha(color, alpha));
  grad.addColorStop(1, colorConAlpha("#020617", Math.max(.2, alpha * .78)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(q.x, q.y, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colorConAlpha(color, .75);
  ctx.lineWidth = Math.max(1, rr * .08);
  ctx.stroke();
  if (etiqueta && rr > 7) {
    ctx.fillStyle = "#eaf6ff";
    ctx.font = `900 ${Math.max(8, rr * .62)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(etiqueta, q.x, q.y);
  }
  ctx.restore();
  return q;
}

function linea3D(ctx, cam, a, b, color, width = 2, alpha = 1) {
  const pa = proyectar3D(a, cam);
  const pb = proyectar3D(b, cam);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * (pa.f + pb.f) * .5);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  ctx.restore();
}

function tubo3D(ctx, cam, puntos, color, width = .045, alpha = 1) {
  for (let i = 1; i < puntos.length; i += 1) linea3D(ctx, cam, puntos[i - 1], puntos[i], color, width * 80, alpha);
}

function etiqueta3D(ctx, cam, p, texto, color = "#bae6fd") {
  const q = proyectar3D(p, cam);
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,.72)";
  ctx.strokeStyle = "rgba(125,211,252,.22)";
  const ancho = Math.max(92, texto.length * 7.2);
  roundRect(ctx, q.x + 8, q.y - 18, ancho, 28, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "800 11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, q.x + 18, q.y - 4);
  ctx.restore();
}

function renderizarModelo3DFisicoQuimico(ctx, w, h, estado, uiMode = {}) {
  const cam = crearCamara3D(w, h, uiMode);
  const nivel = uiMode.learningLevel || "basico";
  const nt = NT_STYLE[estado.sinapsis.tipoId] || NT_STYLE.glutamato;
  const vmNorm = Math.max(0, Math.min(1, (estado.Vm + 80) / 120));
  const naFlux = Math.min(1.4, Math.abs(estado.INa || 0) / 260);
  const kFlux = Math.min(0.95, Math.abs(estado.IK || 0) / 360);
  const caFlux = Math.min(1.4, Number(estado.sinapsis.caLocal || 0) / 1.2);
  const mielina = Boolean(estado.axon.mielina);
  const diametro = Math.max(.18, Math.min(1.35, Number(estado.axon.diametroUm || 2) / 5));
  const objetos = [];
  const add = (z, fn) => objetos.push({ z, fn });

  ctx.save();
  const halo = ctx.createRadialGradient(w * .5, h * .45, 20, w * .5, h * .45, Math.max(w, h) * .65);
  halo.addColorStop(0, "rgba(34,211,238,.13)");
  halo.addColorStop(.45, "rgba(59,130,246,.05)");
  halo.addColorStop(1, "rgba(2,6,23,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const somaCentro = { x: -1.0, y: -.12, z: 0 };
  for (let i = 0; i < 9; i += 1) {
    const ang = -2.45 + i * .55;
    const base = { x: somaCentro.x + Math.cos(ang) * .22, y: somaCentro.y + Math.sin(ang) * .18, z: Math.sin(i * .9) * .18 };
    const medio = { x: base.x + Math.cos(ang) * .34, y: base.y + Math.sin(ang) * .26 + Math.sin(i) * .05, z: base.z + Math.cos(i) * .12 };
    const end = { x: medio.x + Math.cos(ang + .15) * (.38 + (i % 3) * .08), y: medio.y + Math.sin(ang) * .30, z: medio.z + Math.sin(ang) * .18 };
    add(base.z, () => tubo3D(ctx, cam, [base, medio, end], "rgba(56,189,248,.46)", .030, .82));
    const rama = { x: medio.x + Math.cos(ang + .75) * .18, y: medio.y + Math.sin(ang + .75) * .14, z: medio.z + .10 };
    add(rama.z, () => tubo3D(ctx, cam, [medio, rama], "rgba(125,211,252,.36)", .018, .62));
    for (let s = 0; s < 3; s += 1) {
      const sp = { x: base.x + (end.x - base.x) * (.32 + s * .18), y: base.y + (end.y - base.y) * (.32 + s * .18) - .025, z: base.z + (end.z - base.z) * (.32 + s * .18) + .025 };
      add(sp.z + .02, () => esfera3D(ctx, cam, sp, .014, "#bae6fd", "", .62));
    }
  }

  add(0, () => {
    esfera3D(ctx, cam, { x: -1.03, y: -.11, z: -.03 }, .28, "#0ea5e9", "", .86);
    esfera3D(ctx, cam, { x: -.93, y: -.14, z: .08 }, .20, "#0284c7", "Vm", .74);
    esfera3D(ctx, cam, { x: -1.03, y: -.12, z: .06 }, .105, vmNorm > .55 ? "#facc15" : "#38bdf8", `${formato(estado.Vm,0)}`, .92);
    esfera3D(ctx, cam, { x: -1.08, y: -.12, z: .08 }, .055, "#c084fc", "N", .84);
  });

  const axonPts = [];
  for (let i = 0; i <= 24; i += 1) axonPts.push({ x: -0.76 + i * .07, y: -.08 + Math.sin(i * .34) * .025, z: Math.sin(i * .22) * .05 });
  add(.06, () => tubo3D(ctx, cam, [{ x: -.88, y: -.10, z: 0 }, { x: -.78, y: -.09, z: .02 }, axonPts[0]], "rgba(45,212,191,.62)", .075, .9));
  add(.05, () => tubo3D(ctx, cam, axonPts, "rgba(125,211,252,.68)", .042 + diametro * .03, .92));
  for (let i = 2; i < 22; i += 4) {
    const p1 = axonPts[i];
    const p2 = axonPts[Math.min(i + 2, axonPts.length - 1)];
    if (mielina) add((p1.z + p2.z) / 2 + .03, () => tubo3D(ctx, cam, [p1, p2], "rgba(234,179,8,.78)", .083 + diametro * .024, .82));
    const nodo = axonPts[Math.min(i + 3, axonPts.length - 1)];
    add(nodo.z + .08, () => esfera3D(ctx, cam, { x: nodo.x, y: nodo.y - .085, z: nodo.z + .03 }, .026, "#fb923c", "Na", .86));
    if (mielina) add(nodo.z + .04, () => etiqueta3D(ctx, cam, { x: nodo.x, y: nodo.y + .08, z: nodo.z }, "nodo", "#fde68a"));
  }
  if (estado.posicionOnda > 0) {
    const idx = Math.min(axonPts.length - 1, Math.max(0, Math.round(estado.posicionOnda * (axonPts.length - 1))));
    const p = axonPts[idx];
    add(1.2, () => esfera3D(ctx, cam, { x: p.x, y: p.y - .12, z: p.z }, .07, "#22d3ee", "AP", .95));
  }

  const terminal = { x: 1.05, y: -.06, z: 0 };
  add(.16, () => tubo3D(ctx, cam, [axonPts[axonPts.length - 1], { x: .92, y: -.08, z: 0 }, terminal], "rgba(125,211,252,.48)", .036, .8));
  [[.13,-.13,.16],[.16,.02,-.12],[.08,.15,.1]].forEach(([dx, dy, dz], idx) => {
    const rama = { x: terminal.x + dx, y: terminal.y + dy, z: terminal.z + dz };
    add(rama.z, () => tubo3D(ctx, cam, [terminal, rama], "rgba(45,212,191,.55)", .026, .72));
    add(rama.z + .04, () => esfera3D(ctx, cam, rama, .068, "#0f766e", idx === 0 ? "boton" : "", .82));
  });
  add(.2, () => esfera3D(ctx, cam, terminal, .22, "#0f766e", "", .84));
  for (let i = 0; i < 5; i += 1) {
    const p = { x: .92 + (i % 3) * .12, y: -.17 + Math.floor(i / 3) * .15, z: -.18 + i * .09 };
    add(p.z, () => esfera3D(ctx, cam, p, .055, "#94a3b8", "", .78));
    add(p.z + .01, () => tubo3D(ctx, cam, [{ x: p.x - .025, y: p.y, z: p.z }, { x: p.x + .025, y: p.y, z: p.z }], "#64748b", .012, .9));
  }
  const vesiculas = Math.min(16, Math.max(6, Math.round(estado.sinapsis.vesiculasVisuales || 10)));
  for (let i = 0; i < vesiculas; i += 1) {
    const ready = i < estado.sinapsis.vesiculasListas;
    const ang = i * 2.399;
    const p = { x: .94 + Math.cos(ang) * (.09 + (i % 4) * .018), y: -.08 + Math.sin(ang) * .13, z: Math.sin(ang * .7) * .18 };
    add(p.z, () => {
      esfera3D(ctx, cam, p, ready ? .05 : .043, ready ? "#7dd3fc" : "#64748b", "", ready ? .92 : .66);
      esfera3D(ctx, cam, { x: p.x, y: p.y, z: p.z + .012 }, .012, nt.color, nt.label, .95);
    });
  }

  const cleftY = .32;
  for (let i = 0; i < 9; i += 1) {
    const px = .82 + i * .055;
    add(.16 + i * .01, () => linea3D(ctx, cam, { x: px, y: .08, z: -.1 }, { x: px, y: .22 + caFlux * .09, z: -.1 }, "#facc15", 2 + caFlux * 2, .72));
  }
  const ntCount = Math.min(26, Math.max(4, Math.round(estado.sinapsis.nt * 5 + caFlux * 7)));
  for (let i = 0; i < ntCount; i += 1) {
    const p = { x: .72 + (i % 9) * .065, y: .19 + (i % 5) * .035 + caFlux * .02, z: -.18 + ((i * 37) % 100) / 280 };
    add(p.z, () => esfera3D(ctx, cam, p, .022, nt.color, nt.label, .9));
  }

  const postPts = [];
  for (let i = 0; i <= 18; i += 1) postPts.push({ x: .55 + i * .055, y: cleftY + Math.sin(i * .6) * .022, z: .05 * Math.cos(i * .5) });
  add(.02, () => tubo3D(ctx, cam, postPts, "rgba(45,212,191,.76)", .065, .88));
  for (let i = 2; i < 17; i += 3) {
    const p = postPts[i];
    add(p.z + .05, () => esfera3D(ctx, cam, { x: p.x, y: p.y - .065, z: p.z + .02 }, .044, estado.sinapsis.tipoId === "gaba" ? "#a78bfa" : "#22d3ee", estado.sinapsis.tipo.receptor.split("/")[0], .86));
  }
  for (let i = 0; i < 8; i += 1) {
    const p = { x: .62 + i * .07, y: .45 + Math.sin(i) * .04, z: -.16 + i * .045 };
    add(p.z, () => esfera3D(ctx, cam, p, .018, estado.sinapsis.tipoId === "gaba" ? "#a78bfa" : "#fb923c", estado.sinapsis.tipoId === "gaba" ? "Cl" : "Na", .78));
  }

  const fluxes = [
    { ion: "na", fuerza: naFlux, from: { x: -.16, y: -.52, z: -.32 }, to: { x: -.16, y: -.28, z: -.12 } },
    { ion: "k", fuerza: kFlux, from: { x: -.38, y: -.18, z: .18 }, to: { x: -.38, y: -.42, z: .34 } },
    { ion: "ca", fuerza: caFlux, from: { x: .92, y: -.36, z: -.16 }, to: { x: .92, y: -.12, z: -.03 } }
  ];
  fluxes.forEach((f) => {
    if (uiMode.ionFilter && uiMode.ionFilter !== "todos" && uiMode.ionFilter !== f.ion) return;
    const s = ION_STYLE[f.ion];
    const n = Math.max(2, Math.round((f.ion === "k" ? 2.5 : 4) + f.fuerza * (f.ion === "k" ? 4 : 8)));
    for (let i = 0; i < n; i += 1) {
      const tt = ((estado.relojVisual * (f.ion === "k" ? .045 : .12) + i / n) % 1);
      const p = { x: f.from.x + (f.to.x - f.from.x) * tt, y: f.from.y + (f.to.y - f.from.y) * tt, z: f.from.z + (f.to.z - f.from.z) * tt };
      add(p.z + .2, () => esfera3D(ctx, cam, p, .025 + f.fuerza * .006, s.color, s.label, .88));
    }
  });

  (estado.farmacos?.activos || []).slice(0, 5).forEach((farmaco, i) => {
    const p = { x: .58 + i * .12, y: .1 + Math.sin(i) * .08, z: .32 - i * .08 };
    add(p.z + .4, () => { esfera3D(ctx, cam, p, .038, "#f472b6", "Dx", .9); etiqueta3D(ctx, cam, { x: p.x + .05, y: p.y - .06, z: p.z }, `${farmaco.nombre || "farmaco"} -> ${(farmaco.dianas || farmaco.diana || "diana")}`, "#f9a8d4"); });
  });

  objetos.sort((a, b) => a.z - b.z).forEach((o) => o.fn());
  if (uiMode.labelMode !== "none") {
    etiqueta3D(ctx, cam, { x: -1.25, y: -.46, z: .05 }, "dendritas / soma", "#7dd3fc");
    etiqueta3D(ctx, cam, { x: -.05, y: -.23, z: .05 }, mielina ? "axon mielinizado" : "axon amielinico", "#fde68a");
    etiqueta3D(ctx, cam, { x: .9, y: -.36, z: .15 }, "terminal presinaptica", "#99f6e4");
    etiqueta3D(ctx, cam, { x: .85, y: .22, z: .22 }, "hendidura sinaptica", "#e9d5ff");
    etiqueta3D(ctx, cam, { x: .73, y: .52, z: .05 }, "membrana postsinaptica", "#bae6fd");
    if (nivel !== "basico") etiqueta3D(ctx, cam, { x: .42, y: -.2, z: -.18 }, `GHK / HH / Ca^4: ${formato(estado.sinapsis.probabilidadLiberacion,2)}`, "#fef3c7");
  }

  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,.72)";
  ctx.strokeStyle = "rgba(125,211,252,.2)";
  roundRect(ctx, 18, h - 112, 360, 92, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#7dd3fc";
  ctx.font = "900 11px Inter, sans-serif";
  ctx.fillText("MODELO 3D FISICO-QUIMICO", 36, h - 84);
  ctx.fillStyle = "#dbeafe";
  ctx.font = "800 13px Inter, sans-serif";
  ctx.fillText(`Vm ${formato(estado.Vm,1)} mV | ENa ${formato(estado.ENa,1)} | EK ${formato(estado.EK,1)}`, 36, h - 58);
  ctx.fillText(`Na ${formato(estado.INa,1)} uA/cm2 | K ${formato(estado.IK,1)} | Ca ${formato(estado.sinapsis.caLocal,2)} | NT ${formato(estado.sinapsis.nt,2)}`, 36, h - 34);
  ctx.restore();
}

function actualizarOverlay3D(overlay, estado, uiMode) {
  if (!overlay) return;
  const yaw = Math.round((Number(uiMode.orbitYaw || 0) * 180) / Math.PI);
  const pitch = Math.round((Number(uiMode.orbitPitch || 0) * 180) / Math.PI);
  overlay.innerHTML = `<div class="neuro-canvas-hud"><span>Modelo 3D fisico-quimico | zoom ${Math.round(Number(uiMode.cameraZoom || 1) * 100)}%</span><b>${estado.fase}</b><em>Arrastra = rotar | rueda = zoom | doble clic = recentrar</em><em>orbita ${yaw} grados / inclinacion ${pitch} grados | diametro ${formato(estado.axon.diametroUm,1)} um | velocidad ${formato(estado.velocidadMms,2)} mm/ms</em></div>`;
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
    if (["dopamina", "serotonina", "noradrenalina"].includes(estado.sinapsis.tipoId) && i % 5 === 0) {
      ctx.fillStyle = "#e0f2fe"; ctx.font = "800 5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("VMAT2", x, y - radio - 2);
    }
    if (farmacoActivo(estado, /levetiracetam|sv2a/i) && i % 6 === 2) {
      ctx.strokeStyle = "#f472b6"; ctx.strokeRect(x - radio - 2, y - radio - 2, (radio + 2) * 2, (radio + 2) * 2);
      ctx.fillStyle = "#fbcfe8"; ctx.font = "800 5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SV2A", x, y + radio + 7);
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
  const gabapentinoide = farmacoActivo(estado, /pregabalina|gabapentina|alpha2delta/i);
  for (let i = 0; i < 4; i += 1) {
    const cxCanal = sx + 28 + i * 18;
    dibujarCanalConSubdominios(ctx, cxCanal, y - 18, "CaV", "ca", caAbierto ? "abierto" : "cerrado", { escala: .72, vertical: true });
    dibujarSubunidadAlpha2Delta(ctx, cxCanal + 11, y - 22, gabapentinoide);
  }
  if (gabapentinoide) dibujarAccionFarmaco(ctx, sx + 118, y - 72, sx + 88, y - 22, gabapentinoide.nombre || "Pregabalina", "alpha2delta");
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
  const farmacoRecaptura = farmacoActivo(estado, /fluoxetina|sertralina|isrs|cocaina|metilfenidato|anfetamina|dat|sert|net/i);
  if (farmacoRecaptura) dibujarAccionFarmaco(ctx, x + 78, yBase - 54, x + 28, yBase - 12, farmacoRecaptura.nombre || "Farmaco", nt.transportador);
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
  const receptores = receptoresParaSinapsis(tipo, estado).slice(0, 5);
  receptores.forEach(([label, ion, state], i) => {
    dibujarReceptorPostsinaptico(ctx, x + 2, y - 92 + i * 48, label, ion, state, estado);
  });
  const post = Number(estado.sinapsis.postPotencial || 0);
  ctx.fillStyle = post >= 0 ? "rgba(34,211,238,.22)" : "rgba(167,139,250,.22)";
  ctx.beginPath(); ctx.arc(x + 92, y + Math.max(-82, Math.min(82, -post * 3)), 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e0f2fe"; ctx.font = "900 10px Inter, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`${formato(post,1)} mV`, x + 48, y + 126);
  ctx.restore();
}

function dibujarSubunidadAlpha2Delta(ctx, x, y, farmaco) {
  ctx.save();
  ctx.fillStyle = farmaco ? "rgba(244,114,182,.88)" : "rgba(56,189,248,.62)";
  ctx.strokeStyle = farmaco ? "#fbcfe8" : "#bae6fd";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#020617"; ctx.font = "900 5.5px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("a2d", x, y);
  ctx.restore();
}

function dibujarAccionFarmaco(ctx, x1, y1, x2, y2, nombre, diana) {
  ctx.save();
  ctx.strokeStyle = "rgba(244,114,182,.82)";
  ctx.fillStyle = "rgba(244,114,182,.20)";
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x1, y1, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fbcfe8"; ctx.font = "900 8px Inter, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(nombre, x1, y1 - 16);
  ctx.fillText(`-> ${diana}`, x1, y1 + 24);
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
  ctx.fillText(state, x + 48, y + 32);
}

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
  if ((uiMode.cameraMode || "membrana") === "modelo3d") {
    const nx = xPantalla / cssW;
    const ny = yPantalla / cssH;
    if (nx < .34 && ny > .25 && ny < .68) return { ...ZONAS_NEURO_INFO.membrana, id: "soma3d", titulo: "Soma y dendritas 3D", detalle: "Centro integrador de potenciales sinapticos. Su color y actividad dependen del potencial de membrana (Vm) calculado por el modelo." };
    if (nx >= .30 && nx < .68 && ny > .28 && ny < .62) return { ...ZONAS_NEURO_INFO.axon, id: "axon3d", titulo: "Axon 3D y conduccion", detalle: "La propagacion depende de diametro axonal, mielina, temperatura, capacitancia y resistencia axial aproximadas." };
    if (nx >= .62 && nx < .82 && ny > .22 && ny < .58) return { ...ZONAS_NEURO_INFO.terminal, id: "terminal3d", titulo: "Boton presinaptico 3D", detalle: "La llegada del potencial de accion eleva Ca2+ local; la probabilidad de liberacion usa una relacion cooperativa aproximada Ca^4/(Kd^4+Ca^4)." };
    if (nx >= .58 && nx < .88 && ny >= .54 && ny < .76) return { ...ZONAS_NEURO_INFO.sinapsis, id: "sinapsis3d", titulo: "Hendidura sinaptica 3D", detalle: "El neurotransmisor visible refleja liberacion, difusion, recaptura y degradacion. Las particulas son representacion educativa, no conteo molecular real." };
    if (nx >= .52 && nx < .90 && ny >= .70) return { ...ZONAS_NEURO_INFO.postsinapsis, id: "postsinapsis3d", titulo: "Membrana postsinaptica 3D", detalle: "Los receptores transforman la senal quimica en corriente postsinaptica excitadora o inhibitoria segun el tipo de sinapsis." };
    return { ...ZONAS_NEURO_INFO.leyenda, id: "modelo3d", titulo: "Modelo 3D fisico-quimico", detalle: "Reconstruccion educativa: combina Hodgkin-Huxley, Nernst/GHK, conduccion axonal y cinetica sinaptica simplificada en una escena rotatoria." };
  }
  const { x, y } = pantallaAMundo(xPantalla, yPantalla, cssW, cssH, uiMode);
  const geo = crearGeometria(cssW, cssH, uiMode.cameraMode || "membrana");
  const modo = uiMode.cameraMode || "membrana";
  if (["terminal", "sinapsis", "farmacologia"].includes(modo)) {
    const cx = cssW * 0.54;
    const terminalY = cssH * 0.28;
    const cleftY = cssH * 0.57;
    const postY = cssH * 0.78;
    const terminalW = Math.min(520, cssW * 0.58);
    const postW = Math.min(640, cssW * 0.68);
    const zonasSinapsis = [
      { id: "axon", x: cx, y: terminalY - 155, r: 92 },
      { id: "terminal", x: cx, y: terminalY, r: Math.max(130, terminalW * .28) },
      { id: "caV", x: cx - terminalW * .02, y: cleftY - 58, r: 62 },
      { id: "sinapsis", x: cx, y: cleftY, r: Math.max(95, postW * .22) },
      { id: "postsinapsis", x: cx, y: postY, r: Math.max(120, postW * .26) }
    ];
    const foco = zonasSinapsis.map((p) => ({ ...p, d: Math.hypot(x - p.x, y - p.y) })).filter((p) => p.d <= p.r).sort((a, b) => a.d - b.d)[0];
    if (foco && (ZONAS_NEURO_INFO[foco.id] || REGISTRO_PROTEINAS_MEMBRANA[foco.id])) return zonaInfo(foco.id, estado);
  }
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
  if (cercano && (ZONAS_NEURO_INFO[cercano.id] || REGISTRO_PROTEINAS_MEMBRANA[cercano.id])) return zonaInfo(cercano.id, estado);
  const distanciaMembrana = Math.abs(Math.hypot(x - geo.cx, y - geo.cy) - (geo.rOuter - geo.thickness / 2));
  let angulo = Math.atan2(y - geo.cy, x - geo.cx);
  if (angulo < 0) angulo += Math.PI * 2;
  if (angulo >= geo.arcStart && angulo <= geo.arcEnd && distanciaMembrana < geo.thickness * 0.78) return zonaInfo("membrana", estado);
  if (y < cssH * 0.48) return zonaInfo("extracelular", estado);
  if (y > cssH * 0.54) return zonaInfo("intracelular", estado);
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
