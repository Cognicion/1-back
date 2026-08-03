import { extraerSeccionesClinicas, SECTION_RULES } from "../../importacionDocx/clinicalSectionParser.js";

function toLegacyBlocks(blocks = []) {
  return blocks.map((block) => block.type === "table"
    ? { tipo: "table", filas: block.rows, origen: block.source?.origin || "body" }
    : { tipo: "paragraph", texto: block.text, origen: block.source?.origin || "body" });
}

export function parseClinicalSections(blocks = []) {
  return extraerSeccionesClinicas(toLegacyBlocks(blocks));
}

export { SECTION_RULES };
