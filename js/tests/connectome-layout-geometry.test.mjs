import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  CONNECTOME_DATA,
  MEMORY_MAP_GROUPS,
  MODULATORY_LAYERS
} from "../neurofisiologia/connectome/data/connectomeData.js";
import { ConnectomeGraph } from "../neurofisiologia/connectome/core/connectomeGraph.js";
import { ConnectomeFilters } from "../neurofisiologia/connectome/core/connectomeFilters.js";
import {
  computeConnectomeLayout,
  ConnectomeLayoutEngine
} from "../neurofisiologia/connectome/rendering/connectomeLayouts.js";
import {
  ConnectomeRenderer,
  getNodeDimensions
} from "../neurofisiologia/connectome/rendering/connectomeRenderer.js";
import {
  ConnectomeController,
  createHierarchyConnections
} from "../neurofisiologia/connectome/ui/connectomeController.js";

const graph = new ConnectomeGraph(CONNECTOME_DATA, { strict: true });
const filters = new ConnectomeFilters(graph);
const layouts = ["memoria", "flujo", "red", "radial", "jerarquico", "conceptual"];
const nodeSizeById = Object.fromEntries(graph.regionList.map((node) => {
  const { width, height } = getNodeDimensions(node);
  return [node.id, { width, height }];
}));
let passed = 0;

async function test(name, run) {
  await run();
  passed += 1;
  console.log(`\u2713 ${name}`);
}

function defaultState(overrides = {}) {
  return {
    mode: "exploracion",
    learningLevel: "basico",
    layout: "memoria",
    scale: "region",
    visibilityMode: "all",
    offFilterMode: "dim",
    selectedNodeIds: new Set(),
    selectedConnectionId: null,
    selectedCircuitId: null,
    activeMemoryGroupId: null,
    filterCriteria: {},
    filterResult: null,
    isolation: null,
    collapsedNodeIds: new Set(),
    expandedNodeIds: new Set(),
    activeLayerIds: new Set(),
    activeNetworkLayerIds: new Set(),
    activeConnectionLayerIds: new Set(),
    showAllConnections: false,
    routePaths: [],
    activeRouteIndex: 0,
    lesion: null,
    journey: null,
    comparison: null,
    showEdgeLabels: false,
    detailOpen: false,
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    leftPanelWidth: 300,
    rightPanelWidth: 360,
    mapOnly: false,
    fullscreen: false,
    maximizedFallback: false,
    minimapVisible: true,
    savedViewport: null,
    ...overrides
  };
}

function makeController(overrides = {}) {
  const controller = Object.create(ConnectomeController.prototype);
  controller.graph = graph;
  controller.filters = filters;
  controller.hierarchyConnections = createHierarchyConnections(graph);
  controller.state = defaultState(overrides);
  controller.root = {
    isConnected: false,
    querySelector: () => null,
    querySelectorAll: () => [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} }
  };
  controller.renderGraph = () => {};
  controller.renderAll = () => {};
  controller.renderDetail = () => {};
  controller.announce = () => {};
  controller.schedulePersist = () => {};
  return controller;
}

function computeLayout(layout, nodes, edges, activeCircuit = null) {
  return computeConnectomeLayout({
    nodes,
    edges,
    circuits: graph.circuitList,
    memoryGroups: MEMORY_MAP_GROUPS,
    activeCircuit,
    layout,
    layoutOptions: { nodeSizeById }
  });
}

function findNodeOverlaps(nodes, positions, tolerance = 0.5) {
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    const leftPosition = positions.get(left.id);
    const leftDimensions = getNodeDimensions(left);
    if (!leftPosition) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex];
      const rightPosition = positions.get(right.id);
      const rightDimensions = getNodeDimensions(right);
      if (!rightPosition) continue;
      const overlapX = (leftDimensions.width + rightDimensions.width) / 2 - Math.abs(leftPosition.x - rightPosition.x);
      const overlapY = (leftDimensions.height + rightDimensions.height) / 2 - Math.abs(leftPosition.y - rightPosition.y);
      if (overlapX > tolerance && overlapY > tolerance) overlaps.push([left.id, right.id, overlapX, overlapY]);
    }
  }
  return overlaps;
}

function rendererFor({ nodes, edges, positions, layout, activeCircuit = null, viewportSize }) {
  const renderer = new ConnectomeRenderer({ autoMount: false });
  renderer.nodes = nodes;
  renderer.edges = edges;
  renderer.nodeById = new Map(nodes.map((node) => [node.id, node]));
  renderer.edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  renderer.positions = new Map(positions);
  renderer.activeLayout = layout;
  renderer.activeCircuit = activeCircuit;
  renderer.viewportSize = { ...viewportSize };
  renderer.renderConfig = { nodeDimensions: {}, showEdgeLabels: false };
  return renderer;
}

function assertBoundsInsideViewport(renderer, bounds, insets, label) {
  const viewport = renderer.getViewport();
  const viewportSize = renderer.getViewportSize();
  const screen = {
    left: viewport.x + bounds.minX * viewport.scale,
    top: viewport.y + bounds.minY * viewport.scale,
    right: viewport.x + bounds.maxX * viewport.scale,
    bottom: viewport.y + bounds.maxY * viewport.scale
  };
  const epsilon = 1.25;
  assert.ok(screen.left >= insets.left - epsilon, `${label}: contenido cortado a la izquierda (${screen.left})`);
  assert.ok(screen.top >= insets.top - epsilon, `${label}: contenido cortado arriba (${screen.top})`);
  assert.ok(screen.right <= viewportSize.width - insets.right + epsilon, `${label}: contenido cortado a la derecha (${screen.right})`);
  assert.ok(screen.bottom <= viewportSize.height - insets.bottom + epsilon, `${label}: contenido cortado abajo (${screen.bottom})`);
}

await test("cada circuito seleccionado conserva todos sus nodos y atenúa solamente el contexto", () => {
  for (const circuit of graph.circuitList) {
    const controller = makeController({ selectedCircuitId: circuit.id });
    const view = controller.buildView();
    const highlights = controller.buildHighlights(view);
    const expectedNodeIds = graph.getCircuitNodeIds(circuit.id);
    const expectedConnectionIds = graph.getCircuitConnectionIds(circuit.id);
    expectedNodeIds.forEach((id) => assert.ok(view.nodeIds.has(id), `${circuit.id}: falta el nodo ${id}`));
    expectedConnectionIds.forEach((id) => assert.ok(view.connectionIds.has(id), `${circuit.id}: falta la conexion ${id}`));
    expectedNodeIds.forEach((id) => assert.ok(!highlights.dimmedNodeIds.has(id), `${circuit.id}: nodo protagonista atenuado ${id}`));
    expectedConnectionIds.forEach((id) => assert.ok(!highlights.dimmedEdgeIds.has(id), `${circuit.id}: conexion protagonista atenuada ${id}`));
    if (view.nodeIds.size > expectedNodeIds.size) assert.ok(highlights.dimmedNodeIds.size > 0, `${circuit.id}: el contexto debe atenuarse por defecto`);

    controller.state.collapsedNodeIds = new Set([...expectedNodeIds]
      .flatMap((id) => [...graph.getAncestorIds(id)]));
    const collapsedView = controller.buildView();
    expectedNodeIds.forEach((id) => assert.ok(collapsedView.nodeIds.has(id), `${circuit.id}: un padre contraido oculto al protagonista ${id}`));
  }
});

await test("Mostrar todas, circuito, relacionados y protagonistas tienen semantica estable", () => {
  const circuit = graph.circuitList.find((item) => item.id === "hipocampal_trisynaptic") || graph.circuitList[0];
  const controller = makeController({ selectedCircuitId: circuit.id });
  const allView = controller.buildView();
  controller.state.visibilityMode = "circuit";
  const circuitView = controller.buildView();
  assert.ok(circuitView.nodes.length > 0 && circuitView.nodes.length < allView.nodes.length);
  assert.ok(circuitView.nodes.every((node) => graph.getCircuitNodeIds(circuit.id).has(node.id)));
  assert.ok(circuitView.connections.every((edge) => graph.getCircuitConnectionIds(circuit.id).has(edge.id)));

  controller.state.visibilityMode = "related";
  const relatedView = controller.buildView();
  assert.ok(relatedView.nodes.length >= circuitView.nodes.length);
  assert.ok(relatedView.nodes.length <= allView.nodes.length);

  controller.state.visibilityMode = "protagonists";
  const protagonistView = controller.buildView();
  assert.ok(protagonistView.nodes.length > 0 && protagonistView.nodes.length <= circuitView.nodes.length);

  controller.state.visibilityMode = "all";
  const restoredAllView = controller.buildView();
  assert.deepEqual([...restoredAllView.nodeIds].sort(), [...allView.nodeIds].sort());
  assert.deepEqual([...restoredAllView.connectionIds].sort(), [...allView.connectionIds].sort());
});

await test("filtros atenúan por defecto, mostrar normal restaura y ocultar es explícito", () => {
  const filterResult = filters.filter({ systems: "memoria_episodica" });
  assert.equal(filterResult.active, true);
  const dimController = makeController({ filterResult, filterCriteria: { systems: "memoria_episodica" } });
  const unfilteredView = makeController().buildView();
  const dimView = dimController.buildView();
  const dimHighlights = dimController.buildHighlights(dimView);
  unfilteredView.nodeIds.forEach((id) => assert.ok(dimView.nodeIds.has(id), `atenuar retiro accidentalmente ${id}`));
  unfilteredView.connectionIds.forEach((id) => assert.ok(dimView.connectionIds.has(id), `atenuar retiro accidentalmente ${id}`));
  assert.ok(dimHighlights.dimmedNodeIds.size > 0);

  dimController.state.offFilterMode = "normal";
  const normalHighlights = dimController.buildHighlights(dimController.buildView());
  assert.equal(normalHighlights.dimmedNodeIds.size, 0);
  assert.equal(normalHighlights.dimmedEdgeIds.size, 0);

  dimController.state.offFilterMode = "hide";
  const hiddenView = dimController.buildView();
  assert.ok(hiddenView.nodes.length < unfilteredView.nodes.length, "ocultar debe reducir la vista de forma solicitada");
  assert.equal(graph.regionList.length, CONNECTOME_DATA.regiones.length, "ningun filtro puede mutar el registro canonico");
  assert.equal(graph.connectionList.length, CONNECTOME_DATA.conexiones.length, "ningun filtro puede mutar las conexiones canonicas");
});

await test("capas moduladoras, funcionales y neuroquimicas solo añaden IDs registrados", () => {
  const baseView = makeController().buildView();
  for (const layer of MODULATORY_LAYERS) {
    const view = makeController({ activeLayerIds: new Set([layer.id]) }).buildView();
    layer.conexiones.forEach((id) => assert.ok(view.connectionIds.has(id), `${layer.id}: falta ${id}`));
    view.connections.forEach((edge) => assert.ok(graph.hasConnection(edge.id) || edge.renderOnly, `${layer.id}: conexion inventada ${edge.id}`));
  }
  for (const layer of CONNECTOME_DATA.redesFuncionales || []) {
    const view = makeController({ activeNetworkLayerIds: new Set([layer.id]) }).buildView();
    layer.nodos.forEach((id) => assert.ok(view.nodeIds.has(id), `${layer.id}: falta ${id}`));
    layer.conexiones.forEach((id) => assert.ok(view.connectionIds.has(id), `${layer.id}: falta ${id}`));
  }
  const chemistryController = makeController({ activeConnectionLayerIds: new Set(["dopamina"]) });
  const chemistryIds = chemistryController.getChemistryConnectionIds();
  assert.ok(chemistryIds.size > 0);
  const chemistryView = chemistryController.buildView();
  chemistryIds.forEach((id) => assert.ok(chemistryView.connectionIds.has(id), `capa dopaminergica: falta ${id}`));

  const unspecifiedController = makeController({ activeConnectionLayerIds: new Set(["no_especificada"]) });
  const unspecifiedIds = unspecifiedController.getChemistryConnectionIds();
  assert.ok(unspecifiedIds.size > 0, "la capa no especificada debe tener coincidencias reales");
  assert.ok(unspecifiedIds.size < graph.connectionList.length, "la capa no especificada no puede equivaler a todas las conexiones");
  unspecifiedIds.forEach((id) => {
    const edge = graph.getConnection(id);
    const transmitter = String(edge?.neurotransmisorPrincipal || "").toLowerCase();
    assert.ok(!transmitter.includes("glutamato") && !transmitter.includes("dopamina"), `no_especificada incluyo una conexion quimicamente declarada: ${id}`);
    assert.notEqual(edge?.claseEntidad, "relacion_funcional", `no_especificada incluyo una relacion funcional: ${id}`);
    assert.notEqual(transmitter, "no_aplica", `no_especificada incluyo metadata no aplicable: ${id}`);
    assert.ok(!transmitter || transmitter.includes("no_especificad"), `no_especificada incluyo un transmisor dominante: ${id} (${transmitter})`);
  });
  const restoredBase = makeController().buildView();
  assert.deepEqual([...restoredBase.connectionIds].sort(), [...baseView.connectionIds].sort());
});

await test("contraer, expandir un padre y Expandir todo preservan jerarquia e IDs unicos", () => {
  const parent = graph.regionList.find((node) => graph.getChildren(node.id).length && graph.getDescendantIds(node.id).size > 1);
  assert.ok(parent, "se requiere al menos una region jerarquica");
  const descendants = graph.getDescendantIds(parent.id);
  const controller = makeController({ scale: "subcampo", collapsedNodeIds: new Set([parent.id]) });
  const collapsedView = controller.buildView();
  descendants.forEach((id) => assert.ok(!collapsedView.nodeIds.has(id), `${parent.id}: descendiente visible al contraer ${id}`));
  assert.ok(collapsedView.nodeIds.has(parent.id));

  controller.toggleNodeExpansion(parent.id);
  const expandedParentView = controller.buildView();
  assert.ok([...descendants].some((id) => expandedParentView.nodeIds.has(id)), "expandir el padre debe recuperar subestructuras");

  controller.expandAll();
  const fullyExpandedView = controller.buildView();
  assert.equal(new Set(fullyExpandedView.nodes.map((node) => node.id)).size, fullyExpandedView.nodes.length);
  graph.regionList.forEach((node) => assert.ok(fullyExpandedView.nodeIds.has(node.id), `Expandir todo omite ${node.id}`));
});

await test("los seis layouts expandidos evitan solapamientos de cajas anatomicas", () => {
  const controller = makeController({ scale: "subcampo" });
  controller.expandAll();
  const view = controller.buildView();
  for (const layout of layouts) {
    const result = computeLayout(layout, view.nodes, view.connections);
    const overlaps = findNodeOverlaps(view.nodes, result.positions);
    assert.deepEqual(overlaps, [], `${layout}: nodos superpuestos ${JSON.stringify(overlaps.slice(0, 5))}`);
  }
});

await test("Encajar todo contiene nodos y curvas en escritorio, tableta y movil", () => {
  const controller = makeController({ scale: "subcampo" });
  controller.expandAll();
  const view = controller.buildView();
  const sizes = [
    { name: "desktop", width: 1280, height: 720 },
    { name: "tablet", width: 900, height: 600 },
    { name: "mobile", width: 390, height: 600 }
  ];
  const insets = { top: 32, right: 32, bottom: 32, left: 32 };
  for (const layout of layouts) {
    const result = computeLayout(layout, view.nodes, view.connections);
    for (const size of sizes) {
      const renderer = rendererFor({ nodes: view.nodes, edges: view.connections, positions: result.positions, layout, viewportSize: size });
      renderer.fit({ scope: "all", allowTinyScale: true, insets, animate: false });
      const bounds = renderer.getContentBounds({ scope: "all" });
      assertBoundsInsideViewport(renderer, bounds, insets, `${layout}/${size.name}`);
    }
  }
});

await test("encajar un circuito mantiene todos sus integrantes dentro del viewport", () => {
  const sizes = [
    { name: "desktop", width: 1280, height: 720 },
    { name: "mobile", width: 390, height: 600 }
  ];
  const insets = { top: 24, right: 24, bottom: 24, left: 24 };
  for (const circuit of graph.circuitList) {
    const controller = makeController({ selectedCircuitId: circuit.id, layout: "flujo" });
    const view = controller.buildView();
    const result = computeLayout("flujo", view.nodes, view.connections, circuit);
    const nodeIds = graph.getCircuitNodeIds(circuit.id);
    const edgeIds = graph.getCircuitConnectionIds(circuit.id);
    for (const size of sizes) {
      const renderer = rendererFor({ nodes: view.nodes, edges: view.connections, positions: result.positions, layout: "flujo", activeCircuit: circuit, viewportSize: size });
      renderer.fit({ scope: "relevant", nodeIds, edgeIds, ignoreDimmed: false, allowTinyScale: true, insets, animate: false });
      const bounds = renderer.getContentBounds({ nodeIds, edgeIds, activeCircuit: false, ignoreDimmed: false });
      assertBoundsInsideViewport(renderer, bounds, insets, `${circuit.id}/${size.name}`);
    }
  }
});

await test("persistencia serializa Sets, restaura IDs validos y limita anchos", () => {
  const source = makeController({
    selectedNodeIds: new Set(["ca1"]),
    selectedCircuitId: graph.hasCircuit("papez") ? "papez" : graph.circuitList[0].id,
    collapsedNodeIds: new Set(["hipocampo"]),
    activeLayerIds: new Set([MODULATORY_LAYERS[0].id]),
    activeNetworkLayerIds: new Set([(CONNECTOME_DATA.redesFuncionales || [])[0]?.id].filter(Boolean)),
    activeConnectionLayerIds: new Set(["glutamato"]),
    leftPanelWidth: 410,
    rightPanelWidth: 480,
    mapOnly: true,
    fullscreen: true,
    showEdgeLabels: true,
    savedViewport: { x: 12, y: 34, scale: 0.7 }
  });
  source.renderer = { getViewport: () => ({ x: 12, y: 34, scale: 0.7 }) };
  const snapshot = source.serializeViewState();
  assert.ok(Array.isArray(snapshot.selectedNodeIds));
  assert.ok(Array.isArray(snapshot.activeLayerIds));
  assert.deepEqual(snapshot.viewport, { x: 12, y: 34, scale: 0.7 });
  assert.equal(snapshot.fullscreen, true);
  assert.equal(snapshot.showEdgeLabels, true);

  const restored = makeController();
  restored.restoreSessionState({
    ...snapshot,
    selectedNodeIds: ["ca1", "estructura_inexistente"],
    collapsedNodeIds: ["hipocampo", "estructura_inexistente"],
    leftPanelWidth: -1000,
    rightPanelWidth: 99999
  });
  assert.deepEqual([...restored.state.selectedNodeIds], ["ca1"]);
  assert.deepEqual([...restored.state.collapsedNodeIds], ["hipocampo"]);
  assert.ok(restored.state.leftPanelWidth >= 200 && restored.state.leftPanelWidth < 300);
  assert.ok(restored.state.rightPanelWidth > 300 && restored.state.rightPanelWidth <= 700);
  assert.equal(restored.state.mapOnly, true);
  assert.equal(restored.state.fullscreen, true);
  assert.equal(restored.state.maximizedFallback, true);
  assert.equal(restored.state.showEdgeLabels, true);
  assert.deepEqual(restored.state.savedViewport, { x: 12, y: 34, scale: 0.7 });
});

await test("layout expandido mantiene un presupuesto temporal y cache acotado", () => {
  const controller = makeController({ scale: "subcampo" });
  controller.expandAll();
  const view = controller.buildView();
  const timings = [];
  for (const layout of layouts) {
    const started = performance.now();
    const result = computeLayout(layout, view.nodes, view.connections);
    timings.push(performance.now() - started);
    assert.equal(result.positions.size, view.nodes.length);
  }
  assert.ok(Math.max(...timings) < 500, `layout expandido demasiado lento: ${JSON.stringify(timings)}`);

  const engine = new ConnectomeLayoutEngine({ maxEntries: 4 });
  const config = { nodes: view.nodes, edges: view.connections, circuits: graph.circuitList, layout: "memoria", layoutOptions: { nodeSizeById } };
  engine.compute(config);
  const started = performance.now();
  for (let index = 0; index < 30; index += 1) engine.compute(config);
  const averageCached = (performance.now() - started) / 30;
  assert.ok(averageCached < 50, `cache de layout demasiado lenta: ${averageCached.toFixed(2)} ms`);
  assert.ok(engine.size <= 4);
});

console.log(`\n${passed} pruebas puras de geometria/estado v3 superadas.`);
