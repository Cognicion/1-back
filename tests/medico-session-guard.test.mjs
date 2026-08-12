import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const medicoSource = await readFile(new URL("../js/medico.js", import.meta.url), "utf8");
const medicoHtml = await readFile(new URL("../medico.html", import.meta.url), "utf8");

test("el panel médico no cierra una sesión válida por errores de carga", () => {
  const cierresSesion = medicoSource.match(/auth\.signOut\(\)/g) || [];
  const manejadorErrorInicializacion = medicoSource.match(
    /inicializarPanelMedico\(\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);/
  )?.[0] || "";
  const bloquePerfilAusente = medicoSource.match(
    /if \(!datos\) \{[\s\S]*?return false;\s*\}/
  )?.[0] || "";

  assert.equal(cierresSesion.length, 1, "signOut debe reservarse para el botón de cerrar sesión");
  assert.match(
    medicoSource,
    /inicializarCierreSesionMedico[\s\S]*?auth\.signOut\(\)/,
    "el cierre explícito de sesión debe mantenerse"
  );
  assert.doesNotMatch(
    manejadorErrorInicializacion,
    /window\.location\.href\s*=\s*["']login\.html["']/,
    "un error de inicialización no debe enviar al login"
  );
  assert.doesNotMatch(
    bloquePerfilAusente,
    /auth\.signOut\(\)/,
    "la ausencia temporal del perfil no debe cerrar sesión"
  );
});

test("el panel reintenta la lectura del perfil sin usar caché", () => {
  assert.match(
    medicoSource,
    /obtenerPerfilMedicoConReintento\(user\.uid\)/,
    "la inicialización debe usar la lectura tolerante a fallos"
  );
  assert.match(
    medicoSource,
    /return getUserProfileOnce\(uid, \{ force: true \}\)/,
    "debe forzar una lectura fresca cuando el perfil inicial no está disponible"
  );
});

test("medico.html invalida la versión anterior del script", () => {
  assert.match(medicoHtml, /js\/medico\.js\?v=20260811-session-guard-v1/);
  assert.doesNotMatch(medicoHtml, /js\/medico\.js\?v=1\.866/);
});
