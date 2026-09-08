import { obtenerFunctions } from "../firebase.js";

async function callable(name) {
  const [{ httpsCallable }, functions] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"),
    obtenerFunctions()
  ]);
  return httpsCallable(functions, name, { timeout: 30000 });
}

export async function iniciarConexionGoogleCalendar() {
  const call = await callable("googleCalendarConnect");
  const result = await call({});
  const authorizationUrl = result.data?.authorizationUrl;
  if (!authorizationUrl || !authorizationUrl.startsWith("https://accounts.google.com/")) throw new Error("authorization-url-invalid");
  window.location.assign(authorizationUrl);
}

export async function obtenerEstadoGoogleCalendar() {
  const call = await callable("getGoogleCalendarConnectionStatus");
  return (await call({})).data || { connected: false, status: "unknown" };
}

export async function desconectarGoogleCalendar() {
  const call = await callable("disconnectGoogleCalendar");
  return (await call({})).data || {};
}
