import assert from "node:assert/strict";
import {
  buildManualCommercialPresentation,
  buildPediatricPrescription,
  calculateDoseByWeight,
  calculateLiquidVolume,
  calculatePackagingNeed,
  calculateSolidUnits,
  durationText,
  formatPresentationOption,
  loadBrandsForMedication,
  loadPresentationsForBrand,
  normalizeCommercialPresentation,
  parseManualPresentation,
  searchPediatricMedication,
  synchronizeFrequencyAndInterval,
  validatePresentationConsistency,
  validateTabletSplitting
} from "../pediatria/prescripcionPediatrica.js";

const found = searchPediatricMedication("tempra");
assert.ok(found.some((med) => med.medicationId === "paracetamol"));

const marcasParacetamol = loadBrandsForMedication("paracetamol");
assert.ok(marcasParacetamol.includes("Tempra"));

const presentacionesTempra = loadPresentationsForBrand("paracetamol", "Tempra");
const tempraJarabe = presentacionesTempra.find((item) => item.presentationId === "paracetamol_tempra_jarabe_32mg_ml_120ml");
assert.ok(tempraJarabe);
assert.equal(normalizeCommercialPresentation(tempraJarabe).concentrationMgPerMl, 32);
const etiquetaTempra = formatPresentationOption(tempraJarabe);
assert.ok(etiquetaTempra.includes("Tempra jarabe infantil"));
assert.ok(etiquetaTempra.includes("3.2 g/100 mL"));
assert.ok(etiquetaTempra.includes("32 mg/mL"));
assert.ok(etiquetaTempra.includes("frasco 120 mL"));
assert.equal(validatePresentationConsistency(tempraJarabe).ok, true);

const incoherenteLiquida = validatePresentationConsistency({
  pharmaceuticalForm: "jarabe",
  unitStrength: "tabletas de 500 mg"
});
assert.equal(incoherenteLiquida.ok, false);

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

const tempraVolume = calculateLiquidVolume({ finalDoseMg: 400, presentation: tempraJarabe });
assert.equal(tempraVolume.roundedMl, 12.5);
const paquetes = calculatePackagingNeed({
  volumePerDoseMl: 12.5,
  administrationsPerDay: 3,
  durationValue: 3,
  durationUnit: "dias",
  packageContent: 120
});
assert.equal(paquetes.totalVolumeMl, 112.5);
assert.equal(paquetes.packagesNeeded, 1);

const tabletPresentation = parseManualPresentation("500 mg tableta");
const units = calculateSolidUnits({ finalDoseMg: 250, presentation: tabletPresentation });
assert.equal(units.roundedUnits, 0.5);
assert.equal(validateTabletSplitting({ unitsPerDose: units, presentation: tabletPresentation }).ok, true);

const manual = buildManualCommercialPresentation({
  medicationId: "paracetamol",
  genericName: "Paracetamol",
  brandName: "Marca local",
  manualCommercialName: "Paracetamol jarabe local",
  manualPharmaceuticalForm: "jarabe",
  manualActiveIngredientAmount: 160,
  manualActiveIngredientUnit: "mg",
  manualReferenceVolume: 5,
  manualReferenceVolumeUnit: "mL",
  manualPackageContent: 60,
  manualPackageUnit: "mL",
  route: "oral"
});
assert.equal(manual.concentrationMgPerMl, 32);
assert.equal(manual.brandName, "Marca local");
assert.equal(validatePresentationConsistency(manual).ok, true);
assert.equal(durationText({ durationUnit: "dosis_unica" }), " en dosis única");
assert.equal(durationText({ durationUnit: "continuo" }), " de forma continua hasta nueva indicación");
assert.equal(durationText({ durationUnit: "personalizado", durationManualText: "por 5 días y reevaluar" }), " por 5 días y reevaluar");

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
  brandName: "Genérico",
  customSchedule: "06:00, 12:00, 18:00, 00:00"
});
assert.equal(rx.valid, true);
assert.equal(rx.finalDoseMg, 300);
assert.equal(rx.totalDailyDoseMg, 1200);
assert.equal(rx.liquidVolume.roundedMl, 9.4);
assert.ok(rx.instructionText.includes("160 mg/5 mL"));
assert.ok(rx.instructionText.includes("9.4 mL"));

const rxTempra = buildPediatricPrescription({
  patientId: "paciente_test",
  medicationId: "paracetamol",
  indicationId: "dolor_fiebre",
  schemeIndex: 1,
  dosingMode: "mg_kg_dosis",
  weightKg: 26.7,
  weightConfirmed: true,
  administrationsPerDay: 3,
  intervalHours: 8,
  route: "oral",
  finalDoseMg: 400,
  presentationId: "paracetamol_tempra_jarabe_32mg_ml_120ml",
  brandName: "Tempra",
  durationValue: 3,
  durationUnit: "dias"
});
assert.equal(rxTempra.valid, true);
assert.ok(rxTempra.instructionText.includes("Tempra"));
assert.ok(rxTempra.instructionText.includes("3.2 g/100 mL"));
assert.ok(rxTempra.instructionText.includes("12.5 mL"));
assert.ok(rxTempra.instructionText.includes("400 mg"));
assert.equal(rxTempra.packagingNeed.packagesNeeded, 1);

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
