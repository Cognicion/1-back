import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduloNota = await readFile(new URL("../nota.js", import.meta.url), "utf8");
const estilosNota = await readFile(new URL("../../css/nota.css", import.meta.url), "utf8");

test("el exportador COGNICION resuelve e inserta un bloque propio de signos vitales", () => {
  assert.match(moduloNota, /function datosExportacionCognicion\(\)/);
  assert.match(moduloNota, /resolverSignosVitalesNota\(notaGuardada/);
  assert.match(moduloNota, /resolverSignosVitalesNota\(formularioDeLaNota/);
  assert.match(moduloNota, /crearTablaSignosEvolucionPdfCognicion\(datosPdf\.signosVitales\)/);
  assert.match(moduloNota, /if \(!esRegistroPdfCognicion\(signosVitales\)\) return null/);
  assert.match(moduloNota, /titulo\.textContent = "SIGNOS VITALES"/);
});

test("la exportacion no usa el snapshot actual del paciente como signos de una nota previa", () => {
  assert.match(moduloNota, /signosVitalesVinculados: _signosActualesPaciente/);
  assert.match(moduloNota, /resolverSignosVitalesNota\(formularioDeLaNota, \{\s*paciente: \{\},\s*sourceNoteId: ""/);
});

test("el PDF COGNICION tiene estilos compactos para el bloque de signos vitales", () => {
  assert.match(estilosNota, /\.pdf-signos-vitales-cognicion/);
  assert.match(estilosNota, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
