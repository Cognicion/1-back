import test from "node:test";
import assert from "node:assert/strict";
import {
  construirTratamientoEIndicaciones,
  normalizarClaveMedicamento
} from "../utils/tratamientoIndicaciones.js";

test("solo medicamentos: conserva una lista única y la ofrece como contenido general", () => {
  const resultado = construirTratamientoEIndicaciones({
    medicamentosActivos: ["Lorazepam 1 mg VO", "Risperidona 2 mg VO"]
  });

  assert.deepEqual(resultado.medicamentos, ["Lorazepam 1 mg VO", "Risperidona 2 mg VO"]);
  assert.deepEqual(resultado.indicaciones, resultado.medicamentos);
  assert.deepEqual(resultado.contenidoResumen, resultado.medicamentos);
});

test("medicamentos e indicaciones: elimina solo duplicados literales", () => {
  const resultado = construirTratamientoEIndicaciones({
    medicamentosActivos: ["Lorazepam. Tomar VO cada 8 horas. 1 tableta.", "Risperidona 2 mg VO"],
    indicacionesEstructuradas: [
      "1. Dieta polimérica",
      "2. Lorazepam - VO cada 8 horas - 1 tableta",
      "3. Signos vitales por turno"
    ]
  });

  assert.deepEqual(resultado.indicaciones, ["Dieta polimérica", "Signos vitales por turno"]);
  assert.deepEqual(resultado.contenidoResumen, [
    "Lorazepam. Tomar VO cada 8 horas. 1 tableta.",
    "Risperidona 2 mg VO",
    "Dieta polimérica",
    "Signos vitales por turno"
  ]);
});

test("conserva medicamentos cuando pertenecen a una indicación condicionada", () => {
  const resultado = construirTratamientoEIndicaciones({
    medicamentosActivos: ["Lorazepam 1 mg VO", "Risperidona 2 mg VO"],
    indicacionesEstructuradas: [
      "1. Dieta normal",
      "2. Medicamentos (en caso de negativismo):",
      "   Lorazepam 1 mg VO",
      "   Risperidona 2 mg VO",
      "3. Favor de reportar eventualidades"
    ].join("\n")
  });

  assert.equal(resultado.indicaciones.length, 3);
  assert.match(resultado.indicaciones[1], /en caso de negativismo/i);
  assert.match(resultado.indicaciones[1], /Lorazepam 1 mg VO/);
  assert.match(resultado.indicaciones[1], /Risperidona 2 mg VO/);
});

test("texto legado: elimina numeración interna, duplicados y conserva orden", () => {
  const resultado = construirTratamientoEIndicaciones({
    tratamientoTextoLegado: "1. Dieta normal\n2. Signos vitales\n3. 1. Dieta normal"
  });

  assert.deepEqual(resultado.contenidoResumen, ["Dieta normal", "Signos vitales"]);
  assert.equal(normalizarClaveMedicamento(" 3. Lorazepam 1 mg VO. "), "lorazepam 1 mg vo");
});
