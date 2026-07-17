import { ESTRUCTURAS_ATLAS_CEREBRAL, NIVELES_ATLAS_CEREBRAL, COMPLETITUD_ATLAS_CEREBRAL, FUENTES_ATLAS_CEREBRAL } from "./atlasCerebralData.js";
const $ = (id) => document.getElementById(id);
const POR_ID = new Map(ESTRUCTURAS_ATLAS_CEREBRAL.map((item) => [item.id, item]));
const nombre = (item) => item?.name_es || item?.nombre || item?.id || "Estructura";
const descripcion = (item) => item?.description || item?.descripcion || "Ficha anatomica en construccion.";
const funcion = (item) => (item?.functions || item?.funcion || []).join?.(", ") || item?.funcion || "Por completar.";
const clinica = (item) => (item?.clinical_relevance || item?.clinica || []).join?.(", ") || item?.clinica || "Por completar.";
const conexiones = (item) => item?.relations || item?.conexiones || [];
const vascularizacion = (item) => item?.vascular_supply || item?.vascularizacion || "Pendiente de fase vascular.";
const niveles = (item) => item?.levels || (item?.nivel ? [item.nivel] : []);
const nivelPrincipal = (item) => niveles(item)[0] || item?.category || "superficie";
const COLORES_NIVEL = {
  superficie: 0x51d0ff,
  surcos: 0x0b1728,
  temporal: 0x58e0c2,
  lobulos: 0x58e0c2,
  areas: 0x84f0e4,
  limbico: 0xffc66d,
  nucleos: 0x9ee6a8,
  "sustancia-blanca": 0xbca7ff,
  hipocampo: 0xffc66d,
  amigdala: 0xff7aa8,
  ventriculos: 0x8fd7ff,
  tractos: 0xbca7ff,
  subcortical: 0x9ee6a8,
  vascular: 0xff6d6d,
  cerebelo: 0x70d6ff,
  tronco: 0xffa76d
};


function inicializarAtlasCerebralFallback(root, error) {
  console.warn("Usando visor anatomico SVG porque Three.js no esta disponible.", error);
  const host = $("atlasCerebralCanvasHost");
  const tree = $("atlasCerebralTree");
  const ficha = $("atlasCerebralFicha");
  const search = $("atlasCerebralSearch");
  const estado = $("atlasCerebralEstado");
  const completitud = $("atlasCerebralCompleteness");
  if (!host || !tree || !ficha) return;

  const hidden = new Set();
  let selectedId = null;
  let currentView = "lateral";
  const svgNS = "http://www.w3.org/2000/svg";
  const POSICIONES_ATLAS_FALLBACK = {
    "left-hemisphere": { x: 430, y: 245, rx: 245, ry: 170, tipo: "ellipse" },
    "right-hemisphere": { x: 540, y: 245, rx: 230, ry: 158, tipo: "ellipse" },
    "left-temporal-lobe": { x: 350, y: 322, rx: 170, ry: 58, tipo: "ellipse" },
    "left-superior-temporal-gyrus": { x: 324, y: 278, w: 230, h: 18, tipo: "rect" },
    "left-middle-temporal-gyrus": { x: 312, y: 322, w: 245, h: 20, tipo: "rect" },
    "left-inferior-temporal-gyrus": { x: 318, y: 364, w: 220, h: 18, tipo: "rect" },
    "left-superior-temporal-sulcus": { x: 320, y: 300, w: 238, h: 8, tipo: "rect" },
    "left-inferior-temporal-sulcus": { x: 322, y: 344, w: 225, h: 8, tipo: "rect" },
    "left-temporal-pole": { x: 190, y: 330, rx: 45, ry: 55, tipo: "ellipse" },
    "left-heschl-gyrus": { x: 430, y: 254, w: 78, h: 16, tipo: "rect" },
    "left-planum-temporale": { x: 500, y: 262, w: 92, h: 14, tipo: "rect" },
    "left-fusiform-gyrus": { x: 346, y: 414, w: 205, h: 18, tipo: "rect" },
    "left-collateral-sulcus": { x: 356, y: 438, w: 180, h: 8, tipo: "rect" },
    "left-parahippocampal-gyrus": { x: 390, y: 462, w: 150, h: 20, tipo: "rect" },
    "left-uncus": { x: 310, y: 455, rx: 28, ry: 24, tipo: "ellipse" },
    "left-hippocampus": { x: 410, y: 492, w: 170, h: 26, tipo: "rect" },
    "left-amygdala": { x: 342, y: 472, rx: 35, ry: 32, tipo: "ellipse" },
    "left-temporal-horn": { x: 452, y: 520, w: 145, h: 22, tipo: "rect" },
    "left-meyer-loop": { x: 220, y: 220, w: 210, h: 14, tipo: "rect" },
    "left-arcuate-fasciculus": { x: 365, y: 162, w: 260, h: 14, tipo: "rect" },
    "corpus-callosum": { x: 540, y: 118, w: 260, h: 34, tipo: "rect" },
    "thalamus": { x: 628, y: 320, rx: 62, ry: 45, tipo: "ellipse" },
    "brainstem": { x: 625, y: 456, w: 66, h: 150, tipo: "rect" },
    "cerebellum": { x: 700, y: 500, rx: 120, ry: 58, tipo: "ellipse" }
  };

  function setStatus(text) {
    if (estado) estado.textContent = text;
  }

  function colorFor(item) {
    const color = COLORES_NIVEL[nivelPrincipal(item)] ? 0x79d7ff;
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }

  function renderScene() {
    host.innerHTML = "";
    const svg = svgEl("svg", {
      viewBox: "0 0 900 640",
      role: "img",
      "aria-label": "Atlas cerebral anatomico interactivo en modo de respaldo",
      class: "atlas-svg-fallback"
    });
    const defs = svgEl("defs");
    const glow = svgEl("filter", { id: "atlasFallbackGlow", x: "-40%", y: "-40%", width: "180%", height: "180%" });
    glow.appendChild(svgEl("feGaussianBlur", { stdDeviation: "5", result: "blur" }));
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "blur" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    svg.appendChild(defs);

    svg.appendChild(svgEl("rect", { x: "0", y: "0", width: "900", height: "640", rx: "28", fill: "rgba(3, 18, 33, .74)" }));
    for (let x = 0; x <= 900; x += 45) svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x, y2: 640, stroke: "rgba(125,211,252,.08)" }));
    for (let y = 0; y <= 640; y += 45) svg.appendChild(svgEl("line", { x1: 0, y1: y, x2: 900, y2: y, stroke: "rgba(125,211,252,.08)" }));

    const rotation = { lateral: 0, medial: 180, anterior: -8, posterior: 8, superior: -18, inferior: 18, oblicua: -12 }[currentView] || 0;
    const layer = svgEl("g", { transform: `translate(450 320) rotate(${rotation}) translate(-450 -320)` });
    ESTRUCTURAS_ATLAS_CEREBRAL.forEach((item) => {
      const pos = POSICIONES_ATLAS_FALLBACK[item.id];
      if (!pos || hidden.has(item.id)) return;
      const visible = !niveles(item).some((nivel) => hidden.has(`nivel:${nivel}`));
      if (!visible) return;
      const selected = selectedId === item.id;
      const common = {
        fill: colorFor(item),
        opacity: selected ? "0.96" : item.id.includes("sulcus") ? "0.82" : "0.58",
        stroke: selected ? "#ffffff" : "rgba(125,211,252,.48)",
        "stroke-width": selected ? "3" : "1.2",
        filter: selected ? "url(#atlasFallbackGlow)" : "none",
        role: "button",
        tabindex: "0",
        "data-atlas-svg-id": item.id
      };
      let shape;
      if (pos.tipo === "ellipse") {
        shape = svgEl("ellipse", { cx: pos.x, cy: pos.y, rx: pos.rx, ry: pos.ry, ...common });
      } else {
        shape = svgEl("rect", { x: pos.x, y: pos.y, width: pos.w, height: pos.h, rx: Math.min(24, Math.max(8, pos.h / 2)), ...common });
      }
      shape.addEventListener("click", (event) => { event.stopPropagation(); selectStructure(item.id, shape); });
      shape.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectStructure(item.id, shape);
        }
      });
      layer.appendChild(shape);
      if (selected) {
        const label = svgEl("text", { x: pos.x + (pos.rx || pos.w / 2), y: pos.y - (pos.ry || 12) - 10, fill: "#eaf8ff", "font-size": "15", "font-weight": "800", "text-anchor": "middle" });
        label.textContent = nombre(item);
        layer.appendChild(label);
      }
    });
    svg.appendChild(layer);
    svg.addEventListener("click", clearSelection);
    host.appendChild(svg);
  }

  function renderTree(filter = "") {
    const normalized = filter.trim().toLowerCase();
    const children = new Map();
    ESTRUCTURAS_ATLAS_CEREBRAL.forEach((item) => {
      const parent = item.parent_id || "root";
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    });
    function matches(item) {
      return `${nombre(item)} ${item.name_en || ""} ${item.name_la || ""} ${(item.synonyms || item.sinonimos || []).join(" ")}`.toLowerCase().includes(normalized);
    }
    function hasMatchingDescendant(id) {
      return (children.get(id) || []).some((item) => matches(item) || hasMatchingDescendant(item.id));
    }
    const build = (parent, depth = 0) => (children.get(parent) || [])
      .filter((item) => !normalized || matches(item) || hasMatchingDescendant(item.id))
      .map((item) => {
        const selected = item.id === selectedId ? " activo" : "";
        const eye = hidden.has(item.id) ? "Mostrar" : "Ocultar";
        return `<div class="atlas-tree-node" style="--depth:${depth}">
          <button type="button" class="atlas-tree-main${selected}" data-atlas-select="${item.id}"><span>${nombre(item)}</span><small>${nivelPrincipal(item)}</small></button>
          <button type="button" class="atlas-mini-btn" data-atlas-hide="${item.id}">${eye}</button>
          ${build(item.id, depth + 1)}
        </div>`;
      }).join("");
    tree.innerHTML = build("root") || `<p class="muted">No se encontraron estructuras.</p>`;
  }

  function renderFicha(id) {
    const item = POR_ID.get(id);
    if (!item) {
      ficha.innerHTML = `<p class="muted">Selecciona una estructura del arbol o del modelo.</p>`;
      return;
    }
    ficha.innerHTML = `<div class="atlas-ficha-head">
      <div><span class="kicker">Estructura seleccionada</span><h3>${nombre(item)}</h3></div>
      <button type="button" id="atlasCerrarFicha" class="atlas-icon-btn" aria-label="Cerrar ficha">x</button>
    </div>
    <p>${descripcion(item)}</p>
    <dl class="atlas-ficha-grid">
      <dt>Funcion</dt><dd>${funcion(item)}</dd>
      <dt>Clinica</dt><dd>${clinica(item)}</dd>
      <dt>Conexiones</dt><dd>${conexiones(item).join(", ") || "Por completar."}</dd>
      <dt>Vascularizacion</dt><dd>${vascularizacion(item)}</dd>
      <dt>Nivel</dt><dd>${niveles(item).join(", ") || "sin clasificar"}</dd>
    </dl>
    <div class="atlas-ficha-actions">
      <button type="button" data-atlas-action="hide">Ocultar</button>
      <button type="button" data-atlas-action="center">Centrar</button>
    </div>`;
    $("atlasCerrarFicha")?.addEventListener("click", (event) => { event.stopPropagation(); clearSelection(); });
  }

  function selectStructure(id, trigger = null) {
    if (!POR_ID.has(id)) return;
    selectedId = id;
    renderScene();
    renderFicha(id);
    renderTree(search?.value || "");
    setStatus(`Atlas cerebral en modo SVG local. Seleccion: ${nombre(POR_ID.get(id))}`);
    trigger?.focus?.();
  }

  function clearSelection() {
    selectedId = null;
    renderScene();
    renderFicha(null);
    renderTree(search?.value || "");
  }

  function toggleLevel(level, visible) {
    if (visible) hidden.delete(`nivel:${level}`); else hidden.add(`nivel:${level}`);
    renderScene();
  }

  function renderCompletitud() {
    if (!completitud) return;
    completitud.innerHTML = `<div class="atlas-progress"><span style="width:${Math.min(100, COMPLETITUD_ATLAS_CEREBRAL.regiones["Lobulo temporal izquierdo"].macroscopia)}%"></span></div>
      <p><strong>${COMPLETITUD_ATLAS_CEREBRAL.implementadas}</strong> estructuras fase 1. Visor SVG local activo porque Three.js no esta disponible.</p>
      <ul>${COMPLETITUD_ATLAS_CEREBRAL.pendientes.map((item) => `<li>${item}</li>`).join("")}</ul>
      <small>Fuentes declaradas: ${FUENTES_ATLAS_CEREBRAL.map((f) => f.recurso).join("; ")}.</small>`;
  }

  function bind() {
    search?.addEventListener("input", () => renderTree(search.value));
    tree.addEventListener("click", (event) => {
      const select = event.target.closest("[data-atlas-select]");
      const hideBtn = event.target.closest("[data-atlas-hide]");
      if (select) selectStructure(select.dataset.atlasSelect, select);
      if (hideBtn) {
        const id = hideBtn.dataset.atlasHide;
        hidden.has(id) ? hidden.delete(id) : hidden.add(id);
        renderScene();
        renderTree(search?.value || "");
      }
    });
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-atlas-action]");
      if (action?.dataset.atlasAction === "hide" && selectedId) {
        hidden.add(selectedId);
        clearSelection();
      }
      if (action?.dataset.atlasAction === "center") renderScene();
      const view = event.target.closest("[data-atlas-view]");
      if (view) {
        currentView = view.dataset.atlasView;
        renderScene();
      }
    });
    document.querySelectorAll("[data-atlas-level]").forEach((input) => input.addEventListener("change", () => toggleLevel(input.dataset.atlasLevel, input.checked)));
    $("atlasMostrarTodo")?.addEventListener("click", () => { hidden.clear(); renderScene(); renderTree(search?.value || ""); });
    $("atlasOcultarTodo")?.addEventListener("click", () => { ESTRUCTURAS_ATLAS_CEREBRAL.forEach((item) => hidden.add(item.id)); renderScene(); renderTree(search?.value || ""); });
    $("atlasResetView")?.addEventListener("click", () => { currentView = "lateral"; clearSelection(); });
    $("atlasClearSelection")?.addEventListener("click", clearSelection);
    $("atlasDeshacer")?.addEventListener("click", clearSelection);
    $("atlasSnapshot")?.addEventListener("click", () => {
      const svg = host.querySelector("svg");
      if (!svg) return;
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
      const a = document.createElement("a");
      a.download = `atlas-cerebral-${Date.now()}.svg`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("atlasFullscreen")?.addEventListener("click", () => root.requestFullscreen?.());
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") clearSelection(); });
  }

  renderScene();
  renderTree();
  renderFicha(null);
  renderCompletitud();
  bind();
  setStatus("Atlas cerebral listo en modo SVG local. Three.js no esta disponible; el visor interactivo basico queda habilitado.");
}
export async function inicializarAtlasCerebral3D() {
  const root = $("atlasCerebral3d");
  if (!root || root.dataset.inicializado === "1") return;
  root.dataset.inicializado = "1";

  let THREE;
  let OrbitControls;
  try {
    THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
    ({ OrbitControls } = await import("https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js"));
  } catch (error) {
    console.error("No se pudo cargar Three.js para el atlas cerebral 3D", error);
    inicializarAtlasCerebralFallback(root, error);
    return;
  }

  const host = $("atlasCerebralCanvasHost");
  const tree = $("atlasCerebralTree");
  const ficha = $("atlasCerebralFicha");
  const search = $("atlasCerebralSearch");
  const estado = $("atlasCerebralEstado");
  const completitud = $("atlasCerebralCompleteness");
  if (!host || !tree || !ficha) return;

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(-10, 7, 14);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = 4;
  controls.maxDistance = 42;
  controls.target.set(0, 0.5, 0);

  scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x102536, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-6, 8, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x66d9ff, 1.1);
  rim.position.set(8, 3, -8);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map();
  const materials = new Map();
  let selectedId = null;
  let isolatedId = null;
  let clipPlane = null;
  let lastFocus = null;
  const hidden = new Set();
  const transparent = new Set();
  const history = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function materialFor(structure, options = {}) {
    const color = options.color ? COLORES_NIVEL[nivelPrincipal(structure)] ? 0x79d7ff;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ? 0.62,
      metalness: options.metalness ? 0.04,
      transparent: options.transparent ? true,
      opacity: options.opacity ? 0.82,
      side: THREE.DoubleSide,
      clippingPlanes: []
    });
  }

  function ellipsoid(id, position, scale, color, opacity = 0.78) {
    const structure = POR_ID.get(id);
    const geo = new THREE.SphereGeometry(1, 80, 40);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const gyri = 1 + 0.035 * Math.sin(12 * x + 5 * y) + 0.025 * Math.cos(14 * z + 3 * x);
      pos.setXYZ(i, x * scale.x * gyri, y * scale.y * gyri, z * scale.z * gyri);
    }
    geo.computeVertexNormals();
    const mat = materialFor(structure, { color, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    attach(mesh, id);
    return mesh;
  }

  function capsuleLike(id, from, to, radius, color, opacity = 0.9) {
    const structure = POR_ID.get(id);
    const curve = new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.22, 0)), to]);
    const geo = new THREE.TubeGeometry(curve, 56, radius, 18, false);
    const mesh = new THREE.Mesh(geo, materialFor(structure, { color, opacity }));
    attach(mesh, id);
    return mesh;
  }

  function curveTube(id, points, radius, color, opacity = 0.92) {
    const structure = POR_ID.get(id);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 88, radius, 18, false);
    const mesh = new THREE.Mesh(geo, materialFor(structure, { color, opacity }));
    attach(mesh, id);
    return mesh;
  }

  function attach(mesh, id) {
    mesh.userData.structureId = id;
    mesh.name = id;
    group.add(mesh);
    meshes.set(id, mesh);
    materials.set(id, mesh.material.clone());
  }

  function buildModel() {
    group.add(ellipsoid("left-hemisphere", new THREE.Vector3(-1.15, 0.2, 0), new THREE.Vector3(4.25, 2.8, 3.15), 0x5cc9ff, 0.26));
    group.add(ellipsoid("right-hemisphere", new THREE.Vector3(1.15, 0.2, 0), new THREE.Vector3(4.25, 2.8, 3.15), 0x7ed7ff, 0.18));
    group.add(ellipsoid("left-temporal-lobe", new THREE.Vector3(-3.15, -0.72, 1.08), new THREE.Vector3(2.55, 0.9, 1.42), 0x48dcc2, 0.72));

    group.add(capsuleLike("left-superior-temporal-gyrus", new THREE.Vector3(-4.55, -0.12, 1.95), new THREE.Vector3(-1.5, -0.3, 1.72), 0.105, 0x9ef8ea));
    group.add(capsuleLike("left-middle-temporal-gyrus", new THREE.Vector3(-4.75, -0.72, 1.75), new THREE.Vector3(-1.35, -0.82, 1.42), 0.12, 0x62e8d3));
    group.add(capsuleLike("left-inferior-temporal-gyrus", new THREE.Vector3(-4.45, -1.25, 1.38), new THREE.Vector3(-1.55, -1.32, 1.08), 0.105, 0x39c8bd));
    group.add(capsuleLike("left-superior-temporal-sulcus", new THREE.Vector3(-4.6, -0.43, 1.9), new THREE.Vector3(-1.45, -0.58, 1.62), 0.035, 0x061320, 1));
    group.add(capsuleLike("left-inferior-temporal-sulcus", new THREE.Vector3(-4.45, -1.02, 1.55), new THREE.Vector3(-1.5, -1.1, 1.2), 0.033, 0x061320, 1));
    group.add(ellipsoid("left-temporal-pole", new THREE.Vector3(-5.15, -0.75, 1.35), new THREE.Vector3(0.55, 0.68, 0.72), 0x44d9c5, 0.86));
    group.add(capsuleLike("left-heschl-gyrus", new THREE.Vector3(-2.55, -0.08, 1.98), new THREE.Vector3(-2.02, -0.28, 1.48), 0.08, 0xb1fff0));
    group.add(capsuleLike("left-planum-temporale", new THREE.Vector3(-2.1, -0.02, 1.92), new THREE.Vector3(-1.35, -0.22, 1.56), 0.07, 0x91f0e9));
    group.add(capsuleLike("left-fusiform-gyrus", new THREE.Vector3(-4.05, -1.58, 0.65), new THREE.Vector3(-1.4, -1.48, 0.28), 0.1, 0x22bcb5));
    group.add(capsuleLike("left-collateral-sulcus", new THREE.Vector3(-3.9, -1.72, 0.36), new THREE.Vector3(-1.45, -1.63, 0.1), 0.035, 0x071521, 1));
    group.add(capsuleLike("left-parahippocampal-gyrus", new THREE.Vector3(-3.55, -1.52, 0.12), new THREE.Vector3(-1.55, -1.22, -0.18), 0.115, 0x7ee6ac));
    group.add(ellipsoid("left-uncus", new THREE.Vector3(-2.92, -1.36, -0.18), new THREE.Vector3(0.38, 0.28, 0.34), 0x82e6a6, 0.9));
    group.add(curveTube("left-hippocampus", [new THREE.Vector3(-3.45, -1.05, -0.22), new THREE.Vector3(-2.85, -1.04, -0.55), new THREE.Vector3(-2.0, -0.86, -0.42), new THREE.Vector3(-1.46, -0.72, -0.06)], 0.13, 0xffc66d));
    group.add(ellipsoid("left-amygdala", new THREE.Vector3(-3.58, -0.72, -0.12), new THREE.Vector3(0.42, 0.38, 0.35), 0xff7aa8, 0.95));
    group.add(curveTube("left-temporal-horn", [new THREE.Vector3(-3.3, -0.75, -0.45), new THREE.Vector3(-2.55, -0.72, -0.72), new THREE.Vector3(-1.62, -0.55, -0.42)], 0.105, 0x8fd7ff, 0.48));
    group.add(curveTube("left-meyer-loop", [new THREE.Vector3(-1.1, 0.35, 0.0), new THREE.Vector3(-2.35, -0.15, 0.7), new THREE.Vector3(-3.55, -0.7, 1.25)], 0.04, 0xbca7ff));
    group.add(curveTube("left-arcuate-fasciculus", [new THREE.Vector3(-3.8, 0.05, 2.18), new THREE.Vector3(-2.35, 1.72, 1.5), new THREE.Vector3(-0.55, 1.42, 0.9)], 0.05, 0xc8b7ff));
    group.add(curveTube("corpus-callosum", [new THREE.Vector3(-2.2, 0.9, -0.55), new THREE.Vector3(0, 1.32, -0.72), new THREE.Vector3(2.2, 0.9, -0.55)], 0.17, 0xe8f7ff, 0.45));
    group.add(ellipsoid("thalamus", new THREE.Vector3(0, -0.12, -0.78), new THREE.Vector3(0.72, 0.48, 0.55), 0x9ee6a8, 0.78));
    group.add(ellipsoid("brainstem", new THREE.Vector3(0, -2.3, -1.0), new THREE.Vector3(0.42, 1.25, 0.4), 0xffa76d, 0.78));
    group.add(ellipsoid("cerebellum", new THREE.Vector3(0, -2.25, -2.65), new THREE.Vector3(1.95, 0.72, 0.7), 0x70d6ff, 0.4));
  }

  function setStatus(text) {
    if (estado) estado.textContent = text;
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(420, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function renderTree(filter = "") {
    const normalized = filter.trim().toLowerCase();
    const children = new Map();
    ESTRUCTURAS_ATLAS_CEREBRAL.forEach((item) => {
      const parent = item.parent_id || "root";
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    });
    const build = (parent, depth = 0) => (children.get(parent) || [])
      .filter((item) => !normalized || `${nombre(item)} ${item.name_en || ""} ${item.name_la || ""} ${(item.synonyms || item.sinonimos || []).join(" ")}`.toLowerCase().includes(normalized) || hasMatchingDescendant(item.id))
      .map((item) => {
        const selected = item.id === selectedId ? " activo" : "";
        const eye = hidden.has(item.id) ? "Mostrar" : "Ocultar";
        return `<div class="atlas-tree-node" style="--depth:${depth}">
          <button type="button" class="atlas-tree-main${selected}" data-atlas-select="${item.id}">
            <span>${nombre(item)}</span><small>${nivelPrincipal(item)}</small>
          </button>
          <button type="button" class="atlas-mini-btn" data-atlas-hide="${item.id}">${eye}</button>
          ${build(item.id, depth + 1)}
        </div>`;
      }).join("");

    function hasMatchingDescendant(id) {
      return (children.get(id) || []).some((item) => `${nombre(item)} ${item.name_en || ""} ${item.name_la || ""} ${(item.synonyms || item.sinonimos || []).join(" ")}`.toLowerCase().includes(normalized) || hasMatchingDescendant(item.id));
    }

    tree.innerHTML = build("root") || `<p class="muted">No se encontraron estructuras.</p>`;
  }

  function renderFicha(id) {
    const item = POR_ID.get(id);
    if (!item) {
      ficha.innerHTML = `<p class="muted">Selecciona una estructura del arbol o del modelo.</p>`;
      return;
    }
    ficha.innerHTML = `<div class="atlas-ficha-head">
      <div><span class="kicker">Estructura seleccionada</span><h3>${nombre(item)}</h3></div>
      <button type="button" id="atlasCerrarFicha" class="atlas-icon-btn" aria-label="Cerrar ficha">x</button>
    </div>
    <p>${descripcion(item)}</p>
    <dl class="atlas-ficha-grid">
      <dt>Funcion</dt><dd>${funcion(item)}</dd>
      <dt>Clinica</dt><dd>${clinica(item)}</dd>
      <dt>Conexiones</dt><dd>${conexiones(item).join(", ") || "Por completar."}</dd>
      <dt>Vascularizacion</dt><dd>${vascularizacion(item)}</dd>
      <dt>Nivel</dt><dd>${niveles(item).join(", ") || "sin clasificar"}</dd>
    </dl>
    <div class="atlas-ficha-actions">
      <button type="button" data-atlas-action="isolate">Aislar</button>
      <button type="button" data-atlas-action="transparent">Transparente</button>
      <button type="button" data-atlas-action="hide">Ocultar</button>
      <button type="button" data-atlas-action="center">Centrar</button>
    </div>`;
    $("atlasCerrarFicha")?.addEventListener("click", clearSelection);
  }

  function selectStructure(id, trigger = null) {
    if (!POR_ID.has(id)) return;
    lastFocus = trigger || document.activeElement;
    selectedId = id;
    history.push(id);
    updateMaterials();
    renderFicha(id);
    renderTree(search?.value || "");
    centerOn(id, false);
    setStatus(`Seleccion: ${nombre(POR_ID.get(id))}`);
  }

  function clearSelection() {
    selectedId = null;
    updateMaterials();
    renderFicha(null);
    renderTree(search?.value || "");
    if (lastFocus?.focus) lastFocus.focus();
  }

  function updateMaterials() {
    meshes.forEach((mesh, id) => {
      const base = materials.get(id);
      mesh.visible = !hidden.has(id) && (!isolatedId || id === isolatedId || isAncestorOrDescendant(id, isolatedId));
      mesh.material.color.copy(base.color);
      mesh.material.emissive = new THREE.Color(id === selectedId ? 0x27d8ff : 0x000000);
      mesh.material.emissiveIntensity = id === selectedId ? 0.35 : 0;
      mesh.material.opacity = transparent.has(id) ? 0.18 : base.opacity;
      mesh.material.transparent = true;
      mesh.material.clippingPlanes = clipPlane ? [clipPlane] : [];
    });
  }

  function isAncestorOrDescendant(id, ref) {
    if (id === ref) return true;
    let current = POR_ID.get(id)?.parent_id;
    while (current) {
      if (current === ref) return true;
      current = POR_ID.get(current)?.parent_id;
    }
    let refParent = POR_ID.get(ref)?.parent_id;
    while (refParent) {
      if (refParent === id) return true;
      refParent = POR_ID.get(refParent)?.parent_id;
    }
    return false;
  }

  function centerOn(id, animateCamera = true) {
    const mesh = meshes.get(id);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    if (animateCamera) camera.position.copy(center.clone().add(new THREE.Vector3(-5, 3.5, 6)));
    controls.update();
  }

  function fitBrain() {
    controls.target.set(-1.2, -0.2, 0.4);
    camera.position.set(-10, 7, 14);
    controls.update();
  }

  function setView(view) {
    const target = controls.target.clone();
    const views = {
      anterior: new THREE.Vector3(0, 1.5, 15), posterior: new THREE.Vector3(0, 1.5, -15), superior: new THREE.Vector3(0, 16, 0.2), inferior: new THREE.Vector3(0, -12, 1), lateral: new THREE.Vector3(-15, 1.5, 2), medial: new THREE.Vector3(7, 1.5, 2), oblicua: new THREE.Vector3(-10, 7, 14)
    };
    camera.position.copy((views[view] || views.oblicua).add(target));
    controls.update();
  }

  function applyAction(action) {
    if (!selectedId) return;
    if (action === "isolate") isolatedId = isolatedId === selectedId ? null : selectedId;
    if (action === "transparent") transparent.has(selectedId) ? transparent.delete(selectedId) : transparent.add(selectedId);
    if (action === "hide") hidden.add(selectedId);
    if (action === "center") centerOn(selectedId, true);
    updateMaterials();
    renderTree(search?.value || "");
  }

  function toggleLevel(level, visible) {
    ESTRUCTURAS_ATLAS_CEREBRAL.filter((item) => niveles(item).includes(level)).forEach((item) => {
      if (visible) hidden.delete(item.id); else hidden.add(item.id);
    });
    updateMaterials();
    renderTree(search?.value || "");
  }

  function configureClip() {
    const axis = $("atlasClipAxis")?.value || "none";
    const offset = Number($("atlasClipOffset")?.value || 0);
    if (axis === "none") clipPlane = null;
    if (axis === "sagital") clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), offset);
    if (axis === "coronal") clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), offset);
    if (axis === "axial") clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), offset);
    updateMaterials();
  }

  function renderCompletitud() {
    completitud.innerHTML = `<div class="atlas-progress"><span style="width:${Math.min(100, COMPLETITUD_ATLAS_CEREBRAL.regiones["Lobulo temporal izquierdo"].macroscopia)}%"></span></div>
      <p><strong>${COMPLETITUD_ATLAS_CEREBRAL.implementadas}</strong> estructuras fase 1. Geometria procedural educativa, preparada para sustituirse por segmentaciones licenciadas.</p>
      <ul>${COMPLETITUD_ATLAS_CEREBRAL.pendientes.map((item) => `<li>${item}</li>`).join("")}</ul>
      <small>Fuentes declaradas: ${FUENTES_ATLAS_CEREBRAL.map((f) => f.recurso).join("; ")}.</small>`;
  }

  function onPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...meshes.values()], false).filter((hit) => hit.object.visible);
    if (hits[0]?.object?.userData?.structureId) selectStructure(hits[0].object.userData.structureId, renderer.domElement);
  }

  function bind() {
    renderer.domElement.addEventListener("click", onPointer);
    renderer.domElement.addEventListener("dblclick", () => selectedId ? centerOn(selectedId, true) : fitBrain());
    search?.addEventListener("input", () => renderTree(search.value));
    tree.addEventListener("click", (event) => {
      const select = event.target.closest("[data-atlas-select]");
      const hideBtn = event.target.closest("[data-atlas-hide]");
      if (select) selectStructure(select.dataset.atlasSelect, select);
      if (hideBtn) {
        const id = hideBtn.dataset.atlasHide;
        hidden.has(id) ? hidden.delete(id) : hidden.add(id);
        updateMaterials();
        renderTree(search?.value || "");
      }
    });
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-atlas-action]");
      if (action) applyAction(action.dataset.atlasAction);
      const view = event.target.closest("[data-atlas-view]");
      if (view) setView(view.dataset.atlasView);
    });
    document.querySelectorAll("[data-atlas-level]").forEach((input) => input.addEventListener("change", () => toggleLevel(input.dataset.atlasLevel, input.checked)));
    $("atlasMostrarTodo")?.addEventListener("click", () => { hidden.clear(); isolatedId = null; updateMaterials(); renderTree(search?.value || ""); });
    $("atlasOcultarTodo")?.addEventListener("click", () => { meshes.forEach((_, id) => hidden.add(id)); updateMaterials(); renderTree(search?.value || ""); });
    $("atlasResetView")?.addEventListener("click", fitBrain);
    $("atlasClearSelection")?.addEventListener("click", clearSelection);
    $("atlasClipAxis")?.addEventListener("change", configureClip);
    $("atlasClipOffset")?.addEventListener("input", configureClip);
    $("atlasDeshacer")?.addEventListener("click", () => {
      history.pop();
      const previous = history.pop();
      if (previous) selectStructure(previous); else clearSelection();
    });
    $("atlasSnapshot")?.addEventListener("click", () => {
      const a = document.createElement("a");
      a.download = `atlas-cerebral-${Date.now()}.png`;
      a.href = renderer.domElement.toDataURL("image/png");
      a.click();
    });
    $("atlasFullscreen")?.addEventListener("click", () => root.requestFullscreen?.());
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") clearSelection(); });
    new ResizeObserver(resize).observe(host);
  }

  buildModel();
  renderTree();
  renderFicha(null);
  renderCompletitud();
  bind();
  resize();
  fitBrain();
  animate();
  setStatus("Atlas cerebral 3D listo. Fase 1 procedural educativa: lobulo temporal izquierdo priorizado.");
}
