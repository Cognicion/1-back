import { obtenerFunctions } from "../firebase.js";
const pending = new Map();
let callable;
async function queryPublic(payload) {
  callable ||= Promise.all([obtenerFunctions(), import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")])
    .then(([functions, { httpsCallable }]) => httpsCallable(functions, "getPublicProfessionals"));
  return (await (await callable)(payload)).data;
}
function read(payload) {
  const key = JSON.stringify(payload), cached = pending.get(key);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = queryPublic(payload).catch(error => { pending.delete(key); throw error; });
  pending.set(key, { promise, until: Date.now() + 60000 });
  return promise;
}
export const getFeaturedProfessionals = () => read({ action: "featured" });
export const getProfessionalsPage = (cursor = "") => read({ action: "list", cursor });
export const getProfessional = slug => read({ action: "profile", slug }).then(r => r.professional);
export function traceDirectoryError() { console.warn("[COGNICION][DIRECTORY] Lectura pública no disponible."); }

