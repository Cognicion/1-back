import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  CIE11,
  DSM5,
  METADATOS_CATALOGO_DIAGNOSTICOS,
  SISTEMAS_DIAGNOSTICOS
} from "../data/catalogoDiagnosticos.js";

const IMPULSOS_CIE11 = ["6C70", "6C71", "6C72", "6C73", "6C7Y", "6C7Z"];
const SECCIONES_CIE10 = [
  "CIE-10",
  "Definición",
  "Etiología",
  "Agente causal",
  "Manifestaciones clínicas",
  "Diagnóstico",
  "Laboratorios",
  "Imagen",
  "Diagnóstico diferencial",
  "Tratamiento",
  "Complicaciones",
  "Prevención",
  "Pronóstico",
  "Exclusiones",
  "Referencias"
];

test("el catálogo consolidado es la fuente única de CIE-10, CIE-11 y DSM-5-TR", () => {
  assert.deepEqual(SISTEMAS_DIAGNOSTICOS, ["cie10", "cie11", "dsm5"]);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.fuenteUnica, true);
  assert.equal(CATALOGO_DIAGNOSTICOS.length, 1757);
  assert.equal(CIE10.length, 1738);
  assert.equal(CIE11.length, 28);
  assert.equal(DSM5.length, 12);
});

test("los códigos e identificadores son únicos en cada clasificación", () => {
  assert.equal(new Set(CATALOGO_DIAGNOSTICOS.map((diagnostico) => diagnostico.id)).size, CATALOGO_DIAGNOSTICOS.length);
  for (const catalogo of [CIE10, CIE11, DSM5]) {
    assert.equal(new Set(catalogo.map((diagnostico) => diagnostico.codigo)).size, catalogo.length);
  }
});

test("todos los códigos heredados que faltaban en la biblioteca están preservados", () => {
  const codigos = new Set(CIE10.map((diagnostico) => diagnostico.codigo));
  for (const codigo of ["E74", "F02.0", "F90.0", "F90.1", "S20.7", "S51.7"]) assert.ok(codigos.has(codigo), codigo);
});

test("A, B y F están completos y conservan propiedades clínicas y farmacológicas", () => {
  assert.deepEqual(
    Object.fromEntries(["A", "B", "F"].map((letra) => [letra, CIE10.filter((diagnostico) => diagnostico.codigo.startsWith(letra)).length])),
    { A: 465, B: 459, F: 467 }
  );
  const entidades = CATALOGO_DIAGNOSTICOS.filter((diagnostico) => /^[ABF]/.test(diagnostico.sistemas?.cie10?.codigo || ""));
  assert.ok(entidades.every((diagnostico) => SECCIONES_CIE10.every((titulo) => diagnostico.sistemas.cie10.criterios.some((grupo) => grupo.titulo === titulo))));
  assert.ok(entidades.every((diagnostico) => diagnostico.propiedadesPorFuente?.cie10 && diagnostico.farmacologia));
});

test("ningún panel de sistema diagnóstico queda vacío", () => {
  assert.ok(CATALOGO_DIAGNOSTICOS.every((diagnostico) =>
    Object.values(diagnostico.sistemas || {}).every((sistema) => sistema.codigo && sistema.nombre && sistema.criterios?.length)
  ));
});

test("los seis trastornos del control de impulsos CIE-11 tienen criterios, equivalencia y regla farmacológica", () => {
  const impulsos = CIE11.filter((diagnostico) => IMPULSOS_CIE11.includes(diagnostico.codigo));
  assert.deepEqual(new Set(impulsos.map((diagnostico) => diagnostico.codigo)), new Set(IMPULSOS_CIE11));
  for (const item of impulsos) {
    const entidad = CATALOGO_DIAGNOSTICOS.find((diagnostico) => diagnostico.id === item.id);
    assert.ok(entidad.sistemas.cie11.criterios.length > 1, item.codigo);
    assert.match(entidad.sistemas.cie11.equivalenciaCie10?.codigo || "", /^F63\./, item.codigo);
    assert.ok(entidad.farmacologia.categoriasRiesgo.includes("control_impulsos"), item.codigo);
    assert.ok(entidad.farmacologia.reglas.some((regla) => regla.id === "agonista_dopaminergico_control_impulsos"), item.codigo);
  }
});

test("las equivalencias permanecen juntas en una entidad", () => {
  const tag = CATALOGO_DIAGNOSTICOS.find((diagnostico) => diagnostico.sistemas?.cie10?.codigo === "F41.1");
  assert.equal(tag.sistemas.cie11.codigo, "6B00");
  assert.equal(tag.sistemas.dsm5.codigo, "300.02");
  assert.ok(tag.aliases.includes("F41.1"));
  assert.ok(tag.aliases.includes("6B00"));
});
