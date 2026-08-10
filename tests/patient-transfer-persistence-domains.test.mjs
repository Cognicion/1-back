import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const controller = read("js/modules/patient-transfer/patientTransferController.js");
const clinicalAdapter = read("js/modules/patient-transfer/integration/clinicalDataImportAdapter.js");
const patientAdapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
const diagnosisService = read("js/services/diagnosticosPaciente.js");

assert.match(patientAdapter, /function normalizeImportedDate/);
assert.match(patientAdapter, /return `\$\{year\}-\$\{month\}-\$\{day\}`/);
assert.match(patientAdapter, /mergeTransferredPatientFields/);
assert.match(patientAdapter, /\.{3}\(current\?\.datosInstitucionales \|\| \{\}\)/);
assert.match(patientAdapter, /nonEmptyEntries/, "no sustituye datos existentes con valores vacÃ­os");

assert.match(diagnosisService, /codes,/);
assert.match(diagnosisService, /construirActualizacionHistorialDiagnosticos/);
assert.match(clinicalAdapter, /createImportedIndications/);
assert.match(clinicalAdapter, /collection\(db, "usuarios", patientId, "indicaciones"\)/);
assert.match(clinicalAdapter, /sourceNoteId: context\.noteId/);
assert.match(clinicalAdapter, /horarios: schedule/);

assert.match(repository, /mergeTransferredPatientFields/);
assert.match(repository, /const resumingCompletedOperation = operation\.data\?\.status === "completed"/);
assert.match(repository, /patient-transfer:persist-resume/);
assert.match(repository, /const noteWasExisting = note\.existing === true/);
assert.match(repository, /importedNoteId/);
assert.match(repository, /createImportedDiagnoses\(patientId/);
assert.match(repository, /createImportedTreatments\(patientId/);
assert.match(repository, /createImportedIndications\(patientId/);
assert.match(repository, /persistImportedVitalSignsForDocument/);
assert.match(repository, /:vital:\$\{candidate\.id \|\| vitalIndex\}/);
assert.match(repository, /patient-transfer:persist-demographics-success/);
assert.match(repository, /patient-transfer:persist-vitals-success/);
assert.match(repository, /patient-transfer:persist-diagnoses-success/);
assert.match(repository, /patient-transfer:persist-treatments-success/);

assert.equal(
  repository.indexOf('if (operation.data?.status === "completed")'),
  -1,
  "una operaciÃ³n previa no salta la reparaciÃ³n de dominios clÃ­nicos"
);

const existingNoteBranch = repository.slice(
  repository.indexOf("if (existingNote.exists())"),
  repository.indexOf('stage = "creating_treatments"')
);
assert.ok(
  repository.indexOf("persistImportedVitalSignsForDocument({") < repository.indexOf('stage = "creating_note"'),
  "los signos vitales no dependen de que la nota se cree o ya exista"
);
assert.ok(
  repository.indexOf("persistImportedDiagnosesForDocument({", repository.indexOf("for (let documentIndex")) < repository.indexOf('stage = "creating_note"'),
  "los diagnósticos no dependen de que la nota se cree o ya exista"
);
assert.doesNotMatch(existingNoteBranch, /continue;/, "una nota existente no omite signos, diagnÃ³sticos ni tratamientos pendientes");

assert.match(controller, /patient-transfer:confirm-start/);
assert.match(controller, /patient-transfer:review-state/);
assert.match(controller, /patient-transfer:payload-built/);
assert.match(controller, /patient-transfer:confirm-complete/);

console.log("patient-transfer-persistence-domains.test.mjs OK");
