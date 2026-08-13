import assert from "node:assert/strict";
import {
  sanitizeFirestorePayload,
  withoutUndefinedValues
} from "../js/modules/patient-transfer/persistence/firestorePayloadSanitizer.js";

const parsedBlocks = [{
  type: "paragraph",
  text: "Contenido clinico ficticio",
  rawRuns: undefined,
  rows: undefined,
  source: { blockIndex: 0, pageIndex: undefined }
}];

assert.deepEqual(withoutUndefinedValues(parsedBlocks), [{
  type: "paragraph",
  text: "Contenido clinico ficticio",
  source: { blockIndex: 0 }
}], "los valores undefined del parser no llegan a Firestore");

assert.deepEqual(sanitizeFirestorePayload({
  subjetivo: "Contenido clinico ficticio",
  objetivo: undefined,
  importacionDocx: {
    imported: true,
    sourceNoteSegmentId: undefined
  },
  lista: ["uno", undefined, "dos"]
}), {
  subjetivo: "Contenido clinico ficticio",
  importacionDocx: { imported: true },
  lista: ["uno", "dos"]
});

console.log("patient-transfer-note-payload-sanitizer.test.mjs OK");
