/** Directed route finder constrained exclusively to registered connections. */
export class ConnectomePathfinder {
  constructor(graph, { maxCacheEntries = 250 } = {}) {
    assertGraph(graph);
    this.graph = graph;
    this.maxCacheEntries = Math.max(1, Number(maxCacheEntries) || 250);
    this._cache = new Map();
  }

  /**
   * Finds several simple paths in breadth-first order. Reciprocal edges may be
   * traversed in reverse; unidirectional edges never are.
   */
  findPaths(origin, destination, options = {}) {
    const originId = resolveId(origin);
    const destinationId = resolveId(destination);
    const config = normalizeOptions(this.graph, options);
    const constraints = buildConstraints(this.graph, config);
    const cacheKey = createCacheKey(originId, destinationId, config, constraints);
    if (this._cache.has(cacheKey)) return cloneRoutes(this._cache.get(cacheKey));

    if (!this.graph.hasRegion(originId)
      || !this.graph.hasRegion(destinationId)
      || constraints.excludedNodeIds.has(originId)
      || constraints.excludedNodeIds.has(destinationId)
      || (constraints.allowedNodeIds && (!constraints.allowedNodeIds.has(originId) || !constraints.allowedNodeIds.has(destinationId)))) {
      this._remember(cacheKey, []);
      return [];
    }

    if (originId === destinationId) {
      const route = buildRoute(this.graph, originId, destinationId, [originId], [], []);
      this._remember(cacheKey, [route]);
      return cloneRoutes([route]);
    }

    const queue = [{ nodeIds: [originId], connectionIds: [], steps: [] }];
    let queueIndex = 0;
    const routes = [];
    const routeKeys = new Set();
    let shortestDepth = null;
    let exploredStates = 0;

    while (queueIndex < queue.length && routes.length < config.maxPaths && exploredStates < config.maxExploredStates) {
      const currentPath = queue[queueIndex];
      queueIndex += 1;
      exploredStates += 1;
      const currentId = currentPath.nodeIds[currentPath.nodeIds.length - 1];
      const depth = currentPath.connectionIds.length;
      if (depth >= config.maxDepth) continue;
      if (config.shortestOnly && shortestDepth != null && depth >= shortestDepth) continue;

      const steps = this.graph.getTraversalSteps(currentId, {
        direction: "outgoing",
        includeReciprocal: config.includeReciprocal
      });
      for (const step of steps) {
        if (!isStepAllowed(step, constraints)) continue;
        if (!config.allowCycles && currentPath.nodeIds.includes(step.to)) continue;

        const nextNodeIds = [...currentPath.nodeIds, step.to];
        const nextConnectionIds = [...currentPath.connectionIds, step.connectionId];
        const nextSteps = [...currentPath.steps, step];

        if (step.to === destinationId) {
          shortestDepth ??= nextConnectionIds.length;
          if (config.shortestOnly && nextConnectionIds.length !== shortestDepth) continue;
          const key = `${nextNodeIds.join(">")}|${nextConnectionIds.join(">")}`;
          if (!routeKeys.has(key)) {
            routeKeys.add(key);
            routes.push(buildRoute(
              this.graph,
              originId,
              destinationId,
              nextNodeIds,
              nextConnectionIds,
              nextSteps
            ));
          }
          if (routes.length >= config.maxPaths) break;
        } else if (!config.shortestOnly || shortestDepth == null || nextConnectionIds.length < shortestDepth) {
          queue.push({ nodeIds: nextNodeIds, connectionIds: nextConnectionIds, steps: nextSteps });
        }
      }
    }

    routes.sort((left, right) => left.length - right.length || compareRouteKeys(left, right));
    this._remember(cacheKey, routes);
    return cloneRoutes(routes);
  }

  findShortestPath(origin, destination, options = {}) {
    return this.findPaths(origin, destination, { ...options, shortestOnly: true, maxPaths: 1 })[0] ?? null;
  }

  findPath(origin, destination, options = {}) {
    return this.findShortestPath(origin, destination, options);
  }

  findAllPaths(origin, destination, options = {}) {
    return this.findPaths(origin, destination, options);
  }

  hasPath(origin, destination, options = {}) {
    return Boolean(this.findShortestPath(origin, destination, options));
  }

  /** Returns all nodes reachable through the same directed traversal rules. */
  reachableFrom(origin, options = {}) {
    const originId = resolveId(origin);
    const config = normalizeOptions(this.graph, {
      ...options,
      maxDepth: options.maxDepth ?? Math.max(0, this.graph.regions.size - 1),
      maxPaths: 1
    });
    const constraints = buildConstraints(this.graph, config);
    const reachableNodeIds = new Set();
    const traversedConnectionIds = new Set();
    if (!this.graph.hasRegion(originId)
      || constraints.excludedNodeIds.has(originId)
      || (constraints.allowedNodeIds && !constraints.allowedNodeIds.has(originId))) {
      return { originId, reachableNodeIds, nodeIds: reachableNodeIds, connectionIds: traversedConnectionIds };
    }

    const queue = [{ id: originId, depth: 0 }];
    let queueIndex = 0;
    reachableNodeIds.add(originId);
    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
      if (current.depth >= config.maxDepth) continue;
      for (const step of this.graph.getTraversalSteps(current.id, {
        direction: "outgoing",
        includeReciprocal: config.includeReciprocal
      })) {
        if (!isStepAllowed(step, constraints)) continue;
        traversedConnectionIds.add(step.connectionId);
        if (reachableNodeIds.has(step.to)) continue;
        reachableNodeIds.add(step.to);
        queue.push({ id: step.to, depth: current.depth + 1 });
      }
    }
    return {
      originId,
      reachableNodeIds,
      nodeIds: reachableNodeIds,
      connectionIds: traversedConnectionIds,
      regions: [...reachableNodeIds].map((id) => this.graph.getRegion(id)).filter(Boolean),
      connections: [...traversedConnectionIds].map((id) => this.graph.getConnection(id)).filter(Boolean)
    };
  }

  clearCache() {
    this._cache.clear();
  }

  get cacheSize() {
    return this._cache.size;
  }

  _remember(key, routes) {
    if (this._cache.size >= this.maxCacheEntries) this._cache.delete(this._cache.keys().next().value);
    this._cache.set(key, routes);
  }
}

export function createConnectomePathfinder(graph, options) {
  return new ConnectomePathfinder(graph, options);
}

/** One-shot helper for callers that do not need route caching. */
export function findConnectomePaths(graph, origin, destination, options) {
  return new ConnectomePathfinder(graph).findPaths(origin, destination, options);
}

export const buscarRutasConectoma = findConnectomePaths;

function normalizeOptions(graph, options) {
  const defaultMaxDepth = Math.min(Math.max(1, graph.regions.size - 1), 24);
  return {
    includeReciprocal: options.includeReciprocal !== false,
    allowCycles: options.allowCycles === true,
    shortestOnly: options.shortestOnly === true,
    maxDepth: positiveInteger(options.maxDepth, defaultMaxDepth, 0),
    maxPaths: positiveInteger(options.maxPaths, 8, 1),
    maxExploredStates: positiveInteger(options.maxExploredStates, 50000, 1),
    excludedNodeIds: unionSets(normalizeIdSet(
      options.excludedNodeIds
        ?? options.excludedRegionIds
        ?? options.lesion?.excludedNodeIds
        ?? options.lesion?.removedNodeIds
    ), lesionNodeIds(options.lesion)),
    excludedConnectionIds: unionSets(normalizeIdSet(
      options.excludedConnectionIds
        ?? options.excludedEdgeIds
        ?? options.lesion?.excludedConnectionIds
        ?? options.lesion?.removedConnectionIds
    ), lesionConnectionIds(options.lesion)),
    allowedNodeIds: normalizeOptionalIdSet(options.allowedNodeIds ?? options.allowedRegionIds),
    allowedConnectionIds: normalizeOptionalIdSet(options.allowedConnectionIds ?? options.allowedEdgeIds),
    circuitIds: normalizeIdSet(options.circuitIds ?? options.circuits ?? options.circuitId ?? options.circuito)
  };
}

function buildConstraints(graph, config) {
  let circuitNodeIds = null;
  let circuitConnectionIds = null;
  if (config.circuitIds.size) {
    circuitNodeIds = new Set();
    circuitConnectionIds = new Set();
    for (const circuitId of config.circuitIds) {
      for (const id of graph.getCircuitNodeIds(circuitId)) circuitNodeIds.add(id);
      for (const id of graph.getCircuitConnectionIds(circuitId)) circuitConnectionIds.add(id);
    }
  }
  return {
    excludedNodeIds: config.excludedNodeIds,
    excludedConnectionIds: config.excludedConnectionIds,
    allowedNodeIds: intersectOptionalSets(config.allowedNodeIds, circuitNodeIds),
    allowedConnectionIds: intersectOptionalSets(config.allowedConnectionIds, circuitConnectionIds)
  };
}

function isStepAllowed(step, constraints) {
  if (constraints.excludedConnectionIds.has(step.connectionId)) return false;
  if (constraints.excludedNodeIds.has(step.from) || constraints.excludedNodeIds.has(step.to)) return false;
  if (constraints.allowedNodeIds && (!constraints.allowedNodeIds.has(step.from) || !constraints.allowedNodeIds.has(step.to))) return false;
  if (constraints.allowedConnectionIds && !constraints.allowedConnectionIds.has(step.connectionId)) return false;
  return true;
}

function buildRoute(graph, originId, destinationId, nodeIds, connectionIds, steps) {
  const nodes = nodeIds.map((id) => graph.getRegion(id)).filter(Boolean);
  const connections = connectionIds.map((id) => graph.getConnection(id)).filter(Boolean);
  return {
    originId,
    destinationId,
    origen: originId,
    destino: destinationId,
    nodeIds,
    regionIds: nodeIds,
    routeNodeIds: nodeIds,
    connectionIds,
    edgeIds: connectionIds,
    routeEdgeIds: connectionIds,
    nodes,
    regions: nodes,
    regiones: nodes,
    connections,
    edges: connections,
    conexiones: connections,
    steps,
    pasos: steps,
    length: connectionIds.length,
    hops: connectionIds.length
  };
}

function cloneRoutes(routes) {
  return routes.map((route) => {
    const nodeIds = [...route.nodeIds];
    const connectionIds = [...route.connectionIds];
    const nodes = [...route.nodes];
    const connections = [...route.connections];
    const steps = route.steps.map((step) => ({ ...step }));
    return {
      ...route,
      nodeIds,
      regionIds: nodeIds,
      routeNodeIds: nodeIds,
      connectionIds,
      edgeIds: connectionIds,
      routeEdgeIds: connectionIds,
      nodes,
      regions: nodes,
      regiones: nodes,
      connections,
      edges: connections,
      conexiones: connections,
      steps,
      pasos: steps
    };
  });
}

function createCacheKey(originId, destinationId, config, constraints) {
  return JSON.stringify({
    originId,
    destinationId,
    reciprocal: config.includeReciprocal,
    cycles: config.allowCycles,
    shortest: config.shortestOnly,
    depth: config.maxDepth,
    paths: config.maxPaths,
    states: config.maxExploredStates,
    excludedNodes: sorted(constraints.excludedNodeIds),
    excludedConnections: sorted(constraints.excludedConnectionIds),
    allowedNodes: constraints.allowedNodeIds ? sorted(constraints.allowedNodeIds) : null,
    allowedConnections: constraints.allowedConnectionIds ? sorted(constraints.allowedConnectionIds) : null
  });
}

function compareRouteKeys(left, right) {
  return `${left.nodeIds.join(">")}|${left.connectionIds.join(">")}`
    .localeCompare(`${right.nodeIds.join(">")}|${right.connectionIds.join(">")}`);
}

function intersectOptionalSets(left, right) {
  if (!left && !right) return null;
  if (!left) return new Set(right);
  if (!right) return new Set(left);
  return new Set([...left].filter((value) => right.has(value)));
}

function normalizeOptionalIdSet(value) {
  return value == null ? null : normalizeIdSet(value);
}

function normalizeIdSet(value) {
  if (value == null) return new Set();
  const values = value instanceof Set || Array.isArray(value) ? [...value] : [value];
  return new Set(values.map(resolveId).filter(Boolean));
}

function lesionNodeIds(lesion) {
  if (!lesion || typeof lesion !== "object") return new Set();
  const type = String(lesion.type ?? lesion.tipo ?? "").toLocaleLowerCase("es");
  if (type.includes("node") || type.includes("nodo") || lesion.nodeId) {
    return normalizeIdSet(lesion.nodeId ?? lesion.id);
  }
  return new Set();
}

function lesionConnectionIds(lesion) {
  if (!lesion || typeof lesion !== "object") return new Set();
  const type = String(lesion.type ?? lesion.tipo ?? "").toLocaleLowerCase("es");
  if (type.includes("connection") || type.includes("conexion") || type.includes("edge") || lesion.connectionId) {
    return normalizeIdSet(lesion.connectionId ?? lesion.edgeId ?? lesion.id);
  }
  return new Set();
}

function unionSets(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function sorted(values) {
  return [...values].sort();
}

function positiveInteger(value, fallback, minimum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.floor(number)) : fallback;
}

function resolveId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.id ?? value.nodeId ?? value.regionId ?? "";
  return "";
}

function assertGraph(graph) {
  if (!graph?.regions || typeof graph.getTraversalSteps !== "function") {
    throw new TypeError("ConnectomePathfinder requiere una instancia compatible de ConnectomeGraph.");
  }
}
