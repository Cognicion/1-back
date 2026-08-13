import assert from "node:assert/strict";
import fs from "node:fs";
import { buscarMedicamentos, medicamentoPorTexto } from "../js/data/catalogoFarmacologicoUnificado.js";

const editor = fs.readFileSync(new URL("../js/paciente.js", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../paciente.html", import.meta.url), "utf8");
const fluoxetina = medicamentoPorTexto("fluoxetina");

assert.equal(fluoxetina?.id, "fluoxetina", "fluoxetina debe resolverse por nombre genérico");
const fluox = buscarMedicamentos("fluox", { limit: 16, strict: true });
assert.equal(fluox[0]?.id, "fluoxetina", "el prefijo debe sugerir fluoxetina");
assert.ok(fluox.every((item) => /fluox/i.test(`${item.nombre} ${item.genericName} ${(item.brandNames || []).join(" ")} ${(item.synonyms || []).join(" ")}`)), "fluox no debe devolver resultados irrelevantes");
assert.equal(buscarMedicamentos("FLUOX", { limit: 16, strict: true })[0]?.id, "fluoxetina", "la búsqueda debe ignorar mayúsculas");
assert.ok(buscarMedicamentos("acido", { limit: 16, strict: true }).length > 0, "la búsqueda debe ignorar acentos");
assert.deepEqual(buscarMedicamentos("sin-coincidencia-real", { strict: true }), [], "una consulta sin coincidencia debe devolver lista vacía");
assert.deepEqual(buscarMedicamentos("", { strict: true }), [], "consulta vacía no debe cargar el catálogo completo");
assert.ok(fluoxetina.presentaciones.length > 0, "el medicamento resuelto debe conservar presentaciones");

assert.match(editor, /function resetearDependientesMedicamento\(\)/);
assert.match(editor, /dataset\.catalogMedicationId/);
assert.match(editor, /document\.getElementById\("contenedorTomasTratamiento"\)\?\.replaceChildren\(\)/);
assert.match(editor, /if \(!frecuencia && !vecesDia\) return 0;/);
assert.match(editor, /if \(!total\) \{/);
assert.match(editor, /tratamientoVecesDia\", \"\"/);
assert.match(editor, /renderizarCatalogo\(campo\.value\)/);
assert.match(editor, /buscarMedicamentos\(texto, \{ limit: 16, strict: true \}\)/);
assert.doesNotMatch(form, /id="tratamientoDosisRapidas"/);
assert.doesNotMatch(form, /id="tratamientoDosisOtra"/);

console.log("manual-treatment-editor-regression: ok");
