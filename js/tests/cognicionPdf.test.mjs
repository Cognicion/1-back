import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [modulo, estilos, html] = await Promise.all([
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/nota.css", import.meta.url), "utf8"),
  readFile(new URL("../../nota.html", import.meta.url), "utf8")
]);

assert.match(modulo, /function construirContenedorPdfCognicion\(\)/);
assert.match(modulo, /\["tratamiento", "medico", "ultimaConsulta", "proximaConsulta"\]\.forEach\(agregarCampo\)/);
assert.match(modulo, /function obtenerFirmasPdfCognicion\(\)/);
assert.match(modulo, /#bloqueObservacionFray \.seccion-firmas \.firma-campo/);
assert.match(modulo, /\.filter\(\(firma\) => firma\.nombre \|\| firma\.cargo \|\| firma\.cedula\)/);
assert.match(modulo, /Math\.min\(Math\.max\(firmas\.length, 1\), 4\)/);
assert.match(modulo, /className = "pdf-firma"/);
assert.match(modulo, /NOMBRE, FIRMA Y C\\u00c9DULA PROFESIONAL DEL M\\u00c9DICO/);
assert.match(modulo, /C\\u00e9d\. Prof\./);
assert.match(modulo, /document\.body\.classList\.add\("modo-impresion-cognicion"\)/);
assert.match(modulo, /window\.addEventListener\("afterprint", manejadorAfterPrintCognicion/);
assert.match(modulo, /await esperarRenderPdfCognicion\(\)/);
assert.match(modulo, /await esperarImagenesPdfCognicion\(contenedorPdfCognicionActivo\)/);
assert.match(modulo, /if \(!texto\) throw new Error\("El contenedor temporal/);
assert.match(modulo, /boton\.textContent = "Generando PDF\.\.\."/);
assert.doesNotMatch(modulo, /setTimeout\(limpiarContenedorPdfCognicion, 1000\)/);
assert.doesNotMatch(modulo, /window\.generarPDFNota\s*=\s*function\(\)\s*\{\s*window\.print\(\)/);

assert.match(estilos, /@page\s*\{\s*size:\s*A4 portrait;/);
assert.match(estilos, /\.cognicion-pdf-documento\s*\{[\s\S]*?display:\s*block;[\s\S]*?left:\s*-10000px;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\*\s*\{\s*display:\s*none !important;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\.cognicion-pdf-documento/);
assert.match(estilos, /grid-template-columns:\s*repeat\(var\(--cantidad-columnas, 1\), minmax\(0, 1fr\)\)/);
assert.match(estilos, /\.pdf-firma\s*\{[\s\S]*?break-inside:\s*avoid !important;[\s\S]*?page-break-inside:\s*avoid !important;/);
assert.doesNotMatch(estilos, /@media print\s*\{\s*body\s*\{/);

assert.match(html, /css\/nota\.css\?v=20260716-pdf2/);
assert.match(html, /js\/nota\.js\?v=20260716-5/);

console.log("cognicionPdf: ok");
