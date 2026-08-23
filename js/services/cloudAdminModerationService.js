import { obtenerFunctions } from "../firebase.js";

let functionsSdkPromise = null;
const callableCache = new Map();

function getFunctionsSdk() {
  if (!functionsSdkPromise) {
    functionsSdkPromise = import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  }
  return functionsSdkPromise;
}

async function callAdminCloudFunction(name, payload) {
  const [functions, { httpsCallable }] = await Promise.all([obtenerFunctions(), getFunctionsSdk()]);
  if (!callableCache.has(name)) callableCache.set(name, httpsCallable(functions, name));
  const result = await callableCache.get(name)(payload);
  return result.data || {};
}

export function listarArchivosNubeAdmin({ ownerUid, parentFolderId = null, deleted = false, pageSize = 40, cursor = null, includeSummary = true }) {
  return callAdminCloudFunction("listAdminCloudFiles", {
    ownerUid,
    parentFolderId,
    deleted,
    includeSummary,
    pageSize,
    ...(cursor ? { cursor } : {})
  });
}

export function solicitarAccesoArchivoNubeAdmin({ ownerUid, fileId, operation }) {
  return callAdminCloudFunction("requestAdminCloudFileAccess", { ownerUid, fileId, operation });
}

export async function descargarBlobTemporalAdmin(url) {
  const response = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!response.ok) {
    const error = new Error("No fue posible obtener el archivo privado.");
    error.code = response.status === 404 ? "not-found" : "unavailable";
    throw error;
  }
  return response.blob();
}
