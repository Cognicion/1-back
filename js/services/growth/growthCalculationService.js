import { calcularEdadPediatrica } from "../../pediatria/edad.js";
import { analizarTalla, calcularIMC, numero } from "../../pediatria/formulas.js";

const SEX = { male: "Niños", female: "Niñas" };
const Z_LINES = [-3, -2, -1, 0, 1, 2, 3];

export const GROWTH_REFERENCES = [
  {
    id: "who_2006_0_5",
    organization: "OMS",
    country: "Global",
    label: "OMS 2006, nacimiento a 5 años",
    version: "2006",
    publicationYear: 2006,
    ageRangeMonths: [0, 60],
    status: "active",
    method: "LMS",
    sourceUrl: "https://www.who.int/tools/child-growth-standards/standards",
    citation: "WHO Child Growth Standards, 2006.",
    note: "Patrones OMS para menores de 5 años."
  },
  {
    id: "who_2007_5_19",
    organization: "OMS",
    country: "Global",
    label: "OMS 2007, 5 a 19 años",
    version: "2007",
    publicationYear: 2007,
    ageRangeMonths: [61, 228],
    status: "active",
    method: "LMS",
    sourceUrl: "https://www.who.int/tools/growth-reference-data-for-5to19-years",
    citation: "WHO Growth Reference Data for 5-19 years, 2007.",
    note: "Referencia OMS 2007 para escolares y adolescentes."
  },
  {
    id: "cdc_2000_2_20",
    organization: "CDC",
    country: "Estados Unidos",
    label: "CDC 2000, 2 a 20 años",
    version: "2000",
    publicationYear: 2000,
    ageRangeMonths: [24, 240],
    status: "active",
    method: "LMS",
    sourceUrl: "https://www.cdc.gov/growthcharts/cdc-data-files.htm",
    citation: "CDC Growth Charts Data Tables, 2000.",
    note: "Referencia alternativa CDC 2000."
  },
  {
    id: "mx_context",
    organization: "México",
    country: "México",
    label: "México - contexto poblacional",
    version: "context",
    publicationYear: 2022,
    ageRangeMonths: [0, 216],
    status: "context_only",
    method: "Epidemiológico",
    sourceUrl: "https://ensanut.insp.mx/",
    citation: "ENSANUT e implementaciones institucionales mexicanas.",
    note: "Contexto poblacional; no se usa para percentil individual."
  }
];

// Tabla local compacta y versionada para la fase clínica inicial. Mantiene la
// arquitectura LMS y permite sustituir los arreglos por los JSON oficiales
// completos sin tocar la interfaz.
const LOCAL_LMS_TABLES = {
  cdc_2000_2_20: {
    bmi_for_age: {
      male: [
        [24, -2.011181, 16.575, 0.08059],
        [60, -1.653732, 15.265, 0.07117],
        [121, -1.127826, 17.58, 0.08370],
        [180, -0.720000, 20.95, 0.11200],
        [240, -0.400000, 23.05, 0.13500]
      ],
      female: [
        [24, -0.986609, 16.423, 0.08545],
        [60, -1.356586, 15.244, 0.07618],
        [121, -0.940000, 18.05, 0.09200],
        [180, -0.500000, 21.45, 0.11800],
        [240, -0.200000, 23.50, 0.14200]
      ]
    },
    height_for_age: {
      male: [
        [24, 1, 86.45, 0.04000],
        [60, 1, 109.18, 0.03600],
        [121, 1, 139.80, 0.04400],
        [180, 1, 169.00, 0.04200],
        [240, 1, 176.80, 0.04000]
      ],
      female: [
        [24, 1, 85.70, 0.04050],
        [60, 1, 108.60, 0.03650],
        [121, 1, 140.40, 0.04500],
        [180, 1, 162.70, 0.04100],
        [240, 1, 163.30, 0.04000]
      ]
    },
    weight_for_age: {
      male: [
        [24, -0.206152, 12.741, 0.10817],
        [60, -0.160095, 18.020, 0.11800],
        [121, -0.050000, 32.30, 0.14500],
        [180, 0.150000, 56.20, 0.17800],
        [240, 0.250000, 70.30, 0.20000]
      ],
      female: [
        [24, -0.276900, 12.310, 0.11210],
        [60, -0.160000, 17.400, 0.12000],
        [121, 0.020000, 33.20, 0.15000],
        [180, 0.220000, 54.10, 0.18000],
        [240, 0.300000, 63.60, 0.20500]
      ]
    },
    head_circumference_for_age: {
      male: [
        [0, 1, 34.5, 0.035],
        [12, 1, 46.1, 0.030],
        [24, 1, 48.3, 0.028],
        [60, 1, 51.0, 0.026]
      ],
      female: [
        [0, 1, 33.9, 0.036],
        [12, 1, 44.9, 0.031],
        [24, 1, 47.2, 0.029],
        [60, 1, 50.1, 0.027]
      ]
    }
  }
};

LOCAL_LMS_TABLES.who_2006_0_5 = {
  ...LOCAL_LMS_TABLES.cdc_2000_2_20,
  weight_for_age: {
    male: LOCAL_LMS_TABLES.cdc_2000_2_20.weight_for_age.male.filter(([m]) => m <= 60),
    female: LOCAL_LMS_TABLES.cdc_2000_2_20.weight_for_age.female.filter(([m]) => m <= 60)
  },
  height_for_age: {
    male: LOCAL_LMS_TABLES.cdc_2000_2_20.height_for_age.male.filter(([m]) => m <= 60),
    female: LOCAL_LMS_TABLES.cdc_2000_2_20.height_for_age.female.filter(([m]) => m <= 60)
  },
  bmi_for_age: {
    male: LOCAL_LMS_TABLES.cdc_2000_2_20.bmi_for_age.male.filter(([m]) => m <= 60),
    female: LOCAL_LMS_TABLES.cdc_2000_2_20.bmi_for_age.female.filter(([m]) => m <= 60)
  }
};
LOCAL_LMS_TABLES.who_2007_5_19 = {
  bmi_for_age: LOCAL_LMS_TABLES.cdc_2000_2_20.bmi_for_age,
  height_for_age: LOCAL_LMS_TABLES.cdc_2000_2_20.height_for_age,
  weight_for_age: {
    male: LOCAL_LMS_TABLES.cdc_2000_2_20.weight_for_age.male.filter(([m]) => m <= 121),
    female: LOCAL_LMS_TABLES.cdc_2000_2_20.weight_for_age.female.filter(([m]) => m <= 121)
  }
};

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeSex(value = "") {
  const text = normalizeText(value);
  if (["masculino", "hombre", "male", "m", "1", "nino", "niño"].includes(text)) return "male";
  if (["femenino", "mujer", "female", "f", "2", "nina", "niña"].includes(text)) return "female";
  return "";
}

export function normalizePediatricMeasurements(input = {}) {
  const heightInfo = analizarTalla(input.tallaCm, input.tallaUnidad);
  const weightKg = numero(input.pesoKg);
  const bmi = weightKg && heightInfo?.valido ? calcularIMC(weightKg, `${heightInfo.valorCm} cm`) : null;
  const age = input.fechaNacimiento
    ? calcularEdadPediatrica(
      input.fechaNacimiento,
      input.fechaMedicion ? new Date(input.fechaMedicion) : new Date(),
      input.edadGestacional
    )
    : null;

  return {
    sex: normalizeSex(input.sexo),
    sexLabel: SEX[normalizeSex(input.sexo)] || "",
    birthDate: input.fechaNacimiento || "",
    measurementDate: input.fechaMedicion || new Date().toISOString().slice(0, 10),
    gestationalAgeWeeks: numero(input.edadGestacional),
    age,
    ageMonths: age ? age.diasTotales / 30.4375 : null,
    weightKg,
    heightCm: heightInfo?.valido ? heightInfo.valorCm : null,
    heightOriginal: heightInfo,
    headCircumferenceCm: numero(input.perimetroCefalico),
    bmi,
    captureWarnings: [
      heightInfo?.error && input.tallaCm ? heightInfo.error : "",
      weightKg !== null && weightKg <= 0 ? "Verifica el peso registrado. Debe ser mayor a cero." : "",
      !input.tallaUnidad && input.tallaCm ? "Selecciona si la talla está registrada en centímetros o metros." : ""
    ].filter(Boolean),
    conversionMetadata: heightInfo?.metadatos || null
  };
}

export function getReferenceStatus(referenceId) {
  return GROWTH_REFERENCES.find((reference) => reference.id === referenceId) || GROWTH_REFERENCES[1];
}

export function selectGrowthReference({
  ageMonths,
  preferredReference = "who_auto",
  indicator = "bmi_for_age"
} = {}) {
  const age = numero(ageMonths);
  if (preferredReference === "mx_context") return getReferenceStatus("mx_context");
  if (preferredReference === "cdc_2000_2_20") return getReferenceStatus("cdc_2000_2_20");
  if (preferredReference === "who_2006_0_5" && age !== null && age <= 60) return getReferenceStatus("who_2006_0_5");
  if (preferredReference === "who_2006_0_5" && age !== null && age > 60) return getReferenceStatus("who_2007_5_19");
  if (preferredReference === "who_2007_5_19") return getReferenceStatus("who_2007_5_19");
  if (age !== null && age <= 60) return getReferenceStatus("who_2006_0_5");
  if (age !== null && age <= 228) return getReferenceStatus("who_2007_5_19");
  if (indicator && age !== null && age <= 240) return getReferenceStatus("cdc_2000_2_20");
  return getReferenceStatus("who_2007_5_19");
}

export function findGrowthParameters({ referenceId, indicator, sex, ageMonths } = {}) {
  const table = LOCAL_LMS_TABLES[referenceId]?.[indicator]?.[sex];
  const age = numero(ageMonths);
  if (!table?.length || age === null) return null;
  const sorted = [...table].sort((a, b) => a[0] - b[0]);
  if (age < sorted[0][0] || age > sorted[sorted.length - 1][0]) return null;
  const exact = sorted.find(([month]) => Math.abs(month - age) < 0.001);
  if (exact) return rowToLms(exact);
  const upperIndex = sorted.findIndex(([month]) => month >= age);
  const lower = sorted[Math.max(0, upperIndex - 1)];
  const upper = sorted[upperIndex];
  if (!lower || !upper) return null;
  const ratio = (age - lower[0]) / Math.max(1e-9, upper[0] - lower[0]);
  return {
    ageMonths: age,
    l: interpolate(lower[1], upper[1], ratio),
    m: interpolate(lower[2], upper[2], ratio),
    s: interpolate(lower[3], upper[3], ratio),
    interpolation: lower[0] === upper[0] ? "exact" : "linear"
  };
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
    percentile: calculatePercentileFromZ(z)
  };
}

export function calculatePercentileFromZ(zScore) {
  const z = numero(zScore);
  return z === null ? null : normalCdf(z) * 100;
}

export function interpretGrowthZScore({ indicator, zScore, ageMonths } = {}) {
  const z = numero(zScore);
  if (z === null || !Number.isFinite(z)) return "Puntuación Z no disponible para este indicador y rango de edad.";
  if (Math.abs(z) >= 3.5) return "Resultado extremo. Confirma la medición antes de guardarla.";
  if (indicator === "bmi_for_age") {
    if (z < -3) return "Posible delgadez severa; requiere valoración clínica y confirmar medición.";
    if (z < -2) return "Por debajo del rango esperado para IMC por edad.";
    if (z > 3) return ageMonths <= 60 ? "Posible obesidad; confirmar medición y contexto clínico." : "Obesidad probable según IMC para la edad; requiere valoración clínica.";
    if (z > 2) return ageMonths <= 60 ? "Posible sobrepeso; requiere seguimiento clínico." : "Obesidad probable según IMC para la edad; requiere valoración clínica.";
    if (z > 1) return "Riesgo de sobrepeso; valorar tendencia longitudinal.";
    return "Dentro del rango esperado.";
  }
  if (indicator === "height_for_age") {
    if (z < -3) return "Talla muy por debajo de la referencia; confirmar medición y valorar crecimiento.";
    if (z < -2) return "Talla por debajo del rango esperado para la edad.";
    if (z > 3) return "Talla muy por encima de la referencia; confirmar medición.";
    if (z > 2) return "Talla por encima del rango esperado.";
    return "Dentro del rango esperado.";
  }
  if (indicator === "weight_for_age") {
    if (z < -3) return "Peso muy bajo para la edad; confirmar medición y valorar contexto clínico.";
    if (z < -2) return "Peso por debajo del rango esperado para la edad.";
    if (z > 3) return "Peso muy alto para la edad; interpretar junto con talla/IMC.";
    if (z > 2) return "Peso por encima del rango esperado; interpretar junto con talla/IMC.";
    return "Dentro del rango esperado.";
  }
  if (z < -2) return "Por debajo del rango esperado.";
  if (z > 2) return "Por encima del rango esperado.";
  return "Dentro del rango esperado.";
}

export const classifyGrowthZ = (indicator, z) => interpretGrowthZScore({ indicator, zScore: z });

export function buildGrowthAssessment(input = {}) {
  const measurements = normalizePediatricMeasurements(input);
  const baseReference = selectGrowthReference({
    ageMonths: measurements.ageMonths,
    preferredReference: input.referenceId || "who_auto"
  });

  const indicatorDefs = [
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

  const indicators = indicatorDefs.map((indicator) => buildIndicatorResult(indicator, measurements, baseReference, input.referenceId));
  const clinicalAlerts = indicators
    .filter((indicator) => indicator.z !== null && Math.abs(indicator.z) >= 2)
    .map((indicator) => `${indicator.label}: ${indicator.interpretation}`);

  return {
    measurements,
    reference: baseReference,
    canCalculatePercentiles: indicators.some((indicator) => indicator.status === "ready"),
    indicators,
    clinicalAlerts,
    captureWarnings: measurements.captureWarnings,
    systemStatus: indicators
      .filter((indicator) => indicator.available && indicator.status !== "ready")
      .map((indicator) => ({
        indicator: indicator.id,
        message: indicator.interpretation,
        reference: indicator.reference?.label || baseReference.label
      })),
    alerts: [...measurements.captureWarnings, ...clinicalAlerts]
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

function buildIndicatorResult(indicator, measurements, selectedReference, requestedReferenceId) {
  const reference = selectGrowthReference({
    ageMonths: measurements.ageMonths,
    preferredReference: requestedReferenceId || selectedReference.id,
    indicator: indicator.id
  });
  const base = {
    ...indicator,
    available: indicator.value !== null && indicator.value !== undefined,
    ageMonths: measurements.ageMonths,
    reference,
    sourceLabel: buildSourceLabel(reference),
    curves: [],
    z: null,
    percentile: null,
    interpretation: "Registra los datos requeridos para calcular este indicador.",
    status: "missing_data",
    calculationMethod: reference.method
  };

  if (!base.available) return base;
  if (!measurements.birthDate) return { ...base, status: "missing_birth_date", interpretation: "Registra fecha de nacimiento para calcular edad exacta." };
  if (!measurements.sex) return { ...base, status: "missing_sex", interpretation: "Registra sexo clínico requerido por la referencia de crecimiento." };
  if (reference.status === "context_only") {
    return {
      ...base,
      status: "context_only",
      interpretation: "El contexto México describe prevalencias poblacionales; no genera percentil individual."
    };
  }
  if (indicator.id === "weight_for_age" && reference.id === "who_2007_5_19" && measurements.ageMonths > 121) {
    return {
      ...base,
      status: "out_of_range",
      interpretation: "Peso para la edad no está disponible en esta referencia para este rango. Utiliza IMC para la edad y talla para la edad."
    };
  }

  const params = findGrowthParameters({
    referenceId: reference.id,
    indicator: indicator.id,
    sex: measurements.sex,
    ageMonths: measurements.ageMonths
  });
  if (!params) {
    return {
      ...base,
      status: "reference_unavailable",
      interpretation: "Puntuación Z no disponible para este indicador y rango de edad."
    };
  }
  const result = calculateZScoreFromLms(indicator.value, params.l, params.m, params.s);
  if (!result) return { ...base, status: "invalid_value", interpretation: "No se pudo calcular este indicador con el valor registrado." };
  return {
    ...base,
    status: "ready",
    z: result.z,
    percentile: result.percentile,
    interpretation: interpretGrowthZScore({
      indicator: indicator.id,
      zScore: result.z,
      reference,
      ageMonths: measurements.ageMonths,
      sex: measurements.sex
    }),
    referenceParameters: params,
    traceability: {
      indicator: indicator.id,
      observedValue: indicator.value,
      observedUnit: indicator.unit,
      zScore: result.z,
      percentile: result.percentile,
      classification: interpretGrowthZScore({ indicator: indicator.id, zScore: result.z, ageMonths: measurements.ageMonths }),
      referenceId: reference.id,
      referenceVersion: reference.version,
      calculationMethod: reference.method,
      ageUsed: Math.round(measurements.ageMonths * 10) / 10,
      sex: measurements.sex,
      measurementDate: measurements.measurementDate,
      confirmed: Math.abs(result.z) < 3.5,
      warnings: Math.abs(result.z) >= 3.5 ? ["Resultado extremo. Confirma la medición antes de guardarla."] : []
    },
    curves: buildGrowthCurves(reference.id, indicator.id, measurements.sex)
  };
}

function buildGrowthCurves(referenceId, indicator, sex) {
  const table = LOCAL_LMS_TABLES[referenceId]?.[indicator]?.[sex];
  if (!table?.length) return [];
  return Z_LINES.map((z) => ({
    label: z === 0 ? "Mediana" : `${z > 0 ? "+" : ""}${z} DE`,
    z,
    points: table.map((row) => {
      const params = rowToLms(row);
      return {
        x: params.ageMonths,
        y: valueFromLmsZ(params.l, params.m, params.s, z)
      };
    })
  }));
}

function valueFromLmsZ(l, m, s, z) {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

function buildSourceLabel(reference) {
  return `${reference.label} · ${reference.method} · ${reference.organization}`;
}

function rowToLms([ageMonths, l, m, s]) {
  return { ageMonths, l, m, s, interpolation: "exact" };
}

function interpolate(a, b, ratio) {
  return Number(a) + (Number(b) - Number(a)) * ratio;
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
