import {
  ConnectomeLayoutEngine,
  calculateLayoutBounds,
  normalizeLayoutName
} from "./connectomeLayouts.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
let rendererSequence = 0;

export const NODE_VISUAL_TYPES = Object.freeze({
  CORTEX: "corteza",
  NUCLEUS: "nucleo",
  TRACT: "tracto",
  SUBFIELD: "subcampo",
  MODULATORY_SYSTEM: "sistema_modulador",
  REGION: "region"
});

export const NODE_VISUALS = Object.freeze({
  [NODE_VISUAL_TYPES.CORTEX]: Object.freeze({ shape: "rounded-rectangle", icon: "C", width: 178, height: 72 }),
  [NODE_VISUAL_TYPES.NUCLEUS]: Object.freeze({ shape: "ellipse", icon: "N", width: 146, height: 78 }),
  [NODE_VISUAL_TYPES.TRACT]: Object.freeze({ shape: "capsule", icon: "V", width: 184, height: 58 }),
  [NODE_VISUAL_TYPES.SUBFIELD]: Object.freeze({ shape: "diamond", icon: "S", width: 132, height: 88 }),
  [NODE_VISUAL_TYPES.MODULATORY_SYSTEM]: Object.freeze({ shape: "hexagon", icon: "M", width: 174, height: 82 }),
  [NODE_VISUAL_TYPES.REGION]: Object.freeze({ shape: "rectangle", icon: "R", width: 166, height: 72 })
});

const POLARITY_STYLES = Object.freeze({
  excitatory: Object.freeze({ color: "var(--connectome-edge-excitatory, #4c78d8)", dash: null }),
  inhibitory: Object.freeze({ color: "var(--connectome-edge-inhibitory, #c55574)", dash: "8 5" }),
  modulatory: Object.freeze({ color: "var(--connectome-edge-modulatory, #8a63c7)", dash: "3 6" }),
  mixed: Object.freeze({ color: "var(--connectome-edge-mixed, #64748b)", dash: "12 4 3 4" })
});

const DEFAULT_RENDERER_OPTIONS = Object.freeze({
  minZoom: 0.05,
  maxZoom: 4.5,
  minReadableFitScale: 0.85,
  zoomStep: 0.0016,
  autoFit: true,
  fitOnResize: false,
  fitPadding: 64,
  showClusters: true,
  showEdgeLabels: "auto",
  suspendLabelsWhileMoving: true,
  cameraIdleDelay: 140,
  avoidNodeIntersections: true,
  ariaLabel: "Mapa interactivo de circuitos cerebrales",
  nodeLabelMaxCharacters: 25,
  width: 1000,
  height: 680
});

/** Return the non-colour visual category used for an anatomical node. */
export function getNodeVisualType(nodeOrType) {
  const type = normalizeToken(typeof nodeOrType === "object" ? nodeOrType?.tipo : nodeOrType);
  const level = normalizeToken(typeof nodeOrType === "object" ? nodeOrType?.nivelAnatomico : "");
  if (type.includes("corteza") || type === "cortex" || level.includes("cortical")) return NODE_VISUAL_TYPES.CORTEX;
  if (type.includes("tracto") || type.includes("fasciculo") || type === "via" || level === "tracto") return NODE_VISUAL_TYPES.TRACT;
  if (type.includes("subcampo") || level.includes("subcampo")) return NODE_VISUAL_TYPES.SUBFIELD;
  if (type.includes("sistema_modulador") || type.includes("modulador")) return NODE_VISUAL_TYPES.MODULATORY_SYSTEM;
  if (type.includes("nucleo") || type.includes("nuclear") || level.includes("nucleo") || level.includes("nuclear")) {
    return NODE_VISUAL_TYPES.NUCLEUS;
  }
  return NODE_VISUAL_TYPES.REGION;
}

export const nodeShapeForType = getNodeVisualType;

export function getNodeDimensions(node, overrides = {}) {
  const visualType = getNodeVisualType(node);
  const visual = NODE_VISUALS[visualType];
  const configured = overrides[visualType] || overrides.default || {};
  return Object.freeze({
    width: finiteNumber(configured.width ?? overrides.width ?? overrides.nodeWidth, visual.width),
    height: finiteNumber(configured.height ?? overrides.height ?? overrides.nodeHeight, visual.height),
    visualType,
    shape: visual.shape,
    icon: visual.icon
  });
}

export function isReciprocalDirection(connectionOrDirection) {
  const value = normalizeToken(
    typeof connectionOrDirection === "object"
      ? connectionOrDirection?.direccion ?? connectionOrDirection?.direction
      : connectionOrDirection
  );
  return value === "reciproca" || value === "reciprocal" || value === "bidireccional" || value === "bidirectional";
}

export function getConnectionPolarity(connectionOrPolarity) {
  const connectionType = normalizeToken(
    typeof connectionOrPolarity === "object"
      ? connectionOrPolarity?.claseEntidad ?? connectionOrPolarity?.tipo ?? connectionOrPolarity?.type
      : ""
  );
  const value = normalizeToken(
    typeof connectionOrPolarity === "object"
      ? connectionOrPolarity?.polaridad ?? connectionOrPolarity?.polarity
      : connectionOrPolarity
  );
  if (connectionType.includes("funcional") || connectionType.includes("functional")) return "mixed";
  if (value.includes("inhib")) return "inhibitory";
  if (value.includes("modul")) return "modulatory";
  if (value.includes("mixt") || value.includes("mixed")) return "mixed";
  if (value.includes("excit")) return "excitatory";
  return "mixed";
}

/**
 * Pure SVG path geometry helper. Positions may be a Map or an object keyed by
 * anatomical ID, making the function useful in unit tests without a DOM.
 */
export function calculateEdgeGeometry(connection, positions, nodes, options = {}) {
  const source = readPosition(positions, connection?.origen);
  const target = readPosition(positions, connection?.destino);
  if (!source || !target) return null;
  const nodeById = normalizeEntityMap(nodes);
  const sourceNode = nodeById.get(connection.origen) || { id: connection.origen, tipo: "region" };
  const targetNode = nodeById.get(connection.destino) || { id: connection.destino, tipo: "region" };
  const sourceDimensions = getNodeDimensions(sourceNode, options.nodeDimensions || options);
  const targetDimensions = getNodeDimensions(targetNode, options.nodeDimensions || options);

  if (connection.origen === connection.destino || (source.x === target.x && source.y === target.y)) {
    const width = sourceDimensions.width;
    const height = sourceDimensions.height;
    const start = point(source.x + width * 0.25, source.y - height * 0.38);
    const end = point(source.x - width * 0.25, source.y - height * 0.38);
    const control1 = point(source.x + width * 1.05, source.y - height * 1.8);
    const control2 = point(source.x - width * 1.05, source.y - height * 1.8);
    return Object.freeze({
      kind: "self-loop",
      start,
      end,
      control1,
      control2,
      d: `M ${formatPoint(start)} C ${formatPoint(control1)}, ${formatPoint(control2)}, ${formatPoint(end)}`
    });
  }

  const start = intersectNodeBoundary(source, target, sourceDimensions);
  const end = intersectNodeBoundary(target, source, targetDimensions);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const count = Math.max(1, Math.floor(finiteNumber(options.parallelCount, 1)));
  const index = clamp(Math.floor(finiteNumber(options.parallelIndex, 0)), 0, count - 1);
  let curveOffset = (index - (count - 1) / 2) * finiteNumber(options.parallelSpacing, 30);
  if (Math.abs(curveOffset) < 0.01) {
    const sign = stableHash(connection?.id || `${connection?.origen}-${connection?.destino}`) % 2 ? 1 : -1;
    curveOffset = finiteNumber(options.minimumCurve, 12) * sign;
  }
  let control = point(
    (start.x + end.x) / 2 + normalX * curveOffset,
    (start.y + end.y) / 2 + normalY * curveOffset
  );
  if (options.avoidNodes === true || options.avoidNodeIntersections === true) {
    control = routeControlAroundNodes({
      connection,
      start,
      end,
      control,
      normalX,
      normalY,
      positions,
      nodeById,
      options
    });
  }
  return Object.freeze({
    kind: "curve",
    start,
    end,
    control,
    d: `M ${formatPoint(start)} Q ${formatPoint(control)} ${formatPoint(end)}`
  });
}

export function buildConnectionPath(connection, positions, nodes, options = {}) {
  return calculateEdgeGeometry(connection, positions, nodes, options)?.d || "";
}

function routeControlAroundNodes({ connection, start, end, control, normalX, normalY, positions, nodeById, options }) {
  const obstaclePadding = Math.max(4, finiteNumber(options.obstaclePadding, 18));
  const maximumAttempts = Math.max(1, Math.floor(finiteNumber(options.maxRoutingAttempts, 6)));
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const signedOffset = (control.x - midpoint.x) * normalX + (control.y - midpoint.y) * normalY;
  const sign = signedOffset === 0
    ? (stableHash(connection?.id || `${connection?.origen}-${connection?.destino}`) % 2 ? 1 : -1)
    : Math.sign(signedOffset);
  const obstacles = [...nodeById.values()].filter((node) => node?.id !== connection.origen && node?.id !== connection.destino);
  if (!obstacles.length) return control;

  let routed = control;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const blocked = obstacles.some((node) => {
      const position = readPosition(positions, node.id);
      if (!position) return false;
      const dimensions = getNodeDimensions(node, options.nodeDimensions || options);
      return [0.2, 0.35, 0.5, 0.65, 0.8].some((t) => {
        const sample = quadraticPointAt(start, routed, end, t);
        return Math.abs(sample.x - position.x) <= dimensions.width / 2 + obstaclePadding
          && Math.abs(sample.y - position.y) <= dimensions.height / 2 + obstaclePadding;
      });
    });
    if (!blocked) return routed;
    const step = Math.max(26, obstaclePadding * 1.8) * (attempt + 1);
    routed = point(control.x + normalX * sign * step, control.y + normalY * sign * step);
  }
  return routed;
}

function quadraticPointAt(start, control, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
  };
}

export const createEdgePath = buildConnectionPath;

/**
 * Native-SVG connectome renderer. All graph interactions are delegated from a
 * single SVG root; nodes and edges never own event listeners.
 */
export class ConnectomeRenderer {
  constructor(hostOrOptions = null, maybeOptions = {}) {
    const { host, options } = normalizeConstructorArguments(hostOrOptions, maybeOptions);
    this.options = { ...DEFAULT_RENDERER_OPTIONS, ...options };
    this.callbacks = collectCallbacks(options);
    this.host = host || null;
    this.svg = null;
    this.layers = null;
    this.defs = null;
    this.uid = `connectome-renderer-${++rendererSequence}`;
    this.layoutEngine = options.layoutEngine || new ConnectomeLayoutEngine(options.layoutCacheOptions);
    this._ownsLayoutEngine = !options.layoutEngine;
    this.nodes = [];
    this.edges = [];
    this.circuits = [];
    this.nodeById = new Map();
    this.edgeById = new Map();
    this.circuitById = new Map();
    this.positions = new Map();
    this.nodeElements = new Map();
    this.edgeElements = new Map();
    this.incidentEdgeIds = new Map();
    this.viewport = { x: 0, y: 0, scale: 1 };
    this.viewportSize = { width: this.options.width, height: this.options.height };
    this.highlights = createHighlightState();
    this.draggedPositionsByLayout = new Map();
    this.activeLayout = "conceptual";
    this.activeCircuit = null;
    this.layoutResult = null;
    this.renderConfig = null;
    this._eventBindings = [];
    this._pointerState = null;
    this._touchPointers = new Map();
    this._pinchState = null;
    this._hovered = null;
    this._resizeObserver = null;
    this._reducedMotionQuery = null;
    this._reducedMotionListener = null;
    this._reducedMotion = false;
    this._hasRendered = false;
    this._destroyed = false;
    this._suppressClickUntil = 0;
    this._suppressClickId = null;
    this._markers = {};
    this._graphRenderSignature = null;
    this._renderEntityTokens = new WeakMap();
    this._renderEntitySequence = 0;
    this._viewportSubscribers = new Set();
    this._renderSubscribers = new Set();
    this._viewportNotificationFrame = null;
    this._cameraIdleTimer = null;
    this._cameraMoving = false;

    if (host && options.autoMount !== false) this.mount(host);
  }

  mount(host = this.host) {
    if (this._destroyed) throw new Error("ConnectomeRenderer ya fue destruido.");
    const resolvedHost = resolveHost(host);
    if (!resolvedHost) throw new TypeError("ConnectomeRenderer.mount requiere un elemento host valido.");
    if (this.svg && this.host === resolvedHost) return this;
    if (this.svg) this._unmount();

    this.host = resolvedHost;
    const documentRef = resolvedHost.ownerDocument || globalThis.document;
    this.svg = svgElement(documentRef, "svg", {
      class: "connectome-renderer connectome-graph",
      width: "100%",
      height: "100%",
      role: "application",
      tabindex: "0",
      focusable: "true",
      "aria-label": this.options.ariaLabel,
      "aria-roledescription": "grafo neuroanatomico interactivo",
      "data-connectome-renderer": this.uid,
      preserveAspectRatio: "xMidYMid meet"
    });
    this.svg.style.touchAction = "none";

    const titleId = `${this.uid}-title`;
    const descriptionId = `${this.uid}-description`;
    const title = svgElement(documentRef, "title", { id: titleId });
    title.textContent = this.options.ariaLabel;
    const description = svgElement(documentRef, "desc", { id: descriptionId });
    description.textContent = "Use rueda o gesto para acercar, arrastre el fondo para desplazarse y pulse Enter para seleccionar.";
    this.svg.setAttribute("aria-labelledby", `${titleId} ${descriptionId}`);
    this.svg.append(title, description);
    this._descriptionElement = description;

    this.defs = svgElement(documentRef, "defs");
    this.svg.append(this.defs);
    this._createDefinitions(documentRef);

    const viewport = svgElement(documentRef, "g", { class: "connectome-viewport" });
    const clusterLayer = svgElement(documentRef, "g", { class: "connectome-layer connectome-clusters", "aria-hidden": "true" });
    const edgeLayer = svgElement(documentRef, "g", { class: "connectome-layer connectome-edges" });
    const nodeLayer = svgElement(documentRef, "g", { class: "connectome-layer connectome-nodes" });
    const overlayLayer = svgElement(documentRef, "g", { class: "connectome-layer connectome-overlays", "aria-hidden": "true" });
    viewport.append(clusterLayer, edgeLayer, nodeLayer, overlayLayer);
    this.svg.append(viewport);
    this.layers = { viewport, clusters: clusterLayer, edges: edgeLayer, nodes: nodeLayer, overlays: overlayLayer };

    resolvedHost.append(this.svg);
    this._bindDelegatedEvents();
    this._observeSize();
    this._readMotionPreference();
    this._updateViewportSize();
    this._applyViewport();
    return this;
  }

  render(input = {}) {
    if (this._destroyed) throw new Error("ConnectomeRenderer ya fue destruido.");
    const config = normalizeRenderConfig(this.renderConfig, input);
    if (!this.svg) this.mount(config.host || this.host);
    const focusedEntity = closestEntity(this.svg.ownerDocument?.activeElement, this.svg);

    this.renderConfig = config;
    this.nodes = uniqueEntities(normalizeEntities(config.nodes));
    this.nodeById = indexFirst(this.nodes);
    this.edges = uniqueEntities(normalizeEntities(config.edges))
      .filter((edge) => validId(edge?.id) && this.nodeById.has(edge.origen) && this.nodeById.has(edge.destino));
    this.edgeById = indexFirst(this.edges);
    this.circuits = uniqueEntities(normalizeEntities(config.circuits));
    this.circuitById = indexFirst(this.circuits);
    this.activeCircuit = resolveActiveCircuit(config.activeCircuit ?? config.activeCircuitId, this.circuitById);
    this.activeLayout = normalizeLayoutName(config.layout);

    this._consumeHighlightConfig(config);
    const draggedPositions = this._getDraggedPositions(this.activeLayout);
    const fixedPositions = mergePositionCollections(config.positions, config.fixedPositions, draggedPositions);
    const focusNodeId = config.centerNodeId
      || config.focusNodeId
      || firstId(this.highlights.selectedNodeIds)
      || null;
    const generatedNodeSizes = Object.fromEntries(this.nodes.map((node) => {
      const dimensions = getNodeDimensions(node, config.nodeDimensions || {});
      return [node.id, { width: dimensions.width, height: dimensions.height }];
    }));
    const layoutOptions = {
      ...(config.layoutOptions || {}),
      nodeSizeById: {
        ...generatedNodeSizes,
        ...(config.layoutOptions?.nodeSizeById || {})
      }
    };
    this.layoutResult = this.layoutEngine.compute({
      nodes: this.nodes,
      edges: this.edges,
      circuits: this.circuits,
      memoryGroups: config.memoryGroups ?? config.gruposMemoria,
      activeCircuit: this.activeCircuit,
      layout: this.activeLayout,
      selectedNodeId: focusNodeId,
      centerNodeId: focusNodeId,
      fixedPositions,
      layoutOptions
    });
    this.positions = new Map(this.layoutResult.positions);
    this._buildIncidentIndex();
    const graphRenderSignature = this._createGraphRenderSignature();
    const reusedGraph = this._canReuseRenderedGraph(graphRenderSignature);
    if (!reusedGraph) {
      this._renderGraph();
      this._graphRenderSignature = graphRenderSignature;
    }
    this._updateDescription();
    this._updateStateClasses();
    this._applyViewport();
    if (focusedEntity && !reusedGraph) {
      const focusedRecord = focusedEntity.kind === "node"
        ? this.nodeElements.get(focusedEntity.id)
        : this.edgeElements.get(focusedEntity.id);
      try { focusedRecord?.group.focus?.({ preventScroll: true }); } catch { focusedRecord?.group.focus?.(); }
    }

    const shouldFit = input.fit === true
      || (!this._hasRendered && config.autoFit !== false && this.options.autoFit !== false);
    this._hasRendered = true;
    if (shouldFit) this.fit({ padding: config.fitPadding });

    const renderEvent = {
      renderer: this,
      layout: this.activeLayout,
      layoutResult: this.layoutResult,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length
    };
    this._emit("onRender", renderEvent);
    this._notifyRenderSubscribers(renderEvent);
    return this;
  }

  setHighlights(next = {}, options = {}) {
    const previousSelection = {
      nodes: new Set(this.highlights.selectedNodeIds),
      edges: new Set(this.highlights.selectedEdgeIds)
    };
    if (next == null || next.clear === true) {
      const preserveSelection = next?.preserveSelection === true;
      this.highlights = createHighlightState(preserveSelection ? previousSelection : undefined);
    } else {
      if (options.replace === true || next.replace === true) this.highlights = createHighlightState();
      applyHighlightValues(this.highlights, next);
    }
    this._updateStateClasses();
    if (options.emit === true) this._emitSelectionChange(options.sourceEvent || null);
    return this;
  }

  clearHighlights({ preserveSelection = true } = {}) {
    return this.setHighlights({ clear: true, preserveSelection });
  }

  centerNode(nodeId, options = {}) {
    const position = this.positions.get(readEntityId(nodeId));
    if (!position) return false;
    const scale = clamp(
      finiteNumber(options.scale, this.viewport.scale),
      this.options.minZoom,
      this.options.maxZoom
    );
    this.setViewport({
      x: this.viewportSize.width / 2 - position.x * scale,
      y: this.viewportSize.height / 2 - position.y * scale,
      scale
    }, { source: "centerNode", animate: options.animate !== false });
    return true;
  }

  fit(options = {}) {
    if (!this.positions.size) {
      this.reset({ fit: false });
      return this.viewport;
    }
    const scope = this._resolveFitScope(options);
    const bounds = this._contentBounds(scope);
    const insets = resolveFitInsets(options, this.options.fitPadding);
    const availableWidth = Math.max(1, this.viewportSize.width - insets.left - insets.right);
    const availableHeight = Math.max(1, this.viewportSize.height - insets.top - insets.bottom);
    const naturalScale = Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1)
    );
    const readableMinimum = Math.max(
        this.options.minZoom,
        finiteNumber(
          options.minScale ?? options.minReadableScale ?? this.renderConfig?.minReadableFitScale,
          this.options.minReadableFitScale
        )
      );
    const containmentFirst = options.allowTinyScale === true || normalizeToken(options.scope) === "all";
    const minimumScale = containmentFirst ? this.options.minZoom : readableMinimum;
    const scale = clamp(
      naturalScale,
      minimumScale,
      Math.min(this.options.maxZoom, finiteNumber(options.maxScale, 1.35))
    );
    this.setViewport({
      x: insets.left + availableWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: insets.top + availableHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
      scale
    }, { source: "fit", animate: options.animate !== false });
    return Object.freeze({ ...this.viewport });
  }

  reset(options = {}) {
    if (options.clearDragged === true || options.clearPositions === true) {
      if (options.allLayouts === true) this.draggedPositionsByLayout.clear();
      else this.draggedPositionsByLayout.delete(this.activeLayout);
      if (this.renderConfig) this.render({ ...this.renderConfig, fit: false });
    }
    this.setViewport({ x: 0, y: 0, scale: 1 }, { source: "reset", animate: options.animate !== false });
    if (options.fit === true) return this.fit(options);
    return Object.freeze({ ...this.viewport });
  }

  setViewport(next = {}, metadata = {}) {
    this.viewport = {
      x: finiteNumber(next.x, this.viewport.x),
      y: finiteNumber(next.y, this.viewport.y),
      scale: clamp(finiteNumber(next.scale, this.viewport.scale), this.options.minZoom, this.options.maxZoom)
    };
    if (this.svg) {
      const animate = metadata.animate === true && !this._reducedMotion;
      this.svg.classList.toggle("viewport-animated", animate);
      if (animate) {
        const windowRef = this.svg.ownerDocument?.defaultView;
        windowRef?.setTimeout?.(() => this.svg?.classList.remove("viewport-animated"), 260);
      }
    }
    this._applyViewport();
    this._notifyViewportChange(metadata.source || "api", metadata);
    return this;
  }

  getViewport() {
    return Object.freeze({ ...this.viewport });
  }

  getViewportSize() {
    return Object.freeze({ ...this.viewportSize });
  }

  /** Public, read-only world bounds used by fit controls and minimaps. */
  getContentBounds(options = {}) {
    const scope = this._resolveFitScope(options);
    return Object.freeze({ ...this._contentBounds(scope) });
  }

  /**
   * Re-read the host dimensions after panel/fullscreen transitions. A caller may
   * request a fit explicitly; ordinary ResizeObserver updates preserve camera.
   */
  refreshSize({ fit = false, fitOptions = {}, source = "refresh-size" } = {}) {
    const previous = { ...this.viewportSize };
    this._updateViewportSize();
    const changed = previous.width !== this.viewportSize.width || previous.height !== this.viewportSize.height;
    if (fit && this.positions.size) this.fit({ ...fitOptions, animate: fitOptions.animate ?? false });
    else if (changed) this._notifyViewportChange(source, { resized: true, previousSize: previous });
    return Object.freeze({ ...this.viewportSize });
  }

  /** Center the current camera on a world-space coordinate (minimap contract). */
  panToWorld(x, y, options = {}) {
    const scale = clamp(
      finiteNumber(options.scale, this.viewport.scale),
      this.options.minZoom,
      this.options.maxZoom
    );
    this.setViewport({
      x: this.viewportSize.width / 2 - finiteNumber(x, 0) * scale,
      y: this.viewportSize.height / 2 - finiteNumber(y, 0) * scale,
      scale
    }, { source: options.source || "panToWorld", animate: options.animate !== false });
    return Object.freeze({ ...this.viewport });
  }

  subscribeViewport(listener, { immediate = false } = {}) {
    if (typeof listener !== "function") return () => {};
    this._viewportSubscribers.add(listener);
    if (immediate) listener(this._viewportEvent("subscribe", { immediate: true }));
    return () => this._viewportSubscribers.delete(listener);
  }

  subscribeRender(listener, { immediate = false } = {}) {
    if (typeof listener !== "function") return () => {};
    this._renderSubscribers.add(listener);
    if (immediate && this.layoutResult) listener({
      renderer: this,
      layout: this.activeLayout,
      layoutResult: this.layoutResult,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length,
      immediate: true
    });
    return () => this._renderSubscribers.delete(listener);
  }

  setLabelsSuspended(suspended = true) {
    const value = Boolean(suspended);
    this.svg?.classList.toggle("labels-suspended", value);
    this.host?.classList?.toggle?.("connectome-labels-suspended", value);
    return this;
  }

  getPosition(nodeId) {
    const value = this.positions.get(readEntityId(nodeId));
    return value ? Object.freeze({ ...value }) : null;
  }

  getLayoutResult() {
    return this.layoutResult;
  }

  destroy() {
    if (this._destroyed) return;
    this._hideTooltip(null);
    this._unmount();
    if (this._ownsLayoutEngine) this.layoutEngine.clear();
    this.nodes = [];
    this.edges = [];
    this.circuits = [];
    this.nodeById.clear();
    this.edgeById.clear();
    this.circuitById.clear();
    this.positions.clear();
    this.nodeElements.clear();
    this.edgeElements.clear();
    this.incidentEdgeIds.clear();
    this.draggedPositionsByLayout.clear();
    this._viewportSubscribers.clear();
    this._renderSubscribers.clear();
    this.renderConfig = null;
    this.layoutResult = null;
    this._graphRenderSignature = null;
    this.host = null;
    this._destroyed = true;
  }

  _createDefinitions(documentRef) {
    for (const [polarity, style] of Object.entries(POLARITY_STYLES)) {
      const markerId = `${this.uid}-arrow-${polarity}`;
      this._markers[polarity] = markerId;
      const marker = svgElement(documentRef, "marker", {
        id: markerId,
        markerWidth: "10",
        markerHeight: "10",
        refX: "8.4",
        refY: "5",
        orient: "auto-start-reverse",
        markerUnits: "strokeWidth",
        viewBox: "0 0 10 10"
      });
      marker.append(svgElement(documentRef, "path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: style.color,
        stroke: "none"
      }));
      this.defs.append(marker);
    }
  }

  _renderGraph() {
    const documentRef = this.svg.ownerDocument;
    this.layers.clusters.replaceChildren();
    this.layers.edges.replaceChildren();
    this.layers.nodes.replaceChildren();
    this.layers.overlays.replaceChildren();
    this.nodeElements.clear();
    this.edgeElements.clear();

    if (this.renderConfig.showClusters !== false && this.options.showClusters !== false) {
      const fragment = documentRef.createDocumentFragment();
      for (const cluster of this.layoutResult.clusters || []) fragment.append(this._createClusterElement(cluster));
      this.layers.clusters.append(fragment);
    }

    const pairInfo = buildParallelEdgeInfo(this.edges);
    const edgeFragment = documentRef.createDocumentFragment();
    for (const edge of [...this.edges].sort(compareEntities)) {
      const element = this._createEdgeElement(edge, pairInfo.get(edge.id));
      if (element) edgeFragment.append(element);
    }
    this.layers.edges.append(edgeFragment);

    const nodeFragment = documentRef.createDocumentFragment();
    for (const node of [...this.nodes].sort(compareEntities)) {
      const element = this._createNodeElement(node);
      if (element) nodeFragment.append(element);
    }
    this.layers.nodes.append(nodeFragment);
  }

  _canReuseRenderedGraph(signature) {
    return Boolean(
      signature
      && signature === this._graphRenderSignature
      && this.layers?.nodes
      && this.layers?.edges
      && this.layers?.clusters
      && this.layers?.overlays
      && this.nodeElements.size === this.nodes.length
      && this.edgeElements.size === this.edges.length
      && this.nodes.every((node) => this.nodeElements.has(node.id))
      && this.edges.every((edge) => this.edgeElements.has(edge.id))
    );
  }

  _createGraphRenderSignature() {
    const labelMode = this.renderConfig?.showEdgeLabels ?? this.options.showEdgeLabels;
    const flowRequiresLabels = this.activeLayout === "flujo" && this.renderConfig?.hideEdgeLabels !== true;
    const labelsRendered = flowRequiresLabels || (labelMode !== false && labelMode !== "none");
    const labelsVisible = labelsRendered
      && (flowRequiresLabels || labelMode === true || labelMode === "always");
    const clustersVisible = this.renderConfig?.showClusters !== false && this.options.showClusters !== false;
    const nodes = [...this.nodes].sort(compareEntities).map((node) => {
      const dimensions = getNodeDimensions(node, this.renderConfig?.nodeDimensions || {});
      return [
        this._getRenderEntityToken(node),
        node.id,
        node.nombre || "",
        node.tipo || "",
        node.nivelAnatomico || "",
        Array.isArray(node.funciones) ? node.funciones[0] || "" : "",
        dimensions.visualType,
        dimensions.width,
        dimensions.height,
        dimensions.shape,
        dimensions.icon
      ];
    });
    const edges = [...this.edges].sort(compareEntities).map((edge) => [
      this._getRenderEntityToken(edge),
      edge.id,
      edge.origen,
      edge.destino,
      edge.nombre || "",
      edge.claseEntidad || "",
      edge.tipo || "",
      edge.direccion ?? edge.direction ?? "",
      edge.polaridad ?? edge.polarity ?? "",
      edge.interactiva !== false,
      edge.renderOnly === true
    ]);
    const positions = [...this.positions.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([id, value]) => [id, Number(value?.x), Number(value?.y)]);
    const clusters = clustersVisible
      ? (this.layoutResult?.clusters || []).map((cluster) => [
        cluster.id,
        cluster.label || "",
        [...(cluster.nodeIds || [])],
        cluster.bounds?.minX,
        cluster.bounds?.minY,
        cluster.bounds?.maxX,
        cluster.bounds?.maxY,
        cluster.bounds?.width,
        cluster.bounds?.height
      ])
      : [];

    return JSON.stringify({
      layout: this.activeLayout,
      nodes,
      edges,
      positions,
      clustersVisible,
      clusters,
      labelsRendered,
      labelsVisible,
      edgeRouting: this.renderConfig?.edgeRouting || this.renderConfig?.routing || this.activeLayout,
      avoidNodeIntersections: this.renderConfig?.avoidNodeIntersections ?? this.options.avoidNodeIntersections,
      nodeLabelMaxCharacters: finiteNumber(this.options.nodeLabelMaxCharacters, 25)
    });
  }

  _getRenderEntityToken(entity) {
    if (!entity || (typeof entity !== "object" && typeof entity !== "function")) return String(entity);
    if (!this._renderEntityTokens.has(entity)) {
      this._renderEntitySequence += 1;
      this._renderEntityTokens.set(entity, this._renderEntitySequence);
    }
    return this._renderEntityTokens.get(entity);
  }

  _createClusterElement(cluster) {
    const documentRef = this.svg.ownerDocument;
    const group = svgElement(documentRef, "g", {
      class: "connectome-cluster",
      "data-cluster-id": cluster.id,
      "data-layout": this.activeLayout
    });
    const bounds = cluster.bounds;
    if (!bounds || !Number.isFinite(bounds.width)) return group;
    group.append(svgElement(documentRef, "rect", {
      class: "connectome-cluster__shape",
      x: formatNumber(bounds.minX),
      y: formatNumber(bounds.minY),
      width: formatNumber(bounds.width),
      height: formatNumber(bounds.height),
      rx: "28",
      fill: "var(--connectome-cluster-fill, rgba(93, 110, 150, 0.06))",
      stroke: "var(--connectome-cluster-stroke, rgba(93, 110, 150, 0.28))",
      "stroke-width": "1.5",
      "stroke-dasharray": "8 7",
      "vector-effect": "non-scaling-stroke"
    }));
    const label = svgElement(documentRef, "text", {
      class: "connectome-cluster__label",
      x: formatNumber(bounds.minX + 18),
      y: formatNumber(bounds.minY + 28),
      fill: "var(--connectome-muted-text, #64748b)"
    });
    label.textContent = cluster.label || humanize(cluster.id);
    group.append(label);
    return group;
  }

  _createEdgeElement(edge, parallel = { index: 0, count: 1 }) {
    const geometry = calculateEdgeGeometry(edge, this.positions, this.nodeById, this._edgeGeometryOptions(edge, parallel));
    if (!geometry) return null;
    const documentRef = this.svg.ownerDocument;
    const polarity = getConnectionPolarity(edge);
    const style = POLARITY_STYLES[polarity];
    const reciprocal = isReciprocalDirection(edge);
    const type = normalizeToken(edge.claseEntidad || edge.tipo || "conexion") || "conexion";
    const interactive = edge.interactiva !== false && edge.renderOnly !== true;
    const group = svgElement(documentRef, "g", {
      class: `connectome-edge edge--${type} polarity--${polarity}${reciprocal ? " edge--reciprocal" : ""}`,
      "data-edge-id": edge.id,
      "data-entity-kind": interactive ? "edge" : null,
      "data-render-only": interactive ? null : "true",
      "data-polarity": polarity,
      "data-direction": reciprocal ? "reciprocal" : "unidirectional",
      role: interactive ? "button" : "presentation",
      tabindex: interactive ? "0" : null,
      "aria-hidden": interactive ? null : "true",
      "aria-label": interactive ? edgeAriaLabel(edge) : null,
      "aria-selected": interactive ? "false" : null,
      "aria-pressed": interactive ? "false" : null
    });
    const title = svgElement(documentRef, "title");
    title.textContent = edgeTooltipText(edge, this.nodeById);
    group.append(title);

    const pathId = `${this.uid}-edge-${safeDomToken(edge.id)}-${stableHash(edge.id)}`;
    const visiblePath = svgElement(documentRef, "path", {
      id: pathId,
      class: "connectome-edge__path",
      d: geometry.d,
      fill: "none",
      stroke: style.color,
      "stroke-width": "2.4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke",
      "marker-end": `url(#${this._markers[polarity]})`
    });
    if (reciprocal) visiblePath.setAttribute("marker-start", `url(#${this._markers[polarity]})`);
    if (style.dash) visiblePath.setAttribute("stroke-dasharray", style.dash);
    group.append(visiblePath);

    const hitPath = svgElement(documentRef, "path", {
      class: "connectome-edge__hit-area",
      d: geometry.d,
      fill: "none",
      stroke: "transparent",
      "stroke-width": "18",
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
      "pointer-events": "stroke",
      "aria-hidden": "true"
    });
    group.append(hitPath);

    const labelMode = this.renderConfig.showEdgeLabels ?? this.options.showEdgeLabels;
    let label = null;
    const flowRequiresLabels = this.activeLayout === "flujo" && this.renderConfig.hideEdgeLabels !== true;
    if (flowRequiresLabels || (labelMode !== false && labelMode !== "none")) {
      label = svgElement(documentRef, "text", {
        class: `connectome-edge__label${labelMode === true || labelMode === "always" || flowRequiresLabels ? " edge-label--visible" : ""}`,
        "text-anchor": "middle",
        dy: "-6",
        fill: "var(--connectome-edge-label, #334155)",
        "paint-order": "stroke",
        stroke: "var(--connectome-surface, #ffffff)",
        "stroke-width": "4",
        "stroke-linejoin": "round",
        "aria-hidden": "true"
      });
      const textPath = svgElement(documentRef, "textPath", { startOffset: "50%", href: `#${pathId}` });
      textPath.setAttributeNS(XLINK_NS, "xlink:href", `#${pathId}`);
      textPath.textContent = edge.nombre || edge.id;
      label.append(textPath);
      group.append(label);
    }

    this.edgeElements.set(edge.id, {
      group,
      path: visiblePath,
      hitPath,
      label,
      edge,
      parallel
    });
    return group;
  }

  _createNodeElement(node) {
    const position = this.positions.get(node.id);
    if (!position) return null;
    const documentRef = this.svg.ownerDocument;
    const dimensions = getNodeDimensions(node, this.renderConfig.nodeDimensions || {});
    const visual = NODE_VISUALS[dimensions.visualType];
    const group = svgElement(documentRef, "g", {
      class: `connectome-node node--${dimensions.visualType} shape--${visual.shape}`,
      transform: `translate(${formatNumber(position.x)} ${formatNumber(position.y)})`,
      "data-node-id": node.id,
      "data-entity-kind": "node",
      "data-node-type": dimensions.visualType,
      role: "button",
      tabindex: "0",
      "aria-label": nodeAriaLabel(node, dimensions.visualType),
      "aria-selected": "false",
      "aria-pressed": "false",
      "aria-grabbed": "false"
    });
    const title = svgElement(documentRef, "title");
    title.textContent = nodeTooltipText(node);
    group.append(title);
    group.append(createNodeShape(documentRef, dimensions));

    const icon = svgElement(documentRef, "text", {
      class: "connectome-node__icon",
      x: formatNumber(-dimensions.width / 2 + 17),
      y: "5",
      "text-anchor": "middle",
      "aria-hidden": "true"
    });
    icon.textContent = visual.icon;
    group.append(icon);

    const label = svgElement(documentRef, "text", {
      class: "connectome-node__label",
      x: "7",
      y: "0",
      "text-anchor": "middle",
      fill: "var(--connectome-node-text, #172033)",
      "pointer-events": "none"
    });
    const lines = splitLabel(node.nombre || node.id, finiteNumber(this.options.nodeLabelMaxCharacters, 25));
    const startY = lines.length === 1 ? 5 : -3;
    lines.forEach((line, index) => {
      const tspan = svgElement(documentRef, "tspan", {
        x: "7",
        y: formatNumber(startY + index * 15)
      });
      tspan.textContent = line;
      label.append(tspan);
    });
    group.append(label);

    this.nodeElements.set(node.id, { group, node, dimensions });
    return group;
  }

  _buildIncidentIndex() {
    this.incidentEdgeIds = new Map(this.nodes.map((node) => [node.id, new Set()]));
    for (const edge of this.edges) {
      this.incidentEdgeIds.get(edge.origen)?.add(edge.id);
      this.incidentEdgeIds.get(edge.destino)?.add(edge.id);
    }
  }

  _updateIncidentEdges(nodeId) {
    for (const edgeId of this.incidentEdgeIds.get(nodeId) || []) {
      const record = this.edgeElements.get(edgeId);
      if (!record) continue;
      const geometry = calculateEdgeGeometry(
        record.edge,
        this.positions,
        this.nodeById,
        this._edgeGeometryOptions(record.edge, record.parallel)
      );
      if (!geometry) continue;
      record.path.setAttribute("d", geometry.d);
      record.hitPath.setAttribute("d", geometry.d);
    }
  }

  _edgeGeometryOptions(edge, parallel = { index: 0, count: 1 }) {
    const routing = this.renderConfig?.edgeRouting || this.renderConfig?.routing || this.activeLayout;
    const layered = routing === "flujo" || routing === "jerarquico" || routing === "flow" || routing === "hierarchical";
    return {
      parallelIndex: parallel.index,
      parallelCount: parallel.count,
      parallelSpacing: layered ? 36 : 30,
      minimumCurve: layered ? 18 : 12,
      routing,
      layout: this.activeLayout,
      avoidNodeIntersections: this.renderConfig?.avoidNodeIntersections ?? this.options.avoidNodeIntersections,
      obstaclePadding: this.renderConfig?.obstaclePadding,
      nodeDimensions: this.renderConfig?.nodeDimensions,
      edgeId: edge?.id
    };
  }

  _consumeHighlightConfig(config) {
    const highlightInput = { ...(config.highlights || {}) };
    const keys = [
      "selectedNodeId", "selectedNodeIds", "selectedNodes", "selectedEdgeId", "selectedEdgeIds", "selectedEdges",
      "selectedConnectionId", "selectedConnectionIds", "selectedConnections",
      "dimmedNodeIds", "dimmedNodes", "dimmedEdgeIds", "dimmedEdges",
      "dimmedConnectionIds", "dimmedConnections",
      "lesionedNodeIds", "lesionedNodes", "lesionedEdgeIds", "lesionedEdges",
      "lesionedConnectionIds", "lesionedConnections",
      "routeNodeIds", "routeNodes", "routeEdgeIds", "routeEdges",
      "routeConnectionIds", "routeConnections",
      "highlightedNodeIds", "highlightedNodes", "highlightedEdgeIds", "highlightedEdges",
      "highlightedConnectionIds", "highlightedConnections",
      "currentNodeId", "currentNode", "currentEdgeId", "currentEdge", "currentConnectionId", "currentConnection", "dimOthers"
    ];
    for (const key of keys) if (hasOwn(config, key)) highlightInput[key] = config[key];
    if (config.route && typeof config.route === "object") {
      highlightInput.routeNodeIds ??= config.route.nodeIds ?? config.route.nodes;
      highlightInput.routeEdgeIds ??= config.route.edgeIds ?? config.route.edges;
      highlightInput.currentNodeId ??= config.route.currentNodeId;
      highlightInput.currentEdgeId ??= config.route.currentEdgeId;
    }
    applyHighlightValues(this.highlights, highlightInput);
  }

  _updateStateClasses() {
    const focusNodeIds = unionSets(
      this.highlights.selectedNodeIds,
      this.highlights.routeNodeIds,
      this.highlights.highlightedNodeIds,
      this.highlights.currentNodeId ? new Set([this.highlights.currentNodeId]) : null
    );
    const focusEdgeIds = unionSets(
      this.highlights.selectedEdgeIds,
      this.highlights.routeEdgeIds,
      this.highlights.highlightedEdgeIds,
      this.highlights.currentEdgeId ? new Set([this.highlights.currentEdgeId]) : null
    );

    for (const [id, record] of this.nodeElements) {
      const states = {
        selected: this.highlights.selectedNodeIds.has(id),
        dimmed: this.highlights.dimmedNodeIds.has(id)
          || (this.highlights.dimOthers && (focusNodeIds.size > 0 || focusEdgeIds.size > 0) && !focusNodeIds.has(id)),
        lesioned: this.highlights.lesionedNodeIds.has(id),
        route: this.highlights.routeNodeIds.has(id),
        current: this.highlights.currentNodeId === id,
        highlighted: this.highlights.highlightedNodeIds.has(id)
      };
      applyStateClasses(record.group, states);
      record.group.setAttribute("aria-selected", states.selected ? "true" : "false");
      record.group.setAttribute("aria-pressed", states.selected ? "true" : "false");
    }

    for (const [id, record] of this.edgeElements) {
      const endpointDimmed = this.highlights.dimmedNodeIds.has(record.edge.origen)
        || this.highlights.dimmedNodeIds.has(record.edge.destino);
      const states = {
        selected: this.highlights.selectedEdgeIds.has(id),
        dimmed: this.highlights.dimmedEdgeIds.has(id)
          || endpointDimmed
          || (this.highlights.dimOthers && (focusNodeIds.size > 0 || focusEdgeIds.size > 0) && !focusEdgeIds.has(id)),
        lesioned: this.highlights.lesionedEdgeIds.has(id),
        route: this.highlights.routeEdgeIds.has(id),
        current: this.highlights.currentEdgeId === id,
        highlighted: this.highlights.highlightedEdgeIds.has(id)
      };
      applyStateClasses(record.group, states);
      record.group.setAttribute("aria-selected", states.selected ? "true" : "false");
      record.group.setAttribute("aria-pressed", states.selected ? "true" : "false");
    }
  }

  _bindDelegatedEvents() {
    const bindings = [
      ["click", (event) => this._onClick(event)],
      ["dblclick", (event) => this._onDoubleClick(event)],
      ["contextmenu", (event) => this._onContextMenu(event)],
      ["pointerover", (event) => this._onPointerOver(event)],
      ["pointerout", (event) => this._onPointerOut(event)],
      ["pointermove", (event) => this._onPointerMove(event)],
      ["pointerdown", (event) => this._onPointerDown(event)],
      ["pointerup", (event) => this._onPointerUp(event)],
      ["pointercancel", (event) => this._onPointerCancel(event)],
      ["wheel", (event) => this._onWheel(event), { passive: false }],
      ["keydown", (event) => this._onKeyDown(event)]
    ];
    for (const [type, handler, options] of bindings) {
      this.svg.addEventListener(type, handler, options);
      this._eventBindings.push([type, handler, options]);
    }
  }

  _onClick(event) {
    const entity = closestEntity(event.target, this.svg);
    if (performanceNow() < this._suppressClickUntil
      && (!entity || entity.id === this._suppressClickId)) return;
    if (!entity) {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        this.highlights.selectedNodeIds.clear();
        this.highlights.selectedEdgeIds.clear();
        this._updateStateClasses();
        this._emitSelectionChange(event);
        this._emit("onBackgroundClick", { event, renderer: this });
      }
      return;
    }
    this._activateEntity(entity, event);
  }

  _activateEntity(entity, event) {
    const multiple = Boolean(event.ctrlKey || event.metaKey || event.shiftKey);
    const selection = entity.kind === "node"
      ? this.highlights.selectedNodeIds
      : this.highlights.selectedEdgeIds;
    const otherSelection = entity.kind === "node"
      ? this.highlights.selectedEdgeIds
      : this.highlights.selectedNodeIds;
    if (!multiple) {
      selection.clear();
      otherSelection.clear();
      selection.add(entity.id);
    } else if (selection.has(entity.id)) selection.delete(entity.id);
    else selection.add(entity.id);
    this._updateStateClasses();

    const item = entity.kind === "node" ? this.nodeById.get(entity.id) : this.edgeById.get(entity.id);
    const metadata = this._interactionMetadata(entity, event, { multiple });
    const payload = this._entityPayload(entity, item, metadata);
    this._emit(entity.kind === "node" ? "onNodeClick" : "onEdgeClick", payload, metadata, item);
    this._emit(entity.kind === "node" ? "onNodeSelect" : "onEdgeSelect", payload, metadata, item);
    this._emitSelectionChange(event);
  }

  _onDoubleClick(event) {
    const entity = closestEntity(event.target, this.svg);
    if (!entity) return;
    const item = entity.kind === "node" ? this.nodeById.get(entity.id) : this.edgeById.get(entity.id);
    const metadata = this._interactionMetadata(entity, event);
    const payload = this._entityPayload(entity, item, metadata);
    this._emit(entity.kind === "node" ? "onNodeDoubleClick" : "onEdgeDoubleClick", payload, metadata, item);
    if (entity.kind === "node") this._emit("onNodeExpand", payload, metadata, item);
  }

  _onContextMenu(event) {
    const entity = closestEntity(event.target, this.svg);
    if (!entity) return;
    const item = entity.kind === "node" ? this.nodeById.get(entity.id) : this.edgeById.get(entity.id);
    const metadata = this._interactionMetadata(entity, event);
    const payload = this._entityPayload(entity, item, metadata);
    const hasHandler = Boolean(
      this.callbacks.onContextMenu
      || this.callbacks[entity.kind === "node" ? "onNodeContextMenu" : "onEdgeContextMenu"]
    );
    if (hasHandler) event.preventDefault();
    this._emit("onContextMenu", payload);
    this._emit(entity.kind === "node" ? "onNodeContextMenu" : "onEdgeContextMenu", payload, metadata, item);
  }

  _onPointerOver(event) {
    if (this._pointerState) return;
    const entity = closestEntity(event.target, this.svg);
    if (!entity || sameEntity(entity, this._hovered)) return;
    const related = closestEntity(event.relatedTarget, this.svg);
    if (sameEntity(entity, related)) return;
    if (this._hovered) this._setHovered(this._hovered, false, event);
    this._hovered = entity;
    this._setHovered(entity, true, event);
  }

  _onPointerOut(event) {
    if (!this._hovered || this._pointerState) return;
    const leaving = closestEntity(event.target, this.svg);
    if (!sameEntity(leaving, this._hovered)) return;
    const related = closestEntity(event.relatedTarget, this.svg);
    if (sameEntity(related, this._hovered)) return;
    this._setHovered(this._hovered, false, event);
    this._hovered = null;
  }

  _setHovered(entity, visible, event) {
    const record = entity.kind === "node" ? this.nodeElements.get(entity.id) : this.edgeElements.get(entity.id);
    record?.group.classList.toggle("hovered", visible);
    record?.group.classList.toggle("is-hovered", visible);
    const item = entity.kind === "node" ? this.nodeById.get(entity.id) : this.edgeById.get(entity.id);
    const payload = {
      visible,
      phase: visible ? "show" : "hide",
      leaving: !visible,
      kind: entity.kind,
      type: visible ? entity.kind : "leave",
      id: entity.id,
      nodeId: entity.kind === "node" ? entity.id : null,
      edgeId: entity.kind === "edge" ? entity.id : null,
      connectionId: entity.kind === "edge" ? entity.id : null,
      item,
      event,
      renderer: this,
      clientX: event?.clientX,
      clientY: event?.clientY,
      element: record?.group || null
    };
    this._emit("onHover", payload);
    this._emit("onTooltip", payload);
    this._emit(entity.kind === "node" ? "onNodeHover" : "onEdgeHover", payload, item);
    if (!visible) this._emit("onHoverEnd", payload);
  }

  _hideTooltip(event) {
    if (!this._hovered) return;
    this._setHovered(this._hovered, false, event);
    this._hovered = null;
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    if (event.pointerType === "touch") {
      this._touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._touchPointers.size >= 2) {
        this._beginPinch(event);
        return;
      }
    }
    if (this._pointerState) return;
    const entity = closestEntity(event.target, this.svg);
    if (entity?.kind === "edge") return;
    this._hideTooltip(event);
    const svgPoint = this._clientToSvg(event.clientX, event.clientY);
    if (entity?.kind === "node") {
      const position = this.positions.get(entity.id);
      if (!position) return;
      this._pointerState = {
        mode: "node",
        pointerId: event.pointerId,
        nodeId: entity.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPosition: { ...position },
        moved: false
      };
      this.nodeElements.get(entity.id)?.group.setAttribute("aria-grabbed", "true");
      this._emitDrag(entity.id, position, "start", event);
    } else {
      this._pointerState = {
        mode: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startSvgPoint: svgPoint,
        startViewport: { ...this.viewport },
        moved: false
      };
      this.svg.classList.add("is-panning");
      this._setCameraMoving(true, "pan");
    }
    try { this.svg.setPointerCapture?.(event.pointerId); } catch { /* synthetic pointer event */ }
    event.preventDefault();
  }

  _onPointerMove(event) {
    if (event.pointerType === "touch" && this._touchPointers.has(event.pointerId)) {
      this._touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this._pinchState) {
      this._movePinch(event);
      return;
    }
    const state = this._pointerState;
    if (!state || state.pointerId !== event.pointerId) {
      if (this._hovered) {
        const item = this._hovered.kind === "node"
          ? this.nodeById.get(this._hovered.id)
          : this.edgeById.get(this._hovered.id);
        this._emit("onTooltip", {
          visible: true,
          phase: "move",
          kind: this._hovered.kind,
          item,
          event,
          renderer: this,
          clientX: event.clientX,
          clientY: event.clientY
        });
      }
      return;
    }

    const movedDistance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
    if (movedDistance > 3) state.moved = true;
    if (state.mode === "pan") {
      const current = this._clientToSvg(event.clientX, event.clientY);
      this.viewport.x = state.startViewport.x + current.x - state.startSvgPoint.x;
      this.viewport.y = state.startViewport.y + current.y - state.startSvgPoint.y;
      this._applyViewport();
      this._scheduleViewportChange("pan");
    } else {
      const scaleFactor = this._clientToSvgScale();
      const dx = (event.clientX - state.startClientX) * scaleFactor.x / this.viewport.scale;
      const dy = (event.clientY - state.startClientY) * scaleFactor.y / this.viewport.scale;
      const position = point(state.startPosition.x + dx, state.startPosition.y + dy);
      this.positions.set(state.nodeId, position);
      const record = this.nodeElements.get(state.nodeId);
      record?.group.setAttribute("transform", `translate(${formatNumber(position.x)} ${formatNumber(position.y)})`);
      this._updateIncidentEdges(state.nodeId);
      this._emitDrag(state.nodeId, position, "move", event);
    }
    event.preventDefault();
  }

  _onPointerUp(event) {
    if (this._pinchState) {
      this._touchPointers.delete(event.pointerId);
      try { this.svg.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
      this._pinchState = null;
      this._pointerState = null;
      this._setCameraMoving(false, "pinch");
      this._notifyViewportChange("pinch");
      return;
    }
    const state = this._pointerState;
    if (!state || state.pointerId !== event.pointerId) {
      this._touchPointers.delete(event.pointerId);
      return;
    }
    if (state.mode === "node") {
      const position = this.positions.get(state.nodeId);
      this.nodeElements.get(state.nodeId)?.group.setAttribute("aria-grabbed", "false");
      if (position && state.moved) {
        this._getDraggedPositions(this.activeLayout).set(state.nodeId, Object.freeze({ ...position }));
        this._notifyRenderSubscribers({
          renderer: this,
          layout: this.activeLayout,
          layoutResult: this.layoutResult,
          nodeCount: this.nodes.length,
          edgeCount: this.edges.length,
          source: "node-drag",
          nodeId: state.nodeId
        });
      }
      if (position) this._emitDrag(state.nodeId, position, "end", event);
      if (state.moved) this._suppressClickId = state.nodeId;
    } else {
      this.svg.classList.remove("is-panning");
      this._setCameraMoving(false, "pan");
      if (state.moved) this._suppressClickId = null;
      this._notifyViewportChange("pan");
    }
    if (state.moved) this._suppressClickUntil = performanceNow() + 350;
    try { this.svg.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
    this._touchPointers.delete(event.pointerId);
    this._pointerState = null;
  }

  _onPointerCancel(event) {
    if (this._pinchState) {
      this._touchPointers.delete(event.pointerId);
      this._pinchState = null;
      this._pointerState = null;
      this._setCameraMoving(false, "pinch");
      try { this.svg.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
      return;
    }
    const state = this._pointerState;
    if (!state || state.pointerId !== event.pointerId) {
      this._touchPointers.delete(event.pointerId);
      return;
    }
    if (state.mode === "node") {
      this.positions.set(state.nodeId, point(state.startPosition.x, state.startPosition.y));
      const record = this.nodeElements.get(state.nodeId);
      record?.group.setAttribute("transform", `translate(${formatNumber(state.startPosition.x)} ${formatNumber(state.startPosition.y)})`);
      record?.group.setAttribute("aria-grabbed", "false");
      this._updateIncidentEdges(state.nodeId);
      this._emitDrag(state.nodeId, state.startPosition, "cancel", event);
    } else {
      this.viewport = { ...state.startViewport };
      this._applyViewport();
      this.svg.classList.remove("is-panning");
      this._setCameraMoving(false, "pan");
    }
    try { this.svg.releasePointerCapture?.(event.pointerId); } catch { /* capture already released */ }
    this._touchPointers.delete(event.pointerId);
    this._pointerState = null;
  }

  _beginPinch(event) {
    const points = [...this._touchPointers.entries()].slice(0, 2);
    if (points.length < 2) return;
    const activePointer = this._pointerState;
    if (activePointer?.mode === "node") {
      const record = this.nodeElements.get(activePointer.nodeId);
      record?.group.setAttribute("aria-grabbed", "false");
      if (activePointer.moved) {
        const position = this.positions.get(activePointer.nodeId);
        if (position) this._getDraggedPositions(this.activeLayout).set(activePointer.nodeId, Object.freeze({ ...position }));
      }
    }
    this.svg.classList.remove("is-panning");
    this._pointerState = null;
    const [, first] = points[0];
    const [, second] = points[1];
    const midpoint = this._clientToSvg((first.x + second.x) / 2, (first.y + second.y) / 2);
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    this._pinchState = {
      pointerIds: points.map(([pointerId]) => pointerId),
      startDistance: distance,
      startViewport: { ...this.viewport },
      worldX: (midpoint.x - this.viewport.x) / this.viewport.scale,
      worldY: (midpoint.y - this.viewport.y) / this.viewport.scale
    };
    this._setCameraMoving(true, "pinch");
    try { this.svg.setPointerCapture?.(event.pointerId); } catch { /* synthetic pointer event */ }
    event.preventDefault();
  }

  _movePinch(event) {
    const state = this._pinchState;
    if (!state) return;
    const first = this._touchPointers.get(state.pointerIds[0]);
    const second = this._touchPointers.get(state.pointerIds[1]);
    if (!first || !second) return;
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const midpoint = this._clientToSvg((first.x + second.x) / 2, (first.y + second.y) / 2);
    const scale = clamp(
      state.startViewport.scale * distance / state.startDistance,
      this.options.minZoom,
      this.options.maxZoom
    );
    this.viewport = {
      x: midpoint.x - state.worldX * scale,
      y: midpoint.y - state.worldY * scale,
      scale
    };
    this._applyViewport();
    this._scheduleViewportChange("pinch");
    event.preventDefault();
  }

  _onWheel(event) {
    if (!this.positions.size) return;
    event.preventDefault();
    const cursor = this._clientToSvg(event.clientX, event.clientY);
    const oldScale = this.viewport.scale;
    const factor = Math.exp(-event.deltaY * this.options.zoomStep);
    const newScale = clamp(oldScale * factor, this.options.minZoom, this.options.maxZoom);
    if (Math.abs(newScale - oldScale) < 0.0001) return;
    this._setCameraMoving(true, "wheel");
    const worldX = (cursor.x - this.viewport.x) / oldScale;
    const worldY = (cursor.y - this.viewport.y) / oldScale;
    this.setViewport({
      x: cursor.x - worldX * newScale,
      y: cursor.y - worldY * newScale,
      scale: newScale
    }, { source: "wheel", animate: false });
  }

  _onKeyDown(event) {
    const entity = closestEntity(event.target, this.svg);
    if (event.key === "Escape") {
      this.highlights.selectedNodeIds.clear();
      this.highlights.selectedEdgeIds.clear();
      this._updateStateClasses();
      this._emitSelectionChange(event);
      this._emit("onEscape", { event, renderer: this });
      this.svg.focus?.();
      return;
    }
    if (!entity) return;
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      this._activateEntity(entity, event);
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      this._onContextMenu(event);
      return;
    }
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const elements = [...this.svg.querySelectorAll("[data-entity-kind][tabindex]")];
      const currentIndex = elements.indexOf(entity.element);
      const increment = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      elements[(currentIndex + increment + elements.length) % elements.length]?.focus?.();
    }
  }

  _emitDrag(nodeId, position, phase, event) {
    const node = this.nodeById.get(nodeId);
    const metadata = {
      renderer: this,
      nodeId,
      position: Object.freeze({ ...position }),
      phase,
      event,
      userPosition: true
    };
    this._emit("onNodeDrag", node, metadata);
    this._emit("onNodeMove", node, metadata);
  }

  _emitSelectionChange(sourceEvent) {
    const nodeIds = [...this.highlights.selectedNodeIds];
    const edgeIds = [...this.highlights.selectedEdgeIds];
    this._emit("onSelectionChange", {
      renderer: this,
      nodeIds: Object.freeze(nodeIds),
      edgeIds: Object.freeze(edgeIds),
      nodes: Object.freeze(nodeIds.map((id) => this.nodeById.get(id)).filter(Boolean)),
      edges: Object.freeze(edgeIds.map((id) => this.edgeById.get(id)).filter(Boolean)),
      sourceEvent
    });
  }

  _interactionMetadata(entity, event, extra = {}) {
    return {
      renderer: this,
      id: entity.id,
      kind: entity.kind,
      type: entity.kind,
      nodeId: entity.kind === "node" ? entity.id : null,
      edgeId: entity.kind === "edge" ? entity.id : null,
      connectionId: entity.kind === "edge" ? entity.id : null,
      event,
      clientX: event?.clientX,
      clientY: event?.clientY,
      element: entity.element,
      nodeIds: Object.freeze([...this.highlights.selectedNodeIds]),
      edgeIds: Object.freeze([...this.highlights.selectedEdgeIds]),
      ...extra
    };
  }

  _entityPayload(entity, item, metadata) {
    return {
      ...(item || {}),
      item,
      renderer: this,
      id: entity.id,
      kind: entity.kind,
      type: entity.kind,
      nodeId: entity.kind === "node" ? entity.id : null,
      edgeId: entity.kind === "edge" ? entity.id : null,
      connectionId: entity.kind === "edge" ? entity.id : null,
      multi: Boolean(metadata.multiple),
      multiple: Boolean(metadata.multiple),
      shiftKey: Boolean(metadata.event?.shiftKey),
      ctrlKey: Boolean(metadata.event?.ctrlKey),
      metaKey: Boolean(metadata.event?.metaKey),
      event: metadata.event,
      clientX: metadata.clientX,
      clientY: metadata.clientY,
      element: metadata.element,
      selectedNodeIds: metadata.nodeIds,
      selectedEdgeIds: metadata.edgeIds,
      metadata
    };
  }

  _emit(name, ...args) {
    const callback = this.callbacks[name];
    if (typeof callback === "function") return callback(...args);
    return undefined;
  }

  _viewportEvent(source, extra = {}) {
    return Object.freeze({
      renderer: this,
      viewport: Object.freeze({ ...this.viewport }),
      viewportSize: Object.freeze({ ...this.viewportSize }),
      source,
      moving: this._cameraMoving,
      ...extra
    });
  }

  _notifyViewportChange(source = "api", extra = {}) {
    const event = this._viewportEvent(source, extra);
    this._emit("onViewportChange", event);
    for (const listener of [...this._viewportSubscribers]) {
      try { listener(event); } catch (error) { reportAsyncError(error); }
    }
    return event;
  }

  _scheduleViewportChange(source = "camera") {
    if (this._viewportNotificationFrame != null) return;
    const windowRef = this.svg?.ownerDocument?.defaultView;
    const schedule = windowRef?.requestAnimationFrame?.bind(windowRef)
      || ((callback) => setTimeout(callback, 16));
    this._viewportNotificationFrame = schedule(() => {
      this._viewportNotificationFrame = null;
      this._notifyViewportChange(source, { live: true });
    });
  }

  _notifyRenderSubscribers(event) {
    for (const listener of [...this._renderSubscribers]) {
      try { listener(event); } catch (error) { reportAsyncError(error); }
    }
  }

  _setCameraMoving(moving, source = "camera") {
    const value = Boolean(moving);
    if (value) {
      clearTimeout(this._cameraIdleTimer);
      this._cameraIdleTimer = null;
    }
    if (this._cameraMoving !== value) {
      this._cameraMoving = value;
      this.svg?.classList.toggle("is-camera-moving", value);
      this.host?.classList?.toggle?.("connectome-camera-moving", value);
      if (this.options.suspendLabelsWhileMoving) this.setLabelsSuspended(value);
      this._emit("onCameraMovement", Object.freeze({ renderer: this, moving: value, source }));
    }
    if (value && source === "wheel") {
      this._cameraIdleTimer = setTimeout(() => this._setCameraMoving(false, source), Math.max(40, finiteNumber(this.options.cameraIdleDelay, 140)));
    }
  }

  _getDraggedPositions(layout) {
    if (!this.draggedPositionsByLayout.has(layout)) this.draggedPositionsByLayout.set(layout, new Map());
    return this.draggedPositionsByLayout.get(layout);
  }

  _resolveFitScope(options = {}) {
    const requestedScope = normalizeToken(options.scope || options.fitScope || "relevant");
    const explicitNodeIds = normalizeIds(options.nodeIds ?? options.nodes);
    const explicitEdgeIds = normalizeIds(
      options.edgeIds ?? options.edges ?? options.connectionIds ?? options.connections
    );
    let nodeIds = explicitNodeIds.length ? new Set(explicitNodeIds) : null;
    let edgeIds = explicitEdgeIds.length ? new Set(explicitEdgeIds) : null;

    if (!nodeIds && requestedScope === "all") nodeIds = new Set(this.nodes.map((node) => node.id));
    if (!edgeIds && requestedScope === "all") edgeIds = new Set(this.edges.map((edge) => edge.id));

    if (!nodeIds && requestedScope !== "all" && options.activeCircuit !== false && this.activeCircuit) {
      const circuitNodeIds = normalizeIds(
        this.activeCircuit.nodos ?? this.activeCircuit.nodes ?? this.activeCircuit.secuencia
      );
      if (circuitNodeIds.length) nodeIds = new Set(circuitNodeIds);
      if (!edgeIds) {
        const circuitEdgeIds = normalizeIds(
          this.activeCircuit.conexiones
          ?? this.activeCircuit.edges
          ?? this.activeCircuit.secuenciaConexiones
        );
        if (circuitEdgeIds.length) edgeIds = new Set(circuitEdgeIds);
      }
    }

    if (!nodeIds && requestedScope !== "all" && options.ignoreDimmed !== false
      && this.highlights.dimmedNodeIds.size > 0
      && this.highlights.dimmedNodeIds.size < this.nodes.length) {
      nodeIds = new Set(
        this.nodes
          .map((node) => node.id)
          .filter((nodeId) => !this.highlights.dimmedNodeIds.has(nodeId))
      );
    }
    if (!edgeIds && requestedScope !== "all" && options.ignoreDimmed !== false
      && this.highlights.dimmedEdgeIds.size > 0
      && this.highlights.dimmedEdgeIds.size < this.edges.length) {
      edgeIds = new Set(
        this.edges
          .map((edge) => edge.id)
          .filter((edgeId) => !this.highlights.dimmedEdgeIds.has(edgeId))
      );
    }
    return { nodeIds, edgeIds, scope: requestedScope || "relevant" };
  }

  _contentBounds(scope = {}) {
    if (!this.positions.size) return calculateLayoutBounds(this.positions);
    const nodeIds = scope.nodeIds instanceof Set ? scope.nodeIds : null;
    const edgeIds = scope.edgeIds instanceof Set ? scope.edgeIds : null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.nodes) {
      if (nodeIds && !nodeIds.has(node.id)) continue;
      const position = this.positions.get(node.id);
      if (!position) continue;
      const dimensions = getNodeDimensions(node, this.renderConfig?.nodeDimensions || {});
      minX = Math.min(minX, position.x - dimensions.width / 2);
      minY = Math.min(minY, position.y - dimensions.height / 2);
      maxX = Math.max(maxX, position.x + dimensions.width / 2);
      maxY = Math.max(maxY, position.y + dimensions.height / 2);
    }
    const parallelInfo = buildParallelEdgeInfo(this.edges);
    for (const edge of this.edges) {
      if (edgeIds && !edgeIds.has(edge.id)) continue;
      if (nodeIds && (!nodeIds.has(edge.origen) || !nodeIds.has(edge.destino))) continue;
      const parallel = parallelInfo.get(edge.id) || { index: 0, count: 1 };
      const geometry = calculateEdgeGeometry(edge, this.positions, this.nodeById, this._edgeGeometryOptions(edge, parallel));
      if (!geometry) continue;
      const controlPoints = [
        geometry.start,
        geometry.end,
        geometry.control,
        geometry.control1,
        geometry.control2
      ].filter(Boolean);
      for (const controlPoint of controlPoints) {
        minX = Math.min(minX, controlPoint.x);
        minY = Math.min(minY, controlPoint.y);
        maxX = Math.max(maxX, controlPoint.x);
        maxY = Math.max(maxY, controlPoint.y);
      }
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
      return calculateLayoutBounds(this.positions);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  _applyViewport() {
    if (!this.layers?.viewport) return;
    this.layers.viewport.setAttribute(
      "transform",
      `translate(${formatNumber(this.viewport.x)} ${formatNumber(this.viewport.y)}) scale(${formatNumber(this.viewport.scale)})`
    );
  }

  _updateViewportSize() {
    if (!this.svg || !this.host) return;
    const rect = this.host.getBoundingClientRect?.();
    const width = Math.max(1, finiteNumber(rect?.width || this.host.clientWidth, this.options.width));
    const height = Math.max(1, finiteNumber(rect?.height || this.host.clientHeight, this.options.height));
    this.viewportSize = { width, height };
    this.svg.setAttribute("viewBox", `0 0 ${formatNumber(width)} ${formatNumber(height)}`);
  }

  _observeSize() {
    const windowRef = this.host?.ownerDocument?.defaultView;
    const Observer = windowRef?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Observer !== "function") return;
    this._resizeObserver = new Observer(() => {
      const previous = { ...this.viewportSize };
      this._updateViewportSize();
      const changed = previous.width !== this.viewportSize.width || previous.height !== this.viewportSize.height;
      if (!changed) return;
      if (this._hasRendered && this.options.fitOnResize) {
        this.fit({ animate: false });
      } else {
        this._notifyViewportChange("resize", { resized: true, previousSize: previous });
      }
    });
    this._resizeObserver.observe(this.host);
  }

  _readMotionPreference() {
    const windowRef = this.host?.ownerDocument?.defaultView;
    const query = windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._reducedMotionQuery = query || null;
    const update = () => {
      this._reducedMotion = Boolean(query?.matches);
      this.svg?.classList.toggle("reduced-motion", this._reducedMotion);
      this.svg?.setAttribute("data-reduced-motion", this._reducedMotion ? "true" : "false");
    };
    update();
    if (!query) return;
    this._reducedMotionListener = update;
    if (typeof query.addEventListener === "function") query.addEventListener("change", update);
    else query.addListener?.(update);
  }

  _clientToSvg(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect?.() || { left: 0, top: 0, width: this.viewportSize.width, height: this.viewportSize.height };
    return {
      x: (clientX - rect.left) * this.viewportSize.width / Math.max(rect.width, 1),
      y: (clientY - rect.top) * this.viewportSize.height / Math.max(rect.height, 1)
    };
  }

  _clientToSvgScale() {
    const rect = this.svg.getBoundingClientRect?.() || { width: this.viewportSize.width, height: this.viewportSize.height };
    return {
      x: this.viewportSize.width / Math.max(rect.width, 1),
      y: this.viewportSize.height / Math.max(rect.height, 1)
    };
  }

  _updateDescription() {
    if (!this._descriptionElement) return;
    const alternative = this.activeCircuit?.alternativaTextual;
    this._descriptionElement.textContent = alternative
      ? `${this.activeCircuit.nombre || "Circuito seleccionado"}: ${alternative}`
      : `Grafo con ${this.nodes.length} estructuras y ${this.edges.length} conexiones dirigidas.`;
  }

  _unmount() {
    this._pointerState = null;
    this._touchPointers.clear();
    this._pinchState = null;
    this._hovered = null;
    clearTimeout(this._cameraIdleTimer);
    this._cameraIdleTimer = null;
    const windowRef = this.svg?.ownerDocument?.defaultView;
    if (this._viewportNotificationFrame != null) {
      if (windowRef?.cancelAnimationFrame) windowRef.cancelAnimationFrame(this._viewportNotificationFrame);
      else clearTimeout(this._viewportNotificationFrame);
      this._viewportNotificationFrame = null;
    }
    this._cameraMoving = false;
    this.host?.classList?.remove?.("connectome-camera-moving", "connectome-labels-suspended");
    if (this.svg) {
      for (const [type, handler, options] of this._eventBindings) {
        this.svg.removeEventListener(type, handler, options);
      }
      this._eventBindings = [];
      this.svg.remove();
    }
    this._resizeObserver?.disconnect?.();
    this._resizeObserver = null;
    if (this._reducedMotionQuery && this._reducedMotionListener) {
      if (typeof this._reducedMotionQuery.removeEventListener === "function") {
        this._reducedMotionQuery.removeEventListener("change", this._reducedMotionListener);
      } else {
        this._reducedMotionQuery.removeListener?.(this._reducedMotionListener);
      }
    }
    this._reducedMotionQuery = null;
    this._reducedMotionListener = null;
    this.svg = null;
    this.layers = null;
    this.defs = null;
    this._graphRenderSignature = null;
    this.nodeElements.clear();
    this.edgeElements.clear();
  }
}

export default ConnectomeRenderer;

function createNodeShape(documentRef, dimensions) {
  const { width, height, visualType } = dimensions;
  const common = {
    class: "connectome-node__shape",
    fill: nodeFill(visualType),
    stroke: "var(--connectome-node-stroke, #53627a)",
    "stroke-width": "1.8",
    "vector-effect": "non-scaling-stroke"
  };
  if (visualType === NODE_VISUAL_TYPES.NUCLEUS) {
    return svgElement(documentRef, "ellipse", {
      ...common,
      cx: "0", cy: "0", rx: formatNumber(width / 2), ry: formatNumber(height / 2)
    });
  }
  if (visualType === NODE_VISUAL_TYPES.SUBFIELD) {
    return svgElement(documentRef, "polygon", {
      ...common,
      points: `0,${formatNumber(-height / 2)} ${formatNumber(width / 2)},0 0,${formatNumber(height / 2)} ${formatNumber(-width / 2)},0`
    });
  }
  if (visualType === NODE_VISUAL_TYPES.MODULATORY_SYSTEM) {
    const inset = width * 0.19;
    return svgElement(documentRef, "polygon", {
      ...common,
      points: `${formatNumber(-width / 2 + inset)},${formatNumber(-height / 2)} ${formatNumber(width / 2 - inset)},${formatNumber(-height / 2)} ${formatNumber(width / 2)},0 ${formatNumber(width / 2 - inset)},${formatNumber(height / 2)} ${formatNumber(-width / 2 + inset)},${formatNumber(height / 2)} ${formatNumber(-width / 2)},0`
    });
  }
  return svgElement(documentRef, "rect", {
    ...common,
    x: formatNumber(-width / 2),
    y: formatNumber(-height / 2),
    width: formatNumber(width),
    height: formatNumber(height),
    rx: visualType === NODE_VISUAL_TYPES.TRACT ? formatNumber(height / 2) : visualType === NODE_VISUAL_TYPES.CORTEX ? "16" : "8"
  });
}

function nodeFill(type) {
  const values = {
    [NODE_VISUAL_TYPES.CORTEX]: "var(--connectome-cortex-fill, #dcecff)",
    [NODE_VISUAL_TYPES.NUCLEUS]: "var(--connectome-nucleus-fill, #f4e5ff)",
    [NODE_VISUAL_TYPES.TRACT]: "var(--connectome-tract-fill, #e5f5ed)",
    [NODE_VISUAL_TYPES.SUBFIELD]: "var(--connectome-subfield-fill, #fff0d5)",
    [NODE_VISUAL_TYPES.MODULATORY_SYSTEM]: "var(--connectome-modulator-fill, #ffe5ec)",
    [NODE_VISUAL_TYPES.REGION]: "var(--connectome-region-fill, #edf1f7)"
  };
  return values[type] || values[NODE_VISUAL_TYPES.REGION];
}

function intersectNodeBoundary(origin, toward, dimensions) {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return point(origin.x, origin.y);
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;
  let ratio;
  if (dimensions.visualType === NODE_VISUAL_TYPES.NUCLEUS) {
    ratio = 1 / Math.sqrt((dx * dx) / (halfWidth * halfWidth) + (dy * dy) / (halfHeight * halfHeight));
  } else if (dimensions.visualType === NODE_VISUAL_TYPES.SUBFIELD) {
    ratio = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight);
  } else {
    ratio = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
  }
  return point(origin.x + dx * ratio, origin.y + dy * ratio);
}

function buildParallelEdgeInfo(edges) {
  const groups = new Map();
  for (const edge of edges) {
    const key = edge.origen === edge.destino
      ? `self:${edge.origen}`
      : [edge.origen, edge.destino].sort(compareText).join("::");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const result = new Map();
  for (const group of groups.values()) {
    group.sort(compareEntities);
    group.forEach((edge, index) => result.set(edge.id, Object.freeze({ index, count: group.length })));
  }
  return result;
}

function applyStateClasses(element, states) {
  for (const [name, enabled] of Object.entries(states)) {
    element.classList.toggle(name, Boolean(enabled));
    element.classList.toggle(`is-${name}`, Boolean(enabled));
  }
}

function createHighlightState(selection) {
  return {
    selectedNodeIds: new Set(selection?.nodes || []),
    selectedEdgeIds: new Set(selection?.edges || []),
    dimmedNodeIds: new Set(),
    dimmedEdgeIds: new Set(),
    lesionedNodeIds: new Set(),
    lesionedEdgeIds: new Set(),
    routeNodeIds: new Set(),
    routeEdgeIds: new Set(),
    highlightedNodeIds: new Set(),
    highlightedEdgeIds: new Set(),
    currentNodeId: null,
    currentEdgeId: null,
    dimOthers: false
  };
}

function applyHighlightValues(target, source) {
  if (!source || typeof source !== "object") return;
  setHighlightSet(target, "selectedNodeIds", source.selectedNodeIds ?? source.selectedNodes ?? source.selectedNodeId);
  setHighlightSet(target, "selectedEdgeIds", source.selectedEdgeIds ?? source.selectedEdges ?? source.selectedEdgeId
    ?? source.selectedConnectionIds ?? source.selectedConnections ?? source.selectedConnectionId);
  setHighlightSet(target, "dimmedNodeIds", source.dimmedNodeIds ?? source.dimmedNodes);
  setHighlightSet(target, "dimmedEdgeIds", source.dimmedEdgeIds ?? source.dimmedEdges
    ?? source.dimmedConnectionIds ?? source.dimmedConnections);
  setHighlightSet(target, "lesionedNodeIds", source.lesionedNodeIds ?? source.lesionedNodes);
  setHighlightSet(target, "lesionedEdgeIds", source.lesionedEdgeIds ?? source.lesionedEdges
    ?? source.lesionedConnectionIds ?? source.lesionedConnections);
  setHighlightSet(target, "routeNodeIds", source.routeNodeIds ?? source.routeNodes);
  setHighlightSet(target, "routeEdgeIds", source.routeEdgeIds ?? source.routeEdges
    ?? source.routeConnectionIds ?? source.routeConnections);
  setHighlightSet(target, "highlightedNodeIds", source.highlightedNodeIds ?? source.highlightedNodes);
  setHighlightSet(target, "highlightedEdgeIds", source.highlightedEdgeIds ?? source.highlightedEdges
    ?? source.highlightedConnectionIds ?? source.highlightedConnections);
  if (hasOwn(source, "currentNodeId") || hasOwn(source, "currentNode")) {
    target.currentNodeId = readEntityId(source.currentNodeId ?? source.currentNode) || null;
  }
  if (hasOwn(source, "currentEdgeId") || hasOwn(source, "currentEdge")
    || hasOwn(source, "currentConnectionId") || hasOwn(source, "currentConnection")) {
    target.currentEdgeId = readEntityId(
      source.currentEdgeId ?? source.currentEdge ?? source.currentConnectionId ?? source.currentConnection
    ) || null;
  }
  if (hasOwn(source, "dimOthers")) target.dimOthers = Boolean(source.dimOthers);
}

function setHighlightSet(target, key, value) {
  if (value === undefined) return;
  target[key] = new Set(normalizeIds(value));
}

function normalizeIds(value) {
  if (value == null || value === false) return [];
  if (typeof value === "string") return [value];
  if (value instanceof Map) return [...value.keys()].map(readEntityId).filter(validId);
  if (Array.isArray(value) || value instanceof Set) return [...value].map(readEntityId).filter(validId);
  if (typeof value[Symbol.iterator] === "function") return [...value].map(readEntityId).filter(validId);
  const id = readEntityId(value);
  return validId(id) ? [id] : [];
}

function unionSets(...sets) {
  const result = new Set();
  for (const set of sets) for (const value of set || []) result.add(value);
  return result;
}

function mergePositionCollections(...collections) {
  const result = new Map();
  for (const collection of collections) {
    if (!collection) continue;
    const entries = collection instanceof Map
      ? collection
      : Array.isArray(collection)
        ? collection.map((entry) => Array.isArray(entry) ? entry : [entry?.id, entry])
        : Object.entries(collection);
    for (const [id, value] of entries) {
      if (validId(id) && Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))) {
        result.set(id, Object.freeze({ x: Number(value.x), y: Number(value.y) }));
      }
    }
  }
  return result;
}

function normalizeConstructorArguments(hostOrOptions, maybeOptions) {
  if (typeof hostOrOptions === "string" || hostOrOptions?.appendChild || hostOrOptions?.append) {
    return { host: hostOrOptions, options: maybeOptions || {} };
  }
  const options = hostOrOptions && typeof hostOrOptions === "object" ? hostOrOptions : (maybeOptions || {});
  return { host: options.host || options.container || options.element || null, options };
}

function normalizeRenderConfig(previous, input) {
  const value = input && typeof input === "object" ? input : {};
  const config = { ...(previous || {}), ...value };
  const graph = value.graph || value.connectomeGraph;
  config.nodes = value.nodes ?? value.regions ?? value.nodos
    ?? graph?.regionList ?? graph?.nodes ?? previous?.nodes ?? [];
  config.edges = value.edges ?? value.connections ?? value.conexiones
    ?? graph?.connectionList ?? graph?.edges ?? previous?.edges ?? [];
  config.circuits = value.circuits ?? value.circuitos
    ?? graph?.circuitList ?? graph?.circuits ?? previous?.circuits ?? [];
  config.layout = value.layout ?? value.layoutType ?? previous?.layout ?? "conceptual";
  return config;
}

function collectCallbacks(options) {
  const callbacks = { ...(options.callbacks || {}) };
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith("on") && typeof value === "function") callbacks[key] = value;
  }
  return callbacks;
}

function resolveHost(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  const documentRef = globalThis.document;
  return documentRef?.querySelector?.(value) || null;
}

function resolveActiveCircuit(value, circuitById) {
  if (value && typeof value === "object") return value;
  return validId(value) ? circuitById.get(value) || null : null;
}

function normalizeEntities(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value instanceof Map || value instanceof Set) return [...value.values()].filter(Boolean);
  if (typeof value.values === "function" && typeof value !== "string") {
    try { return [...value.values()].filter(Boolean); } catch { /* fall through */ }
  }
  return typeof value === "object" ? Object.values(value).filter(Boolean) : [];
}

function uniqueEntities(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (!validId(value?.id) || seen.has(value.id)) continue;
    seen.add(value.id);
    result.push(value);
  }
  return result;
}

function normalizeEntityMap(value) {
  if (value instanceof Map) return value;
  return indexFirst(normalizeEntities(value));
}

function indexFirst(items) {
  const result = new Map();
  for (const item of items) if (validId(item?.id) && !result.has(item.id)) result.set(item.id, item);
  return result;
}

function readPosition(positions, id) {
  const value = positions instanceof Map ? positions.get(id) : positions?.[id];
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null;
  return { x: Number(value.x), y: Number(value.y) };
}

function readEntityId(value) {
  if (typeof value === "string") return value;
  return value?.nodeId || value?.edgeId || value?.regionId || value?.connectionId || value?.id || "";
}

function closestEntity(target, boundary) {
  const element = target?.closest?.("[data-entity-kind]");
  if (!element || !boundary?.contains?.(element)) return null;
  const kind = element.getAttribute("data-entity-kind");
  const id = kind === "node" ? element.getAttribute("data-node-id") : element.getAttribute("data-edge-id");
  return validId(id) ? { kind, id, element } : null;
}

function sameEntity(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function createElementAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value == null) continue;
    element.setAttribute(name, String(value));
  }
  return element;
}

function svgElement(documentRef, name, attributes) {
  return createElementAttributes(documentRef.createElementNS(SVG_NS, name), attributes);
}

function splitLabel(value, maximumCharacters) {
  const text = String(value || "").trim();
  if (text.length <= maximumCharacters) return [text];
  const words = text.split(/\s+/);
  if (words.length === 1) return [`${text.slice(0, Math.max(1, maximumCharacters - 1))}…`];
  const lines = [""];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current || `${current} ${word}`.length <= maximumCharacters) {
      lines[lines.length - 1] = current ? `${current} ${word}` : word;
    } else if (lines.length === 1) lines.push(word);
    else {
      lines[1] = `${lines[1]} ${word}`;
    }
  }
  if (lines[1]?.length > maximumCharacters) lines[1] = `${lines[1].slice(0, Math.max(1, maximumCharacters - 1)).trim()}…`;
  return lines.slice(0, 2);
}

function nodeAriaLabel(node, visualType) {
  const functionText = Array.isArray(node.funciones) && node.funciones[0] ? `. ${node.funciones[0]}` : "";
  return `${node.nombre || node.id}. ${humanize(visualType)}${functionText}`;
}

function edgeAriaLabel(edge) {
  const direction = isReciprocalDirection(edge) ? "conexion reciproca" : "de origen a destino";
  return `${edge.nombre || edge.id}. ${direction}: ${edge.origen} a ${edge.destino}`;
}

function nodeTooltipText(node) {
  const brief = Array.isArray(node.funciones) ? node.funciones[0] : "";
  return [node.nombre || node.id, brief].filter(Boolean).join(" — ");
}

function edgeTooltipText(edge, nodeById) {
  const source = nodeById.get(edge.origen)?.nombre || edge.origen;
  const target = nodeById.get(edge.destino)?.nombre || edge.destino;
  const arrow = isReciprocalDirection(edge) ? "↔" : "→";
  return `${edge.nombre || edge.id}: ${source} ${arrow} ${target}`;
}

function compareEntities(a, b) {
  return compareText(a?.id, b?.id);
}

function compareText(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeDomToken(value) {
  const token = normalizeToken(value);
  return token || "entity";
}

function humanize(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Region";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function firstId(set) {
  return set?.values?.().next?.().value || null;
}

function resolveFitInsets(options = {}, fallbackPadding = 0) {
  const paddingObject = options.padding && typeof options.padding === "object"
    ? options.padding
    : null;
  const insetObject = options.insets && typeof options.insets === "object"
    ? options.insets
    : null;
  const scalarPadding = typeof options.padding === "object"
    ? fallbackPadding
    : finiteNumber(options.padding, fallbackPadding);
  const base = Math.max(0, finiteNumber(
    typeof options.insets === "number" ? options.insets : scalarPadding,
    fallbackPadding
  ));
  const source = insetObject || paddingObject || {};
  const readSide = (side) => Math.max(0, finiteNumber(
    options[`padding${side[0].toUpperCase()}${side.slice(1)}`]
      ?? source[side]
      ?? source[`padding${side[0].toUpperCase()}${side.slice(1)}`],
    base
  ));
  return Object.freeze({
    top: readSide("top"),
    right: readSide("right"),
    bottom: readSide("bottom"),
    left: readSide("left")
  });
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

function formatPoint(value) {
  return `${formatNumber(value.x)} ${formatNumber(value.y)}`;
}

function point(x, y) {
  return Object.freeze({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function reportAsyncError(error) {
  const schedule = globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
  schedule(() => { throw error; });
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
