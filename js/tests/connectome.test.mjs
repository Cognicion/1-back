import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONNECTOME_DATA, MEMORY_MAP_GROUPS, MODULATORY_LAYERS } from "../neurofisiologia/connectome/data/connectomeData.js";
import { ConnectomeGraph } from "../neurofisiologia/connectome/core/connectomeGraph.js";
import { ConnectomeSearch } from "../neurofisiologia/connectome/core/connectomeSearch.js";
import { ConnectomeFilters } from "../neurofisiologia/connectome/core/connectomeFilters.js";
import { ConnectomePathfinder } from "../neurofisiologia/connectome/core/connectomePathfinder.js";
import { ConnectomeAnalysis } from "../neurofisiologia/connectome/core/connectomeAnalysis.js";
import { computeConnectomeLayout } from "../neurofisiologia/connectome/rendering/connectomeLayouts.js";
import { ConnectomeRenderer, getConnectionPolarity } from "../neurofisiologia/connectome/rendering/connectomeRenderer.js";
import { GuidedTourPlayer, circuitTextAlternative } from "../neurofisiologia/connectome/ui/connectomeEducation.js";
import {
  ConnectomeController,
  createHierarchyConnections,
  getContextMenuActions
} from "../neurofisiologia/connectome/ui/connectomeController.js";
import { ConnectomeQuestionBridge } from "../neurofisiologia/connectome/integration/connectomeQuestionBridge.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const graph = new ConnectomeGraph(CONNECTOME_DATA, { strict: true });
const search = new ConnectomeSearch(graph);
const filters = new ConnectomeFilters(graph);
const pathfinder = new ConnectomePathfinder(graph);
const analysis = new ConnectomeAnalysis(graph);
let passed = 0;

async function test(name, run) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

function assertUnique(items, label) {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: hay IDs duplicados`);
  assert.ok(ids.every(Boolean), `${label}: todos los IDs deben ser estables`);
}

await test("registro unico y validacion referencial estricta", () => {
  assertUnique(CONNECTOME_DATA.regiones, "regiones");
  assertUnique(CONNECTOME_DATA.conexiones, "conexiones");
  assertUnique(CONNECTOME_DATA.circuitos, "circuitos");
  assertUnique(CONNECTOME_DATA.referencias, "referencias");
  assertUnique(CONNECTOME_DATA.recorridos, "recorridos");
  const report = graph.validate();
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(
    { nodes: graph.regionList.length, edges: graph.connectionList.length, circuits: graph.circuitList.length },
    { nodes: 58, edges: 69, circuits: 9 }
  );
});

await test("la evidencia no infiere polaridad, neurotransmisores, especies ni metodos", async () => {
  const connectionSource = await readFile(resolve(projectRoot, "js/neurofisiologia/connectome/data/brainConnections.js"), "utf8");
  const defaultBlock = connectionSource.slice(0, connectionSource.indexOf("function connection"));
  assert.match(defaultBlock, /polaridad:\s*"no_especificada"/);
  assert.match(defaultBlock, /neurotransmisorPrincipal:\s*"no_especificado"/);
  assert.doesNotMatch(defaultBlock, /predominantemente_excitatoria|"glutamato"/);
  assert.equal(getConnectionPolarity({ polaridad: "no_especificada" }), "mixed");
  const functionalRelations = CONNECTOME_DATA.conexiones.filter((edge) => edge.claseEntidad === "relacion_funcional");
  assert.equal(functionalRelations.length, 4);
  functionalRelations.forEach((edge) => {
    assert.equal(edge.polaridad, "no_aplica", `${edge.id}: una relacion funcional no declara polaridad sinaptica`);
    assert.equal(edge.neurotransmisorPrincipal, "no_aplica", `${edge.id}: una relacion funcional no declara neurotransmisor`);
    assert.equal(getConnectionPolarity(edge), "mixed", `${edge.id}: el renderer no debe dibujarla como excitatoria`);
  });

  const unspecifiedConnections = CONNECTOME_DATA.conexiones.filter((edge) => edge.evidencia === "no_especificada");
  assert.equal(unspecifiedConnections.length, 43);
  unspecifiedConnections.forEach((edge) => {
    assert.deepEqual(edge.especies, [], `${edge.id}: no inferir especies desde una referencia general`);
    assert.deepEqual(edge.tiposEvidencia, [], `${edge.id}: no inferir metodos desde una referencia general`);
  });

  const establishedConnections = CONNECTOME_DATA.conexiones.filter((edge) => edge.evidencia === "establecida");
  assert.equal(establishedConnections.length, 3);
  establishedConnections.forEach((edge) => {
    assert.ok(edge.especies.length > 0, `${edge.id}: falta la base comparada declarada`);
    assert.ok(edge.tiposEvidencia.length > 0, `${edge.id}: faltan metodos declarados`);
  });

  CONNECTOME_DATA.conexiones.forEach((edge) => {
    const functionText = String(edge.funcion || "").toLowerCase();
    if (edge.claseEntidad !== "senal_moduladora" && /glutamaterg|excitatorio/.test(functionText)) {
      assert.equal(edge.neurotransmisorPrincipal.toLowerCase(), "glutamato", `${edge.id}: prosa y neurotransmisor divergen`);
      assert.equal(edge.polaridad, "predominantemente_excitatoria", `${edge.id}: prosa y polaridad divergen`);
    }
    if (edge.claseEntidad !== "senal_moduladora" && /proyeccion inhibitoria|salida inhibitoria/.test(functionText)) {
      assert.equal(edge.neurotransmisorPrincipal.toUpperCase(), "GABA", `${edge.id}: prosa y neurotransmisor divergen`);
      assert.equal(edge.polaridad, "predominantemente_inhibitoria", `${edge.id}: prosa y polaridad divergen`);
    }
  });
});

await test("cobertura inicial solicitada de memoria y aprendizaje", () => {
  const requiredNodes = [
    "formacion_hipocampal", "corteza_entorrinal", "corteza_perirrinal", "corteza_parahipocampal",
    "giro_dentado", "ca3", "ca1", "subiculo", "fornix", "cuerpos_mamilares",
    "nucleos_anteriores_talamo", "giro_cingulado", "corteza_retrosplenial", "corteza_prefrontal",
    "amigdala", "estriado", "vta", "nucleo_accumbens", "talamo", "nucleo_mediodorsal_talamo"
  ];
  const requiredCircuits = [
    "hipocampal_trisynaptic", "papez", "episodic_memory", "working_memory",
    "emotional_memory", "procedural_learning", "reward_learning"
  ];
  requiredNodes.forEach((id) => assert.ok(graph.hasNode(id), `falta ${id}`));
  requiredCircuits.forEach((id) => assert.ok(graph.hasCircuit(id), `falta ${id}`));
  assert.ok(graph.hasCircuit("semantic_memory"));
  assert.ok(graph.hasCircuit("spatial_navigation"));
});

await test("circuitos y recorridos reutilizan IDs, no objetos anatomicos", () => {
  for (const circuit of CONNECTOME_DATA.circuitos) {
    assert.ok(circuit.nodos.every((id) => typeof id === "string" && graph.hasNode(id)));
    assert.ok(circuit.conexiones.every((id) => typeof id === "string" && graph.hasConnection(id)));
  }
  for (const tour of CONNECTOME_DATA.recorridos) {
    assert.ok(graph.hasCircuit(tour.circuitoId));
    for (const step of tour.pasos) {
      assert.ok(graph.hasNode(step.nodeId), `${tour.id}: nodo inexistente ${step.nodeId}`);
      if (step.connectionId) assert.ok(graph.hasConnection(step.connectionId), `${tour.id}: conexion inexistente ${step.connectionId}`);
    }
  }
  const schafferMemberships = graph.getCircuitMembershipsForConnection("colaterales_schaffer_ca3_ca1");
  assert.ok(schafferMemberships.length >= 5);
});

await test("jerarquia anatomica expandible y contraible", () => {
  assert.equal(graph.getParent("ca1").id, "hipocampo");
  assert.ok(graph.getDescendantIds("formacion_hipocampal").has("giro_dentado"));
  assert.ok(graph.getDescendantIds("formacion_hipocampal").has("ca1"));
  assert.ok(graph.getAncestorIds("ca1").has("brain"));
  assert.ok(graph.getChildren("hipocampo").some((node) => node.id === "ca3"));
  const expectedAnatomicalTypes = new Map([
    ["vta", ["region", "region"]],
    ["sustancia_negra_compacta", ["nucleo", "nucleo"]],
    ["septum_medial", ["nucleo", "nucleo"]],
    ["nucleo_basal_meynert", ["nucleo", "nucleo"]],
    ["sustancia_gris_periacueductal", ["region", "region"]]
  ]);
  expectedAnatomicalTypes.forEach(([tipo, nivel], id) => {
    assert.equal(graph.getNode(id).tipo, tipo, `${id}: tipo anatomico incorrecto`);
    assert.equal(graph.getNode(id).nivelAnatomico, nivel, `${id}: nivel anatomico incorrecto`);
  });
});

await test("busqueda sin acentos sobre IDs, alias, vias, funciones y circuitos", () => {
  assert.equal(search.search("CA1").results[0].id, "ca1");
  assert.ok(search.search("Cornu Ammonis 1").regionItems.some((item) => item.id === "ca1"));
  assert.ok(search.search("Schaffer").connectionItems.some((item) => item.id === "colaterales_schaffer_ca3_ca1"));
  assert.ok(search.search("separacion de patrones").regionItems.some((item) => item.id === "giro_dentado"));
  assert.ok(search.search("Papez").circuitItems.some((item) => item.id === "papez"));
  const tractMatch = search.search("fimbria-fornix").results.find((item) => item.id === "subiculo_fornix");
  assert.ok(tractMatch?.matches.includes("tracto"), "tractoFasciculo debe indexarse como tracto");
});

await test("fondo limpia seleccion y el menu contextual solo ofrece acciones validas", () => {
  const controller = Object.create(ConnectomeController.prototype);
  controller.state = {
    selectedNodeIds: new Set(["ca1"]),
    selectedConnectionId: "colaterales_schaffer_ca3_ca1",
    detailOpen: true
  };
  let hidden = 0;
  let rendered = 0;
  controller.hideTransientUi = () => { hidden += 1; };
  controller.renderAll = () => { rendered += 1; };
  controller.clearEntitySelection();
  assert.deepEqual([...controller.state.selectedNodeIds], []);
  assert.equal(controller.state.selectedConnectionId, null);
  assert.equal(controller.state.detailOpen, false);
  assert.equal(hidden, 1);
  assert.equal(rendered, 1);

  const nodeActions = getContextMenuActions("node").map((item) => item.action);
  const edgeActions = getContextMenuActions("edge").map((item) => item.action);
  assert.ok(nodeActions.includes("context-isolate") && nodeActions.includes("context-center"));
  assert.ok(!edgeActions.includes("context-isolate") && !edgeActions.includes("context-center"));
  assert.deepEqual(edgeActions, ["context-connections", "context-follow", "context-lesion"]);
});

await test("filtros producen resaltado y atenuacion sin borrar el registro", () => {
  const episodic = filters.apply({ system: "memoria_episodica" });
  assert.equal(episodic.active, true);
  assert.ok(episodic.matchedNodeIds.has("ca1"));
  assert.ok(episodic.dimmedNodeIds.size > 0);
  const dopamine = filters.apply({ neurotransmitter: "dopamina" });
  assert.ok(dopamine.matchedConnectionIds.has("vta_accumbens_dopamina"));
  const plasticity = filters.apply({ plasticity: true });
  assert.ok(plasticity.matchedConnectionIds.has("colaterales_schaffer_ca3_ca1"));
  assert.equal(graph.connectionList.length, 69);
});

await test("las escalas y capas explicitas nunca producen vistas engañosas", () => {
  const build = (overrides = {}) => {
    const controller = Object.create(ConnectomeController.prototype);
    controller.graph = graph;
    controller.hierarchyConnections = createHierarchyConnections(graph);
    controller.state = {
      activeLayerIds: new Set(), selectedCircuitId: null, filterResult: null, isolation: null,
      journey: null, selectedConnectionId: null, selectedNodeIds: new Set(), collapsedNodeIds: new Set(),
      scale: "circuito", layout: "memoria", ...overrides
    };
    return controller.buildView();
  };

  const systemView = build({ scale: "sistema" });
  assert.ok(systemView.nodes.length > 0, "la escala Sistema no puede quedar vacia");
  assert.ok(systemView.connections.length > 0, "la escala Sistema debe materializar regionPadre sin crear una proyeccion anatomica");
  assert.ok(systemView.connections.every((edge) => edge.renderOnly && edge.claseEntidad === "jerarquia_anatomica"));
  assert.ok(systemView.nodes.every((node) => ConnectomeController.prototype.nodeDepth.call({ graph }, node) <= 2));

  const synapseView = build({ scale: "sinapsis" });
  assert.ok(synapseView.connections.length > 0, "la escala sinaptica requiere conexiones declaradas");
  assert.ok(synapseView.connections.every((edge) => edge.plasticidad));

  const dopamineResult = filters.filter({ neurotransmitters: "dopamina" });
  const dopamineView = build({ filterResult: dopamineResult });
  const expectedDopamineEdges = graph.connectionList.filter((edge) => edge.neurotransmisorPrincipal === "dopamina");
  expectedDopamineEdges.forEach((edge) => assert.ok(dopamineView.connectionIds.has(edge.id), edge.id));

  const vtaIsolation = analysis.isolateNode("vta", { depth: 1, direction: "both" });
  const isolatedView = build({ isolation: vtaIsolation, selectedNodeIds: new Set(["vta"]) });
  [...vtaIsolation.connectionIds].forEach((id) => assert.ok(isolatedView.connectionIds.has(id), id));
});

await test("seguir una conexion elige un circuito registrado", () => {
  let startedTour = null;
  const controller = Object.create(ConnectomeController.prototype);
  controller.graph = graph;
  controller.state = { selectedCircuitId: null, selectedConnectionId: "colaterales_schaffer_ca3_ca1", activeMemoryGroupId: null, layout: "memoria" };
  controller.root = {
    querySelector: () => ({ value: "" }),
    querySelectorAll: () => []
  };
  controller.tourPlayer = { start: (id) => { startedTour = id; } };
  controller.renderAll = () => {};
  controller.announce = () => {};
  controller.followSelectedCircuit();
  assert.equal(controller.state.selectedCircuitId, "hipocampal_trisynaptic");
  assert.equal(startedTour, "circuito_hipocampal_paso_a_paso");
});

await test("pathfinder dirigido usa exclusivamente conexiones registradas", () => {
  const paths = pathfinder.findPaths("corteza_entorrinal", "ca1", { maxDepth: 5, maxPaths: 8 });
  assert.ok(paths.length > 0);
  paths.forEach((path) => {
    path.nodeIds.forEach((id) => assert.ok(graph.hasNode(id)));
    path.connectionIds.forEach((id) => assert.ok(graph.hasConnection(id)));
  });
  const trisynaptic = pathfinder.findShortestPath("corteza_entorrinal", "ca1", {
    circuitId: "hipocampal_trisynaptic",
    allowedConnectionIds: new Set(["via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1"])
  });
  assert.deepEqual(trisynaptic.nodeIds, ["corteza_entorrinal", "giro_dentado", "ca3", "ca1"]);
  assert.deepEqual(trisynaptic.connectionIds, ["via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1"]);
  assert.equal(pathfinder.findPaths("sustancia_gris_periacueductal", "corteza_entorrinal", { maxDepth: 4 }).length, 0);
});

await test("pathfinder anatomico puede excluir relaciones funcionales", () => {
  const anatomicalIds = new Set(graph.connectionList.filter((edge) => edge.claseEntidad !== "relacion_funcional").map((edge) => edge.id));
  const path = pathfinder.findPaths("corteza_cingulada_posterior", "corteza_prefrontal_medial", {
    maxDepth: 3,
    allowedConnectionIds: anatomicalIds
  });
  assert.equal(path.length, 0);
});

await test("aislamiento, comparacion y lesiones analizan el grafo", () => {
  const isolatedNode = analysis.isolateNode("ca1");
  assert.ok(isolatedNode.nodeIds.has("ca1"));
  assert.ok(isolatedNode.connectionIds.has("colaterales_schaffer_ca3_ca1"));
  const isolatedCircuit = analysis.isolateCircuit("papez");
  assert.deepEqual(isolatedCircuit.nodeIds, graph.getCircuitNodeIds("papez"));
  const comparison = analysis.compareCircuits("episodic_memory", "semantic_memory");
  assert.ok(comparison.sharedNodeIds.has("ca1"));
  assert.ok(comparison.sharedConnectionIds.has("via_perforante_ec_dg"));
  const edgeLesion = analysis.simulateConnectionLesion("colaterales_schaffer_ca3_ca1");
  assert.ok(edgeLesion.excludedConnectionIds.has("colaterales_schaffer_ca3_ca1"));
  assert.ok(edgeLesion.affectedCircuitIds.has("hipocampal_trisynaptic"));
  const nodeLesion = analysis.simulateNodeLesion("fornix");
  assert.ok(nodeLesion.excludedNodeIds.has("fornix"));
  assert.ok(nodeLesion.affectedCircuitIds.has("papez"));
  assert.equal(edgeLesion.educationalOnly, true);
});

await test("seis layouts calculan posiciones finitas solo al cambiar estructura", () => {
  const circuit = graph.getCircuit("hipocampal_trisynaptic");
  for (const layout of ["memoria", "flujo", "red", "radial", "jerarquico", "conceptual"]) {
    const result = computeConnectomeLayout({
      nodes: graph.regionList,
      edges: graph.connectionList,
      circuits: graph.circuitList,
      activeCircuit: circuit,
      layout
    });
    assert.equal(result.positions.size, graph.regionList.length, layout);
    result.positions.forEach(({ x, y }) => assert.ok(Number.isFinite(x) && Number.isFinite(y), layout));
    assert.ok(result.bounds.width > 0 && result.bounds.height > 0, layout);
  }
});

await test("renderer reutiliza el SVG solo con geometria y contenido invariantes", () => {
  const node = graph.getNode("ca1");
  const edge = graph.getConnection("colaterales_schaffer_ca3_ca1");
  const renderer = new ConnectomeRenderer({ autoMount: false });
  renderer.nodes = [node];
  renderer.edges = [edge];
  renderer.positions = new Map([[node.id, { x: 10, y: 20 }]]);
  renderer.activeLayout = "red";
  renderer.renderConfig = { showEdgeLabels: "auto", showClusters: true };
  renderer.layoutResult = { clusters: [] };

  const signature = renderer._createGraphRenderSignature();
  renderer._graphRenderSignature = signature;
  renderer.layers = { nodes: {}, edges: {}, clusters: {}, overlays: {} };
  renderer.nodeElements.set(node.id, {});
  renderer.edgeElements.set(edge.id, {});
  assert.equal(renderer._canReuseRenderedGraph(signature), true);

  renderer.highlights.selectedNodeIds.add(node.id);
  assert.equal(renderer._createGraphRenderSignature(), signature);
  renderer.positions.set(node.id, { x: 11, y: 20 });
  assert.notEqual(renderer._createGraphRenderSignature(), signature);
  renderer.positions.set(node.id, { x: 10, y: 20 });
  renderer.renderConfig.showEdgeLabels = "always";
  assert.notEqual(renderer._createGraphRenderSignature(), signature);
  renderer.renderConfig.showEdgeLabels = "auto";
  renderer.nodes = [{ ...node }];
  assert.notEqual(renderer._createGraphRenderSignature(), signature);
});

await test("recorridos soportan anterior, siguiente, pausa y movimiento reducido", () => {
  const steps = [];
  const player = new GuidedTourPlayer({ tours: CONNECTOME_DATA.recorridos, reducedMotion: true, onStep: (step) => steps.push(step?.nodeId) });
  const start = player.start("circuito_hipocampal_paso_a_paso", { autoplay: true });
  assert.equal(start.playing, false);
  assert.equal(start.index, 0);
  assert.equal(player.next().index, 1);
  assert.equal(player.previous().index, 0);
  assert.ok(steps.includes("corteza_entorrinal"));
  player.stop();
});

await test("alternativa textual, capas y mapa de memoria tienen referencias validas", () => {
  assert.match(circuitTextAlternative(graph.getCircuit("hipocampal_trisynaptic"), graph), /CA3.*CA1/);
  MEMORY_MAP_GROUPS.flatMap((group) => group.circuitos).forEach((id) => assert.ok(graph.hasCircuit(id)));
  MODULATORY_LAYERS.forEach((layer) => {
    layer.nodos.forEach((id) => assert.ok(graph.hasNode(id)));
    layer.conexiones.forEach((id) => assert.ok(graph.hasConnection(id)));
  });
  const dopamineLayer = MODULATORY_LAYERS.find((layer) => layer.id === "dopamina");
  const cholinergicLayer = MODULATORY_LAYERS.find((layer) => layer.id === "acetilcolina");
  ["vta", "sustancia_negra_compacta"].forEach((id) => assert.ok(dopamineLayer.nodos.includes(id), `${id}: falta en capa dopaminergica`));
  ["septum_medial", "nucleo_basal_meynert"].forEach((id) => assert.ok(cholinergicLayer.nodos.includes(id), `${id}: falta en capa colinergica`));
});

await test("puente de preguntas rechaza IDs inventados", () => {
  const bridge = new ConnectomeQuestionBridge({ graph, pathfinder });
  assert.ok(bridge.getContract().version);
  assert.deepEqual(
    bridge.route("ca1", "estructura_inventada"),
    { ok: false, reason: "estructura_inexistente", nodeIds: [], edgeIds: [] }
  );
});

await test("integracion es lazy, accesible, versionada y sin datos anatomicos en HTML", async () => {
  const [html, entry, css, version] = await Promise.all([
    readFile(resolve(projectRoot, "laboratorio-neurofisiologia.html"), "utf8"),
    readFile(resolve(projectRoot, "js/neurofisiologia/laboratorio-neurofisiologia.js"), "utf8"),
    readFile(resolve(projectRoot, "css/neurofisiologia-connectome.css"), "utf8"),
    readFile(resolve(projectRoot, "js/config/appVersion.js"), "utf8")
  ]);
  assert.match(html, /data-tab="mapa-circuitos"/);
  assert.match(html, /id="connectomeApp"/);
  assert.match(html, /role="tablist"/);
  assert.doesNotMatch(html, /neurofisiologia-connectome\.css/);
  assert.doesNotMatch(html, /colaterales_schaffer_ca3_ca1/);
  assert.match(entry, /import\(`\.\/connectome\/ui\/connectomeController\.js\?v=\$\{CONNECTOME_BUILD\}`\)/);
  assert.doesNotMatch(entry, /^import .*connectomeController/m);
  assert.match(entry, /aria-selected/);
  assert.match(entry, /ArrowRight/);
  assert.match(css, /html\[data-theme="light"\] \.connectome-module/);
  assert.match(css, /--connectome-bg:/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media[^{}]*max-width:\s*720px/);
  assert.match(version, /APP_VERSION\s*=\s*"1\.80"/);
});

console.log(`\n${passed} pruebas de connectome superadas.`);
