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
  "js/modules/patient-transfer/parsing/noteMetadataParser.js",
  "js/modules/patient-transfer/parsing/documentGroupingService.js",
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
assert.match(controller, /window\.confirm/, "la persistencia exige confirmacion medica");
assert.match(controller, /validateTransferDocxFile/, "el flujo valida DOCX antes de extraer");
assert.match(controller, /extractDocx/, "el flujo extrae DOCX estructuralmente");
assert.match(controller, /analyzeDocumentClinically/, "el flujo delega analisis clinico al motor central");
assert.match(controller, /groupDocumentsByPatient/, "el flujo agrupa documentos por paciente probable");

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
