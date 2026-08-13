import test from "node:test";
import assert from "node:assert/strict";
import {
  construirCatalogoFarmacologicoNormalizado
} from "../data/catalogoFarmacologicoUnificado.js";

test("la capa normalizada expone presentaciones, dosis y principios activos sin catálogo paralelo", () => {
  const resultado = construirCatalogoFarmacologicoNormalizado({
    medicamentos: [{
      id: "losartan-hidroclorotiazida",
      nombre: "Losartán/Hidroclorotiazida",
      presentaciones: ["tableta 50 mg/12.5 mg"],
      dosisHabitual: "1 tableta cada 24 horas",
      brandNames: ["Cozaar D"]
    }]
  });

  const medicamento = resultado.medicamentos[0];
  assert.deepEqual(medicamento.principiosActivos, ["Losartán", "Hidroclorotiazida"]);
  assert.deepEqual(medicamento.presentaciones.map(({ texto }) => texto), ["tableta 50 mg/12.5 mg"]);
  assert.deepEqual(medicamento.dosisHabituales, ["50 mg", "12.5 mg"]);
  assert.deepEqual(medicamento.brandNames, ["Cozaar D"]);
});
