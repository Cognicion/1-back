import assert from "node:assert/strict";
import { parseClinicalSections } from "../js/modules/patient-transfer/parsing/clinicalSectionParser.js";

const result = parseClinicalSections([
  { type: "paragraph", text: "MOTIVO DE ATENCIÓN / ACTUALIZACIÓN DEL CUADRO CLÍNICO", source: { blockIndex: 0 } },
  { type: "paragraph", text: "Paciente refiere mejoría parcial.", source: { blockIndex: 1 } },
  { type: "paragraph", text: "OBJETIVO / EXPLORACIÓN FÍSICA", source: { blockIndex: 2 } },
  { type: "paragraph", text: "Sin datos de dificultad respiratoria.", source: { blockIndex: 3 } },
  { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: 4 } },
  { type: "paragraph", text: "Orientada en las tres esferas.", source: { blockIndex: 5 } },
  { type: "paragraph", text: "DIAGNÓSTICOS", source: { blockIndex: 6 } },
  { type: "paragraph", text: "F32.2 Episodio depresivo grave.", source: { blockIndex: 7 } }
]);

assert.equal(result.secciones.subjetivo, "Paciente refiere mejoría parcial.");
assert.equal(result.secciones.objetivo, "Sin datos de dificultad respiratoria.");
assert.equal(result.secciones.examenMental, "Orientada en las tres esferas.");
assert.equal(result.secciones.analisis, "", "no inventa análisis si no hay encabezado");
assert.equal(result.secciones.diagnosticos, "F32.2 Episodio depresivo grave.");
assert.deepEqual(result.encontradas, ["subjetivo", "objetivo", "examenMental", "diagnosticos"]);

console.log("patient-transfer-clinical-sections.test.mjs OK");
