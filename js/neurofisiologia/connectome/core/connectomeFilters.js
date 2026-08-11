/** Stateful filter facade with a small result cache for repeated UI states. */
export class ConnectomeFilters {
  constructor(graph) {
    assertGraph(graph);
    this.graph = graph;
    this._cache = new Map();
  }

  filter(criteria = {}) {
    const normalized = normalizeFilterCriteria(criteria);
    const cacheKey = stableStringify(normalized);
    if (!this._cache.has(cacheKey)) {
      this._remember(cacheKey, applyFilters(this.graph, normalized));
    }
    return cloneFilterResult(this._cache.get(cacheKey));
  }

  apply(criteria) {
    return this.filter(criteria);
  }

  clearCache() {
    this._cache.clear();
  }

  _remember(key, value) {
    if (this._cache.size >= 150) this._cache.delete(this._cache.keys().next().value);
    this._cache.set(key, value);
  }
}

/** Applies all active criteria and returns matched/dimmed ID sets. */
export function filterConnectome(graph, criteria = {}) {
  return new ConnectomeFilters(graph).filter(criteria);
}

export function createConnectomeFilters(graph) {
  return new ConnectomeFilters(graph);
}

export const filtrarConectoma = filterConnectome;

/** Maps Spanish/English UI keys to one serializable filter contract. */
export function normalizeFilterCriteria(criteria = {}) {
  const source = criteria && typeof criteria === "object" ? criteria : {};
  return {
    systems: normalizeCriterionValues(source.systems ?? source.sistemas ?? source.system ?? source.sistema),
    circuits: normalizeCriterionValues(source.circuits ?? source.circuitos ?? source.circuit ?? source.circuito),
    neurotransmitters: normalizeCriterionValues(
      source.neurotransmitters
        ?? source.neurotransmisores
        ?? source.neurotransmitter
        ?? source.neurotransmisor
    ),
    regions: normalizeCriterionValues(source.regions ?? source.regiones ?? source.region ?? source["región"]),
    directions: normalizeCriterionValues(source.directions ?? source.direcciones ?? source.direction ?? source.direccion),
    connectionTypes: normalizeCriterionValues(
      source.connectionTypes
        ?? source.tiposConexion
        ?? source.connectionType
        ?? source.tipoConexion
        ?? source.tipo
    ),
    regionTypes: normalizeCriterionValues(source.regionTypes ?? source.tiposRegion ?? source.regionType ?? source.tipoRegion),
    tags: normalizeCriterionValues(source.tags ?? source.etiquetas),
    plasticity: normalizePlasticityCriterion(source.plasticity ?? source.plasticidad),
    mode: normalizeText(source.mode ?? source.modo) === "any" || normalizeText(source.mode ?? source.modo) === "cualquiera"
      ? "any"
      : "all"
  };
}

function applyFilters(graph, criteria) {
  const universe = universeSelection(graph);
  const selections = [];
  const criteriaApplied = [];

  addCriterion(selections, criteriaApplied, "systems", criteria.systems, () => selectBySystems(graph, criteria.systems));
  addCriterion(selections, criteriaApplied, "circuits", criteria.circuits, () => selectByCircuits(graph, criteria.circuits));
  addCriterion(
    selections,
    criteriaApplied,
    "neurotransmitters",
    criteria.neurotransmitters,
    () => selectByNeurotransmitters(graph, criteria.neurotransmitters)
  );
  addCriterion(selections, criteriaApplied, "regions", criteria.regions, () => selectByRegions(graph, criteria.regions));
  addCriterion(selections, criteriaApplied, "directions", criteria.directions, () => selectConnectionsByField(
    graph,
    criteria.directions,
    (connection) => [connection.direccion ?? connection.direction]
  ));
  addCriterion(selections, criteriaApplied, "connectionTypes", criteria.connectionTypes, () => selectConnectionsByField(
    graph,
    criteria.connectionTypes,
    (connection) => [connection.tipo ?? connection.type]
  ));
  addCriterion(selections, criteriaApplied, "regionTypes", criteria.regionTypes, () => selectRegionsByField(
    graph,
    criteria.regionTypes,
    (region) => [region.tipo ?? region.type]
  ));
  addCriterion(selections, criteriaApplied, "tags", criteria.tags, () => selectByTags(graph, criteria.tags));
  if (criteria.plasticity.active) {
    selections.push(selectByPlasticity(graph, criteria.plasticity));
    criteriaApplied.push("plasticity");
  }

  const active = selections.length > 0;
  let matched = active
    ? combineSelections(selections, criteria.mode)
    : cloneSelection(universe);

  // An edge is never displayed without its canonical endpoints.
  for (const connectionId of matched.connectionIds) {
    const connection = graph.getConnection(connectionId);
    if (!connection) continue;
    matched.nodeIds.add(connectionOrigin(connection));
    matched.nodeIds.add(connectionDestination(connection));
  }
  matched = sanitizeSelection(graph, matched);

  const dimmed = {
    nodeIds: difference(universe.nodeIds, matched.nodeIds),
    connectionIds: difference(universe.connectionIds, matched.connectionIds),
    circuitIds: difference(universe.circuitIds, matched.circuitIds)
  };

  return formatFilterResult(graph, criteria, active, criteriaApplied, matched, dimmed);
}

function selectBySystems(graph, wanted) {
  const selection = emptySelection();
  for (const region of graph.regionList) {
    if (matchesAny(wanted, [region.sistemas, region.sistema, region.systems, region.system])) {
      selection.nodeIds.add(region.id);
    }
  }
  for (const circuit of graph.circuitList) {
    if (matchesAny(wanted, [
      circuit.sistemas,
      circuit.sistema,
      circuit.systems,
      circuit.system,
      circuit.categoria,
      circuit.category,
      circuit.funciones,
      circuit.functions
    ])) addCircuitContents(graph, selection, circuit.id);
  }
  for (const connection of graph.connectionList) {
    if (matchesAny(wanted, [connection.sistemas, connection.sistema, connection.systems, connection.system])) {
      selection.connectionIds.add(connection.id);
    }
  }
  addInternalConnections(graph, selection);
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectByCircuits(graph, wanted) {
  const selection = emptySelection();
  for (const circuit of graph.circuitList) {
    if (matchesRecordIdentity(wanted, circuit, [circuit.categoria, circuit.category])) {
      addCircuitContents(graph, selection, circuit.id);
    }
  }
  return selection;
}

function selectByNeurotransmitters(graph, wanted) {
  const selection = emptySelection();
  for (const region of graph.regionList) {
    if (matchesAny(wanted, [region.neurotransmisoresRelevantes, region.neurotransmisores, region.neurotransmitters])) {
      selection.nodeIds.add(region.id);
    }
  }
  for (const connection of graph.connectionList) {
    if (matchesAny(wanted, [
      connection.neurotransmisorPrincipal,
      connection.neurotransmisores,
      connection.neurotransmitterPrimary,
      connection.neurotransmitters,
      connection.neurotransmitter
    ])) selection.connectionIds.add(connection.id);
  }
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectByRegions(graph, wanted) {
  const selection = emptySelection();
  const roots = graph.regionList.filter((region) => matchesRecordIdentity(wanted, region, [region.aliases]));
  for (const root of roots) {
    selection.nodeIds.add(root.id);
    for (const descendantId of graph.getDescendantIds(root.id)) selection.nodeIds.add(descendantId);
  }
  // Region isolation includes its anatomical contents and immediate afferent/efferent context.
  for (const nodeId of [...selection.nodeIds]) {
    for (const connectionId of graph.getIncidentConnectionIds(nodeId)) selection.connectionIds.add(connectionId);
  }
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectConnectionsByField(graph, wanted, readValues) {
  const selection = emptySelection();
  for (const connection of graph.connectionList) {
    if (matchesAny(wanted, readValues(connection))) selection.connectionIds.add(connection.id);
  }
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectRegionsByField(graph, wanted, readValues) {
  const selection = emptySelection();
  for (const region of graph.regionList) {
    if (matchesAny(wanted, readValues(region))) selection.nodeIds.add(region.id);
  }
  addInternalConnections(graph, selection);
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectByTags(graph, wanted) {
  const selection = emptySelection();
  for (const region of graph.regionList) {
    if (matchesAny(wanted, entityTags(region, "region"))) selection.nodeIds.add(region.id);
  }
  for (const connection of graph.connectionList) {
    if (matchesAny(wanted, entityTags(connection, "connection"))) selection.connectionIds.add(connection.id);
  }
  for (const circuit of graph.circuitList) {
    if (matchesAny(wanted, entityTags(circuit, "circuit"))) addCircuitContents(graph, selection, circuit.id);
  }
  addInternalConnections(graph, selection);
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function selectByPlasticity(graph, criterion) {
  const selection = emptySelection();
  for (const connection of graph.connectionList) {
    const values = plasticityValues(connection);
    const matches = criterion.any
      ? values.some(isPlasticityTerm)
      : matchesAny(criterion.values, values);
    if (matches) selection.connectionIds.add(connection.id);
  }
  for (const region of graph.regionList) {
    const values = plasticityValues(region);
    const matches = criterion.any
      ? values.some(isPlasticityTerm)
      : matchesAny(criterion.values, values);
    if (matches) selection.nodeIds.add(region.id);
  }
  for (const circuit of graph.circuitList) {
    const values = plasticityValues(circuit);
    const matches = criterion.any
      ? values.some(isPlasticityTerm)
      : matchesAny(criterion.values, values);
    if (matches) addCircuitContents(graph, selection, circuit.id);
  }
  addMembershipCircuits(graph, selection);
  return closeOverEndpoints(graph, selection);
}

function plasticityValues(entity) {
  return flattenValues([
    entity.plasticidad,
    entity.plasticity,
    entity.tags,
    entity.etiquetas,
    entity.funcion,
    entity.funciones,
    entity.functions
  ]).map(normalizeText).filter(Boolean);
}

function isPlasticityTerm(value) {
  return ["ltp", "ltd", "plasticidad", "plasticity", "potenciacion a largo plazo", "depresion a largo plazo"]
    .some((term) => value === term || value.includes(term));
}

function entityTags(entity, type) {
  const common = [entity.tags, entity.etiquetas, entity.funcion, entity.funciones, entity.functions];
  if (type === "region") common.push(entity.sistemas, entity.sistema, entity.systems, entity.system, entity.tipo, entity.type);
  if (type === "connection") common.push(entity.tipo, entity.type, entity.evidencia, entity.evidence, entity.plasticidad, entity.plasticity);
  if (type === "circuit") common.push(entity.categoria, entity.category, entity.sistemas, entity.systems, entity.evidencia, entity.evidence);
  return common;
}

function addCircuitContents(graph, selection, circuitId) {
  if (!graph.hasCircuit(circuitId)) return;
  selection.circuitIds.add(circuitId);
  for (const id of graph.getCircuitNodeIds(circuitId)) selection.nodeIds.add(id);
  for (const id of graph.getCircuitConnectionIds(circuitId)) selection.connectionIds.add(id);
}

function addInternalConnections(graph, selection) {
  for (const connection of graph.connectionList) {
    if (selection.nodeIds.has(connectionOrigin(connection)) && selection.nodeIds.has(connectionDestination(connection))) {
      selection.connectionIds.add(connection.id);
    }
  }
}

function addMembershipCircuits(graph, selection) {
  for (const nodeId of selection.nodeIds) {
    for (const circuitId of graph.circuitsByRegionId.get(nodeId) ?? []) selection.circuitIds.add(circuitId);
  }
  for (const connectionId of selection.connectionIds) {
    for (const circuitId of graph.circuitsByConnectionId.get(connectionId) ?? []) selection.circuitIds.add(circuitId);
  }
}

function closeOverEndpoints(graph, selection) {
  for (const connectionId of selection.connectionIds) {
    const connection = graph.getConnection(connectionId);
    if (!connection) continue;
    selection.nodeIds.add(connectionOrigin(connection));
    selection.nodeIds.add(connectionDestination(connection));
  }
  return sanitizeSelection(graph, selection);
}

function combineSelections(selections, mode) {
  if (!selections.length) return emptySelection();
  if (mode === "any") {
    return selections.reduce((result, selection) => ({
      nodeIds: union(result.nodeIds, selection.nodeIds),
      connectionIds: union(result.connectionIds, selection.connectionIds),
      circuitIds: union(result.circuitIds, selection.circuitIds)
    }), emptySelection());
  }
  return selections.slice(1).reduce((result, selection) => ({
    nodeIds: intersection(result.nodeIds, selection.nodeIds),
    connectionIds: intersection(result.connectionIds, selection.connectionIds),
    circuitIds: intersection(result.circuitIds, selection.circuitIds)
  }), cloneSelection(selections[0]));
}

function formatFilterResult(graph, criteria, active, criteriaApplied, matched, dimmed) {
  const matchedBlock = aliasSelection(matched);
  const dimmedBlock = aliasSelection(dimmed);
  return {
    active,
    mode: criteria.mode,
    criteria,
    criteriaApplied,
    matched: matchedBlock,
    dimmed: dimmedBlock,
    nodeIds: matchedBlock.nodeIds,
    regionIds: matchedBlock.nodeIds,
    connectionIds: matchedBlock.connectionIds,
    edgeIds: matchedBlock.connectionIds,
    circuitIds: matchedBlock.circuitIds,
    dimmedNodeIds: dimmedBlock.nodeIds,
    dimmedRegionIds: dimmedBlock.nodeIds,
    dimmedNodes: dimmedBlock.nodeIds,
    dimmedConnectionIds: dimmedBlock.connectionIds,
    dimmedEdgeIds: dimmedBlock.connectionIds,
    dimmedEdges: dimmedBlock.connectionIds,
    dimmedCircuitIds: dimmedBlock.circuitIds,
    matchedNodeIds: matchedBlock.nodeIds,
    matchedRegionIds: matchedBlock.nodeIds,
    matchedConnectionIds: matchedBlock.connectionIds,
    matchedEdgeIds: matchedBlock.connectionIds,
    matchedCircuitIds: matchedBlock.circuitIds,
    highlightedNodeIds: matchedBlock.nodeIds,
    highlightedEdgeIds: matchedBlock.connectionIds,
    dimOthers: active,
    regions: recordsFromIds(graph.regions, matched.nodeIds),
    connections: recordsFromIds(graph.connections, matched.connectionIds),
    circuits: recordsFromIds(graph.circuits, matched.circuitIds)
  };
}

function cloneFilterResult(result) {
  const matched = cloneAliasSelection(result.matched);
  const dimmed = cloneAliasSelection(result.dimmed);
  return {
    ...result,
    criteria: cloneCriteria(result.criteria),
    criteriaApplied: [...result.criteriaApplied],
    matched,
    dimmed,
    nodeIds: matched.nodeIds,
    regionIds: matched.nodeIds,
    connectionIds: matched.connectionIds,
    edgeIds: matched.connectionIds,
    circuitIds: matched.circuitIds,
    dimmedNodeIds: dimmed.nodeIds,
    dimmedRegionIds: dimmed.nodeIds,
    dimmedNodes: dimmed.nodeIds,
    dimmedConnectionIds: dimmed.connectionIds,
    dimmedEdgeIds: dimmed.connectionIds,
    dimmedEdges: dimmed.connectionIds,
    dimmedCircuitIds: dimmed.circuitIds,
    matchedNodeIds: matched.nodeIds,
    matchedRegionIds: matched.nodeIds,
    matchedConnectionIds: matched.connectionIds,
    matchedEdgeIds: matched.connectionIds,
    matchedCircuitIds: matched.circuitIds,
    highlightedNodeIds: matched.nodeIds,
    highlightedEdgeIds: matched.connectionIds,
    regions: [...result.regions],
    connections: [...result.connections],
    circuits: [...result.circuits]
  };
}

function cloneCriteria(criteria) {
  return {
    ...criteria,
    systems: [...criteria.systems],
    circuits: [...criteria.circuits],
    neurotransmitters: [...criteria.neurotransmitters],
    regions: [...criteria.regions],
    directions: [...criteria.directions],
    connectionTypes: [...criteria.connectionTypes],
    regionTypes: [...criteria.regionTypes],
    tags: [...criteria.tags],
    plasticity: { ...criteria.plasticity, values: [...criteria.plasticity.values] }
  };
}

function aliasSelection(selection) {
  return {
    nodeIds: selection.nodeIds,
    nodes: selection.nodeIds,
    regions: selection.nodeIds,
    regionIds: selection.nodeIds,
    connectionIds: selection.connectionIds,
    connections: selection.connectionIds,
    edges: selection.connectionIds,
    edgeIds: selection.connectionIds,
    circuitIds: selection.circuitIds,
    circuits: selection.circuitIds
  };
}

function cloneAliasSelection(selection) {
  const nodeIds = new Set(selection.nodeIds);
  const connectionIds = new Set(selection.connectionIds);
  const circuitIds = new Set(selection.circuitIds);
  return {
    nodeIds,
    nodes: nodeIds,
    regions: nodeIds,
    regionIds: nodeIds,
    connectionIds,
    connections: connectionIds,
    edges: connectionIds,
    edgeIds: connectionIds,
    circuitIds,
    circuits: circuitIds
  };
}

function addCriterion(selections, names, name, values, build) {
  if (!values.length) return;
  selections.push(build());
  names.push(name);
}

function matchesRecordIdentity(wanted, record, extra = []) {
  return matchesAny(wanted, [record.id, record.nombre, record.name, record.nombreCompleto, record.fullName, ...extra]);
}

function matchesAny(wanted, candidates) {
  const normalizedCandidates = flattenValues(candidates).map(normalizeText).filter(Boolean);
  return wanted.some((expected) => normalizedCandidates.some((candidate) => candidate === expected || candidate.includes(expected)));
}

function normalizeCriterionValues(value) {
  return [...new Set(flattenValues(value).map(normalizeText).filter(Boolean))];
}

function normalizePlasticityCriterion(value) {
  if (value === true) return { active: true, any: true, values: [] };
  if (value === false || value == null || value === "") return { active: false, any: false, values: [] };
  const values = normalizeCriterionValues(value);
  return { active: values.length > 0, any: false, values };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9↔<> ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function flattenValues(value) {
  if (value == null) return [];
  if (Array.isArray(value) || value instanceof Set) return [...value].flatMap(flattenValues);
  if (typeof value === "object") {
    const preferred = value.id ?? value.label ?? value.nombre ?? value.name ?? value.kind ?? value.tipo ?? value.type;
    return preferred == null ? Object.values(value).flatMap(flattenValues) : flattenValues(preferred);
  }
  return [value];
}

function sanitizeSelection(graph, selection) {
  return {
    nodeIds: new Set([...selection.nodeIds].filter((id) => graph.hasRegion(id))),
    connectionIds: new Set([...selection.connectionIds].filter((id) => graph.hasConnection(id))),
    circuitIds: new Set([...selection.circuitIds].filter((id) => graph.hasCircuit(id)))
  };
}

function universeSelection(graph) {
  return {
    nodeIds: new Set(graph.regions.keys()),
    connectionIds: new Set(graph.connections.keys()),
    circuitIds: new Set(graph.circuits.keys())
  };
}

function emptySelection() {
  return { nodeIds: new Set(), connectionIds: new Set(), circuitIds: new Set() };
}

function cloneSelection(selection) {
  return {
    nodeIds: new Set(selection.nodeIds),
    connectionIds: new Set(selection.connectionIds),
    circuitIds: new Set(selection.circuitIds)
  };
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

function recordsFromIds(index, ids) {
  return [...ids].map((id) => index.get(id)).filter(Boolean);
}

function connectionOrigin(connection) {
  return connection.origen ?? connection.source;
}

function connectionDestination(connection) {
  return connection.destino ?? connection.target;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertGraph(graph) {
  if (!graph?.regions || !graph?.connections || !graph?.circuits) {
    throw new TypeError("ConnectomeFilters requiere una instancia compatible de ConnectomeGraph.");
  }
}
