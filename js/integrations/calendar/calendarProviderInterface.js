/** Contrato común para proveedores de calendario. Los adaptadores no exponen tokens al navegador. */
export const CalendarProvider = Object.freeze({
  connect: async () => { throw new Error("CalendarProvider.connect no implementado"); },
  disconnect: async () => { throw new Error("CalendarProvider.disconnect no implementado"); },
  listCalendars: async () => { throw new Error("CalendarProvider.listCalendars no implementado"); },
  createEvent: async () => { throw new Error("CalendarProvider.createEvent no implementado"); },
  updateEvent: async () => { throw new Error("CalendarProvider.updateEvent no implementado"); },
  deleteEvent: async () => { throw new Error("CalendarProvider.deleteEvent no implementado"); },
  pullChanges: async () => { throw new Error("CalendarProvider.pullChanges no implementado"); }
});
