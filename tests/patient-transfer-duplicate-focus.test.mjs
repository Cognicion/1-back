import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "js/modules/patient-transfer/patientTransferController.js"), "utf8");
const focusStart = source.indexOf("    const unresolvedGroup = reviewedGroups.find");
const focusEnd = source.indexOf("\n    return;", focusStart);

assert.ok(focusStart >= 0 && focusEnd > focusStart, "existe el enfoque de la primera resolucion pendiente");

const focusSource = source.slice(focusStart, focusEnd);
const runFocus = new Function(
  "reviewedGroups",
  "persistenceEligibilityForDocument",
  "DUPLICATE_RESOLUTION",
  "getPatientTransferRoot",
  focusSource
);

{
  const groups = [
    { id: "group-resolved", action: "create", documents: [{ duplicateResolution: "create_new" }] },
    { id: "group-pending", action: "unresolved", documents: [{ duplicateResolution: "unresolved" }] },
    { id: "group-pending-later", action: "unresolved", documents: [{ duplicateResolution: "unresolved" }] }
  ];
  const originalGroups = structuredClone(groups);
  const selectors = [];
  const scrollCalls = [];
  const focusCalls = [];
  const control = {
    scrollIntoView: (options) => scrollCalls.push(options),
    focus: (options) => focusCalls.push(options)
  };

  runFocus(
    groups,
    (_group, document) => ({ resolution: document.duplicateResolution }),
    { UNRESOLVED: "unresolved" },
    () => ({
      querySelector: (selector) => {
        selectors.push(selector);
        return control;
      }
    })
  );

  assert.deepEqual(selectors, ['[data-transfer-duplicate-resolution="group-pending"]'], "localiza el control del primer grupo pendiente");
  assert.deepEqual(scrollCalls, [{ behavior: "smooth", block: "center" }], "desplaza suavemente el control al centro");
  assert.deepEqual(focusCalls, [{ preventScroll: true }], "enfoca el control sin repetir el desplazamiento");
  assert.deepEqual(groups, originalGroups, "el enfoque no modifica duplicateResolution ni action");
}

{
  const groups = [
    { id: "group-resolved", action: "create", documents: [{ duplicateResolution: "create_new" }] }
  ];
  let queried = false;

  runFocus(
    groups,
    (_group, document) => ({ resolution: document.duplicateResolution }),
    { UNRESOLVED: "unresolved" },
    () => ({
      querySelector: () => {
        queried = true;
        return null;
      }
    })
  );

  assert.equal(queried, false, "sin unresolved no busca, desplaza ni enfoca controles");
}

console.log("patient-transfer-duplicate-focus.test.mjs OK");
