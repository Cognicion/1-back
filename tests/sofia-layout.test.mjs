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

  assert.match(html, /css\/sofia\.css\?v=20260828-sofia-layout-v1/);
  assert.match(html, /css\/clinical-analysis\.css\?v=20260828-sofia-layout-v1/);
  assert.match(sofiaCss, /\.sofia-grid\s*\{[^}]*align-items:\s*start/s);
  assert.match(clinicalCss, /\.clinical-analysis-panel\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("las colecciones extensas permanecen legibles y accesibles", async () => {
  const css = await read("css/clinical-analysis.css");

  assert.match(css, /grid-template-columns:\s*repeat\(3,minmax\(260px,1fr\)\)/);
  assert.match(css, /\.clinical-analysis-grid ul\s*\{[^}]*max-height:[^;]+;[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:960px\)[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:600px\)[\s\S]*grid-template-columns:1fr/);
});
