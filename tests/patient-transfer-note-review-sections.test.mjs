import assert from "node:assert/strict";
import {
  detectMultipleClinicalNotes,
  segmentClinicalNotes
} from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js?v=20260814-note-sections-runtime-v1";

function noteBlocks({ start, date, time, suffix }) {
  return [
    {
      type: "table",
      rows: [["Institución de prueba", "NOTA DE EVOLUCIÓN"]],
      source: { blockIndex: start }
    },
    { type: "paragraph", text: `Fecha: ${date} Hora: ${time}`, source: { blockIndex: start + 1 } },
    { type: "paragraph", text: "MOTIVO DE ATENCIÓN / ACTUALIZACIÓN DEL CUADRO CLÍNICO", source: { blockIndex: start + 2 } },
    { type: "paragraph", text: `Evolución clínica ficticia ${suffix}.`, source: { blockIndex: start + 3 } },
    { type: "paragraph", text: "EXPLORACIÓN FÍSICA Y NEUROLÓGICA", source: { blockIndex: start + 4 } },
    { type: "paragraph", text: `Exploración ficticia ${suffix}.`, source: { blockIndex: start + 5 } },
    { type: "paragraph", text: "EXAMEN MENTAL", source: { blockIndex: start + 6 } },
    { type: "paragraph", text: `Examen mental ficticio ${suffix}.`, source: { blockIndex: start + 7 } },
    { type: "paragraph", text: "ANÁLISIS / COMENTARIO", source: { blockIndex: start + 8 } },
    { type: "paragraph", text: `Análisis clínico ficticio ${suffix}.`, source: { blockIndex: start + 9 } },
    { type: "paragraph", text: "DIAGNÓSTICOS", source: { blockIndex: start + 10 } },
    { type: "paragraph", text: `Diagnóstico ficticio ${suffix}.`, source: { blockIndex: start + 11 } },
    { type: "paragraph", text: "PLAN TERAPÉUTICO", source: { blockIndex: start + 12 } },
    { type: "paragraph", text: `Plan clínico ficticio ${suffix}.`, source: { blockIndex: start + 13 } }
  ];
}

const blocks = [
  ...noteBlocks({ start: 0, date: "01/08/2026", time: "09:00", suffix: "uno" }),
  ...noteBlocks({ start: 14, date: "02/08/2026", time: "10:30", suffix: "dos" })
];

const detection = detectMultipleClinicalNotes({ blocks });
const segments = segmentClinicalNotes({
  blocks,
  multipleNotesMode: "auto",
  proposedBoundaries: detection.proposedNoteBoundaries,
  documentId: "documento-ficticio"
});

assert.equal(segments.length, 2, "cada encabezado de nota conserva su propio segmento");

for (const [index, segment] of segments.entries()) {
  const suffix = index === 0 ? "uno" : "dos";
  assert.match(segment.sections.subjetivo, new RegExp(`Evolución clínica ficticia ${suffix}`));
  assert.match(segment.sections.physicalNeurologicalExam, new RegExp(`Exploración ficticia ${suffix}`));
  assert.match(segment.sections.examenMental, new RegExp(`Examen mental ficticio ${suffix}`));
  assert.match(segment.sections.analisis, new RegExp(`Análisis clínico ficticio ${suffix}`));
  assert.match(segment.sections.diagnosticos, new RegExp(`Diagnóstico ficticio ${suffix}`));
  assert.match(segment.sections.plan, new RegExp(`Plan clínico ficticio ${suffix}`));
}

console.log("patient-transfer-note-review-sections.test.mjs OK");
