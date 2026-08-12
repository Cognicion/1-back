/**
 * ADAPTADOR LEGACY DE FARMACOLOGÍA.
 *
 * Las fichas y propiedades viven exclusivamente en
 * catalogoFarmacologicoUnificado.js. Este módulo conserva la API previa.
 */
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  medicamentoPorTexto,
  obtenerMedicamentoPorId
} from "./catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";

export const DATO_NO_ENCONTRADO = "dato no encontrado en fuente local";
export const FUENTE_PENDIENTE = "fuente pendiente";
export const FUENTE_STAHL = Object.freeze({
  id: "stahl_prescribers_guide_6e_2017",
  titulo: "Stahl's Essential Psychopharmacology: Prescriber's Guide, 6th ed.",
  autores: "Stephen M. Stahl",
  editorial: "Cambridge University Press",
  anio: 2017,
  rutaLocal: "fuentes_farmacologicas/stahl_prescribers_guide.pdf"
});

function fichaDesdeMedicamento(medicamento = {}) {
  const datos = medicamento.datosClinicos || {};
  const cinetica = medicamento.farmacocinetica || {};
  if (medicamento.farmacologia && medicamento.farmacologia.estadoFuente === "verificada_local") {
    return medicamento.farmacologia;
  }
  return {
    esquema: "cognicion.farmacologia.v1",
    id: medicamento.id,
    nombreGenerico: medicamento.genericName || medicamento.nombre,
    grupoFarmacologico: medicamento.clasePrincipal,
    claseFarmacologica: medicamento.clasePrincipal,
    subclase: medicamento.clases?.[1] || "",
    nombresComerciales: medicamento.marcas || [],
    sinonimos: medicamento.sinonimos || [],
    presentaciones: (medicamento.presentaciones || []).map((presentacion) => ({
      id: presentacion.id,
      formaFarmaceutica: presentacion.forma,
      concentracion: presentacion.concentracion,
      unidad: "",
      via: presentacion.via,
      fuente: presentacion.fuente
    })),
    mecanismoAccion: cinetica.mecanismoAccion || DATO_NO_ENCONTRADO,
    indicaciones: datos.indicaciones || [],
    dosisHabitual: medicamento.dosisHabitual || DATO_NO_ENCONTRADO,
    vidaMedia: cinetica.vidaMedia || DATO_NO_ENCONTRADO,
    metabolismo: cinetica.metabolismo || DATO_NO_ENCONTRADO,
    cyp: cinetica.cyp || [],
    viaEliminacion: cinetica.eliminacion || DATO_NO_ENCONTRADO,
    metabolitosActivos: cinetica.metabolitosActivos || [],
    contraindicacionesAbsolutas: datos.contraindicaciones || [],
    precauciones: datos.precauciones || [],
    interaccionesMedicamento: medicamento.interacciones || [],
    interaccionesDiagnostico: medicamento.relacionDiagnosticos || [],
    efectosAdversos: medicamento.efectosAdversos || [],
    vigilancia: datos.monitorizacion || [],
    fuentes: medicamento.referencias || [],
    estadoFuente: medicamento.estadoFuente || FUENTE_PENDIENTE,
    confianza: medicamento.confianza || "no evaluada"
  };
}

export const FARMACOLOGIA_VERIFICADA = Object.freeze(Object.fromEntries(
  CATALOGO_FARMACOLOGICO_OFICIAL
    .filter((medicamento) => medicamento.estadoFuente === "verificada_local")
    .map((medicamento) => [medicamento.id, fichaDesdeMedicamento(medicamento)])
));

export function enriquecerFarmacologiaUnificada(medicamento = {}) {
  const canonico = obtenerMedicamentoPorId(medicamento.id)
    || medicamentoPorTexto(medicamento.genericName || medicamento.nombre || "");
  return canonico ? { ...medicamento, ...canonico } : medicamento;
}

export function construirCapaFarmacologicaUnificada(medicamentos = []) {
  return medicamentos.map(enriquecerFarmacologiaUnificada);
}

export function resumirCoberturaFarmacologica(medicamentos = []) {
  const totalNormalizados = medicamentos.length;
  const verificados = medicamentos.filter((medicamento) => medicamento.estadoFuente === "verificada_local");
  return {
    totalNormalizados,
    conFuenteVerificada: verificados.length,
    datosCompletos: verificados.filter((medicamento) => medicamento.presentaciones?.length).length,
    fuentePendiente: totalNormalizados - verificados.length,
    idsVerificados: verificados.map((medicamento) => medicamento.id)
  };
}
