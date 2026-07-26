import assert from "node:assert/strict";
import test from "node:test";
import { DIAGNOSTICOS_BIBLIOTECA, SISTEMAS_DIAGNOSTICOS } from "../data/diagnosticosBiblioteca.js";

test("F90 concentra las tres clasificaciones y sus subcategorías", () => {
  const tdah = DIAGNOSTICOS_BIBLIOTECA.find((diagnostico) => diagnostico.sistemas?.cie10?.codigo === "F90");
  assert.ok(tdah);
  assert.match(tdah.nombre, /TDAH/);
  assert.deepEqual(tdah.sistemas.cie10.subtipos.map((subtipo) => subtipo.codigo), ["F90.0", "F90.1", "F90.8", "F90.9"]);
  assert.equal(tdah.sistemas.cie11.codigo, "6A05");
  assert.deepEqual(tdah.sistemas.cie11.subtipos.map((subtipo) => subtipo.codigo), ["6A05.0", "6A05.1", "6A05.2", "6A05.Y", "6A05.Z"]);
  assert.equal(tdah.sistemas.dsm5.codigo, "314.01");
  assert.deepEqual(tdah.sistemas.dsm5.subtipos.map((subtipo) => subtipo.codigo), ["314.01 (F90.2)", "314.00 (F90.0)", "314.01 (F90.1)"]);
  assert.equal(tdah.sistemas.cie10.criterios[0].titulo, "Criterios generales del grupo F90");
  assert.equal(tdah.sistemas.dsm5.criterios.length, 5);
  assert.ok(tdah.sistemas.cie10.fuente.sourceVerified);
  assert.ok(tdah.sistemas.cie11.fuente.sourceVerified);
  assert.equal(tdah.sistemas.dsm5.fuente.licenseStatus, "summarized");
  assert.doesNotMatch(JSON.stringify(tdah), /Pendiente de clasificación|Criterios específicos no cargados aún|314\\.xx/);
  assert.equal(DIAGNOSTICOS_BIBLIOTECA.some((diagnostico) => diagnostico.sistemas?.cie10?.codigo === "F90.0"), false);
});

test("Los criterios se almacenan como grupos con listas internas y descripción editable", () => {
  const tag = DIAGNOSTICOS_BIBLIOTECA.find((diagnostico) => diagnostico.id === "trastorno-trastorno-de-ansiedad-generalizada");
  assert.ok(tag.descripcionBreve);
  assert.ok(tag.sistemas.cie10.criterios.every((grupo) => Array.isArray(grupo.items)));
  assert.ok(tag.sistemas.cie10.criterios.some((grupo) => grupo.grupos.some((subgrupo) => subgrupo.items.length > 1)));
});

test("El criterio B conserva sus subcategorías dentro del mismo grupo padre", () => {
  const tag = DIAGNOSTICOS_BIBLIOTECA.find((diagnostico) => diagnostico.id === "trastorno-trastorno-de-ansiedad-generalizada");
  const criterioB = tag.sistemas.cie10.criterios.find((grupo) => grupo.clave === "B");
  assert.ok(criterioB);
  assert.ok(criterioB.grupos.length >= 3);
  assert.ok(criterioB.grupos.some((grupo) => grupo.titulo === "Síntomas autonómicos"));
  assert.ok(criterioB.grupos.every((grupo) => grupo.items.every((item) => !/^(?:\(?\d+\)?[.)])/.test(item.texto))));
});

test("El lote de ansiedad conserva fuente registrada y estado de revisión honesto", () => {
  const ansiedad = DIAGNOSTICOS_BIBLIOTECA.filter((diagnostico) => diagnostico.categoria === "Trastornos de ansiedad");
  assert.equal(ansiedad.length, 11);
  assert.ok(ansiedad.every((diagnostico) => Object.values(diagnostico.sistemas).every((sistema) => sistema.fuente && sistema.completionStatus !== "complete")));
});

test("Biblioteca usa ids únicos y una sola entidad por nombre", () => {
  const ids = DIAGNOSTICOS_BIBLIOTECA.map((diagnostico) => diagnostico.id);
  const nombres = DIAGNOSTICOS_BIBLIOTECA.map((diagnostico) => diagnostico.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(nombres).size, nombres.length);
});

test("Las entidades de ansiedad tienen resumen DSM-5 estructurado y no literal", () => {
  const ansiedad = DIAGNOSTICOS_BIBLIOTECA.filter((diagnostico) => diagnostico.categoria === "Trastornos de ansiedad");
  assert.equal(ansiedad.length, 11);
  assert.ok(ansiedad.every((diagnostico) => {
    const sistema = diagnostico.sistemas.dsm5;
    return sistema?.criterios.length > 0 && sistema.criterios.every((criterio) => criterio.literal === false);
  }));
});

test("TAG contiene CIE-10, CIE-11 y DSM-5 en una sola tarjeta", () => {
  const tag = DIAGNOSTICOS_BIBLIOTECA.find((diagnostico) => diagnostico.id === "trastorno-trastorno-de-ansiedad-generalizada");
  assert.ok(tag);
  assert.deepEqual(Object.keys(tag.sistemas), SISTEMAS_DIAGNOSTICOS);
  assert.equal(tag.sistemas.cie10.codigo, "F41.1");
  assert.equal(tag.sistemas.cie11.codigo, "6B00");
  assert.equal(tag.sistemas.dsm5.codigo, "300.02");
  assert.ok(tag.sistemas.dsm5.criterios.length > 0);
});

test("Los criterios están anidados dentro del sistema diagnóstico", () => {
  assert.ok(DIAGNOSTICOS_BIBLIOTECA.some((diagnostico) => Object.values(diagnostico.sistemas).some((sistema) => sistema.criterios.length > 0)));
  assert.ok(DIAGNOSTICOS_BIBLIOTECA.every((diagnostico) => !Object.prototype.hasOwnProperty.call(diagnostico, "criterios")));
});
