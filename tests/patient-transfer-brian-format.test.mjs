import assert from "node:assert/strict";
import { detectMultipleClinicalNotes, segmentClinicalNotes } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { extractClinicalCandidates } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";

let blockIndex = 0;
const blocks = [];
const paragraph = (text) => blocks.push({ type: "paragraph", text, source: { blockIndex: blockIndex++ } });
const table = (rows) => blocks.push({ type: "table", rows, source: { blockIndex: blockIndex++, tableIndex: blocks.length } });

paragraph("NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN");
paragraph("Nombre del paciente: PACIENTE ANONIMIZADO Fecha de nacimiento: 28/06/2001 Expediente: 179517");
paragraph("Fecha: 04/08/2026 Hora: 21:45 H");
table([["Presión arterial", "Temperatura"], ["110/90 mmHg", "36.4 C"]]);
paragraph("MOTIVO DE ATENCIÓN / ACTUALIZACIÓN DEL CUADRO CLÍNICO");
table([["MOTIIVO DE INGRESO: RIESGO SUICIDA\nSe trata de paciente de 25 años con riesgo suicida y se continúa en contención mecánica."]]);
paragraph("EXPLORACIÓN FÍSICA Y NEUROLÓGICA");
table([["EXPLORACIÓN FÍSICA: Heridas en cuello y antebrazo.\nEXAMEN NEUROLOGICO: Despierto y orientado."]]);
paragraph("EXAMEN MENTAL");
paragraph("Hombre con pensamiento organizado.");
paragraph("RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNÓSTICO");
paragraph("Electrocardiograma 04/08/26 FC 91 lpm QT 352.");
paragraph("DIAGNÓSTICOS DE ACUERDO A CIE-10 (PRIMARIO Y COMORBILIDADES)");
table([
  ["DIAGNÓSTICO", "CIE-10"],
  ["Discapacidad intelectual leve", "F70.1"],
  ["Episodio depresivo grave", "F32.1"],
  ["Intoxicación aguda a alcohol", "F10.0"],
  ["Lesión autoinfligida por objeto cortante", "X78, S517 + S117"],
  ["Historia personal de autolesiones", "Z91.5"],
  ["Historia personal de incumplimiento", "Z91.1"],
  ["Soporte familiar inadecuado", "Z63.2"]
]);
paragraph("PLAN TERAPÉUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLÓGICO)");
paragraph("Dieta normal. Vigilancia estrecha por riesgo suicida.");
paragraph("MEDICAMENTOS");
paragraph("Olanzapina 10 mg tabletas. Tomar vía oral 1 vez al día. 1 tableta a las 22:00.");
paragraph("Sertralina 50 mg tabletas. Tomar vía oral 1 vez al día. 1 tableta a las 08:00.");
paragraph("Paracetamol 500 mg tabletas. Vía oral 3 veces al día. 1 tableta a las 08:00, 15:00 y 22:00.");
paragraph("COMENTARIO Y/O ANÁLISIS CLÍNICO Y FUNDAMENTACIÓN DIAGNÓSTICA Y TERAPÉUTICA");
paragraph("Análisis clínico exclusivo.");
paragraph("PRONÓSTICO: Reservado para la vida y la función.");
paragraph("DESTINO: INGRESA AL SERVICIO DE OBSERVACIÓN");

const detection = detectMultipleClinicalNotes({ blocks });
assert.equal(detection.proposedNoteBoundaries.length, 1);
const [segment] = segmentClinicalNotes({ blocks, documentId: "brian", multipleNotesMode: "auto", proposedBoundaries: detection.proposedNoteBoundaries });
assert.equal(segment.date, "04/08/2026");
assert.equal(segment.time, "21:45");
assert.match(segment.sections.subjetivo, /Se trata de paciente/);
assert.doesNotMatch(segment.sections.subjetivo, /EXPLORACIÓN FÍSICA/);
assert.match(segment.sections.physicalNeurologicalExam, /Despierto y orientado/);
assert.match(segment.sections.resultadosEstudios, /Electrocardiograma/);
assert.match(segment.sections.examenMental, /pensamiento organizado/);
assert.match(segment.sections.analisis, /Análisis clínico exclusivo/);
assert.match(segment.sections.pronostico, /Reservado/);
assert.match(segment.sections.destino, /INGRESA AL SERVICIO/);

const candidates = extractClinicalCandidates({
  id: "brian",
  sourceNoteId: segment.id,
  sections: segment.sections,
  blocks: segment.blocks,
  fullText: segment.rawText,
  date: segment.date
});
assert.equal(candidates.diagnoses.length, 7);
assert.deepEqual(candidates.diagnoses[3].codes, ["X78", "S517", "S117"]);
assert.equal(candidates.diagnoses[4].code, "Z91.5");
assert.deepEqual(candidates.treatments.map((candidate) => candidate.medicationName), ["Olanzapina", "Sertralina", "Paracetamol"]);

console.log("patient-transfer-brian-format.test.mjs OK");
