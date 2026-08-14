import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  METADATOS_CATALOGO_DIAGNOSTICOS
} from "../data/catalogoDiagnosticos.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const SECCIONES = [
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

const PROPIEDADES_CLINICAS = [
  "sinonimosMedicos",
  "definicionClinica",
  "etiologia",
  "agenteCausal",
  "epidemiologia",
  "manifestacionesClinicas",
  "criteriosDiagnosticos",
  "laboratoriosRecomendados",
  "estudiosImagen",
  "diagnosticoDiferencial",
  "complicaciones",
  "tratamientoInicial",
  "tratamientoEspecifico",
  "prevencion",
  "pronostico",
  "exclusiones"
];

const EXPECTED = {
  C: {
    total: 539,
    codeHash: "24b24733336786e991118109fa484698b9e4000f8a04469247e7dcb2029e7059",
    nameHash: "649435b76756e9cd052e79823562cb6f30e5b98876fe14745c4296ee5673ea75"
  },
  D: {
    total: 527,
    codeHash: "5fcf520a101357c413137aef708ed043297a3772616d6d0c7145f5cf577248ac",
    nameHash: "fc6cb47efecafd0310530c06ac3c5defdf7b80caa3f113e133e43af16b3b4098"
  }
};

function entidades(letra) {
  return CATALOGO_DIAGNOSTICOS.filter((diagnostico) => diagnostico.sistemas?.cie10?.codigo?.startsWith(letra));
}

function sha256(valores) {
  return createHash("sha256").update(valores.sort().join("\n")).digest("hex");
}

function alertaPara(codigo, medicamento, fragmento) {
  const resultado = evaluarMedicamentosPaciente({
    paciente: { diagnosticos: [{ codigo, diagnostico: codigo, estado: "confirmado" }] },
    medicamentos: [{ medicamento }]
  });
  assert.ok(resultado.alertas.some((alerta) => alerta.titulo.toLowerCase().includes(fragmento.toLowerCase())), `${codigo} + ${medicamento}`);
}

test("C y D coinciden exactamente con los conjuntos oficiales OMS incorporados", () => {
  for (const letra of ["C", "D"]) {
    const items = entidades(letra);
    assert.equal(items.length, EXPECTED[letra].total);
    assert.equal(new Set(items.map((item) => item.codigo)).size, items.length);
    assert.equal(sha256(items.map((item) => item.codigo)), EXPECTED[letra].codeHash);
    assert.equal(sha256(items.map((item) => `${item.codigo}\t${item.nombreOficialEs}`)), EXPECTED[letra].nameHash);
    assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad[`codigos${letra}Faltantes`], 0);
    assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad[`codigos${letra}Adicionales`], 0);
  }
});

test("cada entidad C/D es buscable, conserva jerarquía y tiene todas sus propiedades", () => {
  const codigos = new Set(CIE10.map((item) => item.codigo));
  for (const diagnostico of [...entidades("C"), ...entidades("D")]) {
    const sistema = diagnostico.sistemas.cie10;
    assert.match(diagnostico.codigo, /^[CD]\d{2}(?:\.\d)?$/);
    assert.ok(diagnostico.aliases.includes(diagnostico.codigo), diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.nombre), diagnostico.codigo);
    assert.ok(sistema.jerarquia.capitulo?.codigo, diagnostico.codigo);
    assert.ok(sistema.jerarquia.grupo?.codigo, diagnostico.codigo);
    assert.equal(sistema.jerarquia.categoria.codigo, diagnostico.codigo.slice(0, 3));
    if (diagnostico.codigo.includes(".")) assert.ok(codigos.has(diagnostico.codigo.slice(0, 3)), diagnostico.codigo);

    const clinicas = diagnostico.propiedadesPorFuente.cie10.clinicas;
    for (const propiedad of PROPIEDADES_CLINICAS) {
      const valor = clinicas[propiedad];
      assert.ok(Array.isArray(valor) ? valor.length : String(valor || "").trim(), `${diagnostico.codigo}:${propiedad}`);
    }
    const paneles = sistema.criterios;
    assert.deepEqual(paneles.map((panel) => panel.titulo), SECCIONES, diagnostico.codigo);
    assert.ok(paneles.every((panel) => panel.items.length && panel.items.every((item) => item.texto.trim())), diagnostico.codigo);
    assert.ok(diagnostico.farmacologia && diagnostico.propiedadesPorFuente.cie10.fuente.sourceVerified, diagnostico.codigo);
  }
});

test("los cuatro códigos con asterisco conservan su semántica tabular", () => {
  const starred = entidades("D")
    .filter((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoAsterisco)
    .map((item) => item.codigo);
  assert.deepEqual(starred, ["D63", "D63.0", "D63.8", "D77"]);
});

test("los criterios C/D permanecen diferidos hasta que la Biblioteca expande el diagnóstico", () => {
  const sistema = entidades("C")[0].sistemas.cie10;
  const descriptor = Object.getOwnPropertyDescriptor(sistema, "criterios");
  assert.equal(sistema.criteriosLazy, true);
  assert.equal(typeof descriptor?.get, "function");
  const biblioteca = readFileSync(new URL("../biblioteca.js", import.meta.url), "utf8");
  assert.match(biblioteca, /datos\?\.criteriosLazy/);
  assert.match(biblioteca, /sistema\.criteriosLazy \? \[\]/);
});

test("la búsqueda parcial encuentra C y D por código, nombre y sinónimo", () => {
  const buscar = (texto) => {
    const consulta = texto.toLowerCase();
    return CIE10.filter((item) => [item.codigo, item.nombre, ...(item.aliases || [])].join(" ").toLowerCase().includes(consulta));
  };
  assert.ok(buscar("c71.9").some((item) => item.codigo === "C71.9"));
  assert.ok(buscar("linfoma folicular grado iiia").some((item) => item.codigo === "C82.3"));
  assert.ok(buscar("cáncer de la mama").some((item) => item.codigo === "C50"));
  assert.ok(buscar("trombofilia primaria").some((item) => item.codigo === "D68.5"));
  assert.ok(buscar("g6pd").some((item) => item.codigo === "D55.0"));
});

test("las reglas C/D generan advertencias al coexistir diagnóstico y fármaco", () => {
  alertaPara("C50", "Etinilestradiol", "cáncer de mama");
  alertaPara("C71.9", "Bupropion 150 mg", "sistema nervioso central");
  alertaPara("D55.0", "Trimetoprim/sulfametoxazol", "G6PD");
  alertaPara("D61.9", "Metotrexato 15 mg", "insuficiencia medular");
  alertaPara("D68.5", "Anticonceptivo oral con drospirenona", "trombofilia");
  alertaPara("D69.6", "Valproato 500 mg", "hemostasia");
  alertaPara("D70", "Clozapina 100 mg", "neutropenia");
});
