import test from "node:test";
import assert from "node:assert/strict";
import { mapAppointmentToGoogleEvent } from "../integrations/calendar/calendarSyncMapper.js";

test("mapea una cita sin datos clínicos y conserva la zona configurada", () => {
  const event = mapAppointmentToGoogleEvent({ fecha: "2026-08-03", hora: "10:30", tipo: "Consulta", notas: "dato sensible", pacienteNombre: "Paciente Prueba" }, { appointmentId: "a1", ownerUid: "u1" });
  assert.equal(event.start.timeZone, "America/Mexico_City");
  assert.equal(event.summary, "Consulta");
  assert.equal(event.description.includes("dato sensible"), false);
  assert.equal(event.extendedProperties.private.cognicionAppointmentId, "a1");
});
