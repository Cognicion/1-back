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
const sertralina = first("sertralina");
const tramadol = first("tramadol");
const serotoninergicas = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(fluoxetina.medicamento),
  crearSeleccionMedicamento(tramadol.medicamento)
]);
assert.ok(serotoninergicas.some((alerta) => /serotonin/i.test(alerta.titulo)), "fluoxetina + tramadol debe alertar serotonina");

const dobleIsrs = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(fluoxetina.medicamento),
  crearSeleccionMedicamento(sertralina.medicamento)
]);
assert.ok(dobleIsrs.length > 0, "fluoxetina + sertralina no debe devolver cero alertas");
assert.ok(dobleIsrs.some((alerta) => alerta.categoria === "serotoninergica" && alerta.severidad === "alta"), "debe alertar combinación serotoninérgica");
assert.ok(dobleIsrs.some((alerta) => alerta.categoria === "duplicidad_terapeutica"), "debe alertar duplicidad ISRS");

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

const qt = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(first("escitalopram").medicamento),
  crearSeleccionMedicamento(first("haloperidol").medicamento)
]);
assert.ok(qt.some((alerta) => alerta.categoria === "qt"), "escitalopram + haloperidol debe alertar QT");

const depresores = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(first("clonazepam").medicamento),
  crearSeleccionMedicamento(first("morfina").medicamento),
  crearSeleccionMedicamento(first("pregabalina").medicamento)
]);
assert.ok(depresores.some((alerta) => alerta.categoria === "depresora_snc"), "depresores del SNC deben generar alerta");

const litioRenal = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(first("litio").medicamento),
  crearSeleccionMedicamento(first("losartan").medicamento),
  crearSeleccionMedicamento(first("ibuprofeno").medicamento),
  crearSeleccionMedicamento(first("hidroclorotiazida").medicamento)
]);
assert.ok(litioRenal.some((alerta) => /litio/i.test(alerta.titulo)), "litio debe alertar con ARA-II, AINE o diurético");

const cardiometabolicos = analizarInteraccionesPublicas([
  crearSeleccionMedicamento(first("semaglutida").medicamento),
  crearSeleccionMedicamento(first("dapagliflozina").medicamento)
]);
assert.equal(cardiometabolicos.filter((alerta) => ["alta", "contraindicada"].includes(alerta.severidad)).length, 0, "semaglutida + dapagliflozina no debe generar alerta grave automática");

console.log("interaccionesPublicas.test.mjs OK");
