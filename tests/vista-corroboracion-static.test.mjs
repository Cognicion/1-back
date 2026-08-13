import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/admin.css", import.meta.url), "utf8");

test("la vista de corroboración es visible y solo lectura", () => {
  assert.match(html, /Vista de corroboración administrativa · Solo lectura/);
  assert.match(html, /data-cerrar-vista-corroboracion/);
  assert.match(js, /abrirVistaCorroboracionAdmin/);
  assert.match(js, /soloLectura: true/);
  assert.match(js, /consultar_datos_vista_corroboracion_admin/);
  const inicioVista = js.indexOf("window.abrirVistaCorroboracionAdmin");
  const finVista = js.indexOf("async function publicarAvisoAdmin", inicioVista);
  assert.doesNotMatch(js.slice(inicioVista, finVista), /deleteDoc|updateDoc|setDoc/);
  assert.match(css, /vista-corroboracion-banner/);
});

test("la lista de usuarios expone la acción de corroboración", () => {
  assert.match(js, /Vista de corroboración/);
  assert.match(js, /usuarioPuedeAccederAdmin\(adminActual\)/);
  assert.match(js, /uidUsuario === adminActual\?\.uid/);
});
