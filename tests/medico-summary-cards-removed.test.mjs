import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, script, styles] = await Promise.all([
  readFile(new URL("medico.html", root), "utf8"),
  readFile(new URL("js/medico.js", root), "utf8"),
  readFile(new URL("css/medico.css", root), "utf8")
]);

test("el Panel Médico no renderiza las cuatro tarjetas de resumen", () => {
  for (const id of ["totalPacientes", "pacientesActivos", "pacientesPendientes", "expedientesHoy"]) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`));
    assert.doesNotMatch(script, new RegExp(`getElementById\\(["']${id}["']\\)`));
  }

  assert.doesNotMatch(html, /class=["'][^"']*\bestadisticas\b/);
  assert.doesNotMatch(styles, /^\.estadisticas\b/m);
  assert.doesNotMatch(styles, /^\.stat\b/m);
  assert.doesNotMatch(script, /calcularEstadisticas\s*\(/);
});

test("medico.html fuerza la carga de los recursos actualizados", () => {
  assert.match(html, /css\/medico\.css\?v=2\.121/);
  assert.match(html, /js\/medico\.js\?v=2\.121/);
});
