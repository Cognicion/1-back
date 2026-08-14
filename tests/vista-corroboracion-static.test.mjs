import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/admin.css", import.meta.url), "utf8");

test("la vista de corroboración es visible y solo lectura", () => {
  assert.match(html, /Vista previa administrativa de usuario · Solo lectura/);
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
  assert.match(js, /Ver como usuario · solo lectura/);
  assert.match(js, /usuarioPuedeAccederAdmin\(adminActual\)/);
  assert.match(js, /uidUsuario === adminActual\?\.uid/);
});

test("la vista previa representa la perspectiva del usuario sin suplantar la sesión", () => {
  assert.match(js, /function renderizarVistaPerspectivaUsuario/);
  assert.match(js, /function categoriaRolVistaPrevia/);
  assert.match(js, /function modulosVistaPreviaUsuario/);
  assert.match(js, /data-vista-previa-pagina="inicio"/);
  assert.match(js, /data-vista-previa-panel="perfil"/);
  assert.match(js, /data-vista-previa-panel="actividad"/);
  assert.match(js, /data-vista-previa-panel="formatos"/);
  assert.match(js, /Abrir · bloqueado en vista previa/);
  assert.match(js, /disabled aria-disabled="true"/);
  assert.match(js, /configurarNavegacionVistaPreviaUsuario\(contenido\)/);
  assert.match(js, /suplantacionSesion: false/);
  assert.match(css, /\.vista-previa-usuario-shell/);
  assert.match(css, /\.vista-previa-modulos-grid/);
});

test("el flujo de vista previa no contiene escrituras sobre la cuenta consultada", () => {
  const inicioVista = js.indexOf("function renderizarVistaPerspectivaUsuario");
  const finVista = js.indexOf("async function publicarAvisoAdmin", inicioVista);
  const flujoVista = js.slice(inicioVista, finVista);
  assert.ok(inicioVista > -1 && finVista > inicioVista);
  assert.doesNotMatch(flujoVista, /deleteDoc\(|updateDoc\(|setDoc\(/);
  assert.match(flujoVista, /registrarAuditoriaAdmin/);
});
