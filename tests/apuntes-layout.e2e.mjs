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

function luminanciaRelativa({ r, g, b }) {
  const canales = [r, g, b].map((canal) => {
    const normalizado = canal / 255;
    return normalizado <= 0.04045
      ? normalizado / 12.92
      : ((normalizado + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * canales[0]) + (0.7152 * canales[1]) + (0.0722 * canales[2]);
}

function relacionContraste(primerColor, segundoColor) {
  const primera = luminanciaRelativa(primerColor);
  const segunda = luminanciaRelativa(segundoColor);
  return (Math.max(primera, segunda) + 0.05) / (Math.min(primera, segunda) + 0.05);
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

function documentoDemo({ accesosDemo = true } = {}) {
  const hostAccesos = accesosDemo
    ? `<div data-accesos-rapidos data-global-header-access class="accesos-rapidos">
        <button class="accesos-rapidos-toggle" type="button"><span aria-hidden="true">⚡</span> Accesos rápidos</button>
      </div>`
    : '<div data-accesos-rapidos data-global-header-access></div>';
  return htmlFuente
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace("<head>", '<head><base href="/">')
    .replace('<body class="bloqueado pagina-apuntes">', '<body class="pagina-apuntes">')
    .replace("</head>", `<style>${cssApuntes}\n${cssTema}\n${cssAccesos}\n${cssReportes}</style></head>`)
    .replace('<div data-accesos-rapidos data-global-header-access></div>', hostAccesos)
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
    document.body.classList.toggle(
      "reporte-global-contraido",
      Boolean(widget?.classList.contains("reporte-widget-contraido"))
    );
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

test("el navbar común se monta una sola vez y deja el shell unido al encabezado", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1536, height: 864 } });
  try {
    await harness.navigate("/tests/fixtures/apuntes-origin.html");
    const { frameTree } = await harness.cdp.send("Page.getFrameTree");
    await harness.cdp.send("Page.setDocumentContent", {
      frameId: frameTree.frame.id,
      html: documentoDemo({ accesosDemo: false })
    });
    await harness.waitForFunction("document.readyState === 'complete' && Boolean(document.querySelector('.apuntes-shell'))");
    await harness.evaluate("history.replaceState({}, '', '/apuntes.html')");
    const moduloNavbar = `${harness.origin}/js/components/globalAppHeader.js`;
    const montaje = await harness.evaluate(`import(${JSON.stringify(moduloNavbar)}).then(async ({ mountGlobalAppHeader }) => {
      const primero = await mountGlobalAppHeader();
      const segundo = await mountGlobalAppHeader();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const header = document.querySelector("header.topbar-apuntes");
      const shell = document.querySelector(".apuntes-shell");
      const sidebar = document.querySelector(".apuntes-sidebar");
      const editor = document.querySelector(".apuntes-editor");
      const branding = header.querySelector("[data-global-header-branding]");
      const discovery = header.querySelector(".global-header-discovery");
      const toolbar = document.querySelector(".barra-formato");
      const visor = document.querySelector("#lienzoApunte");
      const hoja = document.querySelector("#hojaApunte");
      const contenido = document.querySelector(".editor-contenido");
      const zoomHoja = document.querySelector(".controles-zoom-hoja");
      const footer = document.querySelector(".acciones-apuntes");
      const guardar = document.querySelector("#guardarApunte");
      const eliminar = document.querySelector("#eliminarApunte");
      const rect = (elemento) => {
        const r = elemento.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const estiloHeader = getComputedStyle(header);
      const estiloDiscovery = getComputedStyle(discovery);
      const estiloEditor = getComputedStyle(editor);
      const estiloFooter = getComputedStyle(footer);
      return {
        mismoControlador: primero === segundo,
        pageId: primero?.pageId,
        encabezados: document.querySelectorAll("body > header.topbar-apuntes").length,
        montados: document.querySelectorAll("[data-global-app-header]").length,
        brandings: header.querySelectorAll("[data-global-header-branding]").length,
        acciones: header.querySelectorAll(".global-header-actions").length,
        descubrimientos: header.querySelectorAll(".global-header-discovery").length,
        accesos: header.querySelectorAll("[data-accesos-rapidos]").length,
        notificaciones: header.querySelectorAll("[data-global-notifications-link], [data-global-header-notifications]").length,
        role: header.getAttribute("role"),
        ariaLabel: header.getAttribute("aria-label"),
        titulo: header.querySelector("[data-global-header-title]")?.textContent?.trim(),
        descripcion: header.querySelector("[data-global-header-description]")?.textContent?.trim(),
        header: rect(header),
        headerPosition: estiloHeader.position,
        shell: rect(shell),
        sidebar: rect(sidebar),
        editor: rect(editor),
        branding: rect(branding),
        discovery: {
          ...rect(discovery),
          borde: [
            estiloDiscovery.borderTopWidth,
            estiloDiscovery.borderRightWidth,
            estiloDiscovery.borderBottomWidth,
            estiloDiscovery.borderLeftWidth
          ]
        },
        discoveryButtons: [...discovery.querySelectorAll(".global-header-discovery__actions > :where(a, button):not([hidden])")].map(rect),
        toolbar: rect(toolbar),
        visor: rect(visor),
        hoja: rect(hoja),
        contenido: rect(contenido),
        zoomHoja: rect(zoomHoja),
        footer: rect(footer),
        guardar: rect(guardar),
        eliminar: rect(eliminar),
        editorPadding: {
          top: Number.parseFloat(estiloEditor.paddingTop),
          right: Number.parseFloat(estiloEditor.paddingRight),
          bottom: Number.parseFloat(estiloEditor.paddingBottom),
          left: Number.parseFloat(estiloEditor.paddingLeft)
        },
        editorGap: Number.parseFloat(estiloEditor.rowGap),
        footerPaddingRight: Number.parseFloat(estiloFooter.paddingRight),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        rutas: [...header.querySelectorAll('.global-header-actions > a[href]')].map((enlace) => enlace.getAttribute('href'))
      };
    })`);

    assert.equal(montaje.mismoControlador, true);
    assert.equal(montaje.pageId, "apuntes");
    assert.deepEqual(
      [montaje.encabezados, montaje.montados, montaje.brandings, montaje.acciones, montaje.descubrimientos, montaje.accesos, montaje.notificaciones],
      [1, 1, 1, 1, 1, 1, 1]
    );
    assert.equal(montaje.role, "banner");
    assert.equal(montaje.ariaLabel, "Encabezado de Mis apuntes");
    assert.equal(montaje.titulo, "Mis apuntes");
    assert.equal(montaje.descripcion, "Notas personales, recordatorios y pendientes.");
    assert.ok(montaje.rutas.includes("nota.html"), JSON.stringify(montaje.rutas));
    assert.ok(montaje.rutas.includes("dashboard.html"), JSON.stringify(montaje.rutas));
    assertBorde(montaje.header.top, 0, "navbar real / borde superior");
    assertBorde(montaje.header.left, 0, "navbar real / borde izquierdo");
    assertBorde(montaje.header.right, montaje.viewportWidth, "navbar real / borde derecho");
    assertBorde(montaje.header.height, 56, "navbar real / alto compacto");
    assert.equal(montaje.headerPosition, "sticky");
    assertBorde(montaje.shell.top, montaje.header.bottom, "navbar real / shell pegado al header");
    assertBorde(montaje.shell.bottom, montaje.viewportHeight, "navbar real / shell al fondo");
    assertBorde(montaje.sidebar.bottom, montaje.shell.bottom, "navbar real / sidebar al fondo");
    assertBorde(montaje.editor.bottom, montaje.shell.bottom, "navbar real / editor al fondo");
    assertBorde(montaje.scrollHeight, montaje.viewportHeight, "navbar real / sin espacio muerto inferior");
    assertBorde(montaje.branding.left, montaje.sidebar.left, "navbar real / branding alineado al sidebar");
    assertBorde(montaje.branding.right, montaje.sidebar.right, "navbar real / branding termina en el divisor");
    assertBorde(montaje.branding.right, montaje.editor.left, "navbar real / branding alineado al editor");
    assertBorde(montaje.discovery.left, montaje.editor.left + 16, "navbar real / discovery dentro de la columna del editor");
    assertBorde(montaje.discovery.height, 32, "navbar real / discovery compacto");
    assert.deepEqual(montaje.discovery.borde, ["0px", "0px", "0px", "0px"]);
    assert.equal(montaje.discoveryButtons.length, 2);
    for (const boton of montaje.discoveryButtons) {
      assertBorde(boton.width, 28, "navbar real / acción discovery ancho");
      assertBorde(boton.height, 28, "navbar real / acción discovery alto");
    }
    assert.deepEqual(montaje.editorPadding, { top: 14, right: 16, bottom: 10, left: 16 });
    assertBorde(montaje.editorGap, 8, "editor real / separación compacta");
    assertBorde(montaje.visor.left, montaje.editor.left + montaje.editorPadding.left, "visor de hoja / borde izquierdo útil");
    assertBorde(montaje.visor.right, montaje.editor.right - montaje.editorPadding.right, "visor de hoja / borde derecho útil");
    assertBorde(montaje.visor.top, montaje.toolbar.bottom + montaje.editorGap, "visor de hoja / unido a toolbar");
    assertBorde(montaje.visor.bottom + montaje.editorGap, montaje.footer.top, "visor de hoja / unido al footer");
    assertBorde(montaje.footer.left, montaje.visor.left, "footer real / alineado al visor izquierdo");
    assertBorde(montaje.footer.right, montaje.visor.right, "footer real / alineado al visor derecho");
    assertBorde(montaje.footer.bottom, montaje.editor.bottom - montaje.editorPadding.bottom, "footer real / sin espacio muerto inferior");
    assert.ok(montaje.visor.height >= 600, `visor de hoja maximizado: ${JSON.stringify(montaje.visor)}`);
    assert.ok(montaje.hoja.width >= 180 && montaje.hoja.height >= 250, `hoja visible: ${JSON.stringify(montaje.hoja)}`);
    assert.ok(montaje.hoja.left >= montaje.visor.left && montaje.hoja.right <= montaje.visor.right, `hoja contenida horizontalmente: ${JSON.stringify(montaje)}`);
    assert.ok(montaje.zoomHoja.bottom < montaje.footer.top, `zoom de hoja libre del pie: ${JSON.stringify(montaje)}`);
    assert.ok(montaje.zoomHoja.right <= montaje.visor.right, `zoom de hoja dentro del visor: ${JSON.stringify(montaje)}`);
    assertBorde(montaje.footer.height, 36, "footer real / alto compacto");
    assertBorde(montaje.footerPaddingRight, 205, "footer real / reserva Reportar expandido");
    assertBorde(montaje.guardar.width, 96, "Guardar escritorio / ancho");
    assertBorde(montaje.guardar.height, 36, "Guardar escritorio / alto");
    assertBorde(montaje.eliminar.width, 92, "Eliminar escritorio / ancho");
    assertBorde(montaje.eliminar.height, 36, "Eliminar escritorio / alto");

    await harness.waitForFunction("Boolean(document.querySelector('[data-acceso-toggle]'))");
    await harness.click("[data-acceso-toggle]");
    const accesoFuncional = await harness.evaluate(`(() => ({
      expandido: document.querySelector("[data-acceso-toggle]")?.getAttribute("aria-expanded"),
      panelOculto: document.querySelector("[data-acceso-panel]")?.getAttribute("aria-hidden"),
      panelAbierto: document.querySelector("[data-accesos-rapidos]")?.classList.contains("abierto")
    }))()`);
    assert.deepEqual(accesoFuncional, { expandido: "true", panelOculto: "false", panelAbierto: true });

    const sugerenciaInicial = await harness.evaluate("document.querySelector('.global-header-discovery__text')?.textContent");
    await harness.click("[data-global-tip-next]");
    await harness.waitForFunction(`document.querySelector('.global-header-discovery__text')?.textContent !== ${JSON.stringify(sugerenciaInicial)}`);
    if (process.env.APUNTES_NAVBAR_SCREENSHOT_PATH) {
      await harness.evaluate(`new Promise((resolve) => {
        document.querySelector("#reporteGlobalWidget")?.classList.add("reporte-widget-contraido");
        document.body.classList.add("reporte-global-contraido");
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`);
      const captura = await harness.screenshot();
      await writeFile(process.env.APUNTES_NAVBAR_SCREENSHOT_PATH, Buffer.from(captura, "base64"));
    }
  } finally {
    await harness.close();
  }
});

test("Biocelular no confunde el formulario real de carpetas con una pantalla de login", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1024, height: 768 } });
  try {
    await harness.navigate("/tests/fixtures/apuntes-origin.html");
    const { frameTree } = await harness.cdp.send("Page.getFrameTree");
    await harness.cdp.send("Page.setDocumentContent", {
      frameId: frameTree.frame.id,
      html: documentoDemo({ accesosDemo: false })
    });
    await harness.waitForFunction("document.readyState === 'complete' && Boolean(document.querySelector('#formularioCarpeta'))");
    await harness.evaluate("history.replaceState({}, '', '/apuntes.html')");
    const moduloBiocelular = `${harness.origin}/js/themes/biocellularThemeController.js?qa=formulario-carpeta`;
    const estado = await harness.evaluate(`import(${JSON.stringify(moduloBiocelular)}).then(async ({ activateBiocellularTheme }) => {
      await activateBiocellularTheme();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const formulario = document.querySelector("#formularioCarpeta");
      const host = document.querySelector("#cognicion-biocellular-background");
      return {
        tagFormulario: formulario?.tagName,
        formularioReal: formulario?.closest("#dialogoCarpeta")?.id === "dialogoCarpeta",
        loginReal: Boolean(document.querySelector("#login, .login-container, #loginForm, .login-form")),
        claseLogin: document.body.classList.contains("biocellular-login-page"),
        hostCreado: Boolean(host),
        canvasCreado: Boolean(host?.querySelector("canvas.biocellular-background"))
      };
    })`);

    assert.deepEqual(estado, {
      tagFormulario: "FORM",
      formularioReal: true,
      loginReal: false,
      claseLogin: false,
      hostCreado: true,
      canvasCreado: true
    });
  } finally {
    await harness.evaluate("globalThis.__cognicionBiocellularDeactivate?.()").catch(() => {});
    await harness.close();
  }
});

test("selector de carpetas mantiene contraste AA y esquema nativo en biocelular y claro", async () => {
  const harness = await launchChromeHarness({ rootDirectory: raiz, viewport: { width: 1024, height: 768 } });
  try {
    await montarDocumento(harness);
    const medirTema = async (tema, esquemaEsperado) => harness.evaluate(`(async () => {
      document.documentElement.dataset.theme = ${JSON.stringify(tema)};
      const select = document.querySelector("#apunteCarpeta");
      if (select.options.length < 2) select.add(new Option("Cardiología", "cardiologia"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const parsear = (valor) => {
        const componentes = String(valor).match(/[\\d.]+/g)?.map(Number) || [];
        return {
          r: componentes[0] || 0,
          g: componentes[1] || 0,
          b: componentes[2] || 0,
          a: componentes.length > 3 ? componentes[3] : 1
        };
      };
      const superponer = (frente, fondo) => {
        const alfa = frente.a + fondo.a * (1 - frente.a);
        if (!alfa) return { r: 0, g: 0, b: 0, a: 0 };
        return {
          r: ((frente.r * frente.a) + (fondo.r * fondo.a * (1 - frente.a))) / alfa,
          g: ((frente.g * frente.a) + (fondo.g * fondo.a * (1 - frente.a))) / alfa,
          b: ((frente.b * frente.a) + (fondo.b * fondo.a * (1 - frente.a))) / alfa,
          a: alfa
        };
      };
      const fondoEfectivo = (elemento) => {
        const capas = [];
        for (let actual = elemento; actual; actual = actual.parentElement) {
          capas.push(parsear(getComputedStyle(actual).backgroundColor));
        }
        let fondo = { r: 255, g: 255, b: 255, a: 1 };
        for (const capa of capas.reverse()) fondo = superponer(capa, fondo);
        return fondo;
      };
      const opcion = select.options[1];
      const estiloSelect = getComputedStyle(select);
      const estiloOpcion = getComputedStyle(opcion);
      return {
        selectColor: parsear(estiloSelect.color),
        selectFondo: fondoEfectivo(select),
        optionColor: parsear(estiloOpcion.color),
        optionFondo: parsear(estiloOpcion.backgroundColor),
        selectColorScheme: estiloSelect.colorScheme,
        optionColorScheme: estiloOpcion.colorScheme
      };
    })()`);

    for (const [tema, esquema] of [["biocelular", "dark"], ["light", "light"]]) {
      const metricas = await medirTema(tema, esquema);
      const contrasteSelect = relacionContraste(metricas.selectColor, metricas.selectFondo);
      const contrasteOption = relacionContraste(metricas.optionColor, metricas.optionFondo);
      assert.ok(contrasteSelect >= 4.5, `${tema}: contraste select ${contrasteSelect.toFixed(2)}; ${JSON.stringify(metricas)}`);
      assert.ok(contrasteOption >= 4.5, `${tema}: contraste option ${contrasteOption.toFixed(2)}; ${JSON.stringify(metricas)}`);
      assert.ok(metricas.optionFondo.a >= 0.99, `${tema}: option requiere fondo opaco; ${JSON.stringify(metricas.optionFondo)}`);
      assert.equal(metricas.selectColorScheme, esquema);
      assert.equal(metricas.optionColorScheme, esquema);
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
      const guardar = document.querySelector("#guardarApunte").getBoundingClientRect();
      const estado = document.querySelector("#estadoApuntes").getBoundingClientRect();
      const reporte = document.querySelector(".reporte-float-btn").getBoundingClientRect();
      const contraerReporte = document.querySelector(".reporte-contraer-btn").getBoundingClientRect();
      const acciones = document.querySelector(".acciones-apuntes");
      const accionesRect = acciones.getBoundingClientRect();
      const estiloAcciones = getComputedStyle(acciones);
      const colorTexto = document.querySelector("#abrirColorTexto");
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
        accionesWidth: accionesRect.width,
        accionesPaddingRight: Number.parseFloat(estiloAcciones.paddingRight),
        accionesColumnas: estiloAcciones.gridTemplateColumns,
        guardarWidth: guardar.width,
        guardarHeight: guardar.height,
        eliminarWidth: eliminar.width,
        eliminarHeight: eliminar.height,
        reporteContraido: document.querySelector("#reporteGlobalWidget").classList.contains("reporte-widget-contraido"),
        bodyReporteContraido: document.body.classList.contains("reporte-global-contraido"),
        diferenciaCentroFila: Math.max(
          Math.abs(((estado.top + estado.bottom) / 2) - ((guardar.top + guardar.bottom) / 2)),
          Math.abs(((guardar.top + guardar.bottom) / 2) - ((eliminar.top + eliminar.bottom) / 2))
        ),
        espacioMuertoDerecha: accionesRect.right - Math.max(estado.right, guardar.right, eliminar.right),
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
    assert.equal(metricas.bodyReporteContraido, true);
    assert.ok(metricas.accionesPaddingRight >= 51 && metricas.accionesPaddingRight <= 53, detalleSolapamiento);
    assert.ok(metricas.espacioMuertoDerecha >= 51 && metricas.espacioMuertoDerecha <= 53, detalleSolapamiento);
    assert.ok(metricas.diferenciaCentroFila <= 1, `390px / status y acciones deben compartir fila: ${detalleSolapamiento}`);
    assert.ok(metricas.guardarHeight >= 44, `390px táctil / Guardar: ${detalleSolapamiento}`);
    assert.ok(metricas.eliminarHeight >= 44, `390px táctil / Eliminar: ${detalleSolapamiento}`);
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
      document.body.classList.remove("reporte-global-contraido");
      setTimeout(resolve, 260);
    })`);
    const reporteExpandido = await harness.evaluate(`(() => ({
      eliminarRight: document.querySelector("#eliminarApunte").getBoundingClientRect().right,
      reporteLeft: document.querySelector(".reporte-float-btn").getBoundingClientRect().left,
      contraerReporteLeft: document.querySelector(".reporte-contraer-btn").getBoundingClientRect().left,
      accionesPaddingRight: Number.parseFloat(getComputedStyle(document.querySelector(".acciones-apuntes")).paddingRight),
      bodyReporteContraido: document.body.classList.contains("reporte-global-contraido")
    }))()`);
    assert.ok(reporteExpandido.eliminarRight <= reporteExpandido.reporteLeft, JSON.stringify(reporteExpandido));
    assert.ok(reporteExpandido.eliminarRight <= reporteExpandido.contraerReporteLeft, JSON.stringify(reporteExpandido));
    assert.equal(reporteExpandido.bodyReporteContraido, false);
    assert.ok(reporteExpandido.accionesPaddingRight >= 180, `expandido conserva reserva: ${JSON.stringify(reporteExpandido)}`);
    assert.ok(reporteExpandido.accionesPaddingRight - metricas.accionesPaddingRight >= 120, JSON.stringify(reporteExpandido));
    await harness.evaluate(`new Promise((resolve) => {
      document.querySelector("#reporteGlobalWidget")?.classList.add("reporte-widget-contraido");
      document.body.classList.add("reporte-global-contraido");
      setTimeout(resolve, 260);
    })`);

    await harness.setViewport(360, 800, { mobile: true });
    const telefonoCompacto = await harness.evaluate(`(async () => {
      const acciones = document.querySelector(".acciones-apuntes");
      acciones.scrollIntoView({ block: "end" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const estado = rect("#estadoApuntes");
      const guardar = rect("#guardarApunte");
      const eliminar = rect("#eliminarApunte");
      const reporte = rect(".reporte-float-btn");
      const contraer = rect(".reporte-contraer-btn");
      const accionesRect = acciones.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        topbarHeight: document.querySelector(".topbar-apuntes").getBoundingClientRect().height,
        eliminarRight: eliminar.right,
        reporteLeft: reporte.left,
        contraerReporteLeft: contraer.left,
        accionesPaddingRight: Number.parseFloat(getComputedStyle(acciones).paddingRight),
        espacioMuertoDerecha: accionesRect.right - Math.max(estado.right, guardar.right, eliminar.right),
        diferenciaCentroFila: Math.max(
          Math.abs(((estado.top + estado.bottom) / 2) - ((guardar.top + guardar.bottom) / 2)),
          Math.abs(((guardar.top + guardar.bottom) / 2) - ((eliminar.top + eliminar.bottom) / 2))
        ),
        guardarHeight: guardar.height,
        eliminarHeight: eliminar.height,
        reporteContraido: document.querySelector("#reporteGlobalWidget").classList.contains("reporte-widget-contraido"),
        bodyReporteContraido: document.body.classList.contains("reporte-global-contraido")
      };
    })()`);
    assert.ok(telefonoCompacto.scrollWidth <= 360, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.topbarHeight <= 60, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.eliminarRight <= telefonoCompacto.reporteLeft, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.eliminarRight <= telefonoCompacto.contraerReporteLeft, JSON.stringify(telefonoCompacto));
    assert.equal(telefonoCompacto.reporteContraido, true);
    assert.equal(telefonoCompacto.bodyReporteContraido, true);
    assert.ok(telefonoCompacto.accionesPaddingRight >= 51 && telefonoCompacto.accionesPaddingRight <= 53, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.espacioMuertoDerecha >= 51 && telefonoCompacto.espacioMuertoDerecha <= 53, JSON.stringify(telefonoCompacto));
    assert.ok(telefonoCompacto.diferenciaCentroFila <= 1, `360px / status y acciones deben compartir fila: ${JSON.stringify(telefonoCompacto)}`);
    assert.ok(telefonoCompacto.guardarHeight >= 44, `360px táctil / Guardar: ${JSON.stringify(telefonoCompacto)}`);
    assert.ok(telefonoCompacto.eliminarHeight >= 44, `360px táctil / Eliminar: ${JSON.stringify(telefonoCompacto)}`);

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
        alternarSidebarDisplay: getComputedStyle(alternarSidebar).display,
        guardarApunteHeight: document.querySelector("#guardarApunte").getBoundingClientRect().height,
        eliminarApunteHeight: document.querySelector("#eliminarApunte").getBoundingClientRect().height,
        eliminarRight: document.querySelector("#eliminarApunte").getBoundingClientRect().right,
        contraerReporteLeft: document.querySelector(".reporte-contraer-btn").getBoundingClientRect().left
      };
    })()`);
    assert.ok(tableta.limpiarWidth >= 68);
    assert.ok(tableta.limpiarScrollWidth <= tableta.limpiarClientWidth);
    assert.ok(tableta.accionCarpetaWidth >= 40);
    assert.ok(tableta.contraerWidth >= 40);
    assert.ok(tableta.nuevoApunteHeight >= 40);
    assert.ok(tableta.nuevaCarpetaHeight >= 40);
    assert.equal(tableta.alternarSidebarDisplay, "grid");
    assert.ok(tableta.guardarApunteHeight >= 44, JSON.stringify(tableta));
    assert.ok(tableta.eliminarApunteHeight >= 44, JSON.stringify(tableta));
    assert.ok(tableta.eliminarRight <= tableta.contraerReporteLeft, JSON.stringify(tableta));
    assertBorde(tableta.alternarSidebarWidth, 44, "tableta táctil / ancho del toggle");
    assertBorde(tableta.alternarSidebarHeight, 44, "tableta táctil / alto del toggle");
  } finally {
    await harness.close();
  }
});
