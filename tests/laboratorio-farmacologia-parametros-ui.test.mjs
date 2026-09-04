import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DEFINICIONES_PARAMETROS_CLINICOS,
  obtenerReferenciaPredeterminadaParametro,
  resolverParametrosClinicosPaciente
} from "../js/services/parametrosClinicosPaciente.js";

const html = fs.readFileSync("laboratorio-farmacologia.html", "utf8");
const javascript = fs.readFileSync("js/laboratorio-farmacologia.js", "utf8");
const css = fs.readFileSync("css/laboratorio-farmacologia.css", "utf8");

test("la opción Parámetros expone el esquema clínico completo requerido", () => {
  const ids = DEFINICIONES_PARAMETROS_CLINICOS.map(({ id }) => id);
  assert.deepEqual(ids, [
    "creatinina",
    "eGFR",
    "uacr",
    "sodio",
    "potasio",
    "cloro",
    "bicarbonato",
    "magnesio",
    "calcio",
    "proteinasTotales",
    "albumina",
    "globulinas"
  ]);
  assert.match(html, /id="farmacoParametrosClinicos"/);
  assert.match(html, /id="farmacoParametrosResumen"[^>]*aria-live="polite"/);
  assert.match(html, /id="farmacoParametrosFecha"[^>]*type="date"/);
});

test("la UI serializa valor, unidad, rango y diagnósticos activos hacia el motor", () => {
  assert.match(javascript, /construirRegistroParametrosClinicos/);
  assert.match(javascript, /data-parametro-campo="rangoReferencia"/);
  assert.match(javascript, /procedencia:\s*"laboratorio_farmacologia"/);
  assert.match(javascript, /evaluarMedicamentosPaciente\(\{ paciente, medicamentos: lista \}\)/);
  assert.match(javascript, /diagnosticosSeleccionados\.map\(diagnosticoParaMotor\)/);
  assert.match(javascript, /historialDiagnosticos:\s*diagnosticos/);
  assert.match(html, /Diagnósticos activos/);
  assert.match(html, /id="farmacoDiagnosticosSeleccionados"/);
  assert.doesNotMatch(javascript, /farmacoEGFR|farmacoCreatinina/);
});

test("los intervalos adultos predeterminados son editables y no sustituyen el intervalo del laboratorio", () => {
  const creatininaMasculina = obtenerReferenciaPredeterminadaParametro("creatinina", { unidad: "mg/dL", sexo: "masculino" });
  const creatininaFemenina = obtenerReferenciaPredeterminadaParametro("creatinina", { unidad: "mg/dL", sexo: "femenino" });
  const sodio = obtenerReferenciaPredeterminadaParametro("sodio", { unidad: "mmol/L" });
  const globulinas = obtenerReferenciaPredeterminadaParametro("globulinas", { unidad: "g/dL" });
  assert.equal(creatininaMasculina.rangoReferencia, "0.74–1.35");
  assert.equal(creatininaFemenina.rangoReferencia, "0.59–1.04");
  assert.equal(sodio.rangoReferencia, "135–145");
  assert.equal(globulinas.rangoReferencia, "");
  assert.match(globulinas.nota, /No se carga un intervalo estándar/i);
  assert.match(javascript, /data-editar-rango=/);
  assert.match(javascript, /Intervalo cargado desde el laboratorio del expediente/);
  assert.match(css, /\.editar-rango-parametro/);
});

test("el laboratorio ofrece ejemplos e integración de pacientes autorizados sin persistir cambios", () => {
  assert.match(html, /Paciente sano · sin diagnósticos ni medicamentos/);
  assert.match(html, /id="abrirPacientesPanelMedico"/);
  assert.match(html, /id="farmacoSelectorPacientesPanel"/);
  assert.match(javascript, /getAuthenticatedUserOnce/);
  assert.match(javascript, /listarPacientes\(usuario\.uid\)/);
  assert.match(javascript, /Los cambios aquí no se guardan en su expediente/);
  assert.match(javascript, /CIE10, CIE11/);
  assert.match(javascript, /data-quitar-diagnostico/);
});

test("globulinas y A\/G se muestran como cálculos derivados, no como mediciones", () => {
  const resultado = resolverParametrosClinicosPaciente({
    parametrosClinicos: {
      valores: {
        proteinasTotales: { valor: 7, unidad: "g/dL", rangoReferencia: "6-8", fecha: "2026-09-04" },
        albumina: { valor: 4, unidad: "g/dL", rangoReferencia: "3-5", fecha: "2026-09-04" }
      }
    }
  });
  assert.equal(resultado.derivados.globulinasCalculadas.valor, 3);
  assert.equal(resultado.derivados.globulinasCalculadas.derivado, true);
  assert.equal(resultado.derivados.relacionAlbuminaGlobulina.valor, 1.33);
  assert.match(javascript, /Cálculo, no medición directa/);
  assert.match(javascript, /<span>Derivado<\/span>/);
});

test("la presentación distingue rango aportado, falta de rango y cobertura incompleta", () => {
  assert.match(javascript, /Dentro del intervalo registrado/);
  assert.match(javascript, /Sin clasificación: falta un intervalo interpretable/);
  assert.match(javascript, /Cobertura clínica incompleta/);
  assert.match(javascript, /paresMedicamentoMedicamentoSinRegla/);
  assert.match(javascript, /paresMedicamentoDiagnosticoSinRegla/);
  assert.match(javascript, /paresMedicamentoParametroSinRegla/);
  assert.match(javascript, /parametrosClinicosRelevantes/);
  assert.match(javascript, /hallazgosParametrosNoInterpretables/);
  assert.match(javascript, /Alertas medicamento-parámetro clínico/);
  assert.match(javascript, /dato_no_comparable/);
  assert.match(javascript, /dato_no_clasificable/);
  assert.match(css, /\.farmaco-resumen\.incompleta/);
  assert.match(css, /\.parametro-resultado\.derivado/);
});
