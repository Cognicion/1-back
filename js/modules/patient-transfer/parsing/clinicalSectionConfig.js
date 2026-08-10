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
    "motiivo de ingreso",
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
    "examen neurológico",
    "examen neurologico",
    "objetivo"
  ],
  examenMental: ["exploración psicopatológica", "examen mental", "estado mental"],
  resultadosEstudios: [
    "resultados relevantes de los estudios de diagnóstico",
    "resultados relevantes de los estudios",
    "resultados de los estudios",
    "estudios de diagnóstico"
  ],
  analisis: [
    "comentario y/o análisis clínico y fundamentación diagnóstica y terapéutica",
    "comentario y análisis clínico y fundamentación diagnóstica y terapéutica",
    "fundamentación diagnóstica y terapéutica",
    "fundamento de diagnóstico y tratamiento",
    "fundamento diagnóstico y terapéutico",
    "comentario y análisis clínico",
    "análisis / comentario",
    "análisis clínico",
    "razonamiento clínico",
    "consideraciones clínicas",
    "consideraciones",
    "integración diagnóstica",
    "integración",
    "discusión clínica",
    "impresión clínica",
    "comentario clínico",
    "fundamento clínico",
    "valoración clínica",
    "juicio clínico",
    "valoración",
    "formulación",
    "comentario",
    "fundamento",
    "análisis"
  ],
  diagnosticos: [
    "diagnósticos de acuerdo a cie-10 (primario y comorbilidades)",
    "diagnósticos de acuerdo a cie-10",
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

// Títulos que cierran la sección activa sin crear un campo editable en revisión.
export const CLINICAL_BOUNDARY_ONLY_ALIASES = Object.freeze({
  firmas: [
    "nombre, firma y cédula profesional",
    "nombre, firma y cédula",
    "firma y cédula profesional",
    "firmas",
    "firma"
  ]
});

/**
 * Familias semánticas reutilizables para headings compuestos no enumerados como
 * alias completos. La política de desambiguación usa primero las secuencias
 * inequívocas y después el primer token nuclear que aparece en el título.
 */
export const CLINICAL_HEADING_SEMANTIC_FAMILIES = Object.freeze([
  Object.freeze({
    key: "resultadosEstudios",
    tokenSequences: Object.freeze([
      Object.freeze(["analisis", "de", "laboratorio"]),
      Object.freeze(["resultados", "de", "laboratorio"])
    ]),
    strongTokens: Object.freeze(["resultados", "estudios", "laboratorio", "gabinete"])
  }),
  Object.freeze({
    key: "diagnosticos",
    tokenSequences: Object.freeze([
      Object.freeze(["impresion", "diagnostica"]),
      Object.freeze(["diagnostico", "diferencial"])
    ]),
    strongTokens: Object.freeze(["diagnostico", "diagnosticos", "dx", "cie", "dsm"])
  }),
  Object.freeze({
    key: "analisis",
    tokenSequences: Object.freeze([
      Object.freeze(["integracion", "diagnostica"]),
      Object.freeze(["juicio", "clinico"]),
      Object.freeze(["razonamiento", "clinico"])
    ]),
    strongTokens: Object.freeze([
      "analisis",
      "comentario",
      "fundamento",
      "fundamentacion",
      "justificacion",
      "impresion",
      "juicio",
      "valoracion",
      "consideraciones",
      "integracion",
      "discusion",
      "razonamiento",
      "formulacion"
    ])
  }),
  Object.freeze({
    key: "plan",
    tokenSequences: Object.freeze([]),
    strongTokens: Object.freeze(["plan", "conducta", "manejo", "indicaciones"])
  }),
  Object.freeze({
    key: "tratamiento",
    tokenSequences: Object.freeze([]),
    strongTokens: Object.freeze(["tratamiento", "terapeutica"])
  }),
  Object.freeze({
    key: "medicamentos",
    tokenSequences: Object.freeze([]),
    strongTokens: Object.freeze(["medicamentos", "medicacion", "farmacologico"])
  }),
  Object.freeze({
    key: "pronostico",
    tokenSequences: Object.freeze([]),
    strongTokens: Object.freeze(["pronostico"])
  }),
  Object.freeze({
    key: "destino",
    tokenSequences: Object.freeze([]),
    strongTokens: Object.freeze(["destino"])
  }),
  Object.freeze({
    key: "firmas",
    boundaryOnly: true,
    tokenSequences: Object.freeze([
      Object.freeze(["nombre", "firma", "y", "cedula"]),
      Object.freeze(["firma", "y", "cedula"])
    ]),
    strongTokens: Object.freeze(["firmas", "firma"])
  })
]);

// Nombres conceptuales -> claves públicas históricas consumidas por el modelo de revisión.
export const CORE_CLINICAL_SECTION_KEYS = Object.freeze({
  subjective: "subjetivo",
  physicalExam: "physicalNeurologicalExam",
  mentalExam: "examenMental",
  analysis: "analisis",
  diagnoses: "diagnosticos",
  plan: "plan"
});
