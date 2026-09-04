import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  METADATOS_CATALOGO_DIAGNOSTICOS
} from "../data/catalogoDiagnosticos.js";

const TOTAL_H = 442;
const HASH_CODIGOS_H = "38a4689ffc28f52ee7af45cabda08704bcfb600f01dc6e198b60d4b372a1d212";
const HASH_NOMBRES_H = "a581dde334bcd2edd8b0939460ff3888006f67891702edeed3f2f907c08f11e8";
const HASH_NOMBRES_OMS_H = "9c51a9a6247bbe30e11779826197c4d37152152d156a257ea7aaa9854a768001";
const HASH_ASTERISCOS_H = "88b4c818e46acc1f1890c28f5c2cb2264c3b8f742918f5b822a384e5a0ba7c68";
const HASH_GRUPOS_H = "03c053ed68d4c6363cab96c351e0564777589d7c3f30408d9e467c7e4bcabf8a";

const GRUPOS_H = Object.freeze([
  { codigo: "H00-H06", nombre: "Trastornos del párpado, aparato lagrimal y órbita", total: 47, categorias: 7, subcategorias: 40, terminales: 40, asteriscos: 9 },
  { codigo: "H10-H13", nombre: "Trastornos de la conjuntiva", total: 23, categorias: 3, subcategorias: 20, terminales: 20, asteriscos: 6 },
  { codigo: "H15-H22", nombre: "Trastornos de la esclerótica, córnea, iris y cuerpo ciliar", total: 54, categorias: 8, subcategorias: 46, terminales: 46, asteriscos: 10 },
  { codigo: "H25-H28", nombre: "Trastornos del cristalino", total: 24, categorias: 4, subcategorias: 20, terminales: 20, asteriscos: 5 },
  { codigo: "H30-H36", nombre: "Trastornos de la coroides y de la retina", total: 44, categorias: 7, subcategorias: 37, terminales: 37, asteriscos: 6 },
  { codigo: "H40-H42", nombre: "Glaucoma", total: 13, categorias: 2, subcategorias: 11, terminales: 11, asteriscos: 3 },
  { codigo: "H43-H45", nombre: "Trastornos del cuerpo vítreo y del globo ocular", total: 22, categorias: 3, subcategorias: 19, terminales: 19, asteriscos: 4 },
  { codigo: "H46-H48", nombre: "Trastornos del nervio óptico y de las vías ópticas", total: 14, categorias: 3, subcategorias: 11, terminales: 12, asteriscos: 4 },
  { codigo: "H49-H52", nombre: "Trastornos de los músculos oculares, del movimiento binocular, de la acomodación y de la refracción", total: 33, categorias: 4, subcategorias: 29, terminales: 29, asteriscos: 0 },
  { codigo: "H53-H54", nombre: "Alteraciones de la visión y ceguera", total: 19, categorias: 2, subcategorias: 17, terminales: 17, asteriscos: 0 },
  { codigo: "H55-H59", nombre: "Otros trastornos del ojo y sus anexos", total: 14, categorias: 4, subcategorias: 10, terminales: 11, asteriscos: 4 },
  { codigo: "H60-H62", nombre: "Enfermedades del oído externo", total: 23, categorias: 3, subcategorias: 20, terminales: 20, asteriscos: 7 },
  { codigo: "H65-H75", nombre: "Enfermedades del oído medio y de la mastoides", total: 54, categorias: 11, subcategorias: 43, terminales: 44, asteriscos: 7 },
  { codigo: "H80-H83", nombre: "Enfermedades del oído interno", total: 22, categorias: 4, subcategorias: 18, terminales: 19, asteriscos: 1 },
  { codigo: "H90-H95", nombre: "Otros trastornos del oído", total: 36, categorias: 6, subcategorias: 30, terminales: 30, asteriscos: 3 }
]);

const CATEGORIAS_ASTERISCO_H = Object.freeze([
  "H03", "H06", "H13", "H19", "H22", "H28", "H32", "H36", "H42",
  "H45", "H48", "H58", "H62", "H67", "H75", "H82", "H94"
]);

const SECCIONES_ESPERADAS = Object.freeze([
  "CIE-10", "Definición", "Etiología", "Agente causal", "Manifestaciones clínicas",
  "Diagnóstico", "Laboratorios", "Imagen", "Diagnóstico diferencial", "Tratamiento",
  "Complicaciones", "Prevención", "Pronóstico", "Exclusiones", "Referencias"
]);

const PROPIEDADES_CLINICAS = Object.freeze([
  "sinonimosMedicos", "definicionClinica", "etiologia", "agenteCausal", "epidemiologia",
  "manifestacionesClinicas", "criteriosDiagnosticos", "laboratoriosRecomendados", "estudiosImagen",
  "diagnosticoDiferencial", "complicaciones", "tratamientoInicial", "tratamientoEspecifico",
  "prevencion", "pronostico", "exclusiones"
]);

function entidadesH() {
  return CATALOGO_DIAGNOSTICOS.filter((diagnostico) => diagnostico.sistemas?.cie10?.codigo?.startsWith("H"));
}

function entidadH(codigo) {
  return entidadesH().find((diagnostico) => diagnostico.codigo === codigo);
}

function sha256(valores) {
  return createHash("sha256").update([...valores].sort().join("\n")).digest("hex");
}

function assertTexto(valor, contexto) {
  assert.ok(String(valor || "").trim(), contexto);
}

function buscar(texto) {
  const consulta = texto.toLocaleLowerCase("es");
  return CIE10.filter((item) => [item.codigo, item.nombre, ...(item.aliases || [])]
    .join(" ").toLocaleLowerCase("es").includes(consulta));
}

test("H00-H95 coincide exactamente con el conjunto oficial OMS 2019 y su nomenclatura efectiva", () => {
  const entidades = entidadesH();
  const proyeccion = CIE10.filter((item) => item.codigo.startsWith("H"));
  assert.equal(entidades.length, TOTAL_H);
  assert.equal(new Set(entidades.map((item) => item.id)).size, TOTAL_H);
  assert.equal(new Set(entidades.map((item) => item.codigo)).size, TOTAL_H);
  assert.equal(proyeccion.length, TOTAL_H);
  assert.deepEqual(proyeccion.map((item) => item.codigo).sort(), entidades.map((item) => item.codigo).sort());
  assert.equal(sha256(entidades.map((item) => item.codigo)), HASH_CODIGOS_H);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialEs}`)), HASH_NOMBRES_H);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialOms}`)), HASH_NOMBRES_OMS_H);

  const integridad = METADATOS_CATALOGO_DIAGNOSTICOS.integridad;
  assert.equal(integridad.codigosHOficiales, TOTAL_H);
  assert.equal(integridad.codigosHFaltantes, 0);
  assert.equal(integridad.codigosHAdicionales, 0);
  assert.equal(integridad.sha256CodigosH, HASH_CODIGOS_H);
  assert.equal(integridad.sha256NombresH, HASH_NOMBRES_H);
  assert.equal(integridad.sha256NombresOmsH, HASH_NOMBRES_OMS_H);
});

test("H conserva 71 categorías, 371 subcategorías, 375 terminales y los quince grupos oficiales", () => {
  const entidades = entidadesH();
  const clasificacion = (item) => item.propiedadesPorFuente.cie10.clasificacionOficial;
  assert.equal(entidades.filter((item) => clasificacion(item).nivel === 3).length, 71);
  assert.equal(entidades.filter((item) => clasificacion(item).nivel === 4).length, 371);
  assert.equal(entidades.filter((item) => clasificacion(item).terminal).length, 375);
  assert.equal(entidades.filter((item) => !clasificacion(item).terminal).length, 67);
  assert.equal(entidades.filter((item) => clasificacion(item).capitulo === "07").length, 307);
  assert.equal(entidades.filter((item) => clasificacion(item).capitulo === "08").length, 135);
  assert.equal(sha256(GRUPOS_H.map((grupo) => `${grupo.codigo}\t${grupo.nombre}`)), HASH_GRUPOS_H);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256GruposH, HASH_GRUPOS_H);

  for (const esperado of GRUPOS_H) {
    const items = entidades.filter((item) => item.sistemas.cie10.jerarquia.grupo.codigo === esperado.codigo);
    assert.equal(items.length, esperado.total, `${esperado.codigo}: total`);
    assert.ok(items.every((item) => item.sistemas.cie10.jerarquia.grupo.nombre === esperado.nombre), `${esperado.codigo}: nombre`);
    assert.equal(items.filter((item) => clasificacion(item).nivel === 3).length, esperado.categorias, `${esperado.codigo}: categorías`);
    assert.equal(items.filter((item) => clasificacion(item).nivel === 4).length, esperado.subcategorias, `${esperado.codigo}: subcategorías`);
    assert.equal(items.filter((item) => clasificacion(item).terminal).length, esperado.terminales, `${esperado.codigo}: terminales`);
    assert.equal(items.filter((item) => clasificacion(item).codigoAsterisco).length, esperado.asteriscos, `${esperado.codigo}: asteriscos`);
  }
});

test("las 69 formas tabulares con asterisco cubren las 17 categorías oficiales", () => {
  const conAsterisco = entidadesH().filter((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoAsterisco);
  assert.equal(conAsterisco.length, 69);
  assert.equal(sha256(conAsterisco.map((item) => item.codigo)), HASH_ASTERISCOS_H);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256CodigosAsteriscoH, HASH_ASTERISCOS_H);
  assert.deepEqual([...new Set(conAsterisco.map((item) => item.codigo.slice(0, 3)))], CATEGORIAS_ASTERISCO_H);
  for (const diagnostico of conAsterisco) {
    const oficial = diagnostico.propiedadesPorFuente.cie10.clasificacionOficial;
    assert.equal(diagnostico.codigo.includes("*"), false, diagnostico.codigo);
    assert.ok(oficial.codigoTabular.startsWith(diagnostico.codigo), diagnostico.codigo);
    assert.ok(oficial.codigoTabular.endsWith("*"), diagnostico.codigo);
    assert.ok(diagnostico.sistemas.cie10.especificadores.some((texto) => /enfermedad subyacente/i.test(texto)), diagnostico.codigo);
    assert.match(diagnostico.propiedadesPorFuente.cie10.clinicas.tratamientoEspecifico, /enfermedad subyacente/i, diagnostico.codigo);
  }
});

test("H54 usa la revisión OMS 2019 sin reintroducir H54.7", () => {
  const esperados = new Map(Object.entries({
    H54: "Discapacidad visual, incluso ceguera (binocular o monocular)",
    "H54.0": "Ceguera binocular",
    "H54.1": "Discapacidad visual grave, binocular",
    "H54.2": "Discapacidad visual moderada, binocular",
    "H54.3": "Discapacidad visual leve o inexistente, binocular",
    "H54.4": "Ceguera monocular",
    "H54.5": "Discapacidad visual grave, monocular",
    "H54.6": "Discapacidad visual moderada, monocular",
    "H54.9": "Discapacidad visual no especificada (binocular)"
  }));
  for (const [codigo, nombre] of esperados) {
    const entidad = entidadH(codigo);
    assert.equal(entidad?.nombre, nombre, codigo);
    assert.equal(entidad.propiedadesPorFuente.cie10.fuenteNomenclaturaEs.estado, "traduccion_controlada_actualizacion_oms", codigo);
  }
  assert.equal(entidadH("H54.7"), undefined);
  assert.match(entidadH("H54").propiedadesPorFuente.cie10.clinicas.etiologia, /causa debe codificarse.*por separado/i);
});

test("cada entidad H expone las 16 propiedades, 15 paneles lazy y trazabilidad prudente", () => {
  for (const diagnostico of entidadesH()) {
    const sistema = diagnostico.sistemas.cie10;
    const fuente = diagnostico.propiedadesPorFuente.cie10;
    assert.equal(diagnostico.contenidoClinicoLazy, true, diagnostico.codigo);
    assert.equal(sistema.criteriosLazy, true, diagnostico.codigo);
    assert.equal(sistema.criterios.length, 15, diagnostico.codigo);
    assert.deepEqual(sistema.criterios.map((panel) => panel.titulo), SECCIONES_ESPERADAS, diagnostico.codigo);
    for (const propiedad of PROPIEDADES_CLINICAS) {
      const valor = fuente.clinicas[propiedad];
      if (Array.isArray(valor)) assert.ok(valor.length, `${diagnostico.codigo}.${propiedad}`);
      else assertTexto(valor, `${diagnostico.codigo}.${propiedad}`);
    }
    assert.equal(sistema.completionStatus, "partial", diagnostico.codigo);
    assert.equal(sistema.review.classificationSourceVerified, true, diagnostico.codigo);
    assert.equal(sistema.review.clinicalEvidenceVerified, false, diagnostico.codigo);
    assert.equal(fuente.evidenciaClinica.verificada, false, diagnostico.codigo);
    assert.equal(sistema.fuente.sourceVerified, true, diagnostico.codigo);
    assert.ok(diagnostico.referencias.length >= 5, diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.codigo), diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.nombre), diagnostico.codigo);
  }
});

test("los perfiles sensibles no convierten el código aislado en diagnóstico causal o tratamiento", () => {
  assert.match(entidadH("H40").propiedadesPorFuente.cie10.clinicas.definicionClinica, /presión aislada no confirma ni excluye/i);
  assert.match(entidadH("H91.2").propiedadesPorFuente.cie10.clinicas.tratamientoInicial, /derivación inmediata/i);
  assert.match(entidadH("H70").propiedadesPorFuente.cie10.clinicas.tratamientoInicial, /hospitalaria urgente/i);
  assert.match(entidadH("H82").propiedadesPorFuente.cie10.clinicas.etiologia, /enfermedad codificada en otra parte/i);
  assert.ok(entidadesH().every((item) => item.farmacologia.estadoCobertura === "sin_regla_especifica_cargada"));
  assert.ok(entidadesH().every((item) => item.farmacologia.ausenciaReglaNoImplicaSeguridad === true));
  assert.ok(entidadesH().every((item) => item.farmacologia.reglas.length === 0));
});

test("todos los diagnósticos H son buscables por código, nombre inglés y alias clínico", () => {
  for (const diagnostico of entidadesH()) {
    assert.ok(buscar(diagnostico.codigo).some((item) => item.codigo === diagnostico.codigo), diagnostico.codigo);
    assert.ok(buscar(diagnostico.nombre).some((item) => item.codigo === diagnostico.codigo), diagnostico.codigo);
    assert.ok(buscar(diagnostico.nombreOficialOms).some((item) => item.codigo === diagnostico.codigo), diagnostico.codigo);
  }
  assert.ok(buscar("acúfenos").some((item) => item.codigo.startsWith("H93")));
  assert.ok(buscar("desprendimiento de retina").some((item) => item.codigo.startsWith("H33")));
  assert.ok(buscar("hipoacusia súbita idiopática").some((item) => item.codigo === "H91.2"));
});

test("Biblioteca marca H como códigos completos, conserva fichas parciales y renueva su caché", () => {
  const javascript = readFileSync(new URL("../biblioteca.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../biblioteca.html", import.meta.url), "utf8");
  assert.match(javascript, /CAPITULOS_CIE10_CODIGOS_COMPLETOS = new Set\(\["A", "B", "C", "D", "E", "F", "G", "H", "I"\]\)/);
  assert.match(javascript, /CAPITULOS_CIE10_FICHAS_COMPLETAS = new Set\(\["C", "D", "E"\]\)/);
  assert.match(javascript, /catalogoDiagnosticos\.js\?v=20260904-biblioteca-cie10-h-v1/);
  assert.match(html, /js\/biblioteca\.js\?v=20260904-biblioteca-cie10-h-v1/);
});
