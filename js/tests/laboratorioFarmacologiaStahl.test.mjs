import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  COBERTURA_FARMACOLOGICA,
  MEDICAMENTOS_MAESTROS,
  medicamentoPorTexto
} from "../data/medicamentos.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const prescripcion = (nombre) => ({ medicamento: nombre, nombre, texto: nombre });
const pacienteCardiovascular = {
  diagnosticos: "I10 Hipertensión arterial; riesgo cardiovascular",
  comorbilidades: "I10 Hipertensión arterial; riesgo cardiovascular"
};

test("la fuente Stahl existe en la ruta normalizada y las cuatro monografías son específicas", () => {
  assert.equal(fs.existsSync("fuentes_farmacologicas/stahl_prescribers_guide.pdf"), true);
  assert.deepEqual(COBERTURA_FARMACOLOGICA, {
    totalNormalizados: 207,
    conFuenteVerificada: 4,
    datosCompletos: 0,
    fuentePendiente: 203,
    idsVerificados: ["atomoxetina", "metilfenidato", "olanzapina", "risperidona"]
  });

  const expectativas = new Map([
    ["Olanzapina", /21-54 horas/],
    ["Risperidona", /20-24 horas/],
    ["Metilfenidato", /promedio 3\.5 horas/],
    ["Atomoxetina", /5 horas/]
  ]);
  expectativas.forEach((patron, nombre) => {
    const medicamento = medicamentoPorTexto(nombre);
    assert.ok(medicamento, `${nombre} debe existir`);
    assert.equal(medicamento.estadoFuente, "verificada_local");
    assert.match(medicamento.vidaMedia, patron);
    assert.doesNotMatch(medicamento.vidaMedia, /variable|revisar molécula/i);
    assert.match(medicamento.paginaSeccion, /PDF/);
  });

  assert.match(medicamentoPorTexto("Risperidona").metabolitosActivos.join(" "), /9-hidroxirisperidona.*paliperidona/i);
  assert.match(medicamentoPorTexto("Atomoxetina").metabolismo, /CYP2D6/i);
  assert.match(medicamentoPorTexto("Olanzapina").metabolismo, /CYP1A2.*CYP2D6/i);
});

test("caso 1: olanzapina y risperidona separan interacción, diagnóstico, duplicidad y cargas", () => {
  const evaluacion = evaluarMedicamentosPaciente({
    paciente: pacienteCardiovascular,
    medicamentos: [prescripcion("Olanzapina"), prescripcion("Risperidona")]
  });
  const texto = evaluacion.alertas.map((alerta) => [
    alerta.titulo,
    alerta.mecanismo,
    alerta.efecto,
    alerta.recomendacion,
    ...(alerta.parametrosVigilancia || [])
  ].join(" ")).join(" ");

  assert.equal(evaluacion.cobertura.fuentePendiente, 0);
  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "interaccion_medicamento_medicamento"));
  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "duplicidad_terapeutica"));
  assert.ok(evaluacion.alertas.some((alerta) => alerta.diagnosticos?.length));
  assert.match(texto, /sedación|SNC/i);
  assert.match(texto, /hipotensión|ortostatismo/i);
  assert.match(texto, /QTc?/i);
  assert.match(texto, /EPS|extrapiramidal/i);
  assert.match(texto, /prolactina/i);
  assert.match(texto, /metabólic|glucosa|lípidos/i);
});

test("caso 2: metilfenidato y atomoxetina muestran una precaución cardiovascular no ambigua", () => {
  const evaluacion = evaluarMedicamentosPaciente({
    paciente: pacienteCardiovascular,
    medicamentos: [prescripcion("Metilfenidato"), prescripcion("Atomoxetina")]
  });
  const texto = evaluacion.alertas.map((alerta) => `${alerta.titulo} ${alerta.mecanismo} ${alerta.efecto} ${(alerta.parametrosVigilancia || []).join(" ")}`).join(" ");

  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "interaccion_medicamento_medicamento"));
  assert.ok(evaluacion.alertas.some((alerta) => alerta.diagnosticos?.length));
  assert.match(texto, /presión arterial/i);
  assert.match(texto, /frecuencia cardiaca/i);
  assert.doesNotMatch(texto, /carga de presión\s*\d/i);
});

test("caso 3: enalapril está unificado, queda pendiente y participa en una regla cargada", () => {
  const enalapril = MEDICAMENTOS_MAESTROS.find((medicamento) => medicamento.id === "enalapril");
  assert.ok(enalapril);
  assert.equal(enalapril.estadoFuente, "fuente_pendiente");
  assert.equal(enalapril.vidaMedia, "fuente pendiente");

  const evaluacion = evaluarMedicamentosPaciente({
    medicamentos: [prescripcion("Enalapril"), prescripcion("Losartán")]
  });
  assert.equal(evaluacion.cobertura.fuentePendiente, 2);
  assert.ok(evaluacion.alertas.some((alerta) => /bloqueo dual del SRAA/i.test(alerta.titulo)));
  assert.notEqual(evaluacion.indicador.etiqueta, "Sin alertas locales");
});
