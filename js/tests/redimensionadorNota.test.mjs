import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [notaJs, componente, estilos, html] = await Promise.all([
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../components/redimensionadorCampos.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/nota.css", import.meta.url), "utf8"),
  readFile(new URL("../../nota.html", import.meta.url), "utf8")
]);

test("los cuatro apartados narrativos usan el redimensionador compartido", () => {
  for (const campoId of ["subjetivo", "objetivo", "obsExploracionFisicaNeurologica", "analisis"]) {
    assert.match(notaJs, new RegExp(`"${campoId}"`));
    assert.match(html, new RegExp(`<textarea id="${campoId}"`));
  }
});

test("los textarea permiten redimensionamiento vertical nativo", () => {
  const regla = estilos.match(/\.seccion-redimensionable-compartida textarea\s*\{[^}]+\}/)?.[0] || "";
  assert.match(regla, /resize:\s*vertical/);
  assert.match(regla, /overflow:\s*auto/);
  assert.match(regla, /max-height:\s*none/);
  assert.doesNotMatch(regla, /resize:\s*(?:none|both)/);
});

test("reiniciar libera la marca manual y el observador distingue cambios programáticos", () => {
  assert.match(componente, /delete contexto\.objetivo\.dataset\.manualResize/);
  assert.match(componente, /dataset\.resizeInitializing/);
  assert.match(componente, /new ResizeObserver/);
});

test("HTML invalida la caché de CSS y JS que contenía la regresión", () => {
  assert.match(html, /css\/nota\.css\?v=20260729-native-resize-v2/);
  assert.match(html, /js\/nota\.js\?v=20260811-diagnosticos-unificados-v1/);
  assert.match(notaJs, /redimensionadorCampos\.js\?v=20260729-native-resize-v2/);
});
