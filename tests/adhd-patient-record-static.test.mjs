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
const persistence = read("js/adhd/services/adhdPersistenceAdapter.js");

test("el botón inicia la primera tarea después de guardar la evaluación", () => {
  assert.match(controller, /let firstTaskId = "";[\s\S]*?firstTaskId = tasks\[0\]\?\.id \|\| "";/u);
  assert.match(controller, /setBusy\(false\);[\s\S]*?if \(firstTaskId\) \{[\s\S]*?await startTask\(firstTaskId, "assessment"\);/u);
  assert.match(controller, /if \(!state\.patientId\) \{[\s\S]*?Selecciona el expediente del paciente/u);
  assert.match(controller, /validateAssessmentForm\(form, errorNode\)/u);
  assert.match(controller, /modality\.standardProgramAvailable === false/u, "las modalidades válidas usan disponibilidad por defecto y solo se bloquea un false explícito");
  assert.match(controller, /Falta completar o corregir:[\s\S]*?invalid\?\.scrollIntoView/u);
  assert.match(controller, /Guardando e iniciando batería/u);
});

test("el clic del botón se captura directamente y ningún bloqueo de acceso queda silencioso", () => {
  assert.match(controller, /document\.addEventListener\("click", handleAssessmentLaunchClick, \{ capture: true \}\)/u);
  assert.match(controller, /handleAssessmentLaunchClick[\s\S]*?closest\?\.\("#adhdCreateAssessment"\)[\s\S]*?beginAssessment\(button\.form/u);
  assert.match(controller, /createAssessment\.disabled = state\.assessmentLaunchInFlight/u);
  assert.match(controller, /Este expediente está en modo de solo lectura para tu cuenta/u);
  assert.match(controller, /catch \(error\)[\s\S]*?No fue posible iniciar o reanudar la evaluación/u);
});

test("el mismo botón reanuda una evaluación inconclusa y ningún bloqueo de tarea queda silencioso", () => {
  assert.match(controller, /if \(existingPhase\) \{[\s\S]*?await resumeExistingAssessment\(existingPhase, errorNode\)/u);
  assert.match(controller, /function resumeExistingAssessment[\s\S]*?find\(\(task\) => state\.assessmentResults\[task\.id\]\?\.status !== "completed"\)[\s\S]*?startTask\(nextTask\.id, "assessment"\)/u);
  assert.match(controller, /if \(state\.activeTask\) \{[\s\S]*?showDialog\(\$\("adhdTaskDialog"\)\)[\s\S]*?return true/u);
  assert.match(controller, /if \(state\.pendingFeedback\) \{[\s\S]*?showDialog\(\$\("adhdFeedbackDialog"\)\)[\s\S]*?return false/u);
});

test("la persistencia local precede a la escritura remota y una espera colgada tiene límite", () => {
  assert.match(persistence, /ADHD_REMOTE_OPERATION_TIMEOUT_MS = 5_000/u);
  assert.match(persistence, /async function persistWithDraft[\s\S]*?guardarBorradorClinicoLocal\(key, pendingEnvelope\)[\s\S]*?waitForAdhdRemoteOperation\(operation, remoteTimeoutMs\)/u);
  assert.match(persistence, /error\.code = "deadline-exceeded"/u);
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
