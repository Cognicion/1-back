const RANGES = {
  temperature: [0, 50],
  heartRate: [1, 300],
  respiratoryRate: [1, 100],
  oxygenSaturation: [0, 100],
  weight: [0, 500],
  height: [0, 3],
  bmi: [0, 150],
  capillaryGlucose: [0, 2000]
};

export function validateVitalSign(value = {}) {
  const errors = [];
  if (!value.vitalType) errors.push("vitalType");
  if (value.vitalType === "bloodPressure") {
    const systolic = Number(value.value?.systolic);
    const diastolic = Number(value.value?.diastolic);
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || systolic <= 0 || diastolic <= 0 || systolic > 400 || diastolic > 300) errors.push("bloodPressure");
  } else {
    const range = RANGES[value.vitalType];
    const numeric = Number(value.value);
    if (!Number.isFinite(numeric)) errors.push("value");
    if (range && (numeric < range[0] || numeric > range[1])) errors.push("range");
  }
  return { valid: errors.length === 0, errors };
}
