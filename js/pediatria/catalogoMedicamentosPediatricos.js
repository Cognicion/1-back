/**
 * ADAPTADOR PEDIATRICO DEL CATALOGO FARMACOLOGICO MAESTRO.
 *
 * Conserva el contrato historico de la prescripcion pediatrica. Las fichas,
 * dosis y presentaciones comerciales viven en catalogoFarmacologicoUnificado.js.
 */
import { CATALOGO_FARMACOLOGICO_OFICIAL } from "../data/catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";

export const CATALOGO_MEDICAMENTOS_PEDIATRICOS = Object.freeze(
  CATALOGO_FARMACOLOGICO_OFICIAL
    .filter((medicamento) => medicamento.pediatria?.ficha)
    .sort((a, b) => (a.pediatria.catalogOrder ?? 999) - (b.pediatria.catalogOrder ?? 999))
    .map((medicamento) => Object.freeze({
      ...medicamento.pediatria.ficha,
      medicationId: medicamento.id
    }))
);
