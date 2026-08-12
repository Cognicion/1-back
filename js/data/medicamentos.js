/**
 * ADAPTADOR LEGACY.
 *
 * La única fuente de verdad farmacológica es
 * catalogoFarmacologicoUnificado.js. Este archivo conserva los nombres
 * públicos históricos para no romper consumidores existentes.
 */
export {
  CATALOGO_FARMACOLOGICO_NORMALIZADO,
  COBERTURA_FARMACOLOGICA,
  MEDICAMENTOS,
  MEDICAMENTOS_AGRUPADOS_POR_CLASE,
  MEDICAMENTOS_MAESTROS,
  MEDICAMENTOS_PRESENTACIONES,
  buscarMedicamentos,
  medicamentoPorTexto,
  normalizarNombreMedicamento,
  textoMedicamentoParaBusqueda
} from "./catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";
