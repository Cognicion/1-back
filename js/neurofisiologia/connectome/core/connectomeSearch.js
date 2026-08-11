/** Normalizes accents, case and punctuation for deterministic text matching. */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Cached, accent-insensitive search over all canonical graph registries. */
export class ConnectomeSearch {
  constructor(graph) {
    assertGraph(graph);
    this.graph = graph;
    this._entries = [];
    this._cache = new Map();
    this.rebuild();
  }

  rebuild() {
    this._entries = [
      ...this.graph.regionList.map((region) => buildRegionEntry(region)),
      ...this.graph.connectionList.map((connection) => buildConnectionEntry(connection, this.graph)),
      ...this.graph.circuitList.map((circuit) => buildCircuitEntry(circuit, this.graph))
    ];
    this._cache.clear();
    return this;
  }

  /** Returns ranked region, connection and circuit result groups. */
  search(query, options = {}) {
    const normalizedQuery = normalizeSearchText(query);
    const types = normalizeTypes(options.types ?? options.type);
    const limit = normalizeLimit(options.limit, 60);
    const limitPerType = normalizeLimit(options.limitPerType, limit);
    const matchAllTokens = options.matchAllTokens !== false;
    const includeAllOnEmpty = options.includeAllOnEmpty === true;
    const cacheKey = JSON.stringify({ normalizedQuery, types: [...types].sort(), limit, limitPerType, matchAllTokens, includeAllOnEmpty });
    if (this._cache.has(cacheKey)) return cloneSearchResult(this._cache.get(cacheKey));

    if (!normalizedQuery && !includeAllOnEmpty) {
      const empty = createSearchResult(query, normalizedQuery, []);
      this._remember(cacheKey, empty);
      return cloneSearchResult(empty);
    }

    const tokens = normalizedQuery ? normalizedQuery.split(" ") : [];
    const matches = [];
    for (const entry of this._entries) {
      if (!types.has(entry.type)) continue;
      const scored = scoreEntry(entry, normalizedQuery, tokens, matchAllTokens);
      if (!scored) continue;
      matches.push({
        type: entry.type,
        tipo: spanishType(entry.type),
        id: entry.id,
        item: entry.item,
        score: scored.score,
        matches: scored.matches,
        matchedFields: scored.matches
      });
    }

    matches.sort(compareResults);
    const limitedByType = [];
    const counts = new Map();
    for (const match of matches) {
      const count = counts.get(match.type) ?? 0;
      if (count >= limitPerType) continue;
      counts.set(match.type, count + 1);
      limitedByType.push(match);
      if (limitedByType.length >= limit) break;
    }

    const result = createSearchResult(query, normalizedQuery, limitedByType);
    this._remember(cacheKey, result);
    return cloneSearchResult(result);
  }

  find(query, options) {
    return this.search(query, options);
  }

  searchRegions(query, options = {}) {
    return this.search(query, { ...options, types: ["region"] }).regions;
  }

  searchConnections(query, options = {}) {
    return this.search(query, { ...options, types: ["connection"] }).connections;
  }

  searchCircuits(query, options = {}) {
    return this.search(query, { ...options, types: ["circuit"] }).circuits;
  }

  clearCache() {
    this._cache.clear();
  }

  _remember(key, value) {
    if (this._cache.size >= 200) this._cache.delete(this._cache.keys().next().value);
    this._cache.set(key, value);
  }
}

/** One-shot search helper. Reuse ConnectomeSearch when issuing many queries. */
export function searchConnectome(graph, query, options) {
  return new ConnectomeSearch(graph).search(query, options);
}

export function createConnectomeSearch(graph) {
  return new ConnectomeSearch(graph);
}

export const buscarConectoma = searchConnectome;

function buildRegionEntry(region) {
  return createEntry("region", region, [
    field("id", region.id, 12),
    field("nombre", region.nombre, 14),
    field("nombreCompleto", region.nombreCompleto, 11),
    field("aliases", region.aliases, 10),
    field("tipo", region.tipo, 5),
    field("sistemas", region.sistemas ?? region.sistema, 7),
    field("funciones", region.funciones, 8),
    field("descripcion", region.descripcion, 3),
    field("neurotransmisores", region.neurotransmisoresRelevantes, 4),
    field("receptores", region.receptoresRelevantes, 4),
    field("patologias", region.patologiasRelacionadas, 3),
    field("tags", region.tags ?? region.etiquetas, 6)
  ]);
}

function buildConnectionEntry(connection, graph) {
  const origin = graph.getRegion(connection.origen);
  const destination = graph.getRegion(connection.destino);
  return createEntry("connection", connection, [
    field("id", connection.id, 12),
    field("nombre", connection.nombre, 14),
    field("origen", [connection.origen, origin?.nombre, origin?.nombreCompleto, origin?.aliases], 7),
    field("destino", [connection.destino, destination?.nombre, destination?.nombreCompleto, destination?.aliases], 7),
    field("tipo", connection.tipo, 5),
    field("direccion", connection.direccion, 4),
    field("tracto", connection.tractoFasciculo ?? connection.tracto ?? connection.fasciculo ?? connection.via, 9),
    field("neurotransmisor", connection.neurotransmisorPrincipal ?? connection.neurotransmisores, 6),
    field("funcion", connection.funcion ?? connection.funciones, 8),
    field("evidencia", connection.evidencia, 3),
    field("plasticidad", connection.plasticidad ?? connection.plasticity, 6),
    field("tags", connection.tags ?? connection.etiquetas, 6)
  ]);
}

function buildCircuitEntry(circuit, graph) {
  const nodeTerms = (circuit.nodos ?? []).flatMap((id) => {
    const region = graph.getRegion(id);
    return [id, region?.nombre, region?.nombreCompleto, region?.aliases];
  });
  const connectionTerms = (circuit.conexiones ?? []).flatMap((id) => {
    const connection = graph.getConnection(id);
    return [id, connection?.nombre];
  });
  return createEntry("circuit", circuit, [
    field("id", circuit.id, 12),
    field("nombre", circuit.nombre, 14),
    field("categoria", circuit.categoria, 8),
    field("descripcion", circuit.descripcion, 3),
    field("funciones", circuit.funciones, 8),
    field("nodos", nodeTerms, 4),
    field("conexiones", connectionTerms, 4),
    field("sistemas", circuit.sistemas ?? circuit.sistema, 7),
    field("tags", circuit.tags ?? circuit.etiquetas, 6)
  ]);
}

function field(name, values, weight) {
  return { name, values: flattenText(values), weight };
}

function createEntry(type, item, fields) {
  const normalizedFields = fields
    .map((current) => ({
      ...current,
      normalizedValues: current.values.map(normalizeSearchText).filter(Boolean)
    }))
    .filter((current) => current.normalizedValues.length);
  return {
    type,
    id: item.id,
    item,
    fields: normalizedFields,
    haystack: normalizedFields.flatMap((current) => current.normalizedValues).join(" ")
  };
}

function scoreEntry(entry, query, tokens, matchAllTokens) {
  if (tokens.length && matchAllTokens && !tokens.every((token) => entry.haystack.includes(token))) return null;
  if (tokens.length && !matchAllTokens && !tokens.some((token) => entry.haystack.includes(token))) return null;
  const matches = [];
  let score = 0;
  for (const current of entry.fields) {
    let fieldScore = 0;
    for (const value of current.normalizedValues) {
      if (!query) {
        fieldScore = Math.max(fieldScore, current.weight);
      } else if (value === query) {
        fieldScore = Math.max(fieldScore, current.weight * 100);
      } else if (value.startsWith(query)) {
        fieldScore = Math.max(fieldScore, current.weight * 55);
      } else if (value.includes(query)) {
        fieldScore = Math.max(fieldScore, current.weight * 32);
      } else {
        const tokenMatches = tokens.filter((token) => value.includes(token)).length;
        fieldScore = Math.max(fieldScore, tokenMatches * current.weight * 8);
      }
    }
    if (fieldScore > 0) {
      score += fieldScore;
      matches.push(current.name);
    }
  }
  if (!score) return null;
  // Prefer concise names over long descriptions at an equal textual match.
  score += Math.max(0, 20 - entry.haystack.length / 80);
  return { score, matches };
}

function createSearchResult(query, normalizedQuery, results) {
  const regions = results.filter((result) => result.type === "region");
  const connections = results.filter((result) => result.type === "connection");
  const circuits = results.filter((result) => result.type === "circuit");
  return {
    query: String(query ?? ""),
    normalizedQuery,
    total: results.length,
    results,
    all: results,
    regions,
    nodes: regions,
    connections,
    edges: connections,
    circuits,
    regionItems: regions.map((result) => result.item),
    connectionItems: connections.map((result) => result.item),
    circuitItems: circuits.map((result) => result.item)
  };
}

function cloneSearchResult(result) {
  return {
    ...result,
    results: [...result.results],
    all: [...result.all],
    regions: [...result.regions],
    nodes: [...result.nodes],
    connections: [...result.connections],
    edges: [...result.edges],
    circuits: [...result.circuits],
    regionItems: [...result.regionItems],
    connectionItems: [...result.connectionItems],
    circuitItems: [...result.circuitItems]
  };
}

function compareResults(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  const typeOrder = { region: 0, connection: 1, circuit: 2 };
  if (typeOrder[left.type] !== typeOrder[right.type]) return typeOrder[left.type] - typeOrder[right.type];
  return String(left.item.nombre ?? left.id).localeCompare(String(right.item.nombre ?? right.id), "es");
}

function flattenText(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === "object") return Object.values(value).flatMap(flattenText);
  return [String(value)];
}

function normalizeTypes(value) {
  const values = value == null ? ["region", "connection", "circuit"] : (Array.isArray(value) ? value : [value]);
  const types = new Set();
  for (const current of values) {
    const normalized = normalizeSearchText(current);
    if (["region", "regions", "region anatomica", "nodo", "nodos", "node", "nodes"].includes(normalized)) types.add("region");
    if (["connection", "connections", "conexion", "conexiones", "edge", "edges"].includes(normalized)) types.add("connection");
    if (["circuit", "circuits", "circuito", "circuitos"].includes(normalized)) types.add("circuit");
  }
  return types.size ? types : new Set(["region", "connection", "circuit"]);
}

function normalizeLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function spanishType(type) {
  return type === "region" ? "region" : type === "connection" ? "conexion" : "circuito";
}

function assertGraph(graph) {
  if (!graph?.regions || !graph?.connections || !graph?.circuits) {
    throw new TypeError("ConnectomeSearch requiere una instancia compatible de ConnectomeGraph.");
  }
}
