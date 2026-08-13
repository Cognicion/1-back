import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalImportedNoteReferences,
  canVerifyCanonicalImportedNotes
} from "../js/modules/patient-transfer/persistence/importedNoteDuplicateValidation.js";

assert.deepEqual(canonicalImportedNoteReferences({
  patientId: "target-patient",
  noteIds: ["note-1", "note-2"],
  documents: [{ noteId: "note-2" }, { noteId: "note-3" }]
}), {
  patientId: "target-patient",
  noteIds: ["note-1", "note-2", "note-3"]
});

assert.deepEqual(canonicalImportedNoteReferences({
  pacienteId: "legacy-target",
  notaId: "legacy-note"
}), {
  patientId: "legacy-target",
  noteIds: ["legacy-note"]
});

assert.equal(canVerifyCanonicalImportedNotes({
  status: "completed",
  patientId: "target-patient",
  noteIds: ["note-1"]
}, { requireCompletedStatus: true }), true);

assert.equal(canVerifyCanonicalImportedNotes({
  status: "completed",
  patientId: "target-patient",
  noteIds: []
}, { requireCompletedStatus: true }), false, "una operacion sin notas no prueba una importacion completa");

assert.equal(canVerifyCanonicalImportedNotes({
  status: "partially_completed",
  patientId: "target-patient",
  noteIds: ["note-1"]
}, { requireCompletedStatus: true }), false, "una operacion parcial no se presenta como ya importada");

const repository = readFileSync(new URL("../js/modules/patient-transfer/patientTransferRepository.js", import.meta.url), "utf8");
assert.match(repository, /getDocFromServer\(doc\(db, "usuarios", patientId, "notasMedicas", noteId\)\)/);
assert.match(repository, /patient-transfer:stale-duplicate-ignored/);
assert.match(repository, /requireCompletedStatus: true/);
assert.doesNotMatch(repository, /if \(operation\.exists\(\)\) \{\s*return \{ id: operation\.id/s, "la operacion no debe bastar para declarar duplicado");

console.log("patient-transfer-note-duplicate-validation.test.mjs OK");
