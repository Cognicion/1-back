import assert from "node:assert/strict";
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";
import {
  FUENTES_REGULATORIAS_ISRS,
  ISRS_CATALOG_IDS,
  REGLAS_INTERACCIONES_ISRS
} from "../data/interaccionesISRS.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const porId = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => [medicamento.id, medicamento]));

assert.deepEqual(
  [...ISRS_CATALOG_IDS].sort(),
  CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.clases.some((clase) => String(clase).toLowerCase() === "isrs")).map((medicamento) => medicamento.id).sort(),
  "los seis ISRS oficiales deben compartir la misma matriz"
);
assert.equal(Object.keys(FUENTES_REGULATORIAS_ISRS).length, 6);
assert.ok(REGLAS_INTERACCIONES_ISRS.length >= 25);
assert.ok(REGLAS_INTERACCIONES_ISRS.every((regla) => regla.fuentes?.length && regla.mecanismo && regla.efecto && regla.recomendacion));

for (const isrsId of ISRS_CATALOG_IDS) {
  const isrs = porId.get(isrsId);
  assert.ok(isrs, `${isrsId} debe existir en el catalogo`);
  assert.ok(isrs.interaccionesEstructuradas.length > 0, `${isrsId} debe exponer interacciones estructuradas`);
  for (const interaccion of isrs.interaccionesEstructuradas) {
    for (const contraparteId of interaccion.contraparteIds) {
      const contraparte = porId.get(contraparteId);
      assert.ok(contraparte, `${contraparteId} debe existir como medicamento canonico`);
      assert.ok(
        contraparte.interaccionesEstructuradas.some((item) => item.idRegla === interaccion.idRegla && item.contraparteIds.includes(isrsId)),
        `${interaccion.idRegla} debe estar registrada reciprocamente en ${isrsId} y ${contraparteId}`
      );
    }
  }
}

for (const texto of [
  "pimozida", "linezolid", "tioridazina", "fentanilo", "metadona", "tamoxifeno",
  "moxifloxacino", "alosetron", "ramelteon", "teofilina", "aspirina", "tranylcypromine"
]) assert.ok(resolverMedicamentoCanonico(texto), `${texto} debe resolverse desde el catalogo oficial`);

function alertas(...medicamentos) {
  return evaluarMedicamentosPaciente({ medicamentos }).alertas;
}

assert.ok(alertas("fluoxetina", "tramadol").some((item) => item.categoria === "serotoninergica"));
assert.equal(alertas("fluoxetina", "tramadol").filter((item) => item.categoria === "serotoninergica").length, 1);
assert.ok(alertas("citalopram", "moxifloxacino").some((item) => item.categoria === "qt"));
assert.ok(alertas("paroxetina", "tamoxifeno").some((item) => item.id.startsWith("paroxetina_tamoxifeno")));
assert.ok(alertas("fluvoxamina", "tizanidina").some((item) => item.severidad === "critica"));
assert.ok(alertas("fluvoxamina", "teofilina").some((item) => item.severidad === "alta"));
assert.ok(alertas("sertralina", "pimozida").some((item) => item.severidad === "critica"));
assert.ok(alertas("sertralina", "warfarina").some((item) => item.categoria === "hemorragica"));

console.log("interaccionesISRSCompletas.test.mjs OK");
