import { obtenerFunctions } from "../firebase.js";

const FUNCTION_NAME = "manageAccountLinking";

const ACTIONS = Object.freeze({
  CREATE_DOCTOR_CODE: "crearCodigoExpedienteParaPaciente",
  CREATE_PATIENT_CODE: "crearCodigoPacienteParaMedico",
  LINK_FROM_DOCTOR_CODE: "vincularCuentaConCodigoMedico",
  LINK_FROM_PATIENT_CODE: "vincularExpedienteConCodigoPaciente"
});

let functionsSdkPromise = null;

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

async function callAccountLinking(payload) {
  const [functions, { httpsCallable }] = await Promise.all([
    obtenerFunctions(),
    getFunctionsSdk()
  ]);
  const response = await httpsCallable(functions, FUNCTION_NAME)(payload);
  return response.data || {};
}

export async function crearCodigoExpedienteParaPaciente(pacienteId, medicoUid) {
  const response = await callAccountLinking({
    accion: ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId,
    // Se conserva el argumento para compatibilidad; el backend usa request.auth.uid.
    medicoUid
  });
  return response.codigo;
}

export async function crearCodigoPacienteParaMedico(pacienteUid) {
  const response = await callAccountLinking({
    accion: ACTIONS.CREATE_PATIENT_CODE,
    // Se conserva el argumento para compatibilidad; el backend usa request.auth.uid.
    pacienteUid
  });
  return response.codigo;
}

export async function vincularCuentaConCodigoMedico(codigo, cuentaPacienteUid) {
  return callAccountLinking({
    accion: ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo,
    // Se conserva el argumento para compatibilidad; el backend usa request.auth.uid.
    cuentaPacienteUid
  });
}

export async function vincularExpedienteConCodigoPaciente(codigo, expedienteProvisionalId, medicoUid) {
  return callAccountLinking({
    accion: ACTIONS.LINK_FROM_PATIENT_CODE,
    codigo,
    expedienteProvisionalId,
    // Se conserva el argumento para compatibilidad; el backend usa request.auth.uid.
    medicoUid
  });
}
