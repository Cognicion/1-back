import assert from "node:assert/strict";
import { detectMultipleClinicalNotes, expandSegmentedDocumentsForPersistence, segmentClinicalNotes } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { groupDocumentsByPatient } from "../js/modules/patient-transfer/parsing/documentGroupingService.js";
import { countTransferNotes } from "../js/modules/patient-transfer/ui/patientTransferView.js";
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
assert.deepEqual(segments.map((segment) => segment.startBlockIndex), detection.proposedNoteBoundaries.map((boundary) => boundary.blockIndex), "el primer título inicia la primera nota y los cuatro restantes crean divisiones");

const grouped = groupDocumentsByPatient([{
  id: "ana-document",
  fields: {
    nombre: { value: "ARELLANO FRANCO ANA LIZBETH" },
    expediente: { value: "ANA-LIZBETH" }
  },
  conflicts: [],
  noteSegments: segments
}]);
assert.equal(grouped.length, 1, "las cinco notas permanecen bajo un solo paciente");
assert.equal(grouped[0].documents[0].noteSegments.length, 5);
assert.equal(countTransferNotes(grouped), 5, "el resumen muestra cinco notas segmentadas");
const persistenceNotes = expandSegmentedDocumentsForPersistence(grouped[0].documents);
assert.equal(persistenceNotes.length, 5, "la persistencia recibe cinco notas independientes");
assert.equal(new Set(persistenceNotes.map((note) => note.id)).size, 5, "cada nota persistible conserva identidad propia");

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

});

console.log("patient-transfer-ana-lizbeth-structure.test.mjs OK");
