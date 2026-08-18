import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  importedTreatmentPresentationKey,
  isSuspendedTreatmentAction,
  reconcileImportedTreatmentTimeline
} from "../js/modules/patient-transfer/integration/treatmentTimelineReconciler.js";

function medication(name, presentation, strengthValue, extra = {}) {
  return {
    id: `${name}-${presentation}-${strengthValue}-${extra.idSuffix || "candidate"}`,
    medicationName: name,
    normalizedMedicationName: name,
    presentation,
    strengthValue,
    strengthUnit: "mg",
    include: true,
    selectedForImport: true,
    action: extra.action || "Continúa",
    frequencyRaw: extra.frequencyRaw || "cada 24 horas",
    schedule: extra.schedule || [{ time: "08:00", quantity: 1 }]
  };
}

const documents = [
  {
    id: "note-1",
    sourceNoteDate: "01/08/2026",
    treatmentCandidates: [
      medication("Medicamento Alfa", "tabletas", 20, { action: "Inicia" }),
      medication("Medicamento Beta", "capsulas", 40),
      medication("Medicamento Gamma", "solucion", 5)
    ]
  },
  {
    id: "note-2",
    sourceNoteDate: "08/08/2026",
    treatmentCandidates: [
      medication("Medicamento Alfa", "tabletas", 20, { action: "Aumenta" }),
      medication("Medicamento Beta", "capsulas", 40, { schedule: [{ time: "22:00", quantity: 1 }] })
    ]
  },
  {
    id: "note-3",
    sourceNoteDate: "15/08/2026",
    treatmentCandidates: [
      medication("Medicamento Alfa", "tabletas", 20, { action: "Continúa", schedule: [{ time: "22:00", quantity: 2 }] }),
      medication("Medicamento Beta", "tabletas", 40, { action: "Inicia" }),
      medication("Medicamento Alfa", "tabletas", 20, { action: "Continúa", idSuffix: "duplicate" })
    ]
  }
];

const original = structuredClone(documents);
const result = reconcileImportedTreatmentTimeline(documents);
assert.equal(result.latestDocumentIndex, 2, "la nota clinicamente mas reciente define el tratamiento vigente");
assert.equal(result.selectedBefore, 8);
assert.equal(result.selectedAfter, 4);
assert.equal(result.deduplicated, 4);
assert.equal(result.suspended, 2);
assert.deepEqual(documents, original, "la reconciliacion no muta el modelo revisado");

const latest = result.documents[2].treatmentCandidates;
assert.equal(latest.length, 2, "la ultima nota no repite medicamento-presentacion");
assert.equal(latest.find((item) => item.medicationName === "Medicamento Alfa").action, "Continúa");
assert.ok(latest.some((item) => item.medicationName === "Medicamento Beta" && item.presentation === "tabletas"));

const older = result.documents.flatMap((document, index) => index === 2 ? [] : document.treatmentCandidates);
assert.deepEqual(
  older.map((item) => `${item.medicationName}:${item.presentation}`).sort(),
  ["Medicamento Beta:capsulas", "Medicamento Gamma:solucion"],
  "solo sobreviven antecedentes ausentes en la ultima nota"
);
older.forEach((item) => {
  assert.equal(item.action, "Suspende");
  assert.equal(item.statusSuggestion, "Suspende");
  assert.equal(item.suspensionDate, "15/08/2026");
  assert.equal(item.timelineResolution, "absent-from-latest-note");
});

assert.notEqual(
  importedTreatmentPresentationKey(medication("Medicamento Beta", "capsulas", 40)),
  importedTreatmentPresentationKey(medication("Medicamento Beta", "tabletas", 40)),
  "el mismo medicamento con otra presentacion se conserva como tratamiento distinto"
);
assert.notEqual(
  importedTreatmentPresentationKey(medication("Venlafaxina", "tabletas", 50)),
  importedTreatmentPresentationKey(medication("Desvenlafaxina", "tabletas", 50)),
  "nombres farmacologicos distintos no colisionan"
);
assert.equal(isSuspendedTreatmentAction("Suspende"), true);
assert.equal(isSuspendedTreatmentAction("suspendido"), true);
assert.equal(isSuspendedTreatmentAction("Continúa"), false);
assert.notEqual(
  importedTreatmentPresentationKey(medication("Medicamento Alfa", "tabletas", 20)),
  importedTreatmentPresentationKey(medication("Medicamento Alfa", "tabletas", 40)),
  "una concentracion distinta conserva otra presentacion clinica"
);

const latestWithoutMedication = reconcileImportedTreatmentTimeline([
  { id: "older", sourceNoteDate: "01/08/2026", treatmentCandidates: [medication("Medicamento Delta", "tabletas", 10)] },
  { id: "latest", sourceNoteDate: "02/08/2026", treatmentCandidates: [] }
]);
assert.equal(latestWithoutMedication.documents[0].treatmentCandidates[0].action, "Suspende");
assert.equal(latestWithoutMedication.documents[1].treatmentCandidates.length, 0);

const sourceOrderFallback = reconcileImportedTreatmentTimeline([
  { id: "first", sourceNoteDate: "", treatmentCandidates: [medication("Medicamento Epsilon", "tabletas", 5)] },
  { id: "last", sourceNoteDate: "", treatmentCandidates: [medication("Medicamento Epsilon", "tabletas", 5, { action: "Aumenta" })] }
]);
assert.equal(sourceOrderFallback.latestDocumentIndex, 1);
assert.equal(sourceOrderFallback.documents[0].treatmentCandidates.length, 0);
assert.equal(sourceOrderFallback.documents[1].treatmentCandidates[0].action, "Aumenta");

const explicitlyExcluded = medication("Medicamento Zeta", "tabletas", 5);
explicitlyExcluded.include = false;
explicitlyExcluded.selectedForImport = false;
const exclusionResult = reconcileImportedTreatmentTimeline([
  { id: "single", sourceNoteDate: "03/08/2026", treatmentCandidates: [explicitlyExcluded] }
]);
assert.equal(exclusionResult.selectedBefore, 0);
assert.equal(exclusionResult.selectedAfter, 0);
assert.equal(exclusionResult.documents[0].treatmentCandidates.length, 1, "las exclusiones explicitas se conservan para el resumen");
assert.equal(exclusionResult.documents[0].treatmentCandidates[0].include, false);

const adapterSource = readFileSync(new URL("../js/modules/patient-transfer/integration/clinicalDataImportAdapter.js", import.meta.url), "utf8");
const patientSource = readFileSync(new URL("../js/paciente.js", import.meta.url), "utf8");
assert.match(adapterSource, /const estado = suspended \? "suspendido" : action/);
assert.match(adapterSource, /cambioIndicacion: "se_suspende"/);
assert.match(patientSource, /tratamientosCache\.filter\(\(t\) => t\.estado === "suspendido"\)/);

console.log("patient-transfer-treatment-timeline.test.mjs OK");
