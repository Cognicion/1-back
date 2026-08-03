import { calcularIMC } from "../../../utils/imc.js";

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function numberFrom(value = "") {
  const match = String(value || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeHeader(value = "") {
  const text = normalize(value);
  if (/presion arterial|\bpa\b|tension arterial|\bta\b/.test(text)) return "bloodPressure";
  if (/temperatura|temp/.test(text)) return "temperature";
  if (/frecuencia cardiaca|\bfc\b|cardiaca/.test(text)) return "heartRate";
  if (/frecuencia respiratoria|\bfr\b|respiratoria/.test(text)) return "respiratoryRate";
  if (/sato2|sat ?o2|saturacion|spo2/.test(text)) return "oxygenSaturation";
  if (/glucemia|glucosa/.test(text)) return "capillaryGlucose";
  if (/peso/.test(text)) return "weight";
  if (/talla|estatura/.test(text)) return "height";
  if (/\bimc\b|indice de masa/.test(text)) return "bmi";
  return "";
}

function parseBloodPressure(rawValue = "") {
  const match = String(rawValue || "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!match) return null;
  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
    unit: "mmHg",
    rawValue
  };
}

function parseSimple(rawValue = "", unit = "") {
  const value = numberFrom(rawValue);
  return value === null ? null : { value, unit, rawValue };
}

function assignVital(result, key, rawValue = "") {
  if (!key || !String(rawValue || "").trim()) return;
  if (key === "bloodPressure") result.bloodPressure = parseBloodPressure(rawValue);
  if (key === "temperature") result.temperature = parseSimple(rawValue, "°C");
  if (key === "heartRate") result.heartRate = parseSimple(rawValue, "lpm");
  if (key === "respiratoryRate") result.respiratoryRate = parseSimple(rawValue, "rpm");
  if (key === "oxygenSaturation") result.oxygenSaturation = parseSimple(rawValue, "%");
  if (key === "capillaryGlucose") result.capillaryGlucose = parseSimple(rawValue, "mg/dL") || { value: null, unit: "mg/dL", rawValue };
  if (key === "weight") result.weight = parseSimple(rawValue, "kg");
  if (key === "height") {
    const parsed = parseSimple(rawValue, /cm\b/i.test(rawValue) ? "cm" : "m");
    if (parsed?.value && parsed.unit === "cm") parsed.value = Number((parsed.value / 100).toFixed(2));
    if (parsed) parsed.unit = "m";
    result.height = parsed;
  }
  if (key === "bmi") result.bmi = parseSimple(rawValue, "kg/m²");
}

export function parseVitalSignsTable(table = {}) {
  const rows = table.rows || [];
  const result = {};
  if (!rows.length) return null;

  rows.forEach((row) => {
    for (let index = 0; index < row.length - 1; index += 1) {
      const key = normalizeHeader(row[index]);
      if (key && normalizeHeader(row[index + 1])) continue;
      if (key) assignVital(result, key, row[index + 1]);
    }
  });

  if (rows.length >= 2) {
    const headers = rows[0].map(normalizeHeader);
    const hasStructuredHeader = headers.filter(Boolean).length >= 2;
    if (hasStructuredHeader) {
      rows.slice(1).forEach((row) => {
        headers.forEach((key, index) => assignVital(result, key, row[index]));
      });
    }
  }

  if (result.weight?.value && result.height?.value) {
    const calculated = calcularIMC(result.weight.value, result.height.value);
    if (calculated !== null) {
      result.bmiCalculated = {
        value: calculated,
        unit: "kg/m²",
        source: "peso_talla"
      };
      if (result.bmi?.value !== undefined) {
        result.bmiDifference = Number(Math.abs(result.bmi.value - calculated).toFixed(2));
      }
    }
  }

  return Object.values(result).some(Boolean) ? result : null;
}

export function extractVitalSignsCandidates(blocks = []) {
  return blocks
    .filter((block) => block.type === "table")
    .map((block) => {
      const vitalSigns = parseVitalSignsTable(block);
      if (!vitalSigns) return null;
      return {
        id: `vitals-${block.source?.tableIndex ?? block.source?.blockIndex ?? 0}`,
        sourceType: "table",
        sourceLocation: block.source || {},
        include: true,
        vitalSigns
      };
    })
    .filter(Boolean);
}

export function vitalSignsToNotePayload(candidate = {}, fields = {}) {
  const data = candidate.vitalSigns || {};
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : "";
  const pressure = data.bloodPressure ? `${data.bloodPressure.systolic}/${data.bloodPressure.diastolic}` : "";
  const imcValue = finite(data.bmi?.value) || finite(data.bmiCalculated?.value);
  return {
    presionArterial: pressure,
    temperatura: finite(data.temperature?.value),
    frecuenciaCardiaca: finite(data.heartRate?.value),
    frecuenciaRespiratoria: finite(data.respiratoryRate?.value),
    saturacionO2: finite(data.oxygenSaturation?.value),
    glucosa: finite(data.capillaryGlucose?.value),
    peso: finite(data.weight?.value),
    talla: finite(data.height?.value),
    imc: imcValue,
    fechaNota: fields.fecha || "",
    horaNota: fields.hora || "",
    fechaToma: fields.fecha || "",
    horaToma: fields.hora || ""
  };
}
