import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("el Detector y SOFÍA consumen PatientPatternProfile por Cloud Functions", async () => {
  const [index, contextService, api, page, sofiaController] = await Promise.all([
    source("functions/index.js"),
    source("functions/sofiaOrchestrator/contextService.js"),
    source("js/patient-patterns/patientPatternApi.js"),
    source("detector-patrones.html"),
    source("js/sofia/clinicalAnalysis/clinicalAnalysisController.js")
  ]);
  assert.match(index, /exports\.getPatientPatternProfile\s*=\s*onCall/);
  assert.match(index, /exports\.refreshPatientPatternProfile\s*=\s*onCall/);
  assert.match(contextService, /getOrBuildPatientPatternProfile/);
  assert.doesNotMatch(contextService, /detectPatientPatterns\(timeline\)/);
  assert.match(api, /httpsCallable/);
  assert.doesNotMatch(api, /getDoc|getDocs|collection\(/);
  assert.match(page, /patientPatternPage\.js/);
  assert.match(sofiaController, /renderPatientPatternProfile/);
});

test("las funciones sensibles validan relación médico-paciente en backend", async () => {
  const [handlers, access] = await Promise.all([
    source("functions/clinicalAnalytics/patientPatternHandlers.js"),
    source("functions/clinicalAnalytics/access.js")
  ]);
  assert.match(handlers, /assertAuthorizedPatientClinician\(request, db, patientId\)/);
  assert.match(handlers, /patientAllowsProfessionalAccess/);
  assert.match(access, /async function assertAuthorizedPatientClinician/);
  assert.match(access, /if \(!isProfessional\(actor\)\)/);
  assert.match(access, /patientAllowsProfessionalAccess\(patient, request\.auth\.uid\)/);
  assert.match(access, /permission-denied/);
  assert.match(handlers, /curpReturned:\s*false/);
});

test("el perfil individual se guarda bajo el expediente protegido y no en analítica global", async () => {
  const [persistence, globalPersistence] = await Promise.all([
    source("functions/clinicalAnalytics/patientPatternProfilePersistence.js"),
    source("functions/clinicalAnalytics/persistence.js")
  ]);
  assert.match(persistence, /usuarios\/\$\{patientId\}/);
  assert.match(persistence, /storageScope:\s*"protected_patient_record"/);
  assert.doesNotMatch(globalPersistence, /clinicalPatternProfiles/);
});

test("BSS parcial no se presenta como puntuación final ni probabilidad", async () => {
  const [service, renderer, instructions] = await Promise.all([
    source("functions/clinicalAnalytics/suicideIdeationBeckInferenceService.js"),
    source("js/patient-patterns/patientPatternRenderer.js"),
    source("functions/sofiaOrchestrator/orchestrator.js")
  ]);
  assert.match(service, /const rawScore = complete \? partialSum : null/);
  assert.match(renderer, /No calculable completamente/);
  assert.match(renderer, /no es probabilidad/i);
  assert.match(instructions, /19\/19 reactivos/);
  assert.match(instructions, /no una probabilidad de suicidio/i);
  assert.doesNotMatch(renderer, /new Date\(value \|\| 0\)/);
  assert.match(renderer, /suicidalIdeationBSS:\s*"Ideación suicida · BSS normalizada"/);
});

test("el HTML ofrece selector, dashboard y acceso desde SOFÍA", async () => {
  const [page, sofia, css, bridge] = await Promise.all([
    source("detector-patrones.html"),
    source("sofia.html"),
    source("css/patient-pattern-detector.css"),
    source("js/patient-patterns/patternSofiaBridge.js")
  ]);
  assert.match(page, /id="patientPatternSearch"/);
  assert.match(page, /id="patientPatternHost"/);
  assert.match(sofia, /detector-patrones\.html/);
  assert.match(sofia, /patient-pattern-detector\.css/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(bridge, /BroadcastChannel/);
  assert.doesNotMatch(bridge, /localStorage|indexedDB/i);
});

test("el almacenamiento mantiene el documento principal acotado", async () => {
  const persistence = await source("functions/clinicalAnalytics/patientPatternProfilePersistence.js");
  assert.match(persistence, /features:\s*"quantitativeFeatures"/);
  assert.match(persistence, /sourceDocumentStorage:\s*"sourceDocuments"/);
  assert.match(persistence, /without\(profile\.audit \|\| \{\}, \["sourceDocumentIds"\]\)/);
});
