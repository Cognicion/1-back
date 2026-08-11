const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export const CONNECTOME_LAYOUT_TYPES = Object.freeze({
  CONCEPTUAL: "conceptual",
  HIERARCHICAL: "jerarquico",
  FLOW: "flujo",
  RADIAL: "radial",
  NETWORK: "red",
  MEMORY: "memoria"
});

export const DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  padding: 96,
  nodeWidth: 168,
  nodeHeight: 76,
  nodeSpacing: 150,
  columnSpacing: 230,
  levelSpacing: 132,
  ringSpacing: 180,
  direction: "LR",
  clusterBy: "category"
});

const LAYOUT_ALIASES = new Map([
  ["conceptual", CONNECTOME_LAYOUT_TYPES.CONCEPTUAL],
  ["anatomico", CONNECTOME_LAYOUT_TYPES.CONCEPTUAL],
  ["anatomico_conceptual", CONNECTOME_LAYOUT_TYPES.CONCEPTUAL],
  ["anatomical", CONNECTOME_LAYOUT_TYPES.CONCEPTUAL],
  ["hierarquico", CONNECTOME_LAYOUT_TYPES.HIERARCHICAL],
  ["jerarquico", CONNECTOME_LAYOUT_TYPES.HIERARCHICAL],
  ["hierarchical", CONNECTOME_LAYOUT_TYPES.HIERARCHICAL],
  ["tree", CONNECTOME_LAYOUT_TYPES.HIERARCHICAL],
  ["flujo", CONNECTOME_LAYOUT_TYPES.FLOW],
  ["diagrama_de_flujo", CONNECTOME_LAYOUT_TYPES.FLOW],
  ["flow", CONNECTOME_LAYOUT_TYPES.FLOW],
  ["radial", CONNECTOME_LAYOUT_TYPES.RADIAL],
  ["red", CONNECTOME_LAYOUT_TYPES.NETWORK],
  ["network", CONNECTOME_LAYOUT_TYPES.NETWORK],
  ["memoria", CONNECTOME_LAYOUT_TYPES.MEMORY],
  ["mapa_de_memoria", CONNECTOME_LAYOUT_TYPES.MEMORY],
  ["memory", CONNECTOME_LAYOUT_TYPES.MEMORY]
]);

export function normalizeLayoutName(value) {
  const key = normalizeKey(value || CONNECTOME_LAYOUT_TYPES.CONCEPTUAL);
  return LAYOUT_ALIASES.get(key) || CONNECTOME_LAYOUT_TYPES.CONCEPTUAL;
}

/**
 * Anatomical concept map: visible entities are packed once by their parent
 * region. It deliberately uses no force simulation, so the result is stable.
 */
export function layoutConceptual(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  const groups = new Map();

  for (const node of context.nodes) {
    const parent = node.regionPadre && context.nodeById.has(node.regionPadre)
      ? node.regionPadre
      : `tipo:${normalizeKey(node.tipo || "region")}`;
    addToGroup(groups, parent, node);
  }

  const labels = new Map();
  for (const [groupId] of groups) {
    if (groupId.startsWith("tipo:")) {
      labels.set(groupId, humanize(groupId.slice(5)));
    } else {
      labels.set(groupId, context.nodeById.get(groupId)?.nombre || humanize(groupId));
    }
  }

  const packed = packGroups(groups, context.options, {
    labels,
    preferredGroupId: resolveFocusId(context.options, context.nodeById)
  });
  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.CONCEPTUAL, context, packed.positions, packed.clusters);
}

/** Hierarchy based exclusively on regionPadre relationships. */
export function layoutHierarchical(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  const depthById = new Map();
  const pathById = new Map();

  const getDepth = (nodeId, trail = new Set()) => {
    if (depthById.has(nodeId)) return depthById.get(nodeId);
    if (trail.has(nodeId)) {
      depthById.set(nodeId, 0);
      pathById.set(nodeId, nodeId);
      return 0;
    }
    const node = context.nodeById.get(nodeId);
    const parentId = node?.regionPadre;
    if (!parentId || !context.nodeById.has(parentId)) {
      depthById.set(nodeId, 0);
      pathById.set(nodeId, nodeId);
      return 0;
    }
    const nextTrail = new Set(trail);
    nextTrail.add(nodeId);
    const depth = getDepth(parentId, nextTrail) + 1;
    depthById.set(nodeId, depth);
    pathById.set(nodeId, `${pathById.get(parentId) || parentId}/${nodeId}`);
    return depth;
  };

  for (const node of context.nodes) getDepth(node.id);

  const levels = new Map();
  for (const node of context.nodes) {
    const depth = depthById.get(node.id) || 0;
    addToGroup(levels, depth, node);
  }

  const maximumLevelSize = Math.max(1, ...[...levels.values()].map((level) => level.length));
  const positions = new Map();
  const orderedDepths = [...levels.keys()].sort((a, b) => a - b);
  const topToBottom = isTopToBottom(context.options.direction);
  const naturalWidth = Math.max(
    context.options.width,
    context.options.padding * 2 + (maximumLevelSize - 1) * context.options.columnSpacing
  );
  const naturalHeight = Math.max(
    context.options.height,
    context.options.padding * 2 + (maximumLevelSize - 1) * context.options.levelSpacing
  );

  for (const depth of orderedDepths) {
    const level = levels.get(depth).sort((a, b) => {
      const pathOrder = compareText(pathById.get(a.id), pathById.get(b.id));
      return pathOrder || compareNodes(a, b);
    });
    level.forEach((node, index) => {
      const crossAxisSpacing = topToBottom ? context.options.columnSpacing : context.options.levelSpacing;
      const crossAxisExtent = (level.length - 1) * crossAxisSpacing;
      const crossAxisStart = ((topToBottom ? naturalWidth : naturalHeight) - crossAxisExtent) / 2;
      const x = topToBottom
        ? crossAxisStart + index * crossAxisSpacing
        : context.options.padding + depth * context.options.columnSpacing;
      const y = topToBottom
        ? context.options.padding + depth * context.options.levelSpacing
        : crossAxisStart + index * crossAxisSpacing;
      positions.set(node.id, point(x, y));
    });
  }

  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.HIERARCHICAL, context, positions);
}

/** Flow layout whose primary lane follows circuito.secuencia without cloning nodes. */
export function layoutFlow(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  const circuit = resolveCircuit(context.options, context.circuits);
  const sequence = uniqueIds(
    (circuit?.secuencia || context.options.sequence || [])
      .map(readEntityId)
      .filter((id) => context.nodeById.has(id))
  );
  const primary = sequence.length ? sequence : deriveDirectedOrder(context.nodes, context.edges);
  const primarySet = new Set(primary);
  const secondary = context.nodes.filter((node) => !primarySet.has(node.id));
  const positions = new Map();
  const padding = context.options.padding;
  const mainY = padding + context.options.nodeHeight;

  primary.forEach((nodeId, index) => {
    positions.set(nodeId, point(padding + index * context.options.columnSpacing, mainY));
  });

  if (secondary.length) {
    const columns = Math.max(1, Math.min(
      Math.max(primary.length, 1),
      Math.ceil(Math.sqrt(secondary.length * 1.6))
    ));
    const secondaryStartY = mainY + context.options.levelSpacing * 1.45;
    secondary.forEach((node, index) => {
      positions.set(node.id, point(
        padding + (index % columns) * context.options.columnSpacing,
        secondaryStartY + Math.floor(index / columns) * context.options.levelSpacing
      ));
    });
  }

  const direction = context.options.direction || "LR";
  const oriented = isTopToBottom(direction) ? transposePositions(positions) : positions;
  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.FLOW, context, oriented, [{
    id: circuit?.id || "flujo_principal",
    label: circuit?.nombre || "Flujo principal",
    nodeIds: Object.freeze([...primary])
  }]);
}

/** Selected-node-centred radial layout using undirected graph distance as rings. */
export function layoutRadial(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  if (!context.nodes.length) return finalizeLayout(CONNECTOME_LAYOUT_TYPES.RADIAL, context, new Map());

  const adjacency = buildAdjacency(context.nodes, context.edges);
  const focusId = resolveFocusId(context.options, context.nodeById)
    || highestDegreeNode(context.nodes, adjacency)?.id
    || context.nodes[0].id;
  const distances = breadthFirstDistances(focusId, adjacency);
  const rings = new Map();
  const unreachableDistance = Math.max(0, ...distances.values()) + 1;

  for (const node of context.nodes) {
    const distance = distances.has(node.id) ? distances.get(node.id) : unreachableDistance;
    addToGroup(rings, distance, node);
  }

  const center = point(context.options.width / 2, context.options.height / 2);
  const positions = new Map([[focusId, center]]);
  let previousRadius = 0;
  const orderedRings = [...rings.keys()].filter((depth) => depth !== 0).sort((a, b) => a - b);

  for (const depth of orderedRings) {
    const ring = rings.get(depth).sort(compareNodes);
    const circumferenceRadius = ring.length * context.options.nodeSpacing / (Math.PI * 2);
    const radius = Math.max(
      context.options.ringSpacing * depth,
      circumferenceRadius,
      previousRadius + context.options.ringSpacing * 0.72
    );
    previousRadius = radius;
    placeRing(ring, center, radius, positions, context.options.startAngle);
  }

  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.RADIAL, context, positions, [{
    id: "centro_radial",
    label: context.nodeById.get(focusId)?.nombre || focusId,
    nodeIds: Object.freeze(context.nodes.map((node) => node.id)),
    centerNodeId: focusId
  }]);
}

/**
 * Network layout separates connected components, then lays each component out
 * around a stable degree-ranked hub. It is deterministic and computed once.
 */
export function layoutNetwork(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  const adjacency = buildAdjacency(context.nodes, context.edges);
  const focusId = resolveFocusId(context.options, context.nodeById);
  const components = connectedComponents(context.nodes, adjacency);
  components.sort((a, b) => {
    const aFocused = focusId && a.some((node) => node.id === focusId) ? 1 : 0;
    const bFocused = focusId && b.some((node) => node.id === focusId) ? 1 : 0;
    return bFocused - aFocused || b.length - a.length || compareNodes(a[0], b[0]);
  });

  const largestComponent = Math.max(1, ...components.map((component) => component.length));
  const cellSize = Math.max(430, Math.ceil(Math.sqrt(largestComponent)) * context.options.nodeSpacing * 1.55);
  const columns = Math.max(1, Math.ceil(Math.sqrt(components.length * 1.45)));
  const positions = new Map();
  const clusters = [];

  components.forEach((component, componentIndex) => {
    const col = componentIndex % columns;
    const row = Math.floor(componentIndex / columns);
    const center = point(
      context.options.padding + cellSize / 2 + col * cellSize,
      context.options.padding + cellSize / 2 + row * cellSize
    );
    const componentIds = new Set(component.map((node) => node.id));
    const hub = focusId && componentIds.has(focusId)
      ? context.nodeById.get(focusId)
      : highestDegreeNode(component, adjacency);
    const distances = breadthFirstDistances(hub.id, adjacency, componentIds);
    const rings = new Map();
    for (const node of component) addToGroup(rings, distances.get(node.id) || 0, node);
    positions.set(hub.id, center);

    let previousRadius = 0;
    for (const depth of [...rings.keys()].filter((value) => value > 0).sort((a, b) => a - b)) {
      const ring = rings.get(depth).sort(compareNodes);
      const radius = Math.max(
        previousRadius + context.options.ringSpacing * 0.72,
        context.options.ringSpacing * depth,
        ring.length * context.options.nodeSpacing / (Math.PI * 2)
      );
      previousRadius = radius;
      placeRing(ring, center, radius, positions, context.options.startAngle);
    }

    clusters.push({
      id: `componente_${componentIndex + 1}`,
      label: component.length === 1 ? component[0].nombre : `Componente ${componentIndex + 1}`,
      nodeIds: Object.freeze(component.map((node) => node.id)),
      centerNodeId: hub.id
    });
  });

  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.NETWORK, context, positions, clusters);
}

/** Memory-map clusters. A shared anatomical node is assigned once, never cloned. */
export function layoutMemory(nodes = [], edges = [], options = {}) {
  const context = createContext(nodes, edges, options);
  const membershipByNode = new Map(context.nodes.map((node) => [node.id, new Set()]));
  const clusterLabels = new Map();
  const clusterByCircuit = normalizeKey(context.options.clusterBy) === "circuit";
  const memoryGroups = uniqueEntities(normalizeEntities(context.options.memoryGroups));
  const circuitById = new Map(context.circuits.map((circuit) => [circuit.id, circuit]));
  const addCircuitMembership = (circuit, clusterId) => {
    if (!circuit) return;
    const circuitNodeIds = uniqueIds([
      ...toArray(circuit.nodos).map(readEntityId),
      ...toArray(circuit.secuencia).map(readEntityId)
    ]);
    for (const nodeId of circuitNodeIds) membershipByNode.get(nodeId)?.add(clusterId);
  };

  if (memoryGroups.length && !clusterByCircuit) {
    for (const group of memoryGroups) {
      clusterLabels.set(group.id, group.nombre || group.name || humanize(group.id));
      for (const circuitId of toArray(group.circuitos ?? group.circuits).map(readEntityId)) {
        addCircuitMembership(circuitById.get(circuitId), group.id);
      }
    }
  } else {
    for (const circuit of context.circuits) {
      const clusterId = clusterByCircuit
        ? circuit.id
        : normalizeKey(circuit.categoria || circuit.id || "otros");
      clusterLabels.set(clusterId, clusterByCircuit
        ? circuit.nombre || humanize(circuit.id)
        : humanize(circuit.categoria || circuit.id));
      addCircuitMembership(circuit, clusterId);
    }
  }

  const groups = new Map();
  for (const node of context.nodes) {
    const memberships = [...(membershipByNode.get(node.id) || [])].sort(compareText);
    let clusterId;
    if (memberships.length > 1) clusterId = "compartido";
    else if (memberships.length === 1) clusterId = memberships[0];
    else {
      const systems = toArray(node.sistemas ?? node.sistema).map(normalizeKey);
      if (memoryGroups.length && !clusterByCircuit) {
        const declaredGroupIds = new Set(memoryGroups.map((group) => group.id));
        const alias = systems.map((system) => ({
          aprendizaje_procedimental: "memoria_procedimental",
          memoria_procedimental: "memoria_procedimental",
          memoria_emocional: "memoria_emocional",
          memoria_espacial: "memoria_espacial",
          memoria_semantica: "memoria_semantica",
          memoria_trabajo: "memoria_trabajo",
          memoria_episodica: "memoria_episodica"
        })[system]).find((groupId) => declaredGroupIds.has(groupId));
        clusterId = alias || "otras_estructuras";
      } else {
        clusterId = systems.find((system) => system.includes("memoria") || system.includes("aprendizaje")) || "otros";
      }
    }
    if (clusterId === "compartido") clusterLabels.set(clusterId, "Estructuras compartidas");
    if (clusterId === "otras_estructuras") clusterLabels.set(clusterId, "Otras estructuras visibles");
    if (!clusterLabels.has(clusterId)) clusterLabels.set(clusterId, humanize(clusterId));
    addToGroup(groups, clusterId, node);
  }

  const activeCircuit = resolveCircuit(context.options, context.circuits);
  const declaredActiveGroup = activeCircuit && memoryGroups.length
    ? memoryGroups.find((group) => toArray(group.circuitos ?? group.circuits).map(readEntityId).includes(activeCircuit.id))
    : null;
  const preferredGroupId = activeCircuit
    ? (clusterByCircuit
      ? activeCircuit.id
      : declaredActiveGroup?.id || normalizeKey(activeCircuit.categoria || activeCircuit.id))
    : null;
  const packed = packGroups(groups, context.options, {
    labels: clusterLabels,
    preferredGroupId
  });
  return finalizeLayout(CONNECTOME_LAYOUT_TYPES.MEMORY, context, packed.positions, packed.clusters);
}

const LAYOUT_FUNCTIONS = Object.freeze({
  [CONNECTOME_LAYOUT_TYPES.CONCEPTUAL]: layoutConceptual,
  [CONNECTOME_LAYOUT_TYPES.HIERARCHICAL]: layoutHierarchical,
  [CONNECTOME_LAYOUT_TYPES.FLOW]: layoutFlow,
  [CONNECTOME_LAYOUT_TYPES.RADIAL]: layoutRadial,
  [CONNECTOME_LAYOUT_TYPES.NETWORK]: layoutNetwork,
  [CONNECTOME_LAYOUT_TYPES.MEMORY]: layoutMemory
});

/** Public dispatcher used by the renderer and directly by tests. */
export function computeConnectomeLayout(configOrNodes = {}, maybeEdges = [], maybeOptions = {}) {
  const config = normalizeComputeArguments(configOrNodes, maybeEdges, maybeOptions);
  const layout = normalizeLayoutName(config.layout || config.type);
  const options = {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...(config.layoutOptions || {}),
    ...pickLayoutOptions(config),
    circuits: config.circuits,
    activeCircuit: config.activeCircuit ?? config.activeCircuitId,
    memoryGroups: config.memoryGroups ?? config.gruposMemoria,
    sequence: config.sequence,
    selectedNodeId: config.selectedNodeId,
    selectedNodeIds: config.selectedNodeIds,
    selectedNode: config.selectedNode,
    centerNodeId: config.centerNodeId,
    focusNodeId: config.focusNodeId,
    fixedPositions: config.fixedPositions || config.positions
  };
  return LAYOUT_FUNCTIONS[layout](config.nodes, config.edges, options);
}

export const computeLayout = computeConnectomeLayout;
export const calculateLayout = computeConnectomeLayout;
export const calcularLayoutConectoma = computeConnectomeLayout;
export const conceptualLayout = layoutConceptual;
export const hierarchicalLayout = layoutHierarchical;
export const flowLayout = layoutFlow;
export const radialLayout = layoutRadial;
export const networkLayout = layoutNetwork;
export const memoryLayout = layoutMemory;
export const computeConceptualLayout = layoutConceptual;
export const computeHierarchicalLayout = layoutHierarchical;
export const computeFlowLayout = layoutFlow;
export const computeRadialLayout = layoutRadial;
export const computeNetworkLayout = layoutNetwork;
export const computeMemoryLayout = layoutMemory;

/** Stable structural signature suitable for memoizing a layout result. */
export function createLayoutCacheKey(configOrNodes = {}, maybeEdges = [], maybeOptions = {}) {
  const config = normalizeComputeArguments(configOrNodes, maybeEdges, maybeOptions);
  const nodes = uniqueEntities(normalizeEntities(config.nodes)).sort(compareNodes);
  const edges = uniqueEntities(normalizeEntities(config.edges)).sort(compareEntities);
  const circuits = uniqueEntities(normalizeEntities(config.circuits)).sort(compareEntities);
  const memoryGroups = uniqueEntities(normalizeEntities(config.memoryGroups ?? config.gruposMemoria)).sort(compareEntities);
  const requestedCircuit = config.activeCircuit ?? config.activeCircuitId;
  const activeCircuit = typeof requestedCircuit === "object"
    ? requestedCircuit
    : circuits.find((circuit) => circuit.id === requestedCircuit);
  const options = { ...DEFAULT_LAYOUT_OPTIONS, ...(config.layoutOptions || {}), ...pickLayoutOptions(config) };
  const fixedPositions = normalizePositionEntries(config.fixedPositions || config.positions)
    .sort(([a], [b]) => compareText(a, b));

  return JSON.stringify({
    layout: normalizeLayoutName(config.layout || config.type),
    nodes: nodes.map((node) => [
      node.id,
      node.nombre || "",
      node.regionPadre || "",
      node.tipo || "",
      node.nivelAnatomico || "",
      toArray(node.sistemas ?? node.sistema).map(normalizeKey).sort(compareText)
    ]),
    edges: edges.map((edge) => [edge.id, edge.origen, edge.destino, edge.direccion || ""]),
    circuits: circuits.map((circuit) => [
      circuit.id,
      circuit.nombre || "",
      circuit.categoria || "",
      toArray(circuit.nodos).map(readEntityId),
      toArray(circuit.secuencia).map(readEntityId)
    ]),
    memoryGroups: memoryGroups.map((group) => [
      group.id,
      group.nombre || group.name || "",
      toArray(group.circuitos ?? group.circuits).map(readEntityId).sort(compareText)
    ]),
    activeCircuit: activeCircuit?.id || requestedCircuit || "",
    activeSequence: toArray(activeCircuit?.secuencia).map(readEntityId),
    focus: config.centerNodeId
      || config.focusNodeId
      || config.selectedNodeId
      || firstCollectionId(config.selectedNodeIds)
      || readEntityId(config.selectedNode)
      || "",
    options: {
      width: finiteNumber(options.width, DEFAULT_WIDTH),
      height: finiteNumber(options.height, DEFAULT_HEIGHT),
      padding: finiteNumber(options.padding, DEFAULT_LAYOUT_OPTIONS.padding),
      nodeWidth: finiteNumber(options.nodeWidth, DEFAULT_LAYOUT_OPTIONS.nodeWidth),
      nodeHeight: finiteNumber(options.nodeHeight, DEFAULT_LAYOUT_OPTIONS.nodeHeight),
      nodeSpacing: finiteNumber(options.nodeSpacing, DEFAULT_LAYOUT_OPTIONS.nodeSpacing),
      columnSpacing: finiteNumber(options.columnSpacing, DEFAULT_LAYOUT_OPTIONS.columnSpacing),
      levelSpacing: finiteNumber(options.levelSpacing, DEFAULT_LAYOUT_OPTIONS.levelSpacing),
      ringSpacing: finiteNumber(options.ringSpacing, DEFAULT_LAYOUT_OPTIONS.ringSpacing),
      direction: options.direction || "LR",
      clusterBy: options.clusterBy || "category",
      startAngle: finiteNumber(options.startAngle, -Math.PI / 2),
      sequence: toArray(options.sequence).map(readEntityId)
    },
    fixedPositions: fixedPositions.map(([id, value]) => [id, finiteNumber(value?.x, 0), finiteNumber(value?.y, 0)])
  });
}

export class ConnectomeLayoutEngine {
  constructor({ maxEntries = 48 } = {}) {
    this.maxEntries = Math.max(1, Math.floor(finiteNumber(maxEntries, 48)));
    this.cache = new Map();
  }

  compute(configOrNodes = {}, maybeEdges = [], maybeOptions = {}) {
    const config = normalizeComputeArguments(configOrNodes, maybeEdges, maybeOptions);
    const key = createLayoutCacheKey(config);
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cloneLayoutResult(cached);
    }
    const result = computeConnectomeLayout(config);
    this.cache.set(key, result);
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    return cloneLayoutResult(result);
  }

  clear() {
    this.cache.clear();
  }

  clearCache() {
    this.clear();
  }

  get size() {
    return this.cache.size;
  }
}

export const LayoutEngine = ConnectomeLayoutEngine;

function createContext(nodes, edges, options) {
  const normalizedOptions = {
    ...DEFAULT_LAYOUT_OPTIONS,
    ...(options || {}),
    width: Math.max(320, finiteNumber(options?.width, DEFAULT_WIDTH)),
    height: Math.max(240, finiteNumber(options?.height, DEFAULT_HEIGHT)),
    padding: Math.max(24, finiteNumber(options?.padding, DEFAULT_LAYOUT_OPTIONS.padding)),
    nodeWidth: Math.max(40, finiteNumber(options?.nodeWidth, DEFAULT_LAYOUT_OPTIONS.nodeWidth)),
    nodeHeight: Math.max(30, finiteNumber(options?.nodeHeight, DEFAULT_LAYOUT_OPTIONS.nodeHeight)),
    nodeSpacing: Math.max(60, finiteNumber(options?.nodeSpacing, DEFAULT_LAYOUT_OPTIONS.nodeSpacing)),
    columnSpacing: Math.max(100, finiteNumber(options?.columnSpacing, DEFAULT_LAYOUT_OPTIONS.columnSpacing)),
    levelSpacing: Math.max(80, finiteNumber(options?.levelSpacing, DEFAULT_LAYOUT_OPTIONS.levelSpacing)),
    ringSpacing: Math.max(100, finiteNumber(options?.ringSpacing, DEFAULT_LAYOUT_OPTIONS.ringSpacing))
  };
  const normalizedNodes = uniqueEntities(normalizeEntities(nodes)).sort(compareNodes);
  const nodeById = new Map(normalizedNodes.map((node) => [node.id, node]));
  const normalizedEdges = uniqueEntities(normalizeEntities(edges))
    .filter((edge) => validId(edge?.id) && nodeById.has(edge.origen) && nodeById.has(edge.destino))
    .sort(compareEntities);
  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    circuits: uniqueEntities(normalizeEntities(options?.circuits)).sort(compareEntities),
    nodeById,
    options: normalizedOptions
  };
}

function finalizeLayout(layout, context, positions, clusters = []) {
  const completed = new Map();
  let fallbackIndex = 0;
  for (const node of context.nodes) {
    const value = positions.get(node.id);
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      completed.set(node.id, point(value.x, value.y));
    } else {
      completed.set(node.id, point(
        context.options.padding + (fallbackIndex % 5) * context.options.columnSpacing,
        context.options.padding + Math.floor(fallbackIndex / 5) * context.options.levelSpacing
      ));
      fallbackIndex += 1;
    }
  }

  for (const [id, value] of normalizePositionEntries(context.options.fixedPositions)) {
    if (completed.has(id) && Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))) {
      completed.set(id, point(Number(value.x), Number(value.y)));
    }
  }

  const bounds = calculateLayoutBounds(completed, context.options);
  const finalizedClusters = clusters.map((cluster) => {
    const nodeIds = uniqueIds(toArray(cluster.nodeIds).filter((id) => completed.has(id)));
    return Object.freeze({
      ...cluster,
      nodeIds: Object.freeze(nodeIds),
      bounds: calculateClusterBounds(nodeIds, completed, context.options)
    });
  });
  const positionsById = {};
  for (const [id, value] of completed) positionsById[id] = value;

  return Object.freeze({
    layout,
    type: layout,
    positions: completed,
    positionsById: Object.freeze(positionsById),
    clusters: Object.freeze(finalizedClusters),
    bounds: Object.freeze(bounds),
    width: bounds.width,
    height: bounds.height,
    nodeWidth: context.options.nodeWidth,
    nodeHeight: context.options.nodeHeight
  });
}

export function calculateLayoutBounds(positions, options = {}) {
  const entries = normalizePositionEntries(positions);
  const nodeWidth = finiteNumber(options.nodeWidth, DEFAULT_LAYOUT_OPTIONS.nodeWidth);
  const nodeHeight = finiteNumber(options.nodeHeight, DEFAULT_LAYOUT_OPTIONS.nodeHeight);
  const padding = finiteNumber(options.boundsPadding, 28);
  if (!entries.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [, value] of entries) {
    minX = Math.min(minX, value.x - nodeWidth / 2 - padding);
    minY = Math.min(minY, value.y - nodeHeight / 2 - padding);
    maxX = Math.max(maxX, value.x + nodeWidth / 2 + padding);
    maxY = Math.max(maxY, value.y + nodeHeight / 2 + padding);
  }
  return {
    minX: round(minX),
    minY: round(minY),
    maxX: round(maxX),
    maxY: round(maxY),
    width: round(maxX - minX),
    height: round(maxY - minY)
  };
}

function calculateClusterBounds(nodeIds, positions, options) {
  const subset = new Map(nodeIds.map((id) => [id, positions.get(id)]).filter(([, value]) => value));
  return Object.freeze(calculateLayoutBounds(subset, { ...options, boundsPadding: 54 }));
}

function packGroups(groups, options, { labels = new Map(), preferredGroupId = null } = {}) {
  const entries = [...groups.entries()]
    .map(([id, groupNodes]) => [id, [...groupNodes].sort(compareNodes)])
    .sort(([a], [b]) => {
      if (preferredGroupId && a === preferredGroupId) return -1;
      if (preferredGroupId && b === preferredGroupId) return 1;
      if (a === "compartido") return -1;
      if (b === "compartido") return 1;
      return compareText(a, b);
    });
  const descriptors = entries.map(([groupId, groupNodes]) => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(groupNodes.length * 1.35)));
    const rows = Math.max(1, Math.ceil(groupNodes.length / columns));
    return {
      groupId,
      groupNodes,
      columns,
      rows,
      width: Math.max(330, (columns - 1) * options.columnSpacing + options.nodeWidth + 112),
      height: Math.max(230, (rows - 1) * options.levelSpacing + options.nodeHeight + 112)
    };
  });
  const totalArea = descriptors.reduce((sum, descriptor) => sum + descriptor.width * descriptor.height, 0);
  const targetWidth = Math.max(
    options.width,
    Math.sqrt(Math.max(1, totalArea) * (options.width / options.height)) * 1.35
  );
  const clusterGap = Math.max(34, options.padding * 0.46);
  const positions = new Map();
  const clusters = [];
  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowHeight = 0;

  descriptors.forEach(({ groupId, groupNodes, columns, width, height }) => {
    if (cursorX > options.padding && cursorX + width > options.padding + targetWidth) {
      cursorX = options.padding;
      cursorY += rowHeight + clusterGap;
      rowHeight = 0;
    }
    const contentWidth = (columns - 1) * options.columnSpacing;
    const rows = Math.max(1, Math.ceil(groupNodes.length / columns));
    const contentHeight = (rows - 1) * options.levelSpacing;
    const startX = cursorX + (width - contentWidth) / 2;
    const startY = cursorY + (height - contentHeight) / 2;
    groupNodes.forEach((node, index) => {
      positions.set(node.id, point(
        startX + (index % columns) * options.columnSpacing,
        startY + Math.floor(index / columns) * options.levelSpacing
      ));
    });
    clusters.push({
      id: String(groupId),
      label: labels.get(groupId) || humanize(groupId),
      nodeIds: Object.freeze(groupNodes.map((node) => node.id))
    });
    cursorX += width + clusterGap;
    rowHeight = Math.max(rowHeight, height);
  });

  return { positions, clusters };
}

function deriveDirectedOrder(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (edge.origen === edge.destino || isReciprocal(edge)) continue;
    indegree.set(edge.destino, (indegree.get(edge.destino) || 0) + 1);
    outgoing.get(edge.origen)?.push(edge.destino);
  }
  for (const values of outgoing.values()) values.sort(compareText);
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort(compareText);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const destination of outgoing.get(id) || []) {
      indegree.set(destination, indegree.get(destination) - 1);
      if (indegree.get(destination) === 0) insertSorted(queue, destination);
    }
  }
  const included = new Set(ordered);
  ordered.push(...nodes.map((node) => node.id).filter((id) => !included.has(id)).sort(compareText));
  return ordered;
}

function buildAdjacency(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    if (!adjacency.has(edge.origen) || !adjacency.has(edge.destino)) continue;
    adjacency.get(edge.origen).add(edge.destino);
    adjacency.get(edge.destino).add(edge.origen);
  }
  return adjacency;
}

function breadthFirstDistances(startId, adjacency, allowedIds = null) {
  const distances = new Map([[startId, 0]]);
  const queue = [startId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const nextDistance = distances.get(current) + 1;
    const neighbours = [...(adjacency.get(current) || [])].sort(compareText);
    for (const neighbour of neighbours) {
      if ((allowedIds && !allowedIds.has(neighbour)) || distances.has(neighbour)) continue;
      distances.set(neighbour, nextDistance);
      queue.push(neighbour);
    }
  }
  return distances;
}

function connectedComponents(nodes, adjacency) {
  const unseen = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const components = [];
  while (unseen.size) {
    const start = [...unseen].sort(compareText)[0];
    const queue = [start];
    unseen.delete(start);
    const component = [];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      component.push(nodeById.get(current));
      for (const neighbour of [...(adjacency.get(current) || [])].sort(compareText)) {
        if (!unseen.has(neighbour)) continue;
        unseen.delete(neighbour);
        queue.push(neighbour);
      }
    }
    component.sort(compareNodes);
    components.push(component);
  }
  return components;
}

function highestDegreeNode(nodes, adjacency) {
  return [...nodes].sort((a, b) => {
    const degreeOrder = (adjacency.get(b.id)?.size || 0) - (adjacency.get(a.id)?.size || 0);
    return degreeOrder || compareNodes(a, b);
  })[0];
}

function placeRing(nodes, center, radius, positions, configuredStartAngle) {
  const startAngle = finiteNumber(configuredStartAngle, -Math.PI / 2);
  nodes.forEach((node, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / Math.max(1, nodes.length);
    positions.set(node.id, point(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius
    ));
  });
}

function transposePositions(positions) {
  return new Map([...positions].map(([id, value]) => [id, point(value.y, value.x)]));
}

function resolveCircuit(options, circuits) {
  if (options.activeCircuit && typeof options.activeCircuit === "object") return options.activeCircuit;
  const circuitId = options.activeCircuitId || options.activeCircuit || options.circuitId || options.circuit;
  if (circuitId && typeof circuitId === "object") return circuitId;
  return circuits.find((circuit) => circuit.id === circuitId) || null;
}

function resolveFocusId(options, nodeById) {
  const candidate = readEntityId(
    options.centerNodeId
      || options.focusNodeId
      || options.selectedNodeId
      || firstCollectionId(options.selectedNodeIds)
      || options.selectedNode
      || options.center
      || options.focus
  );
  return nodeById.has(candidate) ? candidate : null;
}

function normalizeComputeArguments(configOrNodes, maybeEdges, maybeOptions) {
  if (isEntityCollection(configOrNodes)) {
    return { ...(maybeOptions || {}), nodes: configOrNodes, edges: maybeEdges };
  }
  const config = configOrNodes && typeof configOrNodes === "object" ? configOrNodes : {};
  const graph = config.graph || config.connectomeGraph;
  return {
    ...config,
    nodes: config.nodes ?? config.regions ?? config.nodos ?? graph?.regionList ?? graph?.nodes ?? [],
    edges: config.edges ?? config.connections ?? config.conexiones ?? graph?.connectionList ?? graph?.edges ?? [],
    circuits: config.circuits ?? config.circuitos ?? graph?.circuitList ?? graph?.circuits ?? []
  };
}

function pickLayoutOptions(config) {
  const keys = [
    "width", "height", "padding", "nodeWidth", "nodeHeight", "nodeSpacing",
    "columnSpacing", "levelSpacing", "ringSpacing", "direction", "clusterBy", "startAngle", "sequence"
  ];
  return Object.fromEntries(keys.filter((key) => config[key] !== undefined).map((key) => [key, config[key]]));
}

function cloneLayoutResult(result) {
  return Object.freeze({
    ...result,
    positions: new Map(result.positions)
  });
}

function normalizeEntities(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value instanceof Map || value instanceof Set) return [...value.values()].filter(Boolean);
  if (typeof value.values === "function" && typeof value !== "string") {
    try { return [...value.values()].filter(Boolean); } catch { /* use object values */ }
  }
  if (typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
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

function normalizePositionEntries(value) {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()];
  if (Array.isArray(value)) {
    return value.map((entry) => Array.isArray(entry) ? entry : [entry?.id, entry]).filter(([id]) => validId(id));
  }
  if (typeof value === "object") return Object.entries(value);
  return [];
}

function isEntityCollection(value) {
  return Array.isArray(value) || value instanceof Map || value instanceof Set;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueIds(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (!validId(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function readEntityId(value) {
  if (typeof value === "string") return value;
  return value?.nodeId || value?.regionId || value?.id || "";
}

function firstCollectionId(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) || value instanceof Set) return readEntityId([...value][0]);
  return readEntityId(value);
}

function isReciprocal(edge) {
  const direction = normalizeKey(edge?.direccion || edge?.direction);
  return direction === "reciproca" || direction === "reciprocal" || direction === "bidireccional";
}

function addToGroup(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function insertSorted(array, value) {
  let index = 0;
  while (index < array.length && compareText(array[index], value) < 0) index += 1;
  array.splice(index, 0, value);
}

function compareNodes(a, b) {
  return compareText(a?.id, b?.id) || compareText(a?.nombre, b?.nombre);
}

function compareEntities(a, b) {
  return compareText(a?.id, b?.id);
}

function compareText(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanize(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Otros";
}

function isTopToBottom(direction) {
  const key = normalizeKey(direction);
  return key === "tb" || key === "top_bottom" || key === "arriba_abajo" || key === "vertical";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function point(x, y) {
  return Object.freeze({ x: round(x), y: round(y) });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
