import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const usuariosSource = await readFile(new URL("../js/services/usuarios.js", import.meta.url), "utf8");
const medicoSource = await readFile(new URL("../js/medico.js", import.meta.url), "utf8");
const medicoHtml = await readFile(new URL("../medico.html", import.meta.url), "utf8");

test("una consulta opcional de permisos no cancela la lista principal de pacientes", () => {
  const funcion = usuariosSource.match(
    /async function listarPacientesSinCache\(uidMedico = ""\)\{[\s\S]*?\n\}/
  )?.[0] || "";
  const indiceConsultasPrincipales = funcion.indexOf("const resultados = await Promise.allSettled");
  const indiceProcesamiento = funcion.indexOf("resultados.forEach");
  const indiceConsultaPermisos = funcion.indexOf("collectionGroup(db, \"permisosMedicos\")");
  const bloquePermisos = funcion.slice(funcion.lastIndexOf("try {", indiceConsultaPermisos), indiceConsultaPermisos);

  assert.ok(indiceConsultasPrincipales >= 0, "deben mantenerse las consultas autorizadas principales");
  assert.ok(indiceProcesamiento > indiceConsultasPrincipales, "los resultados principales deben procesarse primero");
  assert.ok(indiceConsultaPermisos > indiceProcesamiento, "la consulta opcional debe ejecutarse después");
  assert.match(bloquePermisos, /try \{/, "la consulta opcional debe estar protegida contra fallos síncronos y asíncronos");
  assert.doesNotMatch(funcion, /const permisosPendientes\s*=\s*getDocs/);
});

test("el Panel Médico invalida las versiones defectuosas en todos los navegadores", () => {
  assert.match(medicoSource, /usuarios\.js\?v=20260816-expedientes-cognicion-v1/);
  assert.match(medicoHtml, /medico\.js\?v=20260816-expedientes-cognicion-v1/);
});
