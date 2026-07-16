import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [modulo, estilos, html] = await Promise.all([
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/nota.css", import.meta.url), "utf8"),
  readFile(new URL("../../nota.html", import.meta.url), "utf8")
]);

assert.match(modulo, /function construirContenedorPdfCognicion\(\)/);
assert.match(modulo, /\["tratamiento", "medico", "ultimaConsulta", "proximaConsulta"\]\.forEach\(agregarCampo\)/);
assert.match(modulo, /querySelectorAll\("\.seccion-firmas \.firma-campo"\)/);
assert.match(modulo, /Math\.min\(firmas\.length, 6\)/);
assert.match(modulo, /document\.body\.classList\.add\("modo-impresion-cognicion"\)/);
assert.match(modulo, /window\.addEventListener\("afterprint", limpiarContenedorPdfCognicion/);
assert.doesNotMatch(modulo, /window\.generarPDFNota\s*=\s*function\(\)\s*\{\s*window\.print\(\)/);

assert.match(estilos, /@page\s*\{\s*size:\s*A4 portrait;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\*\s*\{\s*display:\s*none !important;/);
assert.match(estilos, /body\.modo-impresion-cognicion\s*>\s*\.cognicion-pdf-documento/);
assert.match(estilos, /grid-template-columns:\s*repeat\(var\(--cantidad-firmas, 1\), minmax\(0, 1fr\)\)/);
assert.doesNotMatch(estilos, /@media print\s*\{\s*body\s*\{/);

assert.match(html, /css\/nota\.css\?v=20260716-pdf1/);
assert.match(html, /js\/nota\.js\?v=20260716-4/);

console.log("cognicionPdf: ok");
