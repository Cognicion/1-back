import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
assert.match(repository, /collection\(db, "usuarios", user\.uid, TRANSFER_COLLECTION\)/, "el registro de traspaso se crea bajo el usuario");
assert.doesNotMatch(repository, /addDoc\(collection\(db, TRANSFER_COLLECTION\)/, "no escribe en la coleccion raiz traspasosPacientes");
assert.doesNotMatch(repository, /collection\(db, DOCX_IMPORT_CONFIG\.duplicateCollection\)/, "no escribe ni consulta duplicados en coleccion raiz");
assert.match(repository, /doc\(db, "usuarios", user\.uid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection, document\.hash\)/, "el duplicado se registra bajo el usuario por hash");
assert.match(repository, /stage = "creating_patient"/, "traza etapa de creacion de paciente");
assert.match(repository, /stage = "creating_note"/, "traza etapa de creacion de nota");
assert.match(repository, /stage = "uploading_source"/, "traza etapa de subida del DOCX");
assert.match(repository, /deleteDoc\(doc\(db, "usuarios", patientId\)\)/, "intenta rollback si falla antes de crear notas");
assert.match(repository, /patientName: group\.confirmedFields\?\.nombre/, "el resultado conserva nombre visible del paciente");

const view = read("js/modules/patient-transfer/ui/patientTransferView.js");
assert.match(view, /result\.patientName/, "la UI muestra nombre del paciente antes que IDs tecnicos");
assert.doesNotMatch(view, /Paciente: \$\{escapeHtml\(result\.patientId/, "la UI no muestra el UID/ID como nombre de paciente");
assert.match(view, /syncPatientNameInputs/, "la UI recalcula nombre completo al editar partes");

const adapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
assert.match(adapter, /nombres/, "payload de paciente incluye nombres");
assert.match(adapter, /apellidoPaterno/, "payload de paciente incluye apellido paterno");
assert.match(adapter, /apellidoMaterno/, "payload de paciente incluye apellido materno");
assert.match(adapter, /nombreCompleto/, "payload de paciente mantiene nombre completo compatible");

console.log("patient-transfer-save-flow.test.mjs OK");
