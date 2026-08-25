const DAY_MS = 24 * 60 * 60 * 1000;

export function fechaAgenda(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parsearFechaAgenda(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function sumarDiasAgenda(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sumarMesesAgenda(date, months, anchorDay = date.getDate()) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(anchorDay, lastDay));
  return next;
}

function diasEntre(inicio, fin) {
  return Math.max(0, Math.round((fin - inicio) / DAY_MS));
}

export function eventoSeSolapaRango(evento, visibleStart, visibleEnd) {
  const start = parsearFechaAgenda(evento.startDate || evento.fecha);
  const end = parsearFechaAgenda(evento.endDate || evento.startDate || evento.fecha);
  const rangeStart = parsearFechaAgenda(visibleStart);
  const rangeEnd = parsearFechaAgenda(visibleEnd);
  return Boolean(start && end && rangeStart && rangeEnd && start <= rangeEnd && end >= rangeStart);
}

export function expandirRecurrencia(evento, visibleStart, visibleEnd) {
  if (!evento.recurrence) return eventoSeSolapaRango(evento, visibleStart, visibleEnd) ? [evento] : [];

  const baseStart = parsearFechaAgenda(evento.startDate || evento.fecha);
  const baseEnd = parsearFechaAgenda(evento.endDate || evento.startDate || evento.fecha);
  const rangeStart = parsearFechaAgenda(visibleStart);
  const rangeEnd = parsearFechaAgenda(visibleEnd);
  if (!baseStart || !baseEnd || !rangeStart || !rangeEnd) return [];

  const duration = diasEntre(baseStart, baseEnd);
  const interval = evento.recurrence === "weekly" ? "weekly" : evento.recurrence === "biweekly" ? "biweekly" : evento.recurrence === "monthly" ? "monthly" : null;
  if (!interval) return eventoSeSolapaRango(evento, visibleStart, visibleEnd) ? [evento] : [];

  let occurrence = baseStart;
  const monthlyAnchorDay = baseStart.getDate();
  if (interval === "weekly" || interval === "biweekly") {
    const weeks = Math.max(0, Math.floor(diasEntre(baseStart, rangeStart) / (7 * (interval === "biweekly" ? 2 : 1))) - 1);
    occurrence = sumarDiasAgenda(baseStart, weeks * 7 * (interval === "biweekly" ? 2 : 1));
  } else {
    const monthDistance = Math.max(0, (rangeStart.getFullYear() - baseStart.getFullYear()) * 12 + rangeStart.getMonth() - baseStart.getMonth() - 1);
    occurrence = sumarMesesAgenda(baseStart, monthDistance, monthlyAnchorDay);
  }

  const result = [];
  for (let index = 0; index < 500 && occurrence <= rangeEnd; index += 1) {
    const occurrenceDate = fechaAgenda(occurrence);
    const occurrenceEnd = fechaAgenda(sumarDiasAgenda(occurrence, duration));
    if (occurrenceEnd >= visibleStart && occurrenceDate <= visibleEnd) {
      result.push({
        ...evento,
        id: `${evento.id}::${occurrenceDate}`,
        parentEventId: evento.id,
        occurrenceDate,
        isVirtualOccurrence: true,
        startDate: occurrenceDate,
        endDate: occurrenceEnd
      });
    }
    occurrence = interval === "weekly"
      ? sumarDiasAgenda(occurrence, 7)
      : interval === "biweekly"
        ? sumarDiasAgenda(occurrence, 14)
        : sumarMesesAgenda(occurrence, 1, monthlyAnchorDay);
  }
  return result;
}

export function expandirEventosAgenda(eventos, visibleStart, visibleEnd) {
  return eventos.flatMap((evento) => expandirRecurrencia(evento, visibleStart, visibleEnd));
}
