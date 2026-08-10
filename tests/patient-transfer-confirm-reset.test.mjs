import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const controller = readFileSync(
  join(process.cwd(), "js/modules/patient-transfer/patientTransferController.js"),
  "utf8"
).replace(/\r\n/g, "\n");

function extractFunction(startMarker, endMarker) {
  const start = controller.indexOf(startMarker);
  const end = controller.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `se puede extraer ${startMarker}`);
  return controller.slice(start, end).replace(/^export\s+/, "");
}

const handlerSource = extractFunction(
  "async function handleConfirmTransferClick",
  "\n\nfunction resetAndOpen"
);
const resetSource = extractFunction(
  "function resetAndOpen",
  "\n\nfunction syncReviewedGroupsFromView"
);
const initializeSource = extractFunction(
  "export function initializePatientTransfer",
  "\n}"
) + "\n}";

class FakeElement {
  constructor({ save = false } = {}) {
    this.disabled = false;
    this.hidden = false;
    this.isConnected = true;
    this.type = "button";
    this.dataset = {};
    this.listeners = new Map();
    this.save = save;
    this.classList = { add() {}, remove() {} };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  matches(selector) {
    return this.save && selector === "[data-transfer-save]";
  }

  closest(selector) {
    if (selector === "[data-transfer-save]") return this.save ? this : null;
    if (selector === ".patient-transfer-modal") return { dataset: { saving: "false" } };
    return null;
  }

  getAttribute() {
    return null;
  }

  getClientRects() {
    return [{}];
  }

  async click() {
    const event = { type: "click", target: this, currentTarget: this };
    for (const listener of this.listeners.get("click") || []) await listener(event);
  }
}

function createClickHarness(decision) {
  const saveButton = new FakeElement({ save: true });
  const input = new FakeElement();
  const dropzone = new FakeElement();
  const generic = new FakeElement();
  const root = new FakeElement();
  root.querySelector = (selector) => {
    if (selector === "[data-transfer-save]") return saveButton;
    if (selector === "#patientTransferInput") return input;
    if (selector === "[data-transfer-dropzone]") return dropzone;
    return generic;
  };

  let saveCalls = 0;
  const build = new Function(
    "root",
    "saveReviewedTransfer",
    "resetAndOpen",
    "setTransferSavingState",
    "setPatientTransferExecutionState",
    "setPatientTransferStatus",
    "setPatientTransferVisualStatus",
    "showPatientTransferError",
    "isTransferSaving",
    "TRANSFER_STATUS",
    `
      let initialized = false;
      let analyzedGroups = [{
        selectedResolution: ${JSON.stringify(decision)},
        selectedPatientId: ${decision === "associate_existing" ? '"existing-patient"' : '""'}
      }];
      const getPatientTransferRoot = () => root;
      ${handlerSource}
      ${initializeSource}
      return { initializePatientTransfer };
    `
  );

  const { initializePatientTransfer } = build(
    root,
    async () => { saveCalls += 1; },
    () => {},
    () => {},
    () => {},
    () => {},
    () => {},
    () => {},
    () => false,
    { FAILED: "failed", CANCELLED: "cancelled" }
  );

  initializePatientTransfer();
  return { saveButton, saveCalls: () => saveCalls };
}

for (const decision of ["associate_existing", "create_new"]) {
  const harness = createClickHarness(decision);
  assert.equal(
    harness.saveButton.listeners.get("click")?.length,
    1,
    `${decision}: el listener se registra una sola vez`
  );
  await harness.saveButton.click();
  assert.equal(
    harness.saveCalls(),
    1,
    `${decision}: un clic entra al handler y llama una vez a saveReviewedTransfer`
  );
}

{
  let domSaving = true;
  const calls = [];
  const buildReset = new Function(
    "resetPatientTransferState",
    "setTransferSavingState",
    "openPatientTransferView",
    "renderTransferFiles",
    "renderDetectedGroups",
    "setPatientTransferMessage",
    "setPatientTransferVisualStatus",
    "showPatientTransferError",
    "TRANSFER_STATUS",
    `
      let selectedFiles = ["stale-file"];
      let analyzedGroups = [{ id: "stale-group" }];
      ${resetSource}
      return {
        resetAndOpen,
        getSelectedFiles: () => selectedFiles,
        getAnalyzedGroups: () => analyzedGroups
      };
    `
  );
  const harness = buildReset(
    () => calls.push("state-reset"),
    (value) => { domSaving = value; calls.push(`saving:${value}`); },
    () => calls.push("open"),
    () => {},
    () => {},
    () => {},
    () => {},
    () => {},
    { CREATED: "created" }
  );

  harness.resetAndOpen();
  assert.equal(domSaving, false, "abrir una transferencia limpia el saving residual del DOM");
  assert.deepEqual(harness.getSelectedFiles(), []);
  assert.deepEqual(harness.getAnalyzedGroups(), []);
  assert.ok(
    calls.indexOf("saving:false") < calls.indexOf("open"),
    "el botón se restaura antes de volver a mostrar el modal"
  );
}

console.log("patient-transfer-confirm-reset.test.mjs OK");
