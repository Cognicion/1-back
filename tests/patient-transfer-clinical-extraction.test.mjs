import assert from "node:assert/strict";

import { CATALOGO_FARMACOLOGICO_MAESTRO } from "../js/data/catalogoFarmacologicoUnificado.js";
import { adaptTreatmentPlan } from "../js/modules/clinical-document-engine/adapters/treatmentPlanAdapter.js";
import { evaluarMedicamentosPaciente } from "../js/services/motorClinicoMedicamentos.js";

const plan = `PLAN TERAPÉUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLÓGICO)
6. MEDICAMENTOS (Vigilar ingesta, en caso de negativismo a medicamentos notificar a médicos de turno):
a) HALOPERIDOL, Ámpulas de 5 mg. Aplicar intramuscular vía intramuscular. 1 ámpula a las 08:00 y 1 ámpula a las 22:00.
b) ALPRAZOLAM, Tabletas de 2 mg. Tomar vía oral 1 vez al día. ¼ de tableta a las 08:00, ¼ de tableta a las 15:00, ½ de tableta a las 22:00.
c) Microdacyn antiséptico. Aplicar 4 atomizaciones 2 veces al día, 4 atomizaciones a las 08:00 y 4 atomizaciones a las 20:00. NO CAMBIA.
d) Sulfadiazina de plata, unguento. Aplicar vía tópica de forma generosa 2 veces al día posterior a curación con Microdacyn.
e) Cefalexina, Tabletas de 500 mg. Tomar vía oral 2 veces al día, 1 tableta a las 08:00 y 1 tableta a las 20:00 hrs.`;

const result = adaptTreatmentPlan({
  text: plan,
  documentId: "fixture-clinical-plan",
  noteId: "note-1",
  date: "2026-08-17"
});

assert.deepEqual(
  result.medicationCandidates.map((candidate) => candidate.catalogMedicationId),
  ["haloperidol", "alprazolam", "microdacyn", "sulfadiazina_de_plata", "cefalexina"],
  "el Plan debe producir los cinco productos en el orden documental"
);

const byId = Object.fromEntries(result.medicationCandidates.map((candidate) => [candidate.catalogMedicationId, candidate]));
assert.equal(byId.haloperidol.presentation, "ampulas");
assert.equal(byId.haloperidol.route, "intramuscular");
assert.deepEqual(byId.haloperidol.schedule.map(({ time, quantity }) => [time, quantity]), [["08:00", 1], ["22:00", 1]]);
assert.deepEqual(byId.alprazolam.schedule.map(({ time, quantity }) => [time, quantity]), [["08:00", 0.25], ["15:00", 0.25], ["22:00", 0.5]]);
assert.deepEqual(byId.microdacyn.schedule.map(({ time, quantity, unit }) => [time, quantity, unit]), [["08:00", 4, "atomizaciones"], ["20:00", 4, "atomizaciones"]]);
assert.equal(byId.sulfadiazina_de_plata.presentation, "unguento");
assert.equal(byId.sulfadiazina_de_plata.route, "topica");
assert.equal(byId.sulfadiazina_de_plata.frequency, "twiceDaily");
assert.deepEqual(byId.cefalexina.schedule.map(({ time, quantity }) => [time, quantity]), [["08:00", 1], ["20:00", 1]]);

const requiredCatalogFields = [
  "principiosActivos",
  "clases",
  "categoriasInteraccion",
  "presentaciones",
  "datosClinicos",
  "farmacocinetica",
  "efectosAdversos",
  "riesgos",
  "interacciones",
  "interaccionesRelacionadas",
  "relacionDiagnosticos",
  "referencias",
  "fuenteClinica",
  "farmacologia"
];

for (const medicationId of ["microdacyn", "sulfadiazina_de_plata"]) {
  const medication = CATALOGO_FARMACOLOGICO_MAESTRO.find((item) => item.id === medicationId);
  assert.ok(medication, `${medicationId} debe existir en la fuente farmacológica única`);
  requiredCatalogFields.forEach((field) => assert.ok(Object.hasOwn(medication, field), `${medicationId} debe declarar ${field}`));
  assert.ok(medication.principiosActivos.length > 0, `${medicationId} debe declarar principios activos`);
  assert.ok(medication.clases.length > 0, `${medicationId} debe declarar clases para el motor clínico`);
  assert.ok(medication.presentaciones.length > 0, `${medicationId} debe declarar una presentación canónica`);
  assert.ok(medication.datosClinicos.indicaciones.length > 0, `${medicationId} debe declarar indicaciones verificadas`);
  assert.equal(medication.farmacologia.id, medicationId);
  assert.equal(medication.fuenteClinica.estado, "verificada_local");
}

const interactionResult = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Sulfadiazina de plata crema 1 %" },
    { medicamento: "Cimetidina" }
  ]
});
assert.ok(
  interactionResult.alertas.some((alert) => String(alert.id).startsWith("sulfadiazina_plata_cimetidina_leucopenia:")),
  "la propiedad regulatoria sulfadiazina de plata + cimetidina debe llegar al motor de interacciones"
);

console.log("patient-transfer-clinical-extraction.test.mjs OK");
