import assert from "node:assert/strict";
import { parseMedicationSchedules } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";
import { consolidateMedicationCandidates, parseMedicationCandidates } from "../js/modules/clinical-document-engine/parsers/medicationParser.js";

const risperidona = parseMedicationSchedules("Risperidona tabletas 2 mg vía oral dos veces al día 1/2 tableta a las 08:00 y 1 tableta a las 22:00");
assert.deepEqual(risperidona.map(({ time, quantity, administrationUnit }) => ({ time, quantity, administrationUnit })), [
  { time: "08:00", quantity: 0.5, administrationUnit: "tableta" },
  { time: "22:00", quantity: 1, administrationUnit: "tableta" }
]);

const clonazepam = parseMedicationSchedules("Clonazepam 2 mg 1/4 tableta 08:00 1/4 tableta 15:00 1/2 tableta 22:00");
assert.deepEqual(clonazepam.map(({ time, quantity }) => ({ time, quantity })), [
  { time: "08:00", quantity: 0.25 },
  { time: "15:00", quantity: 0.25 },
  { time: "22:00", quantity: 0.5 }
]);

assert.deepEqual(parseMedicationSchedules("Fluoxetina 2 tabletas a las 08:00").map(({ time, quantity }) => ({ time, quantity })), [{ time: "08:00", quantity: 2 }]);
assert.deepEqual(parseMedicationSchedules("cada 8 horas 1 tableta"), []);
assert.deepEqual(parseMedicationSchedules("PRN 1 tableta"), []);

const engineResult = parseMedicationCandidates({
  text: "Risperidona tabletas 2 mg vía oral dos veces al día 1/2 tableta a las 08:00 y 1 tableta a las 22:00",
  medicationCatalog: [{ nombre: "Risperidona" }]
});
assert.equal(engineResult.length, 1);
assert.deepEqual(engineResult[0].schedule.map(({ time, quantity, unit }) => ({ time, quantity, unit })), [
  { time: "08:00", quantity: 0.5, unit: "tableta" },
  { time: "22:00", quantity: 1, unit: "tableta" }
]);

const intervalResult = parseMedicationCandidates({ text: "cada 8 horas 1 tableta", medicationCatalog: [] });
assert.equal(intervalResult.length, 0);

const unitlessAdministrationResult = parseMedicationCandidates({
  text: [
    "Risperidona tabletas 2 mg vía oral una vez al día. Tomar ½ a las 22:00 h",
    "Fluoxetina cápsulas 20 mg vía oral 1 vez al día. Tomar 1 a las 08:00 h",
    "Alprazolam tableta 2 mg vía oral una vez al día. Tomar 1 / 2 a las 21:00 h"
  ].join("\n")
});
assert.deepEqual(unitlessAdministrationResult.map(({ medicationName, administrationQuantity, administrationUnit }) => ({ medicationName, administrationQuantity, administrationUnit })), [
  { medicationName: "Risperidona", administrationQuantity: 0.5, administrationUnit: "tabletas" },
  { medicationName: "Fluoxetina", administrationQuantity: 1, administrationUnit: "capsulas" },
  { medicationName: "Alprazolam", administrationQuantity: 0.5, administrationUnit: "tableta" }
]);
assert.deepEqual(unitlessAdministrationResult.map((candidate) => candidate.schedule.map(({ time, quantity, unit }) => ({ time, quantity, unit }))), [
  [{ time: "22:00", quantity: 0.5, unit: "tabletas" }],
  [{ time: "08:00", quantity: 1, unit: "capsulas" }],
  [{ time: "21:00", quantity: 0.5, unit: "tableta" }]
]);

const repeatedCandidateWithParserConflict = consolidateMedicationCandidates([
  {
    id: "fluoxetine-tablet",
    medicationName: "Fluoxetina",
    normalizedMedicationName: "fluoxetina",
    presentation: "tabletas",
    strength: 20,
    strengthUnit: "mg",
    action: "Suspende",
    metadata: { sourceSection: "plan", rawMedicationText: "Suspender fluoxetina tabletas de 20 mg. Tomar vía oral una vez al día." }
  },
  {
    id: "fluoxetine-parser-repeat",
    medicationName: "Fluoxetina",
    normalizedMedicationName: "fluoxetina",
    presentation: "capsulas",
    strength: 20,
    strengthUnit: "mg",
    route: "oral",
    frequency: "onceDaily",
    action: "Suspende",
    metadata: { sourceSection: "medicamentos", rawMedicationText: "Suspender fluoxetina tabletas de 20 mg. Tomar vía oral una vez al día." }
  }
]);
assert.equal(repeatedCandidateWithParserConflict.length, 1, "dos candidatos de la misma evidencia se consolidan aunque uno arrastre una presentación incorrecta");
assert.equal(repeatedCandidateWithParserConflict[0].presentation, "tabletas", "la presentación respaldada junto al nombre del medicamento prevalece");
assert.equal(repeatedCandidateWithParserConflict[0].route, "oral", "la consolidación conserva los datos complementarios no conflictivos");
assert.equal(repeatedCandidateWithParserConflict[0].requiresReview, true, "una discrepancia interna queda marcada para revisión clínica");

const distinctFluoxetineRegimens = consolidateMedicationCandidates([
  { ...repeatedCandidateWithParserConflict[0], metadata: { rawMedicationText: "Fluoxetina tabletas de 20 mg vía oral una vez al día." } },
  { ...repeatedCandidateWithParserConflict[0], id: "fluoxetine-capsule", presentation: "capsulas", metadata: { rawMedicationText: "Fluoxetina cápsulas de 20 mg vía oral una vez al día." } }
]);
assert.equal(distinctFluoxetineRegimens.length, 2, "dos presentaciones distintas con evidencia independiente no se fusionan");

console.log("patient-transfer-medication-schedules: ok");
