import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  launchChromeHarness,
  QA_FULLSCREEN_STUB_SCRIPT
} from "./helpers/chrome-cdp.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pagePath = "/laboratorio-neurofisiologia.html";
const expectedCounts = Object.freeze({ regions: 99, connections: 130, circuits: 12 });
const failures = [];
let passed = 0;

async function test(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`\u2713 ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`\u2717 ${name}\n${error?.stack || error}`);
  }
}

const browser = await launchChromeHarness({
  rootDirectory: projectRoot,
  initScripts: [QA_FULLSCREEN_STUB_SCRIPT],
  viewport: { width: 1440, height: 900 }
});

async function frames(count = 3) {
  await browser.evaluate(`new Promise((resolve) => {
    let remaining = ${Math.max(1, count)};
    const next = () => { remaining -= 1; remaining > 0 ? requestAnimationFrame(next) : resolve(); };
    requestAnimationFrame(next);
  })`);
}

async function mountFresh({ width = 1440, height = 900, mobile = false, clearSession = true } = {}) {
  await browser.setViewport(width, height, { mobile });
  await browser.navigate(pagePath);
  if (clearSession) await browser.evaluate("sessionStorage.clear()");
  const before = await browser.evaluate(`({
    activeTab: document.querySelector('.tabs-lab [aria-selected="true"]')?.dataset.tab,
    connectomeResources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/connectome/')).length,
    otherPanels: ['integrada', 'membrana', 'accion', 'axon', 'tec', 'atlas-cerebral', 'experimentos', 'resultados', 'teoria']
      .every((id) => document.getElementById('tab-' + id)),
    placeholder: Boolean(document.querySelector('#connectomeApp .connectome-lazy-placeholder'))
  })`);
  await browser.evaluate(`(() => {
    globalThis.__qaMountStarted = performance.now();
    document.querySelector('[data-tab="mapa-circuitos"]')?.click();
  })()`);
  await browser.waitForFunction("document.querySelector('#connectomeApp')?.dataset.state === 'ready'", { timeoutMs: 25000 });
  await browser.evaluate(`(async () => {
    const controllerUrl = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => name.includes('/connectome/ui/connectomeController.js'));
    if (!controllerUrl) throw new Error('No se encontro el modulo versionado del controller');
    const module = await import(controllerUrl);
    globalThis.__qaController = await module.inicializarMapaCircuitos({ root: document.querySelector('#connectomeApp') });
    globalThis.__qaMountDuration = performance.now() - globalThis.__qaMountStarted;
    globalThis.__qaLongTasks = [];
    if ('PerformanceObserver' in globalThis && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      globalThis.__qaLongTaskObserver?.disconnect?.();
      globalThis.__qaLongTaskObserver = new PerformanceObserver((list) => {
        globalThis.__qaLongTasks.push(...list.getEntries().map((entry) => entry.duration));
      });
      globalThis.__qaLongTaskObserver.observe({ type: 'longtask', buffered: true });
    }
  })()`);
  await frames();
  return before;
}

async function resetController({ scale = "region" } = {}) {
  await browser.evaluate(`(() => {
    const controller = globalThis.__qaController;
    controller.restoreViewState({
      version: 3,
      mode: 'exploracion', learningLevel: 'basico', layout: 'memoria', scale: ${JSON.stringify(scale)},
      visibilityMode: 'all', offFilterMode: 'dim', selectedNodeIds: [], selectedConnectionId: null,
      selectedCircuitId: null, activeMemoryGroupId: null, filterCriteria: {}, collapsedNodeIds: [],
      expandedNodeIds: [], activeLayerIds: [], activeNetworkLayerIds: [], activeConnectionLayerIds: [],
      showAllConnections: false, showEdgeLabels: false, detailOpen: false,
      leftPanelCollapsed: false, rightPanelCollapsed: false, leftPanelWidth: 300, rightPanelWidth: 360,
      mapOnly: false, fullscreen: false, minimapVisible: true, viewport: null
    });
    controller.state.filterResult = null;
    controller.state.isolation = null;
    controller.state.lesion = null;
    controller.state.journey = null;
    controller.state.comparison = null;
    controller.state.maximizedFallback = false;
    controller.renderAll({ fit: true, fitScope: 'all' });
  })()`);
  await frames(4);
}

async function change(selector, value) {
  await browser.evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) throw new Error('Control ausente: ${selector.replaceAll("'", "\\'")}');
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await frames(4);
}

async function click(selector) {
  await browser.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Elemento ausente: ${selector.replaceAll("'", "\\'")}');
    element.click();
  })()`);
  await frames(4);
}

async function pressEscape() {
  await browser.evaluate("document.querySelector('#connectomeViewport')?.focus({ preventScroll: true })");
  await browser.press("Escape");
  await frames(4);
}

async function fitReport(nodeIds = null, { includeEdges = false } = {}) {
  return browser.evaluate(`(() => {
    const viewport = document.querySelector('#connectomeViewport').getBoundingClientRect();
    const ids = ${JSON.stringify(nodeIds)};
    const nodes = ids
      ? ids.map((id) => document.querySelector('[data-node-id="' + CSS.escape(id) + '"]')).filter(Boolean)
      : [...document.querySelectorAll('.connectome-node[data-node-id]')];
    const tolerance = 3;
    const outsideNodes = nodes.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < viewport.left - tolerance || rect.top < viewport.top - tolerance
        || rect.right > viewport.right + tolerance || rect.bottom > viewport.bottom + tolerance;
    }).map((element) => element.dataset.nodeId);
    const outsideEdges = ${includeEdges ? "[...document.querySelectorAll('.connectome-edge[data-edge-id] .connectome-edge__path')].filter((element) => { const rect = element.getBoundingClientRect(); return rect.left < viewport.left - tolerance || rect.top < viewport.top - tolerance || rect.right > viewport.right + tolerance || rect.bottom > viewport.bottom + tolerance; }).map((element) => element.closest('[data-edge-id]')?.dataset.edgeId)" : "[]"};
    return { requested: ids?.length ?? nodes.length, found: nodes.length, outsideNodes, outsideEdges,
      viewport: { width: viewport.width, height: viewport.height } };
  })()`);
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Color no resuelto a RGB: ${value}`);
  return match.slice(1, 4).map(Number);
}

function contrastRatio(foreground, background) {
  const luminance = (rgb) => {
    const channels = rgb.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

try {
  await test("carga lazy y regresion: otros modulos existen y el conectoma solo carga al abrir su tab", async () => {
    const before = await mountFresh();
    assert.equal(before.activeTab, "integrada");
    assert.equal(before.connectomeResources, 0, "el connectome se cargo durante el inicio general");
    assert.equal(before.placeholder, true);
    assert.equal(before.otherPanels, true);
    const mounted = await browser.evaluate(`({
      ready: document.querySelector('#connectomeApp')?.dataset.state,
      regions: globalThis.__qaController.graph.regionList.length,
      connections: globalThis.__qaController.graph.connectionList.length,
      circuits: globalThis.__qaController.graph.circuitList.length,
      resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/connectome/')).length,
      mountDuration: globalThis.__qaMountDuration,
      status: document.querySelector('#connectomeStatus')?.textContent,
      tabActive: document.querySelector('[data-tab="mapa-circuitos"]')?.getAttribute('aria-selected')
    })`);
    assert.equal(mounted.ready, "ready");
    assert.deepEqual({ regions: mounted.regions, connections: mounted.connections, circuits: mounted.circuits }, expectedCounts);
    assert.ok(mounted.resources >= 12);
    assert.ok(mounted.mountDuration < 5000, `montaje lento: ${mounted.mountDuration.toFixed(1)} ms`);
    assert.equal(mounted.tabActive, "true");
    await browser.evaluate(`document.querySelector('[data-tab="membrana"]').click()`);
    await frames(2);
    assert.deepEqual(await browser.evaluate(`({
      membrane: document.querySelector('#tab-membrana')?.hidden === false,
      selected: document.querySelector('[data-tab="membrana"]')?.getAttribute('aria-selected'),
      connectomeReady: document.querySelector('#connectomeApp')?.dataset.state,
      nodes: document.querySelectorAll('.connectome-node[data-node-id]').length
    })`), { membrane: true, selected: "true", connectomeReady: "ready", nodes: 34 });
    await browser.evaluate(`document.querySelector('[data-tab="mapa-circuitos"]').click()`);
    await frames(3);
  });

  await test("circuito seleccionado: protagonistas visibles, contexto atenuado y fit dentro del viewport", async () => {
    await resetController();
    const circuitId = await browser.evaluate(`globalThis.__qaController.graph.hasCircuit('hipocampal_trisynaptic') ? 'hipocampal_trisynaptic' : globalThis.__qaController.graph.circuitList[0].id`);
    await change("#connectomeCircuitFilter", circuitId);
    await browser.evaluate("globalThis.__qaController.fitRelevant({ animate: false })");
    await frames(3);
    const result = await browser.evaluate(`(() => {
      const controller = globalThis.__qaController;
      const ids = [...controller.graph.getCircuitNodeIds(${JSON.stringify(circuitId)})];
      return {
        ids,
        missing: ids.filter((id) => !document.querySelector('[data-node-id="' + CSS.escape(id) + '"]')),
        dimmed: ids.filter((id) => document.querySelector('[data-node-id="' + CSS.escape(id) + '"]')?.classList.contains('is-dimmed')),
        contextDimmed: document.querySelectorAll('.connectome-node.is-dimmed').length,
        alternative: document.querySelector('#connectomeTextAlternative')?.textContent || ''
      };
    })()`);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.dimmed, []);
    assert.ok(result.contextDimmed > 0, "el filtro predeterminado no atenuo el contexto");
    assert.ok(result.alternative.trim().length > 30, "falta alternativa textual del circuito");
    const fit = await fitReport(result.ids);
    assert.equal(fit.found, result.ids.length);
    assert.deepEqual(fit.outsideNodes, []);

    await browser.evaluate(`(() => {
      const controller = globalThis.__qaController;
      const parent = controller.graph.getAncestors(${JSON.stringify(result.ids[0])})[0];
      if (parent) controller.state.collapsedNodeIds.add(parent.id);
      controller.renderGraph();
    })()`);
    await frames(3);
    const afterCollapsedParent = await browser.evaluate(`(() => {
      const controller = globalThis.__qaController;
      const ids = [...controller.graph.getCircuitNodeIds(${JSON.stringify(circuitId)})];
      return ids.filter((id) => !controller.currentView.nodeIds.has(id));
    })()`);
    assert.deepEqual(afterCollapsedParent, [], "un padre contraido oculto nodos protagonistas del circuito");
  });

  await test("visibilidad Mostrar todas y filtros dim/normal/hide no eliminan datos accidentalmente", async () => {
    await resetController();
    await change("#connectomeCircuitFilter", "hipocampal_trisynaptic");
    await change("#connectomeVisibilityMode", "circuit");
    const circuitCount = await browser.evaluate("document.querySelectorAll('.connectome-node[data-node-id]').length");
    await change("#connectomeVisibilityMode", "all");
    const allCount = await browser.evaluate("document.querySelectorAll('.connectome-node[data-node-id]').length");
    assert.ok(allCount > circuitCount, `Mostrar todas no amplio la vista (${circuitCount} -> ${allCount})`);
    await change("#connectomeCircuitFilter", "");
    const baselineIds = await browser.evaluate("[...document.querySelectorAll('.connectome-node[data-node-id]')].map((item) => item.dataset.nodeId).sort()");
    await change("#connectomeSystemFilter", "memoria");
    const dimState = await browser.evaluate(`({
      ids: [...document.querySelectorAll('.connectome-node[data-node-id]')].map((item) => item.dataset.nodeId).sort(),
      dimmed: document.querySelectorAll('.connectome-node.is-dimmed').length,
      canonical: [globalThis.__qaController.graph.regionList.length, globalThis.__qaController.graph.connectionList.length]
    })`);
    baselineIds.forEach((id) => assert.ok(dimState.ids.includes(id), `atenuar retiro accidentalmente ${id}`));
    assert.ok(dimState.dimmed > 0);
    assert.deepEqual(dimState.canonical, [99, 130]);
    await change("#connectomeOffFilterMode", "normal");
    assert.equal(await browser.evaluate("document.querySelectorAll('.connectome-node.is-dimmed, .connectome-edge.is-dimmed').length"), 0);
    await change("#connectomeOffFilterMode", "hide");
    const hiddenCount = await browser.evaluate("document.querySelectorAll('.connectome-node[data-node-id]').length");
    assert.ok(hiddenCount > 0 && hiddenCount < dimState.ids.length,
      `ocultar debe reducir la vista filtrada (${dimState.ids.length} -> ${hiddenCount})`);
    await click("[data-action='clear-filters']");
    await change("#connectomeOffFilterMode", "dim");
    assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.connectome-node[data-node-id]')].map((item) => item.dataset.nodeId).sort()"), baselineIds);
  });

  await test("capas moduladoras, redes y neurotransmisores usan exclusivamente entidades registradas", async () => {
    await resetController();
    const report = await browser.evaluate(`(() => {
      const controller = globalThis.__qaController;
      const checkLayer = (selector, setName, dataName) => {
        const input = document.querySelector(selector);
        if (!input) return null;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const view = controller.currentView;
        return {
          id: input.dataset[dataName],
          active: controller.state[setName].has(input.dataset[dataName]),
          invalidNodes: view.nodes.filter((node) => !controller.graph.hasNode(node.id)).map((node) => node.id),
          invalidEdges: view.connections.filter((edge) => !controller.graph.hasConnection(edge.id) && !edge.renderOnly).map((edge) => edge.id)
        };
      };
      return {
        modulator: checkLayer('[data-modulatory-layer]', 'activeLayerIds', 'modulatoryLayer'),
        network: checkLayer('[data-network-layer]', 'activeNetworkLayerIds', 'networkLayer'),
        chemistry: checkLayer('[data-connection-layer]', 'activeConnectionLayerIds', 'connectionLayer')
      };
    })()`);
    for (const [kind, item] of Object.entries(report)) {
      assert.ok(item, `falta control de capa ${kind}`);
      assert.equal(item.active, true);
      assert.deepEqual(item.invalidNodes, []);
      assert.deepEqual(item.invalidEdges, []);
    }
  });

  await test("Encajar todo y expansion completa mantienen nodos/vias dentro del mapa y rendimiento acotado", async () => {
    await resetController();
    await browser.evaluate(`(() => { globalThis.__qaLongTasks.length = 0; globalThis.__qaExpandStarted = performance.now(); globalThis.__qaController.expandAll(); })()`);
    await frames(5);
    const expansion = await browser.evaluate(`({
      duration: performance.now() - globalThis.__qaExpandStarted,
      nodes: document.querySelectorAll('.connectome-node[data-node-id]').length,
      edges: document.querySelectorAll('.connectome-edge[data-edge-id]').length,
      uniqueNodes: new Set([...document.querySelectorAll('.connectome-node[data-node-id]')].map((item) => item.dataset.nodeId)).size,
      uniqueEdges: new Set([...document.querySelectorAll('.connectome-edge[data-edge-id]')].map((item) => item.dataset.edgeId)).size,
      longTasks: globalThis.__qaLongTasks,
      scale: document.querySelector('#connectomeScale')?.value
    })`);
    assert.equal(expansion.nodes, expectedCounts.regions);
    assert.equal(expansion.uniqueNodes, expansion.nodes);
    assert.equal(expansion.uniqueEdges, expansion.edges);
    assert.equal(expansion.scale, "subcampo");
    assert.ok(expansion.duration < 2000, `Expandir todo tardo ${expansion.duration.toFixed(1)} ms`);
    assert.ok(Math.max(0, ...expansion.longTasks) < 750, `long task excesiva: ${Math.max(...expansion.longTasks).toFixed(1)} ms`);
    await click("[data-action='fit-graph']");
    const fit = await fitReport(null, { includeEdges: true });
    assert.deepEqual(fit.outsideNodes, []);
    assert.deepEqual(fit.outsideEdges, []);
    const duplicatePositions = await browser.evaluate(`(() => {
      const positions = [...globalThis.__qaController.renderer.positions.values()].map(({ x, y }) => x.toFixed(2) + ':' + y.toFixed(2));
      return positions.length - new Set(positions).size;
    })()`);
    assert.equal(duplicatePositions, 0, "hay nodos superpuestos exactamente en el layout expandido");
    await click("[data-action='collapse-all']");
    assert.ok(await browser.evaluate("document.querySelectorAll('.connectome-node[data-node-id]').length") < expectedCounts.regions);
  });

  await test("minimapa refleja la camara y busqueda CA1 centra y construye breadcrumbs navegables", async () => {
    await resetController();
    const beforeCamera = await browser.evaluate(`(() => { const item = document.querySelector('.connectome-minimap__camera'); return ['x','y','width','height'].map((name) => item?.getAttribute(name)).join(':'); })()`);
    assert.ok(beforeCamera && !beforeCamera.includes("null"));
    await browser.evaluate(`(() => { const renderer = globalThis.__qaController.renderer; const view = renderer.getViewport(); renderer.setViewport({ x: view.x + 80, y: view.y + 55, scale: view.scale * 1.08 }, { animate: false, source: 'qa' }); })()`);
    await frames(2);
    const afterCamera = await browser.evaluate(`(() => { const item = document.querySelector('.connectome-minimap__camera'); return ['x','y','width','height'].map((name) => item?.getAttribute(name)).join(':'); })()`);
    assert.notEqual(afterCamera, beforeCamera);
    await browser.evaluate(`(() => { const input = document.querySelector('#connectomeSearch'); input.value = 'CA1'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await browser.waitForFunction("document.querySelector('#connectomeSearchResults [data-search-type][data-search-id]')");
    const ca1Selector = "#connectomeSearchResults [data-search-type='region'][data-search-id='ca1']";
    assert.equal(await browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(ca1Selector)}))`), true);
    await click(ca1Selector);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 320));
    await frames(2);
    const selection = await browser.evaluate(`(() => {
      const node = document.querySelector('[data-node-id="ca1"]')?.getBoundingClientRect();
      const viewport = document.querySelector('#connectomeViewport').getBoundingClientRect();
      return {
        selected: document.querySelector('[data-node-id="ca1"]')?.classList.contains('is-selected'),
        deltaX: Math.abs((node.left + node.right) / 2 - (viewport.left + viewport.right) / 2),
        deltaY: Math.abs((node.top + node.bottom) / 2 - (viewport.top + viewport.bottom) / 2),
        breadcrumb: document.querySelector('#connectomeBreadcrumb')?.textContent,
        parentLinks: document.querySelectorAll('#connectomeBreadcrumb [data-breadcrumb-node]').length,
        ca1Current: document.querySelector('#connectomeBreadcrumb [data-breadcrumb-node="ca1"]')?.getAttribute('aria-current')
      };
    })()`);
    assert.equal(selection.selected, true);
    assert.ok(selection.deltaX < 12 && selection.deltaY < 12, `CA1 no quedo centrado (${selection.deltaX}, ${selection.deltaY})`);
    assert.match(selection.breadcrumb, /CA1/i);
    assert.ok(selection.parentLinks >= 2);
    assert.equal(selection.ca1Current, "page");
    const parentId = await browser.evaluate("document.querySelector('#connectomeBreadcrumb [data-breadcrumb-node]:not([data-breadcrumb-node=\"ca1\"])')?.dataset.breadcrumbNode");
    await click(`#connectomeBreadcrumb [data-breadcrumb-node='${parentId}']`);
    assert.equal(await browser.evaluate(`globalThis.__qaController.state.selectedNodeIds.has(${JSON.stringify(parentId)})`), true);
  });

  await test("paneles colapsables y redimensionado recalculan el viewport", async () => {
    await resetController();
    const initial = await browser.evaluate(`({ width: document.querySelector('#connectomeViewport').clientWidth, size: globalThis.__qaController.renderer.getViewportSize(), selection: [...globalThis.__qaController.state.selectedNodeIds] })`);
    await click("[data-action='toggle-left-panel']");
    await frames(4);
    const leftCollapsed = await browser.evaluate(`({ cls: document.querySelector('#connectomeApp').classList.contains('is-left-collapsed'), hidden: document.querySelector('#connectomeControls').getAttribute('aria-hidden'), width: document.querySelector('#connectomeViewport').clientWidth, size: globalThis.__qaController.renderer.getViewportSize() })`);
    assert.equal(leftCollapsed.cls, true);
    assert.equal(leftCollapsed.hidden, "true");
    assert.ok(leftCollapsed.width > initial.width, `colapsar panel izquierdo redujo/no amplio el viewport (${initial.width} -> ${leftCollapsed.width})`);
    assert.equal(leftCollapsed.size.width, leftCollapsed.width);
    await click("[data-action='toggle-left-panel']");
    const resizeBefore = await browser.evaluate(`(() => { const item = document.querySelector('[data-resize-panel="left"]'); item.focus(); return Number(item.getAttribute('aria-valuenow')); })()`);
    await browser.press("ArrowRight");
    await frames(2);
    const resizeAfter = await browser.evaluate("Number(document.querySelector('[data-resize-panel=\"left\"]').getAttribute('aria-valuenow'))");
    assert.ok(resizeAfter > resizeBefore);
  });

  await test("Solo mapa y fullscreen recalculan la camara; Escape restaura", async () => {
    await resetController();
    const initial = await browser.evaluate(`({ width: document.querySelector('#connectomeViewport').clientWidth, size: globalThis.__qaController.renderer.getViewportSize() })`);
    await click(".connectome-header-actions [data-action='toggle-map-only']");
    const mapOnly = await browser.evaluate(`({ active: document.querySelector('#connectomeApp').classList.contains('is-map-only'), controls: getComputedStyle(document.querySelector('#connectomeControls')).display, width: document.querySelector('#connectomeViewport').clientWidth })`);
    assert.equal(mapOnly.active, true);
    assert.equal(mapOnly.controls, "none");
    assert.ok(mapOnly.width > initial.width);
    await pressEscape();
    assert.equal(await browser.evaluate("globalThis.__qaController.state.mapOnly"), false);

    const sizeBeforeFullscreen = await browser.evaluate("globalThis.__qaController.renderer.getViewportSize()");
    await click(".connectome-header-actions [data-action='toggle-fullscreen']");
    const native = await browser.evaluate(`({
      state: globalThis.__qaController.state.fullscreen,
      native: document.fullscreenElement === document.querySelector('#connectomeApp'),
      cls: document.querySelector('#connectomeApp').classList.contains('is-fullscreen'),
      host: { width: document.querySelector('#connectomeViewport').clientWidth, height: document.querySelector('#connectomeViewport').clientHeight },
      size: globalThis.__qaController.renderer.getViewportSize()
    })`);
    assert.equal(native.state, true);
    assert.equal(native.native, true);
    assert.equal(native.cls, true);
    assert.deepEqual(native.size, native.host);
    assert.notDeepEqual(native.size, sizeBeforeFullscreen);
    await pressEscape();
    assert.equal(await browser.evaluate("globalThis.__qaController.state.fullscreen"), false);

    await browser.evaluate("globalThis.__qaRejectFullscreen = true");
    await click(".connectome-header-actions [data-action='toggle-fullscreen']");
    const fallback = await browser.evaluate(`({ state: globalThis.__qaController.state.fullscreen, fallback: globalThis.__qaController.state.maximizedFallback, root: document.querySelector('#connectomeApp').classList.contains('is-maximized'), body: document.body.classList.contains('connectome-maximized-active') })`);
    assert.deepEqual(fallback, { state: true, fallback: true, root: true, body: true });
    await pressEscape();
    assert.deepEqual(await browser.evaluate(`({ state: globalThis.__qaController.state.fullscreen, root: document.querySelector('#connectomeApp').classList.contains('is-maximized'), body: document.body.classList.contains('connectome-maximized-active') })`), { state: false, root: false, body: false });
    await browser.evaluate("globalThis.__qaRejectFullscreen = false");
  });

  await test("persistencia de sesion restaura vista, panel, capa, seleccion, camara y fullscreen como fallback", async () => {
    await resetController();
    const persisted = await browser.evaluate(`(() => {
      const controller = globalThis.__qaController;
      const layerId = document.querySelector('[data-modulatory-layer]')?.dataset.modulatoryLayer;
      controller.restoreViewState({ ...controller.serializeViewState(), layout: 'radial', scale: 'subcampo',
        selectedNodeIds: ['ca1'], activeLayerIds: [layerId], leftPanelCollapsed: true,
        leftPanelWidth: 418, rightPanelWidth: 476, fullscreen: true, mapOnly: false, minimapVisible: true,
        showEdgeLabels: true, viewport: { x: 137, y: 91, scale: .73 } });
      controller.renderer.setViewport({ x: 137, y: 91, scale: .73 }, { animate: false, source: 'qa-persist' });
      controller.schedulePersist();
      return { layerId };
    })()`);
    await browser.waitForFunction(`(() => {
      try { return JSON.parse(sessionStorage.getItem('cognicion.connectome.view.v3') || '{}').layout === 'radial'; }
      catch { return false; }
    })()`, { timeoutMs: 3000 });
    await browser.navigate(pagePath);
    await browser.evaluate("document.querySelector('[data-tab=\"mapa-circuitos\"]')?.click()");
    await browser.waitForFunction("document.querySelector('#connectomeApp')?.dataset.state === 'ready'", { timeoutMs: 25000 });
    await browser.evaluate(`(async () => {
      const controllerUrl = performance.getEntriesByType('resource').map((entry) => entry.name)
        .find((name) => name.includes('/connectome/ui/connectomeController.js'));
      const module = await import(controllerUrl);
      globalThis.__qaController = await module.inicializarMapaCircuitos({ root: document.querySelector('#connectomeApp') });
    })()`);
    await frames(4);
    const restored = await browser.evaluate(`({
      layout: globalThis.__qaController.state.layout,
      scale: globalThis.__qaController.state.scale,
      selected: globalThis.__qaController.state.selectedNodeIds.has('ca1'),
      layer: globalThis.__qaController.state.activeLayerIds.has(${JSON.stringify(persisted.layerId)}),
      leftCollapsed: globalThis.__qaController.state.leftPanelCollapsed,
      widths: [globalThis.__qaController.state.leftPanelWidth, globalThis.__qaController.state.rightPanelWidth],
      fullscreen: globalThis.__qaController.state.fullscreen,
      fallback: globalThis.__qaController.state.maximizedFallback,
      body: document.body.classList.contains('connectome-maximized-active'),
      edgeLabels: globalThis.__qaController.state.showEdgeLabels,
      edgeLabelButton: {
        pressed: document.querySelector('[data-action="toggle-edge-labels"]')?.getAttribute('aria-pressed'),
        label: document.querySelector('[data-action="toggle-edge-labels"]')?.getAttribute('aria-label'),
        title: document.querySelector('[data-action="toggle-edge-labels"]')?.getAttribute('title')
      },
      viewport: globalThis.__qaController.renderer.getViewport()
    })`);
    assert.equal(restored.layout, "radial");
    assert.equal(restored.scale, "subcampo");
    assert.equal(restored.selected, true);
    assert.equal(restored.layer, true);
    assert.equal(restored.leftCollapsed, true);
    assert.deepEqual(restored.widths, [418, 476]);
    assert.deepEqual({ fullscreen: restored.fullscreen, fallback: restored.fallback, body: restored.body }, { fullscreen: true, fallback: true, body: true });
    assert.equal(restored.edgeLabels, true);
    assert.deepEqual(restored.edgeLabelButton, { pressed: "true", label: "Ocultar etiquetas de vias", title: "Ocultar etiquetas de vias" });
    assert.ok(Math.abs(restored.viewport.x - 137) < 0.01 && Math.abs(restored.viewport.y - 91) < 0.01 && Math.abs(restored.viewport.scale - .73) < 0.01);
    await pressEscape();
  });

  await test("responsive tablet/movil conserva mapa util, panel inferior y escala movil inicial", async () => {
    await mountFresh({ width: 1024, height: 768, clearSession: true });
    await browser.evaluate("globalThis.__qaController.selectNode('ca1')");
    await frames(3);
    const tablet = await browser.evaluate(`({
      viewport: globalThis.__qaController.renderer.getViewportSize(),
      detailOpen: document.querySelector('#connectomeDetail').classList.contains('is-open'),
      detailPosition: getComputedStyle(document.querySelector('#connectomeDetail')).position,
      rootOverflow: document.querySelector('#connectomeApp').scrollWidth - document.querySelector('#connectomeApp').clientWidth
    })`);
    assert.ok(tablet.viewport.width >= 450 && tablet.viewport.height >= 500);
    assert.equal(tablet.detailOpen, true);
    assert.ok(["absolute", "fixed"].includes(tablet.detailPosition));
    assert.ok(tablet.rootOverflow <= 2, `overflow horizontal tablet: ${tablet.rootOverflow}px`);

    await mountFresh({ width: 390, height: 844, mobile: true, clearSession: true });
    const mobile = await browser.evaluate(`({
      scale: globalThis.__qaController.state.scale,
      minimapVisible: globalThis.__qaController.state.minimapVisible,
      minimapHidden: document.querySelector('#connectomeMinimap').hidden,
      resizerDisplay: getComputedStyle(document.querySelector('[data-resize-panel="left"]')).display,
      viewport: globalThis.__qaController.renderer.getViewportSize(),
      rootOverflow: document.querySelector('#connectomeApp').scrollWidth - document.querySelector('#connectomeApp').clientWidth,
      nodeCount: document.querySelectorAll('.connectome-node[data-node-id]').length
    })`);
    assert.equal(mobile.scale, "sistema");
    assert.equal(mobile.minimapVisible, false);
    assert.equal(mobile.minimapHidden, true);
    assert.equal(mobile.resizerDisplay, "none");
    assert.ok(mobile.viewport.width >= 300 && mobile.viewport.height >= 480,
      `viewport movil insuficiente: ${mobile.viewport.width} x ${mobile.viewport.height}`);
    assert.ok(mobile.rootOverflow <= 2, `overflow horizontal movil: ${mobile.rootOverflow}px`);
    assert.ok(mobile.nodeCount >= 5);
    await browser.evaluate("globalThis.__qaController.selectNode('ca1')");
    await frames(3);
    const mobileDetail = await browser.evaluate(`({ open: document.querySelector('#connectomeDetail').classList.contains('is-open'), position: getComputedStyle(document.querySelector('#connectomeDetail')).position, bottom: getComputedStyle(document.querySelector('#connectomeDetail')).bottom, close: Boolean(document.querySelector('#connectomeDetail [data-action="close-detail"]')) })`);
    assert.equal(mobileDetail.open, true);
    assert.equal(mobileDetail.position, "fixed");
    assert.equal(mobileDetail.bottom, "0px");
    assert.equal(mobileDetail.close, true);
  });

  await test("temas claro/oscuro conservan contraste y el conectoma no introduce errores de consola", async () => {
    await mountFresh({ width: 1440, height: 900, clearSession: true });
    const colors = {};
    for (const theme of ["light", "dark"]) {
      colors[theme] = await browser.evaluate(`(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const element = document.querySelector('#connectomeDetail');
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor, nodeFill: getComputedStyle(document.querySelector('.connectome-node__shape')).fill };
      })()`);
      assert.ok(contrastRatio(parseRgb(colors[theme].color), parseRgb(colors[theme].background)) >= 4.5,
        `${theme}: contraste insuficiente ${colors[theme].color} sobre ${colors[theme].background}`);
    }
    assert.notDeepEqual(colors.light, colors.dark);
    const connectomeErrors = (await browser.pageErrors()).filter((item) => /connectome|mapa de circuitos/i.test(item.message || ""));
    assert.deepEqual(connectomeErrors, []);
  });
} finally {
  const allErrors = await browser.pageErrors().catch(() => []);
  const unrelated = allErrors.filter((item) => !/connectome|mapa de circuitos/i.test(item.message || ""));
  if (unrelated.length) {
    console.warn(`! ${unrelated.length} error(es) ajeno(s) al connectome observados; revisar regresion global:`);
    for (const item of unrelated.slice(0, 5)) console.warn(`  - ${item.type}: ${item.message}`);
  }
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} escenario(s) E2E fallaron; ${passed} pasaron.`);
  process.exitCode = 1;
} else {
  console.log(`\nConnectome UI E2E: ${passed} escenarios pasaron.`);
}
