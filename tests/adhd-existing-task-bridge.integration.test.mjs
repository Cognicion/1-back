import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

const TASK_FILES = Object.freeze({
  "js/cpt.js": "cpt_x",
  "js/go-nogo.js": "go_nogo",
  "js/stroop.js": "stroop",
  "nback.html": "nback",
  "js/escucha-dicotica.js": "dichotic_listening"
});

test("cada tarea legacy activa el puente solo con adhd=1 y valida su identidad", async () => {
  for (const [path, expectedTaskId] of Object.entries(TASK_FILES)) {
    const text = await source(path);
    assert.match(text, /parseExistingTaskContext/u, `${path} debe importar/usar el parser de contexto`);
    assert.match(text, /createAdhdTaskPageBridge/u, `${path} debe importar/usar el puente de pagina`);
    assert.match(text, /get\("adhd"\) === "1"/u, `${path} debe requerir adhd=1 de forma exacta`);
    assert.match(text, /if \(adhdTaskMode\) \{[\s\S]*?parseExistingTaskContext\(\)/u, `${path} no debe parsear el contexto fuera del modo TDAH`);
    assert.match(text, new RegExp(`context\\.taskId !== "${expectedTaskId}"|adhdTaskContext\\.taskId !== "${expectedTaskId}"`, "u"));
    assert.match(text, /onConfig\(launchConfig\)/u, `${path} debe consumir la configuracion entregada por el host`);
    assert.match(text, /\.publishResult\(/u, `${path} debe publicar el resultado real`);
  }
});

test("CPT, Go/No-Go, Stroop y escucha dicotica evitan persistencia paralela", async () => {
  const cpt = await source("js/cpt.js");
  assert.match(cpt, /if \(adhdTaskMode\) \{\s*publicarResultadoAdhd\(resultadoActual\);\s*\} else \{\s*guardarResultadoLocal/u);
  assert.match(cpt, /if \(!practica\)/u);
  assert.match(cpt, /adhdResultPublished/u);

  const goNoGo = await source("js/go-nogo.js");
  assert.match(goNoGo, /if \(adhdTaskMode\) \{\s*publicarResultadoAdhd\(resultado\);\s*\} else \{\s*guardarResultadoLocal/u);
  assert.match(goNoGo, /if \(estado === "resultados"\) return;/u, "debe impedir finalizar/publicar dos veces");
  assert.match(goNoGo, /if \(!practica\)/u);

  const stroop = await source("js/stroop.js");
  assert.match(stroop, /if \(adhdTaskMode\) \{\s*publishAdhdResult\(stats\);\s*\} else \{\s*try \{\s*await saveSession/u);
  assert.match(stroop, /sin guardado paralelo/u);
  assert.match(stroop, /practiceAvailable: true/u, "Stroop debe declarar la practica real disponible");

  const dichotic = await source("js/escucha-dicotica.js");
  assert.match(dichotic, /if \(adhdTaskMode\) \{\s*publishAdhdResult\(result\);\s*\} else \{\s*saveLocal/u);
  assert.match(dichotic, /adhdResultPublished/u);
});

test("la practica TDAH es obligatoria, breve y queda fuera del resultado puntuable", async () => {
  const cpt = await source("js/cpt.js");
  assert.match(cpt, /if \(!esPractica && !adhdPracticeCompleted\) \{/u, "CPT debe redirigir cualquier inicio principal prematuro");
  assert.match(cpt, /btnSesion[\s\S]*?disabled[\s\S]*?!adhdPracticeCompleted/u, "CPT debe bloquear tambien el control de sesion");
  assert.match(cpt, /publishEvent\("practice_completed"/u);
  assert.match(cpt, /if \(!practica\) \{\s*if \(adhdTaskMode\)/u, "CPT no debe publicar ni guardar practica");
  assert.match(cpt, /\(!practica && performance\.now\(\) - inicioSesionPerf/u, "CPT debe completar todos los ensayos breves antes de habilitar la fase principal");

  const goNoGo = await source("js/go-nogo.js");
  assert.match(goNoGo, /if \(adhdTaskMode && !esPractica && !adhdPracticeCompleted\) \{/u, "Go\/No-Go debe redirigir cualquier inicio principal prematuro");
  assert.match(goNoGo, /sessionButton\?\.toggleAttribute\("disabled", !adhdPracticeCompleted\)/u, "Go\/No-Go debe bloquear tambien el control de sesion");
  assert.match(goNoGo, /practiceTrials: ensayos\.length/u);
  assert.match(goNoGo, /publishEvent\("practice_completed"/u);
  assert.match(goNoGo, /if \(!practica\) \{\s*if \(adhdTaskMode\)/u, "Go\/No-Go no debe publicar ni guardar practica");
  assert.match(goNoGo, /\(!practica && segundosTranscurridos\(\) >= config\.duracionSesion\)/u, "Go\/No-Go debe completar todos los ensayos breves antes de habilitar la fase principal");

  const stroop = await source("js/stroop.js");
  assert.match(stroop, /startSessionPhase\(adhdTaskMode && !adhdPracticeCompleted\)/u, "Stroop debe iniciar practica antes de la aplicacion");
  assert.match(stroop, /totalTrials: 6/u, "Stroop debe usar una practica corta de seis ensayos");
  assert.match(stroop, /if \(adhdTaskMode && stroopPracticeMode\) \{[\s\S]*?practice_completed[\s\S]*?return;/u, "Stroop debe cerrar la practica antes de renderizar o publicar resultados");
  assert.match(stroop, /practice: Boolean\(isPractice\)/u);
  assert.match(stroop, /adhdBridgeMode === "assessment" && !stroopPracticeMode/u,
    "la aplicación puntuable de evaluación no debe mostrar acierto/error ensayo a ensayo");
  assert.match(stroop, /adhdBridgeMode = launchConfig\.mode \|\| adhdBridgeMode/u,
    "Stroop debe consumir el modo autenticado recibido por CONFIG");
  assert.match(stroop, /liveAccuracy\.textContent = suppressScoredAssessmentFeedback\(\) \? "—"/u,
    "la precisión acumulada tampoco debe revelarse durante la aplicación de evaluación");

  const nback = await source("nback.html");
  assert.match(nback, /if \(nbackAdhdTaskMode && modo !== "practica" && !adhdPracticeCompleted\) modo = "practica";/u, "N-Back debe proteger la entrada central, no solo el boton");
  assert.match(nback, /btnEvaluacionNback[\s\S]*?disabled[\s\S]*?!adhdPracticeCompleted/u, "N-Back debe bloquear el control puntuable hasta completar practica");
  assert.match(nback, /publishEvent\("practice_completed"/u);
  assert.match(nback, /if \(nbackAdhdTaskMode && !modoPractica && !resultadoAdhdPublicado/u, "N-Back solo debe publicar la fase principal");

  const dichotic = await source("js/escucha-dicotica.js");
  assert.match(dichotic, /if \(adhdTaskMode && !adhdPracticeCompleted\) \{[\s\S]*?startPractice\(\);\s*return;/u, "escucha dicotica debe exigir su practica ya existente");
  assert.match(dichotic, /if \(isPractice\) \{[\s\S]*?practice_completed[\s\S]*?return;/u, "escucha dicotica no debe llevar practica a finishSession");
  assert.match(dichotic, /const practiceTrialIds = adhdTaskMode[\s\S]*?\.map\(\(pair\) => pair\.trialId\)/u, "escucha dicotica debe reservar IDs reales del corpus para practica");
  assert.match(dichotic, /\.filter\(\(pair\) => !practiceTrialIds\.has\(pair\.trialId\)\)/u, "escucha dicotica debe excluir del main todos los IDs usados en practica");
  assert.match(dichotic, /practiceMaterialExcludedFromMain: true/u, "la reduccion fuente-segura del corpus debe quedar en configuracion");
  assert.match(dichotic, /practicePairs\.length < ADHD_DICHOTIC_PRACTICE_TRIAL_COUNT/u, "debe bloquear si faltan pares fuente-seguros para practicar");

  const corpus = JSON.parse(await source("data/rehabilitacion/escucha-dicotica-pares.json"));
  const practiceIds = new Set(corpus.pairs.slice(0, 6).map((pair) => pair.trialId));
  const mainIds = corpus.pairs.filter((pair) => !practiceIds.has(pair.trialId)).map((pair) => pair.trialId);
  assert.equal(practiceIds.size, 6, "la practica debe reservar seis IDs unicos de fuente");
  assert.ok(mainIds.length > 0, "debe quedar material de fuente para la fase principal");
  assert.ok(mainIds.every((trialId) => !practiceIds.has(trialId)), "practica y main deben ser disjuntos por ID de corpus");
});

test("las formas longitudinales publican configuracion y control de secuencia real", async () => {
  const cpt = await source("js/cpt.js");
  assert.match(cpt, /randomSeed: semillaSesion/u);
  assert.match(cpt, /configuration: config/u);
  assert.match(cpt, /generarSecuenciaCpt\([\s\S]*?semillaSesion\)/u);
  assert.match(cpt, /namespace\.endsWith\(":main"\)/u);

  const goNoGo = await source("js/go-nogo.js");
  assert.match(goNoGo, /createSeededRandom\(semillaSesion\)/u);
  assert.match(goNoGo, /crearEnsayos\([\s\S]*?randomSesion\)/u);
  assert.match(goNoGo, /randomSeed: semillaSesion/u);

  const stroop = await source("js/stroop.js");
  assert.match(stroop, /createSeededRandom\(sessionSeed\)/u);
  assert.match(stroop, /randomSeed: sessionSeed/u);
  assert.match(stroop, /configuration: \{ \.\.\.config/u);

  const nback = await source("nback.html");
  assert.match(nback, /randomSesionNback\(\)/u);
  assert.match(nback, /randomSeed: semillaSesionNback/u);
  assert.match(nback, /configuration: \{/u);

  const dichotic = await source("js/escucha-dicotica.js");
  assert.match(dichotic, /sequenceControl: "corpus_order"/u);
  assert.match(dichotic, /alternativeFormsBySeed: false/u);
  assert.match(dichotic, /randomSeed: null/u);
  assert.match(dichotic, /normalized\.randomSeed = null/u, "no debe atribuir la semilla longitudinal a un orden que no la consume");
});

test("N-Back usa reloj monotono, practica separada y resultado estructurado", async () => {
  const html = await source("nback.html");
  assert.doesNotMatch(html, /Date\.now\(\) - inicioEstimulo/u);
  assert.match(html, /performance\.now\(\) - inicioEstimulo/u);
  assert.match(html, /practice: modoPractica/u);
  assert.match(html, /if \(nbackAdhdTaskMode && !modoPractica/u);
  assert.match(html, /trialHistory: historialEnsayos/u);
  assert.match(html, /audioResponseType:/u);
  assert.match(html, /visualResponseType:/u);

  const classicMatch = html.match(/<script>\s*([\s\S]*?)<\/script>/u);
  assert.ok(classicMatch, "debe existir el script clasico de N-Back");
  assert.doesNotThrow(() => new Script(classicMatch[1], { filename: "nback.inline.js" }));

  const moduleMatch = html.match(/<script type="module">\s*([\s\S]*?parseExistingTaskContext[\s\S]*?)<\/script>/u);
  assert.ok(moduleMatch, "debe existir el inicializador modular del puente");
  assert.match(moduleMatch[1], /await Promise\.all\(\[/u, "el puente debe cargarse solo dentro del modo TDAH");
  assert.doesNotThrow(() => new Script(`(async () => {${moduleMatch[1]}})();`, { filename: "nback.bridge.inline.js" }));
});
