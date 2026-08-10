import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const adapter = read("js/modules/patient-transfer/integration/clinicalDataImportAdapter.js");
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const view = read("js/modules/patient-transfer/ui/patientTransferView.js");
const treatmentService = read("js/services/tratamientos.js");
const patient = read("js/paciente.js");

assert.match(treatmentService, /export async function crearTratamiento\(uidPaciente, datos\)/);
assert.match(treatmentService, /addDoc\(coleccionTratamientos\(uidPaciente\)/);
assert.match(patient, /await crearTratamiento\(uidPaciente, datos\)/);
assert.match(adapter, /crearTratamiento, listarTratamientos/);
assert.match(adapter, /export async function createImportedTreatments/);
assert.match(adapter, /horarios: schedule/);
assert.match(adapter, /catalogMedicationId/);
assert.match(adapter, /importCandidateKey: treatmentKey\(candidate, context\)/);

assert.match(patient, /collection\(db, "usuarios", uidPaciente, "indicaciones"\)/);
assert.match(adapter, /collection\(db, "usuarios", patientId, "indicaciones"\)/);
assert.match(adapter, /patient-transfer:medications-history-before-real/);
assert.match(adapter, /patient-transfer:medications-history-after-real/);
assert.match(adapter, /patient-transfer:medications-write-not-observed/);
assert.match(adapter, /patient-transfer:indications-history-before-real/);
assert.match(adapter, /patient-transfer:indications-history-after-real/);
assert.match(adapter, /patient-transfer:indications-write-not-observed/);

const treatmentCall = adapter.slice(adapter.indexOf("export async function createImportedTreatments"));
assert.match(treatmentCall, /await crearTratamiento\(patientId, payload\)/, "medicamentos usan el target recibido");
assert.match(treatmentCall, /const after = await listarTratamientos\(patientId\)/, "medicamentos tienen read-after-write");
assert.match(treatmentCall, /candidate\.catalogMedicationId/);
assert.match(adapter, /Array\.isArray\(candidate\.schedule\)/);

const indicationCall = adapter.slice(adapter.indexOf("export async function createImportedIndications"));
assert.match(indicationCall, /doc\(indicationsCollection, indicationId\)/);
assert.match(indicationCall, /await setDoc\(indicationRef/);
assert.match(indicationCall, /const after = await getDocs\(indicationsCollection\)/);
assert.match(indicationCall, /const saved = await getDoc\(indicationRef\)/);
assert.match(indicationCall, /importCandidateKeys/);

const documentLoop = repository.slice(repository.indexOf("for (let documentIndex"));
assert.ok(
  documentLoop.indexOf('stage = "creating_treatments"') < documentLoop.indexOf('stage = "creating_note"'),
  "medicamentos e indicaciones se intentan antes de la nota"
);
assert.match(documentLoop, /domain: "medications"/);
assert.match(documentLoop, /domain: "indications"/);
assert.match(documentLoop, /effectiveAction/);
assert.match(documentLoop, /treatmentErrors/);
assert.match(documentLoop, /indicationErrors/);

assert.match(view, /const selected = includeControl \? includeControl\.checked : candidate\.include === true \|\| candidate\.selectedForImport === true/);
assert.match(view, /const checked = includeControl \? includeControl\.checked : candidate\.include === true \|\| candidate\.selectedForImport === true/);
assert.match(view, /candidate\.text \|\| candidate\.value/);

console.log("patient-transfer-medications-indications.test.mjs OK");
