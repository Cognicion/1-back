import { calcularEdadPediatrica } from "../../pediatria/edad.js";
import { analizarTalla, calcularIMC, numero } from "../../pediatria/formulas.js";

export const GROWTH_REFERENCES = [
  {
    id: "who_2006_0_5",
    organization: "OMS",
    label: "OMS 2006/2007",
    ageRangeMonths: [0, 228],
    status: "pending_table_import",
    method: "LMS",
    sourceUrl: "https://www.who.int/tools/child-growth-standards/standards",
    note: "Referencia recomendada. Requiere importar tablas LMS oficiales por indicador antes de calcular percentiles."
  },
  {
    id: "cdc_2000_2_20",
    organization: "CDC",
    label: "CDC 2000",
    ageRangeMonths: [24, 240],
    status: "pending_table_import",
    method: "LMS",
    sourceUrl: "https://www.cdc.gov/growthcharts/cdc-data-files.htm",
    note: "CDC publica archivos LMS oficiales; la instalación local aún no contiene las tablas."
  },
  {
    id: "mx_context",
    organization: "México",
    label: "México - contexto poblacional",
    ageRangeMonths: [0, 216],
    status: "context_only",
    method: "Epidemiológico",
    sourceUrl: "https://ensanut.insp.mx/",
    note: "ENSANUT y fuentes nacionales sirven como contexto poblacional; no se usan como percentil individual sin una tabla antropométrica validada."
  }
];

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeSex(value = "") {
  const text = normalizeText(value);
  if (["masculino", "hombre", "male", "m", "1"].includes(text)) return "male";
  if (["femenino", "mujer", "female", "f", "2"].includes(text)) return "female";
  return "";
}

export function normalizePediatricMeasurements(input = {}) {
  const heightInfo = analizarTalla(input.tallaCm);
  const weightKg = numero(input.pesoKg);
  const bmi = calcularIMC(input.pesoKg, input.tallaCm);
  const age = input.fechaNacimiento
    ? calcularEdadPediatrica(
      input.fechaNacimiento,
      input.fechaMedicion ? new Date(input.fechaMedicion) : new Date(),
      input.edadGestacional
    )
    : null;

  return {
    sex: normalizeSex(input.sexo),
    birthDate: input.fechaNacimiento || "",
    measurementDate: input.fechaMedicion || new Date().toISOString().slice(0, 10),
    gestationalAgeWeeks: numero(input.edadGestacional),
    age,
    ageMonths: age ? age.diasTotales / 30.4375 : null,
    weightKg,
    heightCm: heightInfo?.valido ? heightInfo.valorCm : null,
    headCircumferenceCm: numero(input.perimetroCefalico),
    bmi,
    warnings: [
      ...(heightInfo?.advertencias || []),
      heightInfo?.error && input.tallaCm ? heightInfo.error : ""
    ].filter(Boolean)
  };
}

export function getReferenceStatus(referenceId) {
  return GROWTH_REFERENCES.find((reference) => reference.id === referenceId) || GROWTH_REFERENCES[0];
}

export function selectGrowthReference({ ageMonths, preferredReference = "who_2006_0_5" } = {}) {
  const requested = getReferenceStatus(preferredReference);
  if (requested.id === "who_2006_0_5" && ageMonths !== null && ageMonths > 60) {
    return {
      ...requested,
      note: "OMS sigue seleccionada, pero para mayores de 5 años se requiere importar la referencia OMS 5-19 o CDC antes de calcular percentiles."
    };
  }
  return requested;
}

export function calculateZScoreFromLms(value, l, m, s) {
  const x = numero(value);
  const L = numero(l);
  const M = numero(m);
  const S = numero(s);
  if (!x || !M || !S || L === null) return null;
  const z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  return {
    z,
    percentile: normalCdf(z) * 100
  };
}

export function classifyGrowthZ(indicator, z) {
  if (z === null || z === undefined || !Number.isFinite(z)) return "Sin clasificación";
  if (indicator === "bmi_for_age") {
    if (z < -3) return "Muy bajo para la edad";
    if (z < -2) return "Bajo para la edad";
    if (z > 3) return "Muy elevado para la edad";
    if (z > 2) return "Elevado para la edad";
    if (z > 1) return "Riesgo de exceso ponderal";
    return "Rango esperado para la referencia seleccionada";
  }
  if (z < -3) return "Muy bajo para la referencia seleccionada";
  if (z < -2) return "Bajo para la referencia seleccionada";
  if (z > 3) return "Muy alto para la referencia seleccionada";
  if (z > 2) return "Alto para la referencia seleccionada";
  return "Rango esperado para la referencia seleccionada";
}

export function buildGrowthAssessment(input = {}) {
  const measurements = normalizePediatricMeasurements(input);
  const reference = selectGrowthReference({
    ageMonths: measurements.ageMonths,
    preferredReference: input.referenceId
  });

  const indicators = [
    {
      id: "weight_for_age",
      label: "Peso para la edad",
      value: measurements.weightKg,
      unit: "kg",
      axisValue: measurements.ageMonths,
      axisLabel: "Edad (meses)"
    },
    {
      id: "height_for_age",
      label: "Talla para la edad",
      value: measurements.heightCm,
      unit: "cm",
      axisValue: measurements.ageMonths,
      axisLabel: "Edad (meses)"
    },
    {
      id: "bmi_for_age",
      label: "IMC para la edad",
      value: measurements.bmi,
      unit: "kg/m²",
      axisValue: measurements.ageMonths,
      axisLabel: "Edad (meses)"
    },
    {
      id: "head_circumference_for_age",
      label: "Perímetro cefálico para la edad",
      value: measurements.headCircumferenceCm,
      unit: "cm",
      axisValue: measurements.ageMonths,
      axisLabel: "Edad (meses)"
    }
  ];

  return {
    measurements,
    reference,
    canCalculatePercentiles: reference.status === "ready",
    indicators: indicators.map((indicator) => ({
      ...indicator,
      available: indicator.value !== null && indicator.value !== undefined,
      status: reference.status === "ready" ? "ready" : "requires_official_table",
      ageMonths: measurements.ageMonths,
      sourceLabel: `${reference.label} · ${reference.method} · ${reference.status === "ready" ? "tabla local cargada" : "tabla oficial local pendiente"}`,
      curves: [],
      z: null,
      percentile: null,
      interpretation: reference.status === "ready"
        ? "Pendiente de tabla cargada para este indicador."
        : "Percentil no calculado: falta tabla LMS oficial local para la referencia seleccionada."
    })),
    alerts: [
      ...measurements.warnings,
      !measurements.birthDate ? "Registra fecha de nacimiento para calcular edad exacta." : "",
      !measurements.sex ? "Registra sexo biológico/sexo clínico requerido por la referencia de crecimiento." : "",
      reference.status !== "ready" ? reference.note : ""
    ].filter(Boolean)
  };
}

export function parseGrowthCsv(csvText = "") {
  const lines = String(csvText).trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split(",").map((item) => item.trim()) || [];
  return lines.map((line) => {
    const values = line.split(",");
    return headers.reduce((row, header, index) => {
      row[header] = values[index];
      return row;
    }, {});
  });
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
