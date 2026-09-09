export function fechaMaximaNacimiento(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function fechaNacimientoValida(value, now = new Date()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= fechaMaximaNacimiento(now);
}
