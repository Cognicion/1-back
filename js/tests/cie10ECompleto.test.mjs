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

const TOTAL_E = 412;
const HASH_CODIGOS_E = "29c25e23e56c983272f5083a6eba16212a866430c9a14459ab46da650226b8a1";
const HASH_NOMBRES_E = "525f063435b9e07aa581d9a4b00b8d3605bc729a77d27fb93ff5276d21d7b2c4";
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

function entidadesE() {
  return CATALOGO_DIAGNOSTICOS.filter((diagnostico) => diagnostico.sistemas?.cie10?.codigo?.startsWith("E"));
}

function sha256(valores) {
  return createHash("sha256").update([...valores].sort().join("\n")).digest("hex");
}

function alertasPara(codigo, diagnostico, medicamento) {
  return evaluarMedicamentosPaciente({
    paciente: { diagnosticos: [{ codigo, diagnostico, estado: "confirmado" }] },
    medicamentos: [{ medicamento }]
  }).alertas;
}

test("E00-E90 coincide exactamente con el conjunto oficial OMS incorporado", () => {
  const entidades = entidadesE();
  assert.equal(entidades.length, TOTAL_E);
  assert.equal(new Set(entidades.map((item) => item.codigo)).size, TOTAL_E);
  assert.equal(sha256(entidades.map((item) => item.codigo)), HASH_CODIGOS_E);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialEs}`)), HASH_NOMBRES_E);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosEOficiales, TOTAL_E);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosEFaltantes, 0);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosEAdicionales, 0);
});

test("cada entidad E conserva jerarquía, búsqueda y todas las propiedades clínicas", () => {
  const codigos = new Set(CIE10.map((item) => item.codigo));
  for (const diagnostico of entidadesE()) {
    const sistema = diagnostico.sistemas.cie10;
    assert.match(diagnostico.codigo, /^E\d{2}(?:\.\d)?$/);
    assert.ok(diagnostico.aliases.includes(diagnostico.codigo), diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.nombre), diagnostico.codigo);
    assert.equal(sistema.jerarquia.capitulo.codigo, "IV", diagnostico.codigo);
    assert.match(sistema.jerarquia.grupo.codigo, /^E\d{2}-E\d{2}$/);
    assert.equal(sistema.jerarquia.categoria.codigo, diagnostico.codigo.slice(0, 3));
    if (diagnostico.codigo.includes(".")) assert.ok(codigos.has(diagnostico.codigo.slice(0, 3)), diagnostico.codigo);

    const clinicas = diagnostico.propiedadesPorFuente.cie10.clinicas;
    for (const propiedad of PROPIEDADES_CLINICAS) {
      const valor = clinicas[propiedad];
      assert.ok(Array.isArray(valor) ? valor.length : String(valor || "").trim(), `${diagnostico.codigo}:${propiedad}`);
    }
    assert.equal(diagnostico.propiedadesPorFuente.cie10.fuente.sourceVerified, true, diagnostico.codigo);
    assert.ok(diagnostico.farmacologia, diagnostico.codigo);
    assert.deepEqual(sistema.criterios.map((panel) => panel.titulo), SECCIONES, diagnostico.codigo);
    assert.ok(sistema.criterios.every((panel) => panel.items.length && panel.items.every((item) => item.texto.trim())), diagnostico.codigo);
  }
});

test("E35 y E90 conservan sus cinco formas tabulares con asterisco", () => {
  const codigos = entidadesE()
    .filter((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoAsterisco)
    .map((item) => item.codigo);
  assert.deepEqual(codigos, ["E35", "E35.0", "E35.1", "E35.8", "E90"]);
});

test("los paneles E permanecen diferidos y la búsqueda no los materializa", () => {
  const sistema = entidadesE()[0].sistemas.cie10;
  assert.equal(sistema.criteriosLazy, true);
  assert.equal(typeof Object.getOwnPropertyDescriptor(sistema, "criterios")?.get, "function");
  const biblioteca = readFileSync(new URL("../biblioteca.js", import.meta.url), "utf8");
  assert.match(biblioteca, /datos\?\.criteriosLazy/);
  assert.match(biblioteca, /sistema\.criteriosLazy \? \[\]/);
});

test("la búsqueda parcial encuentra E por código, nombre oficial y sinónimo", () => {
  const buscar = (texto) => {
    const consulta = texto.toLowerCase();
    return CIE10.filter((item) => [item.codigo, item.nombre, ...(item.aliases || [])].join(" ").toLowerCase().includes(consulta));
  };
  assert.ok(buscar("e11.9").some((item) => item.codigo === "E11.9"));
  assert.ok(buscar("diabetes mellitus tipo 2").some((item) => item.codigo.startsWith("E11")));
  assert.ok(buscar("síndrome de ovario poliquístico").some((item) => item.codigo === "E28.2"));
  assert.ok(buscar("hiponatremia").some((item) => item.codigo === "E87.1"));
  assert.ok(buscar("lisis tumoral").some((item) => item.codigo === "E88.3"));
});

test("las reglas E generan una sola advertencia clínica específica por riesgo", () => {
  const casos = [
    ["E03", "Hipotiroidismo", "Litio 300 mg", /litio con trastorno tiroideo/i, "alta"],
    ["E10", "Diabetes mellitus tipo 1", "Olanzapina 10 mg", /olanzapina en diabetes/i, "alta"],
    ["E66", "Obesidad", "Clozapina 100 mg", /clozapina con riesgo metabólico/i, "alta"],
    ["E87.1", "Hiponatremia", "Sertralina 50 mg", /isrs\/irsn con hiponatremia/i, "alta"],
    ["E87.5", "Hiperpotasemia", "Espironolactona 25 mg", /espironolactona con hiperpotasemia/i, "critica"],
    ["E27.1", "Enfermedad de Addison", "Espironolactona 25 mg", /espironolactona con enfermedad de addison/i, "critica"],
    ["E86", "Depleción de volumen", "Litio 300 mg", /litio con depleción de volumen/i, "alta"]
  ];
  for (const [codigo, diagnostico, medicamento, titulo, severidad] of casos) {
    const coincidentes = alertasPara(codigo, diagnostico, medicamento).filter((alerta) => titulo.test(alerta.titulo));
    assert.equal(coincidentes.length, 1, `${codigo} + ${medicamento}`);
    assert.equal(coincidentes[0].severidad, severidad, `${codigo} + ${medicamento}`);
  }
  const hiperpotasemia = alertasPara("E87.5", "Hiperpotasemia", "Espironolactona 25 mg")
    .filter((alerta) => /potasio|hiperpotasemia/i.test(alerta.titulo));
  assert.equal(hiperpotasemia.length, 1, "la contraindicación específica debe sustituir la advertencia genérica");
});
