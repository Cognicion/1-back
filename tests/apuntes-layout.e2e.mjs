import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchChromeHarness } from "../js/tests/helpers/chrome-cdp.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOLERANCIA_BORDE_PX = 1;

function assertBorde(actual, esperado, etiqueta) {
  assert.ok(
    Math.abs(actual - esperado) <= TOLERANCIA_BORDE_PX,
    `${etiqueta}: esperado ${esperado}px, recibido ${actual}px`
  );
}

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

const [htmlFuente, cssApuntes, cssAccesos, cssReportes, ...fragmentosTema] = await Promise.all([
  readFile(resolve(raiz, "apuntes.html"), "utf8"),
  readFile(resolve(raiz, "css/apuntes.css"), "utf8"),
  readFile(resolve(raiz, "css/accesos-rapidos.css"), "utf8"),
  readFile(resolve(raiz, "css/reportes.css"), "utf8"),
  ...rutasTema.map((ruta) => readFile(resolve(raiz, ruta), "utf8"))
]);
const cssTema = fragmentosTema.join("\n");

const gruposDemo = `
  <section class="carpeta-apuntes">
    <div class="carpeta-cabecera">
      <button type="button" class="carpeta-toggle" data-accion="alternar-carpeta" aria-expanded="true" aria-controls="demo-cardiologia">
        <span class="carpeta-toggle__flecha" aria-hidden="true">›</span>
        <span class="carpeta-toggle__icono" aria-hidden="true"></span>
        <span class="carpeta-toggle__nombre">Cardiología</span>
        <span class="carpeta-toggle__cantidad">2</span>
      </button>
      <div class="carpeta-acciones">
        <button type="button" class="carpeta-accion" aria-label="Nuevo apunte">＋</button>
        <button type="button" class="carpeta-accion" aria-label="Renombrar carpeta">✎</button>
        <button type="button" class="carpeta-accion" aria-label="Eliminar carpeta">×</button>
      </div>
    </div>
    <div id="demo-cardiologia" class="carpeta-contenido">
      <button type="button" class="apunte-item activo" aria-selected="true">
        <strong class="apunte-item__titulo">Regla del 7-38-55</strong>
        <span class="apunte-item__preview">Comunicación verbal, tono de voz y lenguaje corporal.</span>
      </button>
      <button type="button" class="apunte-item" aria-selected="false">
        <strong class="apunte-item__titulo">Control de presión arterial</strong>
        <span class="apunte-item__preview">Registro y seguimiento semanal.</span>
      </button>
    </div>
  </section>
  <section class="carpeta-apuntes">
    <div class="carpeta-cabecera">
      <button type="button" class="carpeta-toggle" aria-expanded="false" aria-controls="demo-pendientes">
        <span class="carpeta-toggle__flecha" aria-hidden="true">›</span>
        <span class="carpeta-toggle__icono" aria-hidden="true"></span>
        <span class="carpeta-toggle__nombre">Pendientes</span>
        <span class="carpeta-toggle__cantidad">3</span>
      </button>
      <div class="carpeta-acciones">
        <button type="button" class="carpeta-accion" aria-label="Nuevo apunte">＋</button>
        <button type="button" class="carpeta-accion" aria-label="Renombrar carpeta">✎</button>
        <button type="button" class="carpeta-accion" aria-label="Eliminar carpeta">×</button>
      </div>
    </div>
    <div id="demo-pendientes" class="carpeta-contenido" hidden></div>
  </section>`;

function documentoDemo() {
  return htmlFuente
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace('<body class="bloqueado pagina-apuntes">', '<body class="pagina-apuntes">')
    .replace("</head>", `<style>${cssApuntes}\n${cssTema}\n${cssAccesos}\n${cssReportes}</style></head>`)
    .replace('<div data-accesos-rapidos></div>', `
      <div data-accesos-rapidos class="accesos-rapidos">
        <button class="accesos-rapidos-toggle" type="button"><span aria-hidden="true">⚡</span> Accesos rápidos</button>
      </div>`)
    .replace('<div id="listaApuntes" class="lista-apuntes" aria-live="polite">Cargando apuntes...</div>', `<div id="listaApuntes" class="lista-apuntes" aria-live="polite">${gruposDemo}</div>`)
    .replace('id="apunteTitulo" autocomplete="off"', 'id="apunteTitulo" value="Regla del 7-38-55" autocomplete="off"')
    .replace('id="apunteContenido"\n        class="editor-contenido"', 'id="apunteContenido"\n        class="editor-contenido"')
    .replace('      ></div>', `      ><div>Según la regla de Mehrabian, el <b>lenguaje verbal</b> representa solo el <span style="color:#ffb4a8;background-color:#63331d">7% de la comunicación</span>.</div><div><br></div><div>Este lienzo aprovecha todo el espacio disponible para escribir.</div></div>`)
    .replace("</body>", `
      <div id="reporteGlobalWidget">
        <button class="reporte-float-btn" type="button"><span>Reportar</span><small>problema o sugerencia</small></button>
        <button class="reporte-contraer-btn" type="button" aria-label="Contraer">&gt;</button>
      </div>
    </body>`);
}

async function montarDocumento(harness, { uidSidebar = "qa-sidebar" } = {}) {
  await harness.navigate("/tests/fixtures/apuntes-origin.html");
  const { frameTree } = await harness.cdp.send("Page.getFrameTree");
  await harness.cdp.send("Page.setDocumentContent", {
    frameId: frameTree.frame.id,
    html: documentoDemo()
  });
  await harness.waitForFunction("document.readyState === 'complete' && Boolean(document.querySelector('.apuntes-shell'))");
  const moduloSidebar = `${harness.origin}/js/apuntes-sidebar.js`;
  await harness.evaluate(`import(${JSON.stringify(moduloSidebar)}).then(({ inicializarSidebarApuntes }) => {
    globalThis.__qaSidebarApuntes?.destruir?.();
    globalThis.__qaSidebarApuntes = inicializarSidebarApuntes({
      uid: ${JSON.stringify(uidSidebar)},
      shell: document.querySelector(".apuntes-shell"),
      sidebar: document.querySelector("#sidebarApuntes"),
      boton: document.querySelector("#alternarSidebarApuntes")
    });
  })`);
  await harness.evaluate(`(() => {
    const widget = document.querySelector("#reporteGlobalWidget");
    const contraerPorDefecto = document.body.classList.contains("pagina-apuntes")
      && matchMedia("(max-width: 720px)").matches
      && localStorage.getItem("cognicion.reporteGlobal.contraido") === null;
    widget?.classList.toggle("reporte-widget-contraido", contraerPorDefecto);
  })()`);
  await harness.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

test("apuntes ocupa el escritorio y mantiene libres Guardar y Eliminar", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1536, height: 864 } });
  try {
    await montarDocumento(harness);
    const metricas = await harness.evaluate(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const eliminar = rect("#eliminarApunte");
      const reporte = rect(".reporte-float-btn");
      const contraerReporte = rect(".reporte-contraer-btn");
      return {
        viewport: innerWidth,
        viewportHeight: innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        topbar: rect(".topbar-apuntes"),
        shell: rect(".apuntes-shell"),
        sidebar: rect(".apuntes-sidebar"),
        editor: rect(".apuntes-editor"),
        contenido: rect(".editor-contenido"),
        eliminar,
        reporte,
        contraerReporte,
        seSuperponen: !(eliminar.right <= reporte.left || reporte.right <= eliminar.left || eliminar.bottom <= reporte.top || reporte.bottom <= eliminar.top),
        seSuperponeContraer: !(eliminar.right <= contraerReporte.left || contraerReporte.right <= eliminar.left || eliminar.bottom <= contraerReporte.top || contraerReporte.bottom <= eliminar.top),
        overflowHorizontal: document.documentElement.scrollWidth - innerWidth
      };
    })()`);

    assertBorde(metricas.topbar.top, 0, "cabecera / borde superior");
    assertBorde(metricas.topbar.left, 0, "cabecera / borde izquierdo");
    assertBorde(metricas.topbar.right, metricas.viewport, "cabecera / borde derecho");
    assert.ok(metricas.topbar.height <= 60, `cabecera compacta: ${metricas.topbar.height}px`);
    assertBorde(metricas.shell.top, metricas.topbar.bottom, "shell / sin espacio bajo cabecera");
    assertBorde(metricas.shell.left, 0, "shell / borde izquierdo");
    assertBorde(metricas.shell.right, metricas.viewport, "shell / borde derecho");
    assertBorde(metricas.shell.bottom, metricas.viewportHeight, "shell / borde inferior");
    assertBorde(metricas.scrollHeight, metricas.viewportHeight, "documento / sin desborde vertical");
    assertBorde(metricas.sidebar.left, metricas.shell.left, "sidebar / borde izquierdo");
    assertBorde(metricas.sidebar.top, metricas.shell.top, "sidebar / borde superior");
    assertBorde(metricas.sidebar.bottom, metricas.shell.bottom, "sidebar / borde inferior");
    assertBorde(metricas.editor.right, metricas.shell.right, "editor / borde derecho");
    assertBorde(metricas.editor.top, metricas.shell.top, "editor / borde superior");
    assertBorde(metricas.editor.bottom, metricas.shell.bottom, "editor / borde inferior");
    assertBorde(metricas.editor.left, metricas.sidebar.right, "columnas / sin separación");
    assert.ok(metricas.editor.width > metricas.sidebar.width * 2.5);
    assert.ok(metricas.contenido.height > 500);
    assert.equal(metricas.seSuperponen, false);
    assert.equal(metricas.seSuperponeContraer, false);
    assert.ok(metricas.contraerReporte.right < metricas.reporte.left);
    assert.ok(metricas.overflowHorizontal <= 0);

    const moduloTextoRico = `${harness.origin}/js/apuntes-rich-text.js`;
    const saneado = await harness.evaluate(`import(${JSON.stringify(moduloTextoRico)}).then(({ sanitizarHTMLRico, colorCSSSeguro }) => {
      globalThis.__apuntesXss = false;
      const html = sanitizarHTMLRico('<script>globalThis.__apuntesXss=true</script><img src=x onerror="globalThis.__apuntesXss=true"><b onclick="alert(1)">Negrita</b><span style="color:rgb(10, 20, 30);background-color:#ffeeaa;position:fixed">Color</span><em>texto</em><svg onload="globalThis.__apuntesXss=true"></svg>');
      return {
        html,
        ejecutado: globalThis.__apuntesXss,
        colorValido: colorCSSSeguro('#ffeeaa'),
        colorPeligroso: colorCSSSeguro('url(javascript:alert(1))')
      };
    })`);
    assert.equal(saneado.ejecutado, false);
    assert.match(saneado.html, /<b>Negrita<\/b>/);
    assert.match(saneado.html, /<span style=/);
    assert.match(saneado.html, />texto$/);
    assert.doesNotMatch(saneado.html, /script|img|onclick|position|svg|<em/i);
    assert.equal(saneado.colorValido, "#ffeeaa");
    assert.equal(saneado.colorPeligroso, "");

    const formato = await harness.evaluate(`import(${JSON.stringify(moduloTextoRico)}).then(({ sanitizarHTMLRico }) => {
      const editor = document.querySelector('#apunteContenido');
      editor.innerHTML = 'negrita color';
      const seleccionar = (inicio, fin) => {
        const rango = document.createRange();
        rango.setStart(editor.firstChild, inicio);
        rango.setEnd(editor.firstChild, fin);
        const seleccion = getSelection();
        seleccion.removeAllRanges();
        seleccion.addRange(rango);
      };
      seleccionar(0, 7);
      document.execCommand('bold', false, null);
      const nodoColor = [...editor.childNodes].find((nodo) => nodo.textContent.includes(' color'));
      const textoColor = nodoColor.nodeType === Node.TEXT_NODE ? nodoColor : nodoColor.nextSibling;
      const rangoColor = document.createRange();
      rangoColor.setStart(textoColor, textoColor.textContent.indexOf('color'));
      rangoColor.setEnd(textoColor, textoColor.textContent.indexOf('color') + 5);
      const seleccionColor = getSelection();
      seleccionColor.removeAllRanges();
      seleccionColor.addRange(rangoColor);
      document.execCommand('foreColor', false, '#e05a4f');
      document.execCommand('hiliteColor', false, '#70451b');
      return sanitizarHTMLRico(editor.innerHTML);
    })`);
    assert.match(formato, /<(b|strong)>negrita<\/(b|strong)>/);
    assert.match(formato, /color:\s*(rgb\(224, 90, 79\)|#e05a4f)/i);
    assert.match(formato, /background-color:\s*(rgb\(112, 69, 27\)|#70451b)/i);

    const captura = await harness.screenshot();
    assert.ok(captura.length > 20_000);
    if (process.env.APUNTES_SCREENSHOT_PATH) {
      await writeFile(process.env.APUNTES_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }
  } finally {
    await harness.close();
  }
});

test("el sidebar se retrae sin romper la geometría, accesibilidad ni persistencia", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1536, height: 864 } });
  const uidSidebar = "qa-sidebar-persistente";
  const claveSidebar = `cognicion:apuntes:sidebar-retraida:${uidSidebar}`;
  try {
    await montarDocumento(harness, { uidSidebar });
    const expandido = await harness.evaluate(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const sidebar = document.querySelector("#sidebarApuntes");
      const boton = document.querySelector("#alternarSidebarApuntes");
      return {
        viewport: innerWidth,
        shell: rect(".apuntes-shell"),
        sidebar: rect("#sidebarApuntes"),
        editor: rect(".apuntes-editor"),
        boton: rect("#alternarSidebarApuntes"),
        nuevo: rect("#nuevoApunte"),
        carpeta: rect("#nuevaCarpeta"),
        editorPaddingLeft: Number.parseFloat(getComputedStyle(document.querySelector(".apuntes-editor")).paddingLeft),
        ariaExpanded: boton.getAttribute("aria-expanded"),
        ariaHidden: sidebar.getAttribute("aria-hidden"),
        inert: sidebar.inert,
        etiqueta: boton.getAttribute("aria-label")
      };
    })()`);

    assert.ok(expandido.sidebar.width >= 276 && expandido.sidebar.width <= 360, JSON.stringify(expandido));
    assertBorde(expandido.sidebar.left, expandido.shell.left, "sidebar expandido / borde izquierdo");
    assertBorde(expandido.editor.left, expandido.sidebar.right, "sidebar expandido / unión con editor");
    assertBorde(expandido.editor.right, expandido.shell.right, "sidebar expandido / editor al borde derecho");
    assertBorde(expandido.boton.left, expandido.editor.left + expandido.editorPaddingLeft, "toggle / dentro de la cabecera del editor");
    assertBorde(expandido.boton.width, 40, "toggle / ancho minimalista");
    assertBorde(expandido.boton.height, 42, "toggle / alto accesible");
    assert.ok(expandido.nuevo.height >= 32 && expandido.nuevo.height <= 34, JSON.stringify(expandido.nuevo));
    assert.ok(expandido.carpeta.height >= 32 && expandido.carpeta.height <= 34, JSON.stringify(expandido.carpeta));
    assert.ok(expandido.nuevo.width < 110 && expandido.carpeta.width < 110, "los botones de alta deben ser compactos");
    assert.equal(expandido.ariaExpanded, "true");
    assert.equal(expandido.ariaHidden, null);
    assert.equal(expandido.inert, false);
    assert.equal(expandido.etiqueta, "Ocultar panel lateral");

    await harness.click("#alternarSidebarApuntes");
    await harness.waitForFunction(`document.querySelector(".apuntes-shell").classList.contains("sidebar-retraida")
      && document.querySelector("#sidebarApuntes").getBoundingClientRect().width <= 1`);
    const retraido = await harness.evaluate(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const sidebar = document.querySelector("#sidebarApuntes");
      const boton = document.querySelector("#alternarSidebarApuntes");
      document.querySelector("#buscadorApuntes").focus();
      return {
        shell: rect(".apuntes-shell"),
        sidebar: rect("#sidebarApuntes"),
        editor: rect(".apuntes-editor"),
        boton: rect("#alternarSidebarApuntes"),
        editorPaddingLeft: Number.parseFloat(getComputedStyle(document.querySelector(".apuntes-editor")).paddingLeft),
        ariaExpanded: boton.getAttribute("aria-expanded"),
        ariaHidden: sidebar.getAttribute("aria-hidden"),
        inert: sidebar.inert,
        etiqueta: boton.getAttribute("aria-label"),
        focoDentro: sidebar.contains(document.activeElement),
        persistido: localStorage.getItem(${JSON.stringify(claveSidebar)}),
        overflowHorizontal: document.documentElement.scrollWidth - innerWidth
      };
    })()`);

    assertBorde(retraido.sidebar.width, 0, "sidebar retraído / ancho cero");
    assertBorde(retraido.editor.left, retraido.shell.left, "sidebar retraído / editor desde el borde izquierdo");
    assertBorde(retraido.editor.right, retraido.shell.right, "sidebar retraído / editor al borde derecho");
    assertBorde(retraido.boton.left, retraido.editor.left + retraido.editorPaddingLeft, "sidebar retraído / toggle dentro del editor");
    assertBorde(retraido.editor.width - expandido.editor.width, expandido.sidebar.width, "sidebar retraído / espacio cedido al editor");
    assert.equal(retraido.ariaExpanded, "false");
    assert.equal(retraido.ariaHidden, "true");
    assert.equal(retraido.inert, true);
    assert.equal(retraido.etiqueta, "Mostrar panel lateral");
    assert.equal(retraido.focoDentro, false);
    assert.equal(retraido.persistido, "1");
    assert.ok(retraido.overflowHorizontal <= 0);
    if (process.env.APUNTES_COLLAPSED_SCREENSHOT_PATH) {
      const captura = await harness.screenshot();
      await writeFile(process.env.APUNTES_COLLAPSED_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }

    await montarDocumento(harness, { uidSidebar });
    await harness.waitForFunction(`document.querySelector(".apuntes-shell").classList.contains("sidebar-retraida")
      && document.querySelector("#sidebarApuntes").getBoundingClientRect().width <= 1`);
    const restaurado = await harness.evaluate(`(() => {
      const sidebar = document.querySelector("#sidebarApuntes");
      const boton = document.querySelector("#alternarSidebarApuntes");
      return {
        ancho: sidebar.getBoundingClientRect().width,
        inert: sidebar.inert,
        ariaHidden: sidebar.getAttribute("aria-hidden"),
        ariaExpanded: boton.getAttribute("aria-expanded")
      };
    })()`);
    assertBorde(restaurado.ancho, 0, "sidebar restaurado / ancho cero");
    assert.equal(restaurado.inert, true);
    assert.equal(restaurado.ariaHidden, "true");
    assert.equal(restaurado.ariaExpanded, "false");

    await harness.click("#alternarSidebarApuntes");
    await harness.waitForFunction(`!document.querySelector(".apuntes-shell").classList.contains("sidebar-retraida")
      && document.querySelector("#sidebarApuntes").getBoundingClientRect().width >= 275`);
    const reabierto = await harness.evaluate(`(() => {
      const sidebar = document.querySelector("#sidebarApuntes");
      const boton = document.querySelector("#alternarSidebarApuntes");
      return {
        unido: Math.abs(sidebar.getBoundingClientRect().right - document.querySelector(".apuntes-editor").getBoundingClientRect().left),
        inert: sidebar.inert,
        ariaHidden: sidebar.getAttribute("aria-hidden"),
        ariaExpanded: boton.getAttribute("aria-expanded"),
        persistido: localStorage.getItem(${JSON.stringify(claveSidebar)})
      };
    })()`);
    assert.ok(reabierto.unido <= TOLERANCIA_BORDE_PX);
    assert.equal(reabierto.inert, false);
    assert.equal(reabierto.ariaHidden, null);
    assert.equal(reabierto.ariaExpanded, "true");
    assert.equal(reabierto.persistido, "0");
  } finally {
    await harness.close();
  }
});

test("apuntes conserva controles accesibles y sin desborde en móvil táctil", async () => {
  const harness = await launchChromeHarness({
    rootDirectory: raiz,
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 }
  });
  try {
    await harness.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await montarDocumento(harness);
    const metricas = await harness.evaluate(`(async () => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const bordes = {
        viewportWidth: innerWidth,
        scrollHeight: document.documentElement.scrollHeight,
        topbar: rect(".topbar-apuntes"),
        shell: rect(".apuntes-shell"),
        sidebar: rect(".apuntes-sidebar"),
        editor: rect(".apuntes-editor")
      };
      document.querySelector(".acciones-apuntes").scrollIntoView({ block: "end" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const eliminar = document.querySelector("#eliminarApunte").getBoundingClientRect();
      const reporte = document.querySelector(".reporte-float-btn").getBoundingClientRect();
      const contraerReporte = document.querySelector(".reporte-contraer-btn").getBoundingClientRect();
      const acciones = document.querySelector(".acciones-apuntes");
      const estiloAcciones = getComputedStyle(acciones);
      const colorTexto = document.querySelector("#colorTexto").closest(".control-color");
      const etiquetaColor = colorTexto.querySelector("span:nth-child(2)");
      const etiquetaLimpiar = document.querySelector("#quitarFormato span:last-child");
      return {
        bordes,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        sidebarHeight: document.querySelector(".apuntes-sidebar").getBoundingClientRect().height,
        accionesCarpetaOpacidad: getComputedStyle(document.querySelector(".carpeta-acciones")).opacity,
        eliminarRight: eliminar.right,
        reporteLeft: reporte.left,
        contraerReporteLeft: contraerReporte.left,
        contraerReporteRight: contraerReporte.right,
        accionesWidth: acciones.getBoundingClientRect().width,
        accionesPaddingRight: estiloAcciones.paddingRight,
        accionesColumnas: estiloAcciones.gridTemplateColumns,
        eliminarWidth: eliminar.width,
        reporteContraido: document.querySelector("#reporteGlobalWidget").classList.contains("reporte-widget-contraido"),
        topbarHeight: document.querySelector(".topbar-apuntes").getBoundingClientRect().height,
        colorTextoWidth: colorTexto.getBoundingClientRect().width,
        etiquetaColorDisplay: getComputedStyle(etiquetaColor).display,
        etiquetaLimpiarDisplay: getComputedStyle(etiquetaLimpiar).display,
        alternarSidebarDisplay: getComputedStyle(document.querySelector("#alternarSidebarApuntes")).display,
        sidebarInert: document.querySelector("#sidebarApuntes").inert,
        sidebarAriaHidden: document.querySelector("#sidebarApuntes").getAttribute("aria-hidden"),
        sidebarAriaExpanded: document.querySelector("#alternarSidebarApuntes").getAttribute("aria-expanded"),
        nuevoApunteHeight: document.querySelector("#nuevoApunte").getBoundingClientRect().height,
        nuevaCarpetaHeight: document.querySelector("#nuevaCarpeta").getBoundingClientRect().height,
        nuevoApunteTextoVisible: getComputedStyle(document.querySelector("#nuevoApunte span:last-child")).display,
        nuevaCarpetaTextoVisible: getComputedStyle(document.querySelector("#nuevaCarpeta span:last-child")).display,
        selectorCarpetaHeight: document.querySelector("#apunteCarpeta").getBoundingClientRect().height,
        toolbarOverflowX: getComputedStyle(document.querySelector(".barra-formato")).overflowX
      };
    })()`);

    assertBorde(metricas.bordes.topbar.top, 0, "móvil / cabecera superior");
    assertBorde(metricas.bordes.topbar.left, 0, "móvil / cabecera izquierda");
    assertBorde(metricas.bordes.topbar.right, metricas.bordes.viewportWidth, "móvil / cabecera derecha");
    assertBorde(metricas.bordes.shell.top, metricas.bordes.topbar.bottom, "móvil / sin espacio bajo cabecera");
    assertBorde(metricas.bordes.shell.left, 0, "móvil / shell izquierdo");
    assertBorde(metricas.bordes.shell.right, metricas.bordes.viewportWidth, "móvil / shell derecho");
    assertBorde(metricas.bordes.sidebar.left, metricas.bordes.shell.left, "móvil / sidebar izquierdo");
    assertBorde(metricas.bordes.sidebar.right, metricas.bordes.shell.right, "móvil / sidebar derecho");
    assertBorde(metricas.bordes.sidebar.top, metricas.bordes.shell.top, "móvil / sidebar superior");
    assertBorde(metricas.bordes.editor.left, metricas.bordes.shell.left, "móvil / editor izquierdo");
    assertBorde(metricas.bordes.editor.right, metricas.bordes.shell.right, "móvil / editor derecho");
    assertBorde(metricas.bordes.editor.top, metricas.bordes.sidebar.bottom, "móvil / sin separación entre paneles");
    assertBorde(metricas.bordes.editor.bottom, metricas.bordes.shell.bottom, "móvil / editor al fondo del shell");
    assertBorde(metricas.bordes.shell.bottom, metricas.bordes.scrollHeight, "móvil / sin espacio inferior");
    assert.ok(metricas.scrollWidth <= metricas.innerWidth);
    assert.ok(metricas.sidebarHeight >= 319);
    assert.equal(metricas.accionesCarpetaOpacidad, "1");
    const detalleSolapamiento = JSON.stringify(metricas);
    assert.ok(metricas.eliminarRight <= metricas.reporteLeft, detalleSolapamiento);
    assert.ok(metricas.eliminarRight <= metricas.contraerReporteLeft, detalleSolapamiento);
    assert.equal(metricas.reporteContraido, true);
    assert.ok(metricas.topbarHeight <= 60, detalleSolapamiento);
    assert.ok(metricas.colorTextoWidth >= 64, detalleSolapamiento);
    assert.notEqual(metricas.etiquetaColorDisplay, "none");
    assert.notEqual(metricas.etiquetaLimpiarDisplay, "none");
    assert.equal(metricas.alternarSidebarDisplay, "none", "el control lateral no debe ocupar espacio en móvil");
    assert.equal(metricas.sidebarInert, false, "el sidebar móvil permanece disponible");
    assert.equal(metricas.sidebarAriaHidden, null);
    assert.equal(metricas.sidebarAriaExpanded, "true");
    assert.ok(metricas.nuevoApunteHeight >= 40, detalleSolapamiento);
    assert.ok(metricas.nuevaCarpetaHeight >= 40, detalleSolapamiento);
    assert.notEqual(metricas.nuevoApunteTextoVisible, "none");
    assert.notEqual(metricas.nuevaCarpetaTextoVisible, "none");
    assert.ok(metricas.selectorCarpetaHeight >= 42, detalleSolapamiento);
    assert.equal(metricas.toolbarOverflowX, "auto");

    await harness.evaluate(`new Promise((resolve) => {
      document.querySelector("#reporteGlobalWidget")?.classList.remove("reporte-widget-contraido");
      setTimeout(resolve, 260);
    })`);
    const reporteExpandido = await harness.evaluate(`(() => ({
      eliminarRight: document.querySelector("#eliminarApunte").getBoundingClientRect().right,
      reporteLeft: document.querySelector(".reporte-float-btn").getBoundingClientRect().left,
      contraerReporteLeft: document.querySelector(".reporte-contraer-btn").getBoundingClientRect().left
    }))()`);
    assert.ok(reporteExpandido.eliminarRight <= reporteExpandido.reporteLeft, JSON.stringify(reporteExpandido));
    assert.ok(reporteExpandido.eliminarRight <= reporteExpandido.contraerReporteLeft, JSON.stringify(reporteExpandido));
    await harness.evaluate(`new Promise((resolve) => {
      document.querySelector("#reporteGlobalWidget")?.classList.add("reporte-widget-contraido");
      setTimeout(resolve, 260);
    })`);

    await harness.setViewport(360, 800, { mobile: true });
    const telefonoCompacto = await harness.evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      topbarHeight: document.querySelector(".topbar-apuntes").getBoundingClientRect().height,
      eliminarRight: document.querySelector("#eliminarApunte").getBoundingClientRect().right,
      contraerReporteLeft: document.querySelector(".reporte-contraer-btn").getBoundingClientRect().left
    }))()`);
    assert.ok(telefonoCompacto.scrollWidth <= 360, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.topbarHeight <= 60, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.eliminarRight <= telefonoCompacto.contraerReporteLeft, JSON.stringify(telefonoCompacto));

    await harness.setViewport(1024, 768, { mobile: true });
    const tableta = await harness.evaluate(`(() => {
      const limpiar = document.querySelector("#quitarFormato");
      const accionCarpeta = document.querySelector(".carpeta-accion");
      const contraer = document.querySelector(".reporte-contraer-btn");
      const alternarSidebar = document.querySelector("#alternarSidebarApuntes");
      return {
        limpiarWidth: limpiar.getBoundingClientRect().width,
        limpiarScrollWidth: limpiar.scrollWidth,
        limpiarClientWidth: limpiar.clientWidth,
        accionCarpetaWidth: accionCarpeta.getBoundingClientRect().width,
        contraerWidth: contraer.getBoundingClientRect().width,
        nuevoApunteHeight: document.querySelector("#nuevoApunte").getBoundingClientRect().height,
        nuevaCarpetaHeight: document.querySelector("#nuevaCarpeta").getBoundingClientRect().height,
        alternarSidebarWidth: alternarSidebar.getBoundingClientRect().width,
        alternarSidebarHeight: alternarSidebar.getBoundingClientRect().height,
        alternarSidebarDisplay: getComputedStyle(alternarSidebar).display
      };
    })()`);
    assert.ok(tableta.limpiarWidth >= 68);
    assert.ok(tableta.limpiarScrollWidth <= tableta.limpiarClientWidth);
    assert.ok(tableta.accionCarpetaWidth >= 40);
    assert.ok(tableta.contraerWidth >= 40);
    assert.ok(tableta.nuevoApunteHeight >= 40);
    assert.ok(tableta.nuevaCarpetaHeight >= 40);
    assert.equal(tableta.alternarSidebarDisplay, "grid");
    assertBorde(tableta.alternarSidebarWidth, 44, "tableta táctil / ancho del toggle");
    assertBorde(tableta.alternarSidebarHeight, 44, "tableta táctil / alto del toggle");
  } finally {
    await harness.close();
  }
});
