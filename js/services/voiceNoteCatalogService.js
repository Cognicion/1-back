import {
  EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE,
  EVOLUTION_NARRATIVE_INSTITUTIONAL_VERSION
} from "./voiceNoteStyleTemplates.js";

export const VOICE_NOTE_CATALOG_VERSION = "voice_note_catalog_v1_2026-07-18";
export const VOICE_NOTE_STYLE_CATALOG_VERSION = "voice_note_style_catalog_v1_2026-07-18";

const SOAP_FIELD_KEYS = Object.freeze([
  "evolutionOrSubjective",
  "physicalNeurologicalExam",
  "mentalStatusExam",
  "analysis",
  "plan"
]);

export const VOICE_NOTE_TYPE_CATALOG = Object.freeze([
  {
    id: "ingreso_observacion",
    label: "Ingreso a Observación",
    shortLabel: "Ingreso",
    templateId: "observacion_ingreso_fray",
    destinationFields: ["evolutionOrSubjective", "physicalNeurologicalExam", "mentalStatusExam", "results", "analysis", "plan"],
    compatibleServices: ["observacion", "observación", "urgencias"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Padecimiento actual", "Exploración física y neurológica", "Examen mental", "Análisis", "Plan"],
    description: "Padecimiento actual cronológico, EEM ordenado, comentario clínico y plan de ingreso."
  },
  {
    id: "evolucion_observacion",
    label: "Evolución de Observación",
    shortLabel: "Evolución",
    templateId: "observacion_evolucion_fray",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["observacion", "observación", "hospitalizacion", "hospitalización"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Evolución", "Exploración física y neurológica", "Examen mental", "Comentario y análisis", "Plan"],
    description: "Evolución intrahospitalaria sin repetir el ingreso, con riesgo y destino integrados."
  },
  {
    id: "egreso_traslado_observacion",
    label: "Egreso/traslado de Observación",
    shortLabel: "Egreso/traslado",
    templateId: "observacion_egreso",
    destinationFields: ["evolutionOrSubjective", "mentalStatusExam", "analysis", "plan"],
    compatibleServices: ["observacion", "observación", "ucep", "urgencias"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Evolución global", "Estado actual", "Análisis", "Plan y destino"],
    description: "Síntesis de evolución, respuesta, riesgo residual, recomendaciones y destino."
  },
  {
    id: "ingreso_ucep",
    label: "Ingreso a UCEP",
    shortLabel: "Ingreso UCEP",
    templateId: "ucep_ingreso",
    destinationFields: ["evolutionOrSubjective", "physicalNeurologicalExam", "mentalStatusExam", "results", "analysis", "plan"],
    compatibleServices: ["ucep", "urgencias"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Procedencia", "Condición de traslado", "Examen mental", "Análisis", "Plan"],
    description: "Integra procedencia, lesiones, traslado, comorbilidad, sedación, riesgos y manejo inicial."
  },
  {
    id: "evolucion_ucep",
    label: "Evolución de UCEP",
    shortLabel: "Evolución UCEP",
    templateId: "ucep_evolucion",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["ucep"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Evolución UCEP", "Examen mental", "Comentario y análisis", "Plan"],
    description: "Evolución de unidad especializada con comorbilidades, riesgos, respuesta y destino."
  },
  {
    id: "urgencias",
    label: "Urgencias",
    shortLabel: "Urgencias",
    templateId: "urgencias_psiquiatria",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["urgencias", "observacion", "observación"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Motivo", "Exploración", "Examen mental", "Análisis de riesgo", "Plan"],
    description: "Priorización de motivo, riesgo, agitación, psicosis, intervención, criterio y destino."
  },
  {
    id: "referencia_navarro",
    label: "Referencia tipo Navarro",
    shortLabel: "Referencia",
    templateId: "referencia_navarro",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["urgencias", "interconsulta", "consulta externa", "observacion", "observación"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Identificación", "Motivo", "Examen mental", "Impresión", "Recomendaciones"],
    description: "Referencia breve pero suficiente, con unidad de origen/destino, riesgo y recomendaciones."
  },
  {
    id: "contrarreferencia",
    label: "Contrarreferencia",
    shortLabel: "Contrarreferencia",
    templateId: "contrarreferencia_psiquiatria",
    destinationFields: ["evolutionOrSubjective", "analysis", "plan"],
    compatibleServices: ["consulta externa", "interconsulta", "urgencias", "observacion", "observación"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Resumen clínico", "Manejo realizado", "Recomendaciones", "Destino"],
    description: "Resumen institucional para continuidad de atención."
  },
  {
    id: "consulta_externa",
    label: "Consulta externa",
    shortLabel: "Consulta",
    templateId: "consulta_externa_psiquiatria",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["consulta externa", "interconsulta", "ambulatorio"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Padecimiento actual", "Examen mental", "Comentario", "Plan"],
    description: "Valoración ambulatoria con redacción narrativa y plan de seguimiento."
  },
  {
    id: "pediatria",
    label: "Pediatría",
    shortLabel: "Pediatría",
    templateId: "pediatria_psiquiatria",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["pediatria", "pediatría", "paidopsiquiatria", "paidopsiquiatría"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Informantes", "Padecimiento", "Examen mental", "Análisis", "Plan"],
    description: "Nota pediátrica con informantes, desarrollo, cuidadores, escuela, riesgo y plan."
  },
  {
    id: "paidopsiquiatria",
    label: "Paidopsiquiatría",
    shortLabel: "Paidopsiquiatría",
    templateId: "paidopsiquiatria_fray",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["paidopsiquiatria", "paidopsiquiatría", "pediatria", "pediatría"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Informantes", "Padecimiento", "Examen mental", "Comentario", "Plan"],
    description: "Valoración paidopsiquiátrica con diferenciación de informantes y datos observados."
  },
  {
    id: "dictado_libre",
    label: "Dictado libre",
    shortLabel: "Libre",
    templateId: "dictado_libre_soap",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Apartados detectados", "Exploración", "Examen mental", "Análisis", "Plan"],
    description: "Organiza el dictado en apartados SOAP sin crear campos nuevos."
  },
  {
    id: "solo_transcripcion",
    label: "Solo transcripción",
    shortLabel: "Transcripción",
    templateId: "solo_transcripcion",
    destinationFields: [],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Transcripción íntegra"],
    description: "Conserva la transcripción sin generar nota clínica."
  },
  {
    id: "nota_completa",
    label: "Nota completa",
    shortLabel: "Completa",
    templateId: "cognicion_completa",
    destinationFields: ["evolutionOrSubjective", "physicalNeurologicalExam", "mentalStatusExam", "results", "analysis", "plan"],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Subjetivo", "Objetivo", "Análisis", "Plan"],
    description: "Fallback general para expedientes sin servicio definido."
  }
]);

export const VOICE_NOTE_STYLE_CATALOG = Object.freeze([
  {
    id: "evolucion_narrativa_institucional",
    label: "Evolución narrativa institucional",
    description: "Evolución Fray selectiva, narrativa, intrahospitalaria, sin interrogatorio reconstruido ni examen mental completo.",
    promptVersion: EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE.promptVersion,
    templateVersion: EVOLUTION_NARRATIVE_INSTITUTIONAL_VERSION,
    compatibleTypes: ["evolucion_observacion", "evolucion_ucep", "observacion"],
    rules: EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE.styleRules
  },
  {
    id: "institucional_psiquiatrico_detallado",
    label: "Institucional psiquiátrico detallado",
    legacyIds: ["formato_fray_narrativo"],
    description: "Formato Fray narrativo institucional, detallado, cronológico y sin repeticiones.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["*"],
    rules: ["tercera persona", "sin inventar datos", "conservar negaciones", "examen mental solo con datos disponibles"]
  },
  {
    id: "formato_fray_narrativo",
    label: "Formato Fray - narrativo institucional",
    aliasOf: "institucional_psiquiatrico_detallado",
    description: "Alias compatible del estilo institucional psiquiátrico detallado.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["*"],
    rules: ["tercera persona", "cronológico", "sin repeticiones"]
  },
  {
    id: "clinico_detallado",
    label: "Clínico detallado",
    description: "Redacción clínica amplia, con apartados completos y análisis prudente.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["*"],
    rules: ["detalle suficiente", "comentario analítico", "plan independiente"]
  },
  {
    id: "clinico_resumido",
    label: "Clínico resumido",
    description: "Síntesis clínica breve sin omitir riesgo ni plan confirmado.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["urgencias", "referencia_navarro", "contrarreferencia", "dictado_libre", "nota_completa"],
    rules: ["breve", "riesgo explícito", "sin listas técnicas"]
  },
  {
    id: "conservador_literal",
    label: "Conservador literal",
    description: "Parafraseo mínimo, cauteloso y basado estrictamente en evidencia del dictado.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["*"],
    rules: ["no inferir", "diferenciar hipótesis", "marcar incertidumbre"]
  },
  {
    id: "urgencias_referencia_breve",
    label: "Urgencias/referencia breve",
    description: "Prioriza motivo, riesgo, intervención y destino.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["urgencias", "referencia_navarro", "contrarreferencia"],
    rules: ["unidad origen/destino", "motivo", "riesgo", "recomendaciones"]
  },
  {
    id: "personalizado",
    label: "Personalizado",
    description: "Permite ajustes posteriores del profesional sin cambiar el esquema SOAP.",
    promptVersion: "voice_note_fray_aldo_v1_2026-07-18",
    compatibleTypes: ["*"],
    rules: ["revisión profesional obligatoria"]
  }
]);

function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function noteTypeOptions() {
  return VOICE_NOTE_TYPE_CATALOG.filter((item) => item.enabled).map((item) => [item.id, item.label]);
}

export function writingStyleOptions() {
  return VOICE_NOTE_STYLE_CATALOG.map((item) => [item.id, item.label]);
}

export function getVoiceNoteTypesForService(service = "") {
  const normalized = normalizar(service);
  if (!normalized) return VOICE_NOTE_TYPE_CATALOG.filter((item) => item.enabled);
  const matches = VOICE_NOTE_TYPE_CATALOG.filter((item) => {
    if (!item.enabled) return false;
    if (item.compatibleServices.includes("*")) return true;
    return item.compatibleServices.some((candidate) => normalized.includes(normalizar(candidate)));
  });
  return matches.length ? matches : VOICE_NOTE_TYPE_CATALOG.filter((item) => item.enabled);
}

export function getDefaultVoiceNoteType(service = "") {
  const normalized = normalizar(service);
  if (normalized.includes("paidopsiquiatr")) return "paidopsiquiatria";
  if (normalized.includes("pediatr")) return "pediatria";
  if (normalized.includes("ucep")) return "evolucion_ucep";
  if (normalized.includes("urgencia")) return "urgencias";
  if (normalized.includes("observacion")) return "evolucion_observacion";
  if (normalized.includes("consulta")) return "consulta_externa";
  return "nota_completa";
}

export function getCompatibleVoiceStyles(typeId = "") {
  const matches = VOICE_NOTE_STYLE_CATALOG.filter((style) =>
    style.compatibleTypes.includes("*") || style.compatibleTypes.includes(typeId)
  );
  return matches.length ? matches : VOICE_NOTE_STYLE_CATALOG;
}

export function getDefaultVoiceStyle(typeId = "") {
  const compatible = getCompatibleVoiceStyles(typeId);
  if (/evolucion/i.test(typeId) && compatible.some((style) => style.id === "evolucion_narrativa_institucional")) {
    return "evolucion_narrativa_institucional";
  }
  return compatible.some((style) => style.id === "institucional_psiquiatrico_detallado")
    ? "institucional_psiquiatrico_detallado"
    : compatible[0]?.id || "institucional_psiquiatrico_detallado";
}

export function getVoiceNoteType(typeId = "") {
  return VOICE_NOTE_TYPE_CATALOG.find((item) => item.id === typeId) || null;
}

export function getVoiceNoteStyle(styleId = "") {
  return VOICE_NOTE_STYLE_CATALOG.find((item) => item.id === styleId || item.legacyIds?.includes(styleId)) || null;
}
