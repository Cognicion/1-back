const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_OPTIONS = Object.freeze({
  width: 220,
  height: 144,
  padding: 10,
  showEdges: true,
  autoMount: true,
  ariaLabel: "Minimapa del conectoma; pulsa para mover la camara"
});

/**
 * Overview navigator decoupled from the main renderer. It consumes only public
 * renderer APIs and owns no anatomical data or graph state.
 */
export class ConnectomeMinimap {
  constructor(hostOrOptions = null, maybeOptions = {}) {
    const { host, options } = normalizeArguments(hostOrOptions, maybeOptions);
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.host = host || null;
    this.renderer = null;
    this.svg = null;
    this.layers = null;
    this.size = { width: this.options.width, height: this.options.height };
    this.mapping = null;
    this._unsubscribeViewport = null;
    this._unsubscribeRender = null;
    this._resizeObserver = null;
    this._clickHandler = (event) => this._onClick(event);
    this._keydownHandler = (event) => this._onKeyDown(event);
    if (this.host && this.options.autoMount !== false) this.mount(this.host);
    if (this.options.renderer) this.attachRenderer(this.options.renderer);
  }

  mount(host = this.host) {
    const resolved = resolveHost(host);
    if (!resolved) throw new TypeError("ConnectomeMinimap.mount requiere un host valido.");
    if (this.svg && this.host === resolved) return this;
    this._unmount();
    this.host = resolved;
    const documentRef = resolved.ownerDocument || globalThis.document;
    this.svg = svgElement(documentRef, "svg", {
      class: "connectome-minimap__svg",
      width: "100%",
      height: "100%",
      role: "button",
      tabindex: "0",
      focusable: "true",
      "aria-label": this.options.ariaLabel,
      preserveAspectRatio: "xMidYMid meet"
    });
    const title = svgElement(documentRef, "title");
    title.textContent = this.options.ariaLabel;
    const edges = svgElement(documentRef, "g", { class: "connectome-minimap__edges", "aria-hidden": "true" });
    const nodes = svgElement(documentRef, "g", { class: "connectome-minimap__nodes", "aria-hidden": "true" });
    const selection = svgElement(documentRef, "g", { class: "connectome-minimap__selection", "aria-hidden": "true" });
    const camera = svgElement(documentRef, "rect", {
      class: "connectome-minimap__camera",
      fill: "var(--connectome-accent-soft, rgba(82, 152, 102, .16))",
      "fill-opacity": ".34",
      stroke: "var(--connectome-focus, #7eb68a)",
      "stroke-width": "2",
      rx: "4",
      "vector-effect": "non-scaling-stroke",
      "aria-hidden": "true"
    });
    this.svg.append(title, edges, nodes, selection, camera);
    this.layers = { edges, nodes, selection, camera };
    this.svg.addEventListener("click", this._clickHandler);
    this.svg.addEventListener("keydown", this._keydownHandler);
    resolved.replaceChildren(this.svg);
    this._observeSize();
    this._updateSize();
    this.render();
    return this;
  }

  attachRenderer(renderer) {
    if (renderer === this.renderer) return this;
    this._unsubscribeViewport?.();
    this._unsubscribeRender?.();
    this.renderer = renderer || null;
    this._unsubscribeViewport = this.renderer?.subscribeViewport?.(
      () => this.syncCamera(),
      { immediate: true }
    ) || null;
    this._unsubscribeRender = this.renderer?.subscribeRender?.(
      () => this.render(),
      { immediate: true }
    ) || null;
    this.render();
    return this;
  }

  attach(renderer) {
    return this.attachRenderer(renderer);
  }

  render(input = {}) {
    if (input.renderer && input.renderer !== this.renderer) this.attachRenderer(input.renderer);
    if (!this.svg || !this.layers || !this.renderer) return this;
    this._updateSize();
    const nodes = input.nodes || this.renderer.nodes || [];
    const edges = input.edges || input.connections || this.renderer.edges || [];
    const positions = input.positions || this.renderer.positions || new Map();
    const bounds = input.bounds || this.renderer.getContentBounds?.({ scope: "all" });
    if (!bounds || !Number.isFinite(bounds.width) || !nodes.length) {
      this.layers.edges.replaceChildren();
      this.layers.nodes.replaceChildren();
      this.layers.selection.replaceChildren();
      this.layers.camera.setAttribute("visibility", "hidden");
      this.mapping = null;
      return this;
    }
    this.mapping = createMapping(bounds, this.size, this.options.padding);
    const documentRef = this.svg.ownerDocument;
    const projectedById = new Map();
    for (const node of nodes) {
      const position = readPosition(positions, node.id);
      if (position) projectedById.set(node.id, project(position, this.mapping));
    }

    const edgeFragment = documentRef.createDocumentFragment();
    if (this.options.showEdges !== false) {
      for (const edge of edges) {
        const source = projectedById.get(edge.origen);
        const target = projectedById.get(edge.destino);
        if (!source || !target) continue;
        edgeFragment.append(svgElement(documentRef, "line", {
          class: "connectome-minimap__edge",
          x1: round(source.x),
          y1: round(source.y),
          x2: round(target.x),
          y2: round(target.y),
          stroke: "var(--connectome-muted-text, #64748b)",
          "stroke-width": ".8",
          opacity: ".3"
        }));
      }
    }
    this.layers.edges.replaceChildren(edgeFragment);

    const selectedIds = new Set([
      ...(this.renderer.highlights?.selectedNodeIds || []),
      ...(this.renderer.highlights?.routeNodeIds || [])
    ]);
    const nodeFragment = documentRef.createDocumentFragment();
    const selectionFragment = documentRef.createDocumentFragment();
    for (const node of nodes) {
      const projected = projectedById.get(node.id);
      if (!projected) continue;
      nodeFragment.append(svgElement(documentRef, "circle", {
        class: "connectome-minimap__node",
        cx: round(projected.x),
        cy: round(projected.y),
        r: "2.1",
        fill: "var(--connectome-text-muted, #98a29a)",
        opacity: ".8"
      }));
      if (selectedIds.has(node.id)) {
        selectionFragment.append(svgElement(documentRef, "circle", {
          class: "connectome-minimap__selected-node",
          cx: round(projected.x),
          cy: round(projected.y),
          r: "4.8",
          fill: "none",
          stroke: "var(--connectome-focus, #7eb68a)",
          "stroke-width": "2"
        }));
      }
    }
    this.layers.nodes.replaceChildren(nodeFragment);
    this.layers.selection.replaceChildren(selectionFragment);
    this.syncCamera();
    return this;
  }

  syncCamera() {
    if (!this.renderer || !this.mapping || !this.layers?.camera) return this;
    const viewport = this.renderer.getViewport?.();
    const viewportSize = this.renderer.getViewportSize?.();
    if (!viewport || !viewportSize || !Number.isFinite(viewport.scale) || viewport.scale <= 0) return this;
    const worldTopLeft = {
      x: -viewport.x / viewport.scale,
      y: -viewport.y / viewport.scale
    };
    const projected = project(worldTopLeft, this.mapping);
    const width = viewportSize.width / viewport.scale * this.mapping.scale;
    const height = viewportSize.height / viewport.scale * this.mapping.scale;
    setAttributes(this.layers.camera, {
      x: round(projected.x),
      y: round(projected.y),
      width: round(Math.max(2, width)),
      height: round(Math.max(2, height)),
      visibility: "visible"
    });
    return this;
  }

  sync() {
    return this.render();
  }

  setVisible(visible = true) {
    if (this.host) this.host.hidden = !visible;
    return this;
  }

  destroy() {
    this._unsubscribeViewport?.();
    this._unsubscribeRender?.();
    this._unsubscribeViewport = null;
    this._unsubscribeRender = null;
    this.renderer = null;
    this._unmount();
  }

  _onClick(event) {
    if (event.button != null && event.button !== 0) return;
    this._panFromClientPoint(event.clientX, event.clientY);
  }

  _onKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    this._panFromClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  _panFromClientPoint(clientX, clientY) {
    if (!this.svg || !this.mapping || !this.renderer) return;
    const rect = this.svg.getBoundingClientRect();
    const local = {
      x: (clientX - rect.left) * this.size.width / Math.max(1, rect.width),
      y: (clientY - rect.top) * this.size.height / Math.max(1, rect.height)
    };
    const world = unproject(local, this.mapping);
    this.renderer.panToWorld?.(world.x, world.y, { animate: true, source: "minimap" });
  }

  _updateSize() {
    if (!this.svg || !this.host) return;
    const rect = this.host.getBoundingClientRect?.();
    this.size = {
      width: Math.max(80, finiteNumber(rect?.width || this.host.clientWidth, this.options.width)),
      height: Math.max(60, finiteNumber(rect?.height || this.host.clientHeight, this.options.height))
    };
    this.svg.setAttribute("viewBox", `0 0 ${round(this.size.width)} ${round(this.size.height)}`);
  }

  _observeSize() {
    const windowRef = this.host?.ownerDocument?.defaultView;
    const Observer = windowRef?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Observer !== "function") return;
    this._resizeObserver = new Observer(() => this.render());
    this._resizeObserver.observe(this.host);
  }

  _unmount() {
    this._resizeObserver?.disconnect?.();
    this._resizeObserver = null;
    if (this.svg) {
      this.svg.removeEventListener("click", this._clickHandler);
      this.svg.removeEventListener("keydown", this._keydownHandler);
      this.svg.remove();
    }
    this.svg = null;
    this.layers = null;
    this.mapping = null;
  }
}

export function createConnectomeMinimap(host, options = {}) {
  return new ConnectomeMinimap(host, options);
}

export default ConnectomeMinimap;

function createMapping(bounds, size, padding) {
  const safePadding = Math.max(0, finiteNumber(padding, 10));
  const width = Math.max(1, finiteNumber(bounds.width, 1));
  const height = Math.max(1, finiteNumber(bounds.height, 1));
  const scale = Math.min(
    Math.max(1, size.width - safePadding * 2) / width,
    Math.max(1, size.height - safePadding * 2) / height
  );
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return Object.freeze({
    bounds: Object.freeze({ ...bounds }),
    scale,
    offsetX: (size.width - drawnWidth) / 2 - bounds.minX * scale,
    offsetY: (size.height - drawnHeight) / 2 - bounds.minY * scale
  });
}

function project(position, mapping) {
  return {
    x: position.x * mapping.scale + mapping.offsetX,
    y: position.y * mapping.scale + mapping.offsetY
  };
}

function unproject(position, mapping) {
  return {
    x: (position.x - mapping.offsetX) / mapping.scale,
    y: (position.y - mapping.offsetY) / mapping.scale
  };
}

function readPosition(collection, id) {
  const value = collection instanceof Map ? collection.get(id) : collection?.[id];
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
    ? { x: Number(value.x), y: Number(value.y) }
    : null;
}

function normalizeArguments(hostOrOptions, maybeOptions) {
  if (typeof hostOrOptions === "string" || hostOrOptions?.append || hostOrOptions?.appendChild) {
    return { host: hostOrOptions, options: maybeOptions || {} };
  }
  const options = hostOrOptions && typeof hostOrOptions === "object" ? hostOrOptions : (maybeOptions || {});
  return { host: options.host || options.container || null, options };
}

function resolveHost(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  return globalThis.document?.querySelector?.(value) || null;
}

function svgElement(documentRef, name, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, name);
  setAttributes(element, attributes);
  return element;
}

function setAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value == null) continue;
    element.setAttribute(name, String(value));
  }
  return element;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}
