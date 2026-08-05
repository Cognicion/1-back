export const CLINICAL_SECTION_ALIASES = Object.freeze({
  subjetivo: [
    "motivo de atención / actualización del cuadro clínico",
    "motivo de atención/actualización del cuadro clínico",
    "subjetivo / padecimiento actual",
    "subjetivo / evolución",
    "actualización del cuadro clínico",
    "motivo de la atención",
    "padecimiento actual",
    "motivo de atención",
    "motivo de consulta",
    "motivo de ingreso",
    "enfermedad actual",
    "interrogatorio",
    "evolución",
    "subjetivo"
  ],
  physicalNeurologicalExam: [
    "objetivo / exploración física",
    "exploración física y neurológica",
    "exploración física / neurológica",
    "exploración neurológica",
    "exploración física",
    "examen físico",
    "objetivo"
  ],
  examenMental: ["exploración psicopatológica", "examen mental", "estado mental"],
  analisis: [
    "comentario y/o análisis clínico y fundamentación diagnóstica y terapéutica",
    "comentario y análisis clínico y fundamentación diagnóstica y terapéutica",
    "fundamentación diagnóstica y terapéutica",
    "fundamento de diagnóstico y tratamiento",
    "fundamento diagnóstico y terapéutico",
    "comentario y análisis clínico",
    "consideraciones clínicas",
    "integración diagnóstica",
    "discusión clínica",
    "impresión clínica",
    "comentario clínico",
    "valoración",
    "formulación",
    "comentario",
    "análisis"
  ],
  diagnosticos: [
    "diagnóstico | cie-10",
    "diagnósticos | cie-10",
    "diagnósticos de ingreso",
    "diagnósticos de egreso",
    "impresión diagnóstica",
    "diagnósticos",
    "diagnóstico",
    "dx"
  ],
  tratamiento: ["tratamiento farmacológico", "tratamiento actual", "tratamiento"],
  medicamentos: ["esquema farmacológico", "medicación actual", "medicamentos", "medicación"],
  plan: [
    "plan terapéutico (medidas generales y tratamiento farmacológico)",
    "plan terapéutico",
    "plan de manejo",
    "indicaciones",
    "manejo",
    "plan"
  ],
  pronostico: ["pronóstico"],
  destino: ["destino"]
});

export const NOTE_START_ALIASES = Object.freeze([
  "nota de evolución al servicio de observación",
  "nota de ingreso al servicio de observación",
  "nota de evolución",
  "nota de ingreso",
  "nota de egreso",
  "nota de urgencias",
  "historia clínica",
  "interconsulta"
]);

export const CLINICAL_SECTION_KEYS = Object.freeze(Object.keys(CLINICAL_SECTION_ALIASES));

// Límites reutilizados por los extractores que deben terminar antes de otra sección clínica.
export const MENTAL_EXAM_BOUNDARY_ALIASES = Object.freeze([
  "resultados relevantes de los estudios de diagnostico",
  "resultados relevantes de los estudios",
  "resultados de los estudios",
  "estudios de diagnostico",
  "diagnosticos de acuerdo a cie-10",
  "diagnostico cie-10",
  "diagnostico",
  "plan terapeutico",
  "tratamiento farmacologico",
  "comentario y/o analisis",
  "analisis clinico",
  "pronostico",
  "destino",
  "nota de evolucion",
  "nota de ingreso"
]);
