import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/admin.css", import.meta.url), "utf8");
const functions = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

test("las solicitudes de eliminación de nota muestran una acción y confirmación específicas", () => {
  assert.match(js, /reporte\.recursoTipo === "nota_medica" && reporte\.pacienteUid && reporte\.recursoId/);
  assert.match(js, /🗑 Eliminar nota/);
  assert.match(js, /eliminarNotaDesdeSolicitudAdmin/);
  assert.match(html, /id="dialogoEliminarNotaAdmin"/);
  assert.match(html, /data-confirmar-eliminacion-nota/);
  assert.match(html, /Eliminar definitivamente/);
  assert.match(css, /\.boton-eliminar-nota-solicitud/);
});

test("el cliente exige administrador y delega la eliminación de la nota al backend", () => {
  const inicio = js.indexOf("window.eliminarNotaDesdeSolicitudAdmin");
  const fin = js.indexOf("function opcionEstadoReporte", inicio);
  const flujo = js.slice(inicio, fin);
  assert.ok(inicio > -1 && fin > inicio);
  assert.match(flujo, /usuarioPuedeAccederAdmin\(adminActual\)/);
  assert.match(flujo, /httpsCallable\(await obtenerFunctions\(\), "eliminarNotaDesdeSolicitud"\)/);
  assert.match(flujo, /await eliminar\(\{ solicitudId \}\)/);
  assert.match(flujo, /reportesUsuariosAdmin = reportesUsuariosAdmin\.filter/);
  assert.match(flujo, /Nota eliminada correctamente/);
  assert.doesNotMatch(flujo, /deleteDoc\(|updateDoc\(|setDoc\(/);
});

test("el backend valida solicitud, administrador, paciente y ruta permitida antes de borrar", () => {
  const inicio = functions.indexOf("exports.eliminarNotaDesdeSolicitud");
  const fin = functions.indexOf("exports.actualizarReconocimientoColaborador", inicio);
  const flujo = functions.slice(inicio, fin);
  assert.ok(inicio > -1 && fin > inicio);
  assert.match(functions, /RAICES_NOTA_VALIDAS = new Set\(\["usuarios", "pacientes", "root"\]\)/);
  assert.match(functions, /COLECCIONES_NOTA_VALIDAS = new Set\(\["notasMedicas", "notas", "notasClinicas"\]\)/);
  assert.match(functions, /uidPaciente\.includes\("\/"\)/);
  assert.match(flujo, /if \(!request\.auth\?\.uid\)/);
  assert.match(flujo, /datosUsuarioEsAdmin\(adminSnap\.data\(\)\)/);
  assert.match(flujo, /solicitud\.recursoTipo !== "nota_medica"/);
  assert.match(flujo, /resolverReferenciaNotaSolicitud\(uidPaciente, recursoId\)/);
  assert.match(flujo, /notaRaizPertenecePaciente\(notaSnap\.data\(\), uidPaciente\)/);
  assert.match(flujo, /eliminarSubcoleccionesNota\(notaObjetivo\.referencia\)/);
  assert.match(flujo, /batch\.delete\(notaObjetivo\.referencia\)/);
  assert.match(flujo, /batch\.delete\(solicitudRef\)/);
  assert.match(flujo, /Nota médica eliminada definitivamente/);
  assert.match(flujo, /await batch\.commit\(\)/);
});
