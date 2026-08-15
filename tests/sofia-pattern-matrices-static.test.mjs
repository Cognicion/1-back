import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("el backend expone solo el recálculo administrativo de matrices", async () => {
  const [index, handlers] = await Promise.all([
    source("functions/index.js"),
    source("functions/clinicalAnalytics/handlers.js")
  ]);
  assert.match(index, /exports\.rebuildClinicalPatternMatricesAdmin\s*=\s*onCall/);
  assert.match(handlers, /await assertAdmin\(request, db\)/);
  assert.match(handlers, /no se publicaron matrices parciales/i);
  assert.doesNotMatch(index, /onCall\([^)]*patientProfiles/i);
});

test("el panel usa Cloud Functions y no consulta perfiles por paciente", async () => {
  const [controller, admin, html] = await Promise.all([
    source("js/admin/clinicalKnowledge/clinicalKnowledgeController.js"),
    source("js/admin.js"),
    source("admin.html")
  ]);
  assert.match(controller, /httpsCallable\(functions, "rebuildClinicalPatternMatricesAdmin"\)/);
  assert.match(controller, /httpsCallable\(functions, "getClinicalKnowledgeAdmin"\)/);
  assert.doesNotMatch(controller, /clinicalAnalyticsPatientProfiles|analyticsPatientId|patientId/);
  assert.match(controller, /Interpretación posible/);
  assert.match(controller, /function variableLabel/);
  assert.match(controller, /effectMetricLabel/);
  assert.match(controller, /no implica causalidad/i);
  assert.match(admin, /clinicalKnowledgeController\.js\?v=20260814-correlaciones-es-v2/);
  assert.match(html, /css\/admin\.css\?v=20260814-correlaciones-es-v2/);
  assert.match(html, /js\/admin\.js\?v=20260814-correlaciones-es-v2/);
});

test("las matrices aplican tipado, privacidad y corrección múltiple", async () => {
  const engine = await source("functions/clinicalAnalytics/matrixEngine.js");
  assert.match(engine, /pearson_spearman/);
  assert.match(engine, /point_biserial/);
  assert.match(engine, /cramers_v/);
  assert.match(engine, /eta_squared/);
  assert.match(engine, /benjamini_hochberg/);
  assert.match(engine, /fisher_z/);
  assert.match(engine, /pearsonSpearmanConcordance/);
  assert.match(engine, /coverageRate/);
  assert.match(engine, /privacySuppressed/);
  assert.match(engine, /nonCausal:\s*true/);
});
