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

const rawOnly = expandSegmentedDocumentsForPersistence([{
  id: "doc-raw-note",
  hash: "hash-raw-note",
  textHash: "text-raw-note",
  metadata: {},
  noteSegments: [{
    id: "doc-raw-note-1",
    rawText: "Evolucion clinica externa sin encabezados estructurados.",
    sections: {},
    date: "04/08/2026",
    time: "10:30",
    blocks: [],
    omitted: false
  }]
}]);
assert.equal(rawOnly[0].fullText, "Evolucion clinica externa sin encabezados estructurados.", "el segmento conserva el texto fuente para guardarse como nota canónica");

const adapter = read("../js/modules/patient-transfer/integration/noteCreationAdapter.js");
const repository = read("../js/modules/patient-transfer/patientTransferRepository.js");
assert.match(adapter, /finalizarNotaClinica/);
assert.match(adapter, /estadoNota: "definitiva"/);
assert.match(adapter, /tipoNota: "Nota externa"/);
assert.match(adapter, /tipoNotaClave: `nota_externa:/);
assert.match(adapter, /origen: "nota_externa"/);
assert.match(adapter, /fechaNota/);
assert.match(adapter, /importedNoteId/);
assert.match(adapter, /getDocFromServer/);
assert.match(adapter, /sourceTextForImportedNote\(document\)/, "una nota con texto fuente no se descarta por falta de secciones");
assert.match(adapter, /subjetivo: sectionValue\(sections, "subjetivo"\) \|\| sourceText/, "el texto fuente conserva una nota visible en el historial canónico");
assert.match(adapter, /pacienteId: patientId/, "la nota importada conserva el paciente destino canónico");
assert.match(adapter, /usuarioId: user\?\.uid \|\| ""/, "la nota importada conserva el autor requerido por el historial canónico");
assert.match(adapter, /medicoResponsable: author/, "la nota importada usa el formato de autor de nota.html");
assert.match(adapter, /sanitizeFirestorePayload/, "la nota elimina valores undefined antes de usar el escritor canonico");
assert.doesNotMatch(adapter, /structuredBlocks/, "los bloques crudos no se insertan en el documento canonico de notas");
assert.doesNotMatch(adapter, /clinicalAnalysis/, "el analisis interno del parser no se inserta en el documento canonico de notas");
assert.match(repository, /patient-transfer:notes-source-real/);
assert.match(repository, /patient-transfer:notes-history-before-real/);
assert.match(repository, /patient-transfer:notes-history-after-real/);
assert.match(repository, /patient-transfer:notes-write-not-observed/);
assert.match(repository, /importedNoteHasClinicalContent/);
assert.match(repository, /notes-empty-segment-skipped/);
assert.match(repository, /operation\.data\?\.status === "completed"/);
assert.match(repository, /notes-after-domain-error/);
assert.match(repository, /noteWillStillBeAttempted: true/);
assert.match(repository, /notesObserved !== notesIncluded/, "una escritura incompleta de notas no se marca como completada");
assert.match(repository, /error\.code = "notes-persistence-incomplete"/, "el fallo de historial queda visible y reintentable");
assert.match(repository, /pacienteId: patientId/, "el control de duplicados conserva el paciente destino sin usar una variable inexistente");

const nullDate = expandSegmentedDocumentsForPersistence([{
  id: "doc-null-date",
  metadata: { documentDate: null },
  noteSegments: [{ id: "doc-null-date-note-1", rawText: "SUBJETIVO: texto", sections: { subjetivo: "texto" }, date: "", time: "", blocks: [], omitted: false }]
}]);
assert.equal(nullDate.length, 1, "una fecha nula no debe romper la expansion");
assert.equal(nullDate[0].sourceNoteDate, "");

console.log("patient-transfer-notes.test.mjs OK");
