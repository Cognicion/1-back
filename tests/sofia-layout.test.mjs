import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("el análisis de SOFÍA usa todo el ancho y no estira los paneles vecinos", async () => {
  const [html, sofiaCss, clinicalCss] = await Promise.all([
    read("sofia.html"),
    read("css/sofia.css"),
    read("css/clinical-analysis.css")
  ]);

  assert.match(html, /css\/sofia\.css\?v=20260828-sofia-report-layout-v1/);
  assert.match(html, /css\/clinical-analysis\.css\?v=20260828-sofia-report-layout-v1/);
  assert.match(sofiaCss, /\.sofia-grid\s*\{[^}]*align-items:\s*start/s);
  assert.match(sofiaCss, /\.sofia-panel\s*\{[^}]*background:\s*transparent/s);
  assert.match(clinicalCss, /\.clinical-analysis-panel\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("las colecciones extensas permanecen legibles y accesibles", async () => {
  const css = await read("css/clinical-analysis.css");

  assert.match(css, /\.clinical-analysis-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/s);
  assert.match(css, /\.clinical-analysis-grid ul\s*\{[^}]*max-height:none;[^}]*overflow:visible/s);
  assert.match(css, /\.clinical-analysis-grid article\s*\{[^}]*background:transparent/s);
  assert.match(css, /@media\s*\(max-width:600px\)[\s\S]*\.clinical-analysis-summary\s*\{[^}]*grid-template-columns:1fr/s);
});

test("el selector de paciente de SOFÍA filtra coincidencias sin exponer una lista nativa completa", async () => {
  const [html, script, css] = await Promise.all([
    read("sofia.html"),
    read("js/sofia.js"),
    read("css/sofia.css")
  ]);

  assert.match(html, /id="buscarPacienteSofia"[^>]*type="search"/);
  assert.match(html, /id="resultadosPacientesSofia"[^>]*role="listbox"/);
  assert.match(html, /id="selectorPacienteSofia" type="hidden"/);
  assert.match(script, /function coincidenciasPacientes\(query = ""\)/);
  assert.match(script, /normalizarBusquedaPaciente\(patient\.label\)\.includes\(termino\)/);
  assert.match(script, /listAuthorizedSofiaPatients\(\)/);
  assert.match(css, /\.sofia-patient-results\s*\{/);
});
