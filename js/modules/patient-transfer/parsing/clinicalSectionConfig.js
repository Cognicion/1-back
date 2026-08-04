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
  objetivo: [
    "objetivo / exploración física",
    "exploración física y neurológica",
    "resultados de estudios diagnósticos",
    "exploración neurológica",
    "exploración física",
    "resultados de estudios",
    "examen físico",
    "signos vitales",
    "somatometría",
    "laboratorios",
    "objetivo"
  ],
  examenMental: ["exploración psicopatológica", "examen mental", "estado mental"],
  analisis: [
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
    "diagnósticos de ingreso",
    "diagnósticos de egreso",
    "impresión diagnóstica",
    "diagnósticos",
    "diagnóstico",
    "dx"
  ],
  tratamiento: [
    "tratamiento farmacológico",
    "tratamiento actual",
    "tratamiento"
  ],
  medicamentos: [
    "esquema farmacológico",
    "medicación actual",
    "medicamentos",
    "medicación"
  ],
  plan: ["plan terapéutico", "plan de manejo", "indicaciones", "manejo", "plan"],
  pronostico: ["pronóstico"],
  destino: ["destino"]
});

export const NOTE_START_ALIASES = Object.freeze([
  "nota de evolución",
  "nota de ingreso",
  "nota de egreso",
  "nota de urgencias",
  "historia clínica",
  "interconsulta"
]);

export const CLINICAL_SECTION_KEYS = Object.freeze(Object.keys(CLINICAL_SECTION_ALIASES));
