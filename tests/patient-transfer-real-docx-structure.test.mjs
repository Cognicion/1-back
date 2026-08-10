import assert from "node:assert/strict";
import { normalizeDocxBlocks } from "../js/modules/patient-transfer/docx/docxBlockNormalizer.js";
import { detectMultipleClinicalNotes, segmentClinicalNotes } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { parseClinicalSections } from "../js/modules/patient-transfer/parsing/clinicalSectionParser.js";
import { REAL_ANALYSIS_ORDER_FIXTURE } from "./fixtures/patient-transfer-real-analysis-order.fixture.mjs";

const blocks = normalizeDocxBlocks(REAL_ANALYSIS_ORDER_FIXTURE);
const detection = detectMultipleClinicalNotes({ blocks });
const segments = segmentClinicalNotes({
  blocks,
  multipleNotesMode: "auto",
  proposedBoundaries: detection.proposedNoteBoundaries,
  documentId: "sanitized-real-structure"
});

assert.equal(segments.length, 4, "la estructura derivada conserva cuatro notas");
const summaries = segments.map((segment) => {
  const parsed = parseClinicalSections(segment.blocks);
  const analysisHeading = parsed.encabezados.find((heading) => heading.key === "analisis");
  return {
    hasMentalExam: Boolean(segment.sections.examenMental),
    hasDiagnoses: Boolean(segment.sections.diagnosticos),
    hasPlan: Boolean(segment.sections.plan),
    hasAnalysis: Boolean(segment.sections.analisis),
    analysisMethod: analysisHeading?.detectionMethod || "",
    analysis: segment.sections.analisis
  };
});

assert.deepEqual(summaries.map((item) => item.hasAnalysis), [true, true, true, true]);
assert.equal(summaries[0].hasDiagnoses, true);
assert.equal(summaries[0].hasPlan, true);
assert.equal(summaries[0].analysisMethod, "semantic-heading");
assert.equal(summaries[1].analysisMethod, "semantic-heading");
assert.equal(summaries[1].analysis.includes("página siguiente"), true);
assert.doesNotMatch(summaries[0].analysis, /Reservado/);
assert.doesNotMatch(summaries[1].analysis, /Reservado/);

const pageIndexes = new Set(segments[1].blocks.map((block) => block.source?.pageIndex).filter(Number.isInteger));
assert.deepEqual([...pageIndexes].sort(), [0, 1], "el page break no divide la nota");

console.log("patient-transfer-real-docx-structure.test.mjs OK", JSON.stringify({
  segmentCount: segments.length,
  analysisDetectedCount: summaries.filter((item) => item.hasAnalysis).length
}));
