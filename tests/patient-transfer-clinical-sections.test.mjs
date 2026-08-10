import assert from "node:assert/strict";
import {
  isLikelySectionHeading,
  normalizeClinicalHeading,
  parseClinicalSections
} from "../js/modules/patient-transfer/parsing/clinicalSectionParser.js";

assert.equal(normalizeClinicalHeading("  7. ANÁLISIS:  "), "analisis");
assert.equal(normalizeClinicalHeading("VIII.- COMENTARIO"), "comentario");
assert.equal(normalizeClinicalHeading("3) VALORACIÓN"), "valoracion");
assert.equal(normalizeClinicalHeading("ANALISIS-COMENTARIO"), "analisis comentario");
assert.equal(isLikelySectionHeading("ANÁLISIS:"), true);
assert.equal(isLikelySectionHeading("se solicitaron análisis de laboratorio"), false);

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

const analysisCase = parseClinicalSections([
  { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: 30 } },
  { type: "paragraph", text: "Alerta, orientada y colaboradora.", source: { blockIndex: 31 } },
  { type: "paragraph", text: "ANÁLISIS / COMENTARIO", source: { blockIndex: 32 } },
  { type: "paragraph", text: "Evolución compatible con mejoría clínica parcial.", source: { blockIndex: 33 } },
  { type: "paragraph", text: "DIAGNÓSTICOS", source: { blockIndex: 34 } },
  { type: "paragraph", text: "Esquizofrenia F20", source: { blockIndex: 35 } }
]);
assert.equal(analysisCase.secciones.examenMental, "Alerta, orientada y colaboradora.");
assert.equal(analysisCase.secciones.analisis, "Evolución compatible con mejoría clínica parcial.");
assert.equal(analysisCase.secciones.diagnosticos, "Esquizofrenia F20");

for (const heading of [
  "ANÁLISIS / COMENTARIO",
  "COMENTARIO",
  "VALORACIÓN CLÍNICA",
  "JUICIO CLÍNICO",
  "IMPRESIÓN CLÍNICA",
  "RAZONAMIENTO CLÍNICO",
  "7. ANÁLISIS",
  "VIII.- COMENTARIO",
  "3) VALORACIÓN",
  "ANALISIS-COMENTARIO",
  "FUNDAMENTO:",
  "ANÁLISIS.-"
]) {
  const variant = parseClinicalSections([
    { type: "paragraph", text: heading, source: { blockIndex: 40 } },
    { type: "paragraph", text: "Contenido analítico de la nota.", source: { blockIndex: 41 } },
    { type: "paragraph", text: "PLAN", source: { blockIndex: 42 } },
    { type: "paragraph", text: "Continuar vigilancia.", source: { blockIndex: 43 } }
  ]);
  assert.equal(variant.secciones.analisis, "Contenido analítico de la nota.", heading);
  assert.equal(variant.secciones.plan, "Continuar vigilancia.", heading);
}

const narrativeAnalysis = parseClinicalSections([
  { type: "paragraph", text: "Paciente refiere análisis de laboratorio pendiente.", source: { blockIndex: 50 } }
]);
assert.equal(narrativeAnalysis.secciones.analisis, "");

const inferredAnalysis = parseClinicalSections([
  { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: 60 } },
  { type: "paragraph", text: "Alerta y orientada.", source: { blockIndex: 61 } },
  { type: "paragraph", text: "Por lo anterior, se concluye cuadro compatible con mejoría.", source: { blockIndex: 62 } },
  { type: "paragraph", text: "DIAGNÓSTICOS", source: { blockIndex: 63 } },
  { type: "paragraph", text: "Fxx.x Diagnóstico de prueba.", source: { blockIndex: 64 } }
]);
assert.equal(inferredAnalysis.secciones.examenMental, "Alerta y orientada.");
assert.equal(inferredAnalysis.secciones.analisis, "Por lo anterior, se concluye cuadro compatible con mejoría.");
assert.equal(inferredAnalysis.secciones.diagnosticos, "Fxx.x Diagnóstico de prueba.");
assert.equal(inferredAnalysis.inferencias[0]?.detectionMethod, "contextual-inference");

const variableOrder = parseClinicalSections([
  { type: "paragraph", text: "PLAN", source: { blockIndex: 70 } },
  { type: "paragraph", text: "Continuar vigilancia.", source: { blockIndex: 71 } },
  { type: "paragraph", text: "JUICIO CLÍNICO", source: { blockIndex: 72 } },
  { type: "paragraph", text: "Evolución favorable.", source: { blockIndex: 73 } },
  { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: 74 } },
  { type: "paragraph", text: "Alerta y cooperadora.", source: { blockIndex: 75 } }
]);
assert.equal(variableOrder.secciones.plan, "Continuar vigilancia.");
assert.equal(variableOrder.secciones.analisis, "Evolución favorable.");
assert.equal(variableOrder.secciones.examenMental, "Alerta y cooperadora.");

const mentalInlineBoundary = parseClinicalSections([
  { type: "paragraph", text: "EXAMEN MENTAL: Moderada advertencia del padecimiento. Proyección a futuro no estructurada. RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNÓSTICO EKG... DIAGNÓSTICOS DE ACUERDO A CIE-10... PLAN TERAPÉUTICO", source: { blockIndex: 10 } }
], { noteSegment: { id: "mental-inline" } });
assert.equal(
  mentalInlineBoundary.secciones.examenMental,
  "Moderada advertencia del padecimiento. Proyección a futuro no estructurada."
);
assert.doesNotMatch(mentalInlineBoundary.secciones.examenMental, /RESULTADOS|EKG|DIAGNÓSTICOS|PLAN TERAPÉUTICO/);

const mentalBlockBoundary = parseClinicalSections([
  { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: 20 } },
  { type: "paragraph", text: "Moderada advertencia del padecimiento. Proyección a futuro no estructurada.", source: { blockIndex: 21 } },
  { type: "paragraph", text: "RESULTADOS RELEVANTES DE LOS ESTUDIOS", source: { blockIndex: 22 } },
  { type: "paragraph", text: "EKG...", source: { blockIndex: 23 } }
], { noteSegment: { id: "mental-block" } });
assert.equal(
  mentalBlockBoundary.secciones.examenMental,
  "Moderada advertencia del padecimiento. Proyección a futuro no estructurada."
);
assert.doesNotMatch(mentalBlockBoundary.secciones.examenMental, /RESULTADOS|EKG/);

console.log("patient-transfer-clinical-sections.test.mjs OK");
