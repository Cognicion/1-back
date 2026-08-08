import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const controller = read("js/modules/patient-transfer/patientTransferController.js");
const view = read("js/modules/patient-transfer/ui/patientTransferView.js");

assert.equal((view.match(/data-transfer-save/g) || []).length >= 3, true, "la vista crea y actualiza el boton de confirmar");
assert.equal((view.match(/root\.innerHTML\s*=/g) || []).length, 1, "el modal raiz se construye una sola vez");
assert.match(view, /if \(root\) return root;/, "ensureRoot conserva la identidad del modal y sus controles");
assert.match(view, /querySelector\("\[data-transfer-review\]"\)\.innerHTML/, "los rerenders sustituyen solo el contenido de revision");
assert.doesNotMatch(
  view.slice(view.indexOf("export function renderDetectedGroups"), view.indexOf("export function readTransferReview")),
  /data-transfer-save[^\n]*innerHTML|outerHTML|replaceWith|replaceChildren/,
  "renderDetectedGroups no reemplaza el boton visible"
);

const initializerStart = controller.indexOf("export function initializePatientTransfer");
const initializer = controller.slice(initializerStart);
assert.equal((initializer.match(/\[data-transfer-save\][\s\S]{0,80}addEventListener\("click"/g) || []).length, 1, "existe un solo listener de click para confirmar");
assert.match(initializer, /addEventListener\("click", handleConfirmTransferClick\)/, "el nodo conserva el listener nombrado");

const handlerStart = controller.indexOf("async function handleConfirmTransferClick");
const handlerEnd = controller.indexOf("function resetAndOpen", handlerStart);
const handler = controller.slice(handlerStart, handlerEnd);
assert.match(handler, /patient-transfer:confirm-native-click/, "el handler deja la traza nativa solicitada");
assert.match(handler, /eventType: event\?\.type \|\| "programmatic"/);
assert.match(handler, /targetIsSaveControl: Boolean\(event\?\.target\?\.closest\?\.\("\[data-transfer-save\]"\)\)/);
assert.match(handler, /globalThis\.document\?\.querySelector\?\.\("\.patient-transfer-modal \[data-transfer-save\]"\)/);
assert.match(handler, /connected: Boolean\(button\?\.isConnected\)/);
assert.match(handler, /disabled: Boolean\(button\?\.disabled\)/);
assert.match(handler, /ariaDisabled: button\?\.getAttribute\("aria-disabled"\)/);
assert.match(handler, /saving: button\?\.closest\?\.\("\.patient-transfer-modal"\)\?\.dataset\?\.saving === "true"/);
assert.ok(handler.indexOf("confirm-native-click") < handler.indexOf("confirm-handler-enter"));
assert.ok(handler.indexOf("confirm-handler-enter") < handler.indexOf("confirm-before-save"));
assert.ok(handler.indexOf("confirm-before-save") < handler.indexOf("await saveReviewedTransfer()"));
assert.match(handler, /patient-transfer:confirm-button-state/);
assert.match(handler, /target:\s*\{[\s\S]*tagName:[\s\S]*id:[\s\S]*className:/);
assert.match(handler, /currentTarget:\s*\{[\s\S]*tagName:[\s\S]*id:[\s\S]*className:/);
assert.match(handler, /patient-transfer:confirm-error/);

const saveStart = controller.indexOf("async function saveReviewedTransfer");
const saveEnd = controller.indexOf("async function handleConfirmTransferClick", saveStart);
const save = controller.slice(saveStart, saveEnd);
assert.match(save, /^async function saveReviewedTransfer[^\n]*\{\s*console\.info\("patient-transfer:save-reviewed-enter",/, "la primera linea efectiva deja traza de entrada");

const bareReturns = (save.match(/\breturn;/g) || []).length;
const returnTraces = (save.match(/patient-transfer:save-reviewed-return/g) || []).length;
assert.equal(bareReturns, 9, "se inventariaron todos los retornos tempranos del guardado");
assert.equal(returnTraces, bareReturns, "cada retorno temprano tiene una razon explicita");

[
  "saving-already-active",
  "no-groups",
  "segmentation-needs-reanalysis",
  "unresolved-duplicate",
  "no-clinical-selection",
  "missing-patient",
  "duplicate-resolution-required",
  "duplicate-confirmation-cancelled",
  "confirmation-cancelled"
].forEach((reason) => {
  assert.ok(save.includes(`"${reason}"`), `existe la razon ${reason}`);
});
assert.match(save, /patient-transfer:sync-reviewed-complete/);
assert.match(save, /patient-transfer:persistence-start/);
assert.match(save, /patient-transfer:confirmation-request/, "se registra cada confirmacion nativa");
assert.match(save, /patient-transfer:confirmation-result/, "se registra el resultado de cada confirmacion nativa");

const syncStart = controller.indexOf("function syncReviewedGroupsFromView");
const syncEnd = controller.indexOf("function toggleAllCandidates", syncStart);
const sync = controller.slice(syncStart, syncEnd);
[
  "groupsCount",
  "documentsCount",
  "createNewCount",
  "associateExistingCount",
  "unresolvedCount",
  "omittedCount",
  "diagnosesSelected",
  "treatmentsSelected"
].forEach((field) => assert.match(sync, new RegExp(`${field}:`), `el resumen sincronizado incluye ${field}`));
assert.match(sync, /return counts;/, "la sincronizacion devuelve su resumen sanitario al guardado");

assert.doesNotMatch(
  controller,
  /confirm-(?:native-click|handler-enter|before-save)[\s\S]{0,300}(?:patientId|nombre|expediente|curp|diagnosisName|medicationName)\s*:/i,
  "las nuevas trazas no incluyen identificadores ni texto clinico"
);

console.log("patient-transfer-confirm-observability.test.mjs OK");
