import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "js/modules/patient-transfer/patientTransferController.js"), "utf8");
const handlerStart = source.indexOf("async function handleConfirmTransferClick");
const handlerEnd = source.indexOf("function resetAndOpen", handlerStart);

assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "existe el handler nombrado de confirmacion");

const handlerSource = source.slice(handlerStart, handlerEnd);
const createHandler = ({
  saveReviewedTransfer,
  setTransferSavingState = () => {},
  setPatientTransferExecutionState = () => {},
  setPatientTransferStatus = () => {},
  setPatientTransferVisualStatus = () => {},
  showPatientTransferError = () => {},
  isTransferSaving = () => false,
  analyzedGroups = []
}) => new Function(
  "saveReviewedTransfer",
  "setTransferSavingState",
  "setPatientTransferExecutionState",
  "setPatientTransferStatus",
  "setPatientTransferVisualStatus",
  "showPatientTransferError",
  "isTransferSaving",
  "analyzedGroups",
  "TRANSFER_STATUS",
  `return (${handlerSource});`
)(
  saveReviewedTransfer,
  setTransferSavingState,
  setPatientTransferExecutionState,
  setPatientTransferStatus,
  setPatientTransferVisualStatus,
  showPatientTransferError,
  isTransferSaving,
  analyzedGroups,
  { FAILED: "failed" }
);

{
  const calls = [];
  const handler = createHandler({
    saveReviewedTransfer: async () => calls.push("save"),
    setTransferSavingState: () => calls.push("saving"),
    setPatientTransferExecutionState: () => calls.push("execution"),
    setPatientTransferStatus: () => calls.push("status"),
    setPatientTransferVisualStatus: () => calls.push("visual"),
    showPatientTransferError: () => calls.push("error")
  });

  await handler();
  assert.deepEqual(calls, ["save"], "el flujo exitoso no altera el estado desde el handler exterior");
}

{
  let saving = true;
  let buttonDisabled = true;
  let executionState = { isSaving: true };
  let status = "saving";
  let visualStatus = "saving";
  let visibleError = "";
  let attempts = 0;
  const handler = createHandler({
    saveReviewedTransfer: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("Fallo controlado"), { stage: "authentication" });
    },
    setTransferSavingState: (value) => {
      saving = value;
      buttonDisabled = value;
    },
    setPatientTransferExecutionState: (next) => {
      executionState = { ...executionState, ...next };
    },
    setPatientTransferStatus: (value) => { status = value; },
    setPatientTransferVisualStatus: (value) => { visualStatus = value; },
    showPatientTransferError: (message) => { visibleError = message; }
  });

  await handler();
  assert.equal(saving, false, "el error libera el estado visual de guardado");
  assert.equal(buttonDisabled, false, "el boton vuelve a quedar utilizable");
  assert.deepEqual(executionState, { isSaving: false, lastCompletedStage: "authentication" });
  assert.equal(status, "failed", "la maquina de estados queda en failed");
  assert.equal(visualStatus, "failed", "el estado visual queda en failed");
  assert.equal(visibleError, "Fallo controlado", "el error permanece visible");

  await handler();
  assert.equal(attempts, 2, "un segundo clic puede reintentar despues del error");
}

{
  let saving = true;
  let releaseCount = 0;
  let executionState = { isSaving: true };
  const setTransferSavingState = (value) => {
    saving = value;
    if (value === false) releaseCount += 1;
  };
  const setPatientTransferExecutionState = (next) => {
    executionState = { ...executionState, ...next };
  };
  const handler = createHandler({
    saveReviewedTransfer: async () => {
      setTransferSavingState(false);
      setPatientTransferExecutionState({ isSaving: false });
      throw new Error("Fallo despues de restauracion interna");
    },
    setTransferSavingState,
    setPatientTransferExecutionState
  });

  await handler();
  assert.equal(saving, false, "la restauracion exterior es idempotente");
  assert.equal(executionState.isSaving, false, "no reactiva el estado interno ya liberado");
  assert.equal(releaseCount, 2, "ambas redes de seguridad pueden liberar sin efectos incompatibles");
}

console.log("patient-transfer-confirm-handler.test.mjs OK");
