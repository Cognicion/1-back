import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Ejecución opcional: PLAYWRIGHT_MODULE_PATH apunta al paquete Playwright instalado.
// El HTML, CSS, formulario y motor son reales; Firebase usa exclusivamente datos ficticios.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright"); } catch {}
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stubs = new Map([
  ["/js/services/authContextService.js", 'export async function getAuthenticatedUserOnce() { return { uid: "qa-profesional" }; }'],
  ["/js/services/usuarios.js", `export async function listarPacientes() {
    return { docs: [{ id: "qa-sintetico", data: () => ({ rol: "paciente", nombre: "Ejemplo sintético QA", edad: 46,
      sexo: "masculino", signosVitales: { peso: "92", talla: "1,70" },
      datosInstitucionales: { peso: 92, talla: 170 } }) }] };
  }`],
  ["/js/services/tratamientos.js", 'export async function listarTratamientos() { return [{ medicamento: "Olanzapina", estado: "activo" }]; }'],
  ["/js/services/estudios.js", 'export async function listarEstudios() { return []; }'],
  ["/js/firebase.js", 'export const db = {};'],
  ["/js/services/themeBootstrap.js", ""],
  ["/js/components/accesosRapidos.js", ""],
  ["/js/reportes.js", ""]
]);

test("laboratorio: ejemplos, captura, panel, diseño continuo y móvil", { skip: !playwright, timeout: 90000 }, async () => {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (stubs.has(pathname)) {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(stubs.get(pathname));
    }
    const archivo = resolve(raiz, `.${pathname}`);
    if (!archivo.startsWith(`${raiz}${sep}`) || req.method !== "GET") {
      res.writeHead(403); return res.end();
    }
    try {
      const body = await readFile(archivo);
      res.writeHead(200, { "content-type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" })[extname(archivo)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await playwright.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errores = [];
    page.on("pageerror", (error) => errores.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      if (url.pathname.endsWith("/firebase-firestore.js")) {
        return route.fulfill({ contentType: "text/javascript", body: "export function collection() { return {}; } export async function getDocs() { return { docs: [] }; }" });
      }
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/laboratorio-farmacologia.html`);
    await page.waitForSelector('[data-parametro-campo="valor"]');
    assert.equal(await page.locator('[data-parametro-campo="valor"]').count(), 12);
    assert.equal(await page.locator("#farmacoSelectorPacientesPanel").isVisible(), false);

    const esperados = { creatinina: "0.8", eGFR: "105", uacr: "8", sodio: "140", potasio: "4.2", cloro: "102", bicarbonato: "25", magnesio: "2", calcio: "9.4", proteinasTotales: "7.2", albumina: "4.2", globulinas: "3" };
    await page.selectOption("#farmacoCasoEjemplo", "sano");
    for (const [id, valor] of Object.entries(esperados)) {
      assert.equal(await page.inputValue(`#farmacoParametro-${id}-valor`), valor, id);
    }
    assert.match(await page.locator("#farmacoImc").textContent(), /21\.97 kg\/m²/);
    assert.equal(await page.locator("#farmacoParametrosResumen .fuera-rango").count(), 0);
    assert.equal(await page.inputValue("#farmacoParametro-globulinas-rango"), "");
    assert.match(await page.locator("#farmacoParametrosResumen").textContent(), /1\.4/);

    // Los intervalos siguen editables y clasifican usando el rango elegido.
    await page.click('[data-editar-rango="sodio"]');
    await page.fill("#farmacoParametro-sodio-rango", "130-138");
    await page.locator("#farmacoParametro-sodio-rango").blur();
    assert.match(await page.locator("#farmacoParametrosResumen .fuera-rango").textContent(), /Sodio/);
    await page.click("#cargarCasoEjemplo");
    assert.equal(await page.inputValue("#farmacoParametro-sodio-rango"), "135–145");

    // Cargar otro caso limpia los resultados del sano y activa reglas diagnósticas.
    await page.selectOption("#farmacoCasoEjemplo", "colera-diuretico");
    assert.equal(await page.inputValue("#farmacoParametro-creatinina-valor"), "");
    assert.match(await page.locator("#resultadoInteraccionesFarmaco").textContent(), /Cólera y diurético/);
    await page.selectOption("#farmacoCasoEjemplo", "antipsicoticos-hta");
    assert.match(await page.locator("#resultadoInteraccionesFarmaco").textContent(), /IMC de cribado elevado/);
    await page.fill("#farmacoPeso", "62");
    assert.doesNotMatch(await page.locator("#resultadoInteraccionesFarmaco").textContent(), /IMC de cribado elevado/);

    // La integración usa las mismas medidas del expediente y permite vaciar la simulación.
    await page.selectOption("#farmacoCasoEjemplo", "sano");
    await page.click("#abrirPacientesPanelMedico");
    await page.click('[data-integrar-paciente="qa-sintetico"]');
    await page.waitForFunction(() => document.getElementById("farmacoContextoPaciente").dataset.estado === "integrado");
    assert.equal(await page.inputValue("#farmacoPeso"), "92");
    assert.equal(await page.inputValue("#farmacoTalla"), "170");
    assert.equal(await page.inputValue("#farmacoParametrosFecha"), "", "el expediente no hereda la fecha ficticia del ejemplo");
    assert.match(await page.locator("#farmacoImc").textContent(), /31\.83/);
    assert.match(await page.locator("#resultadoInteraccionesFarmaco").textContent(), /IMC de cribado elevado/);
    assert.equal(await page.locator("#farmacoSelectorPacientesPanel").isVisible(), false);
    await page.fill("#farmacoPeso", "");
    assert.equal(await page.locator("#farmacoImc").textContent(), "—");
    assert.doesNotMatch(await page.locator("#resultadoInteraccionesFarmaco").textContent(), /IMC de cribado elevado/);

    await page.selectOption("#farmacoCasoEjemplo", "sano");
    for (const theme of ["biocelular", "dark", "light"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const selector of [".farmaco-hero", ".farmaco-panel", ".farmaco-contexto-paciente", ".parametros-estudio", ".parametro-resultado"]) {
        const estilo = await page.locator(selector).first().evaluate((el) => {
          const s = getComputedStyle(el);
          return { radius: s.borderRadius, shadow: s.boxShadow, background: s.backgroundColor, image: s.backgroundImage, borderTop: s.borderTopWidth, borderRight: s.borderRightWidth };
        });
        assert.deepEqual(estilo, { radius: "0px", shadow: "none", background: "rgba(0, 0, 0, 0)", image: "none", borderTop: "0px", borderRight: "0px" }, `${theme}: ${selector}`);
      }
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = "biocelular"; window.scrollTo(0, 0); });
    if (process.env.FARMACO_QA_SCREENSHOTS) {
      await mkdir(process.env.FARMACO_QA_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: resolve(process.env.FARMACO_QA_SCREENSHOTS, "laboratorio-escritorio.png"), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "sin desbordamiento horizontal de la página");
    assert.equal(await page.locator('[data-parametro-campo="valor"]').count(), 12);
    await page.locator(".parametros-estudio > summary").first().click();
    assert.equal(await page.locator(".parametros-estudio").first().getAttribute("open"), null);
    await page.locator(".parametros-estudio > summary").first().click();
    if (process.env.FARMACO_QA_SCREENSHOTS) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: resolve(process.env.FARMACO_QA_SCREENSHOTS, "laboratorio-movil.png"), fullPage: true });
    }
    assert.deepEqual(errores, []);
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
  }
});
