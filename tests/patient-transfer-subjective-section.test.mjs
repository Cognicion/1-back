import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSubjectiveSection } from "../js/modules/patient-transfer/parsing/subjectiveSectionParser.js";
import { assertSubjectiveIsolation } from "../js/modules/patient-transfer/parsing/subjectiveSectionParser.js";
import { detectMultipleClinicalNotes, segmentClinicalNotes } from "../js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js";
import { assignParsedSubjective, preserveManualSubjectiveEdits, updateSubjectiveSegmentValue } from "../js/modules/patient-transfer/state/subjectiveSegmentState.js";

const paragraph = (text, blockIndex) => ({ type: "paragraph", text, rawRuns: [text], source: { blockIndex } });
const table = (rows, blockIndex) => ({ type: "table", rows, source: { blockIndex, tableIndex: blockIndex } });

const isolated = parseSubjectiveSection({ noteSegment: { id: "isolated", blocks: [
  paragraph("SUBJETIVO", 0),
  paragraph("Paciente refiere mejoría.", 1),
  paragraph("EXPLORACIÓN FÍSICA", 2),
  paragraph("Sin hallazgos.", 3)
] } });
assert.equal(isolated.text, "Paciente refiere mejoría.", "reconoce encabezado aislado");
assert.equal(isolated.nextHeading, "EXPLORACIÓN FÍSICA");

const inline = parseSubjectiveSection({ noteSegment: { id: "inline", blocks: [
  paragraph("MOTIVO DE LA ATENCIÓN: Riesgo suicida. Refiere tristeza.", 10),
  paragraph("EXAMEN MENTAL: Alerta.", 11)
] } });
assert.equal(inline.text, "Riesgo suicida. Refiere tristeza.", "separa encabezado y contenido en la misma línea");
assert.equal(inline.endBlockIndex, 11, "termina antes de Examen mental");

const joinedRuns = ["MOTIVO DE ATENCIÓN / ", "ACTUALIZACIÓN DEL CUADRO CLÍNICO", ":Se trata de la paciente."].join("");
const splitRuns = parseSubjectiveSection({ noteSegment: { id: "runs", blocks: [
  { ...paragraph(joinedRuns, 20), rawRuns: ["MOTIVO DE ATENCIÓN / ", "ACTUALIZACIÓN DEL CUADRO CLÍNICO", ":Se trata de la paciente."] },
  paragraph("EXPLORACIÓN NEUROLÓGICA", 21)
] } });
assert.equal(splitRuns.text, "Se trata de la paciente.", "reconoce runs unidos y texto sin espacio tras dos puntos");

const fallback = parseSubjectiveSection({ noteSegment: { id: "fallback", blocks: [
  paragraph("NOTA DE EVOLUCIÓN", 30),
  paragraph("Fecha: 02/08/2026 Hora: 10:30", 31),
  table([
    ["Presión arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2"],
    ["100/60", "36", "62", "18", "96%"]
  ], 32),
  paragraph("Se trata de la paciente en valoración matutina.", 33),
  paragraph("Niega otra sintomatología.", 34),
  paragraph("EXPLORACIÓN FÍSICA Y NEUROLÓGICA", 35)
] } });
assert.equal(fallback.detectionMethod, "between-vitals-and-physical-exam");
assert.equal(fallback.text, "Se trata de la paciente en valoración matutina.\nNiega otra sintomatología.");
assert.doesNotMatch(fallback.text, /Fecha|Presión arterial|100\/60/, "excluye datos administrativos y signos vitales");

const noFallback = parseSubjectiveSection({ noteSegment: {
  id: "empty",
  rawText: "EL TEXTO COMPLETO NO DEBE COPIARSE",
  blocks: [paragraph("NOTA CLÍNICA SIN SECCIÓN", 40)]
} });
assert.equal(noFallback.text, "", "rawText no se utiliza como fallback");

const newNoteBoundary = parseSubjectiveSection({ noteSegment: { id: "new-note-boundary", blocks: [
  paragraph("EVOLUCIÓN: Primera valoración.", 50),
  paragraph("NOTA DE EVOLUCIÓN", 51),
  paragraph("EVOLUCIÓN: Segunda valoración.", 52)
] } });
assert.equal(newNoteBoundary.text, "Primera valoración.", "una nueva nota cierra el Subjetivo actual");

const fiveNoteBlocks = [];
const noteTimes = ["21:00", "11:00", "19:50", "10:30", "15:30"];
noteTimes.forEach((time, index) => {
  const base = index * 5;
  fiveNoteBlocks.push(
    paragraph(index ? "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN" : "NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN", base),
    paragraph(`Fecha: ${index < 1 ? "31/07/2026" : index < 3 ? "01/08/2026" : "02/08/2026"} Hora: ${time}`, base + 1),
    paragraph(`MOTIVO DE ATENCIÓN: Subjetivo exclusivo ${index + 1}.`, base + 2),
    paragraph("EXPLORACIÓN FÍSICA Y NEUROLÓGICA", base + 3),
    paragraph(`Exploración exclusiva ${index + 1}.`, base + 4)
  );
});
const detection = detectMultipleClinicalNotes({ blocks: fiveNoteBlocks });
const segments = segmentClinicalNotes({
  blocks: fiveNoteBlocks,
  manualMultipleNotes: true,
  proposedBoundaries: detection.proposedNoteBoundaries,
  documentId: "five"
});
assert.equal(segments.length, 5, "genera cinco segmentos");
assert.deepEqual(segments.map((segment) => segment.time), noteTimes, "no fusiona horas del mismo día");
assert.equal(new Set(segments.map((segment) => segment.sections)).size, 5, "cada nota tiene un objeto sections independiente");
assert.equal(new Set(segments.map((segment) => segment.blocks)).size, 5, "cada nota tiene un arreglo blocks independiente");
assert.ok(segments.every((segment) => !fiveNoteBlocks.includes(segment.blocks[0])), "cada segmento contiene copias aisladas de los bloques fuente");
segments.forEach((segment, index) => {
  assert.equal(segment.sections.subjetivo, `Subjetivo exclusivo ${index + 1}.`, `Subjetivo independiente ${index + 1}`);
  assert.doesNotMatch(segment.sections.subjetivo, /EXPLORACIÓN|EXAMEN MENTAL|DIAGNÓSTICO|PLAN|ANÁLISIS|NOTA DE /, `nota ${index + 1} no invade otras secciones`);
});
assert.equal(assertSubjectiveIsolation(segments), true, "los cinco Subjetivos están aislados");

const editedSegments = updateSubjectiveSegmentValue(segments, segments[2].id, "Edición manual exclusiva.");
assert.equal(editedSegments[2].sections.subjetivo, "Edición manual exclusiva.");
assert.equal(editedSegments[2].subjectiveManuallyEdited, true);
assert.equal(editedSegments[1], segments[1], "editar una nota no modifica las demás");
assert.equal(editedSegments[3], segments[3], "la siguiente nota conserva su referencia y valor");

const reparsed = segments.map((segment) => assignParsedSubjective({ ...segment, sections: { ...segment.sections } }, segment.subjectiveExtraction));
const preserved = preserveManualSubjectiveEdits(reparsed, editedSegments);
assert.equal(preserved[2].sections.subjetivo, "Edición manual exclusiva.", "reanálisis conserva la edición manual");
assert.equal(preserved[1].sections.subjetivo, segments[1].sections.subjetivo, "reanálisis reemplaza, no concatena, el resultado automático");

assert.throws(() => assertSubjectiveIsolation([{ ...segments[0], sections: { ...segments[0].sections, subjetivo: "Relato. PLAN TERAPÉUTICO: contenido" } }]), /noteId=.*término=PLAN TERAPÉUTICO.*posición=/, "la aserción informa nota, término y posición");
assert.throws(() => assertSubjectiveIsolation([
  { ...segments[0], sections: segments[0].sections },
  { ...segments[1], sections: segments[0].sections }
]), /comparte el objeto sections/, "detecta referencias sections compartidas");

const viewSource = await readFile(new URL("../js/modules/patient-transfer/ui/patientTransferView.js", import.meta.url), "utf8");
assert.match(viewSource, /segment\.sections\?\.subjetivo \?\? ""/, "el render usa el estado central editado");
assert.doesNotMatch(viewSource, /sections\?\.subjetivo\s*\|\|\s*(?:segment\.)?rawText/, "el render no repone el texto completo");
assert.match(viewSource, /Subjetivo \/ evolución/, "la etiqueta visible fue localizada");
assert.match(viewSource, /data-note-id="\$\{segment\.id\}"/, "cada textarea se vincula a un noteId único");
assert.match(viewSource, /data-section-key="subjetivo"/, "el control identifica exclusivamente la sección Subjetivo");
assert.doesNotMatch(viewSource, /allSegments.*join|combinedSubjective|fullText.*subjetivo|rawText.*subjetivo/i, "el render no concatena segmentos ni usa texto completo");
assert.doesNotMatch(viewSource, /function renderClinicalSections\(doc\)/, "se retiró el render documental legado que leía doc.sections.subjetivo");

const controllerSource = await readFile(new URL("../js/modules/patient-transfer/patientTransferController.js", import.meta.url), "utf8");
assert.doesNotMatch(controllerSource, /subjetivo\s*\+=/, "el estado nunca acumula Subjetivo con +=");
assert.match(controllerSource, /updateSubjectiveSegmentValue\(document\.noteSegments \|\| \[\], noteId, input\.value\)/, "el listener actualiza solo el noteId activo");

console.log("patient-transfer-subjective-section.test.mjs OK");
