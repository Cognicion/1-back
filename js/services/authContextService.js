import { auth } from "./firebaseAppService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { invalidarCacheUsuario, obtenerUsuario } from "./usuarios.js";

let authUserPromise = null;

function conTiempoLimite(promesa, ms = 12000) {
  let temporizador = null;
  const limite = new Promise((_, reject) => {
    temporizador = globalThis.setTimeout?.(() => reject(new Error("Tiempo de espera agotado")), ms);
  });
  return Promise.race([promesa, limite]).finally(() => globalThis.clearTimeout?.(temporizador));
}

export function getAuthenticatedUserOnce(opciones = {}) {
  const timeoutMs = opciones.timeoutMs || 12000;
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authUserPromise) return authUserPromise;

  authUserPromise = conTiempoLimite(new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  }), timeoutMs).finally(() => {
    authUserPromise = null;
  });

  return authUserPromise;
}

export async function getUserProfileOnce(uid = auth.currentUser?.uid || "", opciones = {}) {
  if (!uid) return null;
  return obtenerUsuario(uid, { forzar: Boolean(opciones.force) });
}

export async function getCurrentPermissions(uid = auth.currentUser?.uid || "", datosPerfil = null) {
  const perfil = datosPerfil || await getUserProfileOnce(uid);
  if (!perfil) return null;

  return {
    uid,
    rol: perfil.rol || perfil.role || "",
    permisos: perfil.permisos || {},
    institucion: perfil.institucion || perfil.institucionPaciente || "",
    perfil
  };
}

export function invalidateAuthContext(uid = "") {
  invalidarCacheUsuario(uid);
}
