import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paginaModulo = readFileSync(resolve(raiz, "rehabilitacion-cognitiva.html"), "utf8");
const paginaEvc = readFileSync(resolve(raiz, "rehabilitacion-evc.html"), "utf8");
const scriptEvc = readFileSync(resolve(raiz, "js/rehabilitacion-evc.js"), "utf8");

assert.match(paginaModulo, /href="rehabilitacion-evc\.html"[^>]*data-enlace-rehabilitacion-evc/);
assert.match(paginaEvc, /id="dominiosEvaluacionEvc"/);
assert.match(paginaEvc, /id="planEvc"/);
assert.match(paginaEvc, /id="dialogPruebaEvc"/);
assert.match(paginaEvc, /Esta herramienta no es para síntomas agudos/);
assert.match(paginaEvc, /no puntos de corte clínicos, percentiles ni diagnósticos/i);
assert.match(paginaEvc, /Oxford Cognitive Screen \(OCS\)/);
assert.match(paginaEvc, /Programa de autorrehabilitación asistida/);
assert.match(paginaEvc, /pubmed\.ncbi\.nlm\.nih\.gov\/40503808/);
assert.match(paginaEvc, /pubmed\.ncbi\.nlm\.nih\.gov\/34823545/);
assert.match(scriptEvc, /generarPlanEvc/);
assert.match(scriptEvc, /calificarPruebaEvc/);
assert.match(scriptEvc, /progresoBateriaEvc/);
assert.match(scriptEvc, /urlConPaciente/);

const ids = [...paginaEvc.matchAll(/\sid="([^"]+)"/g)].map((coincidencia) => coincidencia[1]);
assert.equal(new Set(ids).size, ids.length, "La página EVC no debe contener IDs duplicados");

for (const coincidencia of paginaEvc.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)(?:\?[^" ]*)?"/g)) {
  assert.ok(existsSync(resolve(raiz, coincidencia[1])), `Falta el recurso local ${coincidencia[1]}`);
}

console.log("Rehabilitación EVC static tests passed");
