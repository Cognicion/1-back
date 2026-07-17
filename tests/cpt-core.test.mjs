import assert from "node:assert/strict";
import {
  calcularMetricasCpt,
  cerrarEnsayoCpt,
  ensayosCptACsv,
  generarSecuenciaCpt,
  normalizarConfigCpt
} from "../js/cpt-core.js";

const config = normalizarConfigCpt({
  totalTrials: 40,
  targetPercentage: 20,
  stimulusIntervalMs: 1000,
  stimulusVisibleMs: 500,
  degradationLevel: 40,
  modality: "degraded",
  minimumValidLatencyMs: 120
});

const secuencia = generarSecuenciaCpt(config, 12345);
assert.equal(secuencia.length, 40);
assert.ok(secuencia.some((t) => t.stimulus === 0 && t.isTarget));
assert.ok(secuencia.every((t) => t.stimulus === 0 ? t.isTarget : !t.isTarget));
assert.ok(secuencia.every((t) => t.stimulus >= 0 && t.stimulus <= 9));
assert.ok(secuencia.every((t) => t.visualNoiseLevel === 40));
assert.equal(new Set(secuencia.map((t) => t.visualNoiseSeed)).size, secuencia.length);
assert.ok(!secuencia.some((t, i, arr) => t.stimulus === 0 && arr[i - 1]?.stimulus === 0 && arr[i - 2]?.stimulus === 0));

const hit = cerrarEnsayoCpt({ trialIndex: 1, stimulus: 0, isTarget: true, responded: true, reactionTimeMs: 250, validForMetrics: true }, config);
const miss = cerrarEnsayoCpt({ trialIndex: 2, stimulus: 0, isTarget: true, responded: false, reactionTimeMs: null, validForMetrics: true }, config);
const fa = cerrarEnsayoCpt({ trialIndex: 3, stimulus: 7, isTarget: false, responded: true, reactionTimeMs: 310, validForMetrics: true }, config);
const cr = cerrarEnsayoCpt({ trialIndex: 4, stimulus: 4, isTarget: false, responded: false, reactionTimeMs: null, validForMetrics: true }, config);
const ant = cerrarEnsayoCpt({ trialIndex: 5, stimulus: 0, isTarget: true, responded: true, reactionTimeMs: 60, validForMetrics: true }, config);
const antBeforeStimulus = cerrarEnsayoCpt({ trialIndex: 6, stimulus: 0, isTarget: true, responded: true, reactionTimeMs: null, validForMetrics: true }, config);

assert.equal(hit.responseType, "hit");
assert.equal(miss.responseType, "miss");
assert.equal(fa.responseType, "false_alarm");
assert.equal(cr.responseType, "correct_rejection");
assert.equal(ant.responseType, "anticipatory");
assert.equal(antBeforeStimulus.responseType, "anticipatory");

const metrics = calcularMetricasCpt([hit, miss, fa, cr, ant], config, { actualDurationSeconds: 5 });
assert.equal(metrics.hits, 1);
assert.equal(metrics.misses, 1);
assert.equal(metrics.falseAlarms, 1);
assert.equal(metrics.correctRejections, 1);
assert.equal(metrics.anticipatoryResponses, 1);
assert.equal(metrics.hitRate, 1 / 3);
assert.equal(metrics.falseAlarmRate, 1 / 2);

const csv = ensayosCptACsv([hit, miss, fa, cr]);
assert.equal(csv.trim().split("\n").length, 5);
assert.ok(csv.includes("trialIndex,stimulus,isTarget"));

console.log("CPT core tests passed");
