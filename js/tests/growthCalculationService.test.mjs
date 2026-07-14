import assert from "node:assert/strict";
import {
  buildGrowthAssessment,
  calculateZScoreFromLms,
  normalizePediatricMeasurements,
  normalizeText,
  parseGrowthCsv
} from "../services/growth/growthCalculationService.js";

assert.equal(normalizeText("José Hernández"), "jose hernandez");

const z = calculateZScoreFromLms(16, 1, 16, 0.1);
assert.ok(Math.abs(z.z) < 0.001);
assert.ok(z.percentile > 49 && z.percentile < 51);

const parsed = parseGrowthCsv("Sex,Agemos,L,M,S\n1,24,1,12,0.1\n");
assert.equal(parsed.length, 1);
assert.equal(parsed[0].Agemos, "24");

const measurements = normalizePediatricMeasurements({
  sexo: "Masculino",
  fechaNacimiento: "2020-01-01",
  fechaMedicion: "2026-01-01",
  pesoKg: "20",
  tallaCm: "1.15"
});
assert.equal(measurements.sex, "male");
assert.equal(Math.round(measurements.heightCm), 115);
assert.ok(measurements.bmi > 15);

const assessment = buildGrowthAssessment({
  sexo: "Femenino",
  fechaNacimiento: "2020-01-01",
  fechaMedicion: "2026-01-01",
  pesoKg: "21",
  tallaCm: "118",
  referenceId: "who_2006_0_5"
});
assert.equal(assessment.canCalculatePercentiles, false);
assert.ok(assessment.alerts.some((alert) => alert.includes("requiere importar") || alert.includes("requiere")));
assert.equal(assessment.indicators.some((item) => item.id === "bmi_for_age"), true);

console.log("growthCalculationService: ok");
