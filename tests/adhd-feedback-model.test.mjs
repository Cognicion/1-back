import assert from "node:assert/strict";
import test from "node:test";

import { buildAdhdTaskFeedbackModel } from "../js/adhd/ui/adhdProgramView.js";

test("el feedback presenta métricas descriptivas y cambio intraindividual neutral", () => {
  const previous = {
    taskId: "cpt_x",
    metrics: { accuracy: 0.81, reactionTime: { meanMs: 540, coefficientOfVariation: 0.21 } }
  };
  const current = {
    taskId: "cpt_x",
    status: "completed",
    valid: true,
    metrics: { accuracy: 0.84, reactionTime: { meanMs: 512, coefficientOfVariation: 0.18 } }
  };
  const model = buildAdhdTaskFeedbackModel(current, previous);
  assert.deepEqual(model.items.map((item) => item.label), [
    "Precisión",
    "Tiempo de respuesta medio",
    "Variabilidad del RT (CV)"
  ]);
  assert.match(model.comparisonMessage, /\+3 puntos porcentuales/u);
  assert.match(model.comparisonMessage, /intraindividual/u);
  assert.doesNotMatch(JSON.stringify(model), /cerebro mejor|percentil \d/iu);
});

test("un Stop-Signal inválido no presenta SSRT como interpretable", () => {
  const model = buildAdhdTaskFeedbackModel({
    taskId: "stop_signal",
    status: "completed",
    valid: false,
    metrics: { valid: false, probabilityInhibit: 0.92, meanSsdMs: 410, ssrtMs: null }
  });
  assert.match(model.qualityMessage, /no interpretable/iu);
  assert.equal(model.items.some((item) => item.label.startsWith("SSRT")), false);
  assert.match(model.comparisonMessage, /Primera aplicación comparable/u);
});
