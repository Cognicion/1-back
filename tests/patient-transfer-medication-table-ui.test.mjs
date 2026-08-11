import assert from "node:assert/strict";
import {
  clampMedicationColumnWidth,
  defaultMedicationColumnWidths,
  formatMedicationPresentation,
  isMeaningfulMedicationAdministration,
  loadMedicationColumnWidths,
  MEDICATION_COLUMN_WIDTHS,
  MEDICATION_COLUMN_WIDTHS_STORAGE_KEY,
  medicationCatalogCompactState,
  medicationColumnWidthFromDrag,
  normalizeMedicationColumnWidths,
  normalizeMedicationUnitForDisplay,
  saveMedicationColumnWidths,
  shouldShowMedicationAdministrationUnit
} from "../js/modules/patient-transfer/ui/patientTransferView.js";

assert.equal(MEDICATION_COLUMN_WIDTHS_STORAGE_KEY, "patientTransferMedicationColumnWidths");
assert.deepEqual(Object.keys(MEDICATION_COLUMN_WIDTHS), [
  "include",
  "medication",
  "presentation",
  "route",
  "frequency",
  "schedule",
  "action",
  "date",
  "source"
]);

assert.equal(clampMedicationColumnWidth("medication", 80), MEDICATION_COLUMN_WIDTHS.medication.min);
assert.equal(clampMedicationColumnWidth("medication", 500), MEDICATION_COLUMN_WIDTHS.medication.max);
assert.equal(clampMedicationColumnWidth("medication", Number.NaN), MEDICATION_COLUMN_WIDTHS.medication.default);
assert.equal(clampMedicationColumnWidth("schedule", 360), 360);
assert.equal(medicationColumnWidthFromDrag("medication", 180, 100, 175), 255, "el drag modifica solo el ancho solicitado");
assert.equal(medicationColumnWidthFromDrag("include", 48, 100, 500), 70, "el drag respeta el máximo");
assert.deepEqual(normalizeMedicationColumnWidths({ medication: 500, schedule: 360, unknown: 999 }), {
  include: 48,
  medication: 320,
  presentation: 220,
  route: 76,
  frequency: 135,
  schedule: 360,
  action: 118,
  date: 104,
  source: 92
});

const memoryStorage = {
  value: "",
  getItem(key) { return key === MEDICATION_COLUMN_WIDTHS_STORAGE_KEY ? this.value : null; },
  setItem(key, value) { if (key === MEDICATION_COLUMN_WIDTHS_STORAGE_KEY) this.value = value; }
};
assert.equal(saveMedicationColumnWidths({ medication: 250, schedule: 400 }, memoryStorage), true);
assert.equal(loadMedicationColumnWidths(memoryStorage).medication, 250, "restaura el ancho guardado");
assert.equal(loadMedicationColumnWidths(memoryStorage).schedule, 400);
memoryStorage.value = "{inválido";
assert.deepEqual(loadMedicationColumnWidths(memoryStorage), defaultMedicationColumnWidths(), "almacenamiento inválido restaura defaults");

assert.deepEqual(medicationCatalogCompactState("fluoxetina"), {
  linked: true,
  label: "Catálogo: Sí",
  action: "Cambiar",
  expanded: false
});
assert.equal(medicationCatalogCompactState("fluoxetina", true).action, "Cancelar");
assert.deepEqual(medicationCatalogCompactState(""), {
  linked: false,
  label: "Catálogo: No",
  action: "Vincular",
  expanded: false
});

assert.equal(normalizeMedicationUnitForDisplay("TABLETAS"), "tableta");
assert.equal(normalizeMedicationUnitForDisplay("cápsulas"), "capsula");
assert.equal(normalizeMedicationUnitForDisplay("mL"), "ml");
assert.equal(shouldShowMedicationAdministrationUnit("tabletas", "tableta"), false);
assert.equal(shouldShowMedicationAdministrationUnit("cápsulas", "cápsula"), false);
assert.equal(shouldShowMedicationAdministrationUnit("solución", "mL"), true);
assert.equal(shouldShowMedicationAdministrationUnit("tabletas", "mg"), true);
assert.equal(shouldShowMedicationAdministrationUnit("", "mL"), true);

const administration = { time: "08:00", quantity: 2, administrationUnit: "tableta" };
assert.equal(shouldShowMedicationAdministrationUnit("tabletas", administration.administrationUnit), false);
assert.deepEqual(administration, { time: "08:00", quantity: 2, administrationUnit: "tableta" }, "ocultar la unidad no altera el modelo");
assert.equal(isMeaningfulMedicationAdministration({ time: "", quantity: null, administrationUnit: "tableta" }), false, "una unidad heredada no crea una toma fantasma");
assert.equal(isMeaningfulMedicationAdministration({ time: "08:00", quantity: null, administrationUnit: "tableta" }), true);
assert.equal(isMeaningfulMedicationAdministration({ time: "", quantity: 0, administrationUnit: "mL" }), true);

assert.equal(formatMedicationPresentation({ presentation: "tabletas", concentration: { value: 20, unit: "mg" } }), "tabletas de 20 mg");
assert.equal(formatMedicationPresentation({ presentation: "cápsulas", strengthValue: 40, strengthUnit: "mg" }), "cápsulas de 40 mg");
assert.equal(formatMedicationPresentation({ presentation: "solución", strengthValue: 5, strengthUnit: "mg/mL" }), "solución de 5 mg/mL");
assert.equal(formatMedicationPresentation({ presentation: "tabletas" }), "tabletas");
assert.equal(formatMedicationPresentation({ strengthValue: 20, strengthUnit: "mg" }), "20 mg");
assert.equal(formatMedicationPresentation({ presentation: "tabletas de 20 mg", strengthValue: 20, strengthUnit: "mg" }), "tabletas de 20 mg");
assert.equal(formatMedicationPresentation({ presentation: "tabletas", strengthValue: 20 }), "tabletas de 20");
assert.equal(formatMedicationPresentation({ presentation: "tabletas", strengthValue: 20, strengthUnit: "" }), "tabletas de 20");

console.log("patient-transfer-medication-table-ui: ok");
