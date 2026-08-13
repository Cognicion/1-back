import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [modulo, estilos, html] = await Promise.all([
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/nota.css", import.meta.url), "utf8"),
  readFile(new URL("../../nota.html", import.meta.url), "utf8")
]);

assert.match(modulo, /function construirContenedorPdfCognicion\(exportData = datosExportacionCognicion\(\)\)/);
assert.match(modulo, /function crearTablaSignosEvolucionPdfCognicion\(signosVitales = \{\}\)\s*\{\s*if \(!esRegistroPdfCognicion\(signosVitales\)\) return null;/);
assert.match(modulo, /crearTablaSignosEvolucionPdfCognicion\(datosPdf\.signosVitales\)/);
assert.match(modulo, /function obtenerFirmasPdfCognicion\(\)/);
assert.match(modulo, /document\.querySelectorAll\("\.seccion-firmas \.firma-campo"\)/);
assert.match(modulo, /\.some\(\(firma\) => firma\.nombre \|\| firma\.cargo \|\| firma\.cedula\)/);
assert.match(modulo, /Math\.min\(Math\.max\(firmasParaPdf\.length, 1\), 4\)/);
assert.match(modulo, /className = "pdf-firma"/);
assert.match(modulo, /NOMBRE, FIRMA Y C\\u00c9DULA PROFESIONAL DEL M\\u00c9DICO/);
assert.match(modulo, /C\\u00e9d\. Prof\./);
assert.match(modulo, /document\.body\.classList\.add\("modo-impresion-cognicion"\)/);
assert.match(modulo, /window\.addEventListener\("afterprint", manejadorAfterPrintCognicion/);
assert.doesNotMatch(modulo, /addEventListener\("focus", manejadorFocusPrintCognicion/);
assert.match(modulo, /etapa = "construccion"/);
assert.match(modulo, /etapa = "impresion"/);
assert.match(modulo, /registrarErrorPdfCognicion\(etapa, error\)/);
assert.match(modulo, /typeof window\.print !== "function"/);
assert.match(modulo, /await esperarRenderPdfCognicion\(\)/);
assert.match(modulo, /await esperarFuentesPdfCognicion\(\)/);
assert.match(modulo, /await esperarImagenesPdfCognicion\(contenedorPdfCognicionActivo\)/);
assert.match(modulo, /TIMEOUT_RECURSO_PDF_COGNICION_MS/);
assert.match(modulo, /error\.code = "PDF_EMPTY_DOCUMENT"/);
assert.match(modulo, /error\.code = "PDF_ZERO_DIMENSIONS"/);
assert.match(modulo, /boton\.textContent = "Generando PDF\.\.\."/);
assert.doesNotMatch(modulo, /setTimeout\(limpiarContenedorPdfCognicion, 1000\)/);
assert.doesNotMatch(modulo, /window\.generarPDFNota\s*=\s*function\(\)\s*\{\s*window\.print\(\)/);

assert.match(estilos, /@page\s*\{\s*size:\s*A4 portrait;/);
assert.match(estilos, /\.cognicion-pdf-documento\s*\{[\s\S]*?display:\s*block;[\s\S]*?left:\s*-10000px;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\*\s*\{\s*display:\s*none !important;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\.cognicion-pdf-documento/);
assert.match(estilos, /grid-template-columns:\s*repeat\(var\(--columnas-firmas, 1\), minmax\(0, 1fr\)\)/);
assert.match(estilos, /\.pdf-firma\s*\{[\s\S]*?break-inside:\s*avoid !important;[\s\S]*?page-break-inside:\s*avoid !important;/);
assert.doesNotMatch(estilos, /@media print\s*\{\s*body\s*\{/);

assert.match(html, /css\/nota\.css\?v=20260729-signos-vitales-export-v1/);
assert.match(html, /js\/nota\.js\?v=20260812-pdf-cognicion-null-v1/);

console.log("cognicionPdf: ok");
