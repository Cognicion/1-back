import { obtenerFunctions } from "../firebase.js";

let functionsSdkPromise = null;

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

async function callProfessionalPatientFunction(name, payload = {}) {
  const [functions, { httpsCallable }] = await Promise.all([
    obtenerFunctions(),
    getFunctionsSdk()
  ]);
  const result = await httpsCallable(functions, name)(payload);
  return result.data || {};
}

export function crearIdOperacionPaciente(prefijo = "alta_paciente") {
  const normalizedPrefix = String(prefijo || "alta_paciente")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .slice(0, 40) || "alta_paciente";
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${normalizedPrefix}_${randomId}`.slice(0, 160);
}

export function crearPacienteProvisionalSeguro(paciente = {}, operationId = "") {
  const stableOperationId = String(operationId || "").trim() || crearIdOperacionPaciente();
  return callProfessionalPatientFunction("createProvisionalPatient", {
    operationId: stableOperationId,
    paciente
  });
}

export function descartarCuentaSinPerfil() {
  return callProfessionalPatientFunction("discardUnregisteredAccount");
}

export function registrarPerfilPacienteSeguro(payload = {}) {
  return callProfessionalPatientFunction("registerPatientProfile", {
    nombre: payload.nombre,
    correoMedico: payload.correoMedico || "",
    usaCodigoVinculacion: payload.usaCodigoVinculacion === true,
    aceptaAviso: payload.aceptaAviso === true,
    aceptaBeta: payload.aceptaBeta === true
  });
}

export function listarDirectorioProfesionalSeguro() {
  return callProfessionalPatientFunction("listProfessionalDirectory");
}

export function listarIdsPacientesAutorizadosSeguro() {
  return callProfessionalPatientFunction("listAuthorizedPatientIds");
}

export function administrarPermisoPaciente({
  accion,
  pacienteId,
  profesionalUid = "",
  profesionalCorreo = "",
  tipoPermiso = ""
}) {
  return callProfessionalPatientFunction("managePatientPermission", {
    accion,
    pacienteId,
    profesionalCorreo,
    profesionalUid,
    tipoPermiso
  });
}
