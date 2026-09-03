import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const controller = read("js/rehabilitacion-tdah.js");
const html = read("rehabilitacion-tdah.html");
const css = read("css/rehabilitacion-tdah.css");
const rehabilitationHtml = read("rehabilitacion-cognitiva.html");
const rehabilitationController = read("js/rehabilitacion-cognitiva.js");
const persistence = read("js/adhd/services/adhdPersistenceAdapter.js");

function lineOf(source, pattern) {
  const match = typeof pattern === "string" ? source.indexOf(pattern) : source.search(pattern);
  return match < 0 ? null : source.slice(0, match).split(/\r?\n/u).length;
}

function functionBody(source, name, nextName) {
  const startPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "u");
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `No se encontró la función ${name}`);
  const remainder = source.slice(start);
  if (!nextName) return remainder;
  const nextPattern = new RegExp(`\\n(?:async\\s+)?function\\s+${nextName}\\s*\\(`, "u");
  const end = remainder.search(nextPattern);
  return end < 0 ? remainder : remainder.slice(0, end);
}

function assertExported(moduleSource, exportName, modulePath) {
  const direct = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${exportName}\\b`, "u");
  const list = new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`, "su");
  assert.ok(
    direct.test(moduleSource) || list.test(moduleSource),
    `${modulePath} no exporta ${exportName}, aunque el controlador lo importa`
  );
}

test("la entrada TDAH es separada y el runner nativo permanece lazy", () => {
  assert.match(rehabilitationHtml, /href="rehabilitacion-tdah\.html"[^>]*data-enlace-rehabilitacion-tdah/u);
  assert.match(rehabilitationController, /querySelector\("\[data-enlace-rehabilitacion-tdah\]"\)/u);
  assert.match(rehabilitationController, /construirUrlActividadRehabilitacion/u);
  assert.doesNotMatch(rehabilitationController, /(?:from|import\()\s*["'][^"']*\/adhd\//u,
    "Rehabilitación Cognitiva no debe cargar el programa TDAH antes de entrar");
  assert.doesNotMatch(rehabilitationHtml, /js\/rehabilitacion-tdah\.js/u,
    "La portada no debe cargar el controlador longitudinal");
  assert.match(controller, /await import\("\.\/adhd\/tasks\/adhdNativeTaskRunner\.js"\)/u);
  assert.doesNotMatch(controller, /^import[^\n]*adhdNativeTaskRunner/mu,
    "Las tareas nativas deben seguir bajo import() dinámico");
  const legacyFiles = [
    "js/cpt.js",
    "js/go-nogo.js",
    "js/stroop.js",
    "nback.html",
    "js/escucha-dicotica.js"
  ];
  legacyFiles.forEach((path) => {
    const source = read(path);
    assert.doesNotMatch(source, /^import[^\n]*\/adhd\//mu,
      `${path} no debe cargar módulos TDAH en su ruta independiente`);
    assert.match(source, /if \([^)]*adhdTaskMode[^)]*\)[\s\S]{0,220}import\(/u,
      `${path} debe cargar el puente dinámicamente y solo en modo TDAH`);
  });
});

test("todos los imports nombrados ADHD del controlador existen en sus módulos", () => {
  const expression = /import\s*\{([^}]*)\}\s*from\s*"(\.\/adhd\/[^"?]+)";/gu;
  const imports = [...controller.matchAll(expression)];
  assert.ok(imports.length >= 10, "Se esperaban los módulos desacoplados del programa");
  imports.forEach((match) => {
    const names = match[1].split(",").map((name) => name.trim().split(/\s+as\s+/u)[0]).filter(Boolean);
    const modulePath = resolve(ROOT, "js", match[2]);
    assert.ok(existsSync(modulePath), `Falta el módulo importado ${match[2]}`);
    const moduleSource = readFileSync(modulePath, "utf8");
    names.forEach((name) => assertExported(moduleSource, name, match[2]));
  });
});

test("el controlador consume tareas legacy mediante adaptador y puente autenticado", () => {
  assert.match(controller, /task\.kind === "existing"[\s\S]{0,160}createTaskLaunchContext/u);
  assert.match(controller, /createAdhdTaskBridgeHost\(\{/u);
  assert.match(controller, /targetOrigin:\s*window\.location\.origin/u);
  assert.match(controller, /iframe\.src\s*=\s*buildExistingTaskUrl/u);
  assert.match(controller, /state\.activeBridge\?\.destroy\(\)/u);
  const legacyFiles = [
    "js/cpt.js",
    "js/go-nogo.js",
    "js/stroop.js",
    "nback.html",
    "js/escucha-dicotica.js"
  ];
  legacyFiles.forEach((path) => {
    const source = read(path);
    assert.match(source, /parseExistingTaskContext/u, `${path} no reconoce el contexto TDAH`);
    assert.match(source, /createAdhdTaskPageBridge/u, `${path} no inicializa el puente legacy`);
    assert.match(source, /\.publishResult\(/u, `${path} no publica el resultado al host canónico`);
  });
  const bridge = read("js/adhd/integration/adhdTaskPageBridge.js");
  assert.match(bridge, /event\.origin !== origin/u);
  assert.match(bridge, /event\.source !== iframe\.contentWindow/u);
  assert.match(bridge, /data\.token === token/u);
  assert.doesNotMatch(bridge, /postMessage\([^\n]+,\s*["']\*["']/u);
});

test("resultados, entidades y auditoría pasan por la persistencia canónica", () => {
  assert.match(controller, /from "\.\/adhd\/services\/adhdPersistenceAdapter\.js\?v=20260902-adhd-launch-recovery-v3"/u);
  assert.match(controller, /saveAdhdTaskResult\(\{/u);
  assert.match(controller, /saveAdhdEvaluation\(\{/u);
  assert.match(controller, /saveAdhdProfile\(\{/u);
  assert.match(controller, /saveAdhdPlan\(\{/u);
  assert.match(controller, /saveAdhdSession\(\{/u);
  assert.match(controller, /saveProgramAudit\(\{/u);
  assert.doesNotMatch(controller, /firebase-firestore|\b(?:setDoc|addDoc|writeBatch|collection)\s*\(/u,
    "El controlador no debe crear una segunda ruta de persistencia Firestore");
  assert.match(persistence, /ADHD_PROGRAM_COLLECTION\s*=\s*"rehabilitacionProgramas"/u);
  assert.match(persistence, /ADHD_RESULT_COLLECTION\s*=\s*"rehabilitacionResultados"/u);
  assert.match(persistence, /const canonicalResultRef = resultRef\(patientId, resultId\)/u);
  assert.match(persistence, /taskResultIds:\s*arrayUnion\(resultId\)/u);
  assert.match(persistence, /guardarBorradorClinicoLocal/u);
  assert.match(controller, /bundle\?\.pendingSync[\s\S]{0,260}syncPendingAdhdWrites/u,
    "al reabrir con red debe intentar sincronizar pendientes aunque no ocurra un nuevo evento online");
});

test("los roles separan acciones del profesional y ejecución del paciente", () => {
  assert.match(controller, /isAdministrator\(state\.actor\) \|\| hasClinicalProfessionalProfile\(state\.actor\)/u);
  assert.match(controller, /node\.hidden\s*=\s*!state\.clinician/u);
  assert.match(controller, /node\.disabled\s*=\s*!state\.canEditPatient/u);
  assert.match(controller, /resolvePatientEditAccess/u);
  ["generateProfileFromAssessment", "activatePlan", "addPlanExercise", "editPrimaryGoal", "deactivatePrimaryGoal"].forEach((name) => {
    const body = functionBody(controller, name);
    assert.match(body.slice(0, 420), /!state\.canEditPatient/u, `${name} carece de permiso de edición por paciente al inicio`);
  });
  assert.match(functionBody(controller, "exportResearch").slice(0, 420), /!state\.clinician/u);
  assert.match(controller, /if \(!state\.program && !state\.clinician\)/u,
    "El paciente no debe crear por sí solo la raíz clínica del programa");
  assert.match(html, /data-adhd-nav="clinician"/u);
  assert.match(html, /data-adhd-tab="clinician"/u);
});

test("T0–T3 conservan forma reproducible y comparación longitudinal", () => {
  assert.match(controller, /pendingAssessmentPhase:\s*"T0"/u);
  assert.match(controller, /createAdhdReassessmentConfiguration\(\{/u);
  assert.match(controller, /baseSeed:\s*`\$\{state\.programId\}:\$\{phase\}:\$\{assessmentId\}`/u);
  assert.match(controller, /buildAdhdLongitudinalSummary\(inputs\)/u);
  assert.match(controller, /const profile = state\.profiles\.find/u);
  assert.match(controller, /evaluation\.status === "completed" && evaluation\.quality\?\.valid === true/u);
  assert.match(controller, /taskResults:\s*resultsForEvaluation/u);
  assert.match(controller, /metricConfigurations:\s*fixedAssessmentMetricConfigurations/u);
  assert.match(controller, /source === "assessment"[\s\S]{0,300}taskForm\?\.metricConfiguration/u);
  ["T1", "T2", "T3"].forEach((phase) => {
    assert.match(html, new RegExp(`<option value="${phase}">`, "u"), `Falta ${phase} en reevaluación`);
  });
  const longitudinal = read("js/adhd/core/adhdLongitudinalEngine.js");
  ["T0", "T1", "T2", "T3"].forEach((phase) => assert.match(longitudinal, new RegExp(`\\b${phase}:`, "u")));
  assert.match(longitudinal, /normative:\s*false/u);
  assert.match(longitudinal, /ADHD_PRACTICE_EFFECT_NOTICE/u);
  assert.match(longitudinal, /metric_configuration_mismatch/u);
  assert.match(longitudinal, /task_version_mismatch/u);
  assert.match(controller, /reassessmentEligibility\(phase\)/u);
});

test("la telemetría detallada es opt-in y no contamina el resumen canónico", () => {
  const telemetryControl = html.match(/<input[^>]+name="telemetryEnabled"[^>]*>/u)?.[0] || "";
  assert.ok(telemetryControl, "Falta el control explícito de telemetría");
  assert.doesNotMatch(telemetryControl, /\schecked(?:\s|=|>)/u, "La telemetría no debe iniciar habilitada");
  assert.match(controller, /telemetryEnabled:\s*formData\.has\("telemetryEnabled"\)/u);
  assert.match(controller, /\?\?\s*false/u);
  assert.match(controller, /telemetry:\s*extractTelemetry\(normalized\)/u);
  assert.match(persistence, /telemetryEnabled\s*=\s*false/u);
  assert.match(persistence, /const channels = telemetryEnabled \? telemetryChannels\(result, telemetry\) : \{\}/u);
  assert.match(persistence, /SUMMARY_OMISSIONS[\s\S]*"trials"[\s\S]*"telemetry"/u);
  assert.match(persistence, /TELEMETRY_PII_KEY/u);
});

test("exportación y puente SOFÍA usan resúmenes derivados y seudonimizados", () => {
  assert.match(html, /id="adhdExportJson"/u);
  assert.match(html, /id="adhdExportCsv"/u);
  assert.match(controller, /buildAdhdResearchDataset\(\{/u);
  assert.match(controller, /\{ subjectCode, datePolicy: "remove" \}/u);
  assert.match(controller, /exportAdhdResearchCsv\(dataset\)/u);
  assert.match(controller, /exportAdhdResearchJson\(dataset\)/u);
  assert.match(controller, /if \(!state\.clinician\) return;/u);
  assert.match(controller, /buildAdhdSofiaSummary\(\{/u);
  const research = read("js/adhd/core/adhdResearchExport.js");
  assert.match(research, /directIdentifiersIncluded:\s*false/u);
  assert.match(research, /mappingIncluded:\s*false/u);
  const sofia = read("js/adhd/integration/adhdSofiaBridge.js");
  assert.match(sofia, /sourceOfTruth:\s*false/u);
  assert.match(sofia, /containsRawTrials:\s*false/u);
  assert.match(sofia, /mayChangeProgram:\s*false/u);
  assert.match(sofia, /mayDiagnose:\s*false/u);
});

test("HTML y CSS incluyen estructura, accesibilidad, tema y móvil sin IDs duplicados", () => {
  assert.match(html, /<link rel="stylesheet" href="css\/rehabilitacion-tdah\.css/u);
  assert.match(html, /<script type="module" src="js\/rehabilitacion-tdah\.js/u);
  ["adhdOverview", "adhdAssessment", "adhdProfile", "adhdPlan", "adhdSession", "adhdClinician", "adhdTaskDialog", "adhdReassessmentDialog"].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`, "u"), `Falta #${id}`);
  });
  assert.match(html, /Programa de rehabilitación y entrenamiento cognitivo basado en evidencia/u);
  assert.match(html, /No cura el TDAH ni reemplaza/u);
  assert.match(html, /aria-live="polite"/u);
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "rehabilitacion-tdah.html contiene IDs duplicados");
  for (const match of html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)(?:\?[^" ]*)?"/gu)) {
    assert.ok(existsSync(resolve(ROOT, match[1])), `Falta el recurso local ${match[1]}`);
  }
  assert.match(css, /html\[data-theme="light"\]/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /\.adhd-view\[hidden\]/u);
});

test("los controles editables del plan llegan al generador o a operaciones explícitas", () => {
  const body = functionBody(controller, "handlePlanConfigurationChange", "activatePlan");
  assert.match(body, /readPlanConfiguration\(\)|previewPlan\(\)/u,
    `handlePlanConfigurationChange (línea ${lineOf(controller, "function handlePlanConfigurationChange")}) no regenera ni vuelve a leer la configuración`);
  assert.match(body, /totalSessions/u,
    "El cambio de ‘Sesiones totales’ no se propaga al motor de programa");
  assert.match(body, /sessionMinutes/u,
    "El cambio de ‘Minutos por sesión’ no se propaga al motor de programa");
  assert.match(body, /(?:generateAdhdProgram|previewPlan|type:\s*"change_configuration")/u,
    "La edición debe regenerar o aplicar una operación auditable de configuración");
});

test("la dificultad devuelta por el motor adaptativo se aplica a la siguiente ejecución", () => {
  const evaluation = functionBody(controller, "evaluateAdaptation", "difficultyDescriptor");
  assert.match(evaluation, /decision\.nextDifficulty/u,
    `evaluateAdaptation (línea ${lineOf(controller, "function evaluateAdaptation")}) ignora adaptAdhdDifficulty.nextDifficulty`);
  const nativeConfig = functionBody(controller, "nativeDifficultyConfig", "reduceActiveTaskDifficulty");
  assert.match(nativeConfig, /nextDifficulty|difficultyConfigs|adaptiveDecisions/u,
    "nativeDifficultyConfig debe consumir la configuración adaptada, no solo un nivel paralelo");
});

test("cada bloque completado abre feedback descriptivo y persiste el autorreporte", () => {
  ["adhdFeedbackDialog", "adhdFeedbackMetrics", "adhdPostBlockFatigue", "adhdPostBlockFrustration", "adhdPostBlockConcentration"].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`, "u"), `Falta #${id}`);
  });
  const completion = functionBody(controller, "handleTaskCompletion", "completeTaskFeedback");
  assert.match(completion, /renderTaskFeedback/u);
  assert.match(completion, /showDialog\(\$\("adhdFeedbackDialog"\)\)/u);
  const feedback = functionBody(controller, "completeTaskFeedback", "handleTaskInterruption");
  assert.match(feedback, /postBlockSelfReport/u);
  assert.match(feedback, /evaluateAdaptation\(pending\.taskId, result, fatigue, frustration\)/u,
    "La adaptación debe esperar fatiga y frustración posteriores al bloque");
  assert.match(feedback, /result\.context\?\.goalId \|\| result\.references\?\.goalId/u,
    "El re-guardado de feedback debe conservar la referencia inmutable a la meta");
  assert.match(feedback, /result\.context\?\.challengeId \|\| result\.references\?\.challengeId/u,
    "El re-guardado de feedback debe conservar la referencia inmutable al reto");
  assert.match(feedback, /saveAdhdSession|persistCurrentSession/u);
  assert.match(feedback, /saveAdhdEvaluation/u);
  assert.match(html, /No son percentiles, diagnóstico ni una medida de “mejora cerebral”/u);
});

test("la sesión referencia resultados compactos y recupera bloques activos tras recarga", () => {
  const completion = functionBody(controller, "completeSessionTask", "normalizeCompletedTaskPayload");
  assert.match(completion, /compactSessionTaskResult\(record\)/u);
  const compact = functionBody(controller, "compactSessionTaskResult", "findPreviousComparableResult");
  assert.doesNotMatch(compact, /trials|practiceTrials|puzzles|technicalEvents/u);
  assert.doesNotMatch(compact, /metrics:\s*compact|adaptiveDecision/u);
  assert.match(compact, /canonicalSource/u);
  assert.match(compact, /snapshotContainsMetrics:\s*false/u);
  const recovery = functionBody(controller, "resolveExistingSession", "resolveCurrentChallenge");
  assert.match(recovery, /interruptAdhdBlock/u);
  assert.match(recovery, /application_reloaded/u);
  assert.match(controller, /resolvePendingSessionFeedback/u);
});

test("metacognición y transferencia funcional recorren el controlador y persisten referencias compactas", () => {
  const componentAction = functionBody(controller, "handleTodayComponentAction", "completeNonTaskBlock");
  assert.match(componentAction, /data-open-metacognitive-module/u);
  assert.match(componentAction, /openMetacognitiveModuleDialog/u);
  const metacognition = functionBody(controller, "saveMetacognitiveModule", "saveTransferOutcome");
  assert.match(metacognition, /buildMetacognitiveModuleResult/u);
  assert.match(metacognition, /readMetacognitiveModuleDialogDraft/u);
  assert.match(metacognition, /completeNonTaskBlock/u);
  const transfer = functionBody(controller, "saveTransferOutcome", "saveSelfRatingAndCompleteSession");
  assert.match(transfer, /applyTransferOutcomeToGoal/u);
  assert.match(transfer, /saveAdhdGoal/u);
  assert.match(transfer, /state\.followUpChallenge/u);
  assert.match(componentAction, /status:\s*"assigned"/u);
  assert.match(componentAction, /outcomePending:\s*true/u);
  assert.doesNotMatch(transfer, /goalSnapshot:\s*state/u);
  assert.match(controller, /functionalGoalBindingForSession\(planSession\)/u);
});

test("solo un plan válido y activado puede crear una sesión ejecutable", () => {
  const start = functionBody(controller, "startOrResumeTodaySession", "handleTodayComponentAction");
  assert.match(start.slice(0, 420), /state\.plan\.status !== "active"/u);
  assert.match(start.slice(0, 420), /state\.plan\.validation\?\.valid === false/u);
  const today = functionBody(controller, "renderToday", "functionalGoalBindingForSession");
  assert.match(today, /state\.plan\?\.status === "active"/u);
});
