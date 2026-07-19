import assert from "node:assert/strict";
import {
  ROL_ENFERMERIA_SALUD_MENTAL,
  canAccessService,
  canManagePlatform,
  canPrescribe,
  canRecordExistingTreatment,
  canUseMedicalAgenda,
  canUseMedicalPanel,
  hasClinicalProfessionalProfile,
  isAdministrator,
  isClinicalStaff,
  usuarioEsEnfermeriaSaludMental,
  usuarioEsPersonalClinico,
  usuarioEsProfesionalTipoMedico
} from "../utils/roles.js";
import { patientAllowsProfessionalAccess } from "../services/patientAccessCore.js";

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
const enfermeria = { id: "enfermeria", rol: ROL_ENFERMERIA_SALUD_MENTAL };
const asesorSaludMental = { id: "asesor", rol: "asesor_salud_mental" };
const paciente = { id: "paciente", rol: "paciente" };
const usuarioSinPerfil = { id: "sinPerfil", rol: "" };
const pacienteAdmin = { rol: "paciente", medicoTratanteUid: adminSolo.id };
const pacienteMedico = { rol: "paciente", medicoTratanteUid: medicoSolo.id };
const pacientePsicologo = { rol: "paciente", equipoClinicoIds: [psicologo.id] };
const pacienteNoAsignado = { rol: "paciente" };

assert.equal(isAdministrator(adminSolo), true);
assert.equal(canManagePlatform(adminSolo), true);
assert.equal(hasClinicalProfessionalProfile(adminSolo), false);
assert.equal(isClinicalStaff(adminSolo), false);
assert.equal(canUseMedicalPanel(adminSolo), true);
assert.equal(canUseMedicalAgenda(adminSolo), true);
assert.equal(canAccessService(adminSolo, "panel_medico"), true);
assert.equal(canAccessService(adminSolo, "agenda_medica"), true);
assert.equal(canAccessService(adminSolo, "recetas"), true);
assert.equal(canPrescribe(adminSolo), false);
assert.equal(patientAllowsProfessionalAccess(pacienteAdmin, adminSolo.id), true);
assert.equal(patientAllowsProfessionalAccess(pacienteMedico, adminSolo.id), false);
assert.equal(patientAllowsProfessionalAccess(pacientePsicologo, adminSolo.id), false);
assert.equal(patientAllowsProfessionalAccess(pacienteNoAsignado, adminSolo.id), false);

assert.equal(isAdministrator(medicoSolo), false);
assert.equal(canManagePlatform(medicoSolo), false);
assert.equal(hasClinicalProfessionalProfile(medicoSolo), true);
assert.equal(canUseMedicalPanel(medicoSolo), true);
assert.equal(canUseMedicalAgenda(medicoSolo), true);
assert.equal(canPrescribe(medicoSolo), true);
assert.equal(patientAllowsProfessionalAccess(pacienteMedico, medicoSolo.id), true);
assert.equal(patientAllowsProfessionalAccess(pacienteAdmin, medicoSolo.id), false);

assert.equal(isAdministrator(adminMedico), true);
assert.equal(canManagePlatform(adminMedico), true);
assert.equal(hasClinicalProfessionalProfile(adminMedico), true);
assert.equal(canUseMedicalPanel(adminMedico), true);
assert.equal(canUseMedicalAgenda(adminMedico), true);
assert.equal(canPrescribe(adminMedico), true);

assert.equal(isAdministrator(adminMedicoVerificado), true);
assert.equal(hasClinicalProfessionalProfile(adminMedicoVerificado), true);
assert.equal(canUseMedicalAgenda(adminMedicoVerificado), true);

assert.equal(isAdministrator(adminConEspecialidad), true);
assert.equal(hasClinicalProfessionalProfile(adminConEspecialidad), true);
assert.equal(canUseMedicalAgenda(adminConEspecialidad), true);

assert.equal(hasClinicalProfessionalProfile(psicologo), true);
assert.equal(canUseMedicalPanel(psicologo), true);
assert.equal(canUseMedicalAgenda(psicologo), true);
assert.equal(canPrescribe(psicologo), false);
assert.equal(patientAllowsProfessionalAccess(pacientePsicologo, psicologo.id), true);
assert.equal(patientAllowsProfessionalAccess(pacienteMedico, psicologo.id), false);

assert.equal(canUseMedicalPanel(enfermeria), true);
assert.equal(canUseMedicalAgenda(enfermeria), true);
assert.equal(canPrescribe(enfermeria), false);
assert.equal(canRecordExistingTreatment(enfermeria), true);
assert.equal(canUseMedicalPanel(asesorSaludMental), true);
assert.equal(canUseMedicalAgenda(asesorSaludMental), true);
assert.equal(canPrescribe(asesorSaludMental), false);
assert.equal(canRecordExistingTreatment(asesorSaludMental), true);

assert.equal(canUseMedicalPanel(adminSolo), true);
assert.equal(canRecordExistingTreatment(adminSolo), true);
assert.equal(canUseMedicalAgenda(paciente), false);
assert.equal(canUseMedicalPanel(paciente), false);
assert.equal(canAccessService(paciente, "panel_medico"), false);
assert.equal(canUseMedicalAgenda(usuarioSinPerfil), false);

console.log("Roles clinicos: admin abre servicios sin acceso global a pacientes.");
