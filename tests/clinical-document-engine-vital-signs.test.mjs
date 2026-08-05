import assert from "node:assert/strict";
import { parseVitalSigns, parseVitalSignsText } from "../js/modules/clinical-document-engine/parsers/vitalSignsParser.js";
import { adaptVitalSignsCandidates } from "../js/modules/clinical-document-engine/adapters/vitalSignsAdapter.js";
import { EntityFactory } from "../js/modules/clinical-document-engine/engine/EntityFactory.js";
import { EntityValidationEngine } from "../js/modules/clinical-document-engine/engine/EntityValidationEngine.js";

const table = {
  type: "table",
  rows: [
    ["Presión arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2", "Glucemia capilar", "Peso", "Talla", "IMC"],
    ["120/80 mmHg", "36.5 °C", "75 lpm", "18 rpm", "95 %", "110 mg/dL", "72 kg", "1.67 m", "25.81 kg/m²"]
  ],
  source: { blockIndex: 9, tableIndex: 2 }
};

const candidates = parseVitalSigns({ blocks: [table], documentId: "doc-vitals", noteId: "note-1", date: "31/07/2026", time: "21:00" });
assert.equal(candidates.length, 9);
assert.equal(candidates.every((candidate) => candidate.candidateType === "vitalSign"), true);
assert.equal(candidates.find((candidate) => candidate.vitalType === "bloodPressure").value.systolic, 120);
assert.equal(candidates.find((candidate) => candidate.vitalType === "temperature").unit, "°C");
assert.equal(candidates.find((candidate) => candidate.vitalType === "capillaryGlucose").value, 110);
assert.equal(candidates.find((candidate) => candidate.vitalType === "height").value, 1.67);
assert.equal(candidates[0].evidence[0].documentId, "doc-vitals");
assert.equal(candidates[0].evidence[0].block, 9);
assert.equal(candidates[0].confidence, "HIGH");

const adapted = adaptVitalSignsCandidates({ blocks: [table], date: "31/07/2026", time: "21:00" });
assert.equal(adapted.length, 1);
assert.equal(adapted[0].vitalSigns.bloodPressure.systolic, 120);
assert.equal(adapted[0].vitalSigns.bmiCalculated.value, 25.82);
assert.equal(adapted[0].vitalSigns.bmiDifference, 0.01);
assert.equal(adapted[0].entities.length, 9);

const textCandidates = parseVitalSignsText("PA: 100/60; Temperatura: 36; FC: 62; FR: 18; SatO2: 96%; Peso: 72 kg; Talla: 1.67 m; IMC: 25.81", { documentId: "doc-text" });
assert.equal(textCandidates.length, 8);
assert.equal(textCandidates.find((candidate) => candidate.vitalType === "bloodPressure").confidence, "MEDIUM");

const invalid = EntityFactory.fromCandidate({ ...candidates[0], id: "invalid", value: { systolic: -1, diastolic: 80 } });
const validation = new EntityValidationEngine().validate(invalid);
assert.equal(validation.valid, false);
assert.ok(validation.errors.includes("bloodPressure"));

console.log("clinical-document-engine-vital-signs: ok");
