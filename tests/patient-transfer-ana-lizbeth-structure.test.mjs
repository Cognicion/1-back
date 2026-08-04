import assert from "node:assert/strict";
import { detectDiagnosisCandidates, detectTreatmentCandidates } from "../js/modules/patient-transfer/parsing/clinicalCandidateParser.js";
import { detectMultipleClinicalNotes, segmentClinicalNotes } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { extractVitalSignsCandidates } from "../js/modules/patient-transfer/parsing/vitalSignsParser.js";

let blockIndex = 0;
let tableIndex = 0;
const blocks = [];
const paragraph = (text) => blocks.push({ type: "paragraph", text, source: { blockIndex: blockIndex++ } });
const table = (rows) => blocks.push({ type: "table", rows, source: { blockIndex: blockIndex++, tableIndex: tableIndex++ } });

const diagnosticNames = [
  "Trastorno de Estrés Postraumático Complejo A DESCARTAR",
  "Trastorno Depresivo Recurrente, episodio actual grave sin síntomas psicóticos",
  "Episodio Depresivo Grave sin síntomas psicóticos SE DESCARTA",
  "Distimia",
  "Soporte familiar inadecuado",
  "Cónyuge o pareja, autor de maltrato y abandono"
];
const diagnosticCodes = ["F43.1", "F33.2", "F32.2", "F34.1", "Z63.2", "Y07.0"];

const noteDefinitions = [
  { title: "NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN", date: "31/07/2026", time: "21:00", vital: ["108/76", "36.4", "97", "20", "97", "", "72", "1.67", "25.81"], dx: 6, medications: ["Clonazepam tabletas 2 mg vía oral. 2 veces al día. Tomar ½ tableta a las 08:00h y 1 tableta a las 22:00h", "Duloxetina cápsulas 60 mg vía oral", "Plantago Psyllium polvo SUSPENDER", "Lactulosa 10 ml vía oral AUMENTA", "Mirtazapina tabletas 15 mg vía oral INICIA"] },
  { title: "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN", date: "01/08/2026", time: "11:00", vital: ["90/70", "36.4", "62", "18", "91", "", "72", "1.67", "25.81"], dx: 5, medications: ["Clonazepam tabletas 2 mg vía oral", "Duloxetina cápsulas 60 mg vía oral", "Plantago Psyllium polvo", "Lactulosa 10 ml vía oral"] },
  { title: "NOTA DE EVOLUCION AL SERVICIO DE OBSERVACIÓN", date: "01/08/2026", time: "19:50", vital: ["120/70", "36.5", "75", "20", "95", "", "72", "1.67", "25.81"], dx: 5, medications: ["Clonazepam tabletas 2 mg vía oral", "Duloxetina cápsulas 60 mg vía oral", "Plantago Psyllium polvo", "Lactulosa 10 ml vía oral"] },
  { title: "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN", date: "02/08/2026", time: "10:30", vital: ["100/60", "36", "62", "18", "96", "", "72", "1.67", "25.81"], dx: 5, medications: ["Clonazepam tabletas 2 mg vía oral", "Duloxetina cápsulas 60 mg vía oral CAMBIA PRESENTACIÓN", "Plantago Psyllium polvo SUSPENDER", "Lactulosa 10 ml vía oral AUMENTA", "Mirtazapina tabletas 15 mg vía oral INICIA"] },
  { title: "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN", date: "02/08/2026", time: "15:30", vital: ["130/80", "36", "89", "18", "96", "", "72", "1.67", "25.81"], dx: 4, medications: ["Clonazepam tabletas 2 mg vía oral", "Duloxetina cápsulas 60 mg vía oral", "Lactulosa 10 ml vía oral", "Mirtazapina tabletas 15 mg vía oral"] }
];

noteDefinitions.forEach((note, noteIndex) => {
  paragraph(note.title);
  paragraph(`Fecha: ${note.date} Hora: ${note.time} H`);
  table([["Presión arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2", "Glucemia capilar", "Peso", "Talla", "IMC"], note.vital]);
  paragraph("MOTIVO DE ATENCIÓN / ACTUALIZACIÓN DEL CUADRO CLÍNICO");
  paragraph(`Evolución exclusiva de la nota ${noteIndex + 1}.`);
  paragraph("EXPLORACIÓN FÍSICA Y NEUROLÓGICA");
  paragraph("EXPLORACIÓN FÍSICA: Cráneo normocéfalo. EXPLORACIÓN NEUROLÓGICA: Despierta y orientada.");
  paragraph("EXAMEN MENTAL: Atención conservada y pensamiento coherente.");
  table([["DIAGNÓSTICO", "CIE-10"], [diagnosticNames.slice(noteIndex === 4 ? 1 : note.dx === 5 ? 0 : 0, noteIndex === 4 ? 5 : note.dx).join("\n"), diagnosticCodes.slice(noteIndex === 4 ? 1 : 0, noteIndex === 4 ? 5 : note.dx).join("\n")]]);
  paragraph("PLAN TERAPÉUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLÓGICO)");
  paragraph("1.- Dieta. 2.- Cuidados generales. 6.-Medicamentos");
  note.medications.forEach((medication, index) => paragraph(`${String.fromCharCode(97 + index)}. ${medication}`));
  paragraph("COMENTARIO Y/O ANÁLISIS CLÍNICO Y FUNDAMENTACIÓN DIAGNÓSTICA Y TERAPÉUTICA");
  paragraph(`Análisis exclusivo de la nota ${noteIndex + 1}.`);
  paragraph("PRONÓSTICO: Reservado");
  paragraph("DESTINO: Observación");
});

const detection = detectMultipleClinicalNotes({ blocks });
assert.equal(detection.explicitNoteCount, 5);
assert.equal(detection.proposedNoteBoundaries.length, 5);

const segments = segmentClinicalNotes({ blocks, manualMultipleNotes: true, proposedBoundaries: detection.proposedNoteBoundaries, documentId: "ana" });
assert.equal(segments.length, 5, "separó las cinco notas por título explícito");
assert.deepEqual(segments.map((segment) => segment.date), noteDefinitions.map((note) => note.date));
assert.deepEqual(segments.map((segment) => segment.time), noteDefinitions.map((note) => note.time));

const allVitals = extractVitalSignsCandidates(blocks);
assert.equal(allVitals.length, 5);

segments.forEach((segment, index) => {
  const ownVitals = allVitals.filter((candidate) => candidate.sourceLocation.blockIndex >= segment.startBlockIndex && candidate.sourceLocation.blockIndex < segment.endBlockIndex);
  assert.equal(ownVitals.length, 1, `nota ${index + 1} conserva una sola medición`);
  assert.match(segment.sections.subjetivo, new RegExp(`nota ${index + 1}`));
  assert.doesNotMatch(segment.sections.subjetivo, /EXPLORACIÓN|DIAGNÓSTICO|PLAN TERAPÉUTICO/);
  assert.match(segment.sections.physicalNeurologicalExam, /Cráneo normocéfalo/);
  assert.doesNotMatch(segment.sections.physicalNeurologicalExam, /EXAMEN MENTAL/);
  assert.equal(segment.sections.examenMental, "Atención conservada y pensamiento coherente.");
  assert.equal(segment.sections.analisis, `Análisis exclusivo de la nota ${index + 1}.`);
  assert.doesNotMatch(segment.sections.plan, /Clonazepam|Duloxetina/);

  const diagnoses = detectDiagnosisCandidates({ sections: segment.sections, fullText: segment.rawText, sourceBlocks: segment.blocks, documentId: "ana", sourceNoteId: segment.id });
  const treatments = detectTreatmentCandidates({ sections: segment.sections, fullText: segment.rawText, sourceBlocks: segment.blocks, documentId: "ana", sourceNoteId: segment.id });
  assert.equal(diagnoses.filter((candidate) => candidate.detectionRule === "diagnosis-table-row").length, noteDefinitions[index].dx);
  assert.equal(treatments.length, noteDefinitions[index].medications.length, `nota ${index + 1}: ${treatments.map((item) => item.medicationName).join(", ")}`);
});

const firstDiagnoses = detectDiagnosisCandidates({ sections: segments[0].sections, fullText: segments[0].rawText, sourceBlocks: segments[0].blocks, sourceNoteId: segments[0].id });
assert.equal(firstDiagnoses.find((item) => item.code === "F43.1")?.statusSuggestion, "A descartar");
assert.equal(firstDiagnoses.find((item) => item.code === "F32.2")?.statusSuggestion, "Descartado");
const firstTreatments = detectTreatmentCandidates({ sections: segments[0].sections, fullText: segments[0].rawText, sourceBlocks: segments[0].blocks, sourceNoteId: segments[0].id });
assert.deepEqual(firstTreatments.find((item) => normalizeName(item.medicationName) === "clonazepam")?.scheduleDetails, [
  { time: "08:00", quantity: 0.5, unit: "tableta" },
  { time: "22:00", quantity: 1, unit: "tableta" }
]);

const fourthTreatments = detectTreatmentCandidates({ sections: segments[3].sections, fullText: segments[3].rawText, sourceBlocks: segments[3].blocks, sourceNoteId: segments[3].id });
assert.equal(fourthTreatments.find((item) => normalizeName(item.medicationName) === "plantago psyllium")?.statusSuggestion, "Suspende");
assert.equal(fourthTreatments.find((item) => normalizeName(item.medicationName) === "lactulosa")?.statusSuggestion, "Aumenta");
assert.equal(fourthTreatments.find((item) => normalizeName(item.medicationName) === "mirtazapina")?.statusSuggestion, "Inicia");

function normalizeName(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

console.log("patient-transfer-ana-lizbeth-structure.test.mjs OK");
