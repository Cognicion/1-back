/**
 * ADAPTADOR LEGACY DEL ANTIGUO SEED SUPLEMENTARIO.
 *
 * No contiene medicamentos propios. La selección se deriva del catálogo
 * maestro único y mantiene el export público para consumidores históricos.
 */
import { CATALOGO_FARMACOLOGICO_OFICIAL } from "./catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";

export const MEDICAMENTOS_SUPLEMENTARIOS = Object.freeze(
  CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) =>
    (medicamento.origenesCatalogo || []).includes("catalogo_suplementario")
  )
);
