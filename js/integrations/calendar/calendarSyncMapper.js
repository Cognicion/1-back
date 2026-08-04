export const DEFAULT_TIME_ZONE = "America/Mexico_City";
export const DEFAULT_DURATION_MINUTES = 60;

function validarFecha(valor, etiqueta) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error(`${etiqueta} inválida`);
  return valor;
}

export function mapAppointmentToGoogleEvent(appointment = {}, context = {}) {
  const fecha = validarFecha(appointment.fecha, "Fecha");
  const hora = appointment.hora || "09:00";
  if (!/^\d{2}:\d{2}$/.test(hora)) throw new Error("Hora inválida");
  const zone = context.timeZone || appointment.timeZone || DEFAULT_TIME_ZONE;
  const duration = Number(appointment.duracionMinutos || context.defaultDurationMinutes || DEFAULT_DURATION_MINUTES);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60) throw new Error("Duración inválida");
  const startLocal = `${fecha}T${hora}:00`;
  const start = new Date(`${startLocal}${zone === "UTC" ? "Z" : ""}`);
  const end = new Date(start.getTime() + duration * 60 * 1000);
  const privacy = context.titlePrivacy || "generic";
  const initials = String(appointment.pacienteNombre || "").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 4);
  const summary = privacy === "initials" && initials ? initials : (privacy === "name" && appointment.pacienteNombre ? appointment.pacienteNombre : (appointment.tipo || "Consulta médica"));
  const event = {
    summary,
    description: "Cita gestionada en COGNICIÓN Labs. No contiene información clínica.",
    location: appointment.ubicacion || undefined,
    start: { dateTime: startLocal, timeZone: zone },
    end: { dateTime: end.toISOString(), timeZone: zone },
    reminders: { useDefault: true },
    extendedProperties: { private: {
      cognicionAppointmentId: String(context.appointmentId || appointment.id || ""),
      cognicionOwnerUid: String(context.ownerUid || ""),
      cognicionSchemaVersion: "1"
    }}
  };
  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined));
}
