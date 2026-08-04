import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const expectedFiles = [
  "js/modules/patient-transfer/index.js",
  "js/modules/patient-transfer/patientTransferController.js",
  "js/modules/patient-transfer/patientTransferState.js",
  "js/modules/patient-transfer/patientTransferRepository.js",
  "js/modules/patient-transfer/docx/docxValidator.js",
  "js/modules/patient-transfer/docx/docxExtractor.js",
  "js/modules/patient-transfer/docx/docxBlockNormalizer.js",
  "js/modules/patient-transfer/docx/docxHashService.js",
  "js/modules/patient-transfer/parsing/patientFieldParser.js",
  "js/modules/patient-transfer/parsing/clinicalSectionParser.js",
  "js/modules/patient-transfer/parsing/clinicalSectionConfig.js",
  "js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js",
  "js/modules/patient-transfer/parsing/noteMetadataParser.js",
  "js/modules/patient-transfer/parsing/documentGroupingService.js",
  "js/modules/patient-transfer/state/multipleNotesModeState.js",
  "js/modules/patient-transfer/integration/clinicalAnalysisAdapter.js",
  "js/modules/patient-transfer/integration/patientCreationAdapter.js",
  "js/modules/patient-transfer/integration/noteCreationAdapter.js",
  "js/modules/patient-transfer/ui/patientTransferView.js",
  "css/modules/patient-transfer.css"
];

for (const file of expectedFiles) {
  assert.equal(existsSync(join(root, file)), true, `${file} debe existir`);
}

const medico = read("js/medico.js");
assert.match(medico, /btnImportarDocxPaciente/, "medico.js registra el unico boton de importacion DOCX");
assert.match(medico, /import\("\.\/modules\/patient-transfer\/index\.js"\)/, "el modulo se carga con lazy loading");
assert.doesNotMatch(medico, /modules\/importacionDocx\/docxImportController/, "medico.js no abre el importador local simplificado");

const html = read("medico.html");
assert.match(html, /id="btnImportarDocxPaciente"/, "medico.html conserva el boton unico de importacion");
assert.doesNotMatch(html, /btnTraspasarPacientes/, "medico.html no conserva un segundo boton de traspaso");
assert.match(html, /patient-transfer\.css/, "medico.html carga estilos del modulo");

const controller = read("js/modules/patient-transfer/patientTransferController.js");
const transferView = read("js/modules/patient-transfer/ui/patientTransferView.js");
assert.match(controller, /window\.confirm/, "la persistencia exige confirmacion medica");
assert.match(controller, /validateTransferDocxFile/, "el flujo valida DOCX antes de extraer");
assert.match(controller, /extractDocx/, "el flujo extrae DOCX estructuralmente");
assert.match(controller, /analyzeDocumentClinically/, "el flujo delega analisis clinico al motor central");
assert.match(controller, /groupDocumentsByPatient/, "el flujo agrupa documentos por paciente probable");
assert.match(controller, /function syncReviewedGroupsFromView/, "los cambios de revisión se sincronizan al estado central");
assert.match(controller, /const reviewedGroups = analyzedGroups;/, "el guardado usa el estado central ya sincronizado");
assert.match(controller, /expandSegmentedGroupsForSave/, "la persistencia crea una nota por segmento confirmado");
assert.match(controller, /setFileMultipleNotesMode/, "la revisión actualiza el modo por archivo en el estado central");
assert.match(controller, /multipleNotesMode/, "el controlador envía el modo explícito al segmentador");
assert.match(transferView, /¿Este archivo contiene más de una nota\?/, "la opción de múltiples notas es visible antes del análisis");
assert.match(transferView, /data-transfer-file-multiple-mode/, "cada tarjeta de archivo expone su selector de modo");
assert.match(transferView, /Detectar automáticamente/, "la vista ofrece detección automática");
assert.match(transferView, /Una sola nota/, "la vista permite forzar una sola nota");
assert.match(transferView, /Varias notas/, "la vista permite forzar varias notas");
assert.match(transferView, /data-transfer-split-segment/, "la vista permite dividir segmentos");
assert.match(transferView, /data-transfer-merge-segment/, "la vista permite unir segmentos");
assert.match(transferView, /renderSegmentDiagnosisCandidates/, "la vista renderiza diagnósticos por nota");
assert.match(transferView, /renderSegmentTreatmentCandidates/, "la vista renderiza tratamientos por nota");
assert.match(transferView, /Exploración física \/ neurológica/, "la vista usa el nombre clínico solicitado");
assert.match(transferView, /patient-transfer-vitals-table/, "los signos vitales se presentan en tabla compacta");
assert.match(transferView, /index === 0 \? "open" : ""/, "solo la primera nota inicia expandida");
assert.match(transferView, /Ver texto original/, "el texto fuente queda en un panel contraíble independiente");
assert.doesNotMatch(transferView, /<textarea readonly>\$\{escapeHtml\(doc\.fullText/, "el texto completo no se repite al final del documento");

const validator = read("js/modules/patient-transfer/docx/docxValidator.js");
assert.match(validator, /ZIP_SIGNATURE/, "valida firma real de archivo ZIP/DOCX");
assert.match(validator, /\.docx/, "solo acepta DOCX en esta fase");

const clinicalAdapter = read("js/modules/patient-transfer/integration/clinicalAnalysisAdapter.js");
assert.match(clinicalAdapter, /clinical-analysis-engine\/index\.js/, "usa API publica del Motor Analitico Central");
assert.doesNotMatch(clinicalAdapter, /SOF[IÍ]A|OpenAI|LLM|NLP/i, "no usa IA ni SOFIA");

const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const patientAdapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
const noteAdapter = read("js/modules/patient-transfer/integration/noteCreationAdapter.js");
assert.match(patientAdapter, /crearPacienteProvisional/, "reutiliza creacion existente de pacientes");
assert.match(noteAdapter, /guardarBorradorNotaClinica/, "reutiliza creacion existente de notas");
assert.match(repository, /createTransferredPatient/, "el repository usa el adaptador de pacientes");
assert.match(repository, /createTransferredNote/, "el repository usa el adaptador de notas");
assert.match(repository, /registrarEventoAuditoria/, "registra auditoria");
assert.match(repository, /uploadBytes/, "conserva archivo original en Storage");
assert.match(repository, /findExistingPatientCandidates/, "busca coincidencias existentes antes de crear");
assert.match(repository, /textHash/, "detecta posible duplicado por texto normalizado");
assert.doesNotMatch(repository, /console\.log\([^)]*fullText|console\.log\([^)]*nota/i, "no imprime notas completas en consola");

const allNewSources = expectedFiles
  .filter((file) => file.endsWith(".js"))
  .map(read)
  .join("\n");
assert.doesNotMatch(allNewSources, /SOF[IÍ]A|OpenAI|LLM|modelo de inteligencia artificial/i, "el modulo no contiene integraciones de IA");

console.log("patient-transfer-static.test.mjs OK");
