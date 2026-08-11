import test from "node:test";
import assert from "node:assert/strict";

import {
  CITOCROMOS_FARMACOLOGICOS,
  detectarInteraccionesPorCitocromos,
  obtenerRelacionesCitocromoPorMedicamento
} from "../js/data/citocromosFarmacologicos.js";
import { MEDICAMENTOS_MAESTROS } from "../js/data/catalogoFarmacologicoUnificado.js";
import {
  evaluarInteraccionesClinicas,
  normalizarMedicamentoClinico
} from "../js/services/motorClinicoMedicamentos.js";

test("existe un solo catálogo CYP con isoenzimas farmacológicas humanas relevantes", () => {
  const ids = CITOCROMOS_FARMACOLOGICOS.map((item) => item.id);
  assert.equal(ids.length, new Set(ids).size);
  ["CYP1A1", "CYP1A2", "CYP1B1", "CYP2A6", "CYP2B6", "CYP2C8", "CYP2C9", "CYP2C18", "CYP2C19", "CYP2D6", "CYP2E1", "CYP2J2", "CYP3A4", "CYP3A5", "CYP3A7", "CYP4F2"]
    .forEach((id) => assert.ok(ids.includes(id), `Falta ${id}`));
});

test("cada relación CYP apunta a un medicamento del catálogo maestro", () => {
  const idsMedicamentos = new Set(MEDICAMENTOS_MAESTROS.map((item) => item.id));
  const huerfanas = CITOCROMOS_FARMACOLOGICOS.flatMap((citocromo) =>
    citocromo.relaciones
      .filter((relacion) => !idsMedicamentos.has(relacion.medicationId))
      .map((relacion) => `${citocromo.id}:${relacion.medicationId}`)
  );
  assert.deepEqual(huerfanas, []);
});

test("las relaciones por medicamento conservan metabolismo, inhibición e inducción", () => {
  assert.ok(obtenerRelacionesCitocromoPorMedicamento("fluvoxamina").some((item) => item.citocromoId === "CYP1A2" && item.rol === "inhibidor"));
  assert.ok(obtenerRelacionesCitocromoPorMedicamento("tizanidina").some((item) => item.citocromoId === "CYP1A2" && item.rol === "sustrato"));
  assert.ok(obtenerRelacionesCitocromoPorMedicamento("rifampicina").some((item) => item.rol === "inductor"));
});

test("el puente detecta inhibidor más sustrato sin duplicar el par", () => {
  const alertas = detectarInteraccionesPorCitocromos(["fluvoxamina", "tizanidina", "tizanidina"]);
  assert.equal(alertas.filter((item) => item.citocromoId === "CYP1A2").length, 1);
  assert.equal(alertas[0].tipo, "inhibidor");
});

test("el puente distingue inhibición de profármacos", () => {
  const [alerta] = detectarInteraccionesPorCitocromos(["fluoxetina", "tamoxifeno"])
    .filter((item) => item.citocromoId === "CYP2D6");
  assert.ok(alerta);
  assert.match(alerta.efectoClinico, /metabolito activo/i);
});

test("el motor clínico consume el puente CYP con nombres legibles", () => {
  const medicamentos = ["Fluvoxamina", "Tizanidina"].map(normalizarMedicamentoClinico);
  const alertas = evaluarInteraccionesClinicas(medicamentos);
  const alerta = alertas.find((item) => item.tipo === "interaccion_farmacocinetica_cyp" || /CYP1A2/i.test(`${item.titulo} ${item.mecanismo}`));
  assert.ok(alerta);
  assert.ok(alerta.medicamentos.includes("Fluvoxamina"));
  assert.ok(alerta.medicamentos.includes("Tizanidina"));
});

test("dos sustratos sin modulador no producen una interacción CYP", () => {
  assert.deepEqual(detectarInteraccionesPorCitocromos(["clozapina", "olanzapina"]), []);
});

test("la Biblioteca expone la pestaña CYP y resuelve nombres desde el catálogo", async () => {
  const { readFile } = await import("node:fs/promises");
  const [html, js] = await Promise.all([
    readFile(new URL("../biblioteca.html", import.meta.url), "utf8"),
    readFile(new URL("../js/biblioteca.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /data-tab="citocromos"/);
  assert.match(js, /MEDICAMENTOS_BIBLIOTECA_POR_ID/);
  assert.match(js, /CITOCROMOS_FARMACOLOGICOS/);
});
