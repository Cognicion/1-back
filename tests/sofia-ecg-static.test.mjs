import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("sofia.html carga y expone el panel ECG", async () => {
  const [html, appVersion] = await Promise.all([
    read("sofia.html"),
    read("js/config/appVersion.js")
  ]);
  assert.match(html, /id="electrocardiogramaSofiaSection"/);
  assert.match(html, /id="ecgSofia"/);
  assert.match(html, /Interpretación de electrocardiograma/);
  assert.match(html, /sofia\.js\?v=20260828-sofia-patient-search-report-layout-v1/);
  assert.match(html, /sofia\.css\?v=20260828-sofia-report-layout-v1/);
  assert.match(appVersion, /APP_VERSION\s*=\s*"2\.166"/);
});

test("SOFÍA comparte el resultado ECG con panel y chat sin escribir datos clínicos", async () => {
  const [sofia, pageTools, config, tools, orchestrator] = await Promise.all([
    read("js/sofia.js"),
    read("js/sofia/pageTools.js"),
    read("functions/sofiaOrchestrator/config.js"),
    read("functions/sofiaOrchestrator/toolRegistry.js"),
    read("functions/sofiaOrchestrator/orchestrator.js")
  ]);
  assert.match(sofia, /interpretPatientElectrocardiogram\(expedienteActual\)/);
  assert.match(sofia, /renderEcgInterpretation/);
  assert.match(sofia, /electrocardiogram:\s*electrocardiogram/);
  assert.match(pageTools, /electrocardiogram:\s*"ecgSofia"/);
  assert.match(config, /"electrocardiogram"/);
  assert.match(tools, /get_patient_electrocardiogram_interpretation/);
  assert.match(tools, /clinicalDecisionAllowed:\s*false/);
  assert.match(orchestrator, /no atribuyas causalidad/i);
  assert.match(orchestrator, /get_methodological_evidence.*electrocardiography/i);
  assert.match(orchestrator, /no recibi[oó] la imagen o señal de 12 derivaciones/i);
});

test("la vista conserva límites, tema claro y adaptación móvil", async () => {
  const [css, core] = await Promise.all([
    read("css/sofia.css"),
    read("js/clinical/ecg/ecgInterpretationCore.js")
  ]);
  assert.match(css, /\.ecg-analysis/);
  assert.match(css, /body\.tema-claro \.ecg-analysis__header/);
  assert.match(css, /\.ecg-context-grid \{ grid-template-columns: 1fr;/);
  assert.match(core, /waveformAvailable:\s*false/);
  assert.match(core, /clinicalWritesPerformed:\s*false/);
  assert.match(core, /unknownIsNotNormal:\s*true/);
  assert.match(core, /no se atribuye causalidad automática/i);
});
