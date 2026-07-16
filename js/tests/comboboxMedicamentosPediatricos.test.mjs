import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CATALOGO_FARMACOLOGICO_PEDIATRIA,
  normalizeSearchText,
  searchPediatricMedication
} from "../pediatria/prescripcionPediatrica.js";

const pediatriaPath = fileURLToPath(new URL("../pediatria/pediatria.js", import.meta.url));
const cssPath = fileURLToPath(new URL("../../css/pediatria.css", import.meta.url));
const prescripcionPath = fileURLToPath(new URL("../pediatria/prescripcionPediatrica.js", import.meta.url));
const source = readFileSync(pediatriaPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const prescripcionSource = readFileSync(prescripcionPath, "utf8");

// Catálogo y filtro real.
assert.equal(CATALOGO_FARMACOLOGICO_PEDIATRIA.length, 201);
assert.equal(searchPediatricMedication("").length, CATALOGO_FARMACOLOGICO_PEDIATRIA.length);
assert.equal(searchPediatricMedication("").slice(0, 20).length, 20);
assert.ok(searchPediatricMedication("risp").some((med) => med.medicationId === "risperidona"));
assert.ok(searchPediatricMedication("tempra").some((med) => med.medicationId === "paracetamol"));
assert.equal(normalizeSearchText("  Solución pediátrica  "), "solucion pediatrica");
assert.deepEqual(
  searchPediatricMedication("antipsicótico").map((med) => med.medicationId),
  searchPediatricMedication("antipsicotico").map((med) => med.medicationId)
);
assert.ok(searchPediatricMedication("antipsicótico").some((med) => med.medicationId === "risperidona"));
assert.match(prescripcionSource, /MEDICAMENTOS_MAESTROS/);
assert.match(prescripcionSource, /textoMedicamentoParaBusqueda/);

// Un único combobox, apertura, foco estable y resultados interactivos.
assert.equal((source.match(/<select data-ped-rx="medicationId"/g) || []).length, 0);
assert.equal((source.match(/id="buscadorMedicamentoPediatrico"/g) || []).length, 1);
assert.match(source, /addEventListener\("focus", \(\) => \{\s*abrirComboboxMedicamentos\(\)/);
assert.match(source, /addEventListener\("input", \(\) => \{[\s\S]*?renderResultadosBusquedaMedicamentos\(\)/);
assert.match(source, /contenedor\.innerHTML = renderResultadosMedicamentosPediatricos/);
assert.match(source, /type="button"[^>]+data-ped-medication-id=/);
assert.match(source, /role="option"/);
assert.match(source, /event\.target\.closest\("\[data-ped-medication-id\]"\)/);
assert.match(source, /actualizarPrescripcionDesdeInput\("medicationId", medicationId, "pick"\)/);

// Teclado, cierre y reapertura.
for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.ok(source.includes(`"${key}"`));
assert.match(source, /if \(!event\.target\.closest\("\[data-ped-medication-combobox\]"\)\) cerrarComboboxMedicamentos\(\)/);
assert.match(source, /requestAnimationFrame\(\(\) => \{[\s\S]*?buscador\?\.focus\(\)[\s\S]*?abrirComboboxMedicamentos\(\)/);

// La selección carga el nuevo contexto y la limpieza elimina el anterior.
for (const field of [
  "medicationId", "indicationId", "schemeIndex", "dosingMode", "route",
  "presentationId", "brandName", "manualBrandName", "manualPresentationText", "finalDoseMg"
]) assert.match(source, new RegExp(`${field}:`));
assert.match(source, /const indication = med\?\.indications\?\.\[0\]/);
assert.match(source, /const scheme = indication\?\.dosingSchemes\?\.\[0\]/);
assert.match(source, /loadMedicationPresentations\(value, \{ route \}\)\[0\]/);
assert.match(source, /loadBrandsForMedication\(value\)\[0\]/);
assert.match(source, /data-ped-rx-clear-medication/);
assert.match(source, /data-ped-rx-load-more/);

// Estado textual y superposición visual.
for (const text of [
  "medicamentos disponibles.", "Mostrando ${visibles.length} de ${resultados.length} resultados.",
  "Seleccionado:", "No se encontraron medicamentos."
]) assert.ok(source.includes(text));
assert.match(css, /\.ped-medication-search-wrapper\s*\{[\s\S]*?position:\s*relative/);
assert.match(css, /\.ped-rx-medication-combobox \.ped-search-results\.compact\s*\{[\s\S]*?position:\s*absolute[\s\S]*?z-index:\s*2000[\s\S]*?max-height:\s*340px[\s\S]*?overflow-y:\s*auto/);
assert.match(css, /\.ped-prescription-compact,[\s\S]*?\.ped-rx-grid-compact\s*\{\s*overflow:\s*visible/);

console.log("comboboxMedicamentosPediatricos.test.mjs OK");
