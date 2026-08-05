export function validateMedication(value = {}) {
  const errors = [];
  if (!String(value.medicationName || value.name || "").trim()) errors.push("medicationName");
  if (value.schedule && !Array.isArray(value.schedule)) errors.push("schedule");
  return { valid: errors.length === 0, errors };
}
