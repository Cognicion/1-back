import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_FARMACOLOGICO_MAESTRO,
  CATALOGO_FARMACOLOGICO_METADATA,
  CATALOGO_FARMACOLOGICO_OFICIAL,
  CATALOGO_MEDICAMENTOS_PEDIATRICOS,
  MEDICAMENTOS_PEDIATRICOS,
  MEDICAMENTOS_PRESENTACIONES,
  buscarMedicamentos,
  medicamentoPorTexto,
  obtenerMedicamentoPorId,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";

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
  const dosisPediatricas = (medicamento.datosClinicos?.dosisPediatrica || []).map((dosis) => JSON.stringify(dosis));
  assert.equal(new Set(dosisPediatricas).size, dosisPediatricas.length, `${medicamento.id} no debe duplicar dosis pediátricas`);
  const reglasRelacionadas = (medicamento.interaccionesRelacionadas || []).map((interaccion) => interaccion.idRegla);
  assert.equal(new Set(reglasRelacionadas).size, reglasRelacionadas.length, `${medicamento.id} no debe duplicar relaciones farmacológicas`);
  const reglasEstructuradas = (medicamento.interaccionesEstructuradas || []).map((interaccion) => interaccion.idRegla || interaccion.id);
  assert.equal(new Set(reglasEstructuradas).size, reglasEstructuradas.length, `${medicamento.id} no debe duplicar interacciones derivadas`);

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
const editorTratamiento = fs.readFileSync(new URL("../paciente.js", import.meta.url), "utf8");
const prescripcionPediatrica = fs.readFileSync(new URL("../pediatria/prescripcionPediatrica.js", import.meta.url), "utf8");
const archivosRedundantes = [
  "../data/farmacologiaMerge.js",
  "../data/farmacologiaUnificada.js",
  "../data/medicamentos.js",
  "../data/medicamentosSuplementarios.js",
  "../pediatria/catalogoMedicamentosPediatricos.js",
  "../pediatria/medicamentos.js"
];

assert.doesNotMatch(maestro, /from\s+["']\.\/medicamentos(?:Suplementarios)?\.js/);
assert.doesNotMatch(maestro, /from\s+["']\.\/farmacologiaUnificada\.js/);
for (const archivo of archivosRedundantes) {
  assert.equal(fs.existsSync(new URL(archivo, import.meta.url)), false, `${archivo} debe haberse absorbido en el catálogo maestro`);
}
assert.match(maestro, /export const MEDICAMENTOS_SUPLEMENTARIOS/);
assert.match(maestro, /export const CATALOGO_MEDICAMENTOS_PEDIATRICOS/);
assert.match(maestro, /export const MEDICAMENTOS_PEDIATRICOS/);
assert.doesNotMatch(prescripcionPediatrica, /catalogoMedicamentosPediatricos|\.\/medicamentos\.js/);

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
