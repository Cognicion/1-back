/**
 * ADAPTADOR LEGACY DE DOSIFICACION PEDIATRICA.
 *
 * Mantiene MEDICAMENTOS_PEDIATRICOS y el calculador existente sin conservar
 * una segunda lista farmacologica. Los datos proceden del catalogo maestro.
 */
import { normalizarConcentracionMgMl, normalizarPesoKg } from "./formulas.js";
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  normalizarMedicamento
} from "../data/catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";

export const MEDICAMENTOS_PEDIATRICOS = Object.freeze(
  CATALOGO_FARMACOLOGICO_OFICIAL
    .filter((medicamento) => medicamento.pediatria?.legacy)
    .sort((a, b) => (a.pediatria.legacyOrder ?? 999) - (b.pediatria.legacyOrder ?? 999))
    .map((medicamento) => Object.freeze({
      ...medicamento.pediatria.legacy,
      clinicalMedicationId: medicamento.id,
      medicationId: medicamento.id
    }))
);

export function calcularDosisMedicamento({ medicamentoId, opcionIndice = 0, pesoKg, concentracionMgMl, pesoConfirmado = false }) {
  const clinicalMedicationId = normalizarMedicamento(medicamentoId);
  const medicamento = MEDICAMENTOS_PEDIATRICOS.find((item) =>
    item.id === medicamentoId || item.clinicalMedicationId === clinicalMedicationId
  );
  const peso = normalizarPesoKg(pesoKg);
  if (!medicamento) return { error: "Selecciona un medicamento." };
  if (!peso || peso <= 0) return { error: "Registra un peso actual en kg." };
  if (!pesoConfirmado) return { error: "Confirma que el peso usado es actual antes de calcular dosis." };

  const opcion = medicamento.opciones[Number(opcionIndice)] || medicamento.opciones[0];
  const advertencias = [];
  let mgDosis = opcion.mgKgDosis ? opcion.mgKgDosis * peso : (opcion.mgKgDia * peso) / (opcion.frecuenciaDia || 1);
  let mgDia = mgDosis * (opcion.frecuenciaDia || 1);

  const mgDiaCalculado = mgDia;
  if (opcion.maxMgKgDia) {
    const maximoPorPeso = opcion.maxMgKgDia * peso;
    if (mgDia > maximoPorPeso) {
      advertencias.push(`Se aplicó máximo por peso: ${maximoPorPeso.toFixed(2)} mg/día.`);
      mgDia = maximoPorPeso;
    }
  }
  if (opcion.maxMgDia && mgDia > opcion.maxMgDia) {
    advertencias.push(`Se aplicó máximo diario absoluto: ${opcion.maxMgDia} mg/día.`);
    mgDia = opcion.maxMgDia;
  }
  if (opcion.mgKgDia || opcion.maxMgKgDia || opcion.maxMgDia) {
    mgDosis = mgDia / (opcion.frecuenciaDia || 1);
  }

  const concentracion = normalizarConcentracionMgMl(concentracionMgMl);
  return {
    medicamento,
    opcion,
    mgDosis,
    mgDia,
    mgDiaCalculado,
    advertencias,
    volumenMlDosis: concentracion ? mgDosis / concentracion : null,
    frecuenciaDia: opcion.frecuenciaDia || 1
  };
}
