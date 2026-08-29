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
  assert.match(handlers, /listAuthorizedPatientSnapshots/);
  assert.match(access, /async function assertAuthorizedPatientClinician/);
  assert.match(access, /if \(!isProfessional\(actor\)\)/);
  assert.match(access, /patientAllowsProfessionalAccess\(patient, professionalUid\)/);
  assert.match(access, /professionalUid:\s*request\.auth\.uid/);
  assert.match(access, /accountDeletionTombstoneExists/);
  assert.match(access, /permission-denied/);
  assert.match(handlers, /curpReturned:\s*false/);
});

test("el perfil individual se guarda bajo el expediente protegido y no en analítica global", async () => {
  const [persistence, globalPersistence, rules, handlers] = await Promise.all([
    source("functions/clinicalAnalytics/patientPatternProfilePersistence.js"),
    source("functions/clinicalAnalytics/persistence.js"),
    source("firestore.rules"),
    source("functions/clinicalAnalytics/patientPatternHandlers.js")
  ]);
  assert.match(persistence, /usuarios\/\$\{patientId\}/);
  assert.match(persistence, /storageScope:\s*"protected_patient_record"/);
  assert.doesNotMatch(globalPersistence, /clinicalPatternProfiles/);
  assert.match(rules, /match \/clinicalPatternProfiles\/\{document=\*\*\}\s*\{\s*allow read, create, update, delete: if false;/u);
  assert.match(rules, /subcollection != "clinicalPatternProfiles"/);
  assert.match(handlers, /clinicalPatternReviews/);
  assert.match(handlers, /storageScope:\s*"human_review_separate_from_computed_profile"/);
  assert.doesNotMatch(handlers, /transaction\.set\(ref,/);
  assert.doesNotMatch(handlers, /markPatientPatternProfileState/);
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

test("Fase 0 conserva acceso profesional, retención desactivada y límites centralizados", async () => {
  const [config, orchestrator, index] = await Promise.all([
    source("functions/sofiaOrchestrator/config.js"),
    source("functions/sofiaOrchestrator/orchestrator.js"),
    source("functions/index.js")
  ]);
  assert.match(config, /patientContext:\s*"professional_only"/);
  assert.match(config, /requestsPerWindow:\s*12/);
  assert.match(config, /windowMs:\s*5 \* 60 \* 1000/);
  assert.match(config, /burstRequests:\s*3/);
  assert.match(config, /burstWindowMs:\s*30 \* 1000/);
  assert.match(config, /maxConcurrentRequests:\s*2/);
  assert.match(config, /leaseMs:\s*130 \* 1000/);
  assert.match(orchestrator, /store:\s*false/);
  const legacyStart = index.indexOf("exports.chatSofia =");
  const legacyEnd = index.indexOf("const STRUCTURED_NOTE_PROMPT_VERSION", legacyStart);
  assert.ok(legacyStart >= 0 && legacyEnd > legacyStart);
  assert.match(index.slice(legacyStart, legacyEnd), /store:\s*false/);
});

test("las heurísticas locales distinguen negación, antecedente, familia e hipótesis", async () => {
  const raw = await source("js/services/sofiaClinica.js");
  const transformed = raw.replace(/^import .*;\s*$/gmu, "");
  const prelude = `
    const db = {};
    const obtenerHistorialNotas = async () => ({ docs: [] });
    const obtenerNombrePacienteParaMostrar = () => "";
    const normalizarTextoFrecuencia = (value) => String(value || "");
    const CATALOGO_FARMACOLOGICO_OFICIAL = [];
    const evaluarMedicamentosPaciente = () => ({});
    const listarPacientes = async () => ({ forEach() {} });
    const collection = () => ({});
    const doc = () => ({});
    const getDoc = async () => ({ exists: () => false });
    const getDocs = async () => ({ forEach() {} });
  `;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(prelude + transformed).toString("base64")}`;
  const { clasificarAsercionClinicaLocal } = await import(moduleUrl);
  assert.equal(clasificarAsercionClinicaLocal("Niega ideación suicida.", "suicid"), "NEGADO");
  assert.equal(clasificarAsercionClinicaLocal("Antecedente de intento suicida en 2024.", "suicid"), "ANTECEDENTE");
  assert.equal(clasificarAsercionClinicaLocal("Madre falleció por suicidio.", "suicid"), "FAMILIAR");
  assert.equal(clasificarAsercionClinicaLocal("Se debe descartar episodio depresivo.", "depres"), "POSIBLE");
  assert.equal(clasificarAsercionClinicaLocal("Presenta ideación suicida actual.", "suicid"), "PRESENTE");
});
