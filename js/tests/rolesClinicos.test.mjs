import assert from "node:assert/strict";
import {
  ROL_ENFERMERIA_SALUD_MENTAL,
  canManagePlatform,
  canUseMedicalAgenda,
  hasClinicalProfessionalProfile,
  isAdministrator,
  usuarioEsEnfermeriaSaludMental,
  usuarioEsPersonalClinico,
  usuarioEsProfesionalTipoMedico
} from "../utils/roles.js";

assert.equal(usuarioEsEnfermeriaSaludMental(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsProfesionalTipoMedico(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsPersonalClinico(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsProfesionalTipoMedico("psicologo"), false);
assert.equal(usuarioEsPersonalClinico("psicologo"), true);

const adminSolo = { id: "adminSolo", rol: "admin" };
const medicoSolo = { id: "medicoSolo", rol: "medico" };
const adminMedico = {
  id: "adminMedico",
  rol: "admin",
  profesion: "Medico psiquiatra",
  cedulaProfesional: "123456"
};
const adminMedicoVerificado = {
  id: "adminMedicoVerificado",
  rol: "admin",
  perfilMedicoVerificado: true
};
const adminConEspecialidad = {
  id: "adminConEspecialidad",
  rol: "admin",
  especialidad: "Psiquiatria",
  cedulaProfesional: "654321"
};
const psicologo = { id: "psicologo", rol: "psicologo" };
const paciente = { id: "paciente", rol: "paciente" };
const usuarioSinPerfil = { id: "sinPerfil", rol: "" };

assert.equal(isAdministrator(adminSolo), true);
assert.equal(canManagePlatform(adminSolo), true);
assert.equal(hasClinicalProfessionalProfile(adminSolo), false);
assert.equal(canUseMedicalAgenda(adminSolo), false);

assert.equal(isAdministrator(medicoSolo), false);
assert.equal(canManagePlatform(medicoSolo), false);
assert.equal(hasClinicalProfessionalProfile(medicoSolo), true);
assert.equal(canUseMedicalAgenda(medicoSolo), true);

assert.equal(isAdministrator(adminMedico), true);
assert.equal(canManagePlatform(adminMedico), true);
assert.equal(hasClinicalProfessionalProfile(adminMedico), true);
assert.equal(canUseMedicalAgenda(adminMedico), true);

assert.equal(isAdministrator(adminMedicoVerificado), true);
assert.equal(hasClinicalProfessionalProfile(adminMedicoVerificado), true);
assert.equal(canUseMedicalAgenda(adminMedicoVerificado), true);

assert.equal(isAdministrator(adminConEspecialidad), true);
assert.equal(hasClinicalProfessionalProfile(adminConEspecialidad), true);
assert.equal(canUseMedicalAgenda(adminConEspecialidad), true);

assert.equal(hasClinicalProfessionalProfile(psicologo), true);
assert.equal(canUseMedicalAgenda(psicologo), true);
assert.equal(canUseMedicalAgenda(paciente), false);
assert.equal(canUseMedicalAgenda(usuarioSinPerfil), false);

console.log("Roles clinicos: enfermeria/salud mental hereda permisos tipo medico.");
