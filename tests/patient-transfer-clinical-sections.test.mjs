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
assert.equal(result.secciones.physicalNeurologicalExam, "Sin datos de dificultad respiratoria.");
assert.equal(result.secciones.examenMental, "Orientada en las tres esferas.");
assert.equal(result.secciones.analisis, "", "no inventa análisis si no hay encabezado");
assert.equal(result.secciones.diagnosticos, "F32.2 Episodio depresivo grave.");
assert.deepEqual(result.encontradas, ["subjetivo", "physicalNeurologicalExam", "examenMental", "diagnosticos"]);

const inline = parseClinicalSections([
  { type: "paragraph", text: "MOTIVO DE LA ATENCIÓN: Riesgo suicida. Refiere tristeza.", source: { blockIndex: 0 } },
  { type: "paragraph", text: "EXPLORACIÓN FÍSICA: Cráneo normocéfalo.", source: { blockIndex: 1 } },
  { type: "paragraph", text: "EXAMEN MENTAL: Alerta y orientada.", source: { blockIndex: 2 } },
  { type: "paragraph", text: "FUNDAMENTO DE DIAGNÓSTICO Y TRATAMIENTO: Cuadro compatible con depresión.", source: { blockIndex: 3 } },
  { type: "paragraph", text: "INDICACIONES: Continuar vigilancia y tratamiento.", source: { blockIndex: 4 } },
  { type: "paragraph", text: "MEDICAMENTOS: Sertralina 50 mg cada 24 horas.", source: { blockIndex: 5 } }
]);

assert.match(inline.secciones.subjetivo, /Riesgo suicida/);
assert.doesNotMatch(inline.secciones.subjetivo, /Cráneo normocéfalo/, "Subjetivo termina en el siguiente encabezado");
assert.equal(inline.secciones.physicalNeurologicalExam, "Cráneo normocéfalo.");
assert.equal(inline.secciones.examenMental, "Alerta y orientada.");
assert.match(inline.secciones.analisis, /Cuadro compatible/);
assert.match(inline.secciones.plan, /Continuar vigilancia/);
assert.match(inline.secciones.medicamentos, /Sertralina 50 mg/);

console.log("patient-transfer-clinical-sections.test.mjs OK");
