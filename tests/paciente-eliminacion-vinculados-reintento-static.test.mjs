import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

function sectionBetween(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `No se encontró la sección ${startText}`);
  return source.slice(start, end);
}

test("el borrado conserva y reutiliza los UID vinculados antes de eliminar cualquier raíz", () => {
  const persistence = sectionBetween(
    "async function persistirIdsExpedientesVinculados",
    "async function marcarExpedientesVinculadosParaEliminacion"
  );
  const marking = sectionBetween(
    "async function marcarExpedientesVinculadosParaEliminacion",
    "async function eliminarCuentaAutenticacionPaciente"
  );
  const deletion = sectionBetween(
    "exports.eliminarPacienteDefinitivamente",
    "exports.eliminarProfesionalDefinitivamente"
  );

  assert.match(persistence, /tombstone\.linkedOriginUids \|\| \[\]/);
  assert.match(persistence, /unirIdsExpedientesVinculados/);
  assert.match(persistence, /transaccion\.set\(accountDeletionRef, \{[\s\S]*linkedOriginUids/);
  assert.match(marking, /persistirIdsExpedientesVinculados\([\s\S]*accountDeletionRef/);
  assert.match(marking, /guardAccountRef: adminDb\.doc\(`usuarios\/\$\{linkedOriginUid\}`\)/);
  assert.ok(
    deletion.indexOf("marcarExpedientesVinculadosParaEliminacion(")
      < deletion.indexOf("eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${patientId}`))"),
    "los UID vinculados deben persistirse antes de borrar las raíces"
  );
  assert.match(deletion, /idsPaciente = \[uidPaciente, \.\.\.expedientesVinculados\.map/);
  assert.match(deletion, /expedientesVinculados\.forEach\(\(\{ tombstoneRef \}\) => batch\.set/);
});

test("la unión rechaza IDs no canónicos y elimina duplicados o el UID destino", () => {
  const union = sectionBetween(
    "function unirIdsExpedientesVinculados",
    "async function persistirIdsExpedientesVinculados"
  );

  assert.match(source, /PATRON_ID_DOCUMENTO_ELIMINACION = \/\^\[A-Za-z0-9_-\]\{1,160\}\$\/u/);
  assert.match(union, /new Set\(\[\.\.\.idsPersistidos, \.\.\.idsDescubiertos\]/);
  assert.match(union, /validarIdDocumentoEliminacion\(id, "Un expediente vinculado"\)/);
  assert.match(union, /filter\(\(id\) => id !== uidDestino\)/);
});
