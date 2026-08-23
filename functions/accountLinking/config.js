"use strict";

const ACCOUNT_LINKING_ACTIONS = Object.freeze({
  CREATE_DOCTOR_CODE: "crearCodigoExpedienteParaPaciente",
  CREATE_PATIENT_CODE: "crearCodigoPacienteParaMedico",
  LINK_FROM_DOCTOR_CODE: "vincularCuentaConCodigoMedico",
  LINK_FROM_PATIENT_CODE: "vincularExpedienteConCodigoPaciente"
});

const USER_SUBCOLLECTIONS = Object.freeze([
  "notas",
  "tratamientos",
  "estudios",
  "notasRapidas",
  "resultadosEscalas",
  "metasTerapeuticas",
  "permisosMedicos",
  "historiaClinica",
  "escalasAsignadas",
  "tareasMiSalud",
  "diarioPersonal",
  "apuntesMedico",
  "carpetasApuntes",
  "borradoresMedico"
]);

const LEGACY_PATIENT_SUBCOLLECTIONS = Object.freeze([
  "registrosDiarios"
]);

const LEGACY_PATIENT_DOCUMENTS = Object.freeze([
  Object.freeze(["miSalud", "metas"]),
  Object.freeze(["miSalud", "agenda"])
]);

const CODE_LIFETIME_DAYS = 14;
const MAX_AUTHORIZED_PROFESSIONALS = 100;

module.exports = {
  ACCOUNT_LINKING_ACTIONS,
  CODE_LIFETIME_DAYS,
  LEGACY_PATIENT_DOCUMENTS,
  LEGACY_PATIENT_SUBCOLLECTIONS,
  MAX_AUTHORIZED_PROFESSIONALS,
  USER_SUBCOLLECTIONS
};
