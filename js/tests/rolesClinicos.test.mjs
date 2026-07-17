import assert from "node:assert/strict";
import {
  ROL_ENFERMERIA_SALUD_MENTAL,
  usuarioEsEnfermeriaSaludMental,
  usuarioEsPersonalClinico,
  usuarioEsProfesionalTipoMedico
} from "../utils/roles.js";

assert.equal(usuarioEsEnfermeriaSaludMental(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsProfesionalTipoMedico(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsPersonalClinico(ROL_ENFERMERIA_SALUD_MENTAL), true);
assert.equal(usuarioEsProfesionalTipoMedico("psicologo"), false);
assert.equal(usuarioEsPersonalClinico("psicologo"), true);

console.log("Roles clinicos: enfermeria/salud mental hereda permisos tipo medico.");
