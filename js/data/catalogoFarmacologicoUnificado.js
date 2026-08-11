import {
  CATALOGO_FARMACOLOGICO_NORMALIZADO as CATALOGO_NORMALIZADO_LEGACY,
  COBERTURA_FARMACOLOGICA,
  MEDICAMENTOS as MEDICAMENTOS_LEGACY,
  MEDICAMENTOS_AGRUPADOS_POR_CLASE as GRUPOS_LEGACY,
  MEDICAMENTOS_MAESTROS as MEDICAMENTOS_MAESTROS_LEGACY,
  MEDICAMENTOS_PRESENTACIONES as PRESENTACIONES_LEGACY,
  buscarMedicamentos as buscarMedicamentosLegacy,
  medicamentoPorTexto as medicamentoPorTextoLegacy,
  normalizarNombreMedicamento,
  textoMedicamentoParaBusqueda
} from "./medicamentos.js";
import { INGREDIENTES_MEDICAMENTOS } from "./reglasClinicasMedicamentosExtendidas.js";
import { normalizarPrincipioActivo } from "./farmacologiaMerge.js";

const METADATOS_CLINICOS = new Map(INGREDIENTES_MEDICAMENTOS.map((item) => [item.id, item]));

function listaUnica(...listas) {
  return [...new Set(listas.flatMap((lista) => Array.isArray(lista) ? lista : [lista]).filter(Boolean))];
}

function slug(valor = "") {
  return normalizarNombreMedicamento(valor)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoriasDesdeRiesgos(riesgos = {}, clases = []) {
  const categorias = [];
  const tags = clases.map((clase) => normalizarNombreMedicamento(clase).replace(/[^a-z0-9]+/g, "_"));
  if (riesgos.qt || tags.includes("qt")) categorias.push("qt", "cardiovascular");
  if (riesgos.sedacion || riesgos.respiratorio || tags.includes("depresor_snc")) categorias.push("depresora_snc");
  if (riesgos.sangrado || tags.includes("anticoagulante") || tags.includes("antiagregante")) categorias.push("hemorragica");
  if (riesgos.renal || tags.some((clase) => ["ieca", "ara2", "aine", "diuretico"].includes(clase))) categorias.push("renal");
  if (riesgos.potasio || riesgos.potasio_bajo || tags.some((clase) => ["ieca", "ara2", "tiazida", "ahorrador_potasio"].includes(clase))) categorias.push("electrolitica");
  if (riesgos.glucosa || riesgos.metabolico || tags.some((clase) => /sglt2|glp_?1|hipoglucemiante/.test(clase))) categorias.push("metabolica");
  if (riesgos.convulsivo) categorias.push("convulsiva");
  if (tags.includes("serotoninergico")) categorias.push("serotoninergica");
  return listaUnica(categorias);
}

function presentacionesCanonicas(medicamento = {}) {
  const usados = new Set();
  return (medicamento.presentaciones || []).map((presentacion, index) => {
    const texto = typeof presentacion === "string" ? presentacion : presentacion.texto || presentacion.presentationDescription || "";
    const via = typeof presentacion === "string" ? "oral" : presentacion.via || presentacion.route || "oral";
    const base = `${medicamento.id}-${slug(texto || `presentacion-${index + 1}`)}`;
    let id = base;
    let sufijo = 2;
    while (usados.has(id)) id = `${base}-${sufijo++}`;
    usados.add(id);
    return {
      ...(typeof presentacion === "object" ? presentacion : {}),
      id,
      presentationId: id,
      medicationId: medicamento.id,
      clinicalMedicationId: medicamento.id,
      texto,
      via,
      activo: presentacion?.activo !== false,
      legacyFormulationId: medicamento.formulations?.[index]?.id || `${medicamento.id}-p${index + 1}`
    };
  });
}

function enriquecerMedicamentoOficial(medicamento = {}) {
  const metadata = METADATOS_CLINICOS.get(medicamento.id) || {};
  const clases = listaUnica(medicamento.therapeuticClasses, medicamento.clase, metadata.clases);
  const riesgos = { ...(metadata.riesgos || {}), ...(medicamento.riesgos || {}) };
  const presentaciones = presentacionesCanonicas(medicamento);
  const principioActivo = normalizarPrincipioActivo(medicamento.genericName || medicamento.nombre || medicamento.id) || medicamento.id;
  return Object.freeze({
    ...medicamento,
    id: medicamento.id,
    medicationId: medicamento.id,
    clinicalMedicationId: medicamento.id,
    genericName: medicamento.genericName || medicamento.nombre,
    principioActivo,
    principioActivoNormalizado: principioActivo,
    clasePrincipal: medicamento.clase || clases[0] || "Medicamento",
    clases,
    therapeuticClasses: clases,
    tagsClinicos: clases,
    categoriasInteraccion: categoriasDesdeRiesgos(riesgos, clases),
    riesgos,
    sinonimos: listaUnica(medicamento.synonyms),
    marcas: listaUnica(medicamento.brandNames),
    presentaciones,
    formulations: presentaciones.map((presentacion) => ({
      id: presentacion.id,
      legacyId: presentacion.legacyFormulationId,
      medicationId: medicamento.id,
      clinicalMedicationId: medicamento.id,
      presentationDescription: presentacion.texto,
      route: presentacion.via,
      active: presentacion.activo !== false
    })),
    datosClinicos: {
      indicaciones: medicamento.indications || [],
      contraindicaciones: medicamento.contraindications || [],
      precauciones: medicamento.precautions || [],
      dosisAdulto: medicamento.adultDosing || [],
      dosisPediatrica: medicamento.pediatricDosing || [],
      embarazo: medicamento.embarazo || null,
      lactancia: medicamento.lactancia || null
    },
    interacciones: medicamento.interactions || [],
    relacionDiagnosticos: medicamento.interaccionesDiagnostico || [],
    referencias: medicamento.references || []
  });
}

/** Fuente oficial única de identidad farmacológica de COGNICIÓN. */
export const CATALOGO_FARMACOLOGICO_OFICIAL = Object.freeze(
  MEDICAMENTOS_MAESTROS_LEGACY.map(enriquecerMedicamentoOficial)
);

const POR_ID = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.map((medicamento) => [medicamento.id, medicamento]));
const PRESENTACIONES_POR_ID = new Map(CATALOGO_FARMACOLOGICO_OFICIAL.flatMap((medicamento) =>
  medicamento.presentaciones.flatMap((presentacion) => [
    [presentacion.id, { medicamento, presentacion }],
    [presentacion.legacyFormulationId, { medicamento, presentacion }]
  ])
));

function textoEntrada(entrada) {
  if (typeof entrada === "string") return entrada;
  if (!entrada || typeof entrada !== "object") return "";
  return [
    entrada.originalText,
    entrada.medicamento,
    entrada.medicationName,
    entrada.genericName,
    entrada.nombre,
    entrada.principioActivo,
    entrada.selectedPresentationText,
    entrada.presentacion,
    entrada.presentation
  ].filter(Boolean).join(" ");
}

function idDeclarado(entrada) {
  if (!entrada || typeof entrada !== "object") return "";
  return entrada.clinicalMedicationId || entrada.medicationId || entrada.catalogMedicationId || entrada.id || "";
}

function encontrarPresentacion(medicamento, entrada) {
  const declarada = typeof entrada === "object"
    ? entrada.selectedPresentationId || entrada.presentationId || entrada.formulationId || ""
    : "";
  if (declarada) {
    const encontrada = PRESENTACIONES_POR_ID.get(declarada);
    if (encontrada?.medicamento.id === medicamento.id) return encontrada.presentacion;
  }
  const texto = normalizarNombreMedicamento(textoEntrada(entrada));
  if (!texto) return null;
  const candidatas = medicamento.presentaciones
    .map((presentacion) => {
      const normalizada = normalizarNombreMedicamento(presentacion.texto);
      const tokens = normalizada.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
      const score = tokens.filter((token) => texto.includes(token)).length;
      return { presentacion, score, total: tokens.length };
    })
    .filter((item) => item.score && (item.score === item.total || /\d/.test(item.presentacion.texto)))
    .sort((a, b) => b.score - a.score || b.total - a.total);
  return candidatas[0]?.presentacion || null;
}

export function obtenerMedicamentoPorId(id = "") {
  if (POR_ID.has(id)) return POR_ID.get(id);
  return PRESENTACIONES_POR_ID.get(id)?.medicamento || null;
}

export function resolverMedicamentoCanonico(entrada) {
  const declarado = idDeclarado(entrada);
  let medicamento = obtenerMedicamentoPorId(declarado);
  const texto = textoEntrada(entrada);
  if (!medicamento && texto) {
    const legacy = medicamentoPorTextoLegacy(texto) || buscarMedicamentosLegacy(texto, { limit: 1, strict: false, allowEmpty: false })[0];
    medicamento = legacy ? POR_ID.get(legacy.clinicalMedicationId || legacy.id) : null;
  }
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

/** Devuelve siempre la identidad clínica, nunca el id de una presentación. */
export function normalizarMedicamento(entrada) {
  const resuelto = resolverMedicamentoCanonico(entrada);
  if (resuelto) return resuelto.clinicalMedicationId;
  return normalizarPrincipioActivo(textoEntrada(entrada));
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

export function buscarCatalogoFarmacologico(query = "", opciones = {}) {
  return buscarMedicamentosLegacy(query, opciones)
    .map((medicamento) => POR_ID.get(medicamento.clinicalMedicationId || medicamento.id))
    .filter(Boolean);
}

// Adaptadores públicos históricos: conservan nombres y shapes sin duplicar datos.
export const MEDICAMENTOS = MEDICAMENTOS_LEGACY;
export const MEDICAMENTOS_MAESTROS = CATALOGO_FARMACOLOGICO_OFICIAL;
export const MEDICAMENTOS_PRESENTACIONES = Object.freeze(PRESENTACIONES_LEGACY.map((item) => {
  const medicamento = POR_ID.get(item.clinicalMedicationId || item.id);
  const presentacion = encontrarPresentacion(medicamento, item);
  return { ...item, ...medicamento, clinicalMedicationId: medicamento.id, selectedPresentationId: presentacion?.id || item.selectedPresentationId, selectedPresentationText: presentacion?.texto || item.selectedPresentationText };
}));
export const MEDICAMENTOS_AGRUPADOS_POR_CLASE = GRUPOS_LEGACY.map((grupo) => ({
  ...grupo,
  medicamentos: grupo.medicamentos.map((item) => POR_ID.get(item.id)).filter(Boolean)
}));
export const CATALOGO_FARMACOLOGICO_NORMALIZADO = { ...CATALOGO_NORMALIZADO_LEGACY, medicamentos: CATALOGO_FARMACOLOGICO_OFICIAL };
export { COBERTURA_FARMACOLOGICA, normalizarNombreMedicamento, textoMedicamentoParaBusqueda };
export const buscarMedicamentos = buscarCatalogoFarmacologico;
export function medicamentoPorTexto(texto = "") {
  return resolverMedicamentoCanonico(texto)?.medicamento || null;
}
