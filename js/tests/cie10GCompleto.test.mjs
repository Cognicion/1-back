import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  METADATOS_CATALOGO_DIAGNOSTICOS
} from "../data/catalogoDiagnosticos.js";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

const TOTAL_G = 394;
const HASH_CODIGOS_G = "3be2937aca4b161044f6b746363a851061c7634a32a40bfa52ab2e0772fd6ab5";
const HASH_NOMBRES_G = "ee56941cc32fc60ef78c6b8f0dc08e85bfa96ae9a1096d2f1d29f3f6661ed7ff";
const GRUPOS_G = [
  "G00-G09",
  "G10-G14",
  "G20-G26",
  "G30-G32",
  "G35-G37",
  "G40-G47",
  "G50-G59",
  "G60-G64",
  "G70-G73",
  "G80-G83",
  "G90-G99"
];
const CATEGORIAS_ASTERISCO = [
  "G01", "G02", "G05", "G07", "G13", "G22", "G26", "G32",
  "G46", "G53", "G55", "G59", "G63", "G73", "G94", "G99"
];
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

function entidadesG() {
  return CATALOGO_DIAGNOSTICOS.filter((diagnostico) => diagnostico.sistemas?.cie10?.codigo?.startsWith("G"));
}

function entidadG(codigo) {
  return entidadesG().find((diagnostico) => diagnostico.codigo === codigo);
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

test("G00-G99 coincide exactamente con el conjunto oficial OMS 2019 incorporado", () => {
  const entidades = entidadesG();
  assert.equal(entidades.length, TOTAL_G);
  assert.equal(new Set(entidades.map((item) => item.id)).size, TOTAL_G);
  assert.equal(new Set(entidades.map((item) => item.codigo)).size, TOTAL_G);
  assert.equal(sha256(entidades.map((item) => item.codigo)), HASH_CODIGOS_G);
  assert.equal(sha256(entidades.map((item) => `${item.codigo}\t${item.nombreOficialEs}`)), HASH_NOMBRES_G);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosGOficiales, TOTAL_G);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosGFaltantes, 0);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosGAdicionales, 0);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256CodigosG, HASH_CODIGOS_G);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.sha256NombresG, HASH_NOMBRES_G);
});

test("G conserva los 68 niveles de categoría, 326 subcategorías y 339 códigos terminales", () => {
  const clasificaciones = entidadesG().map((item) => item.propiedadesPorFuente.cie10.clasificacionOficial);
  assert.equal(clasificaciones.filter((item) => item.nivel === 3).length, 68);
  assert.equal(clasificaciones.filter((item) => item.nivel === 4).length, 326);
  assert.equal(clasificaciones.filter((item) => item.terminal).length, 339);
  assert.equal(clasificaciones.filter((item) => !item.terminal).length, 55);
  assert.deepEqual(
    [...new Set(entidadesG().map((item) => item.sistemas.cie10.jerarquia.grupo.codigo))],
    GRUPOS_G
  );
});

test("cada entidad G conserva jerarquía, búsqueda, propiedades clínicas y 15 paneles diferidos", () => {
  const codigos = new Set(CIE10.map((item) => item.codigo));
  for (const diagnostico of entidadesG()) {
    const sistema = diagnostico.sistemas.cie10;
    assert.match(diagnostico.codigo, /^G\d{2}(?:\.\d)?$/);
    assert.ok(diagnostico.aliases.includes(diagnostico.codigo), diagnostico.codigo);
    assert.ok(diagnostico.aliases.includes(diagnostico.nombre), diagnostico.codigo);
    assert.equal(sistema.jerarquia.capitulo.codigo, "VI", diagnostico.codigo);
    assert.ok(GRUPOS_G.includes(sistema.jerarquia.grupo.codigo), diagnostico.codigo);
    assert.equal(sistema.jerarquia.categoria.codigo, diagnostico.codigo.slice(0, 3));
    if (diagnostico.codigo.includes(".")) assert.ok(codigos.has(diagnostico.codigo.slice(0, 3)), diagnostico.codigo);

    const clinicas = diagnostico.propiedadesPorFuente.cie10.clinicas;
    for (const propiedad of PROPIEDADES_CLINICAS) {
      const valor = clinicas[propiedad];
      assert.ok(Array.isArray(valor) ? valor.length : String(valor || "").trim(), `${diagnostico.codigo}:${propiedad}`);
    }
    assert.equal(diagnostico.propiedadesPorFuente.cie10.fuente.sourceVerified, true, diagnostico.codigo);
    assert.equal(diagnostico.propiedadesPorFuente.cie10.completionStatus, "partial", diagnostico.codigo);
    assert.equal(diagnostico.sistemas.cie10.completionStatus, "partial", diagnostico.codigo);
    assert.equal(diagnostico.propiedadesPorFuente.cie10.evidenciaClinica.verificada, false, diagnostico.codigo);
    assert.equal(diagnostico.propiedadesPorFuente.cie10.evidenciaClinica.estado, "fuente_clinica_especifica_pendiente", diagnostico.codigo);
    assert.match(diagnostico.propiedadesPorFuente.cie10.evidenciaClinica.nota, /fuente clínica específica pendiente/i, diagnostico.codigo);
    assert.equal(diagnostico.sistemas.cie10.review.classificationSourceVerified, true, diagnostico.codigo);
    assert.equal(diagnostico.sistemas.cie10.review.clinicalEvidenceVerified, false, diagnostico.codigo);
    assert.equal(Object.hasOwn(diagnostico.sistemas.cie10.review, "sourceVerified"), false, diagnostico.codigo);
    assert.ok(diagnostico.farmacologia, diagnostico.codigo);
    assert.equal(sistema.criteriosLazy, true, diagnostico.codigo);
    assert.equal(typeof Object.getOwnPropertyDescriptor(sistema, "criterios")?.get, "function", diagnostico.codigo);
    assert.deepEqual(sistema.criterios.map((panel) => panel.titulo), SECCIONES, diagnostico.codigo);
    assert.ok(sistema.criterios.every((panel) => panel.items.length && panel.items.every((item) => item.texto.trim())), diagnostico.codigo);
  }
});

test("las 75 formas tabulares con asterisco se derivan de metadata y cubren 16 categorías", () => {
  const conAsterisco = entidadesG().filter((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoAsterisco);
  assert.equal(conAsterisco.length, 75);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosGAsterisco, 75);
  assert.deepEqual([...new Set(conAsterisco.map((item) => item.codigo.slice(0, 3)))], CATEGORIAS_ASTERISCO);
  assert.ok(conAsterisco.every((item) => item.propiedadesPorFuente.cie10.clasificacionOficial.codigoTabular.includes("*")));
});

test("las altas oficiales en español están presentes y los códigos ajenos u obsoletos quedan fuera", () => {
  const esperados = new Map(Object.entries({
    G14: "Síndrome postpolio",
    "G21.4": "Parkinsonismo vascular",
    "G23.3": "Atrofia sistémica múltiple, tipo cerebelosa [ASM-C]",
    "G83.5": "Síndrome de enclaustramiento",
    "G83.6": "Parálisis facial de neurona motora superior",
    "G90.5": "Síndrome de dolor regional complejo tipo I",
    "G90.6": "Síndrome de dolor regional complejo tipo II",
    "G90.7": "Síndrome de dolor regional complejo, otro tipo y el no especificado",
    "G94.3": "Encefalopatía en enfermedades clasificadas en otra parte"
  }));
  const porCodigo = new Map(entidadesG().map((item) => [item.codigo, item.nombre]));
  for (const [codigo, nombre] of esperados) assert.equal(porCodigo.get(codigo), nombre, codigo);
  assert.equal(porCodigo.get("G24"), "Distonía");
  assert.ok([...porCodigo.values()].every((nombre) => !/\b[A-ZÁÉÍÓÚÜÑ] [a-záéíóúüñ]{2,}/u.test(nombre)));
  for (const codigo of ["G31.84", "G56.4", "G90.3"]) assert.equal(porCodigo.has(codigo), false, codigo);
  assert.equal(entidadesG().filter((item) => item.codigo === "G40.0").length, 1);
  assert.equal(entidadesG().filter((item) => item.codigo === "G93.0").length, 1);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosLegacyConservados, 574);
  assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosLegacyOmitidos, 1);
});

test("los perfiles G09 y G73.7 no heredan tratamiento de una familia vecina", () => {
  const secuela = entidadG("G09").propiedadesPorFuente.cie10.clinicas;
  assert.match(secuela.definicionClinica, /secuela de una enfermedad inflamatoria/i);
  assert.match(secuela.tratamientoEspecifico, /no indica antimicrobianos, antivirales ni inmunoterapia/i);
  assert.doesNotMatch(secuela.tratamientoEspecifico, /^Antimicrobianos, antivirales, inmunoterapia/i);

  const miopatia = entidadG("G73.7").propiedadesPorFuente.cie10.clinicas;
  assert.match(miopatia.definicionClinica, /enfermedad primaria del músculo/i);
  assert.doesNotMatch(miopatia.definicionClinica, /trastorno de la unión neuromuscular o manifestación mioneural/i);
});

test("G91-G99 selecciona perfiles clínicos prudentes por código y no por rango amplio", () => {
  for (const codigo of ["G91", "G91.0", "G94.0", "G94.1", "G94.2"]) {
    assert.match(entidadG(codigo).propiedadesPorFuente.cie10.clinicas.definicionClinica, /hidrocefalia/i, codigo);
  }

  const rutas = [
    ["G92", /encefalopatía tóxica/i, /no indica neurocirugía ni inmunoterapia/i],
    ["G93", /otro trastorno del encéfalo/i, /no autoriza derivación, neurocirugía, antimicrobianos ni inmunoterapia/i],
    ["G94.3", /manifestación encefálica/i, /código de manifestación no indica neurocirugía/i],
    ["G94.8", /manifestación encefálica/i, /código de manifestación no indica neurocirugía/i],
    ["G96", /otro trastorno del sistema nervioso central/i, /no indica neurocirugía, antimicrobianos ni inmunoterapia/i],
    ["G97", /posterior a un procedimiento/i, /no autoriza reparación, neurocirugía, antimicrobianos ni inmunoterapia/i],
    ["G98", /categoría residual/i, /no indica un tratamiento, derivación o procedimiento específico/i],
    ["G99", /manifestación del sistema nervioso/i, /no indica neurocirugía, antimicrobianos, inmunoterapia/i],
    ["G99.8", /manifestación del sistema nervioso/i, /no indica neurocirugía, antimicrobianos, inmunoterapia/i]
  ];
  for (const [codigo, definicion, tratamiento] of rutas) {
    const clinicas = entidadG(codigo).propiedadesPorFuente.cie10.clinicas;
    assert.match(clinicas.definicionClinica, definicion, codigo);
    assert.match(clinicas.tratamientoEspecifico, tratamiento, codigo);
  }

  for (const codigo of ["G99.0", "G99.1"]) {
    const clinicas = entidadG(codigo).propiedadesPorFuente.cie10.clinicas;
    assert.match(clinicas.definicionClinica, /sistema nervioso autónomo/i, codigo);
    assert.doesNotMatch(clinicas.definicionClinica, /síndrome de dolor regional complejo/i, codigo);
    assert.match(clinicas.tratamientoEspecifico, /no indican un fármaco, procedimiento o derivación específicos/i, codigo);
  }
  assert.match(entidadG("G99.2").propiedadesPorFuente.cie10.clinicas.definicionClinica, /médula espinal/i);
  assert.match(entidadG("G99.2").propiedadesPorFuente.cie10.clinicas.tratamientoEspecifico, /no indica descompresión, antimicrobianos, inmunoterapia/i);
});

test("G90.7 declara traducción propia y mantiene pendiente la fuente española", () => {
  const diagnostico = entidadG("G90.7");
  const propiedades = diagnostico.propiedadesPorFuente.cie10;
  assert.equal(propiedades.fuente.sourceVerified, true, "la clasificación OMS permanece verificada");
  assert.equal(propiedades.fuente.alcanceVerificado, "clasificacion_oms");
  assert.equal(propiedades.fuenteNomenclaturaEs.sourceVerified, false);
  assert.equal(propiedades.fuenteNomenclaturaEs.estado, "fuente_pendiente");
  assert.equal(propiedades.fuenteNomenclaturaEs.organismo, "COGNICIÓN");
  assert.match(propiedades.fuenteNomenclaturaEs.documento, /traducción propia no oficial/i);
  assert.ok(diagnostico.sistemas.cie10.notas.some((nota) => /fuente oficial en español pendiente/i.test(nota)));
  assert.ok(diagnostico.sistemas.cie10.criterios[0].items.some((item) => /traducción española de trabajo, no verificada/i.test(item.texto)));
  const referencias = diagnostico.referencias.map((item) => item.url).join(" ");
  assert.doesNotMatch(referencias, /paho|repositoriodeis|cemece|saludchiapas/i);
});

test("la búsqueda parcial encuentra G por código, nombre oficial y sinónimo", () => {
  const buscar = (texto) => {
    const consulta = texto.toLowerCase();
    return CIE10.filter((item) => [item.codigo, item.nombre, ...(item.aliases || [])].join(" ").toLowerCase().includes(consulta));
  };
  assert.ok(buscar("g40.0").some((item) => item.codigo === "G40.0"));
  assert.ok(buscar("enfermedad de parkinson").some((item) => item.codigo === "G20"));
  assert.ok(buscar("esclerosis múltiple").some((item) => item.codigo === "G35"));
  assert.ok(buscar("miastenia gravis").some((item) => item.codigo === "G70.0"));
  assert.ok(buscar("dolor regional complejo").some((item) => item.codigo === "G90.5"));
});

test("G40 resuelve una sola contraindicación crítica de bupropión con fuente oficial", () => {
  const diagnostico = entidadesG().find((item) => item.codigo === "G40.0");
  const regla = diagnostico.farmacologia.reglas.find((item) => item.id === "bupropion_epilepsia");
  assert.ok(regla);
  assert.equal(regla.tipo, "contraindicacion");
  assert.equal(regla.severidad, "critica");
  assert.equal(regla.permiteOverride, false);
  assert.equal(regla.evidencia, "etiquetado_oficial_fda");
  assert.equal(regla.confianza, "alta");
  assert.equal(regla.categoriaRiesgo, "riesgo_convulsivo");
  assert.ok(diagnostico.farmacologia.categoriasRiesgo.includes("riesgo_convulsivo"));
  assert.ok(regla.fuentes.some((fuente) => /accessdata\.fda\.gov/.test(fuente)));
  assert.ok(regla.fuentes.some((fuente) => /dailymed\.nlm\.nih\.gov/.test(fuente)));

  const coincidentes = alertasPara("G40.0", "Epilepsia focal", "Bupropion 150 mg")
    .filter((alerta) => alerta.id.startsWith("bupropion_epilepsia:"));
  assert.equal(coincidentes.length, 1);
  assert.equal(coincidentes[0].tipo, "contraindicacion");
  assert.equal(coincidentes[0].severidad, "critica");
  assert.equal(coincidentes[0].permiteOverride, false);

  const parkinson = entidadesG().find((item) => item.codigo === "G20");
  assert.equal(parkinson.farmacologia.estadoCobertura, "sin_regla_especifica_cargada");
  assert.deepEqual(parkinson.farmacologia.reglas, []);
});
