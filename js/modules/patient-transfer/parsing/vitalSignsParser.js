import { parseVitalSignsTable as parseNativeVitalSignsTable } from "../../clinical-document-engine/parsers/vitalSignsParser.js";
import { adaptVitalSignsCandidates } from "../../clinical-document-engine/adapters/vitalSignsAdapter.js";

/** Adaptador temporal: mantiene el contrato histórico del importador. */
export function parseVitalSignsTable(table = {}) {
  const entities = parseNativeVitalSignsTable(table);
  const candidate = adaptVitalSignsCandidates({ blocks: [table] })[0];
  return candidate?.vitalSigns || (entities.length ? {} : null);
}

export function extractVitalSignsCandidates(blocks = [], fields = {}) {
  return adaptVitalSignsCandidates({ blocks, date: fields.fecha || "", time: fields.hora || "" });
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
