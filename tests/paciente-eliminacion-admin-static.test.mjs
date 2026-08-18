import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
const functions = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

function flujoEntre(texto, inicioTexto, finTexto) {
  const inicio = texto.indexOf(inicioTexto);
  const fin = texto.indexOf(finTexto, inicio);
  assert.ok(inicio > -1 && fin > inicio, `No se encontró el flujo ${inicioTexto}`);
  return texto.slice(inicio, fin);
}

test("el cliente bloquea dobles envíos y confirma el resultado antes de refrescar listas", () => {
  const flujo = flujoEntre(js, "window.eliminarPacienteDesdeSolicitudAdmin", "window.eliminarNotaDesdeSolicitudAdmin");
  assert.match(js, /const eliminacionesPacientesEnCurso = new Set\(\)/);
  assert.match(js, /data-eliminar-paciente-solicitud/);
  assert.match(flujo, /eliminacionesPacientesEnCurso\.has\(solicitudId\)/);
  assert.match(js, /TIEMPO_MAXIMO_ELIMINACION_PACIENTE_MS = 10 \* 60 \* 1000/);
  assert.match(flujo, /"eliminarPacienteDefinitivamente",\s*\{ timeout: TIEMPO_MAXIMO_ELIMINACION_PACIENTE_MS \}/);
  assert.match(flujo, /Eliminando paciente y archivos…/);
  assert.match(flujo, /Paciente eliminado correctamente/);
  assert.match(flujo, /Promise\.allSettled/);
  assert.match(flujo, /functions\/already-exists/);
  assert.match(html, /js\/admin\.js\?v=20260818-patient-deletion-timeout-v1/);
});

test("el backend amplía el tiempo y evita el recorrido secuencial que agotaba 60 segundos", () => {
  const flujo = flujoEntre(functions, "async function eliminarDocumentosRelacionadosEnColecciones", "async function eliminarAuditoriaPaciente");
  assert.match(functions, /timeoutSeconds: 540/);
  assert.match(functions, /memory: "1GiB"/);
  assert.match(functions, /CONCURRENCIA_ELIMINACION_PACIENTE = 20/);
  assert.match(functions, /onCall\(OPCIONES_ELIMINACION_PACIENTE, async \(request\)/);
  assert.match(flujo, /coleccion\.get\(\)/);
  assert.match(flujo, /Promise\.all\(snapshot\.docs\.map/);
  assert.doesNotMatch(flujo, /listDocuments\(\)/);
  assert.doesNotMatch(flujo, /for \(const ref/);
});

test("el borrado conserva la solicitud durante el proceso y limpia datos, Storage, Auth y auditoría", () => {
  const flujo = flujoEntre(functions, "exports.eliminarPacienteDefinitivamente", "exports.eliminarNotaDesdeSolicitud");
  assert.ok(flujo.indexOf("datosUsuarioEsAdmin(adminSnap.data())") < flujo.indexOf("reclamarSolicitudEliminacionPaciente"));
  assert.match(flujo, /uidPaciente\.includes\("\/"\)/);
  assert.match(flujo, /solicitudId\.includes\("\/"\)/);
  assert.match(functions, /autoPaginate: false/);
  assert.match(functions, /maxResults: TAMANO_PAGINA_STORAGE_ELIMINACION/);
  assert.match(functions, /admin\.auth\(\)\.deleteUser\(uidPaciente\)/);
  assert.match(functions, /reclamarSolicitudEliminacionPaciente/);
  assert.match(functions, /estado: "procesando_eliminacion"/);
  assert.match(flujo, /rutasPreservadas: new Set\(\[solicitudRef\.path\]\)/);
  assert.match(flujo, /rehabilitacion_cognitiva/);
  assert.match(flujo, /eliminarAuditoriaPaciente\(uidPaciente, resumen\)/);
  assert.match(flujo, /batch\.delete\(solicitudRef\)/);
  assert.match(flujo, /Paciente eliminado definitivamente/);
  assert.match(flujo, /estado: "error_eliminacion"/);
  assert.match(flujo, /solicitud quedó disponible para reintentar/);
  assert.match(functions, /completarOperacionesEliminacion/);
});
