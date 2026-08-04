import { obtenerFunctions } from "../../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export async function sincronizarCitaConGoogle(appointmentId, operation = "upsert") {
  const functions = await obtenerFunctions();
  return httpsCallable(functions, "calendarSyncAppointment")({ appointmentId, operation });
}

export async function obtenerEstadoGoogleCalendar() {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleCalendarStatus")()).data;
}

export async function iniciarConexionGoogleCalendar() {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleOAuthStart")()).data;
}

export async function listarCalendariosGoogle() {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleCalendarList")()).data;
}

export async function seleccionarCalendarioGoogle(calendarId) {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleCalendarConnect")({ calendarId })).data;
}

export async function sincronizarGoogleAhora() {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleCalendarSync")({ direction: "push" })).data;
}

export async function desconectarGoogleCalendar(deleteRemoteEvents = false) {
  const functions = await obtenerFunctions();
  return (await httpsCallable(functions, "googleCalendarDisconnect")({ deleteRemoteEvents })).data;
}
