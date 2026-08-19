import assert from "node:assert/strict";
import { adaptTreatmentPlan } from "../js/modules/clinical-document-engine/adapters/treatmentPlanAdapter.js";
import { resolveMedicationAgainstCatalog } from "../js/modules/clinical-document-engine/resolvers/medicationCatalogResolver.js";
import { resolverMedicamentoCanonico } from "../js/data/catalogoFarmacologicoUnificado.js";

const brianPlan = `PLAN TERAPÉUTICO
6. MEDICAMENTOS:
a. OLANZAPINA 10 mg tabletas. Tomar 1 vez al día. Tomar 1 tableta por vía oral a las 22 horas
b. Sertralina 50 mg tabletas. Tomar 1 veces al día. Tomar 1 tableta a las 08 horas
c. Paracetamol 500 mg tabletas. Administrar vía oral, 3 veces al día:
- 1 tableta 08:00
- 1 tableta a las 15:00
- 1 tableta a las 22:00 h
7. Reportar eventualidades.
COMENTARIO Y/O ANÁLISIS`;

const result = adaptTreatmentPlan({ text: brianPlan, documentId: "anon-doc", noteId: "anon-note", date: "2026-08-04" });
assert.equal(result.medicationCandidates.length, 3, "el Plan conserva los tres candidatos delegados");

const expected = [
  ["Olanzapina", "olanzapina", 10, "oral", ["22:00"]],
  ["Sertralina", "sertralina", 50, "", ["08:00"]],
  ["Paracetamol", "paracetamol", 500, "oral", ["08:00", "15:00", "22:00"]]
];

for (const [name, catalogId, strength, route, schedule] of expected) {
  const candidate = result.medicationCandidates.find((item) => item.medicationName === name);
  assert.ok(candidate, `${name} se adapta al contrato de revisión`);
  assert.equal(candidate.catalogMedicationId, catalogId, `${name} conserva el ID del catálogo`);
  assert.equal(candidate.catalogMatchStatus, "exact", `${name} se vincula de forma exacta`);
  assert.equal(candidate.catalogPresentationMatch, true, `${name} conserva su presentación prescrita`);
  assert.equal(candidate.evidence.noteId, "anon-note", "la evidencia conserva el segmento de origen");
  assert.equal(candidate.strengthValue, strength);
  assert.equal(candidate.route, route);
  assert.deepEqual(candidate.schedule.map((item) => item.time), schedule);
  assert.equal(candidate.selectedForImport, false, "la selección es explícita");
}

const typo = resolveMedicationAgainstCatalog({ medicationName: "Olanzapna" });
assert.equal(typo.catalogMedicationId, "olanzapina");
assert.equal(typo.catalogMatchStatus, "high");

const unknown = resolveMedicationAgainstCatalog({ medicationName: "Medicamento inexistente" });
assert.equal(unknown.catalogMedicationId, null);
assert.equal(unknown.catalogMatchStatus, "none");
assert.equal(unknown.requiresCatalogReview, true);

const presentationMismatch = resolveMedicationAgainstCatalog({
  medicationName: "Sertralina",
  presentation: "jarabe",
  strengthValue: 50,
  strengthUnit: "mg"
});
assert.equal(presentationMismatch.catalogMedicationId, "sertralina");
assert.equal(presentationMismatch.catalogPresentationMatch, false);
assert.equal(presentationMismatch.requiresCatalogReview, true);

const dexametasonaSinPresentacion = resolverMedicamentoCanonico("Dexametasona");
assert.equal(dexametasonaSinPresentacion?.clinicalMedicationId, "dexametasona");
assert.equal(dexametasonaSinPresentacion?.selectedPresentationId, null, "el nombre aislado no debe inventar una presentación");

const dexametasonaInyectable = resolverMedicamentoCanonico("Dexametasona 4 mg/mL solución inyectable");
assert.equal(dexametasonaInyectable?.selectedPresentationId, "dexametasona-solucion-inyectable-4-mg-ml");
assert.equal(dexametasonaInyectable?.presentacion?.via, "inyectable");
assert.equal(dexametasonaInyectable?.presentacion?.forma, "solución inyectable");

const dexametasonaIncompleta = resolverMedicamentoCanonico("Dexametasona 7 mg/mL solución inyectable");
assert.equal(dexametasonaIncompleta?.clinicalMedicationId, "dexametasona");
assert.equal(dexametasonaIncompleta?.selectedPresentationId, null, "una concentración no catalogada debe quedar incompleta");

const betametasona = resolverMedicamentoCanonico("Betametasona crema tópica 0.5 mg/mL");
assert.equal(betametasona?.clinicalMedicationId, "betametasona");
assert.equal(betametasona?.presentacion?.via, "tópica");
assert.notEqual(betametasona?.clinicalMedicationId, "dexametasona", "los corticoides de nombre parecido no deben confundirse");

console.log("medication-catalog-resolver: ok");
