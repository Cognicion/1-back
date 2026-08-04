import { iniciarConexionGoogleCalendar, listarCalendariosGoogle, seleccionarCalendarioGoogle, desconectarGoogleCalendar } from "./calendarSyncService.js";

export const GoogleCalendarAdapter = Object.freeze({
  connect: iniciarConexionGoogleCalendar,
  disconnect: desconectarGoogleCalendar,
  listCalendars: listarCalendariosGoogle,
  selectCalendar: seleccionarCalendarioGoogle
});
