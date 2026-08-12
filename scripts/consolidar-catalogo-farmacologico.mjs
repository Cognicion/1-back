import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CATALOGO_FARMACOLOGICO_OFICIAL as CATALOGO_ACTUAL } from "../js/data/catalogoFarmacologicoUnificado.js";
import { CATALOGO_MEDICAMENTOS_PEDIATRICOS } from "../js/pediatria/catalogoMedicamentosPediatricos.js";
import { MEDICAMENTOS_PEDIATRICOS } from "../js/pediatria/medicamentos.js";

const RXNORM_VERSION = "03-Aug-2026";
const RXNORM_API_VERSION = "3.1.354";
const FECHA_CORTE = "2026-08-11";
const DESTINO = resolve("js/data/catalogoFarmacologicoUnificado.js");

const FUSIONES_CANONICAS = Object.freeze({
  "acido-valproico": "valproato",
  "valproato-de-magnesio": "valproato",
  "valproato-semisodico": "valproato",
  ciprofloxacino_otico: "ciprofloxacino",
  hidrocortisona_crema: "hidrocortisona"
});

const RENOMBRES_CANONICOS = Object.freeze({
  betametasona_topica: {
    id: "betametasona",
    nombre: "Betametasona",
    genericName: "Betametasona",
    principioActivo: "betametasona",
    principiosActivos: ["Betametasona"]
  }
});

const IDS_PEDIATRICOS_CANONICOS = Object.freeze({
  acido_valproico: "valproato",
  hidroxizina: "hidroxicina"
});

const TERMINOS_RXNORM = {
  alendronato: "alendronate",
  amoxicilina_clavulanato: "amoxicillin / clavulanate",
  benztropina: "benztropine",
  betametasona_topica: "betamethasone",
  butilhioscina: "hyoscine butylbromide",
  calcio_vitamina_d: "calcium carbonate / cholecalciferol",
  cariprazina: "cariprazine",
  ciprofloxacino_otico: "ciprofloxacin",
  enoxaparina: "enoxaparin",
  hidrocortisona_crema: "hydrocortisone",
  hidroxicina: "hydroxyzine",
  hierro_sacarosa: "iron sucrose",
  insulina: "insulin",
  ipratropio: "ipratropium",
  levotiroxina: "levothyroxine",
  lisdexanfetamina: "lisdexamfetamine",
  metimazol: "methimazole",
  oximetazolina: "oxymetazoline",
  prednisolona: "prednisolone",
  clonidina: "clonidine",
  polietilenglicol: "polyethylene glycol 3350",
  sacubitrilo_valsartan: "sacubitril / valsartan",
  semaglutida: "semaglutide",
  sparfloxacino: "sparfloxacin",
  sulfato_ferroso: "ferrous sulfate",
  tacrina: "tacrine",
  tiotropio: "tiotropium",
  valproato: "valproic acid",
  "valproato-de-magnesio": "magnesium valproate",
  "valproato-semisodico": "divalproex"
};

const PERMITIR_COMBINACIONES = new Set([
  "amoxicilina_clavulanato",
  "calcio_vitamina_d",
  "levodopa",
  "sacubitrilo_valsartan"
]);

const SIN_RXNORM = new Set(["alcohol", "hierba_san_juan", "lubricante_ocular"]);

const PRESENTACIONES_MANUALES = {
  alcohol: [
    presentacionManual("exposición oral a etanol 3-50 % v/v", "oral", "3-50 % v/v", "bebida alcohólica", "sustancia_contextual")
  ],
  clorprotixeno: [
    presentacionManual("tableta recubierta de 25 mg", "oral", "25 mg", "tableta recubierta", "https://fass.se/LIF/product?docType=6&nplId=19690618000011&userType=2"),
    presentacionManual("tableta recubierta de 50 mg", "oral", "50 mg", "tableta recubierta", "https://fass.se/LIF/product?docType=6&nplId=19690618000011&userType=2")
  ],
  hierba_san_juan: [
    presentacionManual("tableta de extracto seco de 300 mg", "oral", "300 mg", "tableta", "https://www.medicines.org.uk/emc/product/9038/smpc")
  ],
  lubricante_ocular: [
    presentacionManual("gotas oftálmicas de carboximetilcelulosa 0.5 %", "oftálmica", "0.5 %", "gotas oftálmicas", "https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=4d1d9b3a-ac5f-db27-e063-6294a90afc3f&type=pdf"),
    presentacionManual("gel oftálmico de carboximetilcelulosa 1 %", "oftálmica", "1 %", "gel oftálmico", "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=b4697319-438e-2ec8-e053-2a95a90abb56&type=display")
  ],
  probucol: [
    presentacionManual("tableta de 250 mg", "oral", "250 mg", "tableta", "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/ResultDataSetPDF/300119_2189008F1465_1_05")
  ]
};

const FORMAS = [
  ["extended release orally disintegrating tablet", "tableta orodispersable de liberación prolongada", "oral"],
  ["extended release oral tablet", "tableta de liberación prolongada", "oral"],
  ["delayed release oral tablet", "tableta de liberación retardada", "oral"],
  ["orally disintegrating tablet", "tableta orodispersable", "oral"],
  ["chewable tablet", "tableta masticable", "oral"],
  ["sublingual tablet", "tableta sublingual", "sublingual"],
  ["buccal tablet", "tableta bucal", "bucal"],
  ["oral tablet", "tableta", "oral"],
  ["extended release oral capsule", "cápsula de liberación prolongada", "oral"],
  ["delayed release oral capsule", "cápsula de liberación retardada", "oral"],
  ["oral capsule", "cápsula", "oral"],
  ["oral granules", "gránulos orales", "oral"],
  ["oral powder", "polvo oral", "oral"],
  ["oral solution", "solución oral", "oral"],
  ["oral suspension", "suspensión oral", "oral"],
  ["oral syrup", "jarabe", "oral"],
  ["oral drops", "gotas orales", "oral"],
  ["pen injector", "pluma precargada", "subcutánea"],
  ["prefilled syringe", "jeringa prellenada", "inyectable"],
  ["auto-injector", "autoinyector", "inyectable"],
  ["injectable suspension", "suspensión inyectable", "inyectable"],
  ["injectable solution", "solución inyectable", "inyectable"],
  ["injection", "solución inyectable", "inyectable"],
  ["ophthalmic gel", "gel oftálmico", "oftálmica"],
  ["ophthalmic ointment", "ungüento oftálmico", "oftálmica"],
  ["ophthalmic suspension", "suspensión oftálmica", "oftálmica"],
  ["ophthalmic solution", "solución oftálmica", "oftálmica"],
  ["otic suspension", "suspensión ótica", "ótica"],
  ["otic solution", "solución ótica", "ótica"],
  ["nasal spray", "aerosol nasal", "nasal"],
  ["nasal solution", "solución nasal", "nasal"],
  ["dry powder inhaler", "inhalador de polvo seco", "inhalada"],
  ["inhalation powder", "polvo para inhalación", "inhalada"],
  ["inhalation solution", "solución para inhalación", "inhalada"],
  ["metered dose inhaler", "inhalador de dosis medida", "inhalada"],
  ["topical cream", "crema tópica", "tópica"],
  ["topical ointment", "ungüento tópico", "tópica"],
  ["topical gel", "gel tópico", "tópica"],
  ["topical lotion", "loción tópica", "tópica"],
  ["topical solution", "solución tópica", "tópica"],
  ["transdermal patch", "parche transdérmico", "transdérmica"],
  ["rectal suppository", "supositorio rectal", "rectal"],
  ["rectal enema", "enema rectal", "rectal"],
  ["vaginal tablet", "tableta vaginal", "vaginal"],
  ["vaginal cream", "crema vaginal", "vaginal"],
  ["drug implant", "implante", "implante"],
  ["implant", "implante", "implante"]
];

function presentacionManual(texto, via, concentracion, forma, fuente) {
  return { texto, via, concentracion, forma, fuente, activo: true, origen: "fuente_regulatoria_manual" };
}

function sinAcentos(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizar(valor = "") {
  return sinAcentos(valor).toLowerCase().replace(/[^a-z0-9%/]+/g, " ").replace(/\s+/g, " ").trim();
}

function slug(valor = "") {
  return normalizar(valor).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function listaUnica(...listas) {
  return [...new Set(listas.flatMap((lista) => Array.isArray(lista) ? lista : [lista]).filter((valor) => valor !== undefined && valor !== null && valor !== ""))];
}

function tieneConcentracion(texto = "") {
  return /\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|ui|iu|u|unidades?|%|meq)(?:\s*\/\s*(?:ml|mg|g|actuat|dosis|h|hr))?/i.test(texto);
}

function esComodin(texto = "") {
  return /seg[uú]n disponibilidad|presentaci[oó]n no especificada|presentaci[oó]n seg[uú]n|formulaci[oó]n.*seg[uú]n|seg[uú]n producto|consultar ficha/i.test(texto);
}

function formaDesdeTexto(texto = "") {
  const t = normalizar(texto);
  const pares = [
    ["liberacion prolongada", "tableta de liberación prolongada"], ["orodispers", "tableta orodispersable"],
    ["tableta", "tableta"], ["comprimido", "tableta"], ["capsula", "cápsula"],
    ["solucion oral", "solución oral"], ["suspension oral", "suspensión oral"], ["suspension", "suspensión"],
    ["jarabe", "jarabe"], ["gotas oftalm", "gotas oftálmicas"], ["gel oftalm", "gel oftálmico"],
    ["oftalm", "solución oftálmica"], ["otica", "gotas óticas"], ["nasal", "aerosol nasal"],
    ["parche", "parche transdérmico"], ["crema", "crema tópica"], ["unguento", "ungüento tópico"],
    ["gel", "gel tópico"], ["inyect", "solución inyectable"], ["ampolleta", "solución inyectable"],
    ["inhal", "formulación inhalada"], ["supositorio", "supositorio"], ["enema", "enema"],
    ["granulo", "gránulos"], ["polvo", "polvo"], ["implante", "implante"], ["bebida", "bebida alcohólica"]
  ];
  return pares.find(([patron]) => t.includes(patron))?.[1] || "forma farmacéutica especificada";
}

function concentracionDesdeTexto(texto = "") {
  const coincidencias = [...String(texto).matchAll(/\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ui|iu|u|unidades?|%|meq)(?:\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:ml|mg|g|actuat|dosis|h|hr))?/gi)]
    .map((item) => item[0].replace(/\s+/g, " ").trim().replace(/\bMG\b/g, "mg").replace(/\bML\b/g, "mL"));
  return listaUnica(coincidencias).join(" + ") || "concentración descrita en la presentación";
}

function normalizarPresentacionExistente(item = {}) {
  const texto = typeof item === "string" ? item : item.texto || item.presentationDescription || "";
  const via = typeof item === "string" ? "oral" : item.via || item.route || "oral";
  return {
    texto,
    via,
    forma: item.forma || formaDesdeTexto(texto),
    concentracion: item.concentracion || concentracionDesdeTexto(texto),
    fuente: item.fuente || "catalogo_cognicion_preexistente",
    rxCui: item.rxCui || null,
    principioActivoPresentado: item.principioActivoPresentado || null,
    activo: item.activo !== false && item.active !== false,
    origen: item.origen || "catalogo_cognicion_preexistente"
  };
}

function concentracionesRxNorm(nombre = "") {
  const resultados = [...nombre.matchAll(/\d+(?:\.\d+)?\s*(?:MG|MCG|G|MEQ|UNT|UNIT|UNITS|IU|%)(?:\s*\/\s*(?:ML|MG|G|ACTUAT|HR|H|DOSE))?/g)]
    .map((item) => item[0]
      .replace(/UNT|UNITS?|IU/g, "UI")
      .replace(/ACTUAT/g, "dosis")
      .replace(/\bMG\b/g, "mg")
      .replace(/\bMCG\b/g, "mcg")
      .replace(/\bML\b/g, "mL")
      .replace(/\bMEQ\b/g, "mEq")
      .replace(/\s+/g, " "));
  return listaUnica(resultados);
}

function formaRxNorm(nombre = "") {
  const texto = nombre.toLowerCase();
  const encontrada = FORMAS.find(([patron]) => texto.includes(patron));
  return encontrada ? { forma: encontrada[1], via: encontrada[2] } : null;
}

function presentacionDesdeRxNorm(medicamento, concepto) {
  const forma = formaRxNorm(concepto.name);
  const concentraciones = concentracionesRxNorm(concepto.name);
  if (!forma || !concentraciones.length) return null;
  const concentracion = concentraciones.join(" + ");
  return {
    texto: `${forma.forma} de ${concentracion}`,
    via: forma.via,
    forma: forma.forma,
    concentracion,
    fuente: `https://rxnav.nlm.nih.gov/REST/rxcui/${concepto.rxcui}/properties.json`,
    rxCui: concepto.rxcui,
    activo: true,
    origen: `RxNorm ${RXNORM_VERSION}`
  };
}

function clavePresentacion(item) {
  return [normalizar(item.principioActivoPresentado), normalizar(item.forma), normalizar(item.concentracion), normalizar(item.via)].join("|");
}

function finalizarPresentaciones(medicamento, presentaciones = []) {
  const indice = new Map();
  presentaciones.filter(Boolean).forEach((item) => {
    const normalizada = normalizarPresentacionExistente(item);
    const clave = clavePresentacion(normalizada);
    if (!indice.has(clave) || normalizada.rxCui) indice.set(clave, normalizada);
  });
  const usados = new Set();
  return [...indice.values()]
    .sort((a, b) => a.via.localeCompare(b.via, "es") || a.forma.localeCompare(b.forma, "es") || a.concentracion.localeCompare(b.concentracion, "es", { numeric: true }))
    .map((item, index) => {
      const base = `${medicamento.id}-${slug(`${item.forma}-${item.concentracion}`) || `presentacion-${index + 1}`}`;
      let id = base;
      let sufijo = 2;
      while (usados.has(id)) id = `${base}-${sufijo++}`;
      usados.add(id);
      return { id, ...item };
    });
}

async function obtenerJson(url) {
  const respuesta = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "COGNICION-catalog-build/1.0" } });
  if (!respuesta.ok) throw new Error(`RxNorm ${respuesta.status}: ${url}`);
  return respuesta.json();
}

async function resolverRxNorm(medicamento) {
  if (SIN_RXNORM.has(medicamento.id)) return null;
  const terminos = listaUnica(
    TERMINOS_RXNORM[medicamento.id],
    medicamento.genericName,
    medicamento.nombre,
    medicamento.synonyms,
    medicamento.sinonimos,
    medicamento.id.replace(/[_-]+/g, " ")
  );
  let rxcui = "";
  let termino = "";
  for (const candidato of terminos) {
    const datos = await obtenerJson(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(sinAcentos(candidato))}&search=2`);
    rxcui = datos?.idGroup?.rxnormId?.[0] || "";
    if (rxcui) {
      termino = candidato;
      break;
    }
  }
  if (!rxcui) return null;
  const relacionados = await obtenerJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=SCD`);
  let conceptos = (relacionados?.relatedGroup?.conceptGroup || []).flatMap((grupo) => grupo.conceptProperties || []);
  if (!PERMITIR_COMBINACIONES.has(medicamento.id) && (medicamento.principiosActivos || []).length <= 1) {
    conceptos = conceptos.filter((concepto) => !concepto.name.includes(" / "));
  }
  return { rxcui, termino, conceptos };
}

function unirObjetos(medicamento, presentaciones) {
  const datos = medicamento.datosClinicos || {};
  const farmacocinetica = medicamento.farmacocinetica || {};
  const relaciones = (medicamento.interaccionesEstructuradas || []).map((interaccion) => ({
    idRegla: interaccion.idRegla || interaccion.id,
    contraparteIds: [...new Set(interaccion.contraparteIds || [])].sort()
  }));
  return {
    id: medicamento.id,
    legacyIds: listaUnica(medicamento.legacyIds),
    nombre: medicamento.nombre,
    genericName: medicamento.genericName || medicamento.nombre,
    principioActivo: medicamento.principioActivo || medicamento.principioActivoNormalizado || medicamento.id,
    principiosActivos: listaUnica(medicamento.principiosActivos, medicamento.principioActivo || medicamento.id),
    clasePrincipal: medicamento.clasePrincipal || medicamento.clase || "Medicamento",
    clases: listaUnica(medicamento.clases, medicamento.therapeuticClasses, medicamento.clase),
    categoriasInteraccion: listaUnica(medicamento.categoriasInteraccion),
    sinonimos: listaUnica(medicamento.sinonimos, medicamento.synonyms),
    marcas: listaUnica(medicamento.marcas, medicamento.brandNames),
    especialidades: listaUnica(medicamento.especialidades, medicamento.specialties),
    presentaciones,
    dosisHabitual: medicamento.dosisHabitual || "",
    dosisHabituales: listaUnica(medicamento.dosisHabituales),
    frecuenciasSugeridas: listaUnica(medicamento.frecuenciasSugeridas),
    datosClinicos: {
      indicaciones: listaUnica(datos.indicaciones, medicamento.indications, medicamento.indicaciones),
      contraindicaciones: listaUnica(datos.contraindicaciones, medicamento.contraindications, medicamento.contraindicaciones),
      precauciones: listaUnica(datos.precauciones, medicamento.precautions, medicamento.precauciones),
      advertencias: listaUnica(medicamento.warnings, medicamento.advertencias),
      monitorizacion: listaUnica(medicamento.monitoring, medicamento.monitorizacion),
      dosisAdulto: datos.dosisAdulto || medicamento.adultDosing || [],
      dosisPediatrica: datos.dosisPediatrica || medicamento.pediatricDosing || [],
      embarazo: datos.embarazo ?? medicamento.embarazo ?? null,
      lactancia: datos.lactancia ?? medicamento.lactancia ?? null
    },
    farmacocinetica: {
      mecanismoAccion: farmacocinetica.mecanismoAccion || medicamento.mecanismoAccion || medicamento.mechanismOfAction || "",
      vidaMedia: farmacocinetica.vidaMedia || medicamento.vidaMedia || medicamento.halfLife || "",
      tiempoConcentracionMaxima: farmacocinetica.tiempoConcentracionMaxima || medicamento.tiempoConcentracionMaxima || "",
      duracionAccion: farmacocinetica.duracionAccion || medicamento.duracionAccion || "",
      metabolismo: farmacocinetica.metabolismo || medicamento.metabolismo || "",
      eliminacion: farmacocinetica.eliminacion || medicamento.eliminacion || "",
      cyp: listaUnica(farmacocinetica.cyp, medicamento.cyp),
      metabolitosActivos: listaUnica(farmacocinetica.metabolitosActivos, medicamento.metabolitosActivos)
    },
    efectosAdversos: listaUnica(medicamento.efectosAdversos, medicamento.adverseEffects),
    riesgos: medicamento.riesgos || {},
    interacciones: listaUnica(medicamento.interactions),
    interaccionesRelacionadas: relaciones,
    relacionDiagnosticos: listaUnica(medicamento.relacionDiagnosticos, medicamento.interaccionesDiagnostico),
    notas: medicamento.notas || "",
    referencias: listaUnica(medicamento.referencias, medicamento.references, presentaciones.map((item) => item.fuente)),
    fuenteClinica: {
      estado: medicamento.estadoFuente || "fuente_pendiente",
      fuente: medicamento.fuente || "fuente pendiente",
      fuentes: medicamento.fuentes || [],
      paginaSeccion: medicamento.paginaSeccion || "fuente pendiente",
      confianza: medicamento.confianza || "no evaluada"
    },
    farmacologia: medicamento.farmacologia || null,
    pediatria: medicamento.pediatria || null,
    origenesCatalogo: listaUnica(medicamento.origenesCatalogo, medicamento.origen),
    activo: medicamento.active !== false,
    estadoContenido: medicamento.contentStatus || "revision_inicial",
    actualizadoEn: medicamento.updatedAt || FECHA_CORTE
  };
}

function unirRiesgos(...riesgos) {
  const resultado = {};
  riesgos.filter(Boolean).forEach((grupo) => Object.entries(grupo).forEach(([clave, valor]) => {
    resultado[clave] = Math.max(Number(resultado[clave]) || 0, Number(valor) || 0);
  }));
  return resultado;
}

function prepararPresentacionFusionada(medicamento, presentacion) {
  const normalizada = normalizarPresentacionExistente(presentacion);
  if (!["acido-valproico", "valproato-de-magnesio", "valproato-semisodico"].includes(medicamento.id)) return normalizada;
  return {
    ...normalizada,
    texto: `${medicamento.nombre}, ${normalizada.texto}`,
    principioActivoPresentado: medicamento.nombre
  };
}

function fusionarGrupo(medicamentos, idCanonico) {
  const principal = medicamentos.find((medicamento) => medicamento.id === idCanonico) || medicamentos[0];
  const secundarios = medicamentos.filter((medicamento) => medicamento !== principal);
  const datosPrincipal = principal.datosClinicos || {};
  const cineticaPrincipal = principal.farmacocinetica || {};
  return {
    ...principal,
    id: idCanonico,
    legacyIds: listaUnica(principal.legacyIds, secundarios.flatMap((item) => [item.id, ...(item.legacyIds || [])])),
    sinonimos: listaUnica(principal.sinonimos, principal.synonyms, secundarios.flatMap((item) => [item.nombre, item.genericName, item.id, ...(item.sinonimos || []), ...(item.synonyms || [])])),
    synonyms: listaUnica(principal.synonyms, principal.sinonimos, secundarios.flatMap((item) => [item.nombre, item.genericName, item.id, ...(item.sinonimos || []), ...(item.synonyms || [])])),
    marcas: listaUnica(principal.marcas, principal.brandNames, secundarios.flatMap((item) => item.marcas || item.brandNames || [])),
    brandNames: listaUnica(principal.brandNames, principal.marcas, secundarios.flatMap((item) => item.brandNames || item.marcas || [])),
    clases: listaUnica(principal.clases, principal.therapeuticClasses, secundarios.flatMap((item) => item.clases || item.therapeuticClasses || [])),
    therapeuticClasses: listaUnica(principal.therapeuticClasses, principal.clases, secundarios.flatMap((item) => item.therapeuticClasses || item.clases || [])),
    categoriasInteraccion: listaUnica(principal.categoriasInteraccion, secundarios.flatMap((item) => item.categoriasInteraccion || [])),
    especialidades: listaUnica(principal.especialidades, principal.specialties, secundarios.flatMap((item) => item.especialidades || item.specialties || [])),
    presentaciones: medicamentos.flatMap((medicamento) => (medicamento.presentaciones || []).map((presentacion) => prepararPresentacionFusionada(medicamento, presentacion))),
    dosisHabituales: listaUnica(principal.dosisHabituales, secundarios.flatMap((item) => item.dosisHabituales || [])),
    frecuenciasSugeridas: listaUnica(principal.frecuenciasSugeridas, secundarios.flatMap((item) => item.frecuenciasSugeridas || [])),
    datosClinicos: {
      ...datosPrincipal,
      indicaciones: listaUnica(datosPrincipal.indicaciones, secundarios.flatMap((item) => item.datosClinicos?.indicaciones || item.indications || [])),
      contraindicaciones: listaUnica(datosPrincipal.contraindicaciones, secundarios.flatMap((item) => item.datosClinicos?.contraindicaciones || item.contraindications || [])),
      precauciones: listaUnica(datosPrincipal.precauciones, secundarios.flatMap((item) => item.datosClinicos?.precauciones || item.precautions || [])),
      advertencias: listaUnica(datosPrincipal.advertencias, secundarios.flatMap((item) => item.datosClinicos?.advertencias || item.warnings || [])),
      monitorizacion: listaUnica(datosPrincipal.monitorizacion, secundarios.flatMap((item) => item.datosClinicos?.monitorizacion || item.monitoring || []))
    },
    farmacocinetica: cineticaPrincipal,
    efectosAdversos: listaUnica(principal.efectosAdversos, secundarios.flatMap((item) => item.efectosAdversos || [])),
    riesgos: unirRiesgos(principal.riesgos, ...secundarios.map((item) => item.riesgos)),
    interacciones: listaUnica(principal.interactions, principal.interacciones, secundarios.flatMap((item) => item.interactions || item.interacciones || [])),
    interaccionesEstructuradas: [...(principal.interaccionesEstructuradas || []), ...secundarios.flatMap((item) => item.interaccionesEstructuradas || [])],
    relacionDiagnosticos: listaUnica(principal.relacionDiagnosticos, secundarios.flatMap((item) => item.relacionDiagnosticos || item.interaccionesDiagnostico || [])),
    notas: listaUnica(principal.notas, secundarios.map((item) => item.notas)).join(" "),
    referencias: listaUnica(principal.referencias, principal.references, secundarios.flatMap((item) => item.referencias || item.references || [])),
    origenesCatalogo: listaUnica(principal.origenesCatalogo, secundarios.flatMap((item) => item.origenesCatalogo || [item.origen]))
  };
}

function consolidarIdentidades(catalogo) {
  const grupos = new Map();
  catalogo.forEach((medicamento) => {
    const idCanonico = FUSIONES_CANONICAS[medicamento.id] || medicamento.id;
    if (!grupos.has(idCanonico)) grupos.set(idCanonico, []);
    grupos.get(idCanonico).push(medicamento);
  });
  return [...grupos.entries()].map(([idCanonico, medicamentos]) => {
    let fusionado = fusionarGrupo(medicamentos, idCanonico);
    const renombre = RENOMBRES_CANONICOS[fusionado.id];
    if (renombre) fusionado = { ...fusionado, ...renombre, legacyIds: listaUnica(fusionado.legacyIds, fusionado.id) };
    return fusionado;
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function idPediatricoCanonico(id = "") {
  return IDS_PEDIATRICOS_CANONICOS[id] || id;
}

function crearMedicamentoDesdeRegistroPediatrico(registro, idCanonico) {
  const nombre = registro.nombre || registro.genericName || idCanonico.replace(/[_-]+/g, " ");
  return {
    id: idCanonico,
    legacyIds: registro.id && registro.id !== idCanonico ? [registro.id] : [],
    nombre,
    genericName: nombre,
    principioActivo: idCanonico,
    principiosActivos: [nombre],
    clasePrincipal: registro.categoria || registro.drugClass || "Medicamento pediatrico",
    clases: listaUnica(registro.categoria, registro.drugClass, "pediatria"),
    categoriasInteraccion: [],
    sinonimos: listaUnica(registro.id),
    marcas: listaUnica(registro.nombresComerciales),
    especialidades: ["Pediatria"],
    presentaciones: [],
    dosisHabitual: registro.opciones?.[0]?.etiqueta || "",
    dosisHabituales: listaUnica((registro.opciones || []).map((opcion) => opcion.etiqueta)),
    frecuenciasSugeridas: [],
    datosClinicos: {
      indicaciones: [],
      contraindicaciones: listaUnica(registro.contraindicaciones),
      precauciones: listaUnica(registro.advertencia),
      advertencias: listaUnica(registro.advertencia),
      monitorizacion: [],
      dosisAdulto: [],
      dosisPediatrica: registro.opciones || [],
      embarazo: null,
      lactancia: null
    },
    farmacocinetica: {
      mecanismoAccion: registro.mechanism || "",
      vidaMedia: "",
      tiempoConcentracionMaxima: "",
      duracionAccion: "",
      metabolismo: "",
      eliminacion: "",
      cyp: [],
      metabolitosActivos: []
    },
    efectosAdversos: listaUnica(registro.adverseEffects),
    riesgos: {},
    interactions: listaUnica(registro.interacciones, registro.interactions),
    relacionDiagnosticos: [],
    notas: registro.advertencia || "",
    referencias: listaUnica(registro.fuente, registro.sources),
    origenesCatalogo: ["catalogo_pediatrico_legacy"],
    active: true,
    contentStatus: "revision_inicial",
    updatedAt: registro.updatedAt || FECHA_CORTE
  };
}

function integrarDatosPediatricos(catalogo) {
  const salida = catalogo.map((medicamento) => ({ ...medicamento }));
  const indice = new Map(salida.map((medicamento, index) => [medicamento.id, index]));

  MEDICAMENTOS_PEDIATRICOS.forEach((registro, orden) => {
    const idCanonico = idPediatricoCanonico(registro.id || registro.medicationId);
    if (!indice.has(idCanonico)) {
      indice.set(idCanonico, salida.length);
      salida.push(crearMedicamentoDesdeRegistroPediatrico(registro, idCanonico));
    }
    const posicion = indice.get(idCanonico);
    const medicamento = salida[posicion];
    const datos = medicamento.datosClinicos || {};
    const registroCanonico = {
      ...registro,
      clinicalMedicationId: idCanonico,
      medicationId: idCanonico
    };
    salida[posicion] = {
      ...medicamento,
      legacyIds: listaUnica(medicamento.legacyIds, registro.id !== idCanonico ? registro.id : []),
      sinonimos: listaUnica(medicamento.sinonimos, medicamento.synonyms, registro.id, registro.nombre),
      synonyms: listaUnica(medicamento.synonyms, medicamento.sinonimos, registro.id, registro.nombre),
      marcas: listaUnica(medicamento.marcas, medicamento.brandNames, registro.nombresComerciales),
      brandNames: listaUnica(medicamento.brandNames, medicamento.marcas, registro.nombresComerciales),
      clases: listaUnica(medicamento.clases, medicamento.therapeuticClasses, registro.categoria, "pediatria"),
      therapeuticClasses: listaUnica(medicamento.therapeuticClasses, medicamento.clases, registro.categoria, "pediatria"),
      especialidades: listaUnica(medicamento.especialidades, medicamento.specialties, "Pediatria"),
      specialties: listaUnica(medicamento.specialties, medicamento.especialidades, "Pediatria"),
      datosClinicos: {
        ...datos,
        contraindicaciones: listaUnica(datos.contraindicaciones, medicamento.contraindications, registro.contraindicaciones),
        precauciones: listaUnica(datos.precauciones, medicamento.precautions, registro.advertencia),
        advertencias: listaUnica(datos.advertencias, medicamento.warnings, registro.advertencia),
        dosisPediatrica: listaUnica(datos.dosisPediatrica, medicamento.pediatricDosing, registro.opciones)
      },
      interactions: listaUnica(medicamento.interactions, medicamento.interacciones, registro.interacciones),
      notas: listaUnica(medicamento.notas, registro.advertencia).join(" "),
      referencias: listaUnica(medicamento.referencias, medicamento.references, registro.fuente),
      origenesCatalogo: listaUnica(medicamento.origenesCatalogo, "catalogo_pediatrico_legacy"),
      pediatria: {
        ...(medicamento.pediatria || {}),
        legacyOrder: orden,
        legacy: registroCanonico
      }
    };
  });

  CATALOGO_MEDICAMENTOS_PEDIATRICOS.forEach((ficha, orden) => {
    const idCanonico = idPediatricoCanonico(ficha.medicationId);
    const posicion = indice.get(idCanonico);
    if (posicion === undefined) return;
    const medicamento = salida[posicion];
    const datos = medicamento.datosClinicos || {};
    const cinetica = medicamento.farmacocinetica || {};
    const marcas = (ficha.presentations || []).flatMap((presentacion) => [presentacion.brandName, ...(presentacion.brands || [])]);
    salida[posicion] = {
      ...medicamento,
      sinonimos: listaUnica(medicamento.sinonimos, medicamento.synonyms, ficha.synonyms),
      synonyms: listaUnica(medicamento.synonyms, medicamento.sinonimos, ficha.synonyms),
      marcas: listaUnica(medicamento.marcas, medicamento.brandNames, marcas),
      brandNames: listaUnica(medicamento.brandNames, medicamento.marcas, marcas),
      datosClinicos: {
        ...datos,
        contraindicaciones: listaUnica(datos.contraindicaciones, ficha.contraindications),
        precauciones: listaUnica(datos.precauciones, ficha.precautions)
      },
      farmacocinetica: {
        ...cinetica,
        mecanismoAccion: cinetica.mecanismoAccion || ficha.mechanism || ""
      },
      efectosAdversos: listaUnica(medicamento.efectosAdversos, medicamento.adverseEffects, ficha.adverseEffects),
      interactions: listaUnica(medicamento.interactions, medicamento.interacciones, ficha.interactions),
      referencias: listaUnica(medicamento.referencias, medicamento.references, ficha.sources),
      origenesCatalogo: listaUnica(medicamento.origenesCatalogo, "catalogo_pediatrico_verificado"),
      pediatria: {
        ...(medicamento.pediatria || {}),
        catalogOrder: orden,
        ficha: { ...ficha, medicationId: idCanonico }
      }
    };
  });

  return salida;
}

async function construirCatalogo() {
  const catalogoEntrada = consolidarIdentidades(integrarDatosPediatricos(CATALOGO_ACTUAL));
  const salida = new Array(catalogoEntrada.length);
  let cursor = 0;
  const errores = [];
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (cursor < catalogoEntrada.length) {
      const indice = cursor++;
      const medicamento = catalogoEntrada[indice];
      const existentes = (medicamento.presentaciones || []).map(normalizarPresentacionExistente);
      const incompletas = existentes.filter((item) => esComodin(item.texto) || !tieneConcentracion(item.texto));
      const concretas = existentes.filter((item) => !esComodin(item.texto) && tieneConcentracion(item.texto));
      let rxNorm = null;
      if (!existentes.length || incompletas.length) {
        try {
          rxNorm = await resolverRxNorm(medicamento);
        } catch (error) {
          errores.push(`${medicamento.id}: ${error.message}`);
        }
      }
      const desdeRxNorm = (rxNorm?.conceptos || []).map((concepto) => presentacionDesdeRxNorm(medicamento, concepto)).filter(Boolean);
      const manuales = PRESENTACIONES_MANUALES[medicamento.id] || [];
      const conservarIncompletas = !desdeRxNorm.length && !manuales.length
        ? incompletas.filter((item) => !esComodin(item.texto))
        : [];
      const presentaciones = finalizarPresentaciones(medicamento, [...concretas, ...conservarIncompletas, ...desdeRxNorm, ...manuales]);
      salida[indice] = unirObjetos(medicamento, presentaciones);
    }
  }));

  if (errores.length) console.warn(`Advertencias RxNorm:\n${errores.join("\n")}`);
  const sinPresentacion = salida.filter((medicamento) => !medicamento.presentaciones.length);
  const comodines = salida.flatMap((medicamento) => medicamento.presentaciones.filter((item) => esComodin(item.texto)).map((item) => `${medicamento.id}: ${item.texto}`));
  if (sinPresentacion.length || comodines.length) {
    throw new Error(`Catálogo incompleto. Sin presentación: ${sinPresentacion.map((item) => item.id).join(", ")}. Comodines: ${comodines.join("; ")}`);
  }
  return salida;
}

function codigoRuntime(datos) {
  return `/**
 * CATÁLOGO FARMACOLÓGICO MAESTRO DE COGNICIÓN.
 *
 * Única fuente de verdad de medicamentos y presentaciones. Los archivos
 * medicamentos.js, medicamentosSuplementarios.js y farmacologiaUnificada.js
 * son adaptadores de compatibilidad y no contienen catálogos paralelos.
 * Presentaciones enriquecidas con RxNorm ${RXNORM_VERSION} (API ${RXNORM_API_VERSION})
 * y fuentes regulatorias explícitas para conceptos sin producto RxNorm.
 * Corte de datos: ${FECHA_CORTE}.
 */

import { REGLAS_INTERACCIONES_CLINICAS } from "./reglasClinicasMedicamentosExtendidas.js?v=20260811-catalog-presentations-v1";

export const CATALOGO_FARMACOLOGICO_METADATA = Object.freeze({
  esquema: "cognicion.catalogo-farmacologico.v2",
  fechaCorte: "${FECHA_CORTE}",
  rxNormVersion: "${RXNORM_VERSION}",
  rxNormApiVersion: "${RXNORM_API_VERSION}",
  fuentePresentaciones: "https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html"
});

export const CATALOGO_FARMACOLOGICO_MAESTRO = ${JSON.stringify(datos, null, 2)};

function listaUnica(...listas) {
  return [...new Set(listas.flatMap((lista) => Array.isArray(lista) ? lista : [lista]).filter((valor) => valor !== undefined && valor !== null && valor !== ""))];
}

export function normalizarNombreMedicamento(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();
}

function normalizarBusquedaMedicamento(valor = "") {
  return normalizarNombreMedicamento(valor).replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
}

const FORMAS_FARMACEUTICAS = /\\b(tabletas?|comprimidos?|capsulas?|soluciones?|suspensiones?|inyectables?|ampolletas?|gotas?|jarabes?|parches?|cremas?|geles?|unguentos?|aerosoles?|inhaladores?|implantes?|supositorios?|enemas?|oral|intravenosa|intravenoso|intramuscular|subcutanea|subcutaneo|oftalmica|otica|nasal|topica|sublingual|bucal|vo|iv|im|sc)\\b/gi;

export function normalizarPrincipioActivo(valor = "") {
  return normalizarNombreMedicamento(valor)
    .replace(/-p\\d+$/i, "")
    .replace(/\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|g|ml|ui|iu|u|unidades?|%|meq)(?:\\s*\\/\\s*(?:\\d+(?:[.,]\\d+)?\\s*)?(?:ml|mg|g|actuat|dosis|h|hr))?\\b/gi, " ")
    .replace(FORMAS_FARMACEUTICAS, " ")
    .replace(/\\b(de|del|la|el|por|para|liberacion|prolongada|retardada|recubierta)\\b/g, " ")
    .replace(/[^a-z0-9/_-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function tagClinico(valor = "") {
  return normalizarNombreMedicamento(valor).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function coincideConLado(medicamento, ingredientes = [], clases = []) {
  const ids = new Set([medicamento.id, medicamento.clinicalMedicationId, medicamento.principioActivoNormalizado].filter(Boolean));
  if ((ingredientes || []).some((id) => ids.has(id))) return true;
  const tags = new Set([
    ...(medicamento.clases || []),
    ...(medicamento.therapeuticClasses || []),
    ...(medicamento.tagsClinicos || []),
    ...Object.entries(medicamento.riesgos || {}).filter(([, valor]) => Number(valor) > 0).map(([riesgo]) => riesgo)
  ].map(tagClinico));
  return (clases || []).some((clase) => tags.has(tagClinico(clase)));
}

function adaptarRegistroMaestro(medicamento) {
  const presentaciones = medicamento.presentaciones.map((presentacion, index) => Object.freeze({
    ...presentacion,
    presentationId: presentacion.id,
    medicationId: medicamento.id,
    clinicalMedicationId: medicamento.id,
    legacyFormulationId: \`\${medicamento.id}-p\${index + 1}\`
  }));
  const datos = medicamento.datosClinicos || {};
  const cinetica = medicamento.farmacocinetica || {};
  const fuente = medicamento.fuenteClinica || {};
  return {
    ...medicamento,
    medicationId: medicamento.id,
    clinicalMedicationId: medicamento.id,
    principioActivoNormalizado: medicamento.principioActivo,
    clase: medicamento.clasePrincipal,
    grupoFarmacologico: medicamento.clasePrincipal,
    therapeuticClasses: medicamento.clases,
    tagsClinicos: medicamento.clases,
    brandNames: medicamento.marcas,
    synonyms: medicamento.sinonimos,
    specialties: medicamento.especialidades,
    presentaciones,
    formulations: presentaciones.map((presentacion) => Object.freeze({
      id: presentacion.id,
      legacyId: presentacion.legacyFormulationId,
      medicationId: medicamento.id,
      clinicalMedicationId: medicamento.id,
      presentationDescription: presentacion.texto,
      route: presentacion.via,
      active: presentacion.activo !== false
    })),
    adultDosing: datos.dosisAdulto || [],
    pediatricDosing: datos.dosisPediatrica || [],
    indications: datos.indicaciones || [],
    contraindications: datos.contraindicaciones || [],
    precautions: datos.precauciones || [],
    warnings: datos.advertencias || [],
    monitoring: datos.monitorizacion || [],
    mecanismoAccion: cinetica.mecanismoAccion || "",
    vidaMedia: cinetica.vidaMedia || "",
    halfLife: cinetica.vidaMedia || "",
    tiempoConcentracionMaxima: cinetica.tiempoConcentracionMaxima || "",
    duracionAccion: cinetica.duracionAccion || "",
    metabolismo: cinetica.metabolismo || "",
    eliminacion: cinetica.eliminacion || "",
    cyp: cinetica.cyp || [],
    metabolitosActivos: cinetica.metabolitosActivos || [],
    adverseEffects: medicamento.efectosAdversos || [],
    interactions: medicamento.interacciones || [],
    interaccionesDiagnostico: medicamento.relacionDiagnosticos || [],
    references: medicamento.referencias || [],
    estadoFuente: fuente.estado || "fuente_pendiente",
    fuente: fuente.fuente || "fuente pendiente",
    fuentes: fuente.fuentes || [],
    paginaSeccion: fuente.paginaSeccion || "fuente pendiente",
    confianza: fuente.confianza || "no evaluada",
    active: medicamento.activo !== false,
    contentStatus: medicamento.estadoContenido,
    updatedAt: medicamento.actualizadoEn,
    origen: medicamento.origenesCatalogo?.[0] || "catalogo_maestro"
  };
}

const CATALOGO_BASE = CATALOGO_FARMACOLOGICO_MAESTRO.map(adaptarRegistroMaestro);

function construirIndiceInteraccionesReciprocas() {
  const indice = new Map(CATALOGO_BASE.map((medicamento) => [medicamento.id, []]));
  const registrar = (medicamento, regla, contrapartes) => {
    const contraparteIds = [...new Set(contrapartes.filter((item) => item.id !== medicamento.id).map((item) => item.id))].sort();
    if (!contraparteIds.length) return;
    indice.get(medicamento.id).push({
      id: regla.id,
      idRegla: regla.id,
      severidad: regla.severidad,
      categoria: regla.categoria || regla.tipoInteraccion || "otra",
      tipo: regla.tipoInteraccion || "farmacodinamica",
      titulo: regla.titulo,
      mecanismo: regla.mecanismo || "",
      efectoClinico: regla.efectoClinico || regla.efecto || "",
      recomendacion: regla.recomendacion || "",
      medicamentos: [medicamento.id, ...contraparteIds],
      contraparteIds,
      fuentes: regla.fuentes || [],
      evidencia: regla.evidencia || "regla_local"
    });
  };
  REGLAS_INTERACCIONES_CLINICAS.forEach((regla) => {
    const ladoA = CATALOGO_BASE.filter((medicamento) => coincideConLado(medicamento, regla.ingredientesA, regla.clasesA));
    const ladoB = CATALOGO_BASE.filter((medicamento) => coincideConLado(medicamento, regla.ingredientesB, regla.clasesB));
    ladoA.forEach((medicamento) => registrar(medicamento, regla, ladoB));
    ladoB.forEach((medicamento) => registrar(medicamento, regla, ladoA));
  });
  return indice;
}

const INDICE_INTERACCIONES = construirIndiceInteraccionesReciprocas();

export const CATALOGO_FARMACOLOGICO_OFICIAL = Object.freeze(CATALOGO_BASE.map((medicamento) => {
  const interaccionesEstructuradas = Object.freeze((INDICE_INTERACCIONES.get(medicamento.id) || []).map(Object.freeze));
  const textos = interaccionesEstructuradas.map((interaccion) => {
    const nombres = interaccion.contraparteIds.map((id) => CATALOGO_BASE.find((item) => item.id === id)?.nombre || id).join(", ");
    return \`\${interaccion.titulo}: \${nombres}\`;
  });
  return Object.freeze({
    ...medicamento,
    interacciones: Object.freeze(listaUnica(medicamento.interacciones, textos)),
    interaccionesEstructuradas,
    interactionDetails: interaccionesEstructuradas
  });
}));

export const MEDICAMENTOS_MAESTROS = CATALOGO_FARMACOLOGICO_OFICIAL;
export const MEDICAMENTOS = CATALOGO_FARMACOLOGICO_OFICIAL;

const POR_ID = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.flatMap((medicamento) => [medicamento.id, ...(medicamento.legacyIds || [])].map((id) => [id, medicamento])));
const PRESENTACIONES_POR_ID = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.flatMap((medicamento) => medicamento.presentaciones.flatMap((presentacion) => [
  [presentacion.id, { medicamento, presentacion }],
  [presentacion.legacyFormulationId, { medicamento, presentacion }]
])));

export const MEDICAMENTOS_PRESENTACIONES = Object.freeze(CATALOGO_FARMACOLOGICO_OFICIAL.flatMap((medicamento) => medicamento.presentaciones.map((presentacion) => Object.freeze({
  ...medicamento,
  clinicalMedicationId: medicamento.id,
  selectedPresentationId: presentacion.id,
  selectedPresentationText: presentacion.texto,
  presentationText: presentacion.texto,
  presentacion: presentacion.texto,
  via: presentacion.via,
  texto: \`\${medicamento.nombre}, \${presentacion.texto}.\`
}))));

export const MEDICAMENTOS_AGRUPADOS_POR_CLASE = Object.freeze([...CATALOGO_FARMACOLOGICO_OFICIAL.reduce((mapa, medicamento) => {
  const grupo = medicamento.clasePrincipal || "Medicamento";
  if (!mapa.has(grupo)) mapa.set(grupo, []);
  mapa.get(grupo).push(medicamento);
  return mapa;
}, new Map()).entries()].map(([grupo, medicamentos]) => Object.freeze({ grupo, medicamentos: Object.freeze(medicamentos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) })).sort((a, b) => a.grupo.localeCompare(b.grupo, "es")));

export const COBERTURA_FARMACOLOGICA = Object.freeze({
  totalNormalizados: CATALOGO_FARMACOLOGICO_OFICIAL.length,
  conFuenteVerificada: CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.estadoFuente === "verificada_local").length,
  datosCompletos: CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.estadoFuente === "verificada_local" && medicamento.presentaciones.length).length,
  fuentePendiente: CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.estadoFuente !== "verificada_local").length,
  idsVerificados: CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.estadoFuente === "verificada_local").map((medicamento) => medicamento.id)
});

export const CATALOGO_FARMACOLOGICO_NORMALIZADO = Object.freeze({
  esquema: CATALOGO_FARMACOLOGICO_METADATA.esquema,
  medicamentos: CATALOGO_FARMACOLOGICO_OFICIAL,
  metadata: CATALOGO_FARMACOLOGICO_METADATA,
  cobertura: COBERTURA_FARMACOLOGICA
});

function textoEntrada(entrada) {
  if (typeof entrada === "string") return entrada;
  if (!entrada || typeof entrada !== "object") return "";
  return [entrada.originalText, entrada.medicamento, entrada.medicationName, entrada.genericName, entrada.nombre, entrada.principioActivo, entrada.selectedPresentationText, entrada.presentacion, entrada.presentation].filter(Boolean).join(" ");
}

function idDeclarado(entrada) {
  if (!entrada || typeof entrada !== "object") return "";
  return entrada.clinicalMedicationId || entrada.medicationId || entrada.catalogMedicationId || entrada.id || "";
}

export function obtenerMedicamentoPorId(id = "") {
  if (POR_ID.has(id)) return POR_ID.get(id);
  if (PRESENTACIONES_POR_ID.has(id)) return PRESENTACIONES_POR_ID.get(id).medicamento;
  const sinPresentacion = String(id).replace(/-p\\d+$/i, "");
  return POR_ID.get(sinPresentacion) || null;
}

function encontrarPresentacion(medicamento, entrada) {
  const declarada = typeof entrada === "object" ? entrada.selectedPresentationId || entrada.presentationId || entrada.formulationId || "" : "";
  if (declarada) {
    const encontrada = PRESENTACIONES_POR_ID.get(declarada);
    if (encontrada?.medicamento.id === medicamento.id) return encontrada.presentacion;
  }
  const texto = normalizarNombreMedicamento(textoEntrada(entrada));
  if (!texto) return null;
  return medicamento.presentaciones.map((presentacion) => {
    const tokens = normalizarNombreMedicamento(presentacion.texto).split(/[^a-z0-9]+/).filter((token) => token.length > 1);
    return { presentacion, score: tokens.filter((token) => texto.includes(token)).length, total: tokens.length };
  }).filter((item) => item.score && (item.score === item.total || /\\d/.test(item.presentacion.texto))).sort((a, b) => b.score - a.score || b.total - a.total)[0]?.presentacion || null;
}

export function textoMedicamentoParaBusqueda(medicamento) {
  return [medicamento.nombre, medicamento.genericName, medicamento.clasePrincipal, medicamento.clases, medicamento.especialidades, medicamento.marcas, medicamento.sinonimos, medicamento.presentaciones.map((item) => item.texto), medicamento.dosisHabitual, medicamento.notas].flat().filter(Boolean).join(" ");
}

export function buscarMedicamentos(query = "", opciones = {}) {
  const limite = opciones.limit || 40;
  const filtro = normalizarNombreMedicamento(query);
  const filtroFlexible = normalizarBusquedaMedicamento(query);
  const estricto = opciones.strict === true;
  if (!filtro) return estricto && opciones.allowEmpty !== true ? [] : CATALOGO_FARMACOLOGICO_OFICIAL.slice(0, limite);
  return CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => {
    const nombre = normalizarNombreMedicamento(medicamento.nombre);
    const generico = normalizarNombreMedicamento(medicamento.genericName);
    const nombreFlexible = normalizarBusquedaMedicamento(medicamento.nombre);
    const genericoFlexible = normalizarBusquedaMedicamento(medicamento.genericName);
    const alias = [...medicamento.marcas, ...medicamento.sinonimos].map(normalizarNombreMedicamento);
    const aliasFlexible = [...medicamento.marcas, ...medicamento.sinonimos].map(normalizarBusquedaMedicamento);
    const presentaciones = medicamento.presentaciones.map((item) => normalizarNombreMedicamento(item.texto));
    const textoFlexible = normalizarBusquedaMedicamento(textoMedicamentoParaBusqueda(medicamento));
    let ranking = null;
    if (nombre.startsWith(filtro) || nombreFlexible.startsWith(filtroFlexible)) ranking = 1;
    else if (generico.startsWith(filtro) || genericoFlexible.startsWith(filtroFlexible)) ranking = 2;
    else if (alias.some((valor) => valor.startsWith(filtro)) || aliasFlexible.some((valor) => valor.startsWith(filtroFlexible))) ranking = 3;
    else if (filtroFlexible.startsWith(\`\${nombreFlexible} \`) && filtroFlexible.split(" ").every((token) => textoFlexible.includes(token))) ranking = 3;
    else if (nombre.includes(filtro) || nombreFlexible.includes(filtroFlexible)) ranking = 4;
    else if (generico.includes(filtro) || genericoFlexible.includes(filtroFlexible)) ranking = 5;
    else if (alias.some((valor) => valor.includes(filtro)) || aliasFlexible.some((valor) => valor.includes(filtroFlexible))) ranking = 6;
    else if (presentaciones.some((valor) => valor.includes(filtro))) ranking = 7;
    else if (!estricto && (normalizarNombreMedicamento(textoMedicamentoParaBusqueda(medicamento)).includes(filtro) || textoFlexible.includes(filtroFlexible))) ranking = 8;
    return ranking === null ? null : { medicamento, ranking };
  }).filter(Boolean).sort((a, b) => a.ranking - b.ranking || a.medicamento.nombre.localeCompare(b.medicamento.nombre, "es")).slice(0, limite).map((item) => item.medicamento);
}

export const buscarCatalogoFarmacologico = buscarMedicamentos;

export function resolverMedicamentoCanonico(entrada) {
  const declarado = idDeclarado(entrada);
  let medicamento = obtenerMedicamentoPorId(declarado);
  const texto = textoEntrada(entrada);
  if (!medicamento && texto) medicamento = medicamentoPorTexto(texto) || buscarMedicamentos(texto, { limit: 1, strict: false, allowEmpty: false })[0] || null;
  if (!medicamento) return null;
  const presentacion = encontrarPresentacion(medicamento, entrada);
  return {
    clinicalMedicationId: medicamento.id,
    medicationId: medicamento.id,
    medicationName: medicamento.nombre,
    genericName: medicamento.genericName,
    principioActivo: medicamento.principioActivo,
    selectedPresentationId: presentacion?.id || null,
    selectedPresentationText: presentacion?.texto || "",
    originalText: texto || medicamento.nombre,
    medicamento,
    presentacion
  };
}

export function normalizarMedicamento(entrada) {
  const resuelto = resolverMedicamentoCanonico(entrada);
  return resuelto?.clinicalMedicationId || normalizarPrincipioActivo(textoEntrada(entrada));
}

export function adaptarMedicamentoPersistido(registro) {
  const resuelto = resolverMedicamentoCanonico(registro);
  if (!resuelto) return { ...registro, originalText: textoEntrada(registro) };
  return {
    ...registro,
    clinicalMedicationId: resuelto.clinicalMedicationId,
    medicationId: resuelto.medicationId,
    medicationName: resuelto.medicationName,
    selectedPresentationId: resuelto.selectedPresentationId,
    selectedPresentationText: resuelto.selectedPresentationText,
    originalText: registro?.originalText || resuelto.originalText
  };
}

export function medicamentoPorTexto(texto = "") {
  const normalizado = normalizarNombreMedicamento(texto);
  const flexible = normalizarBusquedaMedicamento(texto);
  if (!normalizado) return null;
  const idTecnico = normalizado.replace(/-p\\d+$/i, "");
  if (POR_ID.has(idTecnico)) return POR_ID.get(idTecnico);
  const exacto = CATALOGO_FARMACOLOGICO_OFICIAL.find((medicamento) => [medicamento.nombre, medicamento.genericName, medicamento.principioActivo, medicamento.id, ...(medicamento.legacyIds || []), ...medicamento.marcas, ...medicamento.sinonimos].some((valor) => normalizarNombreMedicamento(valor) === normalizado));
  if (exacto) return exacto;
  const encabezado = CATALOGO_FARMACOLOGICO_OFICIAL.find((medicamento) => {
    const nombres = [medicamento.nombre, medicamento.genericName, medicamento.principioActivo, medicamento.id, ...(medicamento.legacyIds || []), ...medicamento.marcas, ...medicamento.sinonimos].map(normalizarBusquedaMedicamento).filter(Boolean);
    return nombres.some((nombre) => flexible === nombre || flexible.startsWith(\`\${nombre} \`));
  });
  if (encabezado) return encabezado;
  const porPresentacion = MEDICAMENTOS_PRESENTACIONES.find((item) => normalizado.includes(normalizarNombreMedicamento(item.nombre)) && normalizado.includes(normalizarNombreMedicamento(item.selectedPresentationText)));
  if (porPresentacion) return POR_ID.get(porPresentacion.clinicalMedicationId) || null;
  return buscarMedicamentos(texto, { limit: 1, strict: true })[0] || null;
}
`;
}

const catalogo = await construirCatalogo();
const totalPresentaciones = catalogo.reduce((total, medicamento) => total + medicamento.presentaciones.length, 0);
const incompletos = catalogo.filter((medicamento) => !medicamento.presentaciones.length || medicamento.presentaciones.some((item) => esComodin(item.texto)));
console.log(JSON.stringify({ medicamentos: catalogo.length, presentaciones: totalPresentaciones, incompletos: incompletos.map((item) => item.id) }, null, 2));

if (process.argv.includes("--write")) {
  await writeFile(DESTINO, codigoRuntime(catalogo), "utf8");
  console.log(`Catálogo consolidado escrito en ${DESTINO}`);
}
