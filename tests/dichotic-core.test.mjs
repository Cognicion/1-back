import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  calculateDichoticMetrics,
  classifyDichoticResponse,
  dichoticTrialsToCsv,
  normalizeWord,
  scoreDichoticTrial,
  validateDichoticCorpus
} from "../js/dichotic/dichotic-core.js";

const trial = {
  trialId: "T1",
  blockNumber: 1,
  trialNumber: 1,
  leftWord: "Casa",
  rightWord: "Perro",
  leftAudio: "left.wav",
  rightAudio: "right.wav"
};

assert.equal(normalizeWord("  Pérro! "), "perro");
assert.equal(classifyDichoticResponse(trial, "perro").classification, "correct");
assert.equal(classifyDichoticResponse(trial, "casa").classification, "left_ear_intrusion");
assert.equal(classifyDichoticResponse(trial, "mesa").classification, "non_presented_word");
assert.equal(classifyDichoticResponse(trial, "").classification, "omission");
assert.equal(classifyDichoticResponse(trial, "perro casa").classification, "multiple_response");
assert.equal(classifyDichoticResponse(trial, "", { technicalFailure: true }).classification, "technical_failure");

const scored = [
  scoreDichoticTrial({ sessionId: "S1", trial, rawResponse: "perro" }),
  scoreDichoticTrial({ sessionId: "S1", trial: { ...trial, trialNumber: 2 }, rawResponse: "casa" }),
  scoreDichoticTrial({ sessionId: "S1", trial: { ...trial, trialNumber: 3 }, rawResponse: "mesa" }),
  scoreDichoticTrial({ sessionId: "S1", trial: { ...trial, trialNumber: 4 }, rawResponse: "" }),
  scoreDichoticTrial({ sessionId: "S1", trial: { ...trial, trialNumber: 5 }, rawResponse: "", scoring: { technicalFailure: true } })
];
const metrics = calculateDichoticMetrics(scored);
assert.equal(metrics.correctResponses, 1);
assert.equal(metrics.leftEarIntrusions, 1);
assert.equal(metrics.nonPresentedWords, 1);
assert.equal(metrics.omissions, 1);
assert.equal(metrics.technicalFailures, 1);
assert.equal(metrics.validTrials, 4);

const csv = dichoticTrialsToCsv(scored);
assert.equal(csv.trim().split("\n").length, scored.length + 1);
assert.ok(csv.includes("sessionId,trialNumber,blockNumber"));
assert.ok(csv.includes("speechTranscriptOriginal"));

const corpus = JSON.parse(await readFile(new URL("../data/rehabilitacion/escucha-dicotica-pares.json", import.meta.url), "utf8"));
const validation = validateDichoticCorpus(corpus);
assert.equal(validation.totalPairs, 120);
assert.equal(validation.ok, true);
assert.equal(validation.isProvisional, true);
assert.equal(validation.corpusType, "demo_provisional");
assert.equal(validation.clinicallyValidated, false);
assert.equal(validation.authorizedMaterial, false);
assert.equal(corpus.pairs.every((pair) => existsSync(pair.leftAudio) && existsSync(pair.rightAudio)), true);

console.log("Dichotic core tests passed");
