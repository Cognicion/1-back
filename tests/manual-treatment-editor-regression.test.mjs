import assert from "node:assert/strict";
import fs from "node:fs";
import { buscarMedicamentos, medicamentoPorTexto } from "../js/data/medicamentos.js";

const editor = fs.readFileSync(new URL("../js/paciente.js", import.meta.url), "utf8");
const fluoxetina = medicamentoPorTexto("fluoxetina");

assert.equal(fluoxetina?.id, "fluoxetina", "fluoxetina debe resolverse por nombre genérico");
assert.equal(buscarMedicamentos("fluox", { limit: 1 })[0]?.id, "fluoxetina", "el prefijo debe sugerir fluoxetina");
assert.ok(fluoxetina.presentaciones.length > 0, "el medicamento resuelto debe conservar presentaciones");

assert.match(editor, /function resetearDependientesMedicamento\(\)/);
assert.match(editor, /dataset\.catalogMedicationId/);
assert.match(editor, /document\.getElementById\("contenedorTomasTratamiento"\)\?\.replaceChildren\(\)/);
assert.match(editor, /if \(!frecuencia && !vecesDia\) return 0;/);
assert.match(editor, /if \(!total\) \{/);
assert.match(editor, /tratamientoVecesDia\", \"\"/);

console.log("manual-treatment-editor-regression: ok");
