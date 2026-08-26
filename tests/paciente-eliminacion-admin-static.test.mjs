import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
const functions = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
const cloudHandlers = fs.readFileSync(new URL("../functions/cloudStorage/handlers.js", import.meta.url), "utf8");

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
  assert.match(html, /js\/admin\.js\?v=20260826-cuenta-profesional-gratuita-v1/);
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
  assert.ok(
    flujo.indexOf("markAccountDeletion") < flujo.indexOf("eliminarCuentaAutenticacionPaciente(uidPaciente, resumen)"),
    "la marca de eliminación debe invalidar tokens residuales antes de borrar Auth"
  );
  assert.ok(
    flujo.indexOf("eliminarCuentaAutenticacionPaciente(uidPaciente, resumen)")
      < flujo.indexOf("eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${patientId}`))"),
    "Auth debe retirarse antes de borrar la raíz del paciente"
  );
  assert.ok(
    flujo.indexOf("eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${patientId}`))")
      < flujo.indexOf("releasePatientSlotsForPatient"),
    "la cuota se libera después de retirar la raíz accesible del paciente"
  );
  assert.match(js, /async function eliminarPacienteMedianteBackend/);
  assert.match(js, /motivoSolicitud: "Eliminación directa confirmada desde el panel administrativo\."/);
  assert.match(js, /"eliminarPacienteDefinitivamente",\s*\{ timeout: TIEMPO_MAXIMO_ELIMINACION_PACIENTE_MS \}/);
  assert.doesNotMatch(js, /async function eliminarPacienteConSubcolecciones/);
  assert.match(js, /httpsCallable\(await obtenerFunctions\(\), "eliminarProfesionalDefinitivamente"\)/);
  assert.match(js, /usuarioEsPersonalClinico\(usuario\.rol \|\| usuario\.role \|\| usuario\.tipoRol \|\| ""\)/);
  assert.match(functions, /exports\.eliminarProfesionalDefinitivamente = onCall/);
  assert.match(functions, /function datosUsuarioEsProfesionalClinico/);
  assert.match(functions, /datosUsuarioEsAdmin\(datos\) \|\| isPatient\(datos\)/);
  assert.match(functions, /deletionState: "completed"/);
  assert.match(functions, /const resumableDeletion = deletionSnapshot\.exists/);
  assert.match(functions, /asegurarProfesionalSinExpedientesProvisionales\(professionalUid\)/);
  assert.match(functions, /asegurarProfesionalSinVinculacionesActivas\(professionalUid\)/);
  assert.match(functions, /eliminarArchivosPaciente\(professionalUid, resumen\)/);
  assert.match(functions, /limpiarReferenciasProfesional\(professionalUid, resumen\)/);
  assert.match(functions, /eliminarDocumentoYDescendientes\(adminDb\.doc\(`usuarios\/\$\{professionalUid\}`\)\)/);
  assert.ok(
    flujo.indexOf("beginAccountDeletionPreflight({")
      < flujo.indexOf("asegurarProfesionalSinExpedientesProvisionales(professionalUid)"),
    "el borrado profesional debe cerrar nuevas altas antes de revisar expedientes provisionales"
  );
  assert.match(flujo, /cancelAccountDeletionPreflight\(\{[\s\S]{0,250}attemptId: deletionAttemptId/);
});

test("los tokens residuales no alcanzan IA, analítica ni notas después de iniciar un borrado", () => {
  const guard = flujoEntre(functions, "async function asegurarCuentaCallableActiva", "function crearLimitadorConcurrencia");
  assert.match(guard, /accountDeletionTombstones\/\$\{uid\}/);
  assert.match(guard, /if \(deletionSnapshot\.exists\)/);
  assert.match(guard, /if \(!profileSnapshot\.exists\)/);
  assert.match(guard, /profile\.activo === false/);
  assert.match(guard, /profile\.active === false/);
  for (const callable of [
    "discoverTextPatterns",
    "analyzePatientClinicalContext",
    "chatSofiaUnified",
    "chatSofia",
    "segmentClinicalConversation",
    "generateStructuredNoteFromDictation"
  ]) {
    assert.match(
      functions,
      new RegExp(`exports\\.${callable} = onCall\\([\\s\\S]{0,500}conCuentaCallableActiva`),
      `${callable} debe usar el guard de cuenta activa`
    );
  }
  assert.match(functions, /exports\.eliminarNotaDesdeSolicitud = onCall\(async \(request\) => \{[\s\S]{0,250}await asegurarCuentaCallableActiva\(request\)/);
});

test("Mi nube distingue el preflight reversible del borrado destructivo y filtra eventos tardíos", () => {
  assert.match(cloudHandlers, /cleanupAllowed: phase !== "preflight"/);
  assert.match(cloudHandlers, /if \(!deletionStatus\.active && deletionStatus\.cleanupAllowed\)/);
  assert.match(cloudHandlers, /usuarios\\\/\(\[\^\/\]\+\)\\\/perfil\\\/foto-perfil/);
  assert.match(cloudHandlers, /const cloudFileFinalized = onObjectFinalized[\s\S]{0,500}accountDeletionStatus\(target\.uid\)/);
  assert.match(cloudHandlers, /const cloudFileFinalized = onObjectFinalized[\s\S]{0,700}if \(!statusBeforeEvent\.active && statusBeforeEvent\.cleanupAllowed\)/);
  assert.match(cloudHandlers, /file\(target\.storagePath\)[\s\S]{0,100}delete\(\{ ignoreNotFound: true \}\)/);
  assert.match(cloudHandlers, /target && !target\.cloudManaged/);
  assert.match(cloudHandlers, /const cloudFileDeleted = onObjectDeleted[\s\S]{0,400}accountDeletionStatus\(target\.uid\)/);
});
