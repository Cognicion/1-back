import assert from "node:assert/strict";
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";
import {
  ANTIPSICOTICOS_TIPICOS_CATALOG_IDS,
  FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS,
  REGLAS_INTERACCIONES_ANTIPSICOTICOS_TIPICOS
} from "../data/interaccionesAntipsicoticosTipicos.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const porId = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => [medicamento.id, medicamento]));

assert.equal(ANTIPSICOTICOS_TIPICOS_CATALOG_IDS.length, 20);
assert.equal(new Set(ANTIPSICOTICOS_TIPICOS_CATALOG_IDS).size, ANTIPSICOTICOS_TIPICOS_CATALOG_IDS.length);
assert.equal(Object.keys(FUENTES_REGULATORIAS_ANTIPSICOTICOS_TIPICOS).length, 6);
assert.ok(REGLAS_INTERACCIONES_ANTIPSICOTICOS_TIPICOS.length >= 28);
assert.ok(REGLAS_INTERACCIONES_ANTIPSICOTICOS_TIPICOS.every((regla) =>
  regla.fuentes?.length && regla.mecanismo && regla.efecto && regla.recomendacion
));

const idsReferenciados = new Set(REGLAS_INTERACCIONES_ANTIPSICOTICOS_TIPICOS.flatMap((regla) => [
  ...(regla.ingredientesA || []),
  ...(regla.ingredientesB || [])
]));
for (const id of idsReferenciados) assert.ok(porId.has(id), `${id} debe existir en el catalogo oficial`);

for (const tipicoId of ANTIPSICOTICOS_TIPICOS_CATALOG_IDS) {
  const tipico = porId.get(tipicoId);
  assert.ok(tipico, `${tipicoId} debe existir en el catalogo`);
  assert.ok(tipico.clases.includes("antipsicotico_tipico"), `${tipicoId} debe conservar identidad de primera generacion`);
  assert.ok(tipico.interaccionesEstructuradas.length > 0, `${tipicoId} debe exponer interacciones estructuradas`);
  for (const interaccion of tipico.interaccionesEstructuradas) {
    for (const contraparteId of interaccion.contraparteIds) {
      const contraparte = porId.get(contraparteId);
      assert.ok(contraparte, `${contraparteId} debe existir como medicamento canonico`);
      assert.ok(
        contraparte.interaccionesEstructuradas.some((item) =>
          item.idRegla === interaccion.idRegla && item.contraparteIds.includes(tipicoId)
        ),
        `${interaccion.idRegla} debe estar registrada reciprocamente en ${tipicoId} y ${contraparteId}`
      );
    }
  }
}

for (const texto of [
  "flufenazina", "proclorperazina", "tiotixeno", "flupentixol", "zuclopentixol",
  "levodopa", "epinefrina", "benztropina", "prometazina", "nefazodona", "aprepitant"
]) assert.ok(resolverMedicamentoCanonico(texto), `${texto} debe resolverse desde el catalogo oficial`);

function alertas(...medicamentos) {
  return evaluarMedicamentosPaciente({ medicamentos }).alertas;
}

assert.ok(alertas("haloperidol", "litio").some((item) => item.severidad === "critica" && item.categoria === "neurotoxicidad"));
assert.ok(alertas("haloperidol", "rifampicina").some((item) => item.categoria === "metabolica_cyp"));
assert.ok(alertas("haloperidol", "fluoxetina").some((item) => item.categoria === "metabolica_cyp"));
assert.ok(alertas("haloperidol", "morfina").some((item) => item.severidad === "alta" && item.categoria === "depresora_snc"));
assert.equal(alertas("haloperidol", "morfina").filter((item) => item.categoria === "depresora_snc").length, 1);
assert.ok(alertas("haloperidol", "levodopa").some((item) => item.categoria === "antagonismo_dopaminergico"));
assert.ok(alertas("haloperidol", "metoclopramida").some((item) => item.categoria === "extrapiramidal"));
assert.ok(alertas("clorpromazina", "epinefrina").some((item) => item.severidad === "alta" && item.categoria === "cardiovascular"));
assert.ok(alertas("clorpromazina", "atropina").some((item) => item.categoria === "anticolinergica"));
assert.ok(alertas("clorpromazina", "enalapril").some((item) => item.categoria === "cardiovascular"));
assert.ok(alertas("pimozida", "claritromicina").some((item) => item.severidad === "critica"));
assert.ok(alertas("pimozida", "ketoconazol").some((item) => item.severidad === "critica"));
assert.ok(alertas("pimozida", "paroxetina").some((item) => item.severidad === "critica"));
assert.ok(alertas("pimozida", "citalopram").some((item) => item.severidad === "critica"));
assert.ok(alertas("tioridazina", "propranolol").some((item) => item.severidad === "critica"));
assert.ok(alertas("tioridazina", "amiodarona").some((item) => item.severidad === "critica"));
assert.ok(alertas("perfenazina", "fluoxetina").some((item) => item.severidad === "alta" && item.categoria === "metabolica_cyp"));

console.log("interaccionesAntipsicoticosTipicosCompletas.test.mjs OK");
