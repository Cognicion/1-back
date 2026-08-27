import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const panel = read("js/medico.js");
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const patientCreationAdapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
const clinicalDataAdapter = read("js/modules/patient-transfer/integration/clinicalDataImportAdapter.js");
const duplicateReview = read("js/modules/patient-duplicates/index.js");

  assert.match(panel, /from "\.\/services\/usuarios\.js\?v=20260827-panel-pacientes-fallback-v1";/, "el Panel usa la instancia publicada de usuarios.js");
  assert.match(repository, /from "(?:\.\.\/){2}services\/usuarios\.js\?v=20260827-panel-pacientes-fallback-v1";/, "el repositorio comparte la versión publicada de usuarios.js");
  assert.match(patientCreationAdapter, /from "(?:\.\.\/){3}services\/usuarios\.js\?v=20260827-panel-pacientes-fallback-v1";/, "la creación comparte la misma instancia publicada");
  assert.match(clinicalDataAdapter, /from "(?:\.\.\/){3}services\/usuarios\.js\?v=20260827-panel-pacientes-fallback-v1";/, "la importación clínica comparte la misma instancia publicada");
  assert.match(duplicateReview, /from "(?:\.\.\/){2}services\/usuarios\.js\?v=20260827-panel-pacientes-fallback-v1";/, "la revisión de duplicados comparte la misma instancia publicada");

assert.match(panel, /cognicion:patient-transfer-completed/, "el Panel escucha el traspaso completado");
assert.match(panel, /cargarPacientes\(uidMedicoActual, \{ forzar: true \}\)/, "el listener fuerza el refresco");
assert.match(panel, /listarPacientes\(uidMedico, \{ forzar: Boolean\(opciones\.forzar\) \}\)/, "forzar llega a listarPacientes");
assert.match(panel, /let versionSolicitudPacientes = 0;/, "las solicitudes se versionan");
assert.match(panel, /if \(versionSolicitud !== versionSolicitudPacientes\) return;/, "una respuesta antigua no sobrescribe el refresco");

console.log("patient-transfer-panel-refresh.test.mjs OK");
