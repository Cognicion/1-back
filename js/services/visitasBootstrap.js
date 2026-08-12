import { auth } from "./firebaseAppService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { obtenerUsuario } from "./usuarios.js";
import { registrarVisita } from "./visitas.js";

let visitaRegistrada = false;

async function registrarVisitaActual(usuario = null) {
  if (visitaRegistrada && !usuario) return;
  try {
    const perfil = usuario ? await obtenerUsuario(usuario.uid) : null;
    await registrarVisita({ usuario, perfil });
    visitaRegistrada = true;
  } catch (error) {
    console.warn("No se pudo registrar la visita:", error?.code || error?.message || "error");
  }
}

registrarVisitaActual();
onAuthStateChanged(auth, (usuario) => {
  registrarVisitaActual(usuario);
});
