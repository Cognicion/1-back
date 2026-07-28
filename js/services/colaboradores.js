import { obtenerFunctions } from "./firebaseAppService.js";
import { TIPOS_COLABORADOR_POR_VALOR } from "../config/tiposColaborador.js";

export async function actualizarReconocimientoColaborador({ usuarioId, tipo }) {
  if (!usuarioId) throw new Error("Falta el usuario objetivo.");
  if (tipo && !TIPOS_COLABORADOR_POR_VALOR[tipo]) throw new Error("Tipo de colaborador no permitido.");

  const functions = await obtenerFunctions();
  const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
  const callable = httpsCallable(functions, "actualizarReconocimientoColaborador");
  const respuesta = await callable({ usuarioId, tipo: tipo || null });
  return respuesta.data;
}
