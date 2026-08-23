import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChromeHarness } from "../js/tests/helpers/chrome-cdp.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOLERANCIA_PX = 1;

const rutasTema = [
  "css/theme/tokens.css",
  "css/theme/themes.css",
  "css/theme/base.css",
  "css/theme/typography.css",
  "css/theme/layout.css",
  "css/theme/buttons.css",
  "css/theme/forms.css",
  "css/theme/navigation.css",
  "css/theme/components.css",
  "css/theme/utilities.css",
  "css/theme/responsive.css",
  "css/estilo-global-panel-medico.css",
  "css/theme/cognicion-theme.css",
  "css/theme/biocellular.css"
];

const [htmlFuente, cssMiNube, ...fragmentosTema] = await Promise.all([
  readFile(resolve(raiz, "mi-nube.html"), "utf8"),
  readFile(resolve(raiz, "css/mi-nube.css"), "utf8"),
  ...rutasTema.map((ruta) => readFile(resolve(raiz, ruta), "utf8"))
]);

const cssTema = fragmentosTema
  .join("\n")
  .replace(/^\s*@import\s+url\([^\n]+\);\s*$/gm, "");

const iconos = Object.freeze({
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"></path></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 17 5-4 3 3 3-2 5 4"></path></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v5h5M8 16h8M8 12h5"></path></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"></path></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4"></path></svg>'
});

const elementosDemo = [
  { id: "folder-1", category: "folder", name: "Artículos", type: "Carpeta", size: "—", source: "Mi nube", action: "open-folder" },
  { id: "image-1", category: "image", name: "esquema-neurociencias.webp", type: "Imagen", size: "1.8 MB", source: "Archivo · Imagen", action: "preview" },
  { id: "pdf-1", category: "pdf", name: "memoria-y-aprendizaje.pdf", type: "PDF", size: "3.2 MB", source: "Archivo · PDF", action: "preview" },
  { id: "text-1", category: "text", name: "lecturas-pendientes.md", type: "Markdown", size: "18 KB", source: "Archivo · Markdown", action: "preview" },
  { id: "note-1", category: "note", name: "Neurobiología de la memoria", type: "Mis apuntes", size: "—", source: "Mis apuntes", action: "open-note", note: true },
  { id: "pdf-2", category: "pdf", name: "protocolo-de-evaluación-cognitiva.pdf", type: "PDF", size: "6.7 MB", source: "Archivo · PDF", action: "preview" }
];

function accionesElemento(elemento) {
  if (elemento.note) {
    return `<a class="cloud-item-menu-button cloud-note-edit" href="apuntes.html?apunte=${elemento.id}&origen=mi-nube" aria-label="Editar ${elemento.name}">Editar</a>`;
  }
  return `<details class="cloud-actions-menu cloud-item-menu-button">
    <summary aria-label="Acciones para ${elemento.name}">⋮</summary>
    <div role="menu">
      <button type="button" role="menuitem">${elemento.category === "folder" ? "Abrir" : "Previsualizar"}</button>
      <button type="button" role="menuitem">Renombrar</button>
      <button type="button" role="menuitem">Mover</button>
      <button class="danger" type="button" role="menuitem">Eliminar</button>
    </div>
  </details>`;
}

function elementoCuadricula(elemento) {
  return `<article class="cloud-item cloud-item-grid" role="listitem" data-cloud-id="${elemento.id}" data-cloud-source="${elemento.note ? "note" : "cloud-file"}">
    <button class="cloud-item-open" type="button" data-cloud-action="${elemento.action}" aria-label="Abrir ${elemento.name}">
      <span class="cloud-item-preview cloud-item-preview--${elemento.category}" aria-hidden="true">${iconos[elemento.category]}</span>
      <span class="cloud-item-copy">
        <strong class="cloud-item-name" title="${elemento.name}">${elemento.name}</strong>
        <span class="cloud-item-details">${elemento.type} · ${elemento.size}</span>
        <span class="cloud-item-source">${elemento.source}</span>
      </span>
    </button>
    ${accionesElemento(elemento)}
  </article>`;
}

function elementoLista(elemento) {
  return `<article class="cloud-item cloud-item-list" role="listitem" data-cloud-id="${elemento.id}" data-cloud-source="${elemento.note ? "note" : "cloud-file"}">
    <button class="cloud-item-open" type="button" data-cloud-action="${elemento.action}" aria-label="Abrir ${elemento.name}">
      <span class="cloud-item-preview cloud-item-preview--${elemento.category}" aria-hidden="true">${iconos[elemento.category]}</span>
      <strong class="cloud-item-name" title="${elemento.name}">${elemento.name}</strong>
      <span class="cloud-item-type">${elemento.type}</span>
      <span class="cloud-item-size">${elemento.size}</span>
      <time class="cloud-item-date">22 ago 2026</time>
    </button>
    ${accionesElemento(elemento)}
  </article>`;
}

const cuadriculaDemo = elementosDemo.map(elementoCuadricula).join("\n");
const listaDemo = elementosDemo.map(elementoLista).join("\n");

function documentoDemo() {
  return htmlFuente
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace("<head>", '<head><base href="/">')
    .replace("</head>", `<style>${cssTema}\n${cssMiNube}</style></head>`)
    .replace('<body class="pagina-mi-nube bloqueado">', '<body class="pagina-mi-nube">')
    .replace('aria-busy="true"', 'aria-busy="false"')
    .replace(
      /(<div\s+id="cloudItems"[\s\S]*?>)[\s\S]*?<\/div>/,
      `$1${cuadriculaDemo}</div>`
    )
    .replace(
      '<section id="cloudLoadingState" class="cloud-state" role="status">',
      '<section id="cloudLoadingState" class="cloud-state" role="status" hidden>'
    )
    .replace('aria-valuenow="0"', 'aria-valuenow="17"')
    .replace('<span aria-hidden="true"></span>', '<span aria-hidden="true" style="width:17%"></span>')
    .replace('id="cloudUsageText">0 MB de 250 MB', 'id="cloudUsageText">42.7 MB de 250 MB');
}

async function montarDocumento(harness) {
  await harness.navigate("/tests/fixtures/mi-nube-origin.html");
  const { frameTree } = await harness.cdp.send("Page.getFrameTree");
  await harness.cdp.send("Page.setDocumentContent", {
    frameId: frameTree.frame.id,
    html: documentoDemo()
  });
  await harness.waitForFunction("document.readyState === 'complete' && document.querySelectorAll('.cloud-item').length === 6");
  await harness.evaluate(`(() => {
    const gridMarkup = ${JSON.stringify(cuadriculaDemo)};
    const listMarkup = ${JSON.stringify(listaDemo)};
    const items = document.querySelector('#cloudItems');
    const listHeader = document.querySelector('#cloudListHeader');
    const gridButton = document.querySelector('#cloudGridButton');
    const listButton = document.querySelector('#cloudListButton');
    const setView = (view) => {
      const isList = view === 'list';
      items.dataset.view = view;
      items.innerHTML = isList ? listMarkup : gridMarkup;
      listHeader.hidden = !isList;
      gridButton.setAttribute('aria-pressed', String(!isList));
      listButton.setAttribute('aria-pressed', String(isList));
    };
    gridButton.addEventListener('click', () => setView('grid'));
    listButton.addEventListener('click', () => setView('list'));

    const newButton = document.querySelector('#cloudNewButton');
    const newMenu = document.querySelector('#cloudNewMenu');
    newButton.addEventListener('click', () => {
      const open = newMenu.hidden;
      newMenu.hidden = !open;
      newButton.setAttribute('aria-expanded', String(open));
    });

    const sidebar = document.querySelector('#cloudSidebar');
    const backdrop = document.querySelector('#cloudSidebarBackdrop');
    const toggle = document.querySelector('#cloudSidebarToggle');
    const close = document.querySelector('#cloudSidebarClose');
    const setSidebar = (open) => {
      sidebar.classList.toggle('is-open', open);
      backdrop.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setSidebar(true));
    close.addEventListener('click', () => setSidebar(false));
    backdrop.addEventListener('click', () => setSidebar(false));
  })()`);
  await harness.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

function assertBorde(actual, esperado, etiqueta) {
  assert.ok(
    Math.abs(actual - esperado) <= TOLERANCIA_PX,
    `${etiqueta}: esperado ${esperado}px, recibido ${actual}px`
  );
}

test("Mi nube aprovecha el escritorio y alterna cuadrícula/lista sin desbordar", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1536, height: 864 } });
  try {
    await montarDocumento(harness);
    const escritorio = await harness.evaluate(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const tarjetas = [...document.querySelectorAll('.cloud-item')].map((item) => {
        const r = item.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        topbar: rect('.cloud-topbar'),
        app: rect('.cloud-app'),
        sidebar: rect('.cloud-sidebar'),
        workspace: rect('.cloud-workspace'),
        toolbar: rect('.cloud-toolbar'),
        search: rect('.cloud-search'),
        nuevo: rect('#cloudNewButton'),
        location: rect('.cloud-location-bar'),
        browser: rect('.cloud-browser'),
        tarjetas,
        filtroActivo: document.querySelector('.cloud-filter[aria-pressed="true"]')?.textContent.trim(),
        cuota: document.querySelector('#cloudUsageText')?.textContent.trim(),
        notas: document.querySelectorAll('[data-cloud-source="note"]').length,
        sidebarToggleDisplay: getComputedStyle(document.querySelector('#cloudSidebarToggle')).display
      };
    })()`);

    assertBorde(escritorio.topbar.top, 0, "escritorio / cabecera superior");
    assertBorde(escritorio.topbar.left, 0, "escritorio / cabecera izquierda");
    assertBorde(escritorio.topbar.right, escritorio.viewportWidth, "escritorio / cabecera derecha");
    assert.ok(escritorio.topbar.height >= 60 && escritorio.topbar.height <= 66, JSON.stringify(escritorio));
    assertBorde(escritorio.app.top, escritorio.topbar.bottom, "escritorio / app bajo cabecera");
    assertBorde(escritorio.app.bottom, escritorio.viewportHeight, "escritorio / app al borde inferior");
    assertBorde(escritorio.app.left, 0, "escritorio / app izquierda");
    assertBorde(escritorio.app.right, escritorio.viewportWidth, "escritorio / app derecha");
    assertBorde(escritorio.sidebar.left, escritorio.app.left, "escritorio / sidebar izquierda");
    assertBorde(escritorio.sidebar.right, escritorio.workspace.left, "escritorio / columnas unidas");
    assertBorde(escritorio.workspace.right, escritorio.app.right, "escritorio / workspace derecha");
    assertBorde(escritorio.workspace.top, escritorio.app.top, "escritorio / workspace arriba");
    assertBorde(escritorio.workspace.bottom, escritorio.app.bottom, "escritorio / workspace abajo");
    assert.ok(escritorio.sidebar.width >= 240 && escritorio.sidebar.width <= 255, JSON.stringify(escritorio));
    assert.ok(escritorio.toolbar.width > 760, JSON.stringify(escritorio));
    assert.ok(escritorio.search.width > 600, JSON.stringify(escritorio));
    assert.ok(escritorio.search.height >= 44 && escritorio.nuevo.height >= 44, JSON.stringify(escritorio));
    assertBorde(escritorio.toolbar.left, escritorio.location.left, "escritorio / toolbar y ruta alineados");
    assertBorde(escritorio.location.left, escritorio.browser.left, "escritorio / ruta y explorador alineados");
    assert.equal(escritorio.tarjetas.length, 6);
    assert.ok(escritorio.tarjetas.every((tarjeta) => tarjeta.width >= 165 && tarjeta.height >= 190), JSON.stringify(escritorio.tarjetas));
    assert.equal(escritorio.filtroActivo, "Todos");
    assert.equal(escritorio.cuota, "42.7 MB de 250 MB");
    assert.equal(escritorio.notas, 1);
    assert.equal(escritorio.sidebarToggleDisplay, "none");
    assert.ok(escritorio.scrollWidth <= escritorio.viewportWidth);
    assertBorde(escritorio.scrollHeight, escritorio.viewportHeight, "escritorio / documento sin desborde vertical");
    if (process.env.MI_NUBE_DESKTOP_GRID_SCREENSHOT_PATH) {
      const captura = await harness.screenshot();
      await writeFile(process.env.MI_NUBE_DESKTOP_GRID_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }

    await harness.click("#cloudNewButton");
    await harness.waitForFunction("!document.querySelector('#cloudNewMenu').hidden");
    const menuNuevo = await harness.evaluate(`(() => {
      const menu = document.querySelector('#cloudNewMenu').getBoundingClientRect();
      const button = document.querySelector('#cloudNewButton').getBoundingClientRect();
      const toolbar = document.querySelector('.cloud-toolbar').getBoundingClientRect();
      return {
        menu: { left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom, width: menu.width },
        buttonBottom: button.bottom,
        toolbarRight: toolbar.right,
        minItemHeight: Math.min(...[...document.querySelectorAll('#cloudNewMenu button')].map((item) => item.getBoundingClientRect().height)),
        expanded: document.querySelector('#cloudNewButton').getAttribute('aria-expanded')
      };
    })()`);
    assert.equal(menuNuevo.expanded, "true");
    assert.ok(menuNuevo.menu.top >= menuNuevo.buttonBottom, JSON.stringify(menuNuevo));
    assert.ok(menuNuevo.menu.right <= menuNuevo.toolbarRight + 1, JSON.stringify(menuNuevo));
    assert.ok(menuNuevo.menu.width >= 205 && menuNuevo.minItemHeight >= 40, JSON.stringify(menuNuevo));
    await harness.click("#cloudNewButton");
    await harness.waitForFunction("document.querySelector('#cloudNewMenu').hidden");

    await harness.click("#cloudListButton");
    await harness.waitForFunction("document.querySelector('#cloudItems').dataset.view === 'list' && document.querySelectorAll('.cloud-item-list').length === 6");
    const lista = await harness.evaluate(`(() => {
      const items = [...document.querySelectorAll('.cloud-item-list')];
      const first = items[0].getBoundingClientRect();
      const second = items[1].getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        headerDisplay: getComputedStyle(document.querySelector('#cloudListHeader')).display,
        gridPressed: document.querySelector('#cloudGridButton').getAttribute('aria-pressed'),
        listPressed: document.querySelector('#cloudListButton').getAttribute('aria-pressed'),
        itemCount: items.length,
        itemHeight: first.height,
        columnasAlineadas: Math.abs(first.left - second.left) <= 1 && Math.abs(first.right - second.right) <= 1,
        actionWidth: document.querySelector('.cloud-actions-menu summary').getBoundingClientRect().width
      };
    })()`);
    assert.equal(lista.headerDisplay, "grid");
    assert.equal(lista.gridPressed, "false");
    assert.equal(lista.listPressed, "true");
    assert.equal(lista.itemCount, 6);
    assert.ok(lista.itemHeight >= 49 && lista.itemHeight <= 55, JSON.stringify(lista));
    assert.equal(lista.columnasAlineadas, true);
    assert.ok(lista.actionWidth >= 34, JSON.stringify(lista));
    assert.ok(lista.scrollWidth <= lista.innerWidth);

    const temas = await harness.evaluate(`(async () => {
      const parseRgb = (value) => {
        const values = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) || [];
        return values.length === 3 ? values : null;
      };
      const luminance = (value) => {
        const rgb = parseRgb(value);
        if (!rgb) return null;
        const channels = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
        });
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
      };
      const contrast = (foreground, background) => {
        const first = luminance(foreground);
        const second = luminance(background);
        if (first === null || second === null) return 0;
        return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
      };
      const results = {};
      for (const theme of ['light', 'dark', 'biocelular']) {
        document.documentElement.dataset.theme = theme;
        await new Promise((resolve) => setTimeout(resolve, 260));
        const input = document.querySelector('#cloudSearch');
        const search = document.querySelector('.cloud-search');
        const workspace = document.querySelector('.cloud-workspace');
        const item = document.querySelector('.cloud-item');
        const inputColor = getComputedStyle(input).color;
        const searchBackground = getComputedStyle(search).backgroundColor;
        results[theme] = {
          appliedTheme: document.documentElement.getAttribute('data-theme'),
          inputTextToken: getComputedStyle(document.documentElement).getPropertyValue('--input-text').trim(),
          pageBgToken: getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim(),
          inputElementTextToken: getComputedStyle(input).getPropertyValue('--input-text').trim(),
          inputElementPrimaryToken: getComputedStyle(input).getPropertyValue('--text-primary').trim(),
          inputColor,
          searchBackground,
          workspaceBackground: getComputedStyle(workspace).backgroundColor,
          itemBackground: getComputedStyle(item).backgroundColor,
          contrast: contrast(inputColor, searchBackground),
          overflowHorizontal: document.documentElement.scrollWidth - innerWidth
        };
      }
      document.documentElement.dataset.theme = 'biocelular';
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return results;
    })()`);
    for (const [tema, metricas] of Object.entries(temas)) {
      assert.ok(metricas.contrast >= 4.5, `${tema} / contraste del buscador: ${JSON.stringify(metricas)}`);
      assert.notEqual(metricas.searchBackground, "rgba(0, 0, 0, 0)", `${tema} / superficie del buscador`);
      assert.ok(metricas.overflowHorizontal <= 0, `${tema} / desborde horizontal`);
    }
    assert.equal(new Set(Object.values(temas).map((tema) => tema.workspaceBackground)).size, 3, JSON.stringify(temas));

    if (process.env.MI_NUBE_DESKTOP_SCREENSHOT_PATH) {
      const captura = await harness.screenshot();
      await writeFile(process.env.MI_NUBE_DESKTOP_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }
    assert.deepEqual(await harness.pageErrors(), []);
  } finally {
    await harness.close();
  }
});

test("Mi nube conserva navegación táctil, sidebar y vistas en móvil", async () => {
  const harness = await launchChromeHarness({
    rootDirectory: raiz,
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 }
  });
  try {
    await harness.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await montarDocumento(harness);
    const movil = await harness.evaluate(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const filtros = [...document.querySelectorAll('.cloud-mobile-filter-row button')];
      const tarjetas = [...document.querySelectorAll('.cloud-item-grid')].map((item) => item.getBoundingClientRect());
      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        topbar: rect('.cloud-topbar'),
        app: rect('.cloud-app'),
        quotaStrip: rect('.cloud-sidebar .cloud-quota'),
        workspace: rect('.cloud-workspace'),
        toolbar: rect('.cloud-toolbar'),
        search: rect('.cloud-search'),
        nuevo: rect('#cloudNewButton'),
        sidebarToggle: rect('#cloudSidebarToggle'),
        mobileFilters: rect('.cloud-mobile-filter-row'),
        mobileFilterMinHeight: Math.min(...filtros.map((item) => item.getBoundingClientRect().height)),
        mobileFilterScrollable: document.querySelector('.cloud-mobile-filter-row').scrollWidth > document.querySelector('.cloud-mobile-filter-row').clientWidth,
        location: rect('.cloud-location-bar'),
        cards: tarjetas.map((r) => ({ left: r.left, right: r.right, width: r.width, height: r.height })),
        gridPressed: document.querySelector('#cloudGridButton').getAttribute('aria-pressed'),
        sidebarStatic: getComputedStyle(document.querySelector('#cloudSidebar')).position,
        sidebarCloseDisplay: getComputedStyle(document.querySelector('#cloudSidebarClose')).display
      };
    })()`);

    assertBorde(movil.topbar.top, 0, "móvil / cabecera superior");
    assertBorde(movil.topbar.left, 0, "móvil / cabecera izquierda");
    assertBorde(movil.topbar.right, movil.innerWidth, "móvil / cabecera derecha");
    assert.ok(movil.topbar.height >= 56 && movil.topbar.height <= 60, JSON.stringify(movil));
    assertBorde(movil.app.top, movil.topbar.bottom, "móvil / app bajo cabecera");
    assertBorde(movil.app.bottom, movil.innerHeight, "móvil / app al borde inferior");
    assertBorde(movil.quotaStrip.left, 0, "móvil / cuota a la izquierda");
    assertBorde(movil.quotaStrip.right, movil.innerWidth, "móvil / cuota a la derecha");
    assertBorde(movil.workspace.left, 0, "móvil / workspace izquierda");
    assertBorde(movil.workspace.right, movil.innerWidth, "móvil / workspace derecha");
    assert.ok(movil.search.height >= 44 && movil.nuevo.height >= 44, JSON.stringify(movil));
    assert.ok(movil.sidebarToggle.width >= 42 && movil.sidebarToggle.height >= 42, JSON.stringify(movil));
    assert.ok(movil.mobileFilterMinHeight >= 38, JSON.stringify(movil));
    assert.ok(movil.mobileFilters.height >= 38, `móvil / fila de filtros recortada: ${JSON.stringify(movil)}`);
    assert.equal(movil.mobileFilterScrollable, true);
    assert.ok(movil.mobileFilters.width <= movil.workspace.width, JSON.stringify(movil));
    assert.ok(movil.mobileFilters.bottom <= movil.location.top + 1, `móvil / filtros y breadcrumbs se superponen: ${JSON.stringify(movil)}`);
    assert.ok(movil.cards.every((tarjeta) => tarjeta.left >= 0 && tarjeta.right <= movil.innerWidth && tarjeta.width > 340 && tarjeta.height >= 150), JSON.stringify(movil.cards));
    assert.equal(movil.gridPressed, "true");
    assert.equal(movil.sidebarStatic, "static");
    assert.notEqual(movil.sidebarCloseDisplay, "none");
    assert.ok(movil.scrollWidth <= movil.innerWidth);
    assertBorde(movil.scrollHeight, movil.innerHeight, "móvil / documento sin desborde vertical");
    if (process.env.MI_NUBE_MOBILE_GRID_SCREENSHOT_PATH) {
      const captura = await harness.screenshot();
      await writeFile(process.env.MI_NUBE_MOBILE_GRID_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }

    await harness.click("#cloudNewButton");
    await harness.waitForFunction("!document.querySelector('#cloudNewMenu').hidden");
    const menuNuevoMovil = await harness.evaluate(`(() => {
      const menu = document.querySelector('#cloudNewMenu').getBoundingClientRect();
      return {
        left: menu.left,
        right: menu.right,
        width: menu.width,
        innerWidth,
        minItemHeight: Math.min(...[...document.querySelectorAll('#cloudNewMenu button')].map((item) => item.getBoundingClientRect().height)),
        overflowHorizontal: document.documentElement.scrollWidth - innerWidth
      };
    })()`);
    assert.ok(menuNuevoMovil.left >= 0 && menuNuevoMovil.right <= menuNuevoMovil.innerWidth, JSON.stringify(menuNuevoMovil));
    assert.ok(menuNuevoMovil.width >= 205 && menuNuevoMovil.minItemHeight >= 40, JSON.stringify(menuNuevoMovil));
    assert.ok(menuNuevoMovil.overflowHorizontal <= 0);
    await harness.click("#cloudNewButton");
    await harness.waitForFunction("document.querySelector('#cloudNewMenu').hidden");

    await harness.click("#cloudSidebarToggle");
    await harness.waitForFunction("document.querySelector('#cloudSidebar').classList.contains('is-open') && !document.querySelector('#cloudSidebarBackdrop').hidden");
    const sidebarAbierto = await harness.evaluate(`(() => {
      const sidebar = document.querySelector('#cloudSidebar').getBoundingClientRect();
      const backdrop = document.querySelector('#cloudSidebarBackdrop').getBoundingClientRect();
      const close = document.querySelector('#cloudSidebarClose').getBoundingClientRect();
      const filter = document.querySelector('#cloudSidebar .cloud-filter').getBoundingClientRect();
      const sidebarStyle = getComputedStyle(document.querySelector('#cloudSidebar'));
      return {
        innerWidth,
        innerHeight,
        headerBottom: document.querySelector('.cloud-topbar').getBoundingClientRect().bottom,
        sidebar: { left: sidebar.left, right: sidebar.right, top: sidebar.top, bottom: sidebar.bottom, width: sidebar.width, height: sidebar.height },
        backdrop: { left: backdrop.left, right: backdrop.right, top: backdrop.top, bottom: backdrop.bottom },
        close: { width: close.width, height: close.height },
        filterHeight: filter.height,
        ariaExpanded: document.querySelector('#cloudSidebarToggle').getAttribute('aria-expanded'),
        position: sidebarStyle.position,
        computedWidth: sidebarStyle.width,
        maxWidth: sidebarStyle.maxWidth,
        boxSizing: sidebarStyle.boxSizing,
        justifySelf: sidebarStyle.justifySelf,
        overflowHorizontal: document.documentElement.scrollWidth - innerWidth
      };
    })()`);
    assert.equal(sidebarAbierto.position, "fixed");
    assert.equal(sidebarAbierto.ariaExpanded, "true");
    assertBorde(sidebarAbierto.sidebar.left, 0, "móvil / sidebar abierto izquierda");
    assertBorde(sidebarAbierto.sidebar.top, sidebarAbierto.headerBottom, "móvil / sidebar abierto bajo cabecera");
    assertBorde(sidebarAbierto.sidebar.bottom, sidebarAbierto.innerHeight, "móvil / sidebar abierto abajo");
    assert.ok(sidebarAbierto.sidebar.width <= sidebarAbierto.innerWidth * 0.86 + 1, JSON.stringify(sidebarAbierto));
    assertBorde(sidebarAbierto.backdrop.left, 0, "móvil / backdrop izquierda");
    assertBorde(sidebarAbierto.backdrop.right, sidebarAbierto.innerWidth, "móvil / backdrop derecha");
    assertBorde(sidebarAbierto.backdrop.top, sidebarAbierto.headerBottom, "móvil / backdrop bajo cabecera");
    assertBorde(sidebarAbierto.backdrop.bottom, sidebarAbierto.innerHeight, "móvil / backdrop abajo");
    assert.ok(sidebarAbierto.close.width >= 42 && sidebarAbierto.close.height >= 42, JSON.stringify(sidebarAbierto));
    assert.ok(sidebarAbierto.filterHeight >= 43, JSON.stringify(sidebarAbierto));
    assert.ok(sidebarAbierto.overflowHorizontal <= 0);

    await harness.click("#cloudSidebarClose");
    await harness.waitForFunction("!document.querySelector('#cloudSidebar').classList.contains('is-open') && document.querySelector('#cloudSidebarBackdrop').hidden");
    assert.equal(await harness.evaluate("document.querySelector('#cloudSidebarToggle').getAttribute('aria-expanded')"), "false");

    await harness.click("#cloudListButton");
    await harness.waitForFunction("document.querySelector('#cloudItems').dataset.view === 'list' && document.querySelectorAll('.cloud-item-list').length === 6");
    const listaMovil = await harness.evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      listHeaderDisplay: getComputedStyle(document.querySelector('#cloudListHeader')).display,
      minHeight: Math.min(...[...document.querySelectorAll('.cloud-item-list')].map((item) => item.getBoundingClientRect().height)),
      maxRight: Math.max(...[...document.querySelectorAll('.cloud-item-list')].map((item) => item.getBoundingClientRect().right)),
      browserRight: document.querySelector('.cloud-browser').getBoundingClientRect().right,
      visibleMetadata: [...document.querySelectorAll('.cloud-item-list')].every((item) => getComputedStyle(item.querySelector('.cloud-item-type')).display !== 'none'),
      actionWidth: document.querySelector('.cloud-actions-menu summary').getBoundingClientRect().width,
      actionHeight: document.querySelector('.cloud-actions-menu summary').getBoundingClientRect().height
    }))()`);
    assert.equal(listaMovil.listHeaderDisplay, "none");
    assert.ok(listaMovil.minHeight >= 60, JSON.stringify(listaMovil));
    assert.ok(listaMovil.maxRight <= listaMovil.browserRight + 1, JSON.stringify(listaMovil));
    assert.equal(listaMovil.visibleMetadata, true, "en móvil queda visible al menos el tipo bajo el nombre");
    assert.ok(listaMovil.actionWidth >= 40 && listaMovil.actionHeight >= 40, `móvil / acción contextual táctil: ${JSON.stringify(listaMovil)}`);
    assert.ok(listaMovil.scrollWidth <= listaMovil.innerWidth);

    if (process.env.MI_NUBE_MOBILE_SCREENSHOT_PATH) {
      const captura = await harness.screenshot();
      await writeFile(process.env.MI_NUBE_MOBILE_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }
    assert.deepEqual(await harness.pageErrors(), []);
  } finally {
    await harness.close();
  }
});
