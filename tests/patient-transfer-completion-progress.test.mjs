import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePatientTransferSavingView } from "../js/modules/patient-transfer/ui/patientTransferView.js";

const openedDocument = { open: true };
const openedSegment = { open: true };
const closedSegment = { open: false };
const scrollCalls = [];
const panel = {
  scrollTo(options) {
    scrollCalls.push(options);
  }
};
const progress = { offsetTop: 320 };
const header = { offsetHeight: 64 };
const modal = {
  querySelectorAll(selector) {
    assert.equal(selector, ".patient-transfer-note, .patient-transfer-note-segment");
    return [openedDocument, openedSegment, closedSegment];
  },
  querySelector(selector) {
    if (selector === ".patient-transfer-panel") return panel;
    if (selector === ".patient-transfer-progress") return progress;
    if (selector === ".patient-transfer-header") return header;
    return null;
  }
};

const prepared = preparePatientTransferSavingView(modal);
assert.equal(openedDocument.open, false, "el archivo se pliega al iniciar el traspaso");
assert.equal(openedSegment.open, false, "la nota se pliega al iniciar el traspaso");
assert.equal(closedSegment.open, false, "una nota ya cerrada permanece cerrada");
assert.deepEqual(prepared, { collapsedNotes: 2, scrolled: true, targetTop: 240 });
assert.deepEqual(scrollCalls, [{ top: 240, behavior: "smooth" }], "el panel vuelve suavemente al indicador superior");

const controller = readFileSync(new URL("../js/modules/patient-transfer/patientTransferController.js", import.meta.url), "utf8");
const repository = readFileSync(new URL("../js/modules/patient-transfer/patientTransferRepository.js", import.meta.url), "utf8");
const view = readFileSync(new URL("../js/modules/patient-transfer/ui/patientTransferView.js", import.meta.url), "utf8");

const confirmationAccepted = controller.indexOf("if (!confirmed)");
const prepareView = controller.indexOf("preparePatientTransferSavingView();", confirmationAccepted);
const savingState = controller.indexOf("setTransferSavingState(true);", confirmationAccepted);
assert.ok(confirmationAccepted >= 0 && prepareView > confirmationAccepted, "solo pliega las notas después de confirmar");
assert.ok(prepareView < savingState, "muestra el progreso antes de bloquear la interfaz por guardado");

const sourceStart = repository.indexOf('stage = "uploading_source"');
const sourceEnd = repository.indexOf("if (domainOutcome.errors.length)", sourceStart);
const auxiliarySourceBlock = repository.slice(sourceStart, sourceEnd);
assert.match(auxiliarySourceBlock, /recordAuxiliaryWarning\(stage, error\)/, "un fallo auxiliar queda como advertencia");
assert.doesNotMatch(auxiliarySourceBlock, /noteErrors\.push/, "subir el DOCX o sus metadatos no se confunde con la nota canónica");
assert.match(repository, /notesDetected,\s*notesIncluded,\s*notesCreated,\s*notesExisting,\s*notesOmitted,/s, "la rama parcial conserva todos los contadores de notas");
assert.match(repository, /warnings: auxiliaryWarnings/, "el resultado expone advertencias sanitizadas");
assert.match(view, /Traspaso completado con advertencias/, "la UI distingue advertencias auxiliares de un fallo clínico");

console.log("patient-transfer-completion-progress.test.mjs OK");
