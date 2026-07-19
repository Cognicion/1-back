import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAuthorizedPatientQueryDescriptors,
  patientAllowsProfessionalAccess,
  patientListCacheKey
} from "../services/patientAccessCore.js";

const medicoA = "medicoA";
const medicoB = "medicoB";

const pacienteA = {
  rol: "paciente",
  medicoTratanteUid: medicoA,
  nombre: "Paciente A"
};

const pacienteB = {
  rol: "paciente",
  medicoTratanteUid: medicoB,
  nombre: "Paciente B"
};

const pacienteEquipo = {
  rol: "paciente",
  equipoClinicoIds: [medicoA, medicoB],
  nombre: "Paciente compartido"
};

const pacienteSinAsignacion = {
  rol: "paciente",
  nombre: "Paciente sin asignacion"
};

assert.equal(patientAllowsProfessionalAccess(pacienteA, medicoA), true, "medicoA ve su paciente asignado");
assert.equal(patientAllowsProfessionalAccess(pacienteB, medicoA), false, "medicoA no ve pacienteB");
assert.equal(patientAllowsProfessionalAccess(pacienteB, medicoB), true, "medicoB ve pacienteB");
assert.equal(patientAllowsProfessionalAccess(pacienteA, medicoB), false, "medicoB no ve pacienteA");
assert.equal(patientAllowsProfessionalAccess(pacienteEquipo, medicoA), true, "medicoA ve paciente compartido explicito");
assert.equal(patientAllowsProfessionalAccess(pacienteEquipo, medicoB), true, "medicoB ve paciente compartido explicito");
assert.equal(patientAllowsProfessionalAccess(pacienteSinAsignacion, medicoA), false, "paciente sin asignacion queda excluido");
assert.equal(patientAllowsProfessionalAccess({ rol: "medico", medicoTratanteUid: medicoA }, medicoA), false, "no se mezclan cuentas no paciente");

assert.throws(() => patientListCacheKey(""), /missing_actor_user_id/, "la cache no admite clave global");
assert.match(patientListCacheKey(medicoA), /medicoA$/, "la cache queda aislada por actorUserId");

const descriptors = createAuthorizedPatientQueryDescriptors(medicoA);
assert.ok(descriptors.length >= 6, "se generan consultas autorizadas por relaciones conocidas");
assert.ok(descriptors.every((descriptor) => descriptor.value === medicoA), "todas las consultas usan actorUserId");
assert.equal(createAuthorizedPatientQueryDescriptors("").length, 0, "no se generan consultas sin actor");

const usuariosService = readFileSync(new URL("../services/usuarios.js", import.meta.url), "utf8");
assert.doesNotMatch(usuariosService, /uidMedico\s*\|\|\s*["']__todos__["']/, "no existe cache global de pacientes");
assert.doesNotMatch(usuariosService, /where\("rol","==","paciente"\)\s*\);\s*return await getDocs\(q\)/, "no existe fallback de todos los pacientes");

const medicoPanel = readFileSync(new URL("../medico.js", import.meta.url), "utf8");
assert.doesNotMatch(medicoPanel, /rolUsuarioActual\s*===\s*["']admin["']\s*\?\s*[""]\s*:\s*uidMedico/, "admin no activa listado global en panel medico");

const agenda = readFileSync(new URL("../agenda.js", import.meta.url), "utf8");
assert.doesNotMatch(agenda, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/, "agenda no descarga todos los usuarios");
assert.match(agenda, /canUseMedicalAgenda\(usuario\)/, "agenda usa capacidad clinica compuesta");
assert.match(agenda, /listarPacientes\(medicoUid/, "agenda lista pacientes con actorUserId");
assert.doesNotMatch(agenda, /listarPacientes\(["']{0,2}\)/, "agenda no llama listarPacientes sin actor");

const estadistica = readFileSync(new URL("../estadistica.js", import.meta.url), "utf8");
assert.doesNotMatch(estadistica, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/, "estadistica no descarga todos los usuarios");

const expedientePaciente = readFileSync(new URL("../paciente.js", import.meta.url), "latin1");
assert.match(expedientePaciente, /await medicoPuedeVer\(usuario\.uid,\s*uidPaciente\)/, "el acceso directo al expediente valida actor-paciente");
assert.doesNotMatch(expedientePaciente, /rolUsuarioActual\s*===\s*["']admin["']\s*\?\s*[""]\s*:\s*usuario\.uid/, "el expediente no usa listado global para admin");

console.log("patientAccessIsolation tests passed");
