const EMPTY_ARRAY = Object.freeze([]);

/** Error raised when structural connectome data cannot form a safe graph. */
export class ConnectomeValidationError extends Error {
  constructor(validation) {
    const summary = validation.errors
      .slice(0, 4)
      .map((error) => error.message)
      .join("; ");
    super(`Datos del conectoma invalidos (${validation.errors.length}): ${summary}`);
    this.name = "ConnectomeValidationError";
    this.validation = validation;
  }
}

/**
 * Directed, read-only index over the canonical neuroanatomical registries.
 * Records remain the single source of truth; indexes only store their IDs.
 */
export class ConnectomeGraph {
  constructor(dataOrRegions = {}, connectionsOrOptions = {}, circuits = [], maybeOptions = {}) {
    const { data, options, referencesProvided } = normalizeConstructorArguments(
      dataOrRegions,
      connectionsOrOptions,
      circuits,
      maybeOptions
    );

    this.validation = validateConnectomeData(data, { referencesProvided });
    if (options.strict !== false && !this.validation.valid) {
      throw new ConnectomeValidationError(this.validation);
    }

    this.regions = indexFirstById(data.regiones);
    this.connections = indexFirstById(data.conexiones);
    this.circuits = indexFirstById(data.circuitos);
    this.references = indexFirstById(data.referencias);

    // English aliases make the core convenient from tests and future adapters.
    this.nodes = this.regions;
    this.edges = this.connections;
    this.regionsById = this.regions;
    this.regionById = this.regions;
    this.nodesById = this.regions;
    this.connectionsById = this.connections;
    this.connectionById = this.connections;
    this.edgesById = this.connections;
    this.circuitsById = this.circuits;
    this.circuitById = this.circuits;
    this.referencesById = this.references;
    this.referenceById = this.references;

    this.regionList = Object.freeze([...this.regions.values()]);
    this.connectionList = Object.freeze([...this.connections.values()]);
    this.circuitList = Object.freeze([...this.circuits.values()]);
    this.referenceList = Object.freeze([...this.references.values()]);

    this.incomingByRegionId = createSetIndex(this.regions.keys());
    this.outgoingByRegionId = createSetIndex(this.regions.keys());
    this.traversableIncomingByRegionId = createSetIndex(this.regions.keys());
    this.traversableOutgoingByRegionId = createSetIndex(this.regions.keys());
    this.childrenByParentId = createSetIndex(this.regions.keys());
    this.circuitsByRegionId = createSetIndex(this.regions.keys());
    this.circuitsByConnectionId = createSetIndex(this.connections.keys());
    this.regionsBySystem = new Map();
    this.regionsByType = new Map();
    this.connectionsByType = new Map();
    this.connectionsByDirection = new Map();
    this.connectionsByNeurotransmitter = new Map();

    this._cache = {
      ancestors: new Map(),
      descendants: new Map(),
      circuitSubgraphs: new Map(),
      nodeSubgraphs: new Map(),
      relations: new Map()
    };

    this._buildIndexes();
  }

  _buildIndexes() {
    for (const region of this.regionList) {
      if (region.regionPadre && this.regions.has(region.regionPadre)) {
        addToSetIndex(this.childrenByParentId, region.regionPadre, region.id);
      }
      for (const system of listValues(region.sistemas ?? region.sistema)) {
        addToSetIndex(this.regionsBySystem, normalizeKey(system), region.id);
      }
      addToSetIndex(this.regionsByType, normalizeKey(region.tipo), region.id);
    }

    for (const connection of this.connectionList) {
      if (this.regions.has(connection.origen)) {
        addToSetIndex(this.outgoingByRegionId, connection.origen, connection.id);
        addToSetIndex(this.traversableOutgoingByRegionId, connection.origen, connection.id);
      }
      if (this.regions.has(connection.destino)) {
        addToSetIndex(this.incomingByRegionId, connection.destino, connection.id);
        addToSetIndex(this.traversableIncomingByRegionId, connection.destino, connection.id);
      }
      if (isReciprocalConnection(connection)) {
        if (this.regions.has(connection.destino)) {
          addToSetIndex(this.traversableOutgoingByRegionId, connection.destino, connection.id);
        }
        if (this.regions.has(connection.origen)) {
          addToSetIndex(this.traversableIncomingByRegionId, connection.origen, connection.id);
        }
      }
      addToSetIndex(this.connectionsByType, normalizeKey(connection.tipo), connection.id);
      addToSetIndex(this.connectionsByDirection, normalizeKey(connection.direccion), connection.id);
      for (const transmitter of connectionNeurotransmitters(connection)) {
        addToSetIndex(this.connectionsByNeurotransmitter, normalizeKey(transmitter), connection.id);
      }
    }

    for (const circuit of this.circuitList) {
      const nodeIds = new Set(circuit.nodos ?? []);
      for (const connectionId of circuit.conexiones ?? []) {
        const connection = this.connections.get(connectionId);
        if (connection) {
          nodeIds.add(connection.origen);
          nodeIds.add(connection.destino);
          addToSetIndex(this.circuitsByConnectionId, connectionId, circuit.id);
        }
      }
      for (const nodeId of nodeIds) {
        if (this.regions.has(nodeId)) addToSetIndex(this.circuitsByRegionId, nodeId, circuit.id);
      }
    }

    // Connection-side memberships are accepted as a convenience but never
    // duplicate circuit data: both indexes still point to canonical records.
    for (const connection of this.connectionList) {
      for (const circuitId of connectionCircuitIds(connection)) {
        if (!this.circuits.has(circuitId)) continue;
        addToSetIndex(this.circuitsByConnectionId, connection.id, circuitId);
        addToSetIndex(this.circuitsByRegionId, connection.origen, circuitId);
        addToSetIndex(this.circuitsByRegionId, connection.destino, circuitId);
      }
    }
  }

  getRegion(id) {
    return this.regions.get(id) ?? null;
  }

  getNode(id) {
    return this.getRegion(id);
  }

  getConnection(id) {
    return this.connections.get(id) ?? null;
  }

  getEdge(id) {
    return this.getConnection(id);
  }

  getCircuit(id) {
    return this.circuits.get(id) ?? null;
  }

  hasRegion(id) {
    return this.regions.has(id);
  }

  hasNode(id) {
    return this.hasRegion(id);
  }

  hasConnection(id) {
    return this.connections.has(id);
  }

  hasEdge(id) {
    return this.hasConnection(id);
  }

  hasCircuit(id) {
    return this.circuits.has(id);
  }

  getParent(regionId) {
    const parentId = this.regions.get(regionId)?.regionPadre;
    return parentId ? this.regions.get(parentId) ?? null : null;
  }

  getChildren(regionId) {
    return recordsFromIds(this.regions, this.childrenByParentId.get(regionId));
  }

  getAncestorIds(regionId, { includeSelf = false } = {}) {
    const cacheKey = `${regionId}|${includeSelf ? 1 : 0}`;
    return cachedSet(this._cache.ancestors, cacheKey, () => {
      const ancestors = new Set(includeSelf && this.regions.has(regionId) ? [regionId] : []);
      const visited = new Set([regionId]);
      let currentId = this.regions.get(regionId)?.regionPadre;
      while (currentId && this.regions.has(currentId) && !visited.has(currentId)) {
        ancestors.add(currentId);
        visited.add(currentId);
        currentId = this.regions.get(currentId)?.regionPadre;
      }
      return ancestors;
    });
  }

  getAncestors(regionId, options) {
    return recordsFromIds(this.regions, this.getAncestorIds(regionId, options));
  }

  getDescendantIds(regionId, { includeSelf = false } = {}) {
    const cacheKey = `${regionId}|${includeSelf ? 1 : 0}`;
    return cachedSet(this._cache.descendants, cacheKey, () => {
      const descendants = new Set(includeSelf && this.regions.has(regionId) ? [regionId] : []);
      const queue = [...(this.childrenByParentId.get(regionId) ?? EMPTY_ARRAY)];
      let queueIndex = 0;
      while (queueIndex < queue.length) {
        const childId = queue[queueIndex];
        queueIndex += 1;
        if (descendants.has(childId)) continue;
        descendants.add(childId);
        queue.push(...(this.childrenByParentId.get(childId) ?? EMPTY_ARRAY));
      }
      return descendants;
    });
  }

  getDescendants(regionId, options) {
    return recordsFromIds(this.regions, this.getDescendantIds(regionId, options));
  }

  getOutgoingConnectionIds(regionId, { includeReciprocal = true } = {}) {
    const index = includeReciprocal ? this.traversableOutgoingByRegionId : this.outgoingByRegionId;
    return new Set(index.get(regionId) ?? EMPTY_ARRAY);
  }

  getIncomingConnectionIds(regionId, { includeReciprocal = true } = {}) {
    const index = includeReciprocal ? this.traversableIncomingByRegionId : this.incomingByRegionId;
    return new Set(index.get(regionId) ?? EMPTY_ARRAY);
  }

  getOutgoingConnections(regionId, options) {
    return recordsFromIds(this.connections, this.getOutgoingConnectionIds(regionId, options));
  }

  getIncomingConnections(regionId, options) {
    return recordsFromIds(this.connections, this.getIncomingConnectionIds(regionId, options));
  }

  getOutgoing(regionId, options) {
    return this.getOutgoingConnections(regionId, options);
  }

  outgoing(regionId, options) {
    return this.getOutgoingConnections(regionId, options);
  }

  getIncoming(regionId, options) {
    return this.getIncomingConnections(regionId, options);
  }

  incoming(regionId, options) {
    return this.getIncomingConnections(regionId, options);
  }

  getIncidentConnectionIds(regionId) {
    return unionSets(
      this.incomingByRegionId.get(regionId),
      this.outgoingByRegionId.get(regionId)
    );
  }

  getIncidentConnections(regionId) {
    return recordsFromIds(this.connections, this.getIncidentConnectionIds(regionId));
  }

  getNeighborIds(regionId, { direction = "both", includeReciprocal = true } = {}) {
    const neighbors = new Set();
    for (const step of this.getTraversalSteps(regionId, { direction, includeReciprocal })) {
      neighbors.add(step.to);
    }
    return neighbors;
  }

  getNeighbors(regionId, options) {
    return recordsFromIds(this.regions, this.getNeighborIds(regionId, options));
  }

  /** Returns registered one-edge traversal steps; it never synthesizes edges. */
  getTraversalSteps(regionId, { direction = "outgoing", includeReciprocal = true } = {}) {
    if (!this.regions.has(regionId)) return [];
    const normalizedDirection = normalizeTraversalDirection(direction);
    const steps = [];

    if (normalizedDirection !== "incoming") {
      for (const connectionId of this.outgoingByRegionId.get(regionId) ?? EMPTY_ARRAY) {
        const connection = this.connections.get(connectionId);
        if (connection) steps.push(createTraversalStep(connection, regionId, connection.destino, false));
      }
      if (includeReciprocal) {
        for (const connectionId of this.incomingByRegionId.get(regionId) ?? EMPTY_ARRAY) {
          const connection = this.connections.get(connectionId);
          if (connection && isReciprocalConnection(connection)) {
            steps.push(createTraversalStep(connection, regionId, connection.origen, true));
          }
        }
      }
    }

    if (normalizedDirection !== "outgoing") {
      for (const connectionId of this.incomingByRegionId.get(regionId) ?? EMPTY_ARRAY) {
        const connection = this.connections.get(connectionId);
        if (connection) steps.push(createTraversalStep(connection, regionId, connection.origen, true));
      }
      if (includeReciprocal) {
        for (const connectionId of this.outgoingByRegionId.get(regionId) ?? EMPTY_ARRAY) {
          const connection = this.connections.get(connectionId);
          if (connection && isReciprocalConnection(connection)) {
            steps.push(createTraversalStep(connection, regionId, connection.destino, false));
          }
        }
      }
    }

    return dedupeTraversalSteps(steps);
  }

  getConnectionsBetween(originId, destinationId, { directed = true, includeReciprocal = true } = {}) {
    return this.connectionList.filter((connection) => {
      const forward = connection.origen === originId && connection.destino === destinationId;
      const reverse = connection.origen === destinationId && connection.destino === originId;
      if (forward) return true;
      if (!reverse) return false;
      return !directed || (includeReciprocal && isReciprocalConnection(connection));
    });
  }

  getCircuitNodeIds(circuitId, { includeConnectionEndpoints = true } = {}) {
    const circuit = this.circuits.get(circuitId);
    if (!circuit) return new Set();
    const nodeIds = new Set((circuit.nodos ?? []).filter((id) => this.regions.has(id)));
    if (includeConnectionEndpoints) {
      for (const connectionId of circuit.conexiones ?? []) {
        const connection = this.connections.get(connectionId);
        if (!connection) continue;
        nodeIds.add(connection.origen);
        nodeIds.add(connection.destino);
      }
    }
    return nodeIds;
  }

  getCircuitConnectionIds(circuitId) {
    const circuit = this.circuits.get(circuitId);
    return new Set((circuit?.conexiones ?? []).filter((id) => this.connections.has(id)));
  }

  getCircuitMembershipsForRegion(regionId) {
    return recordsFromIds(this.circuits, this.circuitsByRegionId.get(regionId));
  }

  getCircuitMembershipsForConnection(connectionId) {
    return recordsFromIds(this.circuits, this.circuitsByConnectionId.get(connectionId));
  }

  getCircuitSubgraph(circuitId) {
    const cached = this._cache.circuitSubgraphs.get(circuitId);
    if (cached) return cloneSelectionSets(cached);
    if (!this.circuits.has(circuitId)) return createSelection(this, new Set(), new Set(), new Set());
    const selection = createSelection(
      this,
      this.getCircuitNodeIds(circuitId),
      this.getCircuitConnectionIds(circuitId),
      new Set([circuitId])
    );
    this._cache.circuitSubgraphs.set(circuitId, selection);
    return cloneSelectionSets(selection);
  }

  getNodeSubgraph(regionId, { depth = 1, direction = "both", includeReciprocal = true } = {}) {
    const safeDepth = Math.max(0, Math.floor(Number(depth) || 0));
    const normalizedDirection = normalizeTraversalDirection(direction);
    const cacheKey = `${regionId}|${safeDepth}|${normalizedDirection}|${includeReciprocal ? 1 : 0}`;
    const cached = this._cache.nodeSubgraphs.get(cacheKey);
    if (cached) return cloneSelectionSets(cached);
    if (!this.regions.has(regionId)) return createSelection(this, new Set(), new Set(), new Set());

    const nodeIds = new Set([regionId]);
    const connectionIds = new Set();
    let frontier = new Set([regionId]);
    for (let level = 0; level < safeDepth && frontier.size; level += 1) {
      const next = new Set();
      for (const currentId of frontier) {
        for (const step of this.getTraversalSteps(currentId, {
          direction: normalizedDirection,
          includeReciprocal
        })) {
          connectionIds.add(step.connectionId);
          if (!nodeIds.has(step.to)) next.add(step.to);
          nodeIds.add(step.to);
        }
      }
      frontier = next;
    }

    const circuitIds = new Set();
    for (const nodeId of nodeIds) {
      for (const id of this.circuitsByRegionId.get(nodeId) ?? EMPTY_ARRAY) circuitIds.add(id);
    }
    const selection = createSelection(this, nodeIds, connectionIds, circuitIds);
    this._cache.nodeSubgraphs.set(cacheKey, selection);
    return cloneSelectionSets(selection);
  }

  /** Builds a subgraph from IDs and optionally closes it over circuits/endpoints. */
  createSubgraph(options = {}) {
    const nodeIds = new Set(options.nodeIds ?? options.regionIds ?? []);
    const connectionIds = new Set(options.connectionIds ?? options.edgeIds ?? []);
    const circuitIds = new Set(options.circuitIds ?? []);

    if (options.includeCircuitContents !== false) {
      for (const circuitId of circuitIds) {
        for (const id of this.getCircuitNodeIds(circuitId)) nodeIds.add(id);
        for (const id of this.getCircuitConnectionIds(circuitId)) connectionIds.add(id);
      }
    }
    if (options.includeInternalConnections) {
      for (const connection of this.connectionList) {
        if (nodeIds.has(connection.origen) && nodeIds.has(connection.destino)) connectionIds.add(connection.id);
      }
    }
    if (options.includeIncidentConnections) {
      for (const nodeId of [...nodeIds]) {
        for (const connectionId of this.getIncidentConnectionIds(nodeId)) connectionIds.add(connectionId);
      }
    }
    if (options.includeEndpoints !== false) {
      for (const connectionId of connectionIds) {
        const connection = this.connections.get(connectionId);
        if (!connection) continue;
        nodeIds.add(connection.origen);
        nodeIds.add(connection.destino);
      }
    }
    return createSelection(this, nodeIds, connectionIds, circuitIds);
  }

  getSubgraph(options) {
    return this.createSubgraph(options);
  }

  getRegionRelations(regionId) {
    const cacheKey = `region:${regionId}`;
    if (this._cache.relations.has(cacheKey)) return this._cache.relations.get(cacheKey);
    const region = this.getRegion(regionId);
    if (!region) return null;
    const relations = {
      type: "region",
      region,
      parent: this.getParent(regionId),
      children: this.getChildren(regionId),
      ancestors: this.getAncestors(regionId),
      descendants: this.getDescendants(regionId),
      incoming: this.getIncomingConnections(regionId),
      outgoing: this.getOutgoingConnections(regionId),
      circuits: this.getCircuitMembershipsForRegion(regionId)
    };
    this._cache.relations.set(cacheKey, relations);
    return relations;
  }

  getConnectionRelations(connectionId) {
    const cacheKey = `connection:${connectionId}`;
    if (this._cache.relations.has(cacheKey)) return this._cache.relations.get(cacheKey);
    const connection = this.getConnection(connectionId);
    if (!connection) return null;
    const relations = {
      type: "connection",
      connection,
      origin: this.getRegion(connection.origen),
      destination: this.getRegion(connection.destino),
      reciprocal: isReciprocalConnection(connection),
      circuits: this.getCircuitMembershipsForConnection(connectionId)
    };
    this._cache.relations.set(cacheKey, relations);
    return relations;
  }

  getCircuitRelations(circuitId) {
    const cacheKey = `circuit:${circuitId}`;
    if (this._cache.relations.has(cacheKey)) return this._cache.relations.get(cacheKey);
    const circuit = this.getCircuit(circuitId);
    if (!circuit) return null;
    const subgraph = this.getCircuitSubgraph(circuitId);
    const relations = {
      type: "circuit",
      circuit,
      regions: subgraph.regions,
      connections: subgraph.connections,
      subgraph
    };
    this._cache.relations.set(cacheKey, relations);
    return relations;
  }

  getRelations(id, type) {
    if (type === "region" || type === "node") return this.getRegionRelations(id);
    if (type === "connection" || type === "edge") return this.getConnectionRelations(id);
    if (type === "circuit") return this.getCircuitRelations(id);
    return this.getRegionRelations(id)
      ?? this.getConnectionRelations(id)
      ?? this.getCircuitRelations(id);
  }

  clearCaches() {
    for (const cache of Object.values(this._cache)) cache.clear();
  }

  validate() {
    return this.validation;
  }

  toJSON() {
    return {
      regiones: [...this.regionList],
      conexiones: [...this.connectionList],
      circuitos: [...this.circuitList],
      referencias: [...this.referenceList]
    };
  }
}

/** Creates a ConnectomeGraph without exposing constructor details. */
export function createConnectomeGraph(dataOrRegions, connectionsOrOptions, circuits, options) {
  return new ConnectomeGraph(dataOrRegions, connectionsOrOptions, circuits, options);
}

export const crearGrafoConectoma = createConnectomeGraph;

/** Performs schema and cross-registry validation without needing a graph instance. */
export function validateConnectomeData(input = {}, optionsOrConnections = {}, circuits = [], references = []) {
  const positional = Array.isArray(input);
  const source = positional
    ? {
        regiones: input,
        conexiones: Array.isArray(optionsOrConnections) ? optionsOrConnections : [],
        circuitos: Array.isArray(circuits) ? circuits : [],
        referencias: Array.isArray(references) ? references : []
      }
    : input;
  const options = positional ? {} : optionsOrConnections;
  const data = normalizeDataObject(source);
  const referencesProvided = options.referencesProvided
    ?? (positional ? arguments.length >= 4 : (hasOwn(source, "referencias") || hasOwn(source, "references")));
  const errors = [];
  const warnings = [];
  const regionIds = validateRegistry(data.regiones, "region", errors);
  const connectionIds = validateRegistry(data.conexiones, "connection", errors);
  const circuitIds = validateRegistry(data.circuitos, "circuit", errors);
  const referenceIds = validateRegistry(data.referencias, "reference", errors);

  for (const [index, region] of data.regiones.entries()) {
    if (!isRecord(region) || !validId(region.id)) continue;
    const path = `regiones[${index}]`;
    validateDisplayName(region, path, warnings);
    validateArrayFields(region, REGION_ARRAY_FIELDS, path, errors);
    if (region.regionPadre != null && region.regionPadre !== "") {
      if (!validId(region.regionPadre) || !regionIds.has(region.regionPadre)) {
        pushIssue(errors, "unknown_parent", path, `La region ${region.id} referencia un padre inexistente: ${String(region.regionPadre)}.`, region.id);
      } else if (region.regionPadre === region.id) {
        pushIssue(errors, "self_parent", path, `La region ${region.id} no puede ser su propio padre.`, region.id);
      }
    }
    validateReferences(region, path, referenceIds, referencesProvided, errors, warnings);
  }
  validateHierarchyCycles(data.regiones, regionIds, errors);

  for (const [index, connection] of data.conexiones.entries()) {
    if (!isRecord(connection) || !validId(connection.id)) continue;
    const path = `conexiones[${index}]`;
    validateDisplayName(connection, path, warnings);
    validateArrayFields(connection, CONNECTION_ARRAY_FIELDS, path, errors);
    if (!validId(connection.origen) || !regionIds.has(connection.origen)) {
      pushIssue(errors, "unknown_origin", path, `La conexion ${connection.id} tiene un origen inexistente: ${String(connection.origen)}.`, connection.id);
    }
    if (!validId(connection.destino) || !regionIds.has(connection.destino)) {
      pushIssue(errors, "unknown_destination", path, `La conexion ${connection.id} tiene un destino inexistente: ${String(connection.destino)}.`, connection.id);
    }
    validateReferences(connection, path, referenceIds, referencesProvided, errors, warnings);
  }

  const connectionMap = indexFirstById(data.conexiones);
  for (const [index, circuit] of data.circuitos.entries()) {
    if (!isRecord(circuit) || !validId(circuit.id)) continue;
    const path = `circuitos[${index}]`;
    validateDisplayName(circuit, path, warnings);
    validateArrayFields(circuit, CIRCUIT_ARRAY_FIELDS, path, errors, new Set(["nodos", "conexiones"]));
    validateUniqueIds(circuit.nodos, `${path}.nodos`, circuit.id, "duplicate_circuit_node", errors);
    validateUniqueIds(circuit.conexiones, `${path}.conexiones`, circuit.id, "duplicate_circuit_connection", errors);
    if (circuit.secuenciaConexiones != null && !Array.isArray(circuit.secuenciaConexiones)) {
      pushIssue(
        errors,
        "invalid_array",
        `${path}.secuenciaConexiones`,
        `${path}.secuenciaConexiones debe ser un arreglo.`,
        circuit.id
      );
    }
    const listedNodes = new Set(Array.isArray(circuit.nodos) ? circuit.nodos : []);
    for (const nodeId of listedNodes) {
      if (!regionIds.has(nodeId)) {
        pushIssue(errors, "unknown_circuit_node", path, `El circuito ${circuit.id} referencia un nodo inexistente: ${String(nodeId)}.`, circuit.id, nodeId);
      }
    }
    for (const connectionId of Array.isArray(circuit.conexiones) ? circuit.conexiones : []) {
      if (!connectionIds.has(connectionId)) {
        pushIssue(errors, "unknown_circuit_connection", path, `El circuito ${circuit.id} referencia una conexion inexistente: ${String(connectionId)}.`, circuit.id, connectionId);
        continue;
      }
      const connection = connectionMap.get(connectionId);
      if (connection && (!listedNodes.has(connection.origen) || !listedNodes.has(connection.destino))) {
        pushIssue(
          warnings,
          "circuit_endpoint_not_listed",
          path,
          `La conexion ${connectionId} aporta al circuito ${circuit.id} un endpoint no declarado en nodos.`,
          circuit.id,
          connectionId
        );
      }
    }
    for (const connectionId of Array.isArray(circuit.secuenciaConexiones) ? circuit.secuenciaConexiones : []) {
      if (!connectionIds.has(connectionId)) {
        pushIssue(
          errors,
          "unknown_sequence_connection",
          `${path}.secuenciaConexiones`,
          `La secuencia del circuito ${circuit.id} referencia una conexion inexistente: ${String(connectionId)}.`,
          circuit.id,
          connectionId
        );
      } else if (!new Set(circuit.conexiones ?? []).has(connectionId)) {
        pushIssue(
          warnings,
          "sequence_connection_not_in_circuit",
          `${path}.secuenciaConexiones`,
          `La conexion ${connectionId} aparece en la secuencia pero no en conexiones de ${circuit.id}.`,
          circuit.id,
          connectionId
        );
      }
    }
    validateSequence(circuit, path, regionIds, connectionIds, connectionMap, errors, warnings);
    validateReferences(circuit, path, referenceIds, referencesProvided, errors, warnings);
  }

  for (const [index, connection] of data.conexiones.entries()) {
    if (!isRecord(connection) || !validId(connection.id)) continue;
    for (const circuitId of connectionCircuitIds(connection)) {
      if (!circuitIds.has(circuitId)) {
        pushIssue(
          errors,
          "unknown_connection_circuit",
          `conexiones[${index}]`,
          `La conexion ${connection.id} declara un circuito inexistente: ${circuitId}.`,
          connection.id,
          circuitId
        );
      }
    }
  }

  const validation = {
    valid: errors.length === 0,
    isValid: errors.length === 0,
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      regions: data.regiones.length,
      connections: data.conexiones.length,
      circuits: data.circuitos.length,
      references: data.referencias.length
    }
  };
  return validation;
}

export const validarDatosConectoma = validateConnectomeData;

/** True only when a registered edge explicitly permits traversal both ways. */
export function isReciprocalConnection(connection) {
  if (!connection) return false;
  if (connection.reciproca === true || connection.reciprocal === true || connection.bidireccional === true) return true;
  const direction = normalizeKey(connection.direccion ?? connection.direction);
  return RECIPROCAL_DIRECTIONS.has(direction) || String(connection.direccion ?? "").trim() === "↔";
}

export function getConnectionCircuitIds(connection) {
  return new Set(connectionCircuitIds(connection));
}

const RECIPROCAL_DIRECTIONS = new Set([
  "reciproca",
  "reciprocal",
  "bidireccional",
  "bidirectional",
  "bilateral",
  "ambas",
  "both",
  "<->"
]);

const REGION_ARRAY_FIELDS = [
  "aliases",
  "sistemas",
  "funciones",
  "neurotransmisoresRelevantes",
  "receptoresRelevantes",
  "patologiasRelacionadas",
  "referencias"
];
const CONNECTION_ARRAY_FIELDS = ["referencias"];
const CIRCUIT_ARRAY_FIELDS = ["nodos", "conexiones", "funciones", "referencias"];

function normalizeConstructorArguments(dataOrRegions, connectionsOrOptions, circuits, maybeOptions) {
  if (Array.isArray(dataOrRegions)) {
    const data = {
      regiones: dataOrRegions,
      conexiones: Array.isArray(connectionsOrOptions) ? connectionsOrOptions : [],
      circuitos: Array.isArray(circuits) ? circuits : [],
      referencias: Array.isArray(maybeOptions.referencias ?? maybeOptions.references)
        ? (maybeOptions.referencias ?? maybeOptions.references)
        : []
    };
    return {
      data,
      options: maybeOptions,
      referencesProvided: hasOwn(maybeOptions, "referencias") || hasOwn(maybeOptions, "references")
    };
  }
  const source = isRecord(dataOrRegions) ? dataOrRegions : {};
  return {
    data: normalizeDataObject(source),
    options: isRecord(connectionsOrOptions) && !Array.isArray(connectionsOrOptions) ? connectionsOrOptions : {},
    referencesProvided: hasOwn(source, "referencias") || hasOwn(source, "references")
  };
}

function normalizeDataObject(input) {
  const source = isRecord(input) ? input : {};
  return {
    regiones: registryValues(source.regiones ?? source.regions ?? source.nodes),
    conexiones: registryValues(source.conexiones ?? source.connections ?? source.edges),
    circuitos: registryValues(source.circuitos ?? source.circuits),
    referencias: registryValues(source.referencias ?? source.references)
  };
}

function registryValues(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (isRecord(value)) return Object.values(value);
  return [];
}

function indexFirstById(records) {
  const index = new Map();
  for (const record of records ?? EMPTY_ARRAY) {
    if (isRecord(record) && validId(record.id) && !index.has(record.id)) index.set(record.id, record);
  }
  return index;
}

function validateRegistry(records, entityType, errors) {
  const ids = new Set();
  records.forEach((record, index) => {
    const path = `${entityType}[${index}]`;
    if (!isRecord(record)) {
      pushIssue(errors, "invalid_record", path, `El registro ${path} debe ser un objeto.`);
      return;
    }
    if (!validId(record.id)) {
      pushIssue(errors, "invalid_id", path, `El registro ${path} necesita un ID de texto no vacio.`);
      return;
    }
    if (ids.has(record.id)) {
      pushIssue(errors, "duplicate_id", path, `ID duplicado en ${entityType}: ${record.id}.`, record.id);
      return;
    }
    ids.add(record.id);
  });
  return ids;
}

function validateDisplayName(record, path, warnings) {
  if (!validId(record.nombre ?? record.name)) {
    pushIssue(warnings, "missing_name", path, `El registro ${record.id} no tiene un nombre visible.`, record.id);
  }
}

function validateArrayFields(record, fields, path, errors, required = new Set()) {
  for (const field of fields) {
    if (!(field in record)) {
      if (required.has(field)) {
        pushIssue(errors, "missing_array", `${path}.${field}`, `${path}.${field} debe existir y ser un arreglo.`, record.id);
      }
      continue;
    }
    if (!Array.isArray(record[field])) {
      pushIssue(errors, "invalid_array", `${path}.${field}`, `${path}.${field} debe ser un arreglo.`, record.id);
    }
  }
}

function validateUniqueIds(values, path, entityId, code, errors) {
  if (!Array.isArray(values)) return;
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      pushIssue(errors, code, path, `${path} repite el ID ${String(value)}.`, entityId, value);
    }
    seen.add(value);
  }
}

function validateReferences(record, path, referenceIds, registryProvided, errors, warnings) {
  if (!("referencias" in record) && !("references" in record)) {
    pushIssue(warnings, "missing_references", path, `${path} no declara un arreglo de referencias.`, record.id);
    return;
  }
  const references = record.referencias ?? record.references;
  if (!Array.isArray(references)) return;
  const seen = new Set();
  references.forEach((reference, index) => {
    const referencePath = `${path}.referencias[${index}]`;
    if (typeof reference === "string") {
      const id = reference.trim();
      if (!id) {
        pushIssue(errors, "invalid_reference", referencePath, `${referencePath} no puede estar vacia.`, record.id);
        return;
      }
      if (seen.has(id)) {
        pushIssue(warnings, "duplicate_reference", referencePath, `${record.id} repite la referencia ${id}.`, record.id, id);
      }
      seen.add(id);
      if (registryProvided && !referenceIds.has(id)) {
        pushIssue(errors, "unknown_reference", referencePath, `${record.id} referencia una fuente inexistente: ${id}.`, record.id, id);
      }
      return;
    }
    if (!isRecord(reference)) {
      pushIssue(errors, "invalid_reference", referencePath, `${referencePath} debe ser un ID o una referencia estructurada.`, record.id);
      return;
    }
    const inlineHasCitation = Boolean(reference.url || reference.doi || reference.titulo || reference.title || reference.cita || reference.citation);
    if (!inlineHasCitation && validId(reference.id) && registryProvided && !referenceIds.has(reference.id)) {
      pushIssue(errors, "unknown_reference", referencePath, `${record.id} referencia una fuente inexistente: ${reference.id}.`, record.id, reference.id);
    } else if (!inlineHasCitation && !validId(reference.id)) {
      pushIssue(errors, "invalid_reference", referencePath, `${referencePath} no contiene ID ni datos bibliograficos.`, record.id);
    }
  });
}

function validateHierarchyCycles(regions, validRegionIds, errors) {
  const parentById = new Map();
  for (const region of regions) {
    if (isRecord(region) && validRegionIds.has(region.id) && validRegionIds.has(region.regionPadre)) {
      parentById.set(region.id, region.regionPadre);
    }
  }
  const completed = new Set();
  for (const startId of validRegionIds) {
    if (completed.has(startId)) continue;
    const path = [];
    const positions = new Map();
    let currentId = startId;
    while (currentId && !completed.has(currentId)) {
      if (positions.has(currentId)) {
        const cycle = path.slice(positions.get(currentId)).concat(currentId);
        pushIssue(errors, "hierarchy_cycle", "regiones", `La jerarquia anatomica contiene un ciclo: ${cycle.join(" -> ")}.`, currentId);
        break;
      }
      positions.set(currentId, path.length);
      path.push(currentId);
      currentId = parentById.get(currentId);
    }
    for (const id of path) completed.add(id);
  }
}

function validateSequence(circuit, path, regionIds, connectionIds, connectionMap, errors, warnings) {
  if (circuit.secuencia == null) return;
  if (!Array.isArray(circuit.secuencia)) {
    pushIssue(errors, "invalid_sequence", `${path}.secuencia`, `${path}.secuencia debe ser un arreglo.`, circuit.id);
    return;
  }
  const tokens = [];
  circuit.secuencia.forEach((step, index) => {
    const parsed = parseSequenceStep(step, regionIds, connectionIds);
    if (!parsed) {
      pushIssue(errors, "unknown_sequence_step", `${path}.secuencia[${index}]`, `El paso ${String(step?.id ?? step)} no existe en los registros.`, circuit.id);
    } else {
      tokens.push(parsed);
    }
  });
  const nodeOnlySequence = tokens.length === circuit.secuencia.length && tokens.every((token) => token.type === "node");
  const orderedConnectionIds = Array.isArray(circuit.secuenciaConexiones) ? circuit.secuenciaConexiones : [];
  if (nodeOnlySequence && orderedConnectionIds.length) {
    if (orderedConnectionIds.length !== Math.max(0, tokens.length - 1)) {
      pushIssue(
        warnings,
        "sequence_length_mismatch",
        `${path}.secuenciaConexiones`,
        `La secuencia de ${circuit.id} tiene ${tokens.length} nodos y ${orderedConnectionIds.length} conexiones ordenadas.`,
        circuit.id
      );
    }
    const comparableLength = Math.min(orderedConnectionIds.length, Math.max(0, tokens.length - 1));
    for (let index = 0; index < comparableLength; index += 1) {
      const connection = connectionMap.get(orderedConnectionIds[index]);
      if (!connection) continue;
      const from = tokens[index].id;
      const to = tokens[index + 1].id;
      const forward = connection.origen === from && connection.destino === to;
      const reverse = isReciprocalConnection(connection)
        && connection.destino === from
        && connection.origen === to;
      if (!forward && !reverse) {
        pushIssue(
          warnings,
          "sequence_discontinuity",
          `${path}.secuenciaConexiones[${index}]`,
          `La conexion ${connection.id} no enlaza ${from} con ${to} en la secuencia de ${circuit.id}.`,
          circuit.id,
          connection.id
        );
      }
    }
  }
  for (let index = 1; index < tokens.length - 1; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    const next = tokens[index + 1];
    if (previous.type !== "node" || current.type !== "connection" || next.type !== "node") continue;
    const connection = connectionMap.get(current.id);
    if (!connection) continue;
    const forward = connection.origen === previous.id && connection.destino === next.id;
    const reverse = isReciprocalConnection(connection)
      && connection.destino === previous.id
      && connection.origen === next.id;
    if (!forward && !reverse) {
      pushIssue(
        warnings,
        "sequence_discontinuity",
        `${path}.secuencia[${index}]`,
        `La conexion ${current.id} no enlaza los nodos adyacentes declarados en la secuencia de ${circuit.id}.`,
        circuit.id,
        current.id
      );
    }
  }
}

function parseSequenceStep(step, regionIds, connectionIds) {
  if (typeof step === "string") {
    if (regionIds.has(step)) return { type: "node", id: step };
    if (connectionIds.has(step)) return { type: "connection", id: step };
    return null;
  }
  if (!isRecord(step)) return null;
  const explicitNode = step.nodeId ?? step.nodo ?? step.regionId ?? step.region ?? step.estructura;
  const explicitConnection = step.connectionId ?? step.conexion ?? step.edgeId ?? step.edge;
  if (regionIds.has(explicitNode)) return { type: "node", id: explicitNode };
  if (connectionIds.has(explicitConnection)) return { type: "connection", id: explicitConnection };
  if ((step.tipo === "nodo" || step.type === "node") && regionIds.has(step.id)) return { type: "node", id: step.id };
  if ((step.tipo === "conexion" || step.type === "connection" || step.type === "edge") && connectionIds.has(step.id)) {
    return { type: "connection", id: step.id };
  }
  return null;
}

function createSelection(graph, rawNodeIds, rawConnectionIds, rawCircuitIds) {
  const nodeIds = new Set([...rawNodeIds].filter((id) => graph.regions.has(id)));
  const connectionIds = new Set([...rawConnectionIds].filter((id) => graph.connections.has(id)));
  const circuitIds = new Set([...rawCircuitIds].filter((id) => graph.circuits.has(id)));
  const regions = recordsFromIds(graph.regions, nodeIds);
  const connections = recordsFromIds(graph.connections, connectionIds);
  const circuits = recordsFromIds(graph.circuits, circuitIds);
  return {
    nodeIds,
    regionIds: nodeIds,
    connectionIds,
    edgeIds: connectionIds,
    circuitIds,
    regions,
    nodes: regions,
    connections,
    edges: connections,
    circuits,
    regiones: regions,
    conexiones: connections,
    circuitos: circuits
  };
}

function cloneSelectionSets(selection) {
  const nodeIds = new Set(selection.nodeIds);
  const connectionIds = new Set(selection.connectionIds);
  const circuitIds = new Set(selection.circuitIds);
  return {
    ...selection,
    nodeIds,
    regionIds: nodeIds,
    connectionIds,
    edgeIds: connectionIds,
    circuitIds
  };
}

function cachedSet(cache, key, compute) {
  if (!cache.has(key)) cache.set(key, compute());
  return new Set(cache.get(key));
}

function createSetIndex(ids = []) {
  const index = new Map();
  for (const id of ids) index.set(id, new Set());
  return index;
}

function addToSetIndex(index, key, value) {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(value);
}

function recordsFromIds(index, ids = EMPTY_ARRAY) {
  const records = [];
  for (const id of ids ?? EMPTY_ARRAY) {
    const record = index.get(id);
    if (record) records.push(record);
  }
  return records;
}

function unionSets(...sets) {
  const result = new Set();
  for (const values of sets) {
    for (const value of values ?? EMPTY_ARRAY) result.add(value);
  }
  return result;
}

function normalizeTraversalDirection(direction) {
  const normalized = normalizeKey(direction);
  if (["incoming", "in", "aferente", "entrante"].includes(normalized)) return "incoming";
  if (["outgoing", "out", "eferente", "saliente"].includes(normalized)) return "outgoing";
  return "both";
}

function createTraversalStep(connection, from, to, reversed) {
  return {
    from,
    to,
    connectionId: connection.id,
    edgeId: connection.id,
    connection,
    edge: connection,
    reversed,
    reciprocal: isReciprocalConnection(connection)
  };
}

function dedupeTraversalSteps(steps) {
  const seen = new Set();
  return steps.filter((step) => {
    const key = `${step.from}\u0000${step.to}\u0000${step.connectionId}\u0000${step.reversed ? 1 : 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connectionCircuitIds(connection) {
  return listValues(connection?.circuitos ?? connection?.circuito ?? connection?.circuits ?? connection?.circuit)
    .filter(validId);
}

function connectionNeurotransmitters(connection) {
  return listValues(
    connection?.neurotransmisores
      ?? connection?.neurotransmisorPrincipal
      ?? connection?.neurotransmitter
      ?? connection?.neurotransmitterPrimary
  ).filter(Boolean);
}

function listValues(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[\s-]+/g, "_");
}

function pushIssue(target, code, path, message, entityId, referenceId) {
  target.push({ code, path, message, entityId, referenceId });
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, property) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, property);
}
