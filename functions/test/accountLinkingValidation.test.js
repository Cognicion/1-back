"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  codeIsExpired,
  isAdmin,
  isPatient,
  isProfessional,
  normalizeCode,
  patientAllowsProfessionalAccess,
  requireDocumentId
} = require("../accountLinking/validation");

test("normaliza roles clínicos sin ampliar perfiles de paciente", () => {
  assert.equal(isProfessional({ rol: "Médico" }), true);
  assert.equal(isProfessional({ rol: "psicologo" }), true);
  assert.equal(isProfessional({ rol: "enfermeria_salud_mental" }), true);
  assert.equal(isProfessional({ rol: "paciente" }), false);
  assert.equal(isPatient({ rol: "paciente" }), true);
  assert.equal(isPatient({ rol: "paciente", admin: true }), false);
  assert.equal(isPatient({ rol: "paciente", roles: { medico: true } }), false);
  assert.equal(isPatient({ rol: "paciente", cargoSistema: "superadmin" }), false);
  assert.equal(isAdmin({ roles: { administrador: true } }), true);
});

test("valida código, expiración e IDs antes de formar rutas Firestore", () => {
  assert.equal(normalizeCode(" cog-abcd-2345 "), "COG-ABCD-2345");
  assert.throws(() => normalizeCode("COG-ABCD-0000"), (error) => error.code === "invalid-argument");
  assert.equal(requireDocumentId("uid_ABC-123"), "uid_ABC-123");
  assert.throws(() => requireDocumentId("../usuarios/otro"), (error) => error.code === "invalid-argument");
  assert.equal(codeIsExpired({ expiraEn: "2026-08-22T12:00:00.000Z" }, Date.parse("2026-08-22T12:00:00.000Z")), false);
  assert.equal(codeIsExpired({ expiraEn: "fecha inválida" }), true);
});

test("el acceso clínico exige propiedad, lista autorizada o permiso de lectura", () => {
  const patient = { rol: "paciente", creadoPor: "doctor-owner", medicosAutorizados: ["doctor-list"] };
  assert.equal(patientAllowsProfessionalAccess(patient, "doctor-owner"), true);
  assert.equal(patientAllowsProfessionalAccess(patient, "doctor-list"), true);
  assert.equal(patientAllowsProfessionalAccess(patient, "doctor-permission", { lectura: true }), true);
  assert.equal(patientAllowsProfessionalAccess(patient, "doctor-other"), false);
  assert.equal(patientAllowsProfessionalAccess({ rol: "medico", creadoPor: "doctor-owner" }, "doctor-owner"), false);
});
