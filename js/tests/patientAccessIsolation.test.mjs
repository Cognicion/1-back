import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAuthorizedPatientQueryDescriptors,
  isMissingAuthorizedPatientDirectoryError,
  normalizeAuthorizedPatientIds,
  patientAllowsProfessionalAccess,
  patientListCacheKey,
  resolveAuthorizedPatientDirectory
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

const pacienteProfessionalUid = {
  rol: "paciente",
  professionalUid: medicoA,
  nombre: "Paciente con relación directa profesional"
};

assert.equal(patientAllowsProfessionalAccess(pacienteA, medicoA), true, "medicoA ve su paciente asignado");
assert.equal(patientAllowsProfessionalAccess(pacienteB, medicoA), false, "medicoA no ve pacienteB");
assert.equal(patientAllowsProfessionalAccess(pacienteB, medicoB), true, "medicoB ve pacienteB");
assert.equal(patientAllowsProfessionalAccess(pacienteA, medicoB), false, "medicoB no ve pacienteA");
assert.equal(patientAllowsProfessionalAccess(pacienteEquipo, medicoA), true, "medicoA ve paciente compartido explicito");
assert.equal(patientAllowsProfessionalAccess(pacienteEquipo, medicoB), true, "medicoB ve paciente compartido explicito");
assert.equal(patientAllowsProfessionalAccess(pacienteSinAsignacion, medicoA), false, "paciente sin asignacion queda excluido");
assert.equal(patientAllowsProfessionalAccess(pacienteProfessionalUid, medicoA), true, "professionalUid coincide con las reglas de acceso directo");
assert.equal(patientAllowsProfessionalAccess({ rol: "medico", medicoTratanteUid: medicoA }, medicoA), false, "no se mezclan cuentas no paciente");
assert.equal(patientAllowsProfessionalAccess({
  rol: "paciente",
  estado: "vinculado",
  vinculadoA: "cuentaPaciente",
  medicoTratanteUid: medicoA
}, medicoA), false, "el expediente de origen vinculado no conserva acceso fuera de cuota");

assert.throws(() => patientListCacheKey(""), /missing_actor_user_id/, "la cache no admite clave global");
assert.match(patientListCacheKey(medicoA), /medicoA$/, "la cache queda aislada por actorUserId");

const descriptors = createAuthorizedPatientQueryDescriptors(medicoA);
assert.ok(descriptors.length >= 6, "se generan consultas autorizadas por relaciones conocidas");
assert.ok(descriptors.every((descriptor) => descriptor.value === medicoA), "todas las consultas usan actorUserId");
assert.ok(descriptors.some((descriptor) => descriptor.field === "professionalUid"), "el cliente consulta el campo directo que autorizan las reglas");
assert.equal(createAuthorizedPatientQueryDescriptors("").length, 0, "no se generan consultas sin actor");
assert.equal(
  isMissingAuthorizedPatientDirectoryError({ code: "functions/not-found" }),
  true,
  "la ausencia de la callable habilita la ruta de compatibilidad"
);
assert.equal(
  isMissingAuthorizedPatientDirectoryError({ code: "functions/permission-denied" }),
  false,
  "un rechazo de permisos nunca activa el fallback"
);
assert.equal(
  isMissingAuthorizedPatientDirectoryError({ code: "functions/internal" }),
  false,
  "un error interno tampoco se disfraza como ausencia de despliegue"
);
assert.equal(
  isMissingAuthorizedPatientDirectoryError({ code: "not-found" }),
  false,
  "solo el código namespaced del SDK habilita la compatibilidad"
);
assert.deepEqual(
  normalizeAuthorizedPatientIds([" paciente-a ", "paciente-a", "", "ruta/invalida", null]),
  ["paciente-a"],
  "los IDs se normalizan, deduplican y restringen a documentos raíz"
);

let primaryCalls = 0;
let compatibilityCalls = 0;
const primaryDirectory = await resolveAuthorizedPatientDirectory({
  loadPrimary: async () => {
    primaryCalls += 1;
    return { patientIds: ["paciente-a", "paciente-a", "ruta/invalida"] };
  },
  loadCompatibility: async () => {
    compatibilityCalls += 1;
    return { patientIds: ["no-debe-usarse"] };
  }
});
assert.deepEqual(primaryDirectory, {
  mode: "ids",
  patientIds: ["paciente-a"],
  source: "primary"
});
assert.equal(primaryCalls, 1, "el directorio primario se consulta una vez");
assert.equal(compatibilityCalls, 0, "un primario sano no consulta compatibilidad");

const missingProfessionalDirectoryError = Object.assign(
  new Error("not deployed"),
  { code: "functions/not-found" }
);
await assert.rejects(
  resolveAuthorizedPatientDirectory({
    loadPrimary: async () => { throw missingProfessionalDirectoryError; },
    loadCompatibility: async () => {
      compatibilityCalls += 1;
      return { patientIds: ["paciente-incompleto"] };
    }
  }),
  (error) => error === missingProfessionalDirectoryError,
  "un profesional no recibe un directorio legado que pueda omitir pacientes compartidos"
);
assert.equal(compatibilityCalls, 0, "el 404 profesional exige desplegar el directorio completo");

const adminDirectory = await resolveAuthorizedPatientDirectory({
  administrator: true,
  loadPrimary: async () => {
    throw Object.assign(new Error("not deployed"), { code: "functions/not-found" });
  },
  loadCompatibility: async () => {
    compatibilityCalls += 1;
    return { patientIds: ["no-debe-usarse"] };
  }
});
assert.deepEqual(adminDirectory, {
  mode: "admin-query",
  patientIds: [],
  source: "admin-compatibility"
});
assert.equal(compatibilityCalls, 0, "admin no depende de una callable clínica parcial");

for (const code of ["functions/permission-denied", "functions/internal", "functions/unavailable", "not-found"]) {
  const expectedError = Object.assign(new Error(code), { code });
  await assert.rejects(
    resolveAuthorizedPatientDirectory({
      loadPrimary: async () => { throw expectedError; },
      loadCompatibility: async () => {
        compatibilityCalls += 1;
        return { patientIds: [] };
      }
    }),
    (error) => error === expectedError,
    `${code} debe propagarse sin fallback`
  );
}
assert.equal(compatibilityCalls, 0, "ningún error ejecuta un directorio profesional incompleto");

const usuariosService = readFileSync(new URL("../services/usuarios.js", import.meta.url), "utf8");
assert.doesNotMatch(usuariosService, /uidMedico\s*\|\|\s*["']__todos__["']/, "no existe cache global de pacientes");
assert.match(
  usuariosService,
  /administradorConConsultaDirecta = String\(perfilProfesional\?\.rol \|\| ""\)[\s\S]{0,500}administrator: administradorConConsultaDirecta/,
  "la consulta directa solo se habilita para el rol admin que reconocen las reglas"
);
assert.match(
  usuariosService,
  /function listarPacientesAdministradorCompatibilidad[\s\S]{0,220}where\("rol", "==", "paciente"\)/,
  "el listado global de compatibilidad queda aislado en la ruta admin"
);
assert.match(
  usuariosService,
  /resolveAuthorizedPatientDirectory\([\s\S]{0,240}loadPrimary: listarIdsPacientesAutorizadosSeguro/,
  "el servicio conecta el directorio completo mediante el selector probado"
);
assert.doesNotMatch(
  usuariosService,
  /listAuthorizedSofiaPatients|listarIdsPacientesAutorizadosCompatibilidadSeguro/,
  "el panel no usa un directorio clínico legado con cobertura parcial"
);
const patientCards = readFileSync(new URL("../pacientes.js", import.meta.url), "utf8");
assert.match(patientCards, /datos\.estado === "vinculado" && datos\.vinculadoA/, "las tarjetas omiten el expediente de origen vinculado");

const medicoPanel = readFileSync(new URL("../medico.js", import.meta.url), "utf8");
assert.doesNotMatch(medicoPanel, /rolUsuarioActual\s*===\s*["']admin["']\s*\?\s*[""]\s*:\s*uidMedico/, "admin no activa listado global en panel medico");
assert.doesNotMatch(medicoPanel, /perfil clinico habilitado[^\\n]+Panel medico/i, "admin no queda bloqueado por falta de perfil clinico en panel medico");
assert.match(medicoPanel, /canUseMedicalPanel\(datos\)/, "panel medico usa capacidad centralizada de servicio");

const agenda = readFileSync(new URL("../agenda.js", import.meta.url), "utf8");
const agendaHtml = readFileSync(new URL("../../agenda.html", import.meta.url), "utf8");
assert.doesNotMatch(agenda, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/, "agenda no descarga todos los usuarios");
assert.match(agenda, /canUseMedicalAgenda\(usuario\)/, "agenda usa capacidad clinica compuesta");
assert.match(agenda, /listarPacientes\(medicoUid/, "agenda lista pacientes con actorUserId");
assert.doesNotMatch(agenda, /listarPacientes\(["']{0,2}\)/, "agenda no llama listarPacientes sin actor");
assert.doesNotMatch(agenda, /perfil clinico habilitado[^\\n]+Agenda medica/i, "admin no queda bloqueado por falta de perfil clinico en agenda");
assert.doesNotMatch(agenda, /!\s*medicoUid\s*\|\|\s*!\s*pacienteCita\.value/, "agenda permite eventos sin paciente vinculado");
assert.doesNotMatch(agendaHtml, /<select id="pacienteCita" required/, "agenda no exige paciente para crear eventos propios");

const estadistica = readFileSync(new URL("../estadistica.js", import.meta.url), "utf8");
assert.doesNotMatch(estadistica, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/, "estadistica no descarga todos los usuarios");

const expedientePaciente = readFileSync(new URL("../paciente.js", import.meta.url), "latin1");
assert.match(expedientePaciente, /await medicoPuedeVer\(usuario\.uid,\s*uidPaciente\)/, "el acceso directo al expediente valida actor-paciente");
assert.doesNotMatch(expedientePaciente, /rolUsuarioActual\s*===\s*["']admin["']\s*\?\s*[""]\s*:\s*usuario\.uid/, "el expediente no usa listado global para admin");

console.log("patientAccessIsolation tests passed");
