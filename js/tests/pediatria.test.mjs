import assert from "node:assert/strict";
import { calcularEdadPediatrica } from "../pediatria/edad.js";
import {
  analizarTalla,
  calcularIMC,
  mantenimientoHollidaySegar,
  mantenimientoHollidaySegarDetalle,
  normalizarConcentracionMgMl,
  normalizarTallaCm,
  superficieCorporal
} from "../pediatria/formulas.js";
import { calcularDosisMedicamento } from "../pediatria/medicamentos.js";

const edad = calcularEdadPediatrica("2020-01-15", "2026-07-13");
assert.equal(edad.años, 6);
assert.equal(edad.meses, 5);
assert.equal(edad.dias, 28);
assert.equal(calcularEdadPediatrica("2030-01-01", "2026-07-13"), null);

assert.equal(mantenimientoHollidaySegar(25).mlDia, 1600);
assert.equal(mantenimientoHollidaySegar(40).mlDia, 1900);
assert.equal(mantenimientoHollidaySegarDetalle(40).formulaTexto, "10 kg x 100 + 10 kg x 50 + 20 kg x 20");
assert.ok(Math.abs(calcularIMC(20, 110) - 16.5289) < 0.01);
assert.ok(Math.abs(calcularIMC(40, 150) - 17.7777) < 0.01);
assert.ok(Math.abs(calcularIMC(40, 1.5) - 17.7777) < 0.01);
assert.equal(normalizarTallaCm(1.5), 150);
assert.equal(normalizarTallaCm(150), 150);
assert.equal(normalizarTallaCm("1.50 cm"), null);
assert.equal(analizarTalla("1.50 cm").valido, false);
assert.equal(analizarTalla("1.50 m").valorCm, 150);
assert.ok(superficieCorporal(20, 110).mosteller > 0.7);
assert.ok(Math.abs(superficieCorporal(40, 150).mosteller - 1.2909) < 0.01);
assert.ok(Math.abs(superficieCorporal(40, 1.5).mosteller - 1.2909) < 0.01);
assert.ok(Math.abs(superficieCorporal(40, 150).haycock - 1.2858) < 0.01);
assert.equal(normalizarConcentracionMgMl("160 mg/5 mL"), 32);
assert.equal(normalizarConcentracionMgMl("32"), 32);

const dosis = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 20,
  concentracionMgMl: 160 / 5,
  pesoConfirmado: true
});
assert.equal(dosis.error, undefined);
assert.equal(Math.round(dosis.mgDosis), 300);
assert.ok(dosis.volumenMlDosis > 9);

const dosisConTexto = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 20,
  concentracionMgMl: "160 mg/5 mL",
  pesoConfirmado: true
});
assert.ok(Math.abs(dosisConTexto.volumenMlDosis - 9.375) < 0.01);

const dosis40 = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 40,
  concentracionMgMl: 160 / 5,
  pesoConfirmado: true
});
assert.equal(Math.round(dosis40.mgDosis), 600);
assert.ok(Math.abs(dosis40.volumenMlDosis - 18.75) < 0.01);

const dosisSinConcentracion = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 40,
  pesoConfirmado: true
});
assert.equal(Math.round(dosisSinConcentracion.mgDosis), 600);
assert.equal(dosisSinConcentracion.volumenMlDosis, null);

const bloqueada = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 20,
  pesoConfirmado: false
});
assert.ok(bloqueada.error.includes("Confirma"));

const pesoInvalido = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 0,
  pesoConfirmado: true
});
assert.ok(pesoInvalido.error.includes("peso"));

const dosisLimitada = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 80,
  pesoConfirmado: true
});
assert.ok(dosisLimitada.mgDia <= 4000);
assert.ok(dosisLimitada.advertencias.length > 0);

console.log("pediatria tests ok");
