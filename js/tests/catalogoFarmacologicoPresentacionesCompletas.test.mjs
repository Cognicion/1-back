import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_FARMACOLOGICO_MAESTRO,
  CATALOGO_FARMACOLOGICO_METADATA,
  CATALOGO_FARMACOLOGICO_OFICIAL,
  MEDICAMENTOS_PRESENTACIONES,
  buscarMedicamentos,
  medicamentoPorTexto,
  obtenerMedicamentoPorId,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";
import { CATALOGO_MEDICAMENTOS_PEDIATRICOS } from "../pediatria/catalogoMedicamentosPediatricos.js";
import { MEDICAMENTOS_PEDIATRICOS } from "../pediatria/medicamentos.js";

const CAMPOS_MEDICAMENTO = [
  "id", "legacyIds", "nombre", "genericName", "principioActivo", "principiosActivos",
  "clasePrincipal", "clases", "categoriasInteraccion", "sinonimos", "marcas",
  "especialidades", "presentaciones", "dosisHabitual", "dosisHabituales",
  "frecuenciasSugeridas", "datosClinicos", "farmacocinetica", "efectosAdversos",
  "riesgos", "interacciones", "interaccionesRelacionadas", "relacionDiagnosticos",
  "notas", "referencias", "fuenteClinica", "farmacologia", "pediatria", "origenesCatalogo",
  "activo", "estadoContenido", "actualizadoEn"
];

const CAMPOS_PRESENTACION = ["id", "texto", "via", "forma", "concentracion", "fuente", "activo"];
const COMODIN = /seg[uú]n disponibilidad|presentaci[oó]n no especificada|concentraci[oó]n descrita en la presentaci[oó]n/i;

assert.equal(CATALOGO_FARMACOLOGICO_MAESTRO.length, CATALOGO_FARMACOLOGICO_OFICIAL.length);
assert.equal(new Set(CATALOGO_FARMACOLOGICO_OFICIAL.map((item) => item.id)).size, CATALOGO_FARMACOLOGICO_OFICIAL.length);
assert.equal(CATALOGO_FARMACOLOGICO_METADATA.rxNormVersion, "03-Aug-2026");
assert.ok(MEDICAMENTOS_PRESENTACIONES.length >= CATALOGO_FARMACOLOGICO_OFICIAL.length);

for (const medicamento of CATALOGO_FARMACOLOGICO_OFICIAL) {
  for (const campo of CAMPOS_MEDICAMENTO) {
    assert.ok(Object.prototype.hasOwnProperty.call(medicamento, campo), `${medicamento.id} debe declarar ${campo}`);
  }
  assert.ok(medicamento.principiosActivos.length, `${medicamento.id} debe declarar principio activo`);
  assert.ok(medicamento.clases.length, `${medicamento.id} debe declarar clase farmacológica`);
  assert.ok(medicamento.presentaciones.length, `${medicamento.id} debe tener presentaciones`);
  assert.ok(medicamento.referencias.length, `${medicamento.id} debe conservar trazabilidad de fuente`);

  for (const presentacion of medicamento.presentaciones) {
    for (const campo of CAMPOS_PRESENTACION) {
      assert.notEqual(presentacion[campo], undefined, `${medicamento.id}/${presentacion.id} debe declarar ${campo}`);
      assert.notEqual(presentacion[campo], null, `${medicamento.id}/${presentacion.id} no debe tener ${campo} nulo`);
      assert.notEqual(presentacion[campo], "", `${medicamento.id}/${presentacion.id} no debe tener ${campo} vacío`);
    }
    assert.doesNotMatch(`${presentacion.texto} ${presentacion.concentracion}`, COMODIN);
  }
}

assert.equal(new Set(MEDICAMENTOS_PRESENTACIONES.map((item) => item.selectedPresentationId)).size, MEDICAMENTOS_PRESENTACIONES.length);
assert.ok(MEDICAMENTOS_PRESENTACIONES.every((item) => item.clinicalMedicationId && item.selectedPresentationText));

const tamoxifeno = medicamentoPorTexto("tamoxifeno");
assert.deepEqual(tamoxifeno.presentaciones.map((item) => item.texto), [
  "solución oral de 2 mg/mL",
  "tableta de 10 mg",
  "tableta de 20 mg",
  "tableta de 40 mg"
]);

const alosetron = medicamentoPorTexto("alosetron");
assert.deepEqual(alosetron.presentaciones.map((item) => item.texto), ["tableta de 0.5 mg", "tableta de 1 mg"]);
assert.equal(resolverMedicamentoCanonico("Tamoxifeno tableta 20 mg").selectedPresentationText, "tableta de 20 mg");
assert.equal(resolverMedicamentoCanonico("Alosetron tableta 0.5 mg").selectedPresentationText, "tableta de 0.5 mg");

for (const [legacyId, canonico] of [
  ["acido-valproico", "valproato"],
  ["valproato-de-magnesio", "valproato"],
  ["valproato-semisodico", "valproato"],
  ["ciprofloxacino_otico", "ciprofloxacino"],
  ["hidrocortisona_crema", "hidrocortisona"],
  ["betametasona_topica", "betametasona"]
]) {
  assert.equal(obtenerMedicamentoPorId(legacyId)?.id, canonico, `${legacyId} debe resolver a ${canonico}`);
}

const maestro = fs.readFileSync(new URL("../data/catalogoFarmacologicoUnificado.js", import.meta.url), "utf8");
const legacy = fs.readFileSync(new URL("../data/medicamentos.js", import.meta.url), "utf8");
const suplementario = fs.readFileSync(new URL("../data/medicamentosSuplementarios.js", import.meta.url), "utf8");
const farmacologia = fs.readFileSync(new URL("../data/farmacologiaUnificada.js", import.meta.url), "utf8");
const catalogoPediatrico = fs.readFileSync(new URL("../pediatria/catalogoMedicamentosPediatricos.js", import.meta.url), "utf8");
const medicamentosPediatricos = fs.readFileSync(new URL("../pediatria/medicamentos.js", import.meta.url), "utf8");
const editorTratamiento = fs.readFileSync(new URL("../paciente.js", import.meta.url), "utf8");

assert.doesNotMatch(maestro, /from\s+["']\.\/medicamentos(?:Suplementarios)?\.js/);
assert.doesNotMatch(maestro, /from\s+["']\.\/farmacologiaUnificada\.js/);
assert.match(legacy, /ADAPTADOR LEGACY/);
assert.match(suplementario, /ADAPTADOR LEGACY/);
assert.match(farmacologia, /ADAPTADOR LEGACY/);
assert.doesNotMatch(legacy, /export\s+const\s+MEDICAMENTOS\s*=\s*\[/);
assert.doesNotMatch(suplementario, /export\s+const\s+MEDICAMENTOS_SUPLEMENTARIOS\s*=\s*\[/);
assert.doesNotMatch(farmacologia, /const\s+CATALOGO_FARMACOLOGICO\s*=\s*\[/);
assert.match(catalogoPediatrico, /ADAPTADOR PEDIATRICO/);
assert.match(medicamentosPediatricos, /ADAPTADOR LEGACY/);
assert.doesNotMatch(catalogoPediatrico, /CATALOGO_MEDICAMENTOS_PEDIATRICOS\s*=\s*\[/);
assert.doesNotMatch(medicamentosPediatricos, /MEDICAMENTOS_PEDIATRICOS(?:_LEGACY)?\s*=\s*\[/);

assert.equal(MEDICAMENTOS_PEDIATRICOS.length, 28);
assert.equal(CATALOGO_MEDICAMENTOS_PEDIATRICOS.length, 6);
for (const medicamento of MEDICAMENTOS_PEDIATRICOS) {
  const canonico = obtenerMedicamentoPorId(medicamento.clinicalMedicationId);
  assert.ok(canonico, `${medicamento.id} pediatrico debe existir en el maestro`);
  assert.equal(canonico.pediatria?.legacy?.id, medicamento.id);
}
assert.ok(obtenerMedicamentoPorId("prednisolona")?.presentaciones.length);
assert.ok(obtenerMedicamentoPorId("clonidina")?.presentaciones.length);
assert.equal(buscarMedicamentos("tamoxifeno", { limit: 1, strict: true })[0]?.id, "tamoxifeno");
assert.equal(buscarMedicamentos("alosetron", { limit: 1, strict: true })[0]?.id, "alosetron");
assert.match(editorTratamiento, /const presentaciones = medicamento\?\.presentaciones \|\| \[\]/);
assert.match(editorTratamiento, /presentaciones\.map\(\(item, index\) =>/);
assert.doesNotMatch(editorTratamiento, /presentaci[oó]n seg[uú]n disponibilidad/i);

console.log(`Catálogo único validado: ${CATALOGO_FARMACOLOGICO_OFICIAL.length} medicamentos y ${MEDICAMENTOS_PRESENTACIONES.length} presentaciones completas.`);
