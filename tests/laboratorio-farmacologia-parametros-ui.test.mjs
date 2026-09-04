import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DEFINICIONES_PARAMETROS_CLINICOS,
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

test("la UI serializa valor, unidad, rango y procedencia hacia el motor", () => {
  assert.match(javascript, /construirRegistroParametrosClinicos/);
  assert.match(javascript, /data-parametro-campo="rangoReferencia"/);
  assert.match(javascript, /procedencia:\s*"laboratorio_farmacologia"/);
  assert.match(javascript, /evaluarMedicamentosPaciente\(\{ paciente, medicamentos: lista \}\)/);
  assert.match(javascript, /observaciones:\s*comorbilidades,\s*parametrosClinicos/s);
  assert.doesNotMatch(javascript, /farmacoEGFR|farmacoCreatinina/);
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
