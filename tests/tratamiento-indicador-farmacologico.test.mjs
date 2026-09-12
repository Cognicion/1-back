import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CATALOGO_FARMACOLOGICO_OFICIAL } from "../js/data/catalogoFarmacologicoUnificado.js";
import {
  evaluarMedicamentosPaciente,
  normalizarMedicamentoClinico,
  obtenerIndicadorSeguridadMedicamentoIndividual
} from "../js/services/motorClinicoMedicamentos.js";

const tratamientosCaptura = [
  { id: "bupropion", medicamento: "Bupropion, tabletas de liberacion prolongada de 150 mg." },
  { id: "sertralina", medicamento: "Sertralina, tabletas de 50 mg." },
  { id: "pregabalina", medicamento: "Pregabalina, capsulas de 75 mg." }
];

test("cada ficha oficial se reconoce por su identidad canónica sin depender del registro legacy de ingredientes", () => {
  const noResueltos = CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => {
    const normalizado = normalizarMedicamentoClinico(medicamento);
    return normalizado.clinicalMedicationId !== medicamento.id || !normalizado.coberturaIngredienteCompleta;
  });

  assert.equal(CATALOGO_FARMACOLOGICO_OFICIAL.length, 420);
  assert.deepEqual(noResueltos.map((medicamento) => medicamento.id), []);
});

test("la tarjeta solo hereda alertas que implican a su propio medicamento", () => {
  const evaluacion = evaluarMedicamentosPaciente({ paciente: {}, medicamentos: tratamientosCaptura });
  const indicadores = new Map(tratamientosCaptura.map((tratamiento) => [
    tratamiento.id,
    obtenerIndicadorSeguridadMedicamentoIndividual({
      medicamento: tratamiento,
      alertas: evaluacion.alertas,
      cobertura: evaluacion.cobertura
    })
  ]));

  assert.equal(indicadores.get("bupropion").etiqueta, "Precaución");
  assert.equal(indicadores.get("sertralina").etiqueta, "Precaución");
  assert.equal(indicadores.get("pregabalina").estado, "fuente_pendiente");
  assert.equal(indicadores.get("pregabalina").etiqueta, "Fuente farmacológica pendiente");
  assert.equal(indicadores.get("pregabalina").alertasRelacionadas.length, 0);
  assert.ok([...indicadores.values()].every((indicador) => !/sin regla cargada para parte/i.test(indicador.etiqueta)));
});

test("todos los medicamentos reciben un estado individual específico, nunca el aviso global ambiguo", () => {
  const etiquetasInvalidas = CATALOGO_FARMACOLOGICO_OFICIAL.flatMap((medicamento) => {
    const indicador = obtenerIndicadorSeguridadMedicamentoIndividual({ medicamento });
    const estadoEsperado = medicamento.estadoFuente === "verificada_local" ? "sin_alertas" : "fuente_pendiente";
    return /sin regla cargada para parte|^\?/i.test(indicador.etiqueta) || indicador.estado !== estadoEsperado
      ? [`${medicamento.id}: ${indicador.etiqueta}`]
      : [];
  });

  assert.deepEqual(etiquetasInvalidas, []);
});

test("el render de Tratamiento no antepone un signo de interrogación al indicador", async () => {
  const pacienteJs = await readFile(new URL("../js/paciente.js", import.meta.url), "utf8");

  assert.match(pacienteJs, /obtenerIndicadorSeguridadMedicamentoIndividual/);
  assert.doesNotMatch(pacienteJs, /data-ver-interacciones>\?\s/);
});
