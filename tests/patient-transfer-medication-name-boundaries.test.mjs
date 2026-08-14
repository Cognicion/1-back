import assert from "node:assert/strict";
import { MEDICAMENTOS_MAESTROS } from "../js/data/catalogoFarmacologicoUnificado.js";
import { splitMedicationItems } from "../js/modules/clinical-document-engine/normalizers/medicationNormalizer.js?v=20260814-medication-name-boundaries-v1";
import { parseMedicationCandidates } from "../js/modules/clinical-document-engine/parsers/medicationParser.js?v=20260814-medication-name-boundaries-v1";
import { resolveMedicationCandidatesAgainstCatalog } from "../js/modules/clinical-document-engine/resolvers/medicationCatalogResolver.js?v=20260814-medication-name-boundaries-v1";

const desvenlafaxineOnly = "Suspender desvenlafaxina tabletas de 50 mg vía oral una vez al día a las 08:00 horas.";
const singleChunks = splitMedicationItems(desvenlafaxineOnly, MEDICAMENTOS_MAESTROS);

assert.equal(singleChunks.some((item) => item.toLowerCase() === "des"), false, "no corta el prefijo de desvenlafaxina");
assert.equal(singleChunks.some((item) => /^venlafaxina\b/i.test(item)), false, "no encuentra venlafaxina dentro de desvenlafaxina");

const singleCandidates = parseMedicationCandidates({
  text: desvenlafaxineOnly,
  documentId: "fixture-medication-boundary",
  noteId: "note-1",
  date: "14/08/2026"
});

assert.deepEqual(
  singleCandidates.map((candidate) => candidate.normalizedMedicationName),
  ["desvenlafaxina"],
  "desvenlafaxina produce una sola entidad farmacológica"
);
assert.equal(singleCandidates[0].strength, 50);
assert.equal(singleCandidates[0].strengthUnit, "mg");

const bothMedications = [
  "Desvenlafaxina tabletas de 50 mg vía oral una vez al día a las 08:00 horas",
  "Venlafaxina cápsulas de 75 mg vía oral una vez al día a las 20:00 horas"
].join("; ");
const resolved = resolveMedicationCandidatesAgainstCatalog(parseMedicationCandidates({
  text: bothMedications,
  documentId: "fixture-medication-boundary",
  noteId: "note-2",
  date: "14/08/2026"
}));

assert.deepEqual(
  resolved.map((candidate) => candidate.normalizedMedicationName),
  ["desvenlafaxina", "venlafaxina"],
  "mantiene ambos medicamentos como entidades diferentes cuando ambos existen"
);
assert.deepEqual(
  resolved.map((candidate) => candidate.catalogMedicationId),
  ["desvenlafaxina", "venlafaxina"],
  "cada medicamento conserva su identidad canónica independiente"
);

console.log("patient-transfer-medication-name-boundaries.test.mjs OK");
