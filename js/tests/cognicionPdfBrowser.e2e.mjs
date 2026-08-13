import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { launchChromeHarness } from "./helpers/chrome-cdp.mjs";

const notaJs = await readFile(new URL("../nota.js", import.meta.url), "utf8");

function extraerFuncion(codigo, nombre) {
  let inicio = codigo.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `No se encontró ${nombre}`);
  if (codigo.slice(Math.max(0, inicio - 6), inicio) === "async ") inicio -= 6;
  const finFirma = codigo.indexOf("\n", inicio);
  const apertura = codigo.lastIndexOf("{", finFirma);
  let profundidad = 0;
  for (let indice = apertura; indice < codigo.length; indice += 1) {
    if (codigo[indice] === "{") profundidad += 1;
    if (codigo[indice] === "}") profundidad -= 1;
    if (profundidad === 0) return codigo.slice(inicio, indice + 1);
  }
  throw new Error(`No se pudo extraer ${nombre}`);
}

const fuentesProduccion = [
  "valorConUnidadSignoVital",
  "agregarBloqueEvolucionPdfCognicion",
  "crearTablaSignosEvolucionPdfCognicion",
  "construirContenedorPdfCognicion",
  "esperarImagenPdfCognicion",
  "esperarImagenesPdfCognicion"
].map((nombre) => extraerFuncion(notaJs, nombre)).join("\n");

test("Chrome genera un PDF A4 con signos null, Unicode, texto largo y un logo ausente", { timeout: 30000 }, async () => {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const harness = await launchChromeHarness({
    rootDirectory: raiz,
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 }
  });

  try {
    await harness.navigate("/js/tests/fixtures/cognicion-pdf-blank.html");
    const resultado = await harness.evaluate(`(async () => {
      const seguridad = await import("/js/export/cognicionPdfSafety.js");
      const css = await fetch("/css/nota.css").then((respuesta) => respuesta.text());
      document.documentElement.innerHTML = '<head><base href="/"><meta charset="utf-8"><style></style></head><body></body>';
      document.querySelector("style").textContent = css;

      const cuerpoRuntime = [
        'const { esRegistroPdfCognicion, esperarConTimeoutPdfCognicion, fechaSeguraPdfCognicion, textoSeguroPdfCognicion } = seguridad;',
        'const TIMEOUT_RECURSO_PDF_COGNICION_MS = 2000;',
        'const CAMPOS_SIGNOS_VITALES_PDF_COGNICION = [["presionArterial", "Presión arterial", "mmHg"], ["frecuenciaCardiaca", "Frecuencia cardíaca", "lpm"]];',
        'let pacienteActualDatos = { nombres: "Paciente", apellidoPaterno: "QA", fechaNacimiento: "1990-01-01", sexo: "X" };',
        'function datosInstitucionalesPaciente() { return { expediente: "QA-001", edad: "36", sexo: "X" }; }',
        'function obtenerNombrePacienteParaMostrar() { return "Paciente QA"; }',
        'function crearSeccionDiagnosticosEvolucionPdfCognicion() { return null; }',
        'function obtenerFirmasPdfCognicion() { return []; }',
        'function crearSeccionFirmasPdfCognicion() { return null; }',
        ${JSON.stringify(fuentesProduccion)},
        'return { construirContenedorPdfCognicion, esperarImagenPdfCognicion, esperarImagenesPdfCognicion };'
      ].join("\\n");
      const runtime = new Function("seguridad", cuerpoRuntime)(seguridad);
      const unicode = "áéíóú ñ ü ¿¡ µ 🧠 \\uD800";
      const documento = runtime.construirContenedorPdfCognicion({
        signosVitales: null,
        diagnosticos: [null, undefined],
        subjetivo: unicode + "\\n" + "Texto clínico sintético. ".repeat(900),
        objetivo: undefined,
        analisis: { texto: "Objeto conocido normalizado" },
        plan: "Medicamento A 1 mg\\nMedicamento B 2 mg\\nMedicamento C 3 mg",
        observacionFray: { fechaNota: { seconds: 1786557600, nanoseconds: 0 } }
      });
      document.body.appendChild(documento);
      document.body.classList.add("modo-impresion-cognicion");
      documento.querySelector("img").src = "/assets/logo-inexistente-qa.png";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const imagenes = await runtime.esperarImagenesPdfCognicion(documento);
      const imagenRequerida = document.createElement("img");
      imagenRequerida.src = "/assets/imagen-requerida-inexistente-qa.png";
      documento.appendChild(imagenRequerida);
      let codigoImagenRequerida = "";
      try {
        await runtime.esperarImagenPdfCognicion(imagenRequerida);
      } catch (error) {
        codigoImagenRequerida = error.code || "";
      }
      imagenRequerida.remove();

      const parcial = runtime.construirContenedorPdfCognicion({
        signosVitales: { presionArterial: "120/80" },
        subjetivo: "Nota normal",
        observacionFray: { fechaNota: "2026-08-12" }
      });
      const tablaParcial = Boolean(parcial.querySelector(".cognicion-pdf-evolucion__signos"));
      const texto = documento.innerText;
      globalThis.__pdfCognicionQa = documento;
      return {
        imagenes,
        codigoImagenRequerida,
        tablaSignosAusente: !documento.querySelector(".cognicion-pdf-evolucion__signos"),
        tablaParcial,
        unicodePreservado: texto.includes(unicode),
        textoLargo: texto.length > 20000,
        ancho: documento.scrollWidth,
        alto: documento.scrollHeight
      };
    })()`);

    assert.equal(resultado.tablaSignosAusente, true);
    assert.equal(resultado.tablaParcial, true);
    assert.equal(resultado.unicodePreservado, true);
    assert.equal(resultado.textoLargo, true);
    assert.equal(resultado.imagenes.total, 2);
    assert.equal(resultado.imagenes.fallidas, 1);
    assert.equal(resultado.codigoImagenRequerida, "PDF_REQUIRED_IMAGE_UNAVAILABLE");
    assert.ok(resultado.ancho > 0);
    assert.ok(resultado.alto > 0);

    const pdfMovil = await harness.cdp.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true
    });
    assert.match(pdfMovil.data, /^JVBERi0/);
    assert.ok(pdfMovil.data.length > 10000);

    await harness.setViewport(1440, 900);
    const pdfEscritorio = await harness.cdp.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true
    });
    assert.match(pdfEscritorio.data, /^JVBERi0/);
    assert.ok(pdfEscritorio.data.length > 10000);

    assert.deepEqual(await harness.pageErrors(), []);
  } finally {
    await harness.close();
  }
});
