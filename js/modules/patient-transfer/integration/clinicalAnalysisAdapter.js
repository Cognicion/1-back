import { analizarTextoClinico } from "../../../core/clinical-analysis-engine/index.js";

export function analyzeDocumentClinically(document) {
  return analizarTextoClinico(document.fullText || "", {
    sourceBlocks: document.blocks || [],
    detectPatterns: true,
    detectEvents: true,
    detectNegations: true,
    detectTemporality: true,
    debug: true
  });
}
