import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  MEDICAMENTOS_MAESTROS,
  MEDICAMENTOS_PRESENTACIONES,
  adaptarMedicamentoPersistido,
  normalizarMedicamento,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";
import {
  analizarInteraccionesPublicas,
  crearSeleccionMedicamento
} from "../services/interaccionesPublicas.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

assert.equal(CATALOGO_FARMACOLOGICO_OFICIAL, MEDICAMENTOS_MAESTROS, "el export maestro debe ser la misma fuente oficial");
assert.equal(new Set(CATALOGO_FARMACOLOGICO_OFICIAL.map((item) => item.id)).size, CATALOGO_FARMACOLOGICO_OFICIAL.length, "no debe haber ids clínicos duplicados");
assert.equal(new Set(CATALOGO_FARMACOLOGICO_OFICIAL.map((item) => item.principioActivoNormalizado)).size, CATALOGO_FARMACOLOGICO_OFICIAL.length, "no debe haber principios activos duplicados");
assert.ok(MEDICAMENTOS_PRESENTACIONES.every((item) => item.clinicalMedicationId && item.selectedPresentationId), "toda presentación debe apuntar a un principio activo");

for (const texto of [
  "Captopril",
  "Captopril tabletas 25 mg",
  "captopril, tabletas de 25 mg",
  "CAPTOPRIL 25 MG VO"
]) assert.equal(normalizarMedicamento(texto), "captopril", `${texto} debe normalizar a captopril`);

const captoprilPresentacion = resolverMedicamentoCanonico("Captopril tabletas 25 mg");
assert.equal(captoprilPresentacion.clinicalMedicationId, "captopril");
assert.match(captoprilPresentacion.selectedPresentationText, /25\s*mg/i);
assert.doesNotMatch(captoprilPresentacion.selectedPresentationId, /-p\d+$/);

const casoA = analizarInteraccionesPublicas([
  resolverMedicamentoCanonico("Captopril"),
  resolverMedicamentoCanonico("Captopril tabletas 25 mg"),
  resolverMedicamentoCanonico("Losartán")
]);
assert.equal(casoA.filter((alerta) => /bloqueo dual|IECA.*ARA/i.test(alerta.titulo)).length, 1, "captopril duplicado por presentación debe producir una sola alerta SRAA");

assert.equal(normalizarMedicamento("aripiprazol-p2"), "aripiprazol");
const aripiprazolPresentacion = resolverMedicamentoCanonico("Aripiprazol tabletas 10 mg");
assert.equal(aripiprazolPresentacion.clinicalMedicationId, "aripiprazol");
assert.match(aripiprazolPresentacion.selectedPresentationText, /10\s*mg/i);
const casoB = analizarInteraccionesPublicas([
  resolverMedicamentoCanonico("Aripiprazol"),
  aripiprazolPresentacion,
  resolverMedicamentoCanonico("Fluoxetina")
]);
assert.ok(casoB.some((alerta) => /CYP2D6/i.test(`${alerta.titulo} ${alerta.mecanismo}`)), "aripiprazol + fluoxetina debe evaluarse por principio activo");
assert.ok(casoB.every((alerta) => !(alerta.medicamentos || []).some((item) => /aripiprazol-p2/i.test(item))), "no debe exponerse aripiprazol-p2 como medicamento clínico");

const casoC = analizarInteraccionesPublicas([
  resolverMedicamentoCanonico("Fluoxetina"),
  resolverMedicamentoCanonico("Sertralina")
]);
assert.ok(casoC.some((alerta) => alerta.categoria === "serotoninergica"));
assert.ok(casoC.some((alerta) => alerta.categoria === "duplicidad_terapeutica"));

const atomoxetina = resolverMedicamentoCanonico("Atomoxetina cápsulas 40 mg");
assert.equal(atomoxetina.clinicalMedicationId, "atomoxetina");
assert.match(atomoxetina.selectedPresentationText, /40\s*mg/i);
const casoD = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Hipertensión arterial sistémica"] },
  medicamentos: [atomoxetina]
});
assert.ok(casoD.alertas.some((alerta) => /hipertensi|cardiovascular|presi[oó]n arterial/i.test(`${alerta.titulo} ${alerta.efecto}`)), "atomoxetina debe alertar por contexto cardiovascular");

const persistido = adaptarMedicamentoPersistido({
  medicamento: "Captopril tabletas 25 mg",
  dosis: "1 tableta",
  via: "oral",
  frecuencia: "cada 12 horas",
  horarios: ["08:00", "20:00"],
  duracion: "30 días",
  notas: "Control de presión"
});
assert.equal(persistido.clinicalMedicationId, "captopril");
assert.equal(persistido.dosis, "1 tableta");
assert.deepEqual(persistido.horarios, ["08:00", "20:00"]);
assert.match(persistido.originalText, /Captopril/i);

const consumidores = [
  "js/paciente.js",
  "js/laboratorio-farmacologia.js",
  "js/services/clinicalPipeline.js",
  "js/services/interaccionesPublicas.js",
  "js/services/sofiaClinica.js",
  "js/pediatria/prescripcionPediatrica.js",
  "js/modules/clinical-document-engine/resolvers/medicationCatalogResolver.js"
];
consumidores.forEach((ruta) => {
  const contenido = fs.readFileSync(ruta, "utf8");
  assert.match(contenido, /catalogoFarmacologicoUnificado\.js/, `${ruta} debe consumir el catálogo oficial`);
});

const sofiaClinica = fs.readFileSync("js/services/sofiaClinica.js", "utf8");
assert.match(sofiaClinica, /motorClinicoMedicamentos\.js/, "SOFÃA debe reutilizar el motor clÃ­nico comÃºn");
assert.doesNotMatch(sofiaClinica, /const\s+BASE_FARMACOLOGICA_SOFIA\s*=\s*\[/, "SOFÃA no debe mantener un mini-catÃ¡logo paralelo");

const interaccionesLegacy = fs.readFileSync("js/data/interaccionesFarmacologicas.js", "utf8");
assert.match(interaccionesLegacy, /motorClinicoMedicamentos\.js/, "el adaptador de interacciones legacy debe delegar al motor comÃºn");

console.log("catalogoFarmacologicoUnificado.test.mjs OK");
