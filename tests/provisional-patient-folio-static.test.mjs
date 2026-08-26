import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  patientAccessBackend,
  patientAccessClient,
  usersService,
  newPatientUi,
  newPatientHtml,
  patientCreationAdapter,
  firestoreRules
] = await Promise.all([
  readFile(new URL("../functions/accountSecurity/professionalPatientAccess.js", import.meta.url), "utf8"),
  readFile(new URL("../js/services/professionalPatientAccessService.js", import.meta.url), "utf8"),
  readFile(new URL("../js/services/usuarios.js", import.meta.url), "utf8"),
  readFile(new URL("../js/nuevoPaciente.js", import.meta.url), "utf8"),
  readFile(new URL("../nuevo-paciente.html", import.meta.url), "utf8"),
  readFile(new URL("../js/modules/patient-transfer/integration/patientCreationAdapter.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8")
]);

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `No se encontró ${startMarker}`);
  assert.notEqual(end, -1, `No se encontró ${endMarker}`);
  return source.slice(start, end);
}

test("crearPacienteProvisional ya no lista toda usuarios antes de llamar al backend", () => {
  const createPatientSource = sourceSection(
    usersService,
    "export async function crearPacienteProvisional(datos, operationId = \"\")",
    "export async function solicitarEliminacionPaciente"
  );

  assert.doesNotMatch(createPatientSource, /obtenerSiguienteExpedienteCognicion/u);
  assert.doesNotMatch(createPatientSource, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/u);
  assert.match(createPatientSource, /stableOperationId[\s\S]*crearPacienteProvisionalSeguro\(payload, stableOperationId\)/u);
  assert.match(createPatientSource, /resultado\.expedienteCognicion/u);
  assert.match(usersService, /async function listarPacientesGratuitosPorAsignacion\(uidProfesional\)/u);
});

test("el backend inicializa y actualiza el contador anual dentro del alta transaccional", () => {
  const createPatientSource = sourceSection(
    patientAccessBackend,
    "async function createProvisionalPatient(auth, data = {})",
    "async function discardUnregisteredAccount(auth)"
  );

  assert.match(patientAccessBackend, /maximumExistingPatientFolioSequence/u);
  assert.match(patientAccessBackend, /db\.collection\("usuarios"\)\.get\(\)/u);
  assert.match(createPatientSource, /transaction\.get\(folioCounterRef\)/u);
  assert.match(createPatientSource, /transaction\.set\(folioCounterRef/u);
  assert.doesNotMatch(createPatientSource, /suppliedFolio/u);
  assert.match(createPatientSource, /const expedienteCognicion = `C\$\{nextFolioSequence\}-\$\{folioYear\}`/u);
  assert.match(createPatientSource, /expedienteCognicion,\s*datosInstitucionales:\s*\{/u);
  assert.match(createPatientSource, /return\s*\{\s*deduplicated:\s*false,\s*expedienteCognicion,\s*id:\s*patientRef\.id/u);
});

test("el alta usa un operationId estable desde UI y servicio y bloquea dobles clics", () => {
  assert.match(patientAccessClient, /function crearIdOperacionPaciente/u);
  assert.match(patientAccessClient, /crearPacienteProvisionalSeguro\(paciente = \{\}, operationId = ""\)/u);
  assert.match(patientAccessClient, /operationId:\s*stableOperationId/u);
  assert.match(usersService, /operationId \|\| datos\?\.transferOperationId/u);
  assert.match(patientCreationAdapter, /fields\.transferOperationId \|\| ""/u);

  assert.match(newPatientUi, /let guardadoPacienteEnCurso = false/u);
  assert.match(newPatientUi, /let operacionAltaPacienteId = ""/u);
  assert.match(newPatientUi, /if \(guardadoPacienteEnCurso\) return/u);
  assert.match(newPatientUi, /obtenerOperacionAltaPacienteId\(\)/u);
  assert.match(newPatientUi, /botonGuardar\.disabled = enCurso/u);
  assert.match(newPatientUi, /if \(!altaCompletada\) establecerGuardadoPacienteEnCurso\(false\)/u);
  assert.match(newPatientHtml, /<button type="button" id="guardarPacienteNuevoButton"/u);
});

test("el backend deduplica el mismo operationId dentro de la transacción", () => {
  const createPatientSource = sourceSection(
    patientAccessBackend,
    "async function createProvisionalPatient(auth, data = {})",
    "async function discardUnregisteredAccount(auth)"
  );

  assert.match(createPatientSource, /requirePatientCreationOperationId\(data\.operationId\)/u);
  assert.match(createPatientSource, /transaction\.get\(operationRef\)/u);
  assert.match(createPatientSource, /completedPatientCreationResult/u);
  assert.match(createPatientSource, /transaction\.create\(operationRef/u);
  assert.match(createPatientSource, /payloadFingerprint/u);
  assert.match(createPatientSource, /deduplicated:\s*false/u);
  assert.doesNotMatch(createPatientSource, /operationRef[\s\S]*paciente:\s*patientPayload/u);
  assert.match(
    firestoreRules,
    /match \/patientCreationOperations\/\{operationId\} \{\s*allow read, create, update, delete: if false;/u
  );
  assert.equal(
    firestoreRules.match(/subcollection != "patientCreationOperations"/gu)?.length,
    3
  );
});

test("el registro de paciente también asigna el folio dentro de su transacción", () => {
  const registerPatientSource = sourceSection(
    patientAccessBackend,
    "async function registerPatientProfile(auth, data = {})",
    "async function managePatientPermission(auth, data = {})"
  );

  assert.match(registerPatientSource, /transaction\.get\(folioCounterRef\)/u);
  assert.match(registerPatientSource, /patientFolioFromProfile\(existing \|\| \{\}\)/u);
  assert.match(registerPatientSource, /transaction\.set\(folioCounterRef/u);
  assert.match(registerPatientSource, /expedienteCognicion,\s*datosInstitucionales:/u);
});

test("la actualización de permisos retira flags embebidos legacy", () => {
  const permissionSource = sourceSection(
    patientAccessBackend,
    "async function managePatientPermission(auth, data = {})",
    "return Object.freeze({"
  );

  assert.match(permissionSource, /embeddedPatientPermissionRemovalPatch\(patient, targetUid\)/u);
  assert.match(permissionSource, /transaction\.update\(patientRef, legacyPermissionPatch\)/u);
});
