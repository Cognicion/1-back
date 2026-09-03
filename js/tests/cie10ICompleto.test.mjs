import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  METADATOS_CATALOGO_DIAGNOSTICOS
} from "../data/catalogoDiagnosticos.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const TOTAL_I = 453;
const HASH_CODIGOS_I = "3070b639b4c28d6e0ce2183198f63df7d3716ba3164c651759afbe7d2c59c19e";
const HASH_NOMBRES_I = "d1c450ac793841659507966b995f3f534cc0800239b223e03d033ba7782757bd";
const HASH_NOMBRES_OMS_I = "4ab9a6a44f8b850184b802fda0167e7584a338807ecc851f7f7ffe2a1dd87174";
const HASH_ASTERISCOS_I = "7c5b3675850ff5974702edbdf3c530ff69576d6054fdbd411f19a4fc2a55b76d";
const HASH_GRUPOS_I = "dd73ac5590f7a3e290b1ec8dfb72882cc4850da2b6db5b2a9633fc0d9185e26e";

const GRUPOS_I = Object.freeze([
  { codigo: "I00-I02", nombre: "Fiebre reumática aguda", total: 10, categorias: 3, subcategorias: 7, terminales: 8, asteriscos: 0 },
  { codigo: "I05-I09", nombre: "Enfermedades cardíacas reumáticas crónicas", total: 31, categorias: 5, subcategorias: 26, terminales: 26, asteriscos: 0 },
  { codigo: "I10-I15", nombre: "Enfermedades hipertensivas", total: 18, categorias: 5, subcategorias: 13, terminales: 14, asteriscos: 0 },
  { codigo: "I20-I25", nombre: "Enfermedades isquémicas del corazón", total: 41, categorias: 6, subcategorias: 35, terminales: 35, asteriscos: 0 },
  { codigo: "I26-I28", nombre: "Enfermedad cardiopulmonar y enfermedades de la circulación pulmonar", total: 14, categorias: 3, subcategorias: 11, terminales: 11, asteriscos: 0 },
  { codigo: "I30-I52", nombre: "Otras formas de enfermedad del corazón", total: 140, categorias: 23, subcategorias: 117, terminales: 118, asteriscos: 25 },
  { codigo: "I60-I69", nombre: "Enfermedades cerebrovasculares", total: 74, categorias: 10, subcategorias: 64, terminales: 65, asteriscos: 5 },
  { codigo: "I70-I79", nombre: "Enfermedades de las arterias, de las arteriolas y de los vasos capilares", total: 60, categorias: 8, subcategorias: 52, terminales: 52, asteriscos: 5 },
  { codigo: "I80-I89", nombre: "Enfermedades de las venas y de los vasos y ganglios linfáticos, no clasificadas en otra parte", total: 46, categorias: 9, subcategorias: 37, terminales: 38, asteriscos: 0 },
  { codigo: "I95-I99", nombre: "Otros trastornos y los no especificados del sistema circulatorio", total: 19, categorias: 4, subcategorias: 15, terminales: 16, asteriscos: 6 }
]);

const CATEGORIAS_ASTERISCO_I = Object.freeze([
  "I32", "I39", "I41", "I43", "I52", "I68", "I79", "I98"
]);

const SECCIONES = Object.freeze([
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
]);

const PROPIEDADES_CLINICAS = Object.freeze([
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
]);

const REGLAS_HIPERTENSION = Object.freeze([
  "olanzapina_riesgo_cardiovascular",
  "risperidona_riesgo_cardiovascular",
  "estimulante_noradrenergico_hipertension"
]);

const REGLAS_CARDIORRENALES = Object.freeze([
  "aine_enfermedad_renal",
  "metformina_enfermedad_renal",
  "litio_renal",
  "sraa_funcion_renal_i13",
  "diuretico_funcion_renal_i13",
  "aine_funcion_renal_i13_ext",
  "gabapentinoide_renal",
  ...REGLAS_HIPERTENSION
]);

const FAMILIAS_FARMACOLOGICAS = Object.freeze({
  I10: ["I10"],
  I11: ["I11", "I11.0", "I11.9"],
  I12: ["I12", "I12.0", "I12.9"],
  I13: ["I13", "I13.0", "I13.1", "I13.2", "I13.9"],
  I15: ["I15", "I15.0", "I15.1", "I15.2", "I15.8", "I15.9"]
});

function entidadesI() {
  return CATALOGO_DIAGNOSTICOS.filter((diagnostico) => diagnostico.sistemas?.cie10?.codigo?.startsWith("I"));
}

function entidadI(codigo) {
  return entidadesI().find((diagnostico) => diagnostico.codigo === codigo);
}

function sha256(valores) {
  return createHash("sha256").update([...valores].sort().join("\n")).digest("hex");
}

function assertTexto(valor, contexto) {
  assert.ok(String(valor || "").trim(), contexto);
}

function assertUrl(valor, contexto) {
  assertTexto(valor, contexto);
  assert.doesNotThrow(() => new URL(valor), contexto);
}

function buscar(texto) {
  const consulta = texto.toLocaleLowerCase("es");
  return CIE10.filter((item) => [
    item.codigo,
    item.nombre,
    ...(item.aliases || [])
  ].join(" ").toLocaleLowerCase("es").includes(consulta));
}

function clinicas(codigo) {
  const diagnostico = entidadI(codigo);
  assert.ok(diagnostico, codigo);
  return diagnostico.propiedadesPorFuente.cie10.clinicas;
}

function alertasPara(codigo, medicamento) {
  const diagnostico = entidadI(codigo);
  assert.ok(diagnostico, codigo);
  return evaluarMedicamentosPaciente({
    paciente: {
      diagnosticos: [{ codigo, diagnostico: diagnostico.nombre, estado: "confirmado" }]
    },
    medicamentos: [{ medicamento }]
  }).alertas;
}

function assertUnaAlertaDeRegla(codigo, medicamento, reglaId) {
  const coincidentes = alertasPara(codigo, medicamento)
    .filter((alerta) => alerta.id === reglaId || alerta.id.startsWith(`${reglaId}:`));
  assert.equal(coincidentes.length, 1, `${codigo} + ${medicamento} debe resolver una sola alerta ${reglaId}`);
}

test("I00-I99 coincide exactamente con el conjunto oficial OMS 2019 y la nomenclatura española efectiva", () => {
  const entidades = entidadesI();
  const proyeccion = CIE10.filter((item) => item.codigo.startsWith("I"));

  assert.equal(entidades.length, TOTAL_I);
  assert.equal(new Set(entidades.map((item) => item.id)).size, TOTAL_I);
  assert.equal(new Set(entidades.map((item) => item.codigo)).size, TOTAL_I);
  assert.equal(proyeccion.length, TOTAL_I);
  assert.deepEqual(
    proyeccion.map((item) => item.codigo).sort(),
    entidades.map((item) => item.codigo).sort()
  );
  assert.equal(sha256(entidades.map((item) => item.codigo)), HASH_CODIGOS_I);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialEs}`)), HASH_NOMBRES_I);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialOms}`)), HASH_NOMBRES_OMS_I);

  const integridad = METADATOS_CATALOGO_DIAGNOSTICOS.integridad;
  assert.equal(integridad.codigosIOficiales, TOTAL_I);
  assert.equal(integridad.codigosIFaltantes, 0);
  assert.equal(integridad.codigosIAdicionales, 0);
  assert.equal(integridad.gruposIOficiales, GRUPOS_I.length);
  assert.equal(integridad.codigosIAsterisco, 41);
  assert.equal(integridad.sha256CodigosI, HASH_CODIGOS_I);
  assert.equal(integridad.sha256NombresI, HASH_NOMBRES_I);
  assert.equal(integridad.sha256NombresOmsI, HASH_NOMBRES_OMS_I);
});

test("I conserva 76 categorías, 377 subcategorías, 383 terminales y los diez grupos oficiales", () => {
  const entidades = entidadesI();
  const clasificacion = (item) => item.propiedadesPorFuente.cie10.clasificacionOficial;

  assert.equal(entidades.filter((item) => clasificacion(item).nivel === 3).length, 76);
  assert.equal(entidades.filter((item) => clasificacion(item).nivel === 4).length, 377);
  assert.equal(entidades.filter((item) => clasificacion(item).terminal).length, 383);
  assert.equal(entidades.filter((item) => !clasificacion(item).terminal).length, 70);

  const gruposPresentes = [...new Set(entidades.map((item) => item.sistemas.cie10.jerarquia.grupo.codigo))];
  assert.deepEqual(gruposPresentes, GRUPOS_I.map((grupo) => grupo.codigo));
  assert.equal(sha256(GRUPOS_I.map((grupo) => `${grupo.codigo}\t${grupo.nombre}`)), HASH_GRUPOS_I);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256GruposI, HASH_GRUPOS_I);

  for (const esperado of GRUPOS_I) {
    const items = entidades.filter((item) => item.sistemas.cie10.jerarquia.grupo.codigo === esperado.codigo);
    assert.equal(items.length, esperado.total, `${esperado.codigo}: total`);
    assert.ok(items.every((item) => item.sistemas.cie10.jerarquia.grupo.nombre === esperado.nombre), `${esperado.codigo}: nombre`);
    assert.equal(items.filter((item) => clasificacion(item).nivel === 3).length, esperado.categorias, `${esperado.codigo}: categorías`);
    assert.equal(items.filter((item) => clasificacion(item).nivel === 4).length, esperado.subcategorias, `${esperado.codigo}: subcategorías`);
    assert.equal(items.filter((item) => clasificacion(item).terminal).length, esperado.terminales, `${esperado.codigo}: terminales`);
    assert.equal(items.filter((item) => clasificacion(item).codigoAsterisco).length, esperado.asteriscos, `${esperado.codigo}: asteriscos`);
  }
});

test("las 41 formas tabulares con asterisco proceden de metadata y cubren ocho categorías", () => {
  const conAsterisco = entidadesI().filter((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoAsterisco);
  assert.equal(conAsterisco.length, 41);
  assert.equal(sha256(conAsterisco.map((item) => item.codigo)), HASH_ASTERISCOS_I);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256CodigosAsteriscoI, HASH_ASTERISCOS_I);
  assert.deepEqual(
    [...new Set(conAsterisco.map((item) => item.codigo.slice(0, 3)))],
    CATEGORIAS_ASTERISCO_I
  );
  for (const diagnostico of conAsterisco) {
    const oficial = diagnostico.propiedadesPorFuente.cie10.clasificacionOficial;
    assert.equal(diagnostico.codigo.includes("*"), false, diagnostico.codigo);
    assert.ok(oficial.codigoTabular.startsWith(diagnostico.codigo), diagnostico.codigo);
    assert.ok(oficial.codigoTabular.endsWith("*"), diagnostico.codigo);
    assert.ok(diagnostico.sistemas.cie10.especificadores.some((texto) => /enfermedad subyacente/i.test(texto)), diagnostico.codigo);
  }
  assert.equal(entidadI("I98.3").propiedadesPorFuente.cie10.clasificacionOficial.codigoTabular, "I98.3*");
});

test("no reaparece I84 y se conservan las altas, subdivisiones y nombres españoles centinela", () => {
  const porCodigo = new Map(entidadesI().map((item) => [item.codigo, item.nombre]));
  const esperados = new Map(Object.entries({
    I13: "Enfermedad cardiorrenal hipertensiva",
    I21: "Infarto agudo del miocardio",
    I22: "Infarto subsecuente del miocardio",
    I23: "Ciertas complicaciones presentes posteriores al infarto agudo del miocardio",
    I24: "Otras enfermedades isquémicas agudas del corazón",
    I27: "Otras enfermedades cardiopulmonares",
    "I27.0": "Hipertensión pulmonar primaria",
    "I31.0": "Pericarditis crónica adhesiva",
    "I48.0": "Fibrilación auricular paroxística",
    "I48.1": "Fibrilación auricular persistente",
    "I48.2": "Fibrilación auricular crónica",
    "I48.3": "Aleteo auricular típico",
    "I48.4": "Aleteo auricular atípico",
    "I48.9": "Fibrilación y aleteo auricular, no especificado",
    "I62.0": "Hemorragia subdural no traumática",
    I64: "Accidente vascular encefálico agudo, no especificado como hemorrágico o isquémico",
    I69: "Secuelas de enfermedad cerebrovascular",
    "I72.5": "Aneurisma y disección de otras arterias precerebrales",
    "I72.6": "Aneurisma y disección de arteria vertebral",
    "I98.3": "Várices esofágicas con hemorragia en enfermedades clasificadas en otra parte"
  }));

  for (const [codigo, nombre] of esperados) assert.equal(porCodigo.get(codigo), nombre, codigo);
  assert.equal(porCodigo.has("I27.0.0"), false);
  assert.equal([...porCodigo.keys()].some((codigo) => codigo === "I84" || codigo.startsWith("I84.")), false);
  assert.equal(porCodigo.has("I96"), false, "OMS 2019 clasifica la gangrena no especificada como R02, no I96");
  assert.ok([...porCodigo.values()].every((nombre) => !/\b(?:O tras|O clusión|T rastornos)\b/u.test(nombre)));
});

test("cada entidad I conserva jerarquía oficial, relaciones y campos raíz sin duplicar fuentes de verdad", () => {
  const codigos = new Set(entidadesI().map((item) => item.codigo));
  const grupos = new Set(GRUPOS_I.map((grupo) => grupo.codigo));

  for (const diagnostico of entidadesI()) {
    const sistema = diagnostico.sistemas.cie10;
    const oficial = diagnostico.propiedadesPorFuente.cie10.clasificacionOficial;
    const esSubcategoria = diagnostico.codigo.includes(".");

    assert.match(diagnostico.codigo, /^I\d{2}(?:\.\d)?$/, diagnostico.codigo);
    assert.equal(sistema.codigo, diagnostico.codigo, diagnostico.codigo);
    assert.equal(sistema.nombre, diagnostico.nombre, diagnostico.codigo);
    assert.equal(diagnostico.nombreOficialEs, diagnostico.nombre, diagnostico.codigo);
    assertTexto(diagnostico.nombreOficialOms, `${diagnostico.codigo}: nombre OMS`);
    assert.ok(diagnostico.aliases.includes(diagnostico.codigo), diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.nombre), diagnostico.codigo);
    assertTexto(diagnostico.descripcionBreve, `${diagnostico.codigo}: descripción`);
    assertTexto(diagnostico.categoria, `${diagnostico.codigo}: categoría`);
    assertTexto(diagnostico.subcategoria, `${diagnostico.codigo}: subcategoría`);

    assert.equal(sistema.jerarquia.capitulo.codigo, "IX", diagnostico.codigo);
    assertTexto(sistema.jerarquia.capitulo.nombre, `${diagnostico.codigo}: capítulo`);
    assert.ok(grupos.has(sistema.jerarquia.grupo.codigo), diagnostico.codigo);
    assertTexto(sistema.jerarquia.grupo.nombre, `${diagnostico.codigo}: grupo`);
    assert.equal(sistema.jerarquia.categoria.codigo, diagnostico.codigo.slice(0, 3), diagnostico.codigo);
    assert.ok(codigos.has(sistema.jerarquia.categoria.codigo), diagnostico.codigo);
    assert.equal(oficial.nivel, esSubcategoria ? 4 : 3, diagnostico.codigo);
    assert.equal(sistema.jerarquia.subcategoria === null, !esSubcategoria, diagnostico.codigo);
    if (esSubcategoria) {
      assert.deepEqual(sistema.jerarquia.subcategoria, { codigo: diagnostico.codigo, nombre: diagnostico.nombre }, diagnostico.codigo);
    }

    assert.equal(oficial.capitulo, "09", diagnostico.codigo);
    assert.equal(oficial.usoOms, "X", diagnostico.codigo);
    assert.equal(typeof oficial.terminal, "boolean", diagnostico.codigo);
    assert.equal(typeof oficial.codigoAsterisco, "boolean", diagnostico.codigo);
    assertTexto(oficial.grupoInicial, `${diagnostico.codigo}: grupo inicial`);
    assertTexto(oficial.codigoTabular, `${diagnostico.codigo}: código tabular`);
    assert.ok(oficial.codigoTabular.startsWith(diagnostico.codigo), diagnostico.codigo);

    assert.equal(diagnostico.vinculos.capitulo, "IX", diagnostico.codigo);
    assert.equal(diagnostico.vinculos.grupo, sistema.jerarquia.grupo.codigo, diagnostico.codigo);
    assert.equal(diagnostico.vinculos.categoriaPadre, esSubcategoria ? diagnostico.codigo.slice(0, 3) : null, diagnostico.codigo);
    assert.strictEqual(diagnostico.propiedades, diagnostico.propiedadesPorFuente.cie10, diagnostico.codigo);
  }
});

test("las 453 entidades I tienen las 16 propiedades clínicas y evidencia expresamente prudente", () => {
  for (const diagnostico of entidadesI()) {
    const fuente = diagnostico.propiedadesPorFuente.cie10;
    const sistema = diagnostico.sistemas.cie10;
    const evidencia = fuente.evidenciaClinica;

    for (const propiedad of PROPIEDADES_CLINICAS) {
      const valor = fuente.clinicas[propiedad];
      assert.ok(Array.isArray(valor) ? valor.length : String(valor || "").trim(), `${diagnostico.codigo}:${propiedad}`);
    }

    assert.equal(diagnostico.contenidoClinicoLazy, true, diagnostico.codigo);
    assert.equal(fuente.completionStatus, "partial", diagnostico.codigo);
    assert.equal(sistema.completionStatus, "partial", diagnostico.codigo);
    assert.equal(sistema.contenidoLiteralAutorizado, false, diagnostico.codigo);
    assert.equal(sistema.review.classificationSourceVerified, true, diagnostico.codigo);
    assert.equal(sistema.review.clinicalEvidenceVerified, false, diagnostico.codigo);
    assert.equal(Object.hasOwn(sistema.review, "sourceVerified"), false, diagnostico.codigo);

    assert.equal(fuente.fuente.sourceVerified, true, diagnostico.codigo);
    assert.match(fuente.fuente.alcanceVerificado, /clasificaci[oó]n/i, diagnostico.codigo);
    assertUrl(fuente.fuente.url, `${diagnostico.codigo}: fuente OMS`);
    assertUrl(fuente.fuente.metadataUrl, `${diagnostico.codigo}: metadata OMS`);
    assert.equal(fuente.fuenteNomenclaturaEs.sourceVerified, true, diagnostico.codigo);
    assert.equal(fuente.fuenteNomenclaturaEs.idioma, "es", diagnostico.codigo);
    assert.equal(fuente.fuenteNomenclaturaEs.estado, "verificada", diagnostico.codigo);
    assertUrl(fuente.fuenteNomenclaturaEs.url, `${diagnostico.codigo}: nomenclatura española`);

    assert.equal(evidencia.verificada, false, diagnostico.codigo);
    assert.equal(evidencia.alcance, "perfil_familiar_no_especifico", diagnostico.codigo);
    assert.ok(["fuente_clinica_especifica_pendiente", "apoyo_familiar_parcial"].includes(evidencia.estado), diagnostico.codigo);
    assert.match(evidencia.nota, /fuente clínica específica pendiente|no se verificó una fuente clínica específica/i, diagnostico.codigo);
    assert.ok(Array.isArray(evidencia.fuentesDeApoyo), diagnostico.codigo);
    if (evidencia.estado === "apoyo_familiar_parcial") assert.ok(evidencia.fuentesDeApoyo.length, diagnostico.codigo);
    for (const url of evidencia.fuentesDeApoyo) assertUrl(url, `${diagnostico.codigo}: apoyo clínico`);

    assert.ok(Array.isArray(diagnostico.referencias) && diagnostico.referencias.length, diagnostico.codigo);
    for (const referencia of diagnostico.referencias) {
      assertTexto(referencia.organismo, `${diagnostico.codigo}: organismo`);
      assertTexto(referencia.titulo, `${diagnostico.codigo}: título de referencia`);
      assertUrl(referencia.url, `${diagnostico.codigo}: referencia`);
    }

    assert.ok(diagnostico.farmacologia, diagnostico.codigo);
    assert.equal(diagnostico.farmacologia.ausenciaReglaNoImplicaSeguridad, true, diagnostico.codigo);
    assert.ok(Array.isArray(diagnostico.farmacologia.reglas), diagnostico.codigo);
  }
});

test("los 15 paneles I son lazy, completos, ordenados, únicos y se almacenan tras el primer acceso", () => {
  for (const diagnostico of entidadesI()) {
    const sistema = diagnostico.sistemas.cie10;
    const descriptor = Object.getOwnPropertyDescriptor(sistema, "criterios");
    assert.equal(sistema.criteriosLazy, true, diagnostico.codigo);
    assert.equal(typeof descriptor?.get, "function", diagnostico.codigo);
    assert.equal(descriptor?.enumerable, true, diagnostico.codigo);

    const paneles = sistema.criterios;
    assert.strictEqual(sistema.criterios, paneles, `${diagnostico.codigo}: caché lazy`);
    assert.equal(paneles.length, SECCIONES.length, diagnostico.codigo);
    assert.deepEqual(paneles.map((panel) => panel.titulo), SECCIONES, diagnostico.codigo);
    assert.deepEqual(paneles.map((panel) => panel.orden), SECCIONES.map((_, indice) => indice + 1), diagnostico.codigo);
    assert.equal(new Set(paneles.map((panel) => panel.id)).size, SECCIONES.length, diagnostico.codigo);
    assert.ok(paneles.every((panel) => panel.items.length), diagnostico.codigo);
    assert.ok(paneles.every((panel) => panel.items.every((item) => String(item.texto || "").trim())), diagnostico.codigo);
  }

  const biblioteca = readFileSync(new URL("../biblioteca.js", import.meta.url), "utf8");
  assert.match(biblioteca, /datos\?\.criteriosLazy/);
  assert.match(biblioteca, /sistema\.criteriosLazy \? \[\]/);
});

test("la búsqueda parcial encuentra I por código, nombre oficial y alias sin depender de paneles lazy", () => {
  assert.ok(buscar("i48.4").some((item) => item.codigo === "I48.4"));
  assert.ok(buscar("fibrilación auricular persistente").some((item) => item.codigo === "I48.1"));
  assert.ok(buscar("aneurisma y disección de arteria vertebral").some((item) => item.codigo === "I72.6"));
  assert.ok(buscar("infarto subsecuente del miocardio").some((item) => item.codigo === "I22"));
  assert.ok(buscar("hemorragia subdural no traumática").some((item) => item.codigo === "I62.0"));
  assert.ok(buscar("hta").some((item) => item.codigo === "I10"));
  assert.ok(buscar("evc").some((item) => item.codigo === "I64"));
});

test("los perfiles clínicos centinela no heredan manejo de familias vecinas", () => {
  assert.match(clinicas("I20.0").definicionClinica, /angina inestable|síndrome coronario agudo/i);
  assert.match(clinicas("I20.1").definicionClinica, /espasmo|vasoesp/i);

  assert.match(clinicas("I23").definicionClinica, /complicaci[oó]n.*posterior.*infarto/i);
  assert.match(clinicas("I23").tratamientoEspecifico, /específico|no define/i);
  assert.match(clinicas("I24.1").definicionClinica, /Dressler|inflamatoria pericárdica/i);
  assert.match(clinicas("I24.1").tratamientoEspecifico, /no indicar reperfusión/i);
  assert.match(clinicas("I38").definicionClinica, /no (?:prueba|demuestra).*endocarditis infecciosa/i);

  assert.match(clinicas("I47.2").tratamientoInicial, /reanimaci[oó]n|desfibrilaci[oó]n/i);
  assert.doesNotMatch(clinicas("I49.3").tratamientoInicial, /iniciar de inmediato.*(?:reanimaci[oó]n|desfibrilaci[oó]n)/i);
  assert.match(clinicas("I51.3").definicionClinica, /trombosis intracardiaca/i);
  assert.match(clinicas("I51.3").tratamientoEspecifico, /no aplicar automáticamente algoritmos de TVP/i);
  assert.match(clinicas("I51.4").definicionClinica, /miocardio|miocarditis/i);

  assert.match(clinicas("I63").definicionClinica, /infarto cerebral isqu[eé]mico/i);
  assert.match(clinicas("I64").definicionClinica, /no especificado.*hemorr[aá]gico.*isqu[eé]mico|no autoriza asumir un mecanismo/i);
  assert.match(clinicas("I64").tratamientoEspecifico, /mecanismo demostrado|no basta/i);
  assert.match(clinicas("I69").definicionClinica, /secuela/i);
  assert.match(clinicas("I69").tratamientoInicial, /no activar reperfusi[oó]n/i);
  assert.doesNotMatch(clinicas("I69").tratamientoEspecifico, /tromb[oó]lisis|trombectom[ií]a|reperfusi[oó]n inmediata/i);

  assert.match(clinicas("I85").definicionClinica, /v[aá]rices esof[aá]gicas/i);
  assert.match(clinicas("I85").tratamientoEspecifico, /no usar.*(?:TVP|trombosis venosa profunda)/i);
  assert.match(clinicas("I95").definicionClinica, /hipotensi[oó]n/i);
  assert.match(clinicas("I95").definicionClinica, /no representa hipertensi[oó]n/i);
  assert.doesNotMatch(clinicas("I95").tratamientoEspecifico, /reducir.{0,30}presi[oó]n arterial|tratamiento antihipertensivo/i);

  assert.match(clinicas("I98.3").definicionClinica, /manifestaci[oó]n.*enfermedad clasificada en otra parte/i);
  assert.match(clinicas("I98.3").tratamientoEspecifico, /enfermedad subyacente/i);
  assert.match(clinicas("I98.3").tratamientoEspecifico, /no derivar.*(?:f[aá]rmaco|procedimiento)/i);
});

test("I10, I11, I12, I13 e I15 conservan sus reglas en cada subcategoría exacta", () => {
  const codigosConRegla = new Set(Object.values(FAMILIAS_FARMACOLOGICAS).flat());

  assert.notStrictEqual(entidadI("I11").farmacologia, entidadI("I11.0").farmacologia);
  assert.notStrictEqual(entidadI("I12").farmacologia.reglas, entidadI("I12.0").farmacologia.reglas);

  for (const [categoria, codigos] of Object.entries(FAMILIAS_FARMACOLOGICAS)) {
    const reglasEsperadas = ["I12", "I13"].includes(categoria) ? REGLAS_CARDIORRENALES : REGLAS_HIPERTENSION;
    const riesgosEsperados = ["I12", "I13"].includes(categoria)
      ? ["funcion_renal", "hipertension"]
      : ["hipertension"];

    for (const codigo of codigos) {
      const farmacologia = entidadI(codigo).farmacologia;
      const ids = farmacologia.reglas.map((regla) => regla.id);
      assert.deepEqual([...farmacologia.categoriasRiesgo].sort(), [...riesgosEsperados].sort(), `${codigo}: riesgos`);
      assert.deepEqual([...ids].sort(), [...reglasEsperadas].sort(), `${codigo}: reglas heredadas`);
      assert.equal(new Set(ids).size, ids.length, `${codigo}: reglas duplicadas`);
      assert.equal(farmacologia.estadoCobertura, "reglas_especificas_disponibles", codigo);
      assert.equal(farmacologia.requiereAdvertencia, true, codigo);
    }
  }

  for (const diagnostico of entidadesI()) {
    if (codigosConRegla.has(diagnostico.codigo)) continue;
    assert.deepEqual(diagnostico.farmacologia.reglas, [], `${diagnostico.codigo}: no inventar reglas farmacológicas`);
    assert.equal(diagnostico.farmacologia.estadoCobertura, "sin_regla_especifica_cargada", diagnostico.codigo);
  }
});

test("el motor clínico resuelve reglas heredadas desde códigos I de cuatro caracteres", () => {
  assertUnaAlertaDeRegla("I10", "Risperidona 2 mg", "risperidona_riesgo_cardiovascular");
  assertUnaAlertaDeRegla("I11.0", "Metilfenidato 10 mg", "estimulante_noradrenergico_hipertension");
  assertUnaAlertaDeRegla("I12.0", "Litio 300 mg", "litio_renal");
  assertUnaAlertaDeRegla("I13.2", "Enalapril 10 mg", "sraa_funcion_renal_i13");
  assertUnaAlertaDeRegla("I15.9", "Atomoxetina 40 mg", "estimulante_noradrenergico_hipertension");
});

test("Biblioteca marca I con códigos completos, conserva fichas en revisión y presenta asteriscos sin hardcodear G", () => {
  const biblioteca = readFileSync(new URL("../biblioteca.js", import.meta.url), "utf8");
  const codigosCompletos = biblioteca.match(/const CAPITULOS_CIE10_CODIGOS_COMPLETOS = new Set\(\[([^\]]*)\]\)/)?.[1] || "";
  const fichasCompletas = biblioteca.match(/const CAPITULOS_CIE10_FICHAS_COMPLETAS = new Set\(\[([^\]]*)\]\)/)?.[1] || "";
  assert.match(codigosCompletos, /["']I["']/);
  assert.doesNotMatch(fichasCompletas, /["']I["']/);

  const inicio = biblioteca.indexOf("function obtenerCodigoPresentacionDiagnostico");
  const fin = biblioteca.indexOf("function compararDiagnosticosPorCodigo", inicio);
  assert.ok(inicio >= 0 && fin > inicio, "debe existir el formateador de códigos de Biblioteca");
  const funcion = biblioteca.slice(inicio, fin);
  const contexto = { diagnostico: entidadI("I98.3"), resultado: null };
  runInNewContext(`${funcion}\nresultado = obtenerCodigoPresentacionDiagnostico(diagnostico, "cie10");`, contexto);
  assert.equal(contexto.resultado, "I98.3*");
});
