import assert from "node:assert/strict";
import { parseClinicalSections } from "../js/modules/patient-transfer/parsing/clinicalSectionParser.js";
import { detectMultipleClinicalNotes, expandSegmentedDocumentsForPersistence, mergeClinicalSegments, segmentClinicalNotes, splitClinicalSegment } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { initializeFileMultipleNotesMode, updateFileMultipleNotesMode } from "../js/modules/patient-transfer/state/multipleNotesModeState.js";

const blocks = [
  { type: "paragraph", text: "NOTA DE EVOLUCIÓN", source: { blockIndex: 0 } },
  { type: "paragraph", text: "Fecha: 01/08/2026 Hora: 09:00", source: { blockIndex: 1 } },
  { type: "paragraph", text: "SUBJETIVO: Primera evolución.", source: { blockIndex: 2 } },
  { type: "paragraph", text: "OBJETIVO: Primer objetivo.", source: { blockIndex: 3 } },
  { type: "paragraph", text: "NOTA DE EVOLUCIÓN", source: { blockIndex: 4 } },
  { type: "paragraph", text: "Fecha: 02/08/2026 Hora: 10:00", source: { blockIndex: 5 } },
  { type: "paragraph", text: "SUBJETIVO: Segunda evolución.", source: { blockIndex: 6 } },
  { type: "paragraph", text: "ANÁLISIS: Segundo análisis.", source: { blockIndex: 7 } }
];

const headings = parseClinicalSections(blocks).encabezados;
const detection = detectMultipleClinicalNotes({ blocks, headings });
assert.equal(detection.probableMultipleNotes, true);
assert.ok(detection.reasons.includes("multiple-clinical-dates"));
assert.ok(detection.reasons.includes("repeated-note-heading"));

const automaticLegacyCall = segmentClinicalNotes({ blocks, manualMultipleNotes: false, proposedBoundaries: detection.proposedNoteBoundaries, documentId: "doc" });
assert.equal(automaticLegacyCall.length, 2, "la ausencia de confirmación manual conserva la detección automática");

const multiple = segmentClinicalNotes({ blocks, manualMultipleNotes: true, proposedBoundaries: detection.proposedNoteBoundaries, documentId: "doc" });
assert.equal(multiple.length, 2, "la opción manual aplica las divisiones propuestas");
assert.match(multiple[0].sections.subjetivo, /Primera evolución/);
assert.match(multiple[1].sections.subjetivo, /Segunda evolución/);
assert.equal(multiple[0].date, "01/08/2026");
assert.equal(multiple[1].date, "02/08/2026");

const automatic = segmentClinicalNotes({ blocks, multipleNotesMode: "auto", proposedBoundaries: detection.proposedNoteBoundaries, documentId: "doc-auto" });
assert.equal(automatic.length, 2, "el modo automático usa los límites detectados");
const automaticWithoutProposal = segmentClinicalNotes({ blocks, multipleNotesMode: "auto", proposedBoundaries: [], documentId: "doc-auto-fallback" });
assert.equal(automaticWithoutProposal.length, 2, "el modo automático detecta límites cuando no fueron proporcionados");

const explicitSingle = segmentClinicalNotes({ blocks, multipleNotesMode: "single", proposedBoundaries: detection.proposedNoteBoundaries, documentId: "doc-single" });
assert.equal(explicitSingle.length, 1, "una sola nota ignora deliberadamente los límites detectados");

const explicitMultiple = segmentClinicalNotes({ blocks, multipleNotesMode: "multiple", proposedBoundaries: detection.proposedNoteBoundaries, documentId: "doc-multiple" });
assert.equal(explicitMultiple.length, 2, "varias notas usa los límites detectados");
const multipleWithoutProposal = segmentClinicalNotes({ blocks, multipleNotesMode: "multiple", proposedBoundaries: [], documentId: "doc-multiple-fallback" });
assert.equal(multipleWithoutProposal.length, 2, "varias notas puede recuperar límites desde títulos clínicos explícitos");

const fileModes = [
  initializeFileMultipleNotesMode({ id: "file-a" }),
  initializeFileMultipleNotesMode({ id: "file-b" }),
  initializeFileMultipleNotesMode({ id: "file-c" })
];
const independentModes = updateFileMultipleNotesMode(
  updateFileMultipleNotesMode(fileModes, "file-b", "multiple"),
  "file-c",
  "single"
);
assert.deepEqual(independentModes.map((item) => item.multipleNotesMode), ["auto", "multiple", "single"], "cada DOCX conserva un modo independiente");
assert.equal(independentModes[1].containsMultipleNotes, true);
assert.equal(independentModes[0].containsMultipleNotes, false);

const tableTitleBlocks = [
  { type: "table", rows: [["Institución", "NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN"]], source: { blockIndex: 0 } },
  { type: "paragraph", text: "Fecha: 03/08/2026 Hora: 08:00", source: { blockIndex: 1 } },
  { type: "table", rows: [["Institución", "NOTA DE EVOLUCION AL SERVICIO DE OBSERVACIÓN"]], source: { blockIndex: 2 } },
  { type: "paragraph", text: "Fecha: 03/08/2026 Hora: 12:00", source: { blockIndex: 3 } }
];
const tableTitleDetection = detectMultipleClinicalNotes({ blocks: tableTitleBlocks });
assert.equal(tableTitleDetection.explicitNoteCount, 2, "reconoce títulos con y sin acento dentro de tablas");
assert.equal(segmentClinicalNotes({ blocks: tableTitleBlocks, multipleNotesMode: "auto", documentId: "doc-table" }).length, 2);

const brianDateReferences = [
  { type: "paragraph", text: "NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN", source: { blockIndex: 0 } },
  { type: "paragraph", text: "Nombre del paciente: BRIAN EFRAIN CEGUEDA VALDEZ Fecha de nacimiento: 28/06/2001 Cama: 03 Expediente: 179517", source: { blockIndex: 1 } },
  { type: "paragraph", text: "Fecha: 04/08/2026 Hora: 21:45 H Días estancia: PRIMERAS HORAS", source: { blockIndex: 2 } },
  { type: "paragraph", text: "MOTIIVO DE INGRESO: RIESGO SUICIDA. Se trata de Brian de 25 años.", source: { blockIndex: 3 } },
  { type: "paragraph", text: "Último internamiento 17/07/26 15:30, con egreso voluntario.", source: { blockIndex: 4 } },
  { type: "paragraph", text: "EXPLORACIÓN FÍSICA Y NEUROLÓGICA", source: { blockIndex: 5 } }
];
const brianDetection = detectMultipleClinicalNotes({
  blocks: brianDateReferences,
  dates: ["28/06/2001", "04/08/2026", "17/07/26"]
});
assert.equal(brianDetection.explicitNoteCount, 1);
assert.equal(brianDetection.probableMultipleNotes, false, "fechas de nacimiento e internamientos previos no generan notas");
assert.deepEqual(brianDetection.proposedNoteBoundaries.map((boundary) => boundary.blockIndex), [0]);
assert.equal(segmentClinicalNotes({ blocks: brianDateReferences, multipleNotesMode: "auto", documentId: "brian" }).length, 1);

const joined = mergeClinicalSegments(multiple, multiple[0].id);
assert.equal(joined.length, 1, "permite unir notas contiguas");

const divided = splitClinicalSegment(joined, joined[0].id);
assert.equal(divided.length, 2, "permite dividir manualmente una nota");

const persistenceDocuments = expandSegmentedDocumentsForPersistence([{
  id: "doc",
  textHash: "hash",
  noteSegments: multiple.map((segment, index) => ({
    ...segment,
    diagnosisCandidates: [{ id: `dx-${index}` }],
    treatmentCandidates: [{ id: `tx-${index}` }],
    vitalSignsCandidates: index === 0 ? [{ id: "vitals-1" }] : []
  }))
}]);
assert.equal(persistenceDocuments.length, 2, "crea una nota persistible por segmento confirmado");
assert.equal(persistenceDocuments[0].vitalSignsCandidates.length, 1);
assert.equal(persistenceDocuments[1].vitalSignsCandidates.length, 0, "no replica signos vitales en todas las notas");

console.log("patient-transfer-note-segmentation.test.mjs OK");
