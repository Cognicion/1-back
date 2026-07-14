import assert from "node:assert/strict";
import {
  MEDICAMENTOS_MAESTROS,
  MEDICAMENTOS_PRESENTACIONES,
  buscarMedicamentos,
  normalizarNombreMedicamento
} from "../data/medicamentos.js";
import { MEDICAMENTOS_SUPLEMENTARIOS } from "../data/medicamentosSuplementarios.js";
import { detectarInteraccionesFarmacologicas } from "../data/interaccionesFarmacologicas.js";

assert.ok(MEDICAMENTOS_SUPLEMENTARIOS.length >= 100, "El suplemento debe contener al menos 100 medicamentos nuevos.");
assert.ok(MEDICAMENTOS_MAESTROS.length >= 100, "El catálogo maestro debe exponer al menos 100 medicamentos.");
assert.ok(MEDICAMENTOS_PRESENTACIONES.length >= MEDICAMENTOS_MAESTROS.length, "Tratamiento debe tener al menos una opción por medicamento.");

const nombres = MEDICAMENTOS_MAESTROS.map((medicamento) => normalizarNombreMedicamento(medicamento.nombre));
assert.equal(new Set(nombres).size, nombres.length, "No debe haber medicamentos duplicados por nombre normalizado.");

assert.ok(buscarMedicamentos("sertralina").some((medicamento) => normalizarNombreMedicamento(medicamento.nombre) === "sertralina"));
assert.ok(buscarMedicamentos("metformina").some((medicamento) => normalizarNombreMedicamento(medicamento.nombre) === "metformina"));
assert.ok(buscarMedicamentos("amoxicilina clavulanato").some((medicamento) => normalizarNombreMedicamento(medicamento.nombre).includes("amoxicilina/clavulanato")));

const litioAine = detectarInteraccionesFarmacologicas([
  { medicamento: "Carbonato de litio, tabletas de 300 mg." },
  { medicamento: "Ibuprofeno, tabletas de 400 mg." }
]);
assert.ok(litioAine.some((interaccion) => interaccion.titulo.includes("litio")));

const estatinaMacrolido = detectarInteraccionesFarmacologicas([
  { medicamento: "Atorvastatina, tabletas de 40 mg." },
  { medicamento: "Claritromicina, tabletas de 500 mg." }
]);
assert.ok(estatinaMacrolido.some((interaccion) => interaccion.titulo.includes("estatinas")));

console.log(`Catálogo maestro validado: ${MEDICAMENTOS_MAESTROS.length} medicamentos, ${MEDICAMENTOS_PRESENTACIONES.length} presentaciones.`);
