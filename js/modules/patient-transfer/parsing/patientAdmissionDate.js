function validDateParts(year, month, day, hour, minute) {
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute;
}

function parseTime(value = "", fallbackHour = "00", fallbackMinute = "00") {
  const source = String(value || "").trim();
  if (!source) return { hour: Number(fallbackHour), minute: Number(fallbackMinute) };
  const match = source.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match
    ? { hour: Number(match[1]), minute: Number(match[2]) }
    : null;
}

/**
 * Convierte la fecha/hora revisada por el usuario al contrato canónico que
 * consumen el expediente y el cálculo dinámico de estancia.
 */
export function normalizeImportedAdmissionDate(dateValue = "", timeValue = "") {
  const source = String(dateValue || "").trim();
  if (!source) return "";

  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+([01]?\d|2[0-3]):([0-5]\d))?$/);
  const local = source.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s+([01]?\d|2[0-3]):([0-5]\d))?$/);
  if (!iso && !local) return "";

  const year = Number(iso?.[1] || local?.[3]);
  const month = Number(iso?.[2] || local?.[2]);
  const day = Number(iso?.[3] || local?.[1]);
  const embeddedHour = iso?.[4] || local?.[4] || "00";
  const embeddedMinute = iso?.[5] || local?.[5] || "00";
  const time = iso?.[4] || local?.[4]
    ? { hour: Number(embeddedHour), minute: Number(embeddedMinute) }
    : parseTime(timeValue, embeddedHour, embeddedMinute);
  if (!time || !validDateParts(year, month, day, time.hour, time.minute)) return "";

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}
