import assert from "node:assert/strict";
import {
  analizarInteraccionesPublicas,
  buscarMedicamentosParaConsulta,
  crearSeleccionMedicamento
} from "../services/interaccionesPublicas.js";

function first(query) {
  const result = buscarMedicamentosParaConsulta(query);
  assert.ok(result.length, `debe resolver ${query}`);
  return result[0];
}

const fluoxetina = first("fluoxetina");
const tramadol = first("tramadol");
const serotoninergicas = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(fluoxetina.medicamento),
  crearSeleccionMedicamento(tramadol.medicamento)
]);
assert.ok(serotoninergicas.some((alerta) => /serotonin/i.test(alerta.titulo)), "fluoxetina + tramadol debe alertar serotonina");

const captopril = first("captopril tabletas 25 mg");
assert.equal(captopril.medicamento.id, "captopril");
assert.ok(captopril.presentaciones.some((item) => /25\s*mg/i.test(item.texto)), "la búsqueda por presentación debe conservarla");
const losartan = first("losartan");
const sraa = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(captopril.medicamento, captopril.presentaciones[0]),
  crearSeleccionMedicamento(losartan.medicamento)
]);
assert.ok(sraa.some((alerta) => /SRAA|IECA|ARA/i.test(alerta.titulo)), "captopril + losartan debe alertar bloqueo dual");

const aripiprazol = first("aripiprazol tabletas 10 mg");
const duplicatePresentation = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(aripiprazol.medicamento, aripiprazol.presentaciones.find((item) => /10\s*mg/i.test(item.texto))),
  crearSeleccionMedicamento(aripiprazol.medicamento, aripiprazol.presentaciones.find((item) => /15\s*mg/i.test(item.texto)))
]);
assert.equal(duplicatePresentation.filter((alerta) => alerta.tipo === "duplicidad_terapeutica").length, 0, "las presentaciones no deben duplicar el principio activo");

console.log("interaccionesPublicas.test.mjs OK");
