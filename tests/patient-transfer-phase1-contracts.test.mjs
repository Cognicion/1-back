import assert from "node:assert/strict";
import { findFirstBoundary, findSectionStart, extractBoundedSection } from "../js/modules/patient-transfer/parsing/clinicalBoundaryEngine.js";
import { assertClinicalParserResult, assertIndependentNoteSegments } from "../js/modules/patient-transfer/clinicalImportContracts.js";
import { adaptClinicalParserResult, buildClinicalEvidence } from "../js/modules/patient-transfer/clinicalImportEvidence.js";

const aliases = ["Exploración física", "Examen mental", "Plan terapéutico"];
const inline = findFirstBoundary("Relato clínico. EXAMEN MENTAL: Alerta.", aliases);
assert.equal(inline.alias, "Examen mental");
assert.equal("Relato clínico. EXAMEN MENTAL: Alerta.".slice(0, inline.start), "Relato clínico. ");

const heading = findSectionStart("EXAMEN MENTAL: Alerta y orientada.", ["Examen mental"]);
assert.equal(heading.inlineContent, "Alerta y orientada.");

const bounded = extractBoundedSection({
  text: "EXAMEN MENTAL: Alerta. RESULTADOS DE LOS ESTUDIOS: EKG.",
  startAliases: ["Examen mental"],
  boundaryAliases: ["Resultados de los estudios"]
});
assert.equal(bounded.value, "Alerta.");
assert.equal(bounded.boundary.alias, "Resultados de los estudios");

const result = adaptClinicalParserResult({ value: "Alerta.", sourceBlocks: [{ blockIndex: 3 }], sourceSection: "examenMental", evidence: buildClinicalEvidence({ documentId: "anon", noteId: "n1", blockIndex: 3, rawEvidence: "Alerta." }), confidence: "high", parserName: "mentalExam" });
assertClinicalParserResult(result);
assertIndependentNoteSegments([{ id: "n1", blocks: [], sections: {} }, { id: "n2", blocks: [], sections: {} }]);

console.log("patient-transfer-phase1-contracts: ok");
