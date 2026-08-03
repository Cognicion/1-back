import assert from "node:assert/strict";
import { extractVitalSignsCandidates, parseVitalSignsTable, vitalSignsToNotePayload } from "../js/modules/patient-transfer/parsing/vitalSignsParser.js";

const table = {
  type: "table",
  rows: [
    ["Presión arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2", "Glucemia capilar", "Peso", "Talla", "IMC"],
    ["108/76 mmHg", "36.4 °C", "97 lpm", "20 rpm", "97 %", "", "72 kg", "1.67 m", "25.81 kg/m²"]
  ],
  source: { blockIndex: 4, tableIndex: 0 }
};

const vital = parseVitalSignsTable(table);
assert.equal(vital.bloodPressure.systolic, 108);
assert.equal(vital.bloodPressure.diastolic, 76);
assert.equal(vital.temperature.value, 36.4);
assert.equal(vital.heartRate.value, 97);
assert.equal(vital.respiratoryRate.value, 20);
assert.equal(vital.oxygenSaturation.value, 97);
assert.equal(vital.capillaryGlucose, undefined);
assert.equal(vital.weight.value, 72);
assert.equal(vital.height.value, 1.67);
assert.equal(vital.bmi.value, 25.81);
assert.equal(vital.bmiCalculated.value, 25.82);
assert.equal(vital.bmiDifference, 0.01);

const candidates = extractVitalSignsCandidates([table]);
assert.equal(candidates.length, 1);
const payload = vitalSignsToNotePayload(candidates[0], { fecha: "31/07/2026", hora: "21:00" });
assert.deepEqual(payload, {
  presionArterial: "108/76",
  temperatura: 36.4,
  frecuenciaCardiaca: 97,
  frecuenciaRespiratoria: 20,
  saturacionO2: 97,
  glucosa: "",
  peso: 72,
  talla: 1.67,
  imc: 25.81,
  fechaNota: "31/07/2026",
  horaNota: "21:00",
  fechaToma: "31/07/2026",
  horaToma: "21:00"
});

console.log("patient-transfer-vital-signs.test.mjs OK");
