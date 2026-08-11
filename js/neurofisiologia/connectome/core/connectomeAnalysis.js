import { ConnectomePathfinder } from "./connectomePathfinder.js";

/** High-level, data-only graph analyses used by educational interactions. */
export class ConnectomeAnalysis {
  constructor(graph) {
    assertGraph(graph);
    this.graph = graph;
    this.pathfinder = new ConnectomePathfinder(graph);
  }

  isolateNode(nodeId, options) {
    return isolateNode(this.graph, nodeId, options);
  }

  isolateRegion(nodeId, options) {
    return this.isolateNode(nodeId, options);
  }

  isolateCircuit(circuitId) {
    return isolateCircuit(this.graph, circuitId);
  }

  compareCircuits(firstCircuitId, secondCircuitId) {
    return compareCircuits(this.graph, firstCircuitId, secondCircuitId);
  }

  simulateNodeLesion(nodeId, options) {
    return simulateNodeLesion(this.graph, nodeId, { ...options, pathfinder: this.pathfinder });
  }

  simulateConnectionLesion(connectionId, options) {
    return simulateConnectionLesion(this.graph, connectionId, { ...options, pathfinder: this.pathfinder });
  }

  simulateEdgeLesion(connectionId, options) {
    return this.simulateConnectionLesion(connectionId, options);
  }

  analyzeReachability(originId, options) {
    return analyzeReachability(this.graph, originId, { ...options, pathfinder: this.pathfinder });
  }
}

export function createConnectomeAnalysis(graph) {
  return new ConnectomeAnalysis(graph);
}

/** Keeps a node and its requested afferent/efferent neighborhood visible. */
export function isolateNode(graph, nodeId, { depth = 1, direction = "both", includeReciprocal = true } = {}) {
  assertGraph(graph);
  requireRegion(graph, nodeId);
  const subgraph = graph.getNodeSubgraph(nodeId, { depth, direction, includeReciprocal });
  const all = universeSelection(graph);
  const matched = selectionFromSubgraph(subgraph);
  const dimmed = differenceSelection(all, matched);
  return {
    type: "node_isolation",
    tipo: "aislamiento_nodo",
    focusId: nodeId,
    focus: graph.getRegion(nodeId),
    depth,
    direction,
    ...subgraph,
    matched: aliasSelection(matched),
    dimmed: aliasSelection(dimmed),
    highlightedNodeIds: matched.nodeIds,
    highlightedEdgeIds: matched.connectionIds,
    dimmedNodeIds: dimmed.nodeIds,
    dimmedEdgeIds: dimmed.connectionIds,
    afferentConnections: graph.getIncomingConnections(nodeId),
    efferentConnections: graph.getOutgoingConnections(nodeId)
  };
}

/** Keeps exactly the canonical subgraph declared by a circuit. */
export function isolateCircuit(graph, circuitId) {
  assertGraph(graph);
  requireCircuit(graph, circuitId);
  const subgraph = graph.getCircuitSubgraph(circuitId);
  const all = universeSelection(graph);
  const matched = selectionFromSubgraph(subgraph);
  const dimmed = differenceSelection(all, matched);
  return {
    type: "circuit_isolation",
    tipo: "aislamiento_circuito",
    focusId: circuitId,
    focus: graph.getCircuit(circuitId),
    ...subgraph,
    matched: aliasSelection(matched),
    dimmed: aliasSelection(dimmed),
    highlightedNodeIds: matched.nodeIds,
    highlightedEdgeIds: matched.connectionIds,
    dimmedNodeIds: dimmed.nodeIds,
    dimmedEdgeIds: dimmed.connectionIds
  };
}

/** Compares shared/exclusive anatomy and neurotransmitter metadata. */
export function compareCircuits(graph, firstCircuitId, secondCircuitId) {
  assertGraph(graph);
  const first = requireCircuit(graph, resolveId(firstCircuitId));
  const second = requireCircuit(graph, resolveId(secondCircuitId));
  const firstNodes = graph.getCircuitNodeIds(first.id);
  const secondNodes = graph.getCircuitNodeIds(second.id);
  const firstConnections = graph.getCircuitConnectionIds(first.id);
  const secondConnections = graph.getCircuitConnectionIds(second.id);
  const firstTransmitters = collectNeurotransmitters(graph, firstNodes, firstConnections);
  const secondTransmitters = collectNeurotransmitters(graph, secondNodes, secondConnections);

  const sharedNodeIds = intersection(firstNodes, secondNodes);
  const sharedConnectionIds = intersection(firstConnections, secondConnections);
  const firstOnlyNodeIds = difference(firstNodes, secondNodes);
  const secondOnlyNodeIds = difference(secondNodes, firstNodes);
  const firstOnlyConnectionIds = difference(firstConnections, secondConnections);
  const secondOnlyConnectionIds = difference(secondConnections, firstConnections);
  const sharedNeurotransmitterKeys = intersection(new Set(firstTransmitters.keys()), new Set(secondTransmitters.keys()));
  const firstOnlyNeurotransmitterKeys = difference(new Set(firstTransmitters.keys()), new Set(secondTransmitters.keys()));
  const secondOnlyNeurotransmitterKeys = difference(new Set(secondTransmitters.keys()), new Set(firstTransmitters.keys()));

  return {
    firstCircuit: first,
    secondCircuit: second,
    circuitIds: [first.id, second.id],
    shared: {
      nodeIds: sharedNodeIds,
      regionIds: sharedNodeIds,
      connectionIds: sharedConnectionIds,
      edgeIds: sharedConnectionIds,
      nodes: recordsFromIds(graph.regions, sharedNodeIds),
      connections: recordsFromIds(graph.connections, sharedConnectionIds),
      neurotransmitters: valuesForKeys(firstTransmitters, sharedNeurotransmitterKeys)
    },
    firstOnly: {
      nodeIds: firstOnlyNodeIds,
      regionIds: firstOnlyNodeIds,
      connectionIds: firstOnlyConnectionIds,
      edgeIds: firstOnlyConnectionIds,
      nodes: recordsFromIds(graph.regions, firstOnlyNodeIds),
      connections: recordsFromIds(graph.connections, firstOnlyConnectionIds),
      neurotransmitters: valuesForKeys(firstTransmitters, firstOnlyNeurotransmitterKeys)
    },
    secondOnly: {
      nodeIds: secondOnlyNodeIds,
      regionIds: secondOnlyNodeIds,
      connectionIds: secondOnlyConnectionIds,
      edgeIds: secondOnlyConnectionIds,
      nodes: recordsFromIds(graph.regions, secondOnlyNodeIds),
      connections: recordsFromIds(graph.connections, secondOnlyConnectionIds),
      neurotransmitters: valuesForKeys(secondTransmitters, secondOnlyNeurotransmitterKeys)
    },
    sharedNodeIds,
    sharedConnectionIds,
    sharedNeurotransmitters: valuesForKeys(firstTransmitters, sharedNeurotransmitterKeys)
  };
}

/** Removes one anatomical node and derives graph/circuit consequences. */
export function simulateNodeLesion(graph, nodeId, options = {}) {
  assertGraph(graph);
  const node = requireRegion(graph, resolveId(nodeId));
  const excludedNodeIds = union(normalizeIdSet(options.excludedNodeIds), new Set([node.id]));
  const incidentConnectionIds = graph.getIncidentConnectionIds(node.id);
  const excludedConnectionIds = union(normalizeIdSet(options.excludedConnectionIds), incidentConnectionIds);
  const affectedCircuitIds = new Set(graph.circuitsByRegionId.get(node.id) ?? []);
  for (const connectionId of incidentConnectionIds) {
    for (const circuitId of graph.circuitsByConnectionId.get(connectionId) ?? []) affectedCircuitIds.add(circuitId);
  }

  const pathfinder = options.pathfinder ?? new ConnectomePathfinder(graph);
  const circuitImpacts = [...affectedCircuitIds].map((circuitId) => evaluateCircuitIntegrity(
    graph,
    circuitId,
    { excludedNodeIds, excludedConnectionIds, pathfinder }
  ));
  const interruptedCircuitIds = new Set(circuitImpacts.filter((impact) => impact.interrupted).map((impact) => impact.circuitId));
  const state = analyzeRemainingGraph(graph, { excludedNodeIds, excludedConnectionIds });
  const baselineComponents = getWeaklyConnectedComponents(graph);
  const neighboringSources = new Set();
  for (const connectionId of incidentConnectionIds) {
    const connection = graph.getConnection(connectionId);
    if (!connection) continue;
    const origin = connectionOrigin(connection);
    const destination = connectionDestination(connection);
    if (origin !== node.id) neighboringSources.add(origin);
    if (destination !== node.id) neighboringSources.add(destination);
  }
  const reachability = compareReachabilityForSources(graph, neighboringSources, {
    excludedNodeIds,
    excludedConnectionIds,
    pathfinder
  });
  const affectedFunctions = collectAffectedFunctions(node, circuitImpacts, graph);

  return {
    type: "node_lesion",
    tipo: "lesion_nodo",
    lesion: { type: "node", id: node.id, item: node },
    node,
    nodeId: node.id,
    excludedNodeIds,
    removedNodeIds: excludedNodeIds,
    lesionedNodeIds: new Set([node.id]),
    excludedConnectionIds,
    removedConnectionIds: excludedConnectionIds,
    lesionedEdgeIds: incidentConnectionIds,
    affectedConnectionIds: incidentConnectionIds,
    affectedConnections: recordsFromIds(graph.connections, incidentConnectionIds),
    affectedCircuitIds,
    interruptedCircuitIds,
    affectedCircuits: recordsFromIds(graph.circuits, affectedCircuitIds),
    interruptedCircuits: recordsFromIds(graph.circuits, interruptedCircuitIds),
    circuitImpacts,
    affectedFunctions,
    reachability,
    ...state,
    baselineComponentCount: baselineComponents.length,
    componentCountChanged: state.componentCount !== baselineComponents.length,
    educationalOnly: true
  };
}

/** Removes one registered edge and calculates lost reachability/components. */
export function simulateConnectionLesion(graph, connectionId, options = {}) {
  assertGraph(graph);
  const connection = requireConnection(graph, resolveId(connectionId));
  const excludedNodeIds = normalizeIdSet(options.excludedNodeIds);
  const excludedConnectionIds = union(normalizeIdSet(options.excludedConnectionIds), new Set([connection.id]));
  const affectedCircuitIds = new Set(graph.circuitsByConnectionId.get(connection.id) ?? []);
  const pathfinder = options.pathfinder ?? new ConnectomePathfinder(graph);
  const circuitImpacts = [...affectedCircuitIds].map((circuitId) => evaluateCircuitIntegrity(
    graph,
    circuitId,
    { excludedNodeIds, excludedConnectionIds, pathfinder, focalConnectionId: connection.id }
  ));
  const interruptedCircuitIds = new Set(circuitImpacts.filter((impact) => impact.interrupted).map((impact) => impact.circuitId));
  const state = analyzeRemainingGraph(graph, { excludedNodeIds, excludedConnectionIds });
  const baselineComponents = getWeaklyConnectedComponents(graph, { excludedNodeIds });
  const sources = new Set([connectionOrigin(connection)]);
  if (isReciprocal(connection)) sources.add(connectionDestination(connection));
  const reachability = compareReachabilityForSources(graph, sources, {
    excludedNodeIds,
    excludedConnectionIds,
    pathfinder
  });
  const affectedFunctions = collectAffectedFunctions(connection, circuitImpacts, graph);

  return {
    type: "connection_lesion",
    tipo: "lesion_conexion",
    lesion: { type: "connection", id: connection.id, item: connection },
    connection,
    connectionId: connection.id,
    excludedNodeIds,
    removedNodeIds: excludedNodeIds,
    lesionedNodeIds: new Set(),
    excludedConnectionIds,
    removedConnectionIds: excludedConnectionIds,
    lesionedEdgeIds: new Set([connection.id]),
    affectedConnectionIds: new Set([connection.id]),
    affectedCircuitIds,
    interruptedCircuitIds,
    affectedCircuits: recordsFromIds(graph.circuits, affectedCircuitIds),
    interruptedCircuits: recordsFromIds(graph.circuits, interruptedCircuitIds),
    circuitImpacts,
    affectedFunctions,
    reachability,
    ...state,
    baselineComponentCount: baselineComponents.length,
    componentCountChanged: state.componentCount !== baselineComponents.length,
    educationalOnly: true
  };
}

export const lesionNode = simulateNodeLesion;
export const lesionConnection = simulateConnectionLesion;
export const simulateEdgeLesion = simulateConnectionLesion;
export const lesionEdge = simulateConnectionLesion;
export const simularLesionNodo = simulateNodeLesion;
export const simularLesionConexion = simulateConnectionLesion;
export const aislarNodo = isolateNode;
export const aislarCircuito = isolateCircuit;
export const compararCircuitos = compareCircuits;

/** Computes directed reachability under optional lesion/circuit constraints. */
export function analyzeReachability(graph, originId, options = {}) {
  assertGraph(graph);
  const pathfinder = options.pathfinder ?? new ConnectomePathfinder(graph);
  const sourceId = resolveId(originId);
  const excludedNodeIds = normalizeIdSet(options.excludedNodeIds);
  const excludedConnectionIds = normalizeIdSet(options.excludedConnectionIds);
  const reachable = pathfinder.reachableFrom(sourceId, {
    ...options,
    excludedNodeIds,
    excludedConnectionIds
  });
  const eligibleNodeIds = options.allowedNodeIds == null
    ? difference(new Set(graph.regions.keys()), excludedNodeIds)
    : difference(normalizeIdSet(options.allowedNodeIds), excludedNodeIds);
  const unreachableNodeIds = difference(eligibleNodeIds, reachable.reachableNodeIds);
  return {
    ...reachable,
    sourceId,
    reachableNodeIds: reachable.reachableNodeIds,
    unreachableNodeIds,
    unreachableRegions: recordsFromIds(graph.regions, unreachableNodeIds)
  };
}

/** Returns weak components after applying exclusions or an allowed subgraph. */
export function getWeaklyConnectedComponents(graph, options = {}) {
  assertGraph(graph);
  const excludedNodeIds = normalizeIdSet(options.excludedNodeIds);
  const excludedConnectionIds = normalizeIdSet(options.excludedConnectionIds);
  const allowedNodeIds = options.allowedNodeIds == null
    ? new Set(graph.regions.keys())
    : normalizeIdSet(options.allowedNodeIds);
  const allowedConnectionIds = options.allowedConnectionIds == null
    ? new Set(graph.connections.keys())
    : normalizeIdSet(options.allowedConnectionIds);
  const activeNodeIds = difference(allowedNodeIds, excludedNodeIds);
  const adjacency = new Map([...activeNodeIds].map((id) => [id, new Set()]));

  for (const connectionId of allowedConnectionIds) {
    if (excludedConnectionIds.has(connectionId)) continue;
    const connection = graph.getConnection(connectionId);
    if (!connection) continue;
    const origin = connectionOrigin(connection);
    const destination = connectionDestination(connection);
    if (!activeNodeIds.has(origin) || !activeNodeIds.has(destination)) continue;
    adjacency.get(origin).add(destination);
    adjacency.get(destination).add(origin);
  }

  const unvisited = new Set(activeNodeIds);
  const components = [];
  while (unvisited.size) {
    const startId = unvisited.values().next().value;
    const component = new Set();
    const queue = [startId];
    let queueIndex = 0;
    unvisited.delete(startId);
    while (queueIndex < queue.length) {
      const currentId = queue[queueIndex];
      queueIndex += 1;
      component.add(currentId);
      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (!unvisited.has(neighborId)) continue;
        unvisited.delete(neighborId);
        queue.push(neighborId);
      }
    }
    components.push(component);
  }
  return components.sort((left, right) => right.size - left.size || String([...left][0]).localeCompare(String([...right][0])));
}

function evaluateCircuitIntegrity(graph, circuitId, context) {
  const circuit = graph.getCircuit(circuitId);
  const nodeIds = graph.getCircuitNodeIds(circuitId);
  const connectionIds = graph.getCircuitConnectionIds(circuitId);
  const removedNodeIds = intersection(nodeIds, context.excludedNodeIds);
  const removedConnectionIds = intersection(connectionIds, context.excludedConnectionIds);
  const baselineComponents = getWeaklyConnectedComponents(graph, {
    allowedNodeIds: nodeIds,
    allowedConnectionIds: connectionIds
  });
  const remainingComponents = getWeaklyConnectedComponents(graph, {
    allowedNodeIds: nodeIds,
    allowedConnectionIds: connectionIds,
    excludedNodeIds: context.excludedNodeIds,
    excludedConnectionIds: context.excludedConnectionIds
  });
  const sequence = parseCircuitSequence(graph, circuit);
  const brokenSteps = evaluateSequenceSteps(graph, sequence, connectionIds, context);
  const componentSplit = remainingComponents.length > baselineComponents.length;
  const lostAllNodes = remainingComponents.length === 0 && nodeIds.size > 0;

  let bypass = null;
  if (context.focalConnectionId && connectionIds.has(context.focalConnectionId)) {
    const focal = graph.getConnection(context.focalConnectionId);
    const forward = context.pathfinder.findShortestPath(connectionOrigin(focal), connectionDestination(focal), {
      allowedNodeIds: nodeIds,
      allowedConnectionIds: connectionIds,
      excludedNodeIds: context.excludedNodeIds,
      excludedConnectionIds: context.excludedConnectionIds
    });
    let reverse = null;
    if (isReciprocal(focal)) {
      reverse = context.pathfinder.findShortestPath(connectionDestination(focal), connectionOrigin(focal), {
        allowedNodeIds: nodeIds,
        allowedConnectionIds: connectionIds,
        excludedNodeIds: context.excludedNodeIds,
        excludedConnectionIds: context.excludedConnectionIds
      });
    }
    bypass = {
      forwardPath: forward,
      reversePath: reverse,
      available: Boolean(forward) && (!isReciprocal(focal) || Boolean(reverse))
    };
  }

  const sequenceBroken = brokenSteps.length > 0;
  const topologyBroken = componentSplit || lostAllNodes;
  const removedDeclaredNode = removedNodeIds.size > 0;
  const removedDeclaredConnectionWithoutBypass = removedConnectionIds.size > 0 && (!bypass || !bypass.available);
  const interrupted = removedDeclaredNode || sequenceBroken || topologyBroken || removedDeclaredConnectionWithoutBypass;

  return {
    circuitId,
    circuit,
    affected: removedNodeIds.size > 0 || removedConnectionIds.size > 0,
    interrupted,
    removedNodeIds,
    removedConnectionIds,
    sequenceBroken,
    brokenSteps,
    componentSplit,
    baselineComponentCount: baselineComponents.length,
    remainingComponentCount: remainingComponents.length,
    remainingComponentNodeIds: remainingComponents,
    alternativePath: bypass,
    functions: flattenLabels(circuit?.funciones ?? circuit?.functions)
  };
}

function parseCircuitSequence(graph, circuit) {
  const raw = circuit?.secuencia ?? circuit?.orderedSteps ?? [];
  if (!Array.isArray(raw)) return [];
  const orderedConnectionIds = Array.isArray(circuit?.secuenciaConexiones)
    ? circuit.secuenciaConexiones
    : [];
  if (orderedConnectionIds.length && raw.every((step) => typeof step === "string" && graph.hasRegion(step))) {
    const expanded = [];
    raw.forEach((nodeId, index) => {
      expanded.push({ type: "node", id: nodeId });
      const connectionId = orderedConnectionIds[index];
      if (connectionId && graph.hasConnection(connectionId)) {
        expanded.push({ type: "connection", id: connectionId });
      }
    });
    return expanded;
  }
  const parsed = [];
  for (const step of raw) {
    if (typeof step === "string") {
      if (graph.hasRegion(step)) parsed.push({ type: "node", id: step });
      else if (graph.hasConnection(step)) parsed.push({ type: "connection", id: step });
      continue;
    }
    if (!step || typeof step !== "object") continue;
    const nodeId = step.nodeId ?? step.nodo ?? step.regionId ?? step.region;
    const incomingConnectionId = step.incomingConnectionId ?? step.conexionEntrante ?? step.connectionId ?? step.conexion;
    if (incomingConnectionId && graph.hasConnection(incomingConnectionId)) {
      parsed.push({ type: "connection", id: incomingConnectionId });
    }
    if (nodeId && graph.hasRegion(nodeId)) parsed.push({ type: "node", id: nodeId });
  }
  return parsed;
}

function evaluateSequenceSteps(graph, sequence, allowedConnectionIds, context) {
  const broken = [];
  for (let index = 0; index < sequence.length; index += 1) {
    const token = sequence[index];
    if (token.type === "node" && context.excludedNodeIds.has(token.id)) {
      broken.push({ index, type: "node_removed", nodeId: token.id });
    }
    if (token.type === "connection" && context.excludedConnectionIds.has(token.id)) {
      broken.push({ index, type: "connection_removed", connectionId: token.id });
    }
  }

  const nodePositions = sequence
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.type === "node");
  for (let position = 1; position < nodePositions.length; position += 1) {
    const previous = nodePositions[position - 1];
    const current = nodePositions[position];
    if (context.excludedNodeIds.has(previous.token.id) || context.excludedNodeIds.has(current.token.id)) continue;
    const between = sequence.slice(previous.index + 1, current.index);
    const explicitConnection = between.find((token) => token.type === "connection");
    if (explicitConnection) {
      if (!allowedConnectionIds.has(explicitConnection.id) || context.excludedConnectionIds.has(explicitConnection.id)) continue;
      const connection = graph.getConnection(explicitConnection.id);
      if (!canTraverse(connection, previous.token.id, current.token.id)) {
        broken.push({
          index: explicitConnection.index,
          type: "sequence_direction_mismatch",
          from: previous.token.id,
          to: current.token.id,
          connectionId: explicitConnection.id
        });
      }
      continue;
    }
    const registered = graph.getConnectionsBetween(previous.token.id, current.token.id, { directed: true })
      .some((connection) => allowedConnectionIds.has(connection.id) && !context.excludedConnectionIds.has(connection.id));
    if (!registered) {
      broken.push({
        index: current.index,
        type: "missing_registered_step",
        from: previous.token.id,
        to: current.token.id
      });
    }
  }
  return dedupeBrokenSteps(broken);
}

function analyzeRemainingGraph(graph, exclusions) {
  const remainingNodeIds = difference(new Set(graph.regions.keys()), exclusions.excludedNodeIds);
  const remainingConnectionIds = new Set();
  for (const connection of graph.connectionList) {
    if (exclusions.excludedConnectionIds.has(connection.id)) continue;
    if (!remainingNodeIds.has(connectionOrigin(connection)) || !remainingNodeIds.has(connectionDestination(connection))) continue;
    remainingConnectionIds.add(connection.id);
  }
  const componentNodeIds = getWeaklyConnectedComponents(graph, {
    allowedNodeIds: remainingNodeIds,
    allowedConnectionIds: remainingConnectionIds
  });
  const components = componentNodeIds.map((nodeIds, index) => {
    const connectionIds = new Set([...remainingConnectionIds].filter((connectionId) => {
      const connection = graph.getConnection(connectionId);
      return nodeIds.has(connectionOrigin(connection)) && nodeIds.has(connectionDestination(connection));
    }));
    return {
      id: `component-${index + 1}`,
      nodeIds,
      regionIds: nodeIds,
      connectionIds,
      edgeIds: connectionIds,
      regions: recordsFromIds(graph.regions, nodeIds),
      connections: recordsFromIds(graph.connections, connectionIds)
    };
  });
  return {
    remainingNodeIds,
    remainingRegionIds: remainingNodeIds,
    remainingConnectionIds,
    componentNodeIds,
    components,
    componentCount: components.length,
    largestComponentSize: components[0]?.nodeIds.size ?? 0
  };
}

function compareReachabilityForSources(graph, sourceIds, context) {
  const bySource = [];
  const lostPairKeys = new Set();
  const lostPairs = [];
  for (const sourceId of sourceIds) {
    if (!graph.hasRegion(sourceId) || context.excludedNodeIds.has(sourceId)) continue;
    const before = context.pathfinder.reachableFrom(sourceId);
    const after = context.pathfinder.reachableFrom(sourceId, {
      excludedNodeIds: context.excludedNodeIds,
      excludedConnectionIds: context.excludedConnectionIds
    });
    const lostNodeIds = difference(before.reachableNodeIds, after.reachableNodeIds);
    bySource.push({
      sourceId,
      beforeNodeIds: before.reachableNodeIds,
      afterNodeIds: after.reachableNodeIds,
      lostNodeIds,
      lostRegions: recordsFromIds(graph.regions, lostNodeIds)
    });
    for (const destinationId of lostNodeIds) {
      const key = `${sourceId}\u0000${destinationId}`;
      if (lostPairKeys.has(key)) continue;
      lostPairKeys.add(key);
      lostPairs.push({ from: sourceId, to: destinationId });
    }
  }
  const lostNodeIds = new Set(lostPairs.map((pair) => pair.to));
  return {
    sourceIds: new Set(bySource.map((entry) => entry.sourceId)),
    bySource,
    lostPairs,
    lostNodeIds,
    lostRegions: recordsFromIds(graph.regions, lostNodeIds)
  };
}

function collectAffectedFunctions(focalItem, circuitImpacts, graph) {
  const values = [
    focalItem.funcion,
    focalItem.funciones,
    focalItem.functions
  ];
  for (const impact of circuitImpacts) {
    const circuit = graph.getCircuit(impact.circuitId);
    values.push(circuit?.funciones, circuit?.functions);
  }
  return [...new Set(flattenLabels(values).map((value) => String(value).trim()).filter(Boolean))];
}

function collectNeurotransmitters(graph, nodeIds, connectionIds) {
  const values = [];
  for (const node of recordsFromIds(graph.regions, nodeIds)) {
    values.push(node.neurotransmisoresRelevantes, node.neurotransmisores, node.neurotransmitters);
  }
  for (const connection of recordsFromIds(graph.connections, connectionIds)) {
    values.push(
      connection.neurotransmisorPrincipal,
      connection.neurotransmisores,
      connection.neurotransmitterPrimary,
      connection.neurotransmitters
    );
  }
  const index = new Map();
  for (const value of flattenLabels(values)) {
    const key = normalizeText(value);
    if (key && !index.has(key)) index.set(key, value);
  }
  return index;
}

function valuesForKeys(index, keys) {
  return [...keys].map((key) => index.get(key)).filter(Boolean);
}

function flattenLabels(value) {
  if (value == null) return [];
  if (Array.isArray(value) || value instanceof Set) return [...value].flatMap(flattenLabels);
  if (typeof value === "object") {
    const label = value.label ?? value.nombre ?? value.name ?? value.id ?? value.kind ?? value.tipo;
    return label == null ? [] : flattenLabels(label);
  }
  return [value];
}

function canTraverse(connection, from, to) {
  if (!connection) return false;
  if (connectionOrigin(connection) === from && connectionDestination(connection) === to) return true;
  return isReciprocal(connection)
    && connectionDestination(connection) === from
    && connectionOrigin(connection) === to;
}

function isReciprocal(connection) {
  if (!connection) return false;
  if (connection.reciproca === true || connection.reciprocal === true || connection.bidireccional === true) return true;
  const direction = normalizeText(connection.direccion ?? connection.direction);
  return ["reciproca", "reciprocal", "bidireccional", "bidirectional", "bilateral", "both", "↔"].includes(direction);
}

function connectionOrigin(connection) {
  return connection?.origen ?? connection?.source;
}

function connectionDestination(connection) {
  return connection?.destino ?? connection?.target;
}

function requireRegion(graph, id) {
  const region = graph.getRegion(id);
  if (!region) throw new RangeError(`Region inexistente: ${String(id)}.`);
  return region;
}

function requireConnection(graph, id) {
  const connection = graph.getConnection(id);
  if (!connection) throw new RangeError(`Conexion inexistente: ${String(id)}.`);
  return connection;
}

function requireCircuit(graph, id) {
  const circuit = graph.getCircuit(id);
  if (!circuit) throw new RangeError(`Circuito inexistente: ${String(id)}.`);
  return circuit;
}

function selectionFromSubgraph(subgraph) {
  return {
    nodeIds: new Set(subgraph.nodeIds),
    connectionIds: new Set(subgraph.connectionIds),
    circuitIds: new Set(subgraph.circuitIds)
  };
}

function universeSelection(graph) {
  return {
    nodeIds: new Set(graph.regions.keys()),
    connectionIds: new Set(graph.connections.keys()),
    circuitIds: new Set(graph.circuits.keys())
  };
}

function differenceSelection(left, right) {
  return {
    nodeIds: difference(left.nodeIds, right.nodeIds),
    connectionIds: difference(left.connectionIds, right.connectionIds),
    circuitIds: difference(left.circuitIds, right.circuitIds)
  };
}

function aliasSelection(selection) {
  return {
    nodeIds: selection.nodeIds,
    regionIds: selection.nodeIds,
    connectionIds: selection.connectionIds,
    edgeIds: selection.connectionIds,
    circuitIds: selection.circuitIds
  };
}

function dedupeBrokenSteps(steps) {
  const seen = new Set();
  return steps.filter((step) => {
    const key = JSON.stringify(step);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recordsFromIds(index, ids) {
  return [...ids].map((id) => index.get(id)).filter(Boolean);
}

function normalizeIdSet(value) {
  if (value == null) return new Set();
  const values = value instanceof Set || Array.isArray(value) ? [...value] : [value];
  return new Set(values.map(resolveId).filter(Boolean));
}

function resolveId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.id ?? value.nodeId ?? value.connectionId ?? value.circuitId ?? "";
  return "";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[_-]+/g, " ")
    .trim();
}

function union(left, right) {
  return new Set([...left, ...right]);
}

function intersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function difference(left, right) {
  return new Set([...left].filter((value) => !right.has(value)));
}

function assertGraph(graph) {
  if (!graph?.regions || !graph?.connections || !graph?.circuits) {
    throw new TypeError("El analisis requiere una instancia compatible de ConnectomeGraph.");
  }
}
