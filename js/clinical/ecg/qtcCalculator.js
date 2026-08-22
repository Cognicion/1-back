export const QTC_CALCULATION_VERSION = "1.0.0";

const LIMITS = Object.freeze({
  heartRate: Object.freeze({ minimum: 20, maximum: 300 }),
  qtMs: Object.freeze({ minimum: 200, maximum: 700 })
});

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function rounded(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function inRange(value, limits) {
  return value !== null && value >= limits.minimum && value <= limits.maximum;
}

export function calculateCorrectedQt({ qtMs, heartRate } = {}) {
  const qt = finiteNumber(qtMs);
  const rate = finiteNumber(heartRate);

  if (!inRange(qt, LIMITS.qtMs)) {
    return {
      calculable: false,
      reason: "qt_out_of_supported_range",
      message: "El QT debe estar documentado entre 200 y 700 ms para realizar el cálculo."
    };
  }
  if (!inRange(rate, LIMITS.heartRate)) {
    return {
      calculable: false,
      reason: "heart_rate_out_of_supported_range",
      message: "La frecuencia del mismo ECG debe estar documentada entre 20 y 300 lpm."
    };
  }

  const rrSeconds = 60 / rate;
  const values = Object.freeze({
    bazettMs: rounded(qt / Math.sqrt(rrSeconds)),
    fridericiaMs: rounded(qt / Math.cbrt(rrSeconds)),
    framinghamMs: rounded(qt + 154 * (1 - rrSeconds)),
    hodgesMs: rounded(qt + 1.75 * (rate - 60))
  });
  const warnings = [];
  if (rate > 85) warnings.push("Bazett puede sobrecorregir a frecuencias altas; se prioriza Fridericia para la comparación orientativa.");
  if (rate < 50) warnings.push("Las fórmulas de corrección pueden divergir con frecuencias bajas; confirme la medición y el método.");

  return {
    calculable: true,
    qtMs: qt,
    heartRate: rate,
    rrSeconds: rounded(rrSeconds, 3),
    primaryMethod: "fridericia",
    primaryValueMs: values.fridericiaMs,
    values,
    warnings,
    calculationVersion: QTC_CALCULATION_VERSION
  };
}

export { LIMITS as QTC_INPUT_LIMITS };
