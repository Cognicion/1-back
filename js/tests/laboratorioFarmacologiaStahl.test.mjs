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
  diagnosticos: "I10 Hipertension arterial; riesgo cardiovascular",
  comorbilidades: "I10 Hipertension arterial; riesgo cardiovascular"
};
const sinAcentos = (valor) => String(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

test("Stahl local existe y el seed prioritario tiene fuentes trazables", () => {
  assert.equal(fs.existsSync("fuentes_farmacologicas/stahl_prescribers_guide.pdf"), true);
  assert.equal(COBERTURA_FARMACOLOGICA.totalNormalizados, 210);
  assert.equal(COBERTURA_FARMACOLOGICA.conFuenteVerificada, 57);
  assert.equal(COBERTURA_FARMACOLOGICA.fuentePendiente, 153);
  [
    "atomoxetina",
    "metilfenidato",
    "olanzapina",
    "risperidona",
    "losartan",
    "captopril",
    "enalapril",
    "ibuprofeno",
    "sertralina",
    "litio"
  ].forEach((id) => {
    assert.ok(COBERTURA_FARMACOLOGICA.idsVerificados.includes(id), `${id} debe estar verificado en la capa semilla`);
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
    assert.doesNotMatch(medicamento.vidaMedia, /variable|revisar molecula/i);
    assert.match(medicamento.paginaSeccion, /PDF/);
  });

  assert.match(medicamentoPorTexto("Risperidona").metabolitosActivos.join(" "), /9-hidroxirisperidona.*paliperidona/i);
  assert.match(medicamentoPorTexto("Atomoxetina").metabolismo, /CYP2D6/i);
  assert.match(medicamentoPorTexto("Olanzapina").metabolismo, /CYP1A2.*CYP2D6/i);
  assert.notEqual(medicamentoPorTexto("Losartan").vidaMedia, "fuente pendiente");
  assert.notEqual(medicamentoPorTexto("Captopril").vidaMedia, "fuente pendiente");
  assert.match(medicamentoPorTexto("Losartan").paginaSeccion, /DailyMed/i);
});

test("caso 1: olanzapina y risperidona separan interaccion, diagnostico, duplicidad y cargas", () => {
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
  assert.match(texto, /sedacion|SNC/i);
  assert.match(texto, /hipotension|ortostatismo/i);
  assert.match(texto, /QTc?/i);
  assert.match(texto, /EPS|extrapiramidal/i);
  assert.match(texto, /prolactina/i);
  assert.match(texto, /metabolic|metabolico|glucosa|lipidos/i);
});

test("caso 2: metilfenidato y atomoxetina muestran una precaucion cardiovascular no ambigua", () => {
  const evaluacion = evaluarMedicamentosPaciente({
    paciente: pacienteCardiovascular,
    medicamentos: [prescripcion("Metilfenidato"), prescripcion("Atomoxetina")]
  });
  const texto = evaluacion.alertas.map((alerta) => `${alerta.titulo} ${alerta.mecanismo} ${alerta.efecto} ${(alerta.parametrosVigilancia || []).join(" ")}`).join(" ");

  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "interaccion_medicamento_medicamento"));
  assert.ok(evaluacion.alertas.some((alerta) => alerta.diagnosticos?.length));
  assert.match(sinAcentos(texto), /presion arterial/i);
  assert.match(sinAcentos(texto), /frecuencia cardiaca/i);
  assert.doesNotMatch(sinAcentos(texto), /carga de presion\s*\d/i);
});

test("caso 3: enalapril y losartan estan unificados y participan en una regla cargada", () => {
  const enalapril = MEDICAMENTOS_MAESTROS.find((medicamento) => medicamento.id === "enalapril");
  assert.ok(enalapril);
  assert.equal(enalapril.estadoFuente, "verificada_local");
  assert.notEqual(enalapril.vidaMedia, "fuente pendiente");

  const evaluacion = evaluarMedicamentosPaciente({
    medicamentos: [prescripcion("Enalapril"), prescripcion("Losartan")]
  });
  assert.equal(evaluacion.cobertura.fuentePendiente, 0);
  assert.ok(evaluacion.alertas.some((alerta) => /bloqueo dual del SRAA/i.test(alerta.titulo)));
  assert.notEqual(evaluacion.indicador.etiqueta, "Sin alertas locales");
});

test("caso critico: losartan + captopril + captopril 25 mg con I13", () => {
  const evaluacion = evaluarMedicamentosPaciente({
    paciente: {
      edad: 70,
      sexo: "masculino",
      comorbilidades: "renal, I13 - Enfermedad cardiaca y renal hipertensiva",
      diagnosticos: "renal, I13 - Enfermedad cardiaca y renal hipertensiva"
    },
    medicamentos: [
      prescripcion("Losartan"),
      prescripcion("Captopril"),
      prescripcion("Captopril, tabletas de 25 mg.")
    ]
  });
  const texto = JSON.stringify(evaluacion.alertas);
  assert.deepEqual(evaluacion.medicamentosNormalizados.map((med) => med.ingredienteIds[0]).sort(), ["captopril", "losartan"]);
  assert.ok(evaluacion.medicamentosNormalizados.find((med) => med.ingredienteIds.includes("captopril")).prescripcionesRelacionadas.length >= 2);
  assert.ok(/Bloqueo dual del SRAA/i.test(texto));
  assert.ok(/enfermedad renal|renal/i.test(texto));
  assert.match(texto, /Potasio/i);
  assert.match(texto, /Creatinina/i);
  assert.match(texto, /eGFR/i);
  assert.match(sinAcentos(texto), /Presion arterial/i);
  assert.ok(evaluacion.alertas.some((alerta) => alerta.tipo === "duplicidad_terapeutica"));
  assert.equal(evaluacion.cobertura.fuentePendiente, 0);
});
