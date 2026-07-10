import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const modulePath = path.resolve("D:/Escritorio/PROYECTO COGNICION/1-back/js/data/benzodiacepinas.js");
let code = fs.readFileSync(modulePath, "utf8");
code = code
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");
code += `\nreturn { BENZODIACEPINAS, FUENTES_BENZODIACEPINAS, obtenerBenzodiacepinaPorId, calcularDosisTotalDiaria, convertirBenzodiacepina, calcularDiazepamEquivalente, compararVidaMedia, validarDatosConversion, validarDatosFarmacologicos };`;
const api = new Function(code)();

const {
  BENZODIACEPINAS,
  obtenerBenzodiacepinaPorId,
  calcularDosisTotalDiaria,
  convertirBenzodiacepina,
  calcularDiazepamEquivalente,
  compararVidaMedia,
  validarDatosConversion,
  validarDatosFarmacologicos
} = api;

assert.equal(validarDatosFarmacologicos().length, 0, "El catalogo no debe tener errores estructurales");
assert.equal(new Set(BENZODIACEPINAS.map((b) => b.id)).size, BENZODIACEPINAS.length, "No debe haber IDs duplicados");
assert.equal(calcularDiazepamEquivalente("lorazepam", 2), 20);
assert.equal(convertirBenzodiacepina("diazepam", 10, "clonazepam").dosisDiariaDestino, 0.5);
assert.equal(convertirBenzodiacepina("lorazepam", 2, "clonazepam").dosisDiariaDestino, 1);
assert.equal(convertirBenzodiacepina("lorazepam", 2, "lorazepam").dosisDiariaDestino, 2);
const ida = convertirBenzodiacepina("alprazolam", 0.75, "diazepam");
const vuelta = convertirBenzodiacepina("diazepam", ida.dosisDiariaDestino, "alprazolam");
assert.ok(Math.abs(vuelta.dosisDiariaDestino - 0.75) < 0.000001, "La conversion A-B-A debe ser reversible matematicamente");
assert.equal(convertirBenzodiacepina("lorazepam", 0, "diazepam").dosisDiariaDestino, 0);
assert.equal(convertirBenzodiacepina("no_existe", 1, "diazepam"), null);
assert.equal(calcularDosisTotalDiaria("0,5", "cada_12"), 1);
assert.equal(calcularDosisTotalDiaria(1, "personalizada", 3), 3);
assert.equal(validarDatosConversion({ origenId: "", destinoId: "diazepam", dosis: "", dosisDiaria: NaN }).valido, false);
assert.ok(validarDatosConversion({ origenId: "diazepam", destinoId: "diazepam", dosis: 10, dosisDiaria: 10 }).advertencias.length > 0);
const comparacion = compararVidaMedia("lorazepam", "diazepam");
assert.ok(comparacion.destino.max > comparacion.origen.max, "El comparador debe conservar rangos de vida media");
const incompleto = [{ id: "x", nombre: "X", dosisReferenciaMg: 0, equivalenciaDiazepamMg: -1, vidaMediaMinHoras: -1, vidaMediaMaxHoras: 1, fuentes: [], fechaRevision: "" }];
assert.ok(validarDatosFarmacologicos(incompleto).length >= 4, "Debe detectar datos incompletos o invalidos");
console.log("Pruebas benzodiacepinas OK");