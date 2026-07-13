import { numero } from "./formulas.js";

export const MEDICAMENTOS_PEDIATRICOS = [
  {
    id: "paracetamol",
    nombre: "Paracetamol / acetaminofen",
    categoria: "Analgesico / antipiretico",
    opciones: [{ etiqueta: "10-15 mg/kg/dosis cada 4-6 h", mgKgDosis: 15, frecuenciaDia: 4, maxMgKgDia: 75, maxMgDia: 4000 }],
    fuente: "Dosis comun en referencias pediatricas; validar con guia local."
  },
  {
    id: "ibuprofeno",
    nombre: "Ibuprofeno",
    categoria: "AINE",
    opciones: [{ etiqueta: "5-10 mg/kg/dosis cada 6-8 h", mgKgDosis: 10, frecuenciaDia: 3, maxMgKgDia: 40, maxMgDia: 2400 }],
    advertencia: "Evitar en deshidratacion, enfermedad renal o lactantes pequenos sin indicacion clinica.",
    fuente: "Dosis comun en referencias pediatricas; validar con guia local."
  },
  {
    id: "amoxicilina",
    nombre: "Amoxicilina",
    categoria: "Antibiotico",
    opciones: [
      { etiqueta: "40 mg/kg/dia dividido cada 8-12 h", mgKgDia: 40, frecuenciaDia: 2, maxMgDia: 4000 },
      { etiqueta: "80-90 mg/kg/dia dividido cada 12 h", mgKgDia: 90, frecuenciaDia: 2, maxMgDia: 4000 }
    ],
    fuente: "Rangos clinicos habituales; ajustar por indicacion, foco, funcion renal y guia local."
  },
  {
    id: "ceftriaxona",
    nombre: "Ceftriaxona",
    categoria: "Antibiotico",
    opciones: [{ etiqueta: "50-75 mg/kg/dia cada 24 h", mgKgDia: 75, frecuenciaDia: 1, maxMgDia: 2000 }],
    advertencia: "Precaucion en neonatos, hiperbilirrubinemia y uso con calcio IV.",
    fuente: "Rangos clinicos habituales; validar con guia institucional."
  },
  {
    id: "ondansetron",
    nombre: "Ondansetron",
    categoria: "Antiemetico",
    opciones: [{ etiqueta: "0.15 mg/kg/dosis", mgKgDosis: 0.15, frecuenciaDia: 1, maxMgDia: 8 }],
    fuente: "Rango habitual; considerar QT, interacciones y contexto clinico."
  },
  {
    id: "lorazepam",
    nombre: "Lorazepam",
    categoria: "Benzodiacepina",
    opciones: [{ etiqueta: "0.05-0.1 mg/kg/dosis", mgKgDosis: 0.05, frecuenciaDia: 1, maxMgDia: 4 }],
    advertencia: "Uso bajo supervision clinica; vigilar depresion respiratoria y sedacion.",
    fuente: "Rango educativo inicial; ajustar a indicacion y protocolo."
  }
];

export function calcularDosisMedicamento({ medicamentoId, opcionIndice = 0, pesoKg, concentracionMgMl, pesoConfirmado = false }) {
  const medicamento = MEDICAMENTOS_PEDIATRICOS.find((item) => item.id === medicamentoId);
  const peso = numero(pesoKg);
  if (!medicamento) return { error: "Selecciona un medicamento." };
  if (!peso || peso <= 0) return { error: "Registra un peso actual en kg." };
  if (!pesoConfirmado) return { error: "Confirma que el peso usado es actual antes de calcular dosis." };

  const opcion = medicamento.opciones[Number(opcionIndice)] || medicamento.opciones[0];
  let mgDosis = opcion.mgKgDosis ? opcion.mgKgDosis * peso : (opcion.mgKgDia * peso) / (opcion.frecuenciaDia || 1);
  let mgDia = mgDosis * (opcion.frecuenciaDia || 1);

  if (opcion.maxMgKgDia) mgDia = Math.min(mgDia, opcion.maxMgKgDia * peso);
  if (opcion.maxMgDia) mgDia = Math.min(mgDia, opcion.maxMgDia);
  if (opcion.mgKgDia || opcion.maxMgKgDia || opcion.maxMgDia) {
    mgDosis = mgDia / (opcion.frecuenciaDia || 1);
  }

  const concentracion = numero(concentracionMgMl);
  return {
    medicamento,
    opcion,
    mgDosis,
    mgDia,
    volumenMlDosis: concentracion ? mgDosis / concentracion : null,
    frecuenciaDia: opcion.frecuenciaDia || 1
  };
}
