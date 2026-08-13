import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");

test("el Centro de Control expone acciones de duración y reactivación", () => {
  assert.match(html, /Ajusta la vigencia o reactiva un codigo/);
  assert.match(js, /Cambiar duración/);
  assert.match(js, /Reactivar código/);
  assert.match(js, /cambiarDuracionCodigoMedicoAdmin/);
  assert.match(js, /reactivarCodigoMedicoAdmin/);
});

test("las acciones de códigos exigen administrador y auditan cambios", () => {
  assert.match(js, /usuarioPuedeAccederAdmin\(adminActual\)/);
  assert.match(js, /cambiar_duracion_codigo_autorizacion_medico/);
  assert.match(js, /reactivar_codigo_autorizacion_medico/);
  assert.match(js, /usado: false/);
  assert.match(js, /usadoPorUid: ""/);
  assert.match(js, /duracionHoras: horas/);
});
