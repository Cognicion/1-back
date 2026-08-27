import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const usuariosSource = await readFile(new URL("../js/services/usuarios.js", import.meta.url), "utf8");
const medicoSource = await readFile(new URL("../js/medico.js", import.meta.url), "utf8");
const medicoHtml = await readFile(new URL("../medico.html", import.meta.url), "utf8");
const mensajesSource = await readFile(new URL("../js/services/mensajes.js", import.meta.url), "utf8");
const sofiaSource = await readFile(new URL("../js/services/sofiaClinica.js", import.meta.url), "utf8");
const pediatriaSource = await readFile(new URL("../js/pediatria/pediatria.js", import.meta.url), "utf8");
const pacienteSource = await readFile(new URL("../js/paciente.js", import.meta.url), "utf8");
const professionalPatientAccessServiceSource = await readFile(
  new URL("../js/services/professionalPatientAccessService.js", import.meta.url),
  "utf8"
);

test("los planes legados reciben solo IDs autorizados desde backend", () => {
  const funcion = usuariosSource.match(
    /async function listarPacientesSinCache\(uidMedico = ""\)\{[\s\S]*?\n\}/
  )?.[0] || "";
  const lectorIds = usuariosSource.match(
    /async function listarPacientesPorIds[\s\S]*?\n\}/
  )?.[0] || "";
  assert.match(funcion, /loadPrimary: listarIdsPacientesAutorizadosSeguro/);
  assert.match(funcion, /listarPacientesPorIds\(directorio\.patientIds\)/);
  assert.match(lectorIds, /getDoc\(doc\(db, "usuarios", patientUid\)\)/);
  assert.doesNotMatch(funcion, /collectionGroup|documentId|collection\(db,"usuarios"\)/);
});

test("solo admin se recupera cuando el directorio callable aun no esta desplegado", () => {
  const funcion = usuariosSource.match(
    /async function listarPacientesSinCache\(uidMedico = ""\)\{[\s\S]*?\n\}/
  )?.[0] || "";
  const fallbackAdmin = usuariosSource.match(
    /async function listarPacientesAdministradorCompatibilidad[\s\S]*?\n\}/
  )?.[0] || "";

  assert.match(funcion, /await resolveAuthorizedPatientDirectory\(\{/);
  assert.match(funcion, /administradorConConsultaDirecta = String\(perfilProfesional\?\.rol \|\| ""\)/);
  assert.match(funcion, /administrator: administradorConConsultaDirecta/);
  assert.match(funcion, /loadPrimary: listarIdsPacientesAutorizadosSeguro/);
  assert.match(funcion, /return listarPacientesAdministradorCompatibilidad\(\)/);
  assert.match(funcion, /return listarPacientesPorIds\(directorio\.patientIds\)/);
  assert.match(fallbackAdmin, /where\("rol", "==", "paciente"\)/);
  assert.doesNotMatch(usuariosSource, /listAuthorizedSofiaPatients|listarIdsPacientesAutorizadosCompatibilidadSeguro/);
  assert.ok(
    funcion.indexOf("listarPacientesGratuitosPorAsignacion(uidMedico)")
      < funcion.indexOf("resolveAuthorizedPatientDirectory({"),
    "la cuenta gratuita conserva su ruta de cuota y no puede eludirla con el fallback"
  );
});

test("la cuenta gratuita lista únicamente los UID de sus asignaciones server-only", () => {
  const helper = usuariosSource.match(
    /async function listarPacientesGratuitosPorAsignacion[\s\S]*?\n\}/
  )?.[0] || "";
  const funcion = usuariosSource.match(
    /async function listarPacientesSinCache\(uidMedico = ""\)\{[\s\S]*?\n\}/
  )?.[0] || "";

  assert.match(helper, /"patientQuotaAssignments"/);
  assert.match(helper, /"permisosMedicos",\s*uidProfesional/);
  assert.match(helper, /\[uidProfesional\]: permisoProfesional\.data\(\)/);
  assert.match(helper, /patientAllowsProfessionalAccess\(datosConPermiso, uidProfesional\)/);
  assert.match(funcion, /!administrador && esCuentaProfesionalGratuita\(perfilProfesional \|\| \{\}\)/);
  assert.ok(
    funcion.indexOf("listarPacientesGratuitosPorAsignacion(uidMedico)")
      < funcion.indexOf("resolveAuthorizedPatientDirectory({"),
    "el plan gratuito debe salir antes del directorio backend para planes sin límite"
  );
});

test("compartir por correo delega la identidad profesional al backend", () => {
  assert.doesNotMatch(usuariosSource, /export async function buscarMedicoPorCorreo/);
  assert.doesNotMatch(usuariosSource, /where\("email", "==", correo\)/);
  assert.doesNotMatch(pacienteSource, /buscarMedicoPorCorreo/);
  assert.match(pacienteSource, /otorgarPermisoMedico\(\s*uidPaciente,\s*correo,/);
  assert.match(professionalPatientAccessServiceSource, /profesionalCorreo/);
});

test("Sofía, Pediatría y Mensajes reutilizan la lista autorizada fuera del rol admin", () => {
  assert.match(sofiaSource, /rol === "admin"[\s\S]{0,180}listarPacientes\(usuario\?\.uid \|\| ""\)/);
  assert.match(pediatriaSource, /rol\.includes\("admin"\)[\s\S]{0,180}listarPacientes\(estado\.usuario\?\.uid \|\| ""\)/);
  assert.match(mensajesSource, /listarDirectorioProfesionalSeguro\(\)/);
  assert.doesNotMatch(mensajesSource, /rolesVisibles|where\("rol", "==", rol\)/);
  assert.match(mensajesSource, /uidActual \? listarPacientes\(uidActual\)/);
  assert.doesNotMatch(mensajesSource, /where\("(?:email|correo)", "==", busqueda\)/);
});

test("el Panel Médico invalida las versiones defectuosas en todos los navegadores", () => {
  assert.match(medicoSource, /usuarios\.js\?v=20260827-panel-pacientes-fallback-v1/);
  assert.match(medicoHtml, /medico\.js\?v=20260827-panel-pacientes-fallback-v1/);
});
