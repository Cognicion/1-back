import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const controller = read("js/rehabilitacion-tdah.js");
const patientController = read("js/paciente.js");
const patientHtml = read("paciente.html");
const rules = read("firestore.rules");

test("el botón inicia la primera tarea después de guardar la evaluación", () => {
  assert.match(controller, /let firstTaskId = "";[\s\S]*?firstTaskId = tasks\[0\]\?\.id \|\| "";/u);
  assert.match(controller, /finally \{\s*setBusy\(false\);\s*\}\s*if \(firstTaskId\) \{[\s\S]*?await startTask\(firstTaskId, "assessment"\);/u);
  assert.match(controller, /if \(!state\.patientId\) \{[\s\S]*?Selecciona el expediente del paciente/u);
  assert.match(controller, /if \(!form\.reportValidity\(\)\) \{[\s\S]*?form\.querySelector\(":invalid"\)\?\.focus\(\)/u);
});

test("cada evaluación nueva conserva procedencia de cuenta y las reglas la validan", () => {
  assert.match(controller, /administration: createAssessmentAdministration\(\)/u);
  assert.match(controller, /actorUid: state\.user\?\.uid \|\| ""/u);
  assert.match(controller, /source: state\.clinician \? "clinician_account" : "patient_account"/u);
  assert.match(rules, /function validAdhdAdministration\(uid, administration\)[\s\S]*?actorUid[\s\S]*?request\.auth\.uid[\s\S]*?patient_account[\s\S]*?clinician_account/u);
  assert.match(rules, /validAdhdEvaluationCreate\(uid, programId, evaluationId\)/u);
});

test("el expediente carga la fuente canónica y presenta el historial de baterías", () => {
  assert.match(patientHtml, /id="historialBateriasCognitivasPaciente"/u);
  assert.match(patientHtml, /Aplicaciones del programa TDAH realizadas por el paciente[\s\S]*?médico\/profesional/u);
  assert.match(patientController, /collection\(db, "usuarios", uidPaciente, "rehabilitacionProgramas"\)/u);
  assert.match(patientController, /"rehabilitacionProgramas", programId, "evaluaciones"/u);
  assert.match(patientController, /"rehabilitacionProgramas", programId, "auditoria"/u);
  assert.match(patientController, /collection\(db, "usuarios", uidPaciente, "rehabilitacionResultados"\)/u);
  assert.match(patientController, /construirHistorialBateriasAdhd/u);
  assert.match(patientController, /Paciente · cuenta COGNICIÓN|registro\.sourceLabel/u);
  assert.doesNotMatch(patientController, /getDocs\(collection\(db, "usuarios"\)\)/u, "el expediente no debe enumerar usuarios para obtener baterías");
});
