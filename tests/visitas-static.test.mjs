import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(new URL("../js/services/visitas.js", import.meta.url), "utf8");
const bootstrap = fs.readFileSync(new URL("../js/services/visitasBootstrap.js", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");

test("visitas conserva una identidad local y permite asociar la cuenta", () => {
  assert.match(service, /CLAVE_VISITANTE_COGNICION/);
  assert.match(service, /localStorage\?\.setItem/);
  assert.match(service, /usuarioUid/);
  assert.match(service, /tipo: esRegistrado \? "registrado" : "invitado"/);
  assert.match(service, /setDoc\(referencia/);
});

test("el Centro de Control consolida visitantes por identidad", () => {
  assert.match(admin, /collection\(db, "visitas"\)/);
  assert.match(admin, /consolidarVisitasAdmin/);
  assert.match(admin, /usuario:\$\{visita\.usuarioUid\}/);
  assert.match(admin, /totalVisitasInvitados/);
  assert.match(admin, /totalVisitasRegistrados/);
  assert.match(admin, /visita\.nombre/);
});

test("el bootstrap actualiza el nombre al autenticarse", () => {
  assert.match(bootstrap, /onAuthStateChanged/);
  assert.match(bootstrap, /obtenerUsuario/);
  assert.match(bootstrap, /registrarVisita\(\{ usuario, perfil \}\)/);
});
