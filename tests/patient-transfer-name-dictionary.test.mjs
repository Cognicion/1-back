import assert from "node:assert/strict";
import {
  getGivenNamesDictionary,
  getSurnamesDictionary,
  registerPatientNameParts
} from "../js/modules/patient-transfer/parsing/patientNameDictionaries.js";
import {
  inferStructuredPatientNameFormat,
  PATIENT_NAME_SOURCE_FORMATS,
  suggestPatientNameParts
} from "../js/modules/patient-transfer/parsing/patientNameParser.js";

const stored = new Map();
globalThis.localStorage = {
  getItem(key) {
    return stored.get(key) ?? null;
  },
  setItem(key, value) {
    stored.set(key, String(value));
  }
};

registerPatientNameParts({
  nombres: "ZAFIRA LUZ",
  apellidoPaterno: "QUINDAL",
  apellidoMaterno: "TORVEK"
});

assert.equal(getGivenNamesDictionary().has("zafira"), true);
assert.equal(getSurnamesDictionary().has("quindal"), true);

const evidence = {
  detectionMethod: "table-multi-label",
  sourceLabel: "paciente"
};
const sourceFormat = inferStructuredPatientNameFormat("ZAFIRA LUZ QUINDAL TORVEK", evidence);
assert.equal(sourceFormat, PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);

const parts = suggestPatientNameParts("ZAFIRA LUZ QUINDAL TORVEK", { sourceFormat });
assert.deepEqual({
  nombres: parts.nombres,
  apellidoPaterno: parts.apellidoPaterno,
  apellidoMaterno: parts.apellidoMaterno
}, {
  nombres: "ZAFIRA LUZ",
  apellidoPaterno: "QUINDAL",
  apellidoMaterno: "TORVEK"
});

delete globalThis.localStorage;
console.log("patient-transfer-name-dictionary.test.mjs OK");
