import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const panel = read("js/medico.js");
const controller = read("js/modules/patient-transfer/patientTransferController.js");
const patientCreationAdapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
const clinicalDataAdapter = read("js/modules/patient-transfer/integration/clinicalDataImportAdapter.js");
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");

assert.match(panel, /from "\.\/services\/usuarios\.js";/, "el Panel usa la URL canónica de usuarios.js");
assert.match(patientCreationAdapter, /from "(?:\.\.\/){3}services\/usuarios\.js";/, "la creación importada usa la misma instancia de usuarios.js");
assert.match(clinicalDataAdapter, /from "(?:\.\.\/){3}services\/usuarios\.js";/, "la importación clínica comparte la instancia de usuarios.js");
assert.match(repository, /from "(?:\.\.\/){2}services\/usuarios\.js";/, "la búsqueda del importador comparte la instancia canónica");
assert.doesNotMatch(panel, /usuarios\.js\?v=/, "el Panel no crea otra caché ESM para pacientes");
assert.doesNotMatch(patientCreationAdapter, /usuarios\.js\?v=/, "la creación importada no crea otra caché ESM");
assert.doesNotMatch(clinicalDataAdapter, /usuarios\.js\?v=/, "la importación clínica no crea otra caché ESM");

assert.match(panel, /cargarPacientes\(uidMedicoActual, \{ forzar: true \}\)/, "el listener refresca forzadamente al completar un traspaso");
assert.match(panel, /listarPacientes\(uidMedico, \{ forzar: Boolean\(opciones\.forzar\) \}\)/, "la carga propaga la opción forzar al repositorio");
assert.match(panel, /let versionSolicitudPacientes = 0;/, "el Panel versiona solicitudes de pacientes");
assert.match(panel, /if \(versionSolicitud !== versionSolicitudPacientes\) return;/, "una respuesta anterior no puede sobrescribir un refresco reciente");
assert.match(panel, /\[medical-panel\] refresh-start/, "el Panel conserva la traza de refresco");
assert.match(panel, /forced: true/, "la traza declara el refresco forzado");

assert.match(controller, /createdPatientIds:/, "el evento conserva los pacientes recién creados");
assert.match(controller, /associatedPatientIds:/, "el evento conserva los pacientes asociados");
assert.match(controller, /createdCount:/, "el evento conserva el número de pacientes creados");
assert.match(controller, /operationId:/, "el evento conserva la operación de traspaso");
assert.match(controller, /completedAt:/, "el evento conserva una marca temporal");
assert.match(controller, /new CustomEvent\("cognicion:patient-transfer-completed", \{ detail: completedEventDetail \}\)/, "el evento se emite después de finalizar el resultado de persistencia");

console.log("patient-transfer-panel-refresh.test.mjs OK");
