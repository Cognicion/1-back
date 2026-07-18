export const EVOLUTION_NARRATIVE_INSTITUTIONAL_VERSION = "evolucion_narrativa_institucional_v1_2026-07-18";

export const EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE = Object.freeze({
  id: "evolucion_narrativa_institucional",
  label: "Evolución narrativa institucional",
  version: EVOLUTION_NARRATIVE_INSTITUTIONAL_VERSION,
  promptVersion: "voice_note_fray_aldo_evolucion_v2_2026-07-18",
  paragraphRange: [3, 5],
  openingPattern: "[PACIENTE], hombre/mujer de [EDAD] años, quien cursa su [DIA] día de estancia intrahospitalaria en el servicio especial de [SERVICIO] bajo el criterio de [CRITERIO].",
  fallbackOpening: "Durante la valoración",
  styleRules: [
    "Iniciar con nombre, sexo, edad, día de estancia, servicio y criterio clínico solo si están disponibles.",
    "Si no hay criterio documentado, usar bajo seguimiento por el problema clínico sustentado.",
    "Describir brevemente dónde y cómo fue abordado el paciente.",
    "Integrar actitud, cooperación y conducta general en una o dos oraciones.",
    "Desarrollar únicamente cambios y síntomas clínicamente relevantes.",
    "Usar párrafos narrativos continuos, tercera persona y lenguaje médico formal.",
    "Distinguir antecedentes de situación actual.",
    "Conservar negaciones, incertidumbre, temporalidad y procedencia.",
    "Cerrar con sueño, alimentación, diuresis, evacuaciones, síntomas físicos, efectos adversos y eventualidades médicas si fueron documentados."
  ],
  excludeFromEvolution: [
    "preguntas del entrevistador",
    "diálogo sin transformar",
    "instrucciones del profesional",
    "órdenes del plan",
    "análisis diagnóstico extenso",
    "examen mental completo",
    "alertas técnicas",
    "fragmentos truncados",
    "frases inconclusas"
  ],
  mentalStatusDomainsReservedForExam: [
    "atención",
    "memoria",
    "lenguaje",
    "curso formal del pensamiento",
    "afecto completo",
    "juicio",
    "introspección",
    "funciones cognitivas",
    "inteligencia"
  ],
  preferredPhrases: [
    "quien cursa su",
    "durante la valoración fue abordado",
    "aceptando la entrevista y mostrando adecuada cooperación",
    "al interrogatorio dirigido",
    "persiste verbalizando",
    "refiere disminución",
    "niega actualmente",
    "identifica como principal red de apoyo",
    "desde el punto de vista médico",
    "sin otras eventualidades médicas reportadas durante el turno"
  ],
  validation: {
    forbiddenPatterns: [
      "\\?",
      "\\bquiero preguntarle\\b",
      "\\bsabe aproximadamente\\b",
      "\\bvoy a resumir\\b",
      "\\bse mantendra\\b",
      "\\bcontinuar vigilancia\\b",
      "\\bcontinuar signos vitales\\b",
      "\\bcontinuar tratamiento farmacol[oó]gico\\b",
      "\\bsolicitar\\b",
      "\\bsignos vitales por turno\\b",
      "\\bjuicio\\b.*\\bintrospecci[oó]n\\b",
      "\\bSe detect[oó]\\b",
      "\\bConfirmar con\\b"
    ],
    maxParagraphs: 5,
    minNarrativeSentences: 3
  }
});

export function isEvolutionNarrativeStyle(styleId = "") {
  return [
    "evolucion_narrativa_institucional",
    "evolucion_narrativa",
    "institucional_psiquiatrico_detallado",
    "formato_fray_narrativo"
  ].includes(String(styleId || ""));
}

export function isEvolutionDocumentType(documentType = "") {
  return /evolucion|observacion/i.test(String(documentType || ""));
}
