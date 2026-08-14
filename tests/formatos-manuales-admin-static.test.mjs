import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");

test("el Centro de Control expone creación manual de formatos y paquetes", () => {
  assert.match(html, /formCrearFormatoManualAdmin/);
  assert.match(html, /formatoManualLogo/);
  assert.match(html, /formCrearPaqueteFormatosAdmin/);
  assert.match(html, /paqueteFormatoFormatos/);
  assert.match(html, /paqueteFormatoUsuarios/);
  assert.match(html, /formatoVisualLienzo/);
  assert.match(html, /data-agregar-seccion-formato="texto"/);
  assert.match(html, /data-agregar-seccion-formato="campos"/);
  assert.match(html, /data-agregar-seccion-formato="tabla"/);
});

test("los formatos manuales guardan logo y los paquetes se asignan explícitamente", () => {
  assert.match(js, /formatosAdministrados/);
  assert.match(js, /paquetesFormatos/);
  assert.match(js, /uploadBytes/);
  assert.match(js, /getDownloadURL/);
  assert.match(js, /formatosManualesAsignados/);
  assert.match(js, /paquetesFormatosAsignados/);
  assert.match(js, /crear_formato_manual_admin/);
  assert.match(js, /crear_paquete_formatos_admin/);
  assert.match(js, /usuarioPuedeAccederAdmin\(adminActual\)/);
  assert.match(js, /configurarCreadorVisualFormatosAdmin/);
  assert.match(js, /pointerdown/);
  assert.match(js, /formatoVisualEstado\.logo\.x/);
  assert.match(js, /disenoVisual/);
  assert.match(js, /agregar-fila/);
  assert.match(js, /agregar-columna/);
});
