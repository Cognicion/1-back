import assert from "node:assert/strict";
import {
  FORMAT_PERMISSION_FRAY,
  FORMAT_PERMISSION_NAVARRO,
  permisosFormatosDesdeUsuario,
  usuarioEsActorProfesionalFormato,
  usuarioPuedeAdministrarPermisosFormato,
  usuarioPuedeUsarFormato
} from "../services/formatosInstitucionales.js";

const medicoFray = {
  id: "medico-1",
  rol: "medico",
  institucion: "Hospital Psiquiatrico Fray Bernardino Alvarez",
  permisosFormatos: { [FORMAT_PERMISSION_FRAY]: true },
  formatPermissionMetadata: { [FORMAT_PERMISSION_FRAY]: { status: "active" } }
};

const medicoNavarro = {
  id: "medico-2",
  rol: "medico",
  institucion: "Navarro",
  permisosFormatos: { [FORMAT_PERMISSION_NAVARRO]: true }
};

const adminSinPerfilMedico = {
  id: "admin-1",
  rol: "admin",
  institucion: "Hospital Psiquiatrico Fray Bernardino Alvarez"
};

const adminConPerfilMedico = {
  id: "admin-medico-1",
  rol: "admin",
  profesion: "Medico psiquiatra",
  cedulaProfesional: "123456",
  perfilMedicoVerificado: true,
  institucion: "Hospital Psiquiatrico Fray Bernardino Alvarez",
  permisosFormatos: { [FORMAT_PERMISSION_FRAY]: true }
};

const pacienteConPermisoErroneo = {
  id: "paciente-1",
  rol: "paciente",
  permisosFormatos: { [FORMAT_PERMISSION_FRAY]: true, [FORMAT_PERMISSION_NAVARRO]: true },
  institucion: "Hospital Psiquiatrico Fray Bernardino Alvarez"
};

assert.equal(usuarioEsActorProfesionalFormato(medicoFray), true);
assert.equal(usuarioEsActorProfesionalFormato(adminSinPerfilMedico), false);
assert.equal(usuarioEsActorProfesionalFormato(adminConPerfilMedico), true);
assert.equal(usuarioEsActorProfesionalFormato(pacienteConPermisoErroneo), false);
assert.equal(usuarioPuedeAdministrarPermisosFormato(adminSinPerfilMedico), true);

assert.equal(permisosFormatosDesdeUsuario(adminSinPerfilMedico)[FORMAT_PERMISSION_FRAY], undefined);
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", permisosFormatosDesdeUsuario(medicoFray), medicoFray.rol, medicoFray), true);
assert.equal(usuarioPuedeUsarFormato("referencia_navarro", permisosFormatosDesdeUsuario(medicoNavarro), medicoNavarro.rol, medicoNavarro), true);
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", permisosFormatosDesdeUsuario(adminSinPerfilMedico), adminSinPerfilMedico.rol, adminSinPerfilMedico), false);
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", { [FORMAT_PERMISSION_FRAY]: true }, "admin"), false);
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", permisosFormatosDesdeUsuario(adminConPerfilMedico), adminConPerfilMedico.rol, adminConPerfilMedico), true);
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", permisosFormatosDesdeUsuario(pacienteConPermisoErroneo), pacienteConPermisoErroneo.rol, pacienteConPermisoErroneo), false);
assert.equal(usuarioPuedeUsarFormato("nota_breve", {}, "paciente", pacienteConPermisoErroneo), true);

const revocado = {
  ...medicoFray,
  formatPermissionMetadata: { [FORMAT_PERMISSION_FRAY]: { status: "revoked" } }
};
assert.equal(usuarioPuedeUsarFormato("evolucion_observacion", permisosFormatosDesdeUsuario(revocado), revocado.rol, revocado), false);

console.log("clinicalFormatEntitlements.test.mjs OK");
