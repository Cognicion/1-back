import assert from "node:assert/strict";
import { parseMedicationSchedules } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";
import { parseMedicationCandidates } from "../js/modules/clinical-document-engine/parsers/medicationParser.js";

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

console.log("patient-transfer-medication-schedules: ok");
