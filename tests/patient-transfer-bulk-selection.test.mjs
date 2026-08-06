import assert from "node:assert/strict";
import {
  applyBulkCandidateSelection,
  getBulkSelectionState,
  isTransferCandidateSelectable
} from "../js/modules/patient-transfer/ui/patientTransferView.js";

const medication = {
  id: "tx-1",
  medicationName: "Olanzapina",
  catalogMedicationId: "olanzapina",
  presentation: "tabletas",
  strengthValue: 10,
  strengthUnit: "mg",
  route: "oral",
  frequencyRaw: "1 vez al día",
  schedule: [{ time: "22:00", quantity: 1, unit: "tableta" }],
  action: "Inicia",
  codes: ["F33.2"]
};

const groups = [{
  id: "group-1",
  documents: [{
    id: "document-1",
    noteSegments: [
      {
        id: "note-1",
        diagnosisCandidates: [
          { id: "dx-1", diagnosisName: "Diagnóstico 1", code: "F33.2", codes: ["F33.2"] },
          { id: "dx-2", diagnosisName: "Diagnóstico 2", code: "F43.1", codes: ["F43.1"], include: true, selectedForImport: true }
        ],
        treatmentCandidates: [{ ...medication }, { id: "tx-review", medicationName: "Sin resolver", requiresCatalogReview: true }]
      },
      {
        id: "note-2",
        diagnosisCandidates: [{ id: "dx-3", diagnosisName: "Diagnóstico independiente" }],
        treatmentCandidates: [{ ...medication, id: "tx-2", medicationName: "Sertralina" }]
      },
      {
        id: "note-omitted",
        omitted: true,
        diagnosisCandidates: [{ id: "dx-4", diagnosisName: "No modificar", include: true, selectedForImport: true }],
        treatmentCandidates: []
      }
    ]
  }]
}];

assert.equal(isTransferCandidateSelectable({ id: "active" }, "diagnosis"), true);
assert.equal(isTransferCandidateSelectable({ id: "invalid", invalidated: true }, "diagnosis"), false);
assert.equal(isTransferCandidateSelectable({ id: "review", requiresCatalogReview: true }, "treatment"), false);

const partial = getBulkSelectionState(groups[0].documents[0].noteSegments[0].diagnosisCandidates, "diagnosis");
assert.equal(partial.checked, false);
assert.equal(partial.indeterminate, true, "la selección parcial muestra estado indeterminado");

const diagnosesSelected = applyBulkCandidateSelection(groups, {
  documentId: "document-1",
  noteId: "note-1",
  candidateType: "diagnosis",
  selected: true
});
assert.equal(diagnosesSelected.affectedCount, 2);
assert.equal(diagnosesSelected.candidateCount, 2);
assert.ok(diagnosesSelected.groups[0].documents[0].noteSegments[0].diagnosisCandidates.every((candidate) => candidate.include && candidate.selectedForImport));
assert.equal(diagnosesSelected.groups[0].documents[0].noteSegments[1].diagnosisCandidates[0].include, undefined, "no selecciona diagnósticos de otra nota");
assert.deepEqual(diagnosesSelected.groups[0].documents[0].noteSegments[0].diagnosisCandidates[0].codes, ["F33.2"], "conserva códigos múltiples");

const diagnosesCleared = applyBulkCandidateSelection(diagnosesSelected.groups, {
  documentId: "document-1",
  noteId: "note-1",
  candidateType: "diagnosis",
  selected: false
});
assert.ok(diagnosesCleared.groups[0].documents[0].noteSegments[0].diagnosisCandidates.every((candidate) => !candidate.include && !candidate.selectedForImport));

const treatmentsSelected = applyBulkCandidateSelection(groups, {
  documentId: "document-1",
  noteId: "note-1",
  candidateType: "treatment",
  selected: true
});
assert.equal(treatmentsSelected.affectedCount, 1, "no selecciona tratamientos que requieren resolución de catálogo");
assert.equal(treatmentsSelected.candidateCount, 2);
const selectedMedication = treatmentsSelected.groups[0].documents[0].noteSegments[0].treatmentCandidates[0];
assert.equal(selectedMedication.include, true);
assert.equal(selectedMedication.catalogMedicationId, "olanzapina", "conserva la identidad del catálogo");
assert.deepEqual(selectedMedication.schedule, [{ time: "22:00", quantity: 1, unit: "tableta" }], "conserva horarios y dosis estructurados");
assert.equal(treatmentsSelected.groups[0].documents[0].noteSegments[0].treatmentCandidates[1].include, undefined);

const omitted = applyBulkCandidateSelection(groups, {
  documentId: "document-1",
  noteId: "note-omitted",
  candidateType: "diagnosis",
  selected: false
});
assert.equal(omitted.affectedCount, 0, "una nota omitida conserva su selección previa");
assert.equal(omitted.groups[0].documents[0].noteSegments[2].diagnosisCandidates[0].include, true);
assert.equal(getBulkSelectionState(omitted.groups[0].documents[0].noteSegments[2].diagnosisCandidates, "diagnosis", true).disabled, true);

console.log("patient-transfer-bulk-selection.test.mjs OK");
