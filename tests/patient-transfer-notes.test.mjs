import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { segmentClinicalNotes, expandSegmentedDocumentsForPersistence } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const segments = segmentClinicalNotes({
  blocks: [
    { type: "paragraph", text: "NOTA 1\nFecha: 01/08/2026\nSUBJETIVO: evolucion uno", source: { blockIndex: 0 } },
    { type: "paragraph", text: "Fecha: 03/08/2026 09:10\nSUBJETIVO: evolucion dos", source: { blockIndex: 1 } },
    { type: "paragraph", text: "Fecha: 04/08/2026 21:45\nSUBJETIVO: evolucion tres", source: { blockIndex: 2 } }
  ],
  multipleNotesMode: "multiple",
  documentId: "doc-notes",
  proposedBoundaries: [{ blockIndex: 1 }, { blockIndex: 2 }]
});
assert.equal(segments.length, 3, "tres segmentos deben producir tres notas");
const expanded = expandSegmentedDocumentsForPersistence([{
  id: "doc-notes",
  hash: "hash-notes",
  textHash: "text-notes",
  metadata: {},
  noteSegments: segments
}]);
assert.equal(expanded.length, 3, "cada segmento debe expandirse independientemente");
assert.deepEqual(expanded.map((item) => item.sourceNoteDate), ["01/08/2026", "03/08/2026", "04/08/2026"]);
assert.ok(expanded.every((item) => item.sourceNoteSegmentId), "cada nota debe conservar identidad de segmento");

const adapter = read("../js/modules/patient-transfer/integration/noteCreationAdapter.js");
const repository = read("../js/modules/patient-transfer/patientTransferRepository.js");
assert.match(adapter, /finalizarNotaClinica/);
assert.match(adapter, /estadoNota: "definitiva"/);
assert.match(adapter, /fechaNota/);
assert.match(adapter, /importedNoteId/);
assert.match(adapter, /getDocFromServer/);
assert.match(repository, /patient-transfer:notes-source-real/);
assert.match(repository, /patient-transfer:notes-history-before-real/);
assert.match(repository, /patient-transfer:notes-history-after-real/);
assert.match(repository, /patient-transfer:notes-write-not-observed/);
assert.match(repository, /importedNoteHasClinicalContent/);
assert.match(repository, /notes-empty-segment-skipped/);
assert.match(repository, /operation\.data\?\.status === "completed"/);

const nullDate = expandSegmentedDocumentsForPersistence([{
  id: "doc-null-date",
  metadata: { documentDate: null },
  noteSegments: [{ id: "doc-null-date-note-1", rawText: "SUBJETIVO: texto", sections: { subjetivo: "texto" }, date: "", time: "", blocks: [], omitted: false }]
}]);
assert.equal(nullDate.length, 1, "una fecha nula no debe romper la expansion");
assert.equal(nullDate[0].sourceNoteDate, "");

console.log("patient-transfer-notes.test.mjs OK");
