import { obtenerFunctions } from "../firebase.js";

let functionsSdkPromise = null;

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

export async function registrarProfesionalConCodigo(payload = {}) {
  const [functions, { httpsCallable }] = await Promise.all([
    obtenerFunctions(),
    getFunctionsSdk()
  ]);
  const result = await httpsCallable(functions, "registerProfessionalWithCode")({
    nombre: payload.nombre,
    rol: payload.rol,
    codigoAutorizacion: payload.codigoAutorizacion,
    aceptaAviso: payload.aceptaAviso === true,
    aceptaBeta: payload.aceptaBeta === true
  });
  return result.data || {};
}

export async function registrarProfesional(payload = {}) {
  const [functions, { httpsCallable }] = await Promise.all([
    obtenerFunctions(),
    getFunctionsSdk()
  ]);
  const result = await httpsCallable(functions, "registerProfessional")({
    nombre: payload.nombre,
    rol: payload.rol,
    modalidadRegistro: payload.modalidadRegistro,
    codigoAutorizacion: payload.codigoAutorizacion || "",
    aceptaAviso: payload.aceptaAviso === true,
    aceptaBeta: payload.aceptaBeta === true
  });
  return result.data || {};
}
