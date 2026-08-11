import { CONNECTOME_DATA, CONNECTOME_DATA_VERSION, MEMORY_MAP_GROUPS, MODULATORY_LAYERS } from "../data/connectomeData.js";
import { ConnectomeGraph } from "../core/connectomeGraph.js";
import { ConnectomeSearch } from "../core/connectomeSearch.js";
import { ConnectomeFilters } from "../core/connectomeFilters.js";
import { ConnectomePathfinder } from "../core/connectomePathfinder.js";
import { ConnectomeAnalysis } from "../core/connectomeAnalysis.js";
import { ConnectomeRenderer } from "../rendering/connectomeRenderer.js";
import { ConnectomeMinimap } from "../rendering/connectomeMinimap.js";
import {
  EDUCATION_LEVELS,
  PLASTICITY_EDUCATION,
  GuidedTourPlayer,
  circuitTextAlternative,
  educationalSummary,
  evidenceLabel
} from "./connectomeEducation.js";
import { ConnectomeQuestionBridge } from "../integration/connectomeQuestionBridge.js";

const CONNECTOME_BUILD = "20260811-memory-connectome-v3";
const STYLE_ID = "neurofisiologiaConnectomeStyles";
const CONTROLLERS = new WeakMap();
const EMPTY_SET = Object.freeze(new Set());
const SESSION_KEY = "cognicion.connectome.view.v3";
const PANEL_WIDTH_LIMITS = Object.freeze({ left: [236, 520], right: [286, 620] });
const SCALE_ORDER = Object.freeze(["sistema", "region", "nucleo", "subcampo", "vias", "sinapsis"]);
const VISIBILITY_MODES = Object.freeze([
  Object.freeze({ id: "all", nombre: "Todas" }),
  Object.freeze({ id: "circuit", nombre: "Solo circuito seleccionado" }),
  Object.freeze({ id: "related", nombre: "Circuito + conexiones relacionadas" }),
  Object.freeze({ id: "protagonists", nombre: "Solo estructuras protagonistas" }),
  Object.freeze({ id: "selection", nombre: "Solo seleccion actual" })
]);
const OFF_FILTER_MODES = Object.freeze([
  Object.freeze({ id: "dim", nombre: "Atenuar" }),
  Object.freeze({ id: "hide", nombre: "Ocultar" }),
  Object.freeze({ id: "normal", nombre: "Mostrar normal" })
]);
const CONNECTION_CHEMISTRY_LAYERS = Object.freeze([
  Object.freeze({ id: "glutamato", nombre: "Glutamatergicas", tokens: ["glutamato"] }),
  Object.freeze({ id: "gaba", nombre: "GABAergicas", tokens: ["gaba"] }),
  Object.freeze({ id: "dopamina", nombre: "Dopaminergicas", tokens: ["dopamina"] }),
  Object.freeze({ id: "serotonina", nombre: "Serotoninergicas", tokens: ["serotonina", "5-ht"] }),
  Object.freeze({ id: "noradrenalina", nombre: "Noradrenergicas", tokens: ["noradrenalina"] }),
  Object.freeze({ id: "acetilcolina", nombre: "Colinergicas", tokens: ["acetilcolina"] }),
  Object.freeze({ id: "no_especificada", nombre: "Anatomicas sin transmisor dominante especificado", tokens: ["no_especificado", "no especificado"] })
]);

const HELP = Object.freeze({
  search: "Busca estructuras, aliases, funciones, conexiones y circuitos. Elegir un resultado centra el grafo.",
  circuit: "Selecciona un circuito para resaltarlo. El contexto permanece visible; Aislar es una accion explicita.",
  layout: "Cambia la organizacion visual. El layout no modifica anatomia ni crea conexiones.",
  scale: "Cambia la profundidad anatomica. Conexion/sinapsis aisla las vias con plasticidad declarada; receptores y mecanismos se consultan en la ficha, sin inventar nodos anatomicos.",
  system: "Filtra sistemas funcionales declarados en nodos y circuitos. No afirma localizacion exclusiva.",
  neurotransmitter: "Resalta conexiones cuyo neurotransmisor predominante esta registrado. No muestra todos los cotransmisores.",
  region: "Resalta una region y sus descendientes anatomicos registrados.",
  direction: "Filtra conexiones unidireccionales o reciprocas. No se asume reciprocidad si no esta declarada.",
  connectionType: "Distingue proyecciones, vias, señales moduladoras y conectividad funcional.",
  plasticity: "Resalta conexiones con LTP/LTD declarada. No implica que toda memoria use el mismo mecanismo.",
  layers: "Las capas moduladoras dibujan solo las principales proyecciones que existen en el registro.",
  path: "El pathfinder solo atraviesa conexiones registradas y respeta su direccion. Por defecto excluye relaciones puramente funcionales.",
  lesion: "Crea una copia de estado sin el nodo o conexion, calcula alcance y circuitos afectados. Es educativo, no diagnostico.",
  learning: "Basico simplifica; intermedio añade neuroanatomia; avanzado muestra evidencia, especies, receptores y fuentes.",
  memoryMap: "Agrupa circuitos por tipo de memoria. Las categorias se solapan y no son compartimentos cerebrales.",
  comparison: "Compara dos subgrafos sin duplicar nodos: muestra anatomia, conexiones y neurotransmisores compartidos o exclusivos.",
  visibility: "Controla el contexto visible. Todas conserva el atlas del nivel actual; las demas opciones ocultan solo por solicitud explicita.",
  outsideFilter: "Atenuar conserva nombres y posiciones fuera del filtro. Ocultar los retira de la vista, no de los datos.",
  anatomyLevel: "Modifica la profundidad renderizada sin eliminar ni duplicar datos. Un circuito puede forzar visibles sus miembros.",
  networks: "Las redes funcionales son superposiciones de nodos y relaciones registradas; no se presentan como tractos anatomicos.",
  connectionLayers: "Activa capas neuroquimicas sobre las conexiones cargadas. La ausencia de un transmisor declarado no significa ausencia biologica."
});

const TYPE_DEPTH = Object.freeze({
  sistema: 0,
  organo: 1,
  division: 2,
  region: 3,
  sistema_distribuido: 3,
  region_cortical: 4,
  formacion: 4,
  complejo: 4,
  complejo_nuclear: 4,
  giro: 4,
  area_cortical: 5,
  subregion_cortical: 6,
  grupo_nuclear: 5,
  nucleo: 6,
  subnucleo: 7,
  tracto: 6,
  via: 7,
  fasciculo: 7,
  subcampo: 7
});

const SCALE_LIMIT = Object.freeze({ sistema: 2, region: 4, nucleo: 6, subcampo: 8, vias: 8, sinapsis: 8, circuito: 8 });

function ensureStyles() {
  const existing = document.getElementById(STYLE_ID);
  if (existing) return existing.dataset.loaded === "true"
    ? Promise.resolve(existing)
    : new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(existing), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  const url = new URL("../../../../css/neurofisiologia-connectome.css", import.meta.url);
  url.searchParams.set("v", CONNECTOME_BUILD);
  link.href = url.href;
  const promise = new Promise((resolve, reject) => {
    link.addEventListener("load", () => { link.dataset.loaded = "true"; resolve(link); }, { once: true });
    link.addEventListener("error", reject, { once: true });
  });
  document.head.append(link);
  return promise;
}

function setOf(value) {
  if (value instanceof Set) return new Set(value);
  if (value == null || value === "") return new Set();
  return new Set(Array.isArray(value) ? value : [value]);
}

function union(...sets) {
  const result = new Set();
  sets.forEach((values) => values?.forEach?.((value) => result.add(value)));
  return result;
}

function difference(source, removed) {
  return new Set([...source].filter((value) => !removed?.has?.(value)));
}

function intersect(source, allowed) {
  return new Set([...source].filter((value) => allowed?.has?.(value)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugText(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function labelForType(value) {
  const labels = {
    corteza: "Corteza",
    nucleo: "Nucleo",
    complejo_nuclear: "Complejo nuclear",
    tracto: "Tracto",
    subcampo: "Subcampo",
    sistema_modulador: "Sistema modulador",
    region: "Region",
    via: "Via",
    senal_moduladora: "Señal moduladora",
    conectividad_funcional: "Conectividad funcional"
  };
  return labels[value] || slugText(value || "Entidad");
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function helpButton(id) {
  return `<button type="button" class="connectome-help" data-help-id="${id}" aria-label="Ayuda: ${escapeHtml(id)}" aria-describedby="connectomeHelpText">?</button>`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right), "es"));
}

function clampNumber(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
}

function readSessionSnapshot() {
  try {
    const raw = window.sessionStorage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function arraySet(value) {
  return new Set(Array.isArray(value) ? value.filter(Boolean) : []);
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value).map(asText).filter(Boolean).join(" · ");
  return String(value);
}

function listMarkup(items, empty = "Sin datos registrados para esta fase.") {
  const values = (items || []).map(asText).filter(Boolean);
  return values.length
    ? `<ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="muted">${escapeHtml(empty)}</p>`;
}

export function createHierarchyConnections(graph) {
  return Object.freeze(graph.regionList
    .filter((node) => node.regionPadre && graph.hasNode(node.regionPadre))
    .map((node) => Object.freeze({
      id: `jerarquia__${node.regionPadre}__${node.id}`,
      origen: node.regionPadre,
      destino: node.id,
      nombre: `${graph.getNode(node.regionPadre).nombre} contiene ${node.nombre}`,
      tipo: "jerarquia_anatomica",
      claseEntidad: "jerarquia_anatomica",
      direccion: "jerarquica",
      polaridad: "no_aplica",
      neurotransmisorPrincipal: "no_aplica",
      funcion: "Relacion de pertenencia anatomica derivada de regionPadre.",
      renderOnly: true,
      interactiva: false
    })));
}

const CONTEXT_MENU_ACTIONS = Object.freeze({
  node: Object.freeze([
    Object.freeze({ action: "context-connections", label: "Ver conexiones" }),
    Object.freeze({ action: "context-isolate", label: "Aislar" }),
    Object.freeze({ action: "context-center", label: "Centrar" }),
    Object.freeze({ action: "context-follow", label: "Seguir via" }),
    Object.freeze({ action: "context-lesion", label: "Simular lesion" })
  ]),
  edge: Object.freeze([
    Object.freeze({ action: "context-connections", label: "Ver detalle" }),
    Object.freeze({ action: "context-follow", label: "Seguir via" }),
    Object.freeze({ action: "context-lesion", label: "Simular lesion" })
  ])
});

export function getContextMenuActions(entityKind) {
  return CONTEXT_MENU_ACTIONS[entityKind] || Object.freeze([]);
}

export class ConnectomeController {
  constructor(root, { onOpenPhysiology = null, initialSelection = null } = {}) {
    if (!(root instanceof Element)) throw new Error("Se requiere el host del mapa de circuitos");
    this.root = root;
    this.onOpenPhysiology = onOpenPhysiology;
    this.initialSelection = initialSelection;
    this.graph = new ConnectomeGraph(CONNECTOME_DATA, { strict: true });
    this.hierarchyConnections = createHierarchyConnections(this.graph);
    this.search = new ConnectomeSearch(this.graph);
    this.filters = new ConnectomeFilters(this.graph);
    this.pathfinder = new ConnectomePathfinder(this.graph);
    this.analysis = new ConnectomeAnalysis(this.graph);
    this.renderer = null;
    this.minimap = null;
    this.active = true;
    this.abortController = new AbortController();
    this.searchFrame = null;
    this.persistTimer = null;
    this.resizeState = null;
    this.contextTarget = null;
    this.state = {
      mode: "exploracion",
      learningLevel: "basico",
      layout: "memoria",
      scale: window.matchMedia?.("(max-width: 720px)")?.matches ? "sistema" : "region",
      visibilityMode: "all",
      offFilterMode: "dim",
      selectedNodeIds: new Set(),
      selectedConnectionId: null,
      selectedCircuitId: null,
      activeMemoryGroupId: null,
      filterCriteria: {},
      filterResult: null,
      isolation: null,
      collapsedNodeIds: new Set(),
      expandedNodeIds: new Set(),
      activeLayerIds: new Set(),
      activeNetworkLayerIds: new Set(),
      activeConnectionLayerIds: new Set(),
      showAllConnections: false,
      routePaths: [],
      activeRouteIndex: 0,
      lesion: null,
      journey: null,
      comparison: null,
      showEdgeLabels: false,
      detailOpen: false,
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
      leftPanelWidth: 300,
      rightPanelWidth: 360,
      mapOnly: false,
      fullscreen: false,
      maximizedFallback: false,
      minimapVisible: false,
      savedViewport: null
    };
    this.restoreSessionState(readSessionSnapshot());
    this.reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
    this.detailOverlayQuery = window.matchMedia?.("(max-width: 1180px)") || null;
    this.tourPlayer = new GuidedTourPlayer({
      tours: CONNECTOME_DATA.recorridos,
      reducedMotion: this.reducedMotionQuery?.matches,
      onStep: (step, snapshot) => this.onTourStep(step, snapshot),
      onState: (snapshot) => this.renderTourBar(snapshot)
    });
    this.questionBridge = new ConnectomeQuestionBridge({
      graph: this.graph,
      pathfinder: this.pathfinder,
      onHighlight: ({ nodeIds, edgeIds }) => {
        this.state.journey = { nodeIds: setOf(nodeIds), connectionIds: setOf(edgeIds), currentNodeId: nodeIds?.[0] || null, currentConnectionId: edgeIds?.[0] || null };
        this.renderGraph();
      }
    });
  }

  restoreSessionState(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    const allowed = (value, values, fallback) => values.includes(value) ? value : fallback;
    this.state.mode = allowed(snapshot.mode, ["exploracion", "aprendizaje", "pregunta"], this.state.mode);
    this.state.learningLevel = allowed(snapshot.learningLevel, EDUCATION_LEVELS.map((item) => item.id), this.state.learningLevel);
    this.state.layout = allowed(snapshot.layout, ["memoria", "flujo", "red", "radial", "jerarquico", "conceptual"], this.state.layout);
    this.state.scale = allowed(snapshot.scale, SCALE_ORDER, this.state.scale);
    this.state.visibilityMode = allowed(snapshot.visibilityMode, VISIBILITY_MODES.map((item) => item.id), "all");
    this.state.offFilterMode = allowed(snapshot.offFilterMode, OFF_FILTER_MODES.map((item) => item.id), "dim");
    this.state.selectedNodeIds = new Set(arraySet(snapshot.selectedNodeIds));
    this.state.selectedConnectionId = this.graph.hasConnection(snapshot.selectedConnectionId) ? snapshot.selectedConnectionId : null;
    this.state.selectedCircuitId = this.graph.hasCircuit(snapshot.selectedCircuitId) ? snapshot.selectedCircuitId : null;
    this.state.activeMemoryGroupId = MEMORY_MAP_GROUPS.some((item) => item.id === snapshot.activeMemoryGroupId) ? snapshot.activeMemoryGroupId : null;
    this.state.collapsedNodeIds = arraySet(snapshot.collapsedNodeIds);
    this.state.expandedNodeIds = arraySet(snapshot.expandedNodeIds);
    const validLayerIds = new Set(MODULATORY_LAYERS.map((item) => item.id));
    const validNetworkIds = new Set((CONNECTOME_DATA.redesFuncionales || CONNECTOME_DATA.capasRedes || []).map((item) => item.id));
    const validConnectionLayerIds = new Set(CONNECTION_CHEMISTRY_LAYERS.map((item) => item.id));
    this.state.activeLayerIds = new Set([...arraySet(snapshot.activeLayerIds)].filter((id) => validLayerIds.has(id)));
    this.state.activeNetworkLayerIds = new Set([...arraySet(snapshot.activeNetworkLayerIds)].filter((id) => validNetworkIds.has(id)));
    this.state.activeConnectionLayerIds = new Set([...arraySet(snapshot.activeConnectionLayerIds)].filter((id) => validConnectionLayerIds.has(id)));
    this.state.showAllConnections = Boolean(snapshot.showAllConnections);
    this.state.showEdgeLabels = Boolean(snapshot.showEdgeLabels);
    this.state.detailOpen = Boolean(snapshot.detailOpen);
    this.state.leftPanelCollapsed = Boolean(snapshot.leftPanelCollapsed);
    this.state.rightPanelCollapsed = Boolean(snapshot.rightPanelCollapsed);
    this.state.leftPanelWidth = clampNumber(snapshot.leftPanelWidth, ...PANEL_WIDTH_LIMITS.left, 300);
    this.state.rightPanelWidth = clampNumber(snapshot.rightPanelWidth, ...PANEL_WIDTH_LIMITS.right, 360);
    this.state.mapOnly = Boolean(snapshot.mapOnly);
    this.state.fullscreen = Boolean(snapshot.fullscreen);
    this.state.maximizedFallback = this.state.fullscreen;
    this.state.minimapVisible = snapshot.minimapVisible !== false;
    this.state.savedViewport = snapshot.viewport && [snapshot.viewport.x, snapshot.viewport.y, snapshot.viewport.scale].every(Number.isFinite)
      ? snapshot.viewport
      : null;
    this.state.filterCriteria = snapshot.filterCriteria && typeof snapshot.filterCriteria === "object" ? snapshot.filterCriteria : {};
    this.state.selectedNodeIds = new Set([...this.state.selectedNodeIds].filter((id) => this.graph.hasNode(id)));
    this.state.collapsedNodeIds = new Set([...this.state.collapsedNodeIds].filter((id) => this.graph.hasNode(id)));
    this.state.expandedNodeIds = new Set([...this.state.expandedNodeIds].filter((id) => this.graph.hasNode(id)));
  }

  sessionSnapshot() {
    return {
      version: 3,
      mode: this.state.mode,
      learningLevel: this.state.learningLevel,
      layout: this.state.layout,
      scale: this.state.scale,
      visibilityMode: this.state.visibilityMode,
      offFilterMode: this.state.offFilterMode,
      selectedNodeIds: [...this.state.selectedNodeIds],
      selectedConnectionId: this.state.selectedConnectionId,
      selectedCircuitId: this.state.selectedCircuitId,
      activeMemoryGroupId: this.state.activeMemoryGroupId,
      filterCriteria: this.state.filterCriteria,
      collapsedNodeIds: [...this.state.collapsedNodeIds],
      expandedNodeIds: [...this.state.expandedNodeIds],
      activeLayerIds: [...this.state.activeLayerIds],
      activeNetworkLayerIds: [...this.state.activeNetworkLayerIds],
      activeConnectionLayerIds: [...this.state.activeConnectionLayerIds],
      showAllConnections: this.state.showAllConnections,
      showEdgeLabels: this.state.showEdgeLabels,
      detailOpen: this.state.detailOpen,
      leftPanelCollapsed: this.state.leftPanelCollapsed,
      rightPanelCollapsed: this.state.rightPanelCollapsed,
      leftPanelWidth: this.state.leftPanelWidth,
      rightPanelWidth: this.state.rightPanelWidth,
      mapOnly: this.state.mapOnly,
      fullscreen: this.state.fullscreen,
      minimapVisible: this.state.minimapVisible,
      viewport: this.renderer?.getViewport?.() || this.state.savedViewport
    };
  }

  serializeViewState() {
    return this.sessionSnapshot();
  }

  restoreViewState(snapshot) {
    this.restoreSessionState(snapshot);
    if (this.root?.isConnected) {
      this.applyStateToControls();
      this.syncPresentationState();
      this.renderAll({ fit: !this.state.savedViewport, fitScope: "all" });
      if (this.state.savedViewport) this.renderer?.setViewport?.(this.state.savedViewport, { source: "restore", animate: false });
    }
    return this;
  }

  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try { window.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(this.sessionSnapshot())); } catch { /* almacenamiento no disponible */ }
    }, 90);
  }

  async mount() {
    this.root.dataset.state = "loading";
    this.root.setAttribute("aria-busy", "true");
    await ensureStyles();
    this.renderShell();
    this.applyStateToControls();
    this.bindUi();
    this.mountRenderer();
    this.populateInitialState();
    this.syncPresentationState();
    this.renderAll({ fit: !this.state.savedViewport, fitScope: "all" });
    if (this.state.savedViewport && !this.initialSelection) {
      this.renderer.setViewport?.(this.state.savedViewport, { source: "session", animate: false });
    } else if (this.state.selectedNodeIds.size) {
      requestAnimationFrame(() => this.centerSelectedNode({ animate: false }));
    }
    this.root.dataset.state = "ready";
    this.root.setAttribute("aria-busy", "false");
    this.announce(`Mapa listo: ${this.graph.regionList.length} estructuras, ${this.graph.connectionList.length} conexiones y ${this.graph.circuitList.length} circuitos.`);
    console.info("[Connectome] modulo listo", {
      build: CONNECTOME_BUILD,
      dataVersion: CONNECTOME_DATA_VERSION,
      validation: this.graph.validation,
      lazyLoaded: true
    });
    return this;
  }

  renderShell() {
    const circuits = [...this.graph.circuitList].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const nodes = [...this.graph.regionList].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const systems = uniqueSorted(this.graph.regionList.flatMap((node) => node.sistemas || []));
    const transmitters = uniqueSorted(this.graph.connectionList.map((edge) => edge.neurotransmisorPrincipal));
    const connectionTypes = uniqueSorted(this.graph.connectionList.map((edge) => edge.tipo));
    const functionalNetworks = CONNECTOME_DATA.redesFuncionales || CONNECTOME_DATA.capasRedes || [];
    const regionRoots = nodes.filter((node) => {
      const depth = this.nodeDepth(node);
      return node.id === "brain" || (depth >= 3 && depth <= 4 && this.graph.getChildren(node.id).length);
    });
    const topicTags = [
      ["memoria_episodica", "Episodica"], ["memoria_semantica", "Semantica"], ["memoria_trabajo", "Trabajo"],
      ["aprendizaje_procedimental", "Procedimental"], ["memoria_emocional", "Emocional"], ["recompensa", "Recompensa"],
      ["navegacion", "Espacial"], ["atencion", "Atencion"], ["ejecutivo", "Ejecutivo"], ["motor", "Motor"]
    ];

    this.root.className = "connectome-module";
    this.root.innerHTML = `
      <header class="connectome-header">
        <div class="connectome-header-copy">
          <span class="kicker">Atlas conectomico navegable · Fase 2</span>
          <h2>Mapa de circuitos cerebrales</h2>
          <p>Explora anatomia, vias y subgrafos de memoria y aprendizaje sin duplicar estructuras.</p>
          <div class="connectome-badges" aria-label="Cobertura del mapa">
            <span>${this.graph.regionList.length} estructuras</span><span>${this.graph.connectionList.length} conexiones</span>
            <span>${this.graph.circuitList.length} circuitos</span><span>Datos ${CONNECTOME_DATA_VERSION}</span>
          </div>
        </div>
        <div class="connectome-header-actions">
          <div class="connectome-mode-switch" role="group" aria-label="Modo del mapa">
            <button type="button" class="is-active" data-mode="exploracion">Exploracion</button>
            <button type="button" data-mode="aprendizaje">Modo aprendizaje</button>
            <button type="button" data-mode="pregunta">Modo pregunta</button>
          </div>
          <div class="connectome-view-actions" role="group" aria-label="Vista ampliada">
            <button type="button" data-action="toggle-map-only" aria-pressed="false" title="Ocultar paneles y dejar solo el mapa">Solo mapa</button>
            <button type="button" data-action="toggle-fullscreen" aria-pressed="false" title="Abrir el mapa en pantalla completa">Pantalla completa</button>
          </div>
        </div>
      </header>
      <p class="connectome-disclaimer">Modelo educativo. Las flechas muestran relaciones predominantes registradas; no representan actividad neuronal real medida, diagnostico ni una conectividad individual.</p>

      <nav id="connectomeBreadcrumb" class="connectome-breadcrumb" aria-label="Ruta anatomica">
        <button type="button" data-breadcrumb-root>Memoria</button><span aria-hidden="true">›</span><span>Mapa de memoria</span>
      </nav>

      <section class="connectome-toolbar" aria-label="Herramientas principales">
        <div class="connectome-search-wrap">
          <label for="connectomeSearch">Buscar ${helpButton("search")}</label>
          <input id="connectomeSearch" type="search" autocomplete="off" placeholder="CA1, Schaffer, recompensa, NMDA…" aria-autocomplete="list" aria-controls="connectomeSearchResults">
          <div id="connectomeSearchResults" class="connectome-search-results" role="listbox" hidden></div>
        </div>
        <label>Circuito ${helpButton("circuit")}
          <select id="connectomeCircuitFilter">
            ${option("", "Todos: mapa de memoria", true)}
            ${circuits.map((circuit) => option(circuit.id, circuit.nombre)).join("")}
          </select>
        </label>
        <label>Organizacion ${helpButton("layout")}
          <select id="connectomeLayout">
            ${option("memoria", "Mapa de memoria", true)}${option("flujo", "Diagrama de flujo")}
            ${option("red", "Red")}${option("radial", "Radial")}${option("jerarquico", "Jerarquico")}${option("conceptual", "Anatomico conceptual")}
          </select>
        </label>
        <label>Nivel anatomico ${helpButton("anatomyLevel")}
          <select id="connectomeScale">
            ${option("sistema", "1. Sistemas")}${option("region", "2. Regiones", true)}${option("nucleo", "3. Nucleos")}
            ${option("subcampo", "4. Subnucleos / subcampos")}${option("vias", "5. Vias")}${option("sinapsis", "6. Sinapsis / receptores")}
          </select>
        </label>
        <label>Mostrar estructuras ${helpButton("visibility")}
          <select id="connectomeVisibilityMode">${VISIBILITY_MODES.map((item) => option(item.id, item.nombre, item.id === "all")).join("")}</select>
        </label>
        <label>Fuera del filtro ${helpButton("outsideFilter")}
          <select id="connectomeOffFilterMode">${OFF_FILTER_MODES.map((item) => option(item.id, item.nombre, item.id === "dim")).join("")}</select>
        </label>
        <label>Nivel ${helpButton("learning")}
          <select id="connectomeLearningLevel">
            ${EDUCATION_LEVELS.map((level) => option(level.id, level.nombre, level.id === "basico")).join("")}
          </select>
        </label>
      </section>

      <div class="connectome-workspace">
        <aside id="connectomeControls" class="connectome-controls" aria-label="Filtros y analisis">
          <div class="connectome-panel-bar"><strong>Exploracion</strong><button type="button" data-action="toggle-left-panel" aria-expanded="true" title="Colapsar panel izquierdo">&#x27E8;</button></div>
          <section class="connectome-filter-section connectome-memory-map">
            <div class="connectome-section-title"><h3>Mapa de memoria</h3>${helpButton("memoryMap")}</div>
            <div class="connectome-memory-groups">
              ${MEMORY_MAP_GROUPS.map((group) => `<button type="button" data-memory-group="${group.id}">${escapeHtml(group.nombre)}</button>`).join("")}
            </div>
          </section>

          <details class="connectome-filter-section" open>
            <summary>Filtros</summary>
            <label>Sistema funcional ${helpButton("system")}
              <select id="connectomeSystemFilter">${option("", "Todos", true)}${systems.map((value) => option(value, slugText(value))).join("")}</select>
            </label>
            <label>Neurotransmisor ${helpButton("neurotransmitter")}
              <select id="connectomeNeurotransmitterFilter">${option("", "Todos", true)}${transmitters.map((value) => option(value, value === "no_aplica" ? "No aplica (relacion funcional)" : slugText(value))).join("")}</select>
            </label>
            <label>Region anatomica ${helpButton("region")}
              <select id="connectomeRegionFilter">${option("", "Todas", true)}${regionRoots.map((value) => option(value.id, value.nombre)).join("")}</select>
            </label>
            <label>Direccion ${helpButton("direction")}
              <select id="connectomeDirectionFilter">${option("", "Todas", true)}${option("unidireccional", "→ Unidireccional")}${option("reciproca", "↔ Reciproca")}</select>
            </label>
            <label>Tipo de conexion ${helpButton("connectionType")}
              <select id="connectomeTypeFilter">${option("", "Todos", true)}${connectionTypes.map((value) => option(value, labelForType(value))).join("")}</select>
            </label>
            <div class="connectome-chip-grid" aria-label="Temas">
              ${topicTags.map(([id, name]) => `<button type="button" aria-pressed="false" data-topic-tag="${id}">${name}</button>`).join("")}
            </div>
            <label class="connectome-check"><input id="connectomePlasticityFilter" type="checkbox"> Capa Plasticidad (LTP/LTD) ${helpButton("plasticity")}</label>
            <button type="button" class="secundario" data-action="clear-filters">Limpiar filtros</button>
          </details>

          <details class="connectome-filter-section">
            <summary>Capas moduladoras ${helpButton("layers")}</summary>
            ${MODULATORY_LAYERS.map((layer) => `<label class="connectome-check"><input type="checkbox" data-modulatory-layer="${layer.id}"> ${escapeHtml(layer.nombre)}</label><p class="muted">${escapeHtml(layer.descripcion)}</p>`).join("")}
          </details>

          <details class="connectome-filter-section">
            <summary>Capas de conexiones ${helpButton("connectionLayers")}</summary>
            ${CONNECTION_CHEMISTRY_LAYERS.map((layer) => `<label class="connectome-check"><input type="checkbox" data-connection-layer="${layer.id}"> ${escapeHtml(layer.nombre)}</label>`).join("")}
            <label class="connectome-check"><input id="connectomeAllConnections" type="checkbox"> Todas las conexiones conocidas cargadas</label>
            <p class="muted">Modo avanzado: puede producir un grafo denso; utiliza filtros o aislamiento para seguir una via.</p>
          </details>

          ${functionalNetworks.length ? `<details class="connectome-filter-section"><summary>Redes corticales ${helpButton("networks")}</summary>${functionalNetworks.map((network) => `<label class="connectome-check"><input type="checkbox" data-network-layer="${network.id}"> ${escapeHtml(network.nombre)}</label><p class="muted">${escapeHtml(network.descripcion)}</p>`).join("")}</details>` : ""}

          <details class="connectome-filter-section" open>
            <summary>Expansion anatomica</summary>
            <div class="connectome-expansion-actions">
              <button type="button" data-action="expand-next">Expandir nivel siguiente</button>
              <button type="button" data-action="expand-all">Expandir todo</button>
              <button type="button" data-action="collapse-all">Contraer todo</button>
            </div>
          </details>

          <details id="connectomePathTool" class="connectome-filter-section" open>
            <summary>¿Como se conecta con…? ${helpButton("path")}</summary>
            <label>Origen<select id="connectomePathOrigin">${nodes.map((node) => option(node.id, node.nombre, node.id === "corteza_entorrinal")).join("")}</select></label>
            <label>Destino<select id="connectomePathDestination">${nodes.map((node) => option(node.id, node.nombre, node.id === "ca1")).join("")}</select></label>
            <button type="button" data-action="find-path">Buscar ruta registrada</button>
            <div id="connectomePathResults" class="connectome-path-results" aria-live="polite"></div>
          </details>

          <details class="connectome-filter-section">
            <summary>Comparar circuitos ${helpButton("comparison")}</summary>
            <label>Primero<select id="connectomeCompareA">${circuits.map((circuit, index) => option(circuit.id, circuit.nombre, index === 0)).join("")}</select></label>
            <label>Segundo<select id="connectomeCompareB">${circuits.map((circuit, index) => option(circuit.id, circuit.nombre, index === 1)).join("")}</select></label>
            <button type="button" data-action="compare-circuits">Comparar</button>
            <div id="connectomeComparison" class="connectome-comparison" aria-live="polite"></div>
          </details>

          <details class="connectome-filter-section">
            <summary>Recorridos guiados</summary>
            <label>Recorrido<select id="connectomeTourSelect">${CONNECTOME_DATA.recorridos.map((tour) => option(tour.id, tour.nombre)).join("")}</select></label>
            <button type="button" data-action="start-tour">Comenzar recorrido</button>
          </details>
        </aside>
        <div class="connectome-panel-resizer is-left" data-resize-panel="left" role="separator" tabindex="0" aria-label="Redimensionar panel izquierdo" aria-orientation="vertical"></div>

        <section class="connectome-viewport-panel" aria-label="Grafo neuroanatomico">
          <div class="connectome-camera-toolbar" role="toolbar" aria-label="Camara del mapa">
            <button type="button" data-action="fit-graph" title="Encajar todo" aria-label="Encajar todo"><span aria-hidden="true">&#x26F6;</span></button>
            <button type="button" data-action="center-selection" title="Centrar seleccion" aria-label="Centrar seleccion"><span aria-hidden="true">&#x2316;</span></button>
            <button type="button" data-action="reset-camera" title="Restablecer camara" aria-label="Restablecer camara"><span aria-hidden="true">&#x21BA;</span></button>
            <button type="button" data-action="toggle-edge-labels" title="Mostrar etiquetas de vias" aria-label="Mostrar etiquetas de vias" aria-pressed="false"><span aria-hidden="true">Aa</span></button>
            <button type="button" data-action="toggle-minimap" title="Mostrar u ocultar minimapa" aria-label="Mostrar u ocultar minimapa" aria-pressed="true"><span aria-hidden="true">&#x25EB;</span></button>
            <button type="button" data-action="toggle-left-panel" title="Mostrar u ocultar filtros" aria-label="Mostrar u ocultar filtros" aria-pressed="true"><span aria-hidden="true">&#x25E7;</span></button>
            <button type="button" data-action="toggle-right-panel" title="Mostrar u ocultar informacion" aria-label="Mostrar u ocultar informacion" aria-pressed="true"><span aria-hidden="true">&#x25E8;</span></button>
            <button type="button" data-action="toggle-map-only" class="connectome-exit-map-only" title="Salir de Solo mapa" aria-label="Salir de Solo mapa" hidden><span aria-hidden="true">&#x2715;</span></button>
            <button type="button" data-action="toggle-fullscreen" class="connectome-exit-fullscreen" title="Salir de pantalla completa" aria-label="Salir de pantalla completa" hidden><span aria-hidden="true">&#x26F6;</span></button>
            <button type="button" data-action="clear-isolation" title="Salir del aislamiento" aria-label="Salir del aislamiento" hidden><span aria-hidden="true">&#x25CE;</span></button>
            <button type="button" data-action="clear-lesion" title="Quitar simulacion de lesion" aria-label="Quitar simulacion de lesion" hidden><span aria-hidden="true">&#x271A;</span></button>
          </div>
          <div id="connectomeViewport" class="connectome-viewport" tabindex="0" aria-label="Mapa interactivo: rueda para zoom, arrastra fondo para desplazar y nodos para reorganizar"></div>
          <div id="connectomeMinimap" class="connectome-minimap" aria-label="Minimapa del conectoma"></div>
          <div id="connectomeTooltip" class="connectome-tooltip" role="tooltip" hidden></div>
          <div id="connectomeStatus" class="connectome-status" role="status" aria-live="polite"></div>
          <details class="connectome-legend">
            <summary>Leyenda dinamica</summary>
            <div id="connectomeLegend"></div>
          </details>
          <details class="connectome-text-alternative">
            <summary>Alternativa textual accesible</summary>
            <div id="connectomeTextAlternative"></div>
          </details>
        </section>

        <div class="connectome-panel-resizer is-right" data-resize-panel="right" role="separator" tabindex="0" aria-label="Redimensionar panel derecho" aria-orientation="vertical"></div>
        <aside id="connectomeDetail" class="connectome-detail" aria-label="Informacion de seleccion" aria-live="polite">
          <div class="connectome-panel-bar"><button type="button" data-action="toggle-right-panel" aria-expanded="true" title="Colapsar panel derecho">&#x27E9;</button><strong>Informacion</strong></div>
          <div class="connectome-detail-empty">
            <span class="kicker">Exploracion</span><h3>Selecciona una estructura o via</h3>
            <p>Haz clic en un nodo o una flecha. Doble clic expande/contrae; clic derecho abre acciones equivalentes accesibles desde la ficha.</p>
          </div>
        </aside>
      </div>

      <section id="connectomeTour" class="connectome-tour" aria-live="polite" hidden></section>
      <div id="connectomeContextMenu" class="connectome-context-menu" role="menu" hidden></div>
      <div id="connectomeHelpText" class="connectome-help-popover" role="status" hidden></div>
      <div id="connectomeAnnouncer" class="sr-only" aria-live="polite"></div>
    `;
  }

  applyStateToControls() {
    const setValue = (selector, value) => {
      const control = this.root.querySelector(selector);
      if (control && [...control.options || []].some((item) => item.value === value)) control.value = value;
    };
    setValue("#connectomeLayout", this.state.layout);
    setValue("#connectomeScale", this.state.scale);
    setValue("#connectomeVisibilityMode", this.state.visibilityMode);
    setValue("#connectomeOffFilterMode", this.state.offFilterMode);
    setValue("#connectomeLearningLevel", this.state.learningLevel);
    setValue("#connectomeCircuitFilter", this.state.selectedCircuitId || "");
    const criteria = this.state.filterCriteria || {};
    setValue("#connectomeSystemFilter", [].concat(criteria.systems || [])[0] || "");
    setValue("#connectomeNeurotransmitterFilter", [].concat(criteria.neurotransmitters || [])[0] || "");
    setValue("#connectomeRegionFilter", [].concat(criteria.regions || [])[0] || "");
    setValue("#connectomeDirectionFilter", [].concat(criteria.directions || [])[0] || "");
    setValue("#connectomeTypeFilter", [].concat(criteria.connectionTypes || [])[0] || "");
    const plasticity = this.root.querySelector("#connectomePlasticityFilter");
    if (plasticity) plasticity.checked = Boolean(criteria.plasticity);
    const tags = new Set(criteria.tags || []);
    this.root.querySelectorAll("[data-topic-tag]").forEach((button) => button.setAttribute("aria-pressed", String(tags.has(button.dataset.topicTag))));
    this.root.querySelectorAll("[data-modulatory-layer]").forEach((input) => { input.checked = this.state.activeLayerIds.has(input.dataset.modulatoryLayer); });
    this.root.querySelectorAll("[data-network-layer]").forEach((input) => { input.checked = this.state.activeNetworkLayerIds.has(input.dataset.networkLayer); });
    this.root.querySelectorAll("[data-connection-layer]").forEach((input) => { input.checked = this.state.activeConnectionLayerIds.has(input.dataset.connectionLayer); });
    const allConnections = this.root.querySelector("#connectomeAllConnections");
    if (allConnections) allConnections.checked = this.state.showAllConnections;
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === this.state.mode));
    this.root.querySelectorAll("[data-memory-group]").forEach((button) => button.classList.toggle("is-active", button.dataset.memoryGroup === this.state.activeMemoryGroupId));
    if (Object.keys(criteria).some((key) => criteria[key] && (!Array.isArray(criteria[key]) || criteria[key].length))) {
      this.state.filterResult = this.filters.filter({ ...criteria, mode: "all" });
    }
  }

  syncPresentationState() {
    this.root.style.setProperty("--connectome-left-width", `${this.state.leftPanelWidth}px`);
    this.root.style.setProperty("--connectome-right-width", `${this.state.rightPanelWidth}px`);
    this.root.classList.toggle("is-left-collapsed", this.state.leftPanelCollapsed);
    this.root.classList.toggle("is-right-collapsed", this.state.rightPanelCollapsed);
    this.root.classList.toggle("is-map-only", this.state.mapOnly);
    this.root.classList.toggle("is-fullscreen", this.state.fullscreen);
    this.root.classList.toggle("is-maximized", this.state.maximizedFallback);
    document.body?.classList.toggle("connectome-maximized-active", this.state.maximizedFallback);
    const leftPanel = this.root.querySelector("#connectomeControls");
    if (leftPanel) leftPanel.setAttribute("aria-hidden", String(this.state.mapOnly || this.state.fullscreen || this.state.leftPanelCollapsed));
    this.root.querySelectorAll("[data-action='toggle-map-only']").forEach((button) => {
      button.setAttribute("aria-pressed", String(this.state.mapOnly));
      if (!button.classList.contains("connectome-exit-map-only")) button.textContent = this.state.mapOnly ? "Salir de Solo mapa" : "Solo mapa";
    });
    this.root.querySelectorAll("[data-action='toggle-fullscreen']").forEach((button) => {
      button.setAttribute("aria-pressed", String(this.state.fullscreen));
      const label = this.state.fullscreen ? "Salir de pantalla completa" : "Pantalla completa";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      if (!button.classList.contains("connectome-exit-fullscreen")) button.textContent = label;
    });
    this.root.querySelectorAll(".connectome-exit-map-only").forEach((button) => { button.hidden = !this.state.mapOnly; });
    this.root.querySelectorAll(".connectome-exit-fullscreen").forEach((button) => { button.hidden = !this.state.fullscreen && !this.state.mapOnly; });
    this.root.querySelectorAll("[data-action='toggle-left-panel']").forEach((button) => {
      button.setAttribute("aria-expanded", String(!this.state.leftPanelCollapsed));
      button.setAttribute("aria-pressed", String(!this.state.leftPanelCollapsed));
    });
    this.root.querySelectorAll("[data-action='toggle-right-panel']").forEach((button) => {
      const overlay = this.detailOverlayQuery?.matches ?? window.innerWidth <= 1180;
      const visible = !this.state.fullscreen && !this.state.rightPanelCollapsed && (!overlay || this.state.detailOpen);
      button.setAttribute("aria-expanded", String(visible));
      button.setAttribute("aria-pressed", String(visible));
    });
    const minimapHost = this.root.querySelector("#connectomeMinimap");
    if (minimapHost) minimapHost.hidden = !this.state.minimapVisible;
    this.root.querySelectorAll("[data-action='toggle-minimap']").forEach((button) => button.setAttribute("aria-pressed", String(this.state.minimapVisible)));
    const edgeLabelAction = this.state.showEdgeLabels ? "Ocultar etiquetas de vias" : "Mostrar etiquetas de vias";
    this.root.querySelectorAll("[data-action='toggle-edge-labels']").forEach((button) => {
      button.setAttribute("aria-pressed", String(this.state.showEdgeLabels));
      button.setAttribute("aria-label", edgeLabelAction);
      button.setAttribute("title", edgeLabelAction);
    });
    for (const side of ["left", "right"]) {
      const separator = this.root.querySelector(`[data-resize-panel='${side}']`);
      separator?.setAttribute("aria-valuemin", String(PANEL_WIDTH_LIMITS[side][0]));
      separator?.setAttribute("aria-valuemax", String(PANEL_WIDTH_LIMITS[side][1]));
      separator?.setAttribute("aria-valuenow", String(Math.round(this.state[`${side}PanelWidth`])));
    }
    this.syncDetailVisibility();
  }

  bindUi() {
    const signal = this.abortController.signal;
    this.root.addEventListener("click", (event) => this.onRootClick(event), { signal });
    this.root.addEventListener("change", (event) => this.onRootChange(event), { signal });
    this.root.addEventListener("input", (event) => this.onRootInput(event), { signal });
    this.root.addEventListener("keydown", (event) => this.onRootKeydown(event), { signal });
    this.root.addEventListener("pointerdown", (event) => this.startPanelResize(event), { signal });
    document.addEventListener("pointerdown", (event) => {
      if (!this.root.contains(event.target)) this.hideTransientUi();
    }, { signal });
    document.addEventListener("pointermove", (event) => this.resizePanel(event), { signal });
    document.addEventListener("pointerup", () => this.finishPanelResize(), { signal });
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && (this.state.fullscreen || this.state.mapOnly)) this.exitExpandedView(event);
    }, { signal });
    document.addEventListener("fullscreenchange", () => this.onFullscreenChange(), { signal });
    this.reducedMotionQuery?.addEventListener?.("change", (event) => this.tourPlayer.setReducedMotion(event.matches), { signal });
    this.detailOverlayQuery?.addEventListener?.("change", () => this.syncDetailVisibility(), { signal });
  }

  mountRenderer() {
    const host = this.root.querySelector("#connectomeViewport");
    this.renderer = new ConnectomeRenderer(host, {
      onNodeClick: (node, metadata) => this.selectNode(node?.id || node, Boolean(metadata?.multiple || metadata?.shiftKey)),
      onEdgeClick: (edge) => this.selectConnection(edge?.id || edge),
      onNodeDoubleClick: (node) => this.toggleNodeExpansion(node?.id || node),
      onContextMenu: (payload) => this.showContextMenu(payload),
      onHover: (payload) => this.showTooltip(payload),
      onBackgroundClick: () => this.clearEntitySelection(),
      onSelectionChange: (payload) => this.onRendererSelection(payload),
      onViewportChange: () => {
        this.minimap?.syncCamera?.();
        this.schedulePersist();
      }
    });
    this.renderer.mount?.();
    const minimapHost = this.root.querySelector("#connectomeMinimap");
    if (minimapHost) {
      this.minimap = new ConnectomeMinimap(minimapHost, { renderer: this.renderer });
      this.minimap.setVisible?.(this.state.minimapVisible);
    }
  }

  populateInitialState() {
    const params = new URLSearchParams(window.location.search);
    const id = this.initialSelection || params.get("estructura") || params.get("structure");
    const circuitId = params.get("circuito") || params.get("circuit");
    if (circuitId && this.graph.hasCircuit(circuitId)) {
      this.state.selectedCircuitId = circuitId;
      this.state.layout = "flujo";
      this.state.detailOpen = true;
      const control = this.root.querySelector("#connectomeCircuitFilter");
      if (control) control.value = circuitId;
      const layout = this.root.querySelector("#connectomeLayout");
      if (layout) layout.value = "flujo";
    }
    if (id && this.graph.hasNode(id)) {
      this.state.selectedNodeIds.add(id);
      this.state.detailOpen = true;
    }
  }

  onRootClick(event) {
    const help = event.target.closest("[data-help-id]");
    if (help) {
      event.preventDefault();
      this.showHelp(help.dataset.helpId, help);
      return;
    }
    const mode = event.target.closest("[data-mode]");
    if (mode) return this.setMode(mode.dataset.mode);
    const memory = event.target.closest("[data-memory-group]");
    if (memory) return this.selectMemoryGroup(memory.dataset.memoryGroup);
    const topic = event.target.closest("[data-topic-tag]");
    if (topic) {
      topic.setAttribute("aria-pressed", topic.getAttribute("aria-pressed") !== "true" ? "true" : "false");
      this.applyFiltersFromUi();
      return;
    }
    const searchResult = event.target.closest("[data-search-type][data-search-id]");
    if (searchResult) return this.activateSearchResult(searchResult.dataset.searchType, searchResult.dataset.searchId);
    const routeResult = event.target.closest("[data-route-index]");
    if (routeResult) return this.activateRoute(Number(routeResult.dataset.routeIndex));
    const breadcrumb = event.target.closest("[data-breadcrumb-node]");
    if (breadcrumb) return this.selectNode(breadcrumb.dataset.breadcrumbNode);
    if (event.target.closest("[data-breadcrumb-root]")) return this.resetMemoryOverview();
    const nodeLink = event.target.closest("[data-select-node]");
    if (nodeLink) return this.selectNode(nodeLink.dataset.selectNode);
    const edgeLink = event.target.closest("[data-select-edge]");
    if (edgeLink) return this.selectConnection(edgeLink.dataset.selectEdge);
    const circuitLink = event.target.closest("[data-select-circuit]");
    if (circuitLink) return this.selectCircuit(circuitLink.dataset.selectCircuit);
    const action = event.target.closest("[data-action]");
    if (action) this.handleAction(action.dataset.action, action);
  }

  onRootChange(event) {
    const target = event.target;
    if (target.id === "connectomeCircuitFilter") {
      target.value ? this.selectCircuit(target.value) : this.resetMemoryOverview();
      return;
    }
    if (target.id === "connectomeLayout") {
      this.state.layout = target.value;
      this.renderGraph({ fit: true, fitScope: "all" });
      return;
    }
    if (target.id === "connectomeScale") {
      this.state.scale = target.value;
      this.renderGraph({ fit: true, fitScope: "all" });
      return;
    }
    if (target.id === "connectomeVisibilityMode") {
      this.setVisibilityMode(target.value);
      return;
    }
    if (target.id === "connectomeOffFilterMode") {
      this.setOutsideFilterMode(target.value, { fit: target.value === "hide" });
      return;
    }
    if (target.id === "connectomeLearningLevel") {
      this.state.learningLevel = target.value;
      this.renderDetail();
      this.renderTextAlternative();
      return;
    }
    if (target.matches("[data-modulatory-layer]")) {
      target.checked ? this.state.activeLayerIds.add(target.dataset.modulatoryLayer) : this.state.activeLayerIds.delete(target.dataset.modulatoryLayer);
      this.renderGraph();
      return;
    }
    if (target.matches("[data-network-layer]")) {
      target.checked ? this.state.activeNetworkLayerIds.add(target.dataset.networkLayer) : this.state.activeNetworkLayerIds.delete(target.dataset.networkLayer);
      this.renderGraph();
      return;
    }
    if (target.matches("[data-connection-layer]")) {
      target.checked ? this.state.activeConnectionLayerIds.add(target.dataset.connectionLayer) : this.state.activeConnectionLayerIds.delete(target.dataset.connectionLayer);
      this.renderGraph();
      return;
    }
    if (target.id === "connectomeAllConnections") {
      if (target.checked && !window.confirm("Este modo mostrara todas las conexiones cargadas y puede resultar denso. Puedes volver a desactivarlo en cualquier momento.")) {
        target.checked = false;
        return;
      }
      this.state.showAllConnections = target.checked;
      this.renderGraph({ fit: true, fitScope: "all" });
      return;
    }
    if (["connectomeSystemFilter", "connectomeNeurotransmitterFilter", "connectomeRegionFilter", "connectomeDirectionFilter", "connectomeTypeFilter", "connectomePlasticityFilter"].includes(target.id)) {
      this.applyFiltersFromUi();
    }
  }

  onRootInput(event) {
    if (event.target.id !== "connectomeSearch") return;
    if (this.searchFrame) cancelAnimationFrame(this.searchFrame);
    this.searchFrame = requestAnimationFrame(() => this.renderSearchResults(event.target.value));
  }

  onRootKeydown(event) {
    if (event.key === "Escape") {
      if (this.state.fullscreen || this.state.mapOnly) {
        this.exitExpandedView(event);
        return;
      }
      if (this.tourPlayer.snapshot().tourId) this.tourPlayer.stop();
      this.hideTransientUi();
      this.state.selectedNodeIds.clear();
      this.state.selectedConnectionId = null;
      this.state.detailOpen = false;
      this.renderAll();
    }
    const separator = event.target.closest?.("[data-resize-panel]");
    if (separator && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const side = separator.dataset.resizePanel;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const delta = side === "right" ? -direction * 16 : direction * 16;
      this.setPanelWidth(side, this.state[`${side}PanelWidth`] + delta);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.root.querySelector("#connectomeSearch")?.focus();
    }
  }

  handleAction(action, trigger) {
    const actions = {
      "clear-filters": () => this.clearFilters(),
      "find-path": () => this.findPath(),
      "compare-circuits": () => this.compareCircuits(),
      "start-tour": () => this.startSelectedTour(),
      "tour-prev": () => this.tourPlayer.previous(),
      "tour-next": () => this.tourPlayer.next(),
      "tour-play": () => this.tourPlayer.play(),
      "tour-pause": () => this.tourPlayer.pause(),
      "tour-close": () => this.tourPlayer.stop(),
      "fit-graph": () => this.fitAll(),
      "center-selection": () => this.centerSelection(),
      "reset-camera": () => this.renderer.reset?.(),
      "toggle-edge-labels": () => this.toggleEdgeLabels(trigger),
      "toggle-minimap": () => this.toggleMinimap(),
      "toggle-left-panel": () => this.togglePanel("left"),
      "toggle-right-panel": () => this.togglePanel("right"),
      "toggle-map-only": () => this.toggleMapOnly(),
      "toggle-fullscreen": () => this.toggleFullscreen(),
      "expand-next": () => this.expandNextLevel(),
      "expand-all": () => this.expandAll(),
      "collapse-all": () => this.collapseAll(),
      "close-detail": () => this.closeDetail(),
      "clear-isolation": () => this.clearIsolation(),
      "clear-lesion": () => this.clearLesion(),
      "isolate-node": () => this.isolateSelectedNode(),
      "isolate-circuit": () => this.isolateSelectedCircuit(),
      "center-node": () => this.centerSelectedNode(),
      "toggle-expand": () => this.toggleSelectedNodeExpansion(),
      "show-afferents": () => this.focusSelectedConnections("incoming"),
      "show-efferents": () => this.focusSelectedConnections("outgoing"),
      "show-node-circuits": () => this.focusSelectedCircuits(),
      "show-parent": () => this.selectParentRegion(),
      "prepare-route": () => this.prepareRouteFromSelection(),
      "lesion-node": () => this.lesionSelectedNode(),
      "lesion-edge": () => this.lesionSelectedConnection(),
      "follow-circuit": () => this.followSelectedCircuit(),
      "follow-route": () => this.followActiveRoute(),
      "open-physiology": () => this.openPhysiology(),
      "show-plasticity": () => this.showPlasticityMechanism(),
      "advance-learning": () => this.advanceLearningLevel(),
      "show-question-contract": () => this.showQuestionContract(),
      "context-connections": () => this.contextConnections(),
      "context-isolate": () => this.contextIsolate(),
      "context-center": () => this.contextCenter(),
      "context-follow": () => this.contextFollow(),
      "context-lesion": () => this.contextLesion()
    };
    actions[action]?.();
    if (action.startsWith("context-")) this.hideContextMenu();
  }

  setMode(mode) {
    this.state.mode = mode;
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
    if (mode === "aprendizaje") {
      this.state.learningLevel = "basico";
      this.root.querySelector("#connectomeLearningLevel").value = "basico";
      this.announce("Modo aprendizaje: primero veras una explicacion sencilla y podras aumentar el nivel.");
    }
    if (mode === "pregunta") {
      this.root.querySelector("#connectomePathTool").open = true;
      this.root.querySelector("#connectomePathOrigin")?.focus();
      this.showQuestionContract();
      this.schedulePersist();
      return;
    }
    this.renderDetail();
    this.schedulePersist();
  }

  advanceLearningLevel() {
    const order = EDUCATION_LEVELS.map((level) => level.id);
    const current = Math.max(0, order.indexOf(this.state.learningLevel));
    this.state.learningLevel = order[Math.min(order.length - 1, current + 1)];
    const control = this.root.querySelector("#connectomeLearningLevel");
    if (control) control.value = this.state.learningLevel;
    this.renderDetail();
  }

  resetMemoryOverview() {
    this.state.selectedCircuitId = null;
    this.state.selectedNodeIds.clear();
    this.state.selectedConnectionId = null;
    this.state.activeMemoryGroupId = null;
    this.state.layout = "memoria";
    this.state.isolation = null;
    this.state.journey = null;
    this.state.detailOpen = false;
    this.root.querySelector("#connectomeCircuitFilter").value = "";
    this.root.querySelector("#connectomeLayout").value = "memoria";
    this.root.querySelectorAll("[data-memory-group]").forEach((button) => button.classList.remove("is-active"));
    this.renderAll({ fit: true });
  }

  selectMemoryGroup(groupId) {
    const group = MEMORY_MAP_GROUPS.find((item) => item.id === groupId);
    if (!group) return;
    this.state.activeMemoryGroupId = this.state.activeMemoryGroupId === groupId ? null : groupId;
    this.state.selectedCircuitId = null;
    this.state.selectedNodeIds.clear();
    this.state.selectedConnectionId = null;
    this.state.detailOpen = false;
    this.state.layout = "memoria";
    this.root.querySelector("#connectomeCircuitFilter").value = "";
    this.root.querySelector("#connectomeLayout").value = "memoria";
    this.root.querySelectorAll("[data-memory-group]").forEach((button) => button.classList.toggle("is-active", button.dataset.memoryGroup === this.state.activeMemoryGroupId));
    this.renderAll({ fit: true });
  }

  selectNode(nodeId, multi = false) {
    if (!this.graph.hasNode(nodeId)) return;
    if (multi) {
      this.state.selectedNodeIds.has(nodeId) ? this.state.selectedNodeIds.delete(nodeId) : this.state.selectedNodeIds.add(nodeId);
    } else {
      this.state.selectedNodeIds = new Set([nodeId]);
    }
    this.state.selectedConnectionId = null;
    this.state.detailOpen = true;
    this.renderAll();
    this.renderer.centerNode?.(nodeId, { animate: !this.reducedMotionQuery?.matches });
    this.announce(`Seleccion: ${this.graph.getNode(nodeId).nombre}`);
  }

  selectConnection(connectionId) {
    if (!this.graph.hasConnection(connectionId)) return;
    this.state.selectedConnectionId = connectionId;
    this.state.selectedNodeIds.clear();
    this.state.detailOpen = true;
    this.renderAll();
    requestAnimationFrame(() => this.fitRelevant());
    this.announce(`Conexion seleccionada: ${this.graph.getConnection(connectionId).nombre}`);
  }

  selectCircuit(circuitId) {
    if (!this.graph.hasCircuit(circuitId)) return;
    this.state.selectedCircuitId = circuitId;
    this.state.selectedNodeIds.clear();
    this.state.selectedConnectionId = null;
    this.state.activeMemoryGroupId = null;
    this.state.layout = "flujo";
    this.state.detailOpen = true;
    this.root.querySelector("#connectomeCircuitFilter").value = circuitId;
    this.root.querySelector("#connectomeLayout").value = "flujo";
    this.root.querySelectorAll("[data-memory-group]").forEach((button) => button.classList.remove("is-active"));
    this.renderAll({ fit: true });
    this.announce(`Circuito: ${this.graph.getCircuit(circuitId).nombre}`);
  }

  onRendererSelection(payload) {
    if (!payload) return;
    if (payload.type === "node" || payload.nodeId) this.selectNode(payload.nodeId || payload.id, payload.multi);
    if (payload.type === "edge" || payload.connectionId || payload.edgeId) this.selectConnection(payload.connectionId || payload.edgeId || payload.id);
  }

  clearEntitySelection() {
    this.state.selectedNodeIds.clear();
    this.state.selectedConnectionId = null;
    this.state.detailOpen = false;
    this.hideTransientUi();
    this.renderAll();
  }

  toggleNodeExpansion(nodeId) {
    const children = this.graph.getChildren(nodeId);
    if (!this.graph.hasNode(nodeId) || !children.length) return;
    const expanded = !this.state.collapsedNodeIds.has(nodeId)
      && (this.state.expandedNodeIds.has(nodeId) || children.some((child) => this.currentView?.nodeIds?.has(child.id)));
    if (expanded) {
      this.state.expandedNodeIds.delete(nodeId);
      this.state.collapsedNodeIds.add(nodeId);
    } else {
      this.state.collapsedNodeIds.delete(nodeId);
      this.state.expandedNodeIds.add(nodeId);
    }
    this.renderGraph({ fit: true, fitScope: "all" });
    this.renderDetail();
  }

  toggleSelectedNodeExpansion() {
    const nodeId = [...this.state.selectedNodeIds][0];
    if (nodeId) this.toggleNodeExpansion(nodeId);
  }

  isNodeExpanded(nodeId) {
    if (this.state.collapsedNodeIds.has(nodeId)) return false;
    return this.state.expandedNodeIds.has(nodeId)
      || this.graph.getChildren(nodeId).some((child) => this.currentView?.nodeIds?.has(child.id));
  }

  applyFiltersFromUi() {
    const value = (id) => this.root.querySelector(`#${id}`)?.value || "";
    const tags = [...this.root.querySelectorAll("[data-topic-tag][aria-pressed='true']")].map((button) => button.dataset.topicTag);
    const criteria = {
      systems: value("connectomeSystemFilter"),
      neurotransmitters: value("connectomeNeurotransmitterFilter"),
      regions: value("connectomeRegionFilter"),
      directions: value("connectomeDirectionFilter"),
      connectionTypes: value("connectomeTypeFilter"),
      tags,
      plasticity: this.root.querySelector("#connectomePlasticityFilter")?.checked,
      mode: "all"
    };
    this.state.filterCriteria = criteria;
    this.state.filterResult = this.filters.filter(criteria);
    this.renderGraph();
    this.renderStatus();
  }

  clearFilters() {
    ["connectomeSystemFilter", "connectomeNeurotransmitterFilter", "connectomeRegionFilter", "connectomeDirectionFilter", "connectomeTypeFilter"].forEach((id) => {
      const control = this.root.querySelector(`#${id}`);
      if (control) control.value = "";
    });
    const plasticity = this.root.querySelector("#connectomePlasticityFilter");
    if (plasticity) plasticity.checked = false;
    this.root.querySelectorAll("[data-topic-tag]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    this.state.filterCriteria = {};
    this.state.filterResult = null;
    this.renderGraph();
    this.renderStatus();
  }

  renderSearchResults(query) {
    const box = this.root.querySelector("#connectomeSearchResults");
    if (!box) return;
    const result = this.search.search(query, { limit: 18, limitPerType: 8 });
    if (!query.trim() || !result.results.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.innerHTML = result.results.map((match) => {
      const item = match.item;
      const label = item.nombre || item.nombreCompleto || item.id;
      const meta = match.type === "region" ? labelForType(item.tipo) : match.type === "connection" ? "Conexion" : "Circuito";
      return `<button type="button" role="option" data-search-type="${match.type}" data-search-id="${escapeHtml(match.id)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(meta)}</span></button>`;
    }).join("");
    box.hidden = false;
  }

  activateSearchResult(type, id) {
    this.root.querySelector("#connectomeSearchResults").hidden = true;
    if (type === "region") {
      this.selectNode(id);
      requestAnimationFrame(() => this.renderer?.centerNode?.(id, {
        scale: Math.max(.82, this.renderer?.getViewport?.().scale || .82),
        animate: !this.reducedMotionQuery?.matches
      }));
    }
    if (type === "connection") this.selectConnection(id);
    if (type === "circuit") this.selectCircuit(id);
  }

  findPath() {
    const originId = this.root.querySelector("#connectomePathOrigin")?.value;
    const destinationId = this.root.querySelector("#connectomePathDestination")?.value;
    const allowedConnectionIds = new Set(this.graph.connectionList
      .filter((edge) => edge.claseEntidad !== "relacion_funcional")
      .map((edge) => edge.id));
    const lesion = this.state.lesion ? {
      excludedNodeIds: this.state.lesion.excludedNodeIds,
      excludedConnectionIds: this.state.lesion.excludedConnectionIds
    } : null;
    this.state.routePaths = this.pathfinder.findPaths(originId, destinationId, {
      maxDepth: 10,
      maxPaths: 5,
      shortestOnly: false,
      allowedConnectionIds,
      lesion
    });
    this.state.activeRouteIndex = 0;
    const box = this.root.querySelector("#connectomePathResults");
    if (!this.state.routePaths.length) {
      this.state.journey = null;
      box.innerHTML = `<p>No hay una ruta dirigida registrada con los criterios actuales. El mapa no inventa enlaces.</p>`;
      this.renderGraph();
      return;
    }
    box.innerHTML = this.state.routePaths.map((path, index) => `<button type="button" data-route-index="${index}"><strong>Ruta ${index + 1} · ${path.length} pasos</strong><span>${path.nodes.map((node) => node.nombre).join(" → ")}</span></button>`).join("");
    this.activateRoute(0);
  }

  activateRoute(index) {
    const route = this.state.routePaths[index];
    if (!route) return;
    this.state.activeRouteIndex = index;
    this.state.journey = {
      nodeIds: new Set(route.nodeIds),
      connectionIds: new Set(route.connectionIds),
      currentNodeId: route.nodeIds[0],
      currentConnectionId: null
    };
    this.root.querySelectorAll("[data-route-index]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.routeIndex) === index));
    this.renderGraph({ fit: true });
    this.renderTextAlternative();
  }

  followActiveRoute() {
    const route = this.state.routePaths[this.state.activeRouteIndex];
    if (!route) return;
    const pasos = route.nodeIds.map((nodeId, index) => ({
      nodeId,
      connectionId: index ? route.connectionIds[index - 1] : null,
      titulo: this.graph.getNode(nodeId)?.nombre || nodeId,
      texto: {
        basico: index ? this.graph.getConnection(route.connectionIds[index - 1])?.funcion || "Paso registrado." : "Origen de la ruta.",
        intermedio: index ? this.graph.getConnection(route.connectionIds[index - 1])?.importanciaAprendizaje || "Paso registrado." : "Origen de la ruta.",
        avanzado: index ? educationalSummary(this.graph.getConnection(route.connectionIds[index - 1]), "avanzado") : "Origen de la ruta."
      }
    }));
    const dynamic = { id: "__route__", nombre: "Ruta encontrada", pasos, velocidadMs: 3000, descargo: "Recorrido calculado solo con conexiones registradas; no demuestra que sea la unica ruta biologica." };
    this.tourPlayer.register(dynamic);
    this.tourPlayer.start(dynamic.id, { autoplay: !this.reducedMotionQuery?.matches });
  }

  compareCircuits() {
    const first = this.root.querySelector("#connectomeCompareA")?.value;
    const second = this.root.querySelector("#connectomeCompareB")?.value;
    const box = this.root.querySelector("#connectomeComparison");
    if (!first || !second || first === second) {
      box.innerHTML = "<p>Selecciona dos circuitos distintos.</p>";
      return;
    }
    const comparison = this.analysis.compareCircuits(first, second);
    this.state.comparison = comparison;
    const names = (items) => items.map((item) => item.nombre || item.id).join(", ") || "Ninguno";
    box.innerHTML = `
      <h4>Compartido</h4><p><b>Estructuras:</b> ${escapeHtml(names(comparison.shared.nodes))}</p>
      <p><b>Conexiones:</b> ${escapeHtml(names(comparison.shared.connections))}</p>
      <p><b>Neurotransmisores:</b> ${escapeHtml(comparison.shared.neurotransmitters.join(", ") || "Ninguno declarado")}</p>
      <details><summary>Exclusivo de ${escapeHtml(comparison.firstCircuit.nombre)}</summary><p>${escapeHtml(names(comparison.firstOnly.nodes))}</p></details>
      <details><summary>Exclusivo de ${escapeHtml(comparison.secondCircuit.nombre)}</summary><p>${escapeHtml(names(comparison.secondOnly.nodes))}</p></details>`;
    this.state.journey = {
      nodeIds: comparison.sharedNodeIds,
      connectionIds: comparison.sharedConnectionIds,
      currentNodeId: null,
      currentConnectionId: null
    };
    this.renderGraph({ fit: true });
  }

  startSelectedTour() {
    const id = this.root.querySelector("#connectomeTourSelect")?.value;
    if (id) this.tourPlayer.start(id, { autoplay: false });
  }

  followSelectedCircuit() {
    let circuit = this.graph.getCircuit(this.state.selectedCircuitId);
    if (this.state.selectedConnectionId) {
      const related = this.graph.getConnectionRelations(this.state.selectedConnectionId).circuits || [];
      if (!related.some((item) => item.id === circuit?.id)) circuit = null;
      circuit ||= related.find((item) => CONNECTOME_DATA.recorridos.some((tour) => tour.circuitoId === item.id))
        || related.find((item) => item.secuenciaConexiones?.includes(this.state.selectedConnectionId))
        || related[0]
        || null;
    }
    if (!circuit) {
      this.announce("Esta conexion no tiene un circuito ordenado registrado para seguir.");
      return;
    }
    if (circuit.id !== this.state.selectedCircuitId) {
      this.state.selectedCircuitId = circuit.id;
      this.state.activeMemoryGroupId = null;
      this.state.layout = "flujo";
      this.root.querySelector("#connectomeCircuitFilter").value = circuit.id;
      this.root.querySelector("#connectomeLayout").value = "flujo";
      this.root.querySelectorAll("[data-memory-group]").forEach((button) => button.classList.remove("is-active"));
      this.renderAll({ fit: true });
    }
    const existing = CONNECTOME_DATA.recorridos.find((tour) => tour.circuitoId === circuit.id);
    if (existing) {
      this.tourPlayer.start(existing.id, { autoplay: false });
      return;
    }
    if (!circuit.secuencia?.length) {
      this.announce(`${circuit.nombre} es una red distribuida y no declara una secuencia lineal.`);
      return;
    }
    const steps = circuit.secuencia.map((nodeId, index) => {
      const connectionId = index ? circuit.secuenciaConexiones[index - 1] : null;
      const edge = connectionId ? this.graph.getConnection(connectionId) : null;
      return {
        nodeId,
        connectionId,
        titulo: this.graph.getNode(nodeId)?.nombre || nodeId,
        texto: { basico: edge?.funcion || circuit.descripcion, intermedio: edge?.importanciaAprendizaje || circuit.descripcion, avanzado: educationalSummary(edge || circuit, "avanzado") }
      };
    });
    const dynamic = { id: "__circuit__", nombre: circuit.nombre, pasos: steps, velocidadMs: 3400, descargo: "Secuencia educativa basada en el orden declarado del circuito." };
    this.tourPlayer.register(dynamic);
    this.tourPlayer.start(dynamic.id);
  }

  onTourStep(step, snapshot) {
    if (!step) {
      this.state.journey = null;
      this.renderGraph();
      return;
    }
    const tour = snapshot.tour;
    const traversedNodes = new Set(tour.pasos.slice(0, snapshot.index + 1).map((item) => item.nodeId).filter(Boolean));
    const traversedEdges = new Set(tour.pasos.slice(0, snapshot.index + 1).map((item) => item.connectionId).filter(Boolean));
    this.state.journey = {
      nodeIds: traversedNodes,
      connectionIds: traversedEdges,
      currentNodeId: step.nodeId,
      currentConnectionId: step.connectionId
    };
    this.renderGraph();
    if (step.nodeId) this.renderer.centerNode?.(step.nodeId, { animate: !this.reducedMotionQuery?.matches });
  }

  renderTourBar(snapshot = this.tourPlayer.snapshot()) {
    const bar = this.root.querySelector("#connectomeTour");
    if (!bar) return;
    if (!snapshot.tourId || !snapshot.step) {
      bar.hidden = true;
      this.state.journey = null;
      this.renderGraph();
      return;
    }
    const level = this.state.learningLevel;
    const text = snapshot.step.text?.[level] || snapshot.step.text?.intermedio || snapshot.step.text?.basico || "";
    bar.innerHTML = `
      <div><span class="kicker">${escapeHtml(snapshot.tour.nombre)} · ${snapshot.index + 1}/${snapshot.total}</span><h3>${escapeHtml(snapshot.step.titulo)}</h3><p>${escapeHtml(text)}</p>
      ${snapshot.tour.descargo ? `<small>${escapeHtml(snapshot.tour.descargo)}</small>` : ""}</div>
      <div class="connectome-tour-actions">
        <button type="button" data-action="tour-prev" ${snapshot.index === 0 ? "disabled" : ""}>Anterior</button>
        ${snapshot.playing ? `<button type="button" data-action="tour-pause">Pausa</button>` : `<button type="button" data-action="tour-play" ${snapshot.reducedMotion ? "disabled title='Desactivado por reducir movimiento'" : ""}>Reproduccion automatica</button>`}
        <button type="button" data-action="tour-next">Siguiente</button><button type="button" data-action="tour-close" aria-label="Cerrar recorrido">Cerrar</button>
      </div>`;
    bar.hidden = false;
  }

  isolateSelectedNode() {
    const id = [...this.state.selectedNodeIds][0];
    if (!id) return;
    this.state.isolation = this.analysis.isolateNode(id, { depth: 1, direction: "both" });
    this.root.querySelector("[data-action='clear-isolation']").hidden = false;
    this.renderGraph({ fit: true });
  }

  isolateSelectedCircuit() {
    const id = this.state.selectedCircuitId;
    if (!id) return;
    this.state.isolation = this.analysis.isolateCircuit(id);
    this.root.querySelector("[data-action='clear-isolation']").hidden = false;
    this.renderGraph({ fit: true });
  }

  clearIsolation() {
    this.state.isolation = null;
    this.root.querySelector("[data-action='clear-isolation']").hidden = true;
    this.renderGraph({ fit: true });
  }

  lesionSelectedNode() {
    const id = [...this.state.selectedNodeIds][0];
    if (!id) return;
    this.state.lesion = this.analysis.simulateNodeLesion(id);
    this.state.detailOpen = true;
    this.root.querySelector("[data-action='clear-lesion']").hidden = false;
    this.renderGraph();
    this.renderLesionDetail();
  }

  lesionSelectedConnection() {
    const id = this.state.selectedConnectionId;
    if (!id) return;
    this.state.lesion = this.analysis.simulateConnectionLesion(id);
    this.state.detailOpen = true;
    this.root.querySelector("[data-action='clear-lesion']").hidden = false;
    this.renderGraph();
    this.renderLesionDetail();
  }

  clearLesion() {
    this.state.lesion = null;
    this.root.querySelector("[data-action='clear-lesion']").hidden = true;
    this.renderAll();
  }

  renderLesionDetail() {
    const lesion = this.state.lesion;
    const panel = this.root.querySelector("#connectomeDetail");
    if (!lesion || !panel) return;
    const lesionName = lesion.node?.nombre || lesion.connection?.nombre || lesion.lesion?.item?.nombre || lesion.lesion?.id;
    const interrupted = [...(lesion.interruptedCircuits || [])].map((item) => item.nombre);
    panel.innerHTML = `
      <div class="connectome-detail-head"><div><span class="kicker">Simulacion de lesion · educativa</span><h3>${escapeHtml(lesionName)}</h3></div><button type="button" data-action="clear-lesion">Cerrar</button></div>
      <p>La entidad se atenua y el analisis retira temporalmente sus conexiones del grafo. Esto no predice un cuadro clinico individual.</p>
      <h4>Funciones potencialmente afectadas</h4>${listMarkup(lesion.affectedFunctions)}
      <h4>Circuitos interrumpidos</h4>${listMarkup(interrupted, "Ninguno queda completamente interrumpido segun las secuencias registradas.")}
      <h4>Analisis de red</h4><p>Componentes restantes: <b>${lesion.componentCount}</b>. ${lesion.componentCountChanged ? "La fragmentacion del grafo cambio." : "No cambio el numero global de componentes, aunque pueden perderse rutas dirigidas."}</p>
      <details><summary>Detalle avanzado</summary><p>Conexiones retiradas: ${lesion.excludedConnectionIds?.size || 0}. Nodos retirados: ${lesion.excludedNodeIds?.size || 0}.</p></details>`;
    this.decorateDetailPanel();
  }

  centerSelectedNode({ animate = !this.reducedMotionQuery?.matches } = {}) {
    const id = [...this.state.selectedNodeIds][0];
    if (id) this.renderer.centerNode?.(id, { animate });
  }

  openPhysiology() {
    const node = this.graph.getNode([...this.state.selectedNodeIds][0]);
    const edge = this.graph.getConnection(this.state.selectedConnectionId);
    const detail = {
      source: "connectome",
      structureId: node?.id || null,
      connectionId: edge?.id || null,
      targets: node?.fisiologiaTargets || (edge?.plasticidad ? ["plasticidad_ltp", "sinapsis_glutamatergica"] : ["potencial_accion"])
    };
    this.root.dispatchEvent(new CustomEvent("neuro-connectome:open-physiology", { bubbles: true, detail }));
    this.onOpenPhysiology?.(detail);
  }

  showPlasticityMechanism() {
    const panel = this.root.querySelector("#connectomeDetail");
    this.state.detailOpen = true;
    panel.innerHTML = `<div class="connectome-detail-head"><div><span class="kicker">Plasticidad</span><h3>De la via a la sinapsis</h3></div></div>
      <p>${escapeHtml(PLASTICITY_EDUCATION.hebb)}</p><h4>LTP</h4><p>${escapeHtml(PLASTICITY_EDUCATION.ltp)}</p>
      <h4>LTD</h4><p>${escapeHtml(PLASTICITY_EDUCATION.ltd)}</p><h4>CA3 → CA1</h4><p>${escapeHtml(PLASTICITY_EDUCATION.ca1)}</p>
      <p class="connectome-disclaimer">${escapeHtml(PLASTICITY_EDUCATION.descargo)}</p>
      <button type="button" data-action="open-physiology">Ver mecanismo celular en el laboratorio</button>`;
    this.decorateDetailPanel();
  }

  showQuestionContract() {
    const contract = this.questionBridge.getContract();
    const panel = this.root.querySelector("#connectomeDetail");
    this.state.detailOpen = true;
    panel.innerHTML = `<span class="kicker">Modo pregunta · interfaz local</span><h3>Preparado para SOFIA</h3>
      <p>En esta fase puedes buscar una ruta, un circuito o conexiones de una estructura. No se llama a una IA remota.</p>
      <p><b>Contrato ${escapeHtml(contract.version)}:</b> cualquier futura respuesta debera devolver IDs existentes y el mapa rechazara IDs o conexiones inventadas.</p>
      ${listMarkup(contract.intents.map(slugText))}${listMarkup(contract.constraints)}`;
    this.decorateDetailPanel();
  }

  toggleEdgeLabels(trigger) {
    this.state.showEdgeLabels = !this.state.showEdgeLabels;
    trigger?.setAttribute("aria-pressed", String(this.state.showEdgeLabels));
    const actionLabel = this.state.showEdgeLabels ? "Ocultar etiquetas de vias" : "Mostrar etiquetas de vias";
    trigger?.setAttribute("aria-label", actionLabel);
    trigger?.setAttribute("title", actionLabel);
    this.renderGraph();
  }

  fitAll({ animate = !this.reducedMotionQuery?.matches } = {}) {
    const view = this.currentView || this.buildView();
    const insets = this.fitInsets(68);
    return this.renderer?.fit?.({
      scope: "all",
      nodeIds: view.nodeIds,
      edgeIds: view.connectionIds,
      activeCircuit: false,
      ignoreDimmed: false,
      allowTinyScale: true,
      insets,
      animate
    });
  }

  fitRelevant({ animate = !this.reducedMotionQuery?.matches } = {}) {
    const nodeIds = new Set();
    const edgeIds = new Set();
    if (this.state.selectedCircuitId) {
      this.graph.getCircuitNodeIds(this.state.selectedCircuitId).forEach((id) => nodeIds.add(id));
      this.graph.getCircuitConnectionIds(this.state.selectedCircuitId).forEach((id) => edgeIds.add(id));
    }
    if (this.state.activeMemoryGroupId) {
      const group = MEMORY_MAP_GROUPS.find((item) => item.id === this.state.activeMemoryGroupId);
      group?.circuitos.forEach((id) => {
        this.graph.getCircuitNodeIds(id).forEach((nodeId) => nodeIds.add(nodeId));
        this.graph.getCircuitConnectionIds(id).forEach((edgeId) => edgeIds.add(edgeId));
      });
    }
    this.state.journey?.nodeIds?.forEach((id) => nodeIds.add(id));
    this.state.journey?.connectionIds?.forEach((id) => edgeIds.add(id));
    this.state.selectedNodeIds.forEach((id) => nodeIds.add(id));
    if (this.state.selectedConnectionId) {
      const edge = this.graph.getConnection(this.state.selectedConnectionId);
      if (edge) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.origen);
        nodeIds.add(edge.destino);
      }
    }
    if (!nodeIds.size) return this.fitAll({ animate });
    return this.renderer?.fit?.({ scope: "relevant", nodeIds, edgeIds, ignoreDimmed: false, allowTinyScale: true, insets: this.fitInsets(64), animate });
  }

  fitInsets(basePadding) {
    const insets = { top: basePadding, right: basePadding, bottom: basePadding, left: basePadding };
    if (this.state.minimapVisible) insets.bottom += window.innerWidth <= 720 ? 118 : 154;
    const tabletOverlay = (this.detailOverlayQuery?.matches ?? window.innerWidth <= 1180)
      && window.innerWidth > 720
      && this.state.detailOpen
      && !this.state.rightPanelCollapsed
      && !this.state.mapOnly
      && !this.state.fullscreen;
    if (tabletOverlay) insets.right += Math.min(this.state.rightPanelWidth, Math.max(260, window.innerWidth * .38));
    return insets;
  }

  centerSelection() {
    const nodeId = [...this.state.selectedNodeIds][0];
    if (nodeId) return this.renderer?.centerNode?.(nodeId, { animate: !this.reducedMotionQuery?.matches });
    if (this.state.selectedConnectionId || this.state.selectedCircuitId || this.state.journey) return this.fitRelevant();
    return this.fitAll();
  }

  toggleMinimap() {
    this.state.minimapVisible = !this.state.minimapVisible;
    this.syncPresentationState();
    this.minimap?.setVisible?.(this.state.minimapVisible);
    this.reflowAfterChromeChange({ fit: true });
  }

  togglePanel(side) {
    const key = side === "right" ? "rightPanelCollapsed" : "leftPanelCollapsed";
    const overlay = this.detailOverlayQuery?.matches ?? window.innerWidth <= 1180;
    if (side === "right" && overlay) {
      const visible = !this.state.rightPanelCollapsed && this.state.detailOpen;
      this.state.rightPanelCollapsed = false;
      this.state.detailOpen = !visible;
    } else {
      this.state[key] = !this.state[key];
      if (side === "right" && !this.state[key]) this.state.detailOpen = true;
    }
    this.syncPresentationState();
    this.reflowAfterChromeChange({ fit: true });
  }

  setPanelWidth(side, width) {
    if (!PANEL_WIDTH_LIMITS[side]) return;
    const key = `${side}PanelWidth`;
    this.state[key] = clampNumber(width, ...PANEL_WIDTH_LIMITS[side], this.state[key]);
    this.root.style.setProperty(`--connectome-${side}-width`, `${this.state[key]}px`);
    const separator = this.root.querySelector(`[data-resize-panel='${side}']`);
    separator?.setAttribute("aria-valuenow", String(Math.round(this.state[key])));
    this.renderer?.refreshSize?.({ fit: false });
    this.schedulePersist();
  }

  startPanelResize(event) {
    const separator = event.target.closest?.("[data-resize-panel]");
    if (!separator || event.button !== 0) return;
    const side = separator.dataset.resizePanel;
    this.resizeState = { side, pointerId: event.pointerId, startX: event.clientX, startWidth: this.state[`${side}PanelWidth`] };
    this.root.classList.add("is-resizing-panels");
    separator.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  resizePanel(event) {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) return;
    const direction = this.resizeState.side === "right" ? -1 : 1;
    this.setPanelWidth(this.resizeState.side, this.resizeState.startWidth + (event.clientX - this.resizeState.startX) * direction);
  }

  finishPanelResize() {
    if (!this.resizeState) return;
    this.resizeState = null;
    this.root.classList.remove("is-resizing-panels");
    this.reflowAfterChromeChange({ fit: false });
  }

  toggleMapOnly() {
    this.state.mapOnly = !this.state.mapOnly;
    this.syncPresentationState();
    this.reflowAfterChromeChange({ fit: true });
    this.announce(this.state.mapOnly ? "Modo Solo mapa activado." : "Modo Solo mapa desactivado.");
  }

  async toggleFullscreen() {
    if (this.state.fullscreen) {
      if (document.fullscreenElement === this.root && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.info("[Connectome] No se pudo cerrar Fullscreen API; se reconcilia el estado visible.", error?.name || error);
          this.onFullscreenChange();
        }
      } else {
        this.state.fullscreen = false;
        this.state.maximizedFallback = false;
        document.body.classList.remove("connectome-maximized-active");
        this.syncPresentationState();
        this.reflowAfterChromeChange({ fit: true });
      }
      return;
    }
    try {
      if (this.root.requestFullscreen) {
        await this.root.requestFullscreen();
        return;
      }
    } catch (error) {
      console.info("[Connectome] Fullscreen API no disponible; se usa modo maximizado.", error?.name || error);
    }
    this.state.fullscreen = true;
    this.state.maximizedFallback = true;
    document.body.classList.add("connectome-maximized-active");
    this.syncPresentationState();
    this.reflowAfterChromeChange({ fit: true });
  }

  onFullscreenChange() {
    const nativeActive = document.fullscreenElement === this.root;
    if (document.fullscreenElement && !nativeActive) return;
    this.state.fullscreen = nativeActive || this.state.maximizedFallback;
    if (!nativeActive && !this.state.maximizedFallback) document.body.classList.remove("connectome-maximized-active");
    this.syncPresentationState();
    this.reflowAfterChromeChange({ fit: true });
  }

  exitExpandedView(event) {
    event?.preventDefault?.();
    if (this.state.fullscreen) {
      this.toggleFullscreen();
      return;
    }
    if (this.state.mapOnly) this.toggleMapOnly();
  }

  reflowAfterChromeChange({ fit = true } = {}) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.renderer?.refreshSize?.({ fit: false });
      if (fit) this.fitAll({ animate: false });
      this.minimap?.sync?.();
      this.schedulePersist();
    }));
  }

  expandNextLevel() {
    const current = Math.max(0, SCALE_ORDER.indexOf(this.state.scale));
    this.state.scale = SCALE_ORDER[Math.min(SCALE_ORDER.length - 1, current + 1)];
    const control = this.root.querySelector("#connectomeScale");
    if (control) control.value = this.state.scale;
    this.renderGraph({ fit: true, fitScope: "all" });
  }

  setVisibilityMode(mode, { fit = true } = {}) {
    if (!VISIBILITY_MODES.some((item) => item.id === mode)) return false;
    this.state.visibilityMode = mode;
    const control = this.root.querySelector("#connectomeVisibilityMode");
    if (control) control.value = mode;
    this.renderGraph({ fit, fitScope: mode === "all" ? "all" : "relevant" });
    return true;
  }

  setOutsideFilterMode(mode, { fit = false } = {}) {
    if (!OFF_FILTER_MODES.some((item) => item.id === mode)) return false;
    this.state.offFilterMode = mode;
    const control = this.root.querySelector("#connectomeOffFilterMode");
    if (control) control.value = mode;
    this.renderGraph({ fit, fitScope: "all" });
    return true;
  }

  expandAll() {
    this.state.scale = "subcampo";
    this.state.collapsedNodeIds.clear();
    this.state.expandedNodeIds = new Set(this.graph.regionList.filter((node) => this.graph.getChildren(node.id).length).map((node) => node.id));
    const control = this.root.querySelector("#connectomeScale");
    if (control) control.value = this.state.scale;
    this.renderGraph({ fit: true, fitScope: "all" });
    this.announce("Todas las subestructuras anatomicas cargadas estan expandidas.");
  }

  collapseAll() {
    this.state.scale = "region";
    this.state.expandedNodeIds.clear();
    this.state.collapsedNodeIds = new Set(this.graph.regionList
      .filter((node) => this.nodeDepth(node) >= 3 && this.nodeDepth(node) <= 4 && this.graph.getChildren(node.id).length)
      .map((node) => node.id));
    const control = this.root.querySelector("#connectomeScale");
    if (control) control.value = this.state.scale;
    this.renderGraph({ fit: true, fitScope: "all" });
    this.announce("Subestructuras contraidas. Los datos permanecen disponibles.");
  }

  focusSelectedConnections(direction) {
    const nodeId = [...this.state.selectedNodeIds][0];
    if (!nodeId) return;
    const relations = this.graph.getRegionRelations(nodeId);
    const edges = direction === "incoming" ? relations.incoming : relations.outgoing;
    this.state.journey = {
      nodeIds: new Set([nodeId, ...edges.flatMap((edge) => [edge.origen, edge.destino])]),
      connectionIds: new Set(edges.map((edge) => edge.id)),
      currentNodeId: nodeId,
      currentConnectionId: null
    };
    this.renderGraph({ fit: true, fitScope: "relevant" });
  }

  focusSelectedCircuits() {
    const nodeId = [...this.state.selectedNodeIds][0];
    const circuits = nodeId ? this.graph.getCircuitMembershipsForRegion(nodeId) : [];
    if (circuits.length === 1) return this.selectCircuit(circuits[0].id);
    const nodeIds = new Set([nodeId]);
    const connectionIds = new Set();
    circuits.forEach((circuit) => {
      this.graph.getCircuitNodeIds(circuit.id).forEach((id) => nodeIds.add(id));
      this.graph.getCircuitConnectionIds(circuit.id).forEach((id) => connectionIds.add(id));
    });
    this.state.journey = { nodeIds, connectionIds, currentNodeId: nodeId, currentConnectionId: null };
    this.renderGraph({ fit: true, fitScope: "relevant" });
  }

  selectParentRegion() {
    const node = this.graph.getNode([...this.state.selectedNodeIds][0]);
    if (node?.regionPadre) this.selectNode(node.regionPadre);
  }

  prepareRouteFromSelection() {
    const nodeId = [...this.state.selectedNodeIds][0];
    if (!nodeId) return;
    const origin = this.root.querySelector("#connectomePathOrigin");
    const tool = this.root.querySelector("#connectomePathTool");
    if (origin) origin.value = nodeId;
    if (tool) tool.open = true;
    this.root.querySelector("#connectomePathDestination")?.focus();
  }

  buildView() {
    const layerConnectionIds = new Set();
    const layerNodeIds = new Set();
    this.state.activeLayerIds.forEach((layerId) => {
      const layer = MODULATORY_LAYERS.find((item) => item.id === layerId);
      layer?.conexiones?.forEach((id) => layerConnectionIds.add(id));
      layer?.nodos?.forEach((id) => layerNodeIds.add(id));
    });
    const networkNodeIds = new Set();
    const networkConnectionIds = new Set();
    const networks = CONNECTOME_DATA.redesFuncionales || CONNECTOME_DATA.capasRedes || [];
    this.state.activeNetworkLayerIds.forEach((layerId) => {
      const layer = networks.find((item) => item.id === layerId);
      (layer?.nodos || []).forEach((id) => networkNodeIds.add(id));
      (layer?.conexiones || []).forEach((id) => networkConnectionIds.add(id));
    });
    const chemistryConnectionIds = this.getChemistryConnectionIds();
    const circuitNodeIds = new Set();
    const circuitConnectionIds = new Set();
    if (this.state.selectedCircuitId) {
      this.graph.getCircuitNodeIds(this.state.selectedCircuitId).forEach((id) => circuitNodeIds.add(id));
      this.graph.getCircuitConnectionIds(this.state.selectedCircuitId).forEach((id) => circuitConnectionIds.add(id));
    }
    if (this.state.activeMemoryGroupId) {
      const group = MEMORY_MAP_GROUPS.find((item) => item.id === this.state.activeMemoryGroupId);
      group?.circuitos.forEach((id) => {
        this.graph.getCircuitNodeIds(id).forEach((nodeId) => circuitNodeIds.add(nodeId));
        this.graph.getCircuitConnectionIds(id).forEach((edgeId) => circuitConnectionIds.add(edgeId));
      });
    }
    const forcedConnectionIds = union(
      layerConnectionIds,
      networkConnectionIds,
      chemistryConnectionIds,
      circuitConnectionIds,
      this.state.filterResult?.active ? this.state.filterResult.matchedConnectionIds : EMPTY_SET,
      this.state.isolation?.connectionIds || this.state.isolation?.matched?.connectionIds || EMPTY_SET,
      this.state.journey?.connectionIds || EMPTY_SET,
      this.state.selectedConnectionId ? new Set([this.state.selectedConnectionId]) : EMPTY_SET
    );
    let connections = this.graph.connectionList.filter((edge) => {
      if (this.state.showAllConnections || forcedConnectionIds.has(edge.id)) return true;
      if (edge.claseEntidad === "senal_moduladora") return false;
      if (edge.claseEntidad === "relacion_funcional" || edge.tipo === "conectividad_funcional") return false;
      return true;
    });

    const depthLimit = SCALE_LIMIT[this.state.scale] ?? 8;
    const focusNodeIds = union(circuitNodeIds, networkNodeIds, layerNodeIds, this.state.journey?.nodeIds || EMPTY_SET, this.state.selectedNodeIds);
    forcedConnectionIds.forEach((id) => {
      const edge = this.graph.getConnection(id);
      if (edge) {
        focusNodeIds.add(edge.origen);
        focusNodeIds.add(edge.destino);
      }
    });
    const selectedEdge = this.graph.getConnection(this.state.selectedConnectionId);
    if (selectedEdge) {
      focusNodeIds.add(selectedEdge.origen);
      focusNodeIds.add(selectedEdge.destino);
    }
    let nodeIds = new Set(this.graph.regionList.filter((node) => {
      if (this.nodeDepth(node) <= depthLimit || focusNodeIds.has(node.id)) return true;
      return Boolean(node.regionPadre && this.state.expandedNodeIds.has(node.regionPadre));
    }).map((node) => node.id));

    if (this.state.visibilityMode !== "all") {
      let allowedNodes = circuitNodeIds.size
        ? new Set(circuitNodeIds)
        : union(this.state.selectedNodeIds, this.state.journey?.nodeIds || EMPTY_SET);
      let protagonistNodes = new Set();
      if (this.state.selectedCircuitId) {
        const circuit = this.graph.getCircuit(this.state.selectedCircuitId);
        (circuit?.nodosProtagonistas || circuit?.secuencia || circuit?.nodos || []).forEach((id) => protagonistNodes.add(id));
      }
      if (this.state.activeMemoryGroupId) protagonistNodes = new Set(circuitNodeIds);
      if (this.state.visibilityMode === "protagonists") allowedNodes = protagonistNodes;
      if (this.state.visibilityMode === "selection") {
        allowedNodes = new Set(this.state.selectedNodeIds);
        if (selectedEdge) {
          allowedNodes.add(selectedEdge.origen);
          allowedNodes.add(selectedEdge.destino);
        }
      }
      if (this.state.visibilityMode === "related") {
        const related = new Set(allowedNodes);
        this.graph.connectionList.forEach((edge) => {
          if (allowedNodes.has(edge.origen) || allowedNodes.has(edge.destino)) {
            related.add(edge.origen);
            related.add(edge.destino);
          }
        });
        allowedNodes = related;
      }
      this.state.selectedNodeIds.forEach((id) => allowedNodes.add(id));
      if (selectedEdge) {
        allowedNodes.add(selectedEdge.origen);
        allowedNodes.add(selectedEdge.destino);
      }
      allowedNodes.forEach((id) => nodeIds.add(id));
      nodeIds = intersect(nodeIds, allowedNodes);
    }

    if (this.state.isolation) {
      const allowedNodes = this.state.isolation.nodeIds || this.state.isolation.matched?.nodeIds || new Set();
      const allowedEdges = this.state.isolation.connectionIds || this.state.isolation.matched?.connectionIds || new Set();
      nodeIds = intersect(nodeIds, allowedNodes);
      connections = connections.filter((edge) => allowedEdges.has(edge.id));
    }

    for (const collapsedId of this.state.collapsedNodeIds) {
      const parentWasVisible = nodeIds.has(collapsedId);
      const hidden = this.graph.getDescendantIds(collapsedId);
      hidden.forEach((id) => {
        if (!focusNodeIds.has(id)) nodeIds.delete(id);
      });
      if (!parentWasVisible) nodeIds.delete(collapsedId);
    }
    this.state.selectedNodeIds.forEach((id) => nodeIds.add(id));
    connections = connections.filter((edge) => nodeIds.has(edge.origen) && nodeIds.has(edge.destino));
    if (["circuit", "protagonists"].includes(this.state.visibilityMode) && circuitConnectionIds.size) {
      connections = connections.filter((edge) => circuitConnectionIds.has(edge.id) || edge.id === this.state.selectedConnectionId);
    } else if (this.state.visibilityMode === "selection") {
      connections = connections.filter((edge) => edge.id === this.state.selectedConnectionId);
    } else if (this.state.visibilityMode === "related") {
      const anchors = circuitNodeIds.size ? circuitNodeIds : union(this.state.selectedNodeIds, this.state.journey?.nodeIds || EMPTY_SET);
      if (anchors.size) connections = connections.filter((edge) => anchors.has(edge.origen) || anchors.has(edge.destino));
    }

    if (this.state.activeConnectionLayerIds.size && this.state.offFilterMode === "hide") {
      connections = connections.filter((edge) => chemistryConnectionIds.has(edge.id) || forcedConnectionIds.has(edge.id));
    }
    if (this.state.filterResult?.active && this.state.offFilterMode === "hide") {
      const matchedEdges = this.state.filterResult.matchedConnectionIds || EMPTY_SET;
      const matchedNodes = union(this.state.filterResult.matchedNodeIds || EMPTY_SET, this.state.selectedNodeIds);
      connections = connections.filter((edge) => matchedEdges.has(edge.id));
      connections.forEach((edge) => { matchedNodes.add(edge.origen); matchedNodes.add(edge.destino); });
      nodeIds = intersect(nodeIds, matchedNodes);
    }

    const hierarchyConnectionIds = new Set();
    if (this.state.layout === "jerarquico" || ["sistema", "region"].includes(this.state.scale)) {
      (this.hierarchyConnections || []).forEach((edge) => {
        if (!nodeIds.has(edge.origen) || !nodeIds.has(edge.destino)) return;
        connections.push(edge);
        hierarchyConnectionIds.add(edge.id);
      });
    }
    const connectionIds = new Set(connections.map((edge) => edge.id));
    const nodes = this.graph.regionList.filter((node) => nodeIds.has(node.id));
    return { nodes, connections, nodeIds, connectionIds, hierarchyConnectionIds, focusNodeIds, circuitNodeIds, circuitConnectionIds, networkNodeIds, networkConnectionIds, chemistryConnectionIds, layerNodeIds, layerConnectionIds };
  }

  getChemistryConnectionIds() {
    if (!this.state.activeConnectionLayerIds.size) return new Set();
    const activeLayers = CONNECTION_CHEMISTRY_LAYERS.filter((layer) => this.state.activeConnectionLayerIds.has(layer.id));
    return new Set(this.graph.connectionList.filter((edge) => {
      const transmitter = String(edge.neurotransmisorPrincipal || "").toLowerCase();
      return activeLayers.some((layer) => (
        layer.id === "no_especificada"
          ? edge.claseEntidad !== "relacion_funcional"
            && edge.tipo !== "conectividad_funcional"
            && (!transmitter || layer.tokens.some((token) => transmitter.includes(token)))
          : layer.tokens.some((token) => transmitter.includes(token))
      ));
    }).map((edge) => edge.id));
  }

  nodeDepth(node) {
    if (!node) return 99;
    return TYPE_DEPTH[node.nivelAnatomico] ?? TYPE_DEPTH[node.tipo] ?? Math.min(8, this.graph.getAncestorIds(node.id).size + 1);
  }

  buildHighlights(view) {
    let dimmedNodeIds = new Set();
    let dimmedConnectionIds = new Set();
    if (this.state.offFilterMode === "dim" && this.state.filterResult?.active) {
      dimmedNodeIds = intersect(this.state.filterResult.dimmedNodeIds, view.nodeIds);
      dimmedConnectionIds = intersect(this.state.filterResult.dimmedConnectionIds, view.connectionIds);
    }
    if (this.state.offFilterMode === "dim" && this.state.selectedCircuitId) {
      dimmedNodeIds = union(dimmedNodeIds, difference(view.nodeIds, view.circuitNodeIds));
      dimmedConnectionIds = union(dimmedConnectionIds, difference(view.connectionIds, view.circuitConnectionIds));
    }
    if (this.state.offFilterMode === "dim" && this.state.activeMemoryGroupId) {
      dimmedNodeIds = union(dimmedNodeIds, difference(view.nodeIds, view.circuitNodeIds));
      dimmedConnectionIds = union(dimmedConnectionIds, difference(view.connectionIds, view.circuitConnectionIds));
    }
    if (this.state.offFilterMode === "dim" && this.state.activeNetworkLayerIds.size) {
      dimmedNodeIds = union(dimmedNodeIds, difference(view.nodeIds, view.networkNodeIds));
      dimmedConnectionIds = union(dimmedConnectionIds, difference(view.connectionIds, view.networkConnectionIds));
    }
    if (this.state.offFilterMode === "dim" && this.state.activeConnectionLayerIds.size) {
      dimmedConnectionIds = union(dimmedConnectionIds, difference(view.connectionIds, view.chemistryConnectionIds));
    }
    if (this.state.offFilterMode === "dim" && this.state.showAllConnections) {
      dimmedConnectionIds = union(dimmedConnectionIds, view.connectionIds);
    }
    view.focusNodeIds?.forEach((id) => dimmedNodeIds.delete(id));
    union(view.networkConnectionIds, view.chemistryConnectionIds, view.layerConnectionIds, view.circuitConnectionIds, this.state.filterResult?.matchedConnectionIds)
      .forEach((id) => dimmedConnectionIds.delete(id));
    this.state.journey?.connectionIds?.forEach((id) => dimmedConnectionIds.delete(id));
    if (this.state.selectedConnectionId) dimmedConnectionIds.delete(this.state.selectedConnectionId);
    return {
      selectedNodeIds: intersect(this.state.selectedNodeIds, view.nodeIds),
      selectedEdgeIds: this.state.selectedConnectionId ? new Set([this.state.selectedConnectionId]) : new Set(),
      highlightedNodeIds: intersect(union(view.networkNodeIds, view.layerNodeIds, view.circuitNodeIds, this.state.filterResult?.matchedNodeIds), view.nodeIds),
      highlightedEdgeIds: intersect(union(view.networkConnectionIds, view.chemistryConnectionIds, view.layerConnectionIds, view.circuitConnectionIds, this.state.filterResult?.matchedConnectionIds), view.connectionIds),
      dimmedNodeIds,
      dimmedEdgeIds: dimmedConnectionIds,
      routeNodeIds: intersect(this.state.journey?.nodeIds || EMPTY_SET, view.nodeIds),
      routeEdgeIds: intersect(this.state.journey?.connectionIds || EMPTY_SET, view.connectionIds),
      currentNodeId: this.state.journey?.currentNodeId || null,
      currentEdgeId: this.state.journey?.currentConnectionId || null,
      lesionedNodeIds: intersect(this.state.lesion?.excludedNodeIds || EMPTY_SET, view.nodeIds),
      lesionedEdgeIds: intersect(this.state.lesion?.excludedConnectionIds || EMPTY_SET, view.connectionIds)
    };
  }

  renderGraph({ fit = false, fitScope = "relevant" } = {}) {
    if (!this.renderer) return;
    const view = this.buildView();
    this.currentView = view;
    const circuit = this.state.selectedCircuitId ? this.graph.getCircuit(this.state.selectedCircuitId) : null;
    const expanded = view.nodes.length >= 70;
    const renderPayload = {
      nodes: view.nodes,
      edges: view.connections,
      connections: view.connections,
      circuits: this.graph.circuitList,
      activeCircuit: circuit,
      circuit,
      memoryGroups: MEMORY_MAP_GROUPS,
      layout: this.state.layout,
      centerNodeId: [...this.state.selectedNodeIds][0] || null,
      autoFit: false,
      layoutOptions: expanded
        ? { nodeSpacing: 184, columnSpacing: 260, levelSpacing: 154, ringSpacing: 214, clusterGap: 82, clusterPadding: 54, direction: window.innerWidth <= 720 ? "TB" : "LR" }
        : { nodeSpacing: 158, columnSpacing: 238, levelSpacing: 138, ringSpacing: 190, clusterGap: 66, clusterPadding: 46, direction: window.innerWidth <= 720 ? "TB" : "LR" },
      showEdgeLabels: this.state.showEdgeLabels,
      highlights: this.buildHighlights(view)
    };
    this.renderer.render(renderPayload);
    this.renderer.setHighlights?.(renderPayload.highlights);
    this.minimap?.render?.({ renderer: this.renderer, nodes: view.nodes, edges: view.connections, highlights: renderPayload.highlights });
    if (fit) requestAnimationFrame(() => fitScope === "all" ? this.fitAll({ animate: false }) : this.fitRelevant({ animate: false }));
    this.renderLegend();
    this.renderTextAlternative();
    this.renderStatus();
    this.schedulePersist();
  }

  renderAll(options = {}) {
    if (this.state.lesion) {
      this.renderGraph(options);
      this.renderLesionDetail();
    } else {
      this.renderGraph(options);
      this.renderDetail();
    }
    this.renderBreadcrumb();
    this.renderStatus();
  }

  renderDetail() {
    const panel = this.root.querySelector("#connectomeDetail");
    if (!panel) return;
    const nodeId = [...this.state.selectedNodeIds][0];
    if (nodeId) {
      panel.innerHTML = this.nodeDetailMarkup(this.graph.getNode(nodeId));
      this.decorateDetailPanel();
      return;
    }
    if (this.state.selectedConnectionId) {
      panel.innerHTML = this.connectionDetailMarkup(this.graph.getConnection(this.state.selectedConnectionId));
      this.decorateDetailPanel();
      return;
    }
    if (this.state.selectedCircuitId) {
      panel.innerHTML = this.circuitDetailMarkup(this.graph.getCircuit(this.state.selectedCircuitId));
      this.decorateDetailPanel();
      return;
    }
    panel.innerHTML = `<div class="connectome-detail-empty"><span class="kicker">${this.state.mode === "aprendizaje" ? "Modo aprendizaje" : "Exploracion"}</span><h3>Selecciona una estructura o via</h3><p>Haz clic o presiona Enter sobre un nodo. Las formas y trazos complementan el color.</p><button type="button" data-action="start-tour">Comenzar un recorrido guiado</button></div>`;
    this.decorateDetailPanel();
  }

  decorateDetailPanel() {
    const panel = this.root.querySelector("#connectomeDetail");
    if (!panel) return;
    if (!panel.querySelector(".connectome-panel-bar")) {
      panel.insertAdjacentHTML("afterbegin", `<div class="connectome-panel-bar"><button type="button" data-action="toggle-right-panel" aria-expanded="${String(!this.state.rightPanelCollapsed)}" title="Colapsar panel derecho">&#x27E9;</button><strong>Informacion</strong></div>`);
    }
    if (!panel.querySelector("[data-action='close-detail']")) {
      panel.insertAdjacentHTML("afterbegin", `<button type="button" class="connectome-detail-close" data-action="close-detail" aria-label="Cerrar panel de informacion" title="Cerrar panel">&#x2715;</button>`);
    }
    this.syncDetailVisibility();
  }

  syncDetailVisibility() {
    const panel = this.root.querySelector("#connectomeDetail");
    if (!panel) return;
    const overlay = this.detailOverlayQuery?.matches ?? window.innerWidth <= 1180;
    const visible = !this.state.mapOnly && !this.state.fullscreen && !this.state.rightPanelCollapsed && (!overlay || this.state.detailOpen);
    panel.classList.toggle("is-open", visible);
    panel.classList.toggle("is-collapsed", !visible);
    panel.setAttribute("aria-hidden", String(!visible));
    const closeButton = panel.querySelector("[data-action='close-detail']");
    if (closeButton) closeButton.hidden = !overlay;
    this.root.querySelectorAll("[data-action='toggle-right-panel']").forEach((button) => {
      button.setAttribute("aria-expanded", String(visible));
      button.setAttribute("aria-pressed", String(visible));
    });
  }

  closeDetail() {
    this.state.detailOpen = false;
    this.syncDetailVisibility();
    this.root.querySelector("#connectomeViewport")?.focus({ preventScroll: true });
    this.schedulePersist();
  }

  nodeDetailMarkup(node) {
    const relations = this.graph.getRegionRelations(node.id);
    const level = this.state.learningLevel;
    const advanced = level === "avanzado";
    const children = relations.children || [];
    return `
      <div class="connectome-detail-head"><div><span class="kicker">${escapeHtml(labelForType(node.tipo))}</span><h3>${escapeHtml(node.nombre)}</h3><p>${escapeHtml(node.nombreCompleto)}</p></div><span class="connectome-evidence" data-evidence="${node.evidencia}">${escapeHtml(evidenceLabel(node.evidencia))}</span></div>
      <p>${escapeHtml(educationalSummary(node, level))}</p>
      ${this.state.mode === "aprendizaje" && level === "basico" ? `<button type="button" data-action="advance-learning">Ver mas</button>` : ""}
      <div class="connectome-detail-actions">
        <button type="button" data-action="show-afferents">Aferencias</button><button type="button" data-action="show-efferents">Eferencias</button>
        <button type="button" data-action="show-node-circuits">Circuitos</button>
        ${children.length ? `<button type="button" data-action="toggle-expand">${this.isNodeExpanded(node.id) ? "Ocultar subestructuras" : "Subestructuras"}</button>` : ""}
        ${node.regionPadre ? `<button type="button" data-action="show-parent">Region padre</button>` : ""}
        <button type="button" data-action="prepare-route">Rutas</button><button type="button" data-action="lesion-node">Lesion</button>
        <button type="button" data-action="open-physiology">Ver fisiologia celular</button>
        <button type="button" data-action="center-node">Centrar</button><button type="button" data-action="isolate-node">Aislar</button>
      </div>
      <h4>¿Por que importa?</h4>${listMarkup(node.porQueImporta)}
      <h4>Funciones asociadas</h4>${listMarkup(node.funciones)}
      ${node.conceptosFuncionales?.length ? `<h4>Tipos celulares funcionales</h4>${listMarkup(node.conceptosFuncionales)}<p class="muted">Son patrones funcionales de actividad, no nucleos anatomicos.</p>` : ""}
      <details ${level !== "basico" ? "open" : ""}><summary>Conectividad registrada</summary>
        <h5>Aferencias</h5>${this.connectionLinks(relations.incoming, "incoming")}
        <h5>Eferencias</h5>${this.connectionLinks(relations.outgoing, "outgoing")}
      </details>
      <details ${level !== "basico" ? "open" : ""}><summary>Circuitos (${relations.circuits.length})</summary>${this.circuitLinks(relations.circuits)}</details>
      ${advanced ? `<details open><summary>Neuroquimica y clinica</summary><h5>Neurotransmisores relevantes</h5>${listMarkup(node.neurotransmisoresRelevantes)}<h5>Receptores relevantes</h5>${listMarkup(node.receptoresRelevantes)}<h5>Asociaciones clinicas educativas</h5>${listMarkup(node.patologiasRelacionadas)}<p class="muted">No equivale a diagnostico ni a causalidad unica.</p></details>` : ""}
      <details ${advanced ? "open" : ""}><summary>Fuentes</summary>${this.referenceMarkup(node.referencias)}</details>
      <div class="connectome-bottom-actions"><button type="button" data-action="open-physiology">Ver fisiologia celular</button>${node.fisiologiaTargets?.includes("plasticidad_ltp") ? `<button type="button" data-action="show-plasticity">Ver mecanismo de plasticidad</button>` : ""}</div>`;
  }

  connectionDetailMarkup(edge) {
    const relations = this.graph.getConnectionRelations(edge.id);
    const advanced = this.state.learningLevel === "avanzado";
    const arrow = edge.direccion === "reciproca" ? "↔" : "→";
    return `
      <div class="connectome-detail-head"><div><span class="kicker">${escapeHtml(labelForType(edge.tipo))}</span><h3>${escapeHtml(edge.nombre)}</h3></div><span class="connectome-evidence" data-evidence="${edge.evidencia}">${escapeHtml(evidenceLabel(edge.evidencia))}</span></div>
      <p class="connectome-route-title"><button type="button" data-select-node="${edge.origen}">${escapeHtml(relations.origin?.nombre)}</button> <b>${arrow}</b> <button type="button" data-select-node="${edge.destino}">${escapeHtml(relations.destination?.nombre)}</button></p>
      <p>${escapeHtml(edge.funcion)}</p><h4>Importancia para aprendizaje</h4><p>${escapeHtml(edge.importanciaAprendizaje || "Participa en los circuitos registrados.")}</p>
      <dl class="connectome-facts"><dt>Direccion</dt><dd>${escapeHtml(slugText(edge.direccion))}</dd><dt>Entidad</dt><dd>${escapeHtml(labelForType(edge.claseEntidad || edge.tipo))}</dd><dt>Tracto/via</dt><dd>${escapeHtml(edge.tractoFasciculo || "No aplica")}</dd><dt>Predominio</dt><dd>${escapeHtml(edge.polaridad ? slugText(edge.polaridad) : "No declarado / no aplica")}</dd><dt>Neurotransmisor</dt><dd>${escapeHtml(edge.neurotransmisorPrincipal || "No declarado / no aplica")}</dd></dl>
      <div class="connectome-detail-actions"><button type="button" data-action="lesion-edge">Interrumpir conexion</button><button type="button" data-action="follow-circuit">Seguir circuito</button></div>
      ${edge.plasticidad ? `<details open><summary>Plasticidad</summary><p>${escapeHtml(edge.plasticidad.nota)}</p><p><b>${escapeHtml(edge.plasticidad.tipos.join(" · "))}</b></p><button type="button" data-action="show-plasticity">Ver mecanismo celular</button></details>` : ""}
      <details open><summary>Circuitos (${relations.circuits.length})</summary>${this.circuitLinks(relations.circuits)}</details>
      ${advanced ? `<details open><summary>Evidencia comparada</summary><p><b>Especies:</b> ${escapeHtml(edge.especies?.join(", ") || "No especificadas en este registro")}</p><p><b>Metodos:</b> ${escapeHtml(edge.tiposEvidencia?.map(slugText).join(", ") || "No especificados en este registro")}</p></details>` : ""}
      <details ${advanced ? "open" : ""}><summary>Fuentes</summary>${this.referenceMarkup(edge.referencias)}</details>
      <div class="connectome-bottom-actions"><button type="button" data-action="open-physiology">Ver fisiologia de esta conexion</button></div>`;
  }

  circuitDetailMarkup(circuit) {
    const relations = this.graph.getCircuitRelations(circuit.id);
    return `
      <div class="connectome-detail-head"><div><span class="kicker">Circuito · ${escapeHtml(slugText(circuit.categoria))}</span><h3>${escapeHtml(circuit.nombre)}</h3></div><span class="connectome-evidence" data-evidence="${circuit.evidencia}">${escapeHtml(evidenceLabel(circuit.evidencia))}</span></div>
      <p>${escapeHtml(circuit.descripcion)}</p><h4>Funciones asociadas</h4>${listMarkup(circuit.funciones)}
      <div class="connectome-detail-actions"><button type="button" data-action="isolate-circuit">Aislar circuito</button><button type="button" data-action="follow-circuit">Seguir paso a paso</button></div>
      <h4>Version textual</h4><p class="connectome-circuit-text">${escapeHtml(circuitTextAlternative(circuit, this.graph))}</p>
      <h4>Cautelas</h4>${listMarkup(circuit.cautelas)}
      <details><summary>Estructuras (${relations.regions.length})</summary>${relations.regions.map((node) => `<button type="button" class="connectome-inline-link" data-select-node="${node.id}">${escapeHtml(node.nombre)}</button>`).join(" ")}</details>
      <details><summary>Conexiones (${relations.connections.length})</summary>${relations.connections.map((edge) => `<button type="button" class="connectome-inline-link" data-select-edge="${edge.id}">${escapeHtml(edge.nombre)}</button>`).join(" ")}</details>
      <details open><summary>Fuentes</summary>${this.referenceMarkup(circuit.referencias)}</details>`;
  }

  connectionLinks(edges) {
    if (!edges?.length) return `<p class="muted">Ninguna en el registro actual.</p>`;
    return `<ul>${edges.map((edge) => `<li><button type="button" data-select-edge="${edge.id}">${escapeHtml(edge.nombre)}</button> <small>${edge.direccion === "reciproca" ? "↔" : "→"} ${escapeHtml(edge.neurotransmisorPrincipal || "no declarado / no aplica")}</small></li>`).join("")}</ul>`;
  }

  circuitLinks(circuits) {
    if (!circuits?.length) return `<p class="muted">Ninguno en la fase actual.</p>`;
    return circuits.map((circuit) => `<button type="button" class="connectome-inline-link" data-select-circuit="${circuit.id}">${escapeHtml(circuit.nombre)}</button>`).join(" ");
  }

  referenceMarkup(referenceIds) {
    const references = (referenceIds || []).map((id) => this.graph.references.get(id)).filter(Boolean);
    if (!references.length) return `<p class="muted">Fuente pendiente de asociacion especifica.</p>`;
    return `<ol class="connectome-references">${references.map((reference) => `<li><a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.titulo)}</a><small>${escapeHtml(reference.cita)}</small></li>`).join("")}</ol>`;
  }

  renderBreadcrumb() {
    const box = this.root.querySelector("#connectomeBreadcrumb");
    const nodeId = [...this.state.selectedNodeIds][0];
    const edge = this.graph.getConnection(this.state.selectedConnectionId);
    let items = [];
    if (nodeId) items = [...this.graph.getAncestors(nodeId)].reverse().map((node) => ({ id: node.id, name: node.nombre })).concat({ id: nodeId, name: this.graph.getNode(nodeId).nombre });
    else if (edge) items = [{ id: edge.origen, name: this.graph.getNode(edge.origen)?.nombre }, { id: null, name: edge.nombre }, { id: edge.destino, name: this.graph.getNode(edge.destino)?.nombre }];
    else if (this.state.selectedCircuitId) {
      const circuit = this.graph.getCircuit(this.state.selectedCircuitId);
      items = [{ id: null, name: slugText(circuit.categoria) }, { circuitId: circuit.id, name: circuit.nombre }];
    }
    else if (this.state.activeMemoryGroupId) items = [{ groupId: this.state.activeMemoryGroupId, name: MEMORY_MAP_GROUPS.find((group) => group.id === this.state.activeMemoryGroupId)?.nombre }];
    else items = [{ id: null, name: "Mapa de memoria" }];
    box.innerHTML = `<button type="button" data-breadcrumb-root>Memoria</button>${items.map((item, index) => {
      const current = index === items.length - 1 ? ` aria-current="page"` : "";
      if (item.id) return `<span aria-hidden="true">›</span><button type="button" data-breadcrumb-node="${item.id}"${current}>${escapeHtml(item.name)}</button>`;
      if (item.circuitId) return `<span aria-hidden="true">›</span><button type="button" data-select-circuit="${item.circuitId}"${current}>${escapeHtml(item.name)}</button>`;
      if (item.groupId) return `<span aria-hidden="true">›</span><button type="button" data-memory-group="${item.groupId}"${current}>${escapeHtml(item.name)}</button>`;
      return `<span aria-hidden="true">›</span><span${current}>${escapeHtml(item.name)}</span>`;
    }).join("")}`;
  }

  renderLegend() {
    const box = this.root.querySelector("#connectomeLegend");
    if (!box) return;
    box.innerHTML = `
      <div class="connectome-legend-items">
        <span data-legend-node="corteza"><i></i>Corteza</span><span data-legend-node="nucleo"><i></i>Nucleo</span>
        <span data-legend-node="tracto"><i></i>Tracto</span><span data-legend-node="subcampo"><i></i>Subcampo</span>
        <span data-legend-node="sistema_modulador"><i></i>Sistema modulador</span>
        <span data-legend-edge="excitatoria"><i></i>Excitatoria predominante</span><span data-legend-edge="inhibitoria"><i></i>Inhibitoria predominante</span>
        <span data-legend-edge="moduladora"><i></i>Moduladora</span><span data-legend-edge="reciproca"><i></i>Reciproca</span>
        <span data-legend-edge="funcional"><i></i>Relacion funcional</span>
      </div><p class="muted">Las formas, patrones de trazo, flechas y etiquetas complementan el color.</p>`;
  }

  renderTextAlternative() {
    const box = this.root.querySelector("#connectomeTextAlternative");
    if (!box) return;
    const circuit = this.graph.getCircuit(this.state.selectedCircuitId);
    if (circuit) {
      box.innerHTML = `<h4>${escapeHtml(circuit.nombre)}</h4><p>${escapeHtml(circuitTextAlternative(circuit, this.graph))}</p><ol>${circuit.secuenciaConexiones.map((id) => this.graph.getConnection(id)).filter(Boolean).map((edge) => `<li><button type="button" data-select-edge="${edge.id}">${escapeHtml(edge.nombre)}</button>: ${escapeHtml(edge.funcion)}</li>`).join("")}</ol>`;
      return;
    }
    if (this.state.activeNetworkLayerIds.size) {
      const networks = CONNECTOME_DATA.redesFuncionales || CONNECTOME_DATA.capasRedes || [];
      const active = networks.filter((item) => this.state.activeNetworkLayerIds.has(item.id));
      box.innerHTML = active.map((network) => `<section><h4>${escapeHtml(network.nombre)}</h4><p>${escapeHtml(network.descripcion)}</p><p>${network.nodos.map((id) => `<button type="button" class="connectome-inline-link" data-select-node="${id}">${escapeHtml(this.graph.getNode(id)?.nombre || id)}</button>`).join(" ")}</p><p class="muted">Superposicion funcional; no equivale a un tracto anatomico.</p></section>`).join("");
      return;
    }
    const route = this.state.routePaths[this.state.activeRouteIndex];
    if (route) {
      box.innerHTML = `<h4>Ruta registrada</h4><p>${escapeHtml(route.nodes.map((node) => node.nombre).join(" → "))}</p>`;
      return;
    }
    box.innerHTML = `<p>Mapa de memoria con ${MEMORY_MAP_GROUPS.map((group) => group.nombre).join(", ")}. Selecciona un circuito para obtener su secuencia textual.</p>`;
  }

  renderStatus() {
    const box = this.root.querySelector("#connectomeStatus");
    if (!box || !this.currentView) return;
    const activeFilters = this.state.filterResult?.criteriaApplied?.length || 0;
    const isolation = this.state.isolation ? " · aislamiento activo" : "";
    const lesion = this.state.lesion ? " · lesion educativa activa" : "";
    const hierarchyCount = this.currentView.hierarchyConnectionIds?.size || 0;
    const registeredCount = this.currentView.connections.length - hierarchyCount;
    const hierarchy = hierarchyCount ? ` · ${hierarchyCount} relaciones jerarquicas` : "";
    const context = VISIBILITY_MODES.find((item) => item.id === this.state.visibilityMode)?.nombre || "Todas";
    box.textContent = `${this.currentView.nodes.length}/${this.graph.regionList.length} nodos · ${registeredCount} conexiones${hierarchy} · ${activeFilters} filtros · ${context}${isolation}${lesion}`;
  }

  showHelp(id, trigger) {
    const box = this.root.querySelector("#connectomeHelpText");
    box.textContent = HELP[id] || "Ayuda no disponible.";
    box.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    box.style.left = `${Math.max(8, rect.left - rootRect.left)}px`;
    box.style.top = `${rect.bottom - rootRect.top + 8}px`;
    clearTimeout(this.helpTimer);
    this.helpTimer = setTimeout(() => { box.hidden = true; }, 8500);
  }

  showTooltip(payload) {
    if (!payload || payload.visible === false || payload.leaving || payload.type === "leave") return this.hideTooltip();
    const sourceItem = payload.item || payload;
    const id = sourceItem?.id || payload.id || payload.nodeId || payload.edgeId || payload.connectionId;
    const kind = payload.kind || payload.type || (this.graph.hasConnection(id) ? "edge" : "node");
    const item = kind === "edge" ? this.graph.getConnection(id) : this.graph.getNode(id);
    if (!item) return;
    const box = this.root.querySelector("#connectomeTooltip");
    const viewportRect = this.root.querySelector("#connectomeViewport").getBoundingClientRect();
    const x = payload.clientX ?? payload.event?.clientX ?? viewportRect.left + viewportRect.width / 2;
    const y = payload.clientY ?? payload.event?.clientY ?? viewportRect.top + viewportRect.height / 2;
    box.innerHTML = `<strong>${escapeHtml(item.nombre)}</strong><span>${escapeHtml(item.funcion || item.funciones?.[0] || labelForType(item.tipo))}</span>`;
    box.style.left = `${Math.min(viewportRect.width - 240, Math.max(8, x - viewportRect.left + 12))}px`;
    box.style.top = `${Math.min(viewportRect.height - 90, Math.max(8, y - viewportRect.top + 12))}px`;
    box.hidden = false;
  }

  hideTooltip() {
    const box = this.root.querySelector("#connectomeTooltip");
    if (box) box.hidden = true;
  }

  showContextMenu(payload = {}) {
    const sourceItem = payload.item || payload;
    const id = sourceItem?.id || payload.id || payload.nodeId || payload.edgeId || payload.connectionId;
    const type = payload.kind || payload.type || (this.graph.hasNode(id) ? "node" : "edge");
    if (type === "node" && !this.graph.hasNode(id)) return;
    if (type === "edge" && !this.graph.hasConnection(id)) return;
    this.contextTarget = { type, id };
    const menu = this.root.querySelector("#connectomeContextMenu");
    menu.innerHTML = getContextMenuActions(type)
      .map(({ action, label }) => `<button type="button" role="menuitem" data-action="${action}">${label}</button>`)
      .join("");
    const rootRect = this.root.getBoundingClientRect();
    menu.style.left = `${Math.max(8, (payload.clientX ?? payload.event?.clientX ?? rootRect.left + 40) - rootRect.left)}px`;
    menu.style.top = `${Math.max(8, (payload.clientY ?? payload.event?.clientY ?? rootRect.top + 80) - rootRect.top)}px`;
    menu.hidden = false;
    menu.querySelector("button")?.focus();
  }

  hideContextMenu() {
    const menu = this.root.querySelector("#connectomeContextMenu");
    if (menu) menu.hidden = true;
  }

  contextConnections() {
    if (this.contextTarget?.type === "node") this.selectNode(this.contextTarget.id);
    else this.selectConnection(this.contextTarget?.id);
  }
  contextIsolate() {
    this.contextConnections();
    this.contextTarget?.type === "node" ? this.isolateSelectedNode() : null;
  }
  contextCenter() {
    if (this.contextTarget?.type === "node") this.renderer.centerNode?.(this.contextTarget.id);
  }
  contextFollow() {
    this.contextConnections();
    if (this.contextTarget?.type === "edge") {
      const circuits = this.graph.getCircuitMembershipsForConnection(this.contextTarget.id);
      if (circuits[0]) this.selectCircuit(circuits[0].id);
    }
    this.followSelectedCircuit();
  }
  contextLesion() {
    this.contextConnections();
    this.contextTarget?.type === "node" ? this.lesionSelectedNode() : this.lesionSelectedConnection();
  }

  hideTransientUi() {
    this.hideTooltip();
    this.hideContextMenu();
    const results = this.root.querySelector("#connectomeSearchResults");
    if (results) results.hidden = true;
    const help = this.root.querySelector("#connectomeHelpText");
    if (help) help.hidden = true;
  }

  announce(message) {
    const box = this.root.querySelector("#connectomeAnnouncer");
    if (box) box.textContent = message;
  }

  setActive(active) {
    this.active = Boolean(active);
    this.root.toggleAttribute("data-inactive", !this.active);
    this.renderer?.setActive?.(this.active);
    if (!this.active) this.tourPlayer.pause();
  }

  selectById(id) {
    if (this.graph.hasNode(id)) this.selectNode(id);
    else if (this.graph.hasConnection(id)) this.selectConnection(id);
    else if (this.graph.hasCircuit(id)) this.selectCircuit(id);
    return this;
  }

  destroy() {
    try { window.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(this.sessionSnapshot())); } catch { /* almacenamiento no disponible */ }
    this.abortController.abort();
    if (this.searchFrame) cancelAnimationFrame(this.searchFrame);
    clearTimeout(this.persistTimer);
    clearTimeout(this.helpTimer);
    this.tourPlayer.destroy();
    this.minimap?.destroy?.();
    this.renderer?.destroy?.();
    if (this.state.maximizedFallback) document.body.classList.remove("connectome-maximized-active");
    CONTROLLERS.delete(this.root);
  }
}

export async function inicializarMapaCircuitos(options = {}) {
  const root = options.root || document.getElementById("connectomeApp");
  if (!root) throw new Error("No se encontro #connectomeApp");
  if (CONTROLLERS.has(root)) {
    const existing = CONTROLLERS.get(root);
    existing.setActive(true);
    if (options.initialSelection) existing.selectById(options.initialSelection);
    return existing;
  }
  const controller = new ConnectomeController(root, options);
  CONTROLLERS.set(root, controller);
  try {
    await controller.mount();
    return controller;
  } catch (error) {
    CONTROLLERS.delete(root);
    root.dataset.state = "error";
    root.setAttribute("aria-busy", "false");
    root.innerHTML = `<div class="alerta-lab"><strong>No fue posible cargar el mapa.</strong><p>${escapeHtml(error?.message || error)}</p><button type="button" data-connectome-retry>Reintentar</button></div>`;
    root.querySelector("[data-connectome-retry]")?.addEventListener("click", () => window.location.reload(), { once: true });
    console.error("[Connectome] error de inicializacion", error);
    throw error;
  }
}

export const initializeBrainCircuitsMap = inicializarMapaCircuitos;
