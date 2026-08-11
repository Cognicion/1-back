/**
 * Contrato local para una futura integracion con SOFIA. No realiza llamadas de
 * red ni permite que una respuesta externa invente nodos o conexiones: toda
 * seleccion se vuelve a resolver contra el grafo canonico.
 */
export class ConnectomeQuestionBridge {
  constructor({ graph, pathfinder, onHighlight = () => {} } = {}) {
    if (!graph) throw new Error("ConnectomeQuestionBridge requiere un grafo");
    this.graph = graph;
    this.pathfinder = pathfinder;
    this.onHighlight = onHighlight;
  }

  getContract() {
    return Object.freeze({
      version: "1.0",
      status: "local_preparado_sin_api_remota",
      intents: Object.freeze(["buscar_ruta", "estructuras_de_circuito", "conexiones_de_estructura", "seleccionar_ids"]),
      constraints: Object.freeze([
        "Solo IDs existentes en el registro local",
        "No crear conexiones desde texto generado",
        "Devolver evidencia y referencias de las entidades registradas"
      ])
    });
  }

  answer(request = {}) {
    const intent = request.intent || request.tipo;
    if (intent === "buscar_ruta") return this.route(request.origen, request.destino, request.opciones);
    if (intent === "estructuras_de_circuito") return this.circuit(request.circuitoId);
    if (intent === "conexiones_de_estructura") return this.relations(request.estructuraId);
    if (intent === "seleccionar_ids") return this.selectKnown(request.nodos, request.conexiones);
    return { ok: false, reason: "intent_no_soportado", contract: this.getContract() };
  }

  route(originId, destinationId, options = {}) {
    if (!this.graph.getNode?.(originId) || !this.graph.getNode?.(destinationId)) {
      return { ok: false, reason: "estructura_inexistente", nodeIds: [], edgeIds: [] };
    }
    const result = this.pathfinder?.findPaths?.(originId, destinationId, options)
      || this.graph.findPaths?.(originId, destinationId, options)
      || [];
    const paths = Array.isArray(result) ? result : (result.paths || []);
    const first = paths[0] || null;
    const nodeIds = first?.nodeIds || first?.nodos || [];
    const edgeIds = first?.edgeIds || first?.conexiones || [];
    if (first) this.onHighlight({ nodeIds, edgeIds, source: "question_bridge" });
    return { ok: Boolean(first), reason: first ? null : "ruta_no_registrada", paths };
  }

  circuit(circuitId) {
    const circuit = this.graph.getCircuit?.(circuitId);
    if (!circuit) return { ok: false, reason: "circuito_inexistente", nodeIds: [], edgeIds: [] };
    const nodeIds = [...(circuit.nodos || circuit.nodeIds || [])];
    const edgeIds = [...(circuit.conexiones || circuit.edgeIds || [])];
    this.onHighlight({ nodeIds, edgeIds, source: "question_bridge" });
    return { ok: true, circuit, nodeIds, edgeIds };
  }

  relations(nodeId) {
    if (!this.graph.getNode?.(nodeId)) return { ok: false, reason: "estructura_inexistente", incoming: [], outgoing: [] };
    const incoming = this.graph.incoming?.(nodeId) || this.graph.getIncoming?.(nodeId) || [];
    const outgoing = this.graph.outgoing?.(nodeId) || this.graph.getOutgoing?.(nodeId) || [];
    return { ok: true, node: this.graph.getNode(nodeId), incoming, outgoing };
  }

  selectKnown(nodeIds = [], edgeIds = []) {
    const knownNodes = (nodeIds || []).filter((id) => this.graph.getNode?.(id));
    const knownEdges = (edgeIds || []).filter((id) => this.graph.getEdge?.(id));
    this.onHighlight({ nodeIds: knownNodes, edgeIds: knownEdges, source: "question_bridge" });
    return {
      ok: knownNodes.length > 0 || knownEdges.length > 0,
      nodeIds: knownNodes,
      edgeIds: knownEdges,
      rejected: {
        nodeIds: (nodeIds || []).filter((id) => !knownNodes.includes(id)),
        edgeIds: (edgeIds || []).filter((id) => !knownEdges.includes(id))
      }
    };
  }
}
