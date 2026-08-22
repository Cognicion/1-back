const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const RAIZ = path.resolve(__dirname, "..");
const URL_DASHBOARD = "http://127.0.0.1:8765/dashboard.html";

async function prepararPagina(pagina) {
  await pagina.route(/\.js(?:\?|$)/, (ruta) => ruta.abort());
  await pagina.goto(URL_DASHBOARD, { waitUntil: "domcontentloaded" });
  await pagina.evaluate(() => localStorage.clear());
  await pagina.addScriptTag({
    path: path.join(RAIZ, "js", "componentes", "vista-orbital-panel-principal.js")
  });
  await pagina.waitForFunction(() => document.querySelector(".dashboard-section")?.dataset.vistaModulos === "lista");
}

async function medirLista(pagina) {
  return pagina.evaluate(() => {
    const filas = [...document.querySelectorAll("[data-vista-tarjetas] .module-card")]
      .filter((fila) => getComputedStyle(fila).display !== "none");
    const rectangulos = filas.map((fila) => fila.getBoundingClientRect());
    const anchoDocumento = document.documentElement.scrollWidth;
    const primeraAccion = document.querySelector('[data-vista-tarjetas] .module-card .card-actions :is(a, button)');
    const estilosAccion = primeraAccion ? getComputedStyle(primeraAccion) : null;
    const estilosContenedorAccion = primeraAccion?.parentElement ? getComputedStyle(primeraAccion.parentElement) : null;
    return {
      vista: document.querySelector(".dashboard-section")?.dataset.vistaModulos,
      filas: filas.length,
      alturas: rectangulos.slice(0, 10).map((rectangulo) => Math.round(rectangulo.height)),
      filasEnViewport: rectangulos.filter((rectangulo) => rectangulo.top < innerHeight && rectangulo.bottom > 0).length,
      scrollHorizontal: anchoDocumento > document.documentElement.clientWidth,
      encabezado: Math.round(document.querySelector("body > header")?.getBoundingClientRect().height || 0),
      bienvenida: Math.round(document.querySelector(".dashboard-intro")?.getBoundingClientRect().height || 0),
      seccion: Math.round(document.querySelector(".section-heading")?.getBoundingClientRect().height || 0),
      accion: estilosAccion ? {
        background: estilosAccion.backgroundColor,
        border: estilosAccion.borderColor,
        contenedor: estilosContenedorAccion?.backgroundColor
      } : null
    };
  });
}

(async () => {
  const navegador = await chromium.launch({
    headless: true,
    executablePath: process.env.NAVEGADOR_PRUEBAS || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const escritorio = await navegador.newPage({ viewport: { width: 1536, height: 864 } });
  await prepararPagina(escritorio);

  const inicial = await medirLista(escritorio);
  assert.equal(inicial.vista, "lista");
  assert.equal(inicial.scrollHorizontal, false);
  assert.ok(inicial.alturas.every((altura) => altura >= 52 && altura <= 64), JSON.stringify(inicial.alturas));
  assert.ok(inicial.filasEnViewport >= 7, String(inicial.filasEnViewport));
  const filasInteractivas = await escritorio.evaluate(() => {
    const visibles = [...document.querySelectorAll("[data-vista-tarjetas] .module-card")]
      .filter((fila) => getComputedStyle(fila).display !== "none");
    const insigniasOmitidas = [...document.querySelectorAll(".badge.insignia-omitida-en-lista")];
    return {
      navegables: visibles.filter((fila) => fila.querySelector(":scope > .fila-modulo-enlace")).length,
      omitidas: insigniasOmitidas.map((insignia) => ({
        texto: insignia.textContent.trim(),
        display: getComputedStyle(insignia).display
      }))
    };
  });
  assert.ok(filasInteractivas.navegables >= inicial.filas - 1, String(filasInteractivas.navegables));
  assert.ok(filasInteractivas.omitidas.length >= 3);
  assert.ok(filasInteractivas.omitidas.every((insignia) => insignia.display === "none"));

  await escritorio.click('[data-seleccionar-vista="orbita"]');
  assert.equal(await escritorio.getAttribute("orbita-panel-principal", "data-pausada"), null);
  assert.equal(await escritorio.isHidden("[data-vista-tarjetas]"), true);
  assert.equal(await escritorio.evaluate(() => document.querySelector("orbita-panel-principal")?.shadowRoot?.querySelectorAll(".laboratory-orbit-action").length), inicial.filas);

  await escritorio.reload({ waitUntil: "domcontentloaded" });
  await escritorio.addScriptTag({
    path: path.join(RAIZ, "js", "componentes", "vista-orbital-panel-principal.js")
  });
  await escritorio.waitForFunction(() => document.querySelector(".dashboard-section")?.dataset.vistaModulos === "orbita");
  assert.equal(await escritorio.getAttribute('[data-seleccionar-vista="orbita"]', "aria-pressed"), "true");

  await escritorio.click('[data-seleccionar-vista="tarjetas"]');
  assert.equal(await escritorio.getAttribute("orbita-panel-principal", "data-pausada"), "");
  assert.equal(await escritorio.isVisible("[data-vista-tarjetas]"), true);
  assert.notEqual(await escritorio.locator(".badge.insignia-omitida-en-lista").first().evaluate((insignia) => getComputedStyle(insignia).display), "none");

  await escritorio.click('[data-seleccionar-vista="lista"]');
  assert.equal(await escritorio.evaluate(() => localStorage.getItem("cognicion:dashboard:vista-modulos")), "lista");
  if (process.env.CAPTURA_DASHBOARD) {
    await escritorio.screenshot({ path: process.env.CAPTURA_DASHBOARD, fullPage: true });
  }

  for (const tema of ["dark", "biocelular", "light"]) {
    await escritorio.evaluate((temaActivo) => {
      document.documentElement.dataset.theme = temaActivo;
    }, tema);
    const estadoTema = await medirLista(escritorio);
    assert.equal(estadoTema.scrollHorizontal, false, tema);
    assert.equal(estadoTema.filas, inicial.filas, tema);
  }

  const tableta = await navegador.newPage({ viewport: { width: 820, height: 1180 } });
  await prepararPagina(tableta);
  const intermedio = await medirLista(tableta);
  assert.equal(intermedio.scrollHorizontal, false);
  assert.ok(intermedio.filasEnViewport >= 7, String(intermedio.filasEnViewport));

  const movil = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  await prepararPagina(movil);
  const compacto = await medirLista(movil);
  assert.equal(compacto.scrollHorizontal, false);
  assert.ok(compacto.alturas.every((altura) => altura >= 74), JSON.stringify(compacto.alturas));
  if (process.env.CAPTURA_DASHBOARD_MOVIL) {
    await movil.screenshot({ path: process.env.CAPTURA_DASHBOARD_MOVIL, fullPage: true });
  }

  const navegacionFila = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
  await prepararPagina(navegacionFila);
  const primeraFila = navegacionFila.locator("[data-vista-tarjetas] .module-card:visible").first();
  const destinoFila = await primeraFila.locator(":scope > .fila-modulo-enlace").getAttribute("href");
  await primeraFila.click({ position: { x: 180, y: 28 } });
  await navegacionFila.waitForURL((url) => url.pathname.endsWith(`/${destinoFila}`));

  console.log(JSON.stringify({ escritorio: inicial, tableta: intermedio, movil: compacto, filasInteractivas }, null, 2));
  await navegador.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
