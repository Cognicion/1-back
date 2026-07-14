import assert from "node:assert/strict";
import {
  buildPediatricPrescription,
  calculateDoseByWeight,
  calculateLiquidVolume,
  calculateSolidUnits,
  parseManualPresentation,
  searchPediatricMedication,
  synchronizeFrequencyAndInterval,
  validateTabletSplitting
} from "../pediatria/prescripcionPediatrica.js";

const found = searchPediatricMedication("tempra");
assert.ok(found.some((med) => med.medicationId === "paracetamol"));

const dose = calculateDoseByWeight({
  pesoKg: 20,
  value: 15,
  administrationsPerDay: 4,
  mode: "mg_kg_dosis"
});
assert.equal(dose.calculatedDoseMg, 300);
assert.equal(dose.totalDailyDoseMg, 1200);

const synced = synchronizeFrequencyAndInterval({
  administrationsPerDay: "",
  intervalHours: 8,
  changed: "interval"
});
assert.equal(synced.administrationsPerDay, 3);

const liquidPresentation = parseManualPresentation("suspensión 160 mg/5 mL");
assert.equal(liquidPresentation.concentrationMgPerMl, 32);
const volume = calculateLiquidVolume({ finalDoseMg: 300, presentation: liquidPresentation });
assert.equal(volume.roundedMl, 9.4);

const tabletPresentation = parseManualPresentation("500 mg tableta");
const units = calculateSolidUnits({ finalDoseMg: 250, presentation: tabletPresentation });
assert.equal(units.roundedUnits, 0.5);
assert.equal(validateTabletSplitting({ unitsPerDose: units, presentation: tabletPresentation }).ok, true);

const rx = buildPediatricPrescription({
  patientId: "paciente_test",
  medicationId: "paracetamol",
  indicationId: "dolor_fiebre",
  schemeIndex: 1,
  dosingMode: "mg_kg_dosis",
  weightKg: 20,
  weightConfirmed: true,
  administrationsPerDay: 4,
  intervalHours: 6,
  route: "oral",
  presentationId: "paracetamol_susp_160_5",
  brandName: "Tempra",
  customSchedule: "06:00, 12:00, 18:00, 00:00"
});
assert.equal(rx.valid, true);
assert.equal(rx.finalDoseMg, 300);
assert.equal(rx.totalDailyDoseMg, 1200);
assert.equal(rx.liquidVolume.roundedMl, 9.4);
assert.ok(rx.instructionText.includes("Tempra"));
assert.ok(rx.instructionText.includes("9.4 mL"));

const unsafe = buildPediatricPrescription({
  patientId: "paciente_test",
  medicationId: "paracetamol",
  indicationId: "dolor_fiebre",
  schemeIndex: 1,
  dosingMode: "mg_kg_dosis",
  weightKg: 20,
  weightConfirmed: false,
  administrationsPerDay: 4,
  presentationId: "paracetamol_susp_160_5"
});
assert.equal(unsafe.valid, false);
assert.ok(unsafe.errors.some((error) => error.includes("peso")));

console.log("prescripcionPediatrica.test.mjs OK");
