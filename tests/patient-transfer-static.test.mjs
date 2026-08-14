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
assert.match(medico, /import\("\.\/modules\/patient-transfer\/index\.js\?v=20260804-segmentation-debug-v1"\)/, "el módulo activo se carga con lazy loading y versión explícita");
assert.doesNotMatch(medico, /modules\/importacionDocx\/docxImportController/, "medico.js no abre el importador local simplificado");

const html = read("medico.html");
assert.match(html, /id="btnImportarDocxPaciente"/, "medico.html conserva el boton unico de importacion");
assert.doesNotMatch(html, /btnTraspasarPacientes/, "medico.html no conserva un segundo boton de traspaso");
assert.match(html, /patient-transfer\.css/, "medico.html carga estilos del modulo");

const controller = read("js/modules/patient-transfer/patientTransferController.js");
const transferIndex = read("js/modules/patient-transfer/index.js");
const segmenter = read("js/modules/patient-transfer/parsing/clinicalNoteSegmenter.js");
const transferView = read("js/modules/patient-transfer/ui/patientTransferView.js");
const transferCss = read("css/modules/patient-transfer.css");
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
assert.match(transferIndex, /patientTransferController\.js\?v=20260813-diagnosis-row-prefix-filter-v2/, "el índice fuerza la carga del controlador publicado");
assert.match(controller, /clinicalNoteSegmenter\.js\?v=20260810-imported-notes-v1/, "el controlador fuerza la carga del segmentador publicado");
assert.match(controller, /patientTransferView\.js\?v=20260813-include-all-data-v1/, "el controlador fuerza la carga de la UI de medicamentos");
assert.match(html, /patient-transfer\.css\?v=20260811-medication-presentation-concentration-ui-v1/, "el CSS de medicamentos usa un marcador de cache nuevo");
assert.match(segmenter, /patient-transfer-segmentation-debug-v1/, "el segmentador expone un marcador verificable de compilación");
assert.match(segmenter, /\[patient-transfer\] segmentation:boundaries/, "el segmentador registra los límites usados");
assert.match(segmenter, /\[patient-transfer\] segmentation:completed/, "el segmentador registra la cantidad final de segmentos");
assert.match(controller, /\[patient-transfer\] note-segments:stored/, "el controlador registra los segmentos guardados en estado");
assert.match(transferView, /¿Este archivo contiene más de una nota\?/, "la opción de múltiples notas es visible antes del análisis");
assert.match(transferView, /data-transfer-file-multiple-mode/, "cada tarjeta de archivo expone su selector de modo");
assert.match(transferView, /Detectar automáticamente/, "la vista ofrece detección automática");
assert.match(transferView, /Una sola nota/, "la vista permite forzar una sola nota");
assert.match(transferView, /Varias notas/, "la vista permite forzar varias notas");
assert.match(transferView, /countTransferNotes\(groups\)/, "el resumen cuenta los segmentos clínicos, no solo los documentos");
assert.match(transferView, /data-transfer-split-segment/, "la vista permite dividir segmentos");
assert.match(transferView, /data-transfer-merge-segment/, "la vista permite unir segmentos");
assert.match(transferView, /renderSegmentDiagnosisCandidates/, "la vista renderiza diagnósticos por nota");
assert.match(transferView, /renderSegmentTreatmentCandidates/, "la vista renderiza tratamientos por nota");
assert.match(transferView, /data-transfer-select-all/, "cada sección por nota expone su control de inclusión masiva");
assert.match(transferView, /data-action="toggle-all-candidates"/, "el control maestro declara una acción explícita para delegación de eventos");
assert.match(transferView, /data-document-id=/, "el control maestro identifica el documento estable");
assert.match(transferView, /data-note-id=/, "el control maestro identifica la nota estable");
assert.match(transferView, /data-candidate-type=/, "el control maestro identifica la sección clínica");
assert.match(controller, /applyBulkCandidateSelection/, "el controlador actualiza el estado central al seleccionar todos");
assert.match(controller, /toggleAllCandidates/, "el listener delegado invoca una función única para la selección masiva");
assert.match(controller, /select-all-debug/, "el listener registra el estado del checkbox antes de aplicar la selección");
assert.match(controller, /event\.target\.closest\("\[data-action='toggle-all-candidates'\]"\)\) return;/, "el evento input no debe restaurar el checkbox maestro antes de change");
assert.match(controller, /patient-transfer\] \$\{candidateType === "diagnosis" \? "select-all-diagnoses" : "select-all-treatments"\}/, "el controlador conserva trazas resumidas de selección masiva");
assert.match(transferView, /Exploración física \/ neurológica/, "la vista usa el nombre clínico solicitado");
assert.match(transferView, /patient-transfer-vitals-table/, "los signos vitales se presentan en tabla compacta");
assert.match(transferView, /data-transfer-tx-schedule-dose/, "la pauta expone la dosis de cada administraciÃ³n");
assert.match(transferView, /data-transfer-tx-schedule-add/, "la pauta permite agregar administraciones");
assert.match(controller, /data-transfer-tx-schedule-remove/, "el controlador permite quitar administraciones");
assert.match(transferView, /patient-transfer-vertical-header/, "los encabezados de medicamentos usan orientación vertical");
assert.match(transferView, /patient-transfer-medication-catalog-meta/, "medicamento y estado de catálogo se muestran en una sola celda");
assert.match(controller, /data-transfer-tx-catalog-toggle/, "el vínculo de catálogo puede cambiarse mediante una acción compacta");
assert.match(transferCss, /writing-mode:\s*vertical-rl/, "el CSS rota solo el texto de los encabezados");
assert.match(transferView, /patientTransferMedicationColumnWidths/, "los anchos de columnas usan una preferencia local estable");
assert.match(transferView, /data-transfer-medication-column-resize/, "cada columna visible recibe un handle de resize");
assert.match(transferView, /addEventListener\("mousedown"/, "el resize comienza con el ratón");
assert.match(transferView, /addEventListener\("mousemove"/, "el resize sigue el arrastre horizontal");
assert.match(transferView, /data-transfer-medication-columns-reset/, "la tabla permite restablecer sus columnas");
assert.match(transferCss, /cursor:\s*col-resize/, "el handle comunica visualmente el resize");
assert.match(transferCss, /overflow-x:\s*auto/, "la tabla conserva desplazamiento horizontal");
assert.match(transferCss, /data-transfer-tx-catalog\]\[hidden\][^}]*display:\s*none/s, "el selector de catálogo permanece oculto hasta solicitarlo");
assert.match(controller, /medicationCatalogCompactState\(select\.value, shouldOpen\)/, "Cambiar o Vincular abre un selector cancelable");
assert.match(controller, /catalogSelect\.hidden = true/, "seleccionar catálogo vuelve a la vista compacta");
assert.match(controller, /catalogMatchMethod === "manual-none"/, "una desvinculación manual no se revierte por resolución automática");
assert.match(transferView, /filter\(isMeaningfulMedicationAdministration\)/, "una unidad oculta sin hora ni dosis no crea una toma fantasma");
assert.match(transferView, /shouldShowMedicationAdministrationUnit/, "la pauta decide visualmente si necesita mostrar unidad");
assert.match(transferView, /data-transfer-tx-schedule-unit[^>]*hidden/, "la unidad redundante se oculta sin borrarla del modelo");
assert.match(transferView, /openNoteSegments/, "el rerender conserva el estado abierto de las notas");
assert.match(transferView, /data-transfer-document-id=\"\$\{escapeHtml\(doc\.id\)\}/, "cada nota conserva también el documento propietario");
assert.match(transferView, /segment\.dataset\.transferDocumentId/, "el estado abierto usa la identidad compuesta documento-nota");
assert.match(transferView, /segment\.open = openNoteSegments\.get\(segmentKey\)/, "la nota activa se restaura después de seleccionar todos");
assert.match(transferView, /patient-transfer-duplicate-decision-options/, "las decisiones de duplicado usan un grupo compacto");
assert.match(transferView, /patient-transfer-duplicate-decision-option/, "las opciones de duplicado tienen estilo compacto");
assert.match(transferView, /data-transfer-duplicate-resolution/, "la UI conserva la fuente canónica de decisión");
assert.match(transferView, /formatMedicationPresentation/, "presentacion y concentracion usan un formatter visual central");
assert.match(transferView, /mergeMedicationPresentationColumn/, "la concentracion se integra visualmente en Presentacion");
assert.match(transferView, /patient-transfer-medication-presentation-compact/, "la edicion de presentacion es compacta");
assert.match(transferView, /strengthHeader\.hidden = true/, "la columna Concentracion no se muestra como columna independiente");
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
assert.match(noteAdapter, /finalizarNotaClinica/, "reutiliza el escritor canonico de notas definitivas");
assert.match(noteAdapter, /tipoNota: "Nota externa"/, "las notas importadas se etiquetan como externas");
assert.match(noteAdapter, /origen: "nota_externa"/, "las notas importadas conservan origen externo");
assert.match(noteAdapter, /getDocFromServer/, "verifica la nota desde el servidor");
assert.match(repository, /createTransferredPatient/, "el repository usa el adaptador de pacientes");
assert.match(repository, /createTransferredNote/, "el repository usa el adaptador de notas");
assert.match(repository, /notes-after-domain-error/, "la nota no se omite por un fallo previo de otro dominio");
assert.match(repository, /registrarEventoAuditoria/, "registra auditoria");
assert.match(repository, /uploadBytes/, "conserva archivo original en Storage");
assert.match(repository, /findExistingPatientCandidates/, "busca coincidencias existentes antes de crear");
assert.match(transferView, /Incluir todos los datos detectados/, "la revisión ofrece seleccionar datos de todas las notas");
assert.match(transferView, /Se recomienda corroborarlos antes de confirmar el traspaso/, "la selección masiva muestra advertencia de corroboración");
assert.match(repository, /textHash/, "detecta posible duplicado por texto normalizado");
assert.doesNotMatch(repository, /console\.log\([^)]*fullText|console\.log\([^)]*nota/i, "no imprime notas completas en consola");

const allNewSources = expectedFiles
  .filter((file) => file.endsWith(".js"))
  .map(read)
  .join("\n");
assert.doesNotMatch(allNewSources, /SOF[IÍ]A|OpenAI|LLM|modelo de inteligencia artificial/i, "el modulo no contiene integraciones de IA");

console.log("patient-transfer-static.test.mjs OK");
