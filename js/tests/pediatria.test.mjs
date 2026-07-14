import assert from "node:assert/strict";
import { calcularEdadPediatrica } from "../pediatria/edad.js";
import { calcularIMC, mantenimientoHollidaySegar, normalizarTallaCm, superficieCorporal } from "../pediatria/formulas.js";
import { calcularDosisMedicamento } from "../pediatria/medicamentos.js";

const edad = calcularEdadPediatrica("2020-01-15", "2026-07-13");
assert.equal(edad.anos, 6);
assert.equal(edad.meses, 5);
assert.equal(edad.dias, 28);

assert.equal(mantenimientoHollidaySegar(25).mlDia, 1600);
assert.equal(mantenimientoHollidaySegar(40).mlDia, 1900);
assert.ok(Math.abs(calcularIMC(20, 110) - 16.5289) < 0.01);
assert.ok(Math.abs(calcularIMC(40, 150) - 17.7777) < 0.01);
assert.ok(Math.abs(calcularIMC(40, 1.5) - 17.7777) < 0.01);
assert.equal(normalizarTallaCm(1.5), 150);
assert.equal(normalizarTallaCm(150), 150);
assert.ok(superficieCorporal(20, 110).mosteller > 0.7);
assert.ok(Math.abs(superficieCorporal(40, 150).mosteller - 1.2909) < 0.01);
assert.ok(Math.abs(superficieCorporal(40, 1.5).mosteller - 1.2909) < 0.01);
assert.ok(Math.abs(superficieCorporal(40, 150).haycock - 1.2858) < 0.01);

const dosis = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 20,
  concentracionMgMl: 160 / 5,
  pesoConfirmado: true
});
assert.equal(dosis.error, undefined);
assert.equal(Math.round(dosis.mgDosis), 300);
assert.ok(dosis.volumenMlDosis > 9);

const dosis40 = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 40,
  concentracionMgMl: 160 / 5,
  pesoConfirmado: true
});
assert.equal(Math.round(dosis40.mgDosis), 600);
assert.ok(Math.abs(dosis40.volumenMlDosis - 18.75) < 0.01);

const bloqueada = calcularDosisMedicamento({
  medicamentoId: "paracetamol",
  pesoKg: 20,
  pesoConfirmado: false
});
assert.ok(bloqueada.error.includes("Confirma"));

console.log("pediatria tests ok");
