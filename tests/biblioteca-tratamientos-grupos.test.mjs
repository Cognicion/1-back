import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { MEDICAMENTOS_MAESTROS } from "../js/data/catalogoFarmacologicoUnificado.js";

const ETIQUETA_PENDIENTE = "Grupo farmacológico pendiente";
const GRUPOS_NO_CLASIFICADOS = new Set([
  "",
  "medicamento",
  "sin categoria",
  "sin grupo",
  "no especificado"
]);

function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function grupoVisible(medicamento = {}) {
  const grupos = [medicamento.grupoFarmacologico, medicamento.clase, medicamento.clasePrincipal]
    .map((valor) => String(valor || "").trim())
    .filter(Boolean);
  return grupos.find((grupo) => !GRUPOS_NO_CLASIFICADOS.has(normalizar(grupo))) || ETIQUETA_PENDIENTE;
}

function agruparCatalogo(medicamentos = []) {
  const grupos = new Map();
  for (const medicamento of medicamentos) {
    const etiqueta = grupoVisible(medicamento);
    const clave = etiqueta === ETIQUETA_PENDIENTE ? "__grupo_farmacologico_pendiente__" : normalizar(etiqueta);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(medicamento);
  }
  return grupos;
}

test("la Biblioteca agrupa una vez todos los medicamentos del catálogo maestro", () => {
  const grupos = agruparCatalogo(MEDICAMENTOS_MAESTROS);
  const medicamentosAgrupados = [...grupos.values()].flat();

  assert.ok(MEDICAMENTOS_MAESTROS.length > 0);
  assert.ok(grupos.size > 0);
  assert.equal(medicamentosAgrupados.length, MEDICAMENTOS_MAESTROS.length);
  assert.equal(new Set(medicamentosAgrupados.map((medicamento) => medicamento.id)).size, MEDICAMENTOS_MAESTROS.length);
  assert.deepEqual(
    medicamentosAgrupados.map((medicamento) => medicamento.id).sort(),
    MEDICAMENTOS_MAESTROS.map((medicamento) => medicamento.id).sort()
  );
});

test("las variantes tipográficas de un grupo comparten una sola clave visual", () => {
  assert.equal(normalizar("Antipsicótico atípico"), normalizar("ANTIPSICOTICO ATIPICO"));
  const grupos = agruparCatalogo([
    { id: "a", grupoFarmacologico: "Antipsicótico atípico" },
    { id: "b", clase: "antipsicotico atipico" }
  ]);
  assert.equal(grupos.size, 1);
  assert.equal([...grupos.values()][0].length, 2);
});

test("un medicamento futuro sin clasificación queda en el grupo pendiente", () => {
  for (const medicamento of [
    { id: "sin-grupo" },
    { id: "grupo-generico", grupoFarmacologico: "Medicamento" },
    { id: "sin-categoria", clase: "Sin categoría" }
  ]) {
    assert.equal(grupoVisible(medicamento), ETIQUETA_PENDIENTE);
  }
  assert.equal(
    grupoVisible({ grupoFarmacologico: "Medicamento", clase: "Antihipertensivo" }),
    "Antihipertensivo",
    "una etiqueta genérica no debe ocultar una clase específica disponible"
  );
});

test("biblioteca.html presenta Tratamientos sin cambiar la clave pública vademecum", async () => {
  const html = await readFile(new URL("../biblioteca.html", import.meta.url), "utf8");
  assert.match(html, /data-tab="vademecum">Tratamientos<\/button>/);
  assert.match(html, /biblioteca-grupos-farmacologicos-v3/);
});

test("el render de Tratamientos navega grupo, lista y ficha bajo demanda", async () => {
  const js = await readFile(new URL("../js/biblioteca.js", import.meta.url), "utf8");

  assert.match(js, /let grupoFarmacologicoActual = null/);
  assert.match(js, /function obtenerGruposFarmacologicos\(\)/);
  assert.match(js, /Grupo farmacológico pendiente/);
  assert.match(js, /data-grupo-farmacologico/);
  assert.match(js, /data-volver-grupos-farmacologicos/);
  assert.match(js, /data-medicamento-toggle/);
  assert.match(js, /renderizarDetallesMedicamento\(medicamento, detalles\)/);
  assert.match(js, /textoBusquedaGrupoFarmacologico/);
  assert.doesNotMatch(js, /panel\.innerHTML\s*=\s*MEDICAMENTOS_MAESTROS/);
});

test("los estilos de grupos y medicamentos cubren escritorio, móvil y tema claro", async () => {
  const css = await readFile(new URL("../css/biblioteca.css", import.meta.url), "utf8");

  assert.match(css, /\.grupos-farmacologicos-lista/);
  assert.match(css, /\.grupo-farmacologico-card/);
  assert.match(css, /\.medicamento-ficha-grid/);
  assert.match(css, /html\[data-theme="light"\] \.grupos-farmacologicos-lista/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.navegacion-grupos-farmacologicos \.grupo-farmacologico-card/);
});
