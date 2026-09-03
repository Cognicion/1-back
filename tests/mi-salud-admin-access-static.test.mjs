import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

test("Mi Salud usa la política de acceso para la vista previa administrativa", async () => {
  const codigo = await leer("js/mi-salud.js");
  const html = await leer("mi-salud.html");

  assert.match(codigo, /resolverAccesoMiSalud\(/);
  assert.match(codigo, /!acceso\.requiereRelacionClinica \|\| await medicoPuedeVer/);
  assert.doesNotMatch(codigo, /!usuarioEsPersonalClinico\(datos\.rol\)/);
  assert.match(html, /js\/mi-salud\.js\?v=20260902-mi-salud-admin-access-v1/);
});
