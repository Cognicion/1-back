import assert from "node:assert/strict";
import {
  detectDiagnosisCandidates,
  parseDiagnosisBlock,
  splitDiagnosticCodes
} from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

assert.deepEqual(splitDiagnosticCodes("F43.1F33.2F34.1"), ["F43.1", "F33.2", "F34.1"]);

const tableCandidates = detectDiagnosisCandidates({
  documentId: "maria",
  sections: { diagnosticos: "" },
  sourceBlocks: [{
    type: "table",
    rows: [
      ["Diagnóstico", "CIE-10"],
      ["Trastorno depresivo recurrente, episodio actual grave", "F33.2"],
      ["Alcohol: síndrome de dependencia", "F10.2"],
      ["Obesidad", "E66.9"]
    ],
    source: { tableIndex: 2, blockIndex: 12 }
  }]
});
assert.equal(tableCandidates.length, 3);
assert.equal(tableCandidates[0].diagnosisName, "Trastorno depresivo recurrente, episodio actual grave");
assert.equal(tableCandidates[0].code, "F33.2");
assert.equal(tableCandidates[0].system, "CIE-10");
assert.equal(tableCandidates[1].diagnosisName, "Alcohol: síndrome de dependencia");
assert.equal(tableCandidates[1].code, "F10.2");
assert.notEqual(tableCandidates[1].code, "F33.2");

const columnCandidates = parseDiagnosisBlock({
  text: "Trastorno depresivo\nDistimia\nF33.2\nF34.1",
  explicit: true,
  documentId: "columns"
});
assert.equal(columnCandidates.length, 2);
assert.equal(columnCandidates[0].code, "F33.2");
assert.equal(columnCandidates[1].code, "F34.1");

const unpaired = parseDiagnosisBlock({ text: "Trastorno depresivo | F33.2 | F34.1", explicit: true, documentId: "unsafe" });
assert.equal(unpaired.length, 1);
assert.equal(unpaired[0].code, null);
assert.equal(unpaired[0].requiresReview, true);

console.log("patient-transfer-diagnosis-parser: ok");
