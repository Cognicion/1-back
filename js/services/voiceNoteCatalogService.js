import {
  EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE,
  EVOLUTION_NARRATIVE_INSTITUTIONAL_VERSION
} from "./voiceNoteStyleTemplates.js";
import {
  FRAY_FORMAT_IDS,
  NAVARRO_FORMAT_IDS,
  FORMAT_PERMISSION_FRAY,
  FORMAT_PERMISSION_NAVARRO,
  resolverFormatoClinico,
  usuarioPuedeUsarFormato
} from "./formatosInstitucionales.js";
import { resolverEntitlementsMembresia } from "./subscriptionEntitlementService.js";

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
  },
  {
    id: "nota_breve",
    label: "Nota breve",
    shortLabel: "Breve",
    templateId: "general_brief_note",
    destinationFields: ["evolutionOrSubjective", "mentalStatusExam", "analysis", "plan"],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Motivo o evolucion breve", "Hallazgos relevantes", "Impresion clinica", "Plan breve"],
    description: "Nota concisa propia; no es una nota completa truncada."
  },
  {
    id: "nota_personalizable",
    label: "Nota personalizable - Beneficio PRO",
    shortLabel: "Personalizable",
    templateId: "custom_note_builder",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    requiresSubscription: "pro",
    sections: ["Apartados configurables"],
    description: "Nota construida desde estilos personalizados disponibles para usuarios PRO."
  },
  {
    id: "ingreso_general",
    label: "Nota de ingreso general",
    shortLabel: "Ingreso general",
    templateId: "general_admission_note",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Padecimiento", "Objetivo", "Analisis", "Plan"],
    description: "Ingreso general sin branding institucional."
  },
  {
    id: "evolucion_general",
    label: "Nota de evolucion general",
    shortLabel: "Evolucion general",
    templateId: "general_evolution_note",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Evolucion", "Examen mental", "Analisis", "Plan"],
    description: "Evolucion general para usuarios sin formatos institucionales."
  },
  {
    id: "urgencias_general",
    label: "Nota de urgencias general",
    shortLabel: "Urgencias general",
    templateId: "general_emergency_note",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["urgencias", "*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Motivo", "Riesgo", "Impresion", "Plan"],
    description: "Urgencias general sin formato institucional Fray."
  },
  {
    id: "interconsulta_general",
    label: "Nota de interconsulta general",
    shortLabel: "Interconsulta",
    templateId: "general_consultation_liaison_note",
    destinationFields: SOAP_FIELD_KEYS,
    compatibleServices: ["interconsulta", "*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Motivo", "Valoracion", "Analisis", "Recomendaciones"],
    description: "Interconsulta general."
  },
  {
    id: "egreso_general",
    label: "Nota de egreso general",
    shortLabel: "Egreso general",
    templateId: "general_discharge_note",
    destinationFields: ["evolutionOrSubjective", "analysis", "plan"],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Evolucion global", "Estado actual", "Recomendaciones", "Destino"],
    description: "Egreso general sin plantilla institucional."
  },
  {
    id: "referencia_general",
    label: "Referencia general",
    shortLabel: "Referencia general",
    templateId: "general_referral_note",
    destinationFields: ["evolutionOrSubjective", "analysis", "plan"],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Motivo", "Resumen", "Impresion", "Recomendaciones"],
    description: "Referencia general no Navarro."
  },
  {
    id: "contrarreferencia_general",
    label: "Contrarreferencia general",
    shortLabel: "Contrarreferencia general",
    templateId: "general_counter_referral_note",
    destinationFields: ["evolutionOrSubjective", "analysis", "plan"],
    compatibleServices: ["*"],
    version: VOICE_NOTE_CATALOG_VERSION,
    enabled: true,
    sections: ["Resumen", "Manejo", "Recomendaciones", "Destino"],
    description: "Contrarreferencia general no Fray."
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

const COMPOSED_STYLE_PRESETS = Object.freeze([
  ["psychiatry_institutional_detailed", "Psiquiatria institucional detallada", "psychiatry", "institutional_inpatient", "in_person", "detailed_clinical"],
  ["psychiatry_institutional_summary", "Psiquiatria institucional resumida", "psychiatry", "institutional_inpatient", "in_person", "concise_clinical"],
  ["psychiatry_private_in_person", "Consulta psiquiatrica privada presencial", "psychiatry", "private_practice", "in_person", "private_narrative"],
  ["psychiatry_private_video", "Consulta psiquiatrica privada virtual", "psychiatry", "private_practice", "video", "private_narrative"],
  ["psychiatry_private_phone", "Consulta psiquiatrica privada telefonica", "psychiatry", "private_practice", "telephone", "concise_clinical"],
  ["psychiatry_emergency", "Urgencias psiquiatricas", "psychiatry", "emergency", "in_person", "concise_clinical"],
  ["psychiatry_liaison", "Interconsulta psiquiatrica", "psychiatry", "consultation_liaison", "in_person", "institutional_narrative"],
  ["psychiatry_outpatient_followup", "Seguimiento psiquiatrico ambulatorio", "psychiatry", "institutional_outpatient", "in_person", "detailed_clinical"],
  ["cap_institutional", "Paidopsiquiatria institucional", "child_adolescent_psychiatry", "institutional_outpatient", "in_person", "institutional_narrative"],
  ["cap_private_in_person", "Paidopsiquiatria privada presencial", "child_adolescent_psychiatry", "private_practice", "in_person", "private_narrative"],
  ["cap_private_video", "Paidopsiquiatria privada virtual", "child_adolescent_psychiatry", "private_practice", "video", "private_narrative"],
  ["cap_private_phone", "Paidopsiquiatria privada telefonica", "child_adolescent_psychiatry", "private_practice", "telephone", "concise_clinical"],
  ["cap_initial", "Valoracion paidopsiquiatrica inicial", "child_adolescent_psychiatry", "institutional_outpatient", "in_person", "detailed_clinical"],
  ["cap_followup", "Seguimiento paidopsiquiatrico", "child_adolescent_psychiatry", "institutional_outpatient", "in_person", "concise_clinical"],
  ["cap_emergency", "Urgencias paidopsiquiatricas", "child_adolescent_psychiatry", "emergency", "in_person", "concise_clinical"],
  ["general_medicine_institutional", "Medicina general institucional", "general_medicine", "institutional_outpatient", "in_person", "institutional_narrative"],
  ["general_medicine_private_in_person", "Medicina general privada presencial", "general_medicine", "private_practice", "in_person", "private_narrative"],
  ["general_medicine_private_video", "Medicina general privada virtual", "general_medicine", "private_practice", "video", "private_narrative"],
  ["general_medicine_private_phone", "Medicina general privada telefonica", "general_medicine", "private_practice", "telephone", "concise_clinical"],
  ["general_medicine_initial", "Consulta inicial de medicina general", "general_medicine", "private_practice", "in_person", "detailed_clinical"],
  ["general_medicine_followup", "Seguimiento de medicina general", "general_medicine", "private_practice", "in_person", "concise_clinical"],
  ["general_medicine_emergency", "Urgencias de medicina general", "general_medicine", "emergency", "in_person", "concise_clinical"],
  ["pediatrics_institutional", "Pediatria institucional", "pediatrics", "institutional_outpatient", "in_person", "institutional_narrative"],
  ["pediatrics_private_in_person", "Pediatria privada presencial", "pediatrics", "private_practice", "in_person", "private_narrative"],
  ["pediatrics_private_video", "Pediatria privada virtual", "pediatrics", "private_practice", "video", "private_narrative"],
  ["pediatrics_private_phone", "Pediatria privada telefonica", "pediatrics", "private_practice", "telephone", "concise_clinical"],
  ["pediatrics_initial", "Consulta pediatrica inicial", "pediatrics", "private_practice", "in_person", "detailed_clinical"],
  ["pediatrics_followup", "Seguimiento pediatrico", "pediatrics", "private_practice", "in_person", "concise_clinical"],
  ["pediatrics_emergency", "Urgencias pediatricas", "pediatrics", "emergency", "in_person", "concise_clinical"],
  ["internal_medicine_institutional", "Medicina interna institucional", "internal_medicine", "institutional_outpatient", "in_person", "institutional_narrative"],
  ["internal_medicine_private_in_person", "Medicina interna privada presencial", "internal_medicine", "private_practice", "in_person", "private_narrative"],
  ["internal_medicine_private_video", "Medicina interna privada virtual", "internal_medicine", "private_practice", "video", "private_narrative"],
  ["internal_medicine_private_phone", "Medicina interna privada telefonica", "internal_medicine", "private_practice", "telephone", "concise_clinical"],
  ["internal_medicine_initial", "Consulta inicial de medicina interna", "internal_medicine", "private_practice", "in_person", "detailed_clinical"],
  ["internal_medicine_followup", "Seguimiento de medicina interna", "internal_medicine", "private_practice", "in_person", "concise_clinical"],
  ["internal_medicine_liaison", "Interconsulta de medicina interna", "internal_medicine", "consultation_liaison", "in_person", "institutional_narrative"],
  ["internal_medicine_emergency", "Urgencias de medicina interna", "internal_medicine", "emergency", "in_person", "concise_clinical"],
  ["soap_general", "SOAP", "general_medicine", "institutional_outpatient", "not_applicable", "soap"],
  ["custom_style", "Personalizado", "psychiatry", "private_practice", "not_applicable", "custom"]
]);

function stylePresetToCatalogItem([id, label, specialty, careSetting, modality, writingStyle]) {
  return {
    id,
    label,
    description: `${label}. Estilo compuesto por especialidad, contexto, modalidad y tono.`,
    promptVersion: "voice_note_composed_style_v1",
    compatibleTypes: ["*"],
    specialty,
    careSetting,
    modality,
    writingStyle,
    rules: ["no inventar datos", "conservar negaciones", "usar solo fuentes autorizadas"]
  };
}

export function getAllVoiceNoteStyles() {
  const presets = COMPOSED_STYLE_PRESETS.map(stylePresetToCatalogItem);
  const byId = new Map();
  [...VOICE_NOTE_STYLE_CATALOG, ...presets].forEach((style) => {
    if (!byId.has(style.id)) byId.set(style.id, style);
  });
  return Array.from(byId.values());
}

function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function usuarioPuedeVerTipoNota(item = {}, options = {}) {
  if (!item.enabled) return false;
  const usuario = options.usuario || options.userProfile || null;
  const permisos = options.permisos || {};
  const resolved = resolverFormatoClinico(item.id);
  if (resolved.institutional && !usuarioPuedeUsarFormato(item.id, permisos, usuario?.rol || options.rol || "", usuario)) {
    return false;
  }
  if (item.requiresSubscription === "pro") {
    const membership = resolverEntitlementsMembresia(usuario || options.membership || {});
    return membership.canUseCustomNoteBuilder || options.showLocked === true;
  }
  return true;
}

export function getVisibleVoiceNoteTypes(options = {}) {
  return VOICE_NOTE_TYPE_CATALOG.filter((item) => usuarioPuedeVerTipoNota(item, options));
}

export function noteTypeOptions(options = {}) {
  return getVisibleVoiceNoteTypes(options).map((item) => [item.id, item.label]);
}

export function writingStyleOptions(options = {}) {
  return getVisibleVoiceNoteStyles(options).map((item) => [item.id, item.label]);
}

export function getVoiceNoteTypesForService(service = "", options = {}) {
  const normalized = normalizar(service);
  const visibles = getVisibleVoiceNoteTypes(options);
  if (!normalized) return visibles;
  const matches = visibles.filter((item) => {
    if (item.compatibleServices.includes("*")) return true;
    return item.compatibleServices.some((candidate) => normalized.includes(normalizar(candidate)));
  });
  return matches.length ? matches : visibles;
}

export function getDefaultVoiceNoteType(service = "", options = {}) {
  const normalized = normalizar(service);
  const visibles = getVoiceNoteTypesForService(service, options);
  const has = (id) => visibles.some((item) => item.id === id);
  if (normalized.includes("paidopsiquiatr") && has("paidopsiquiatria")) return "paidopsiquiatria";
  if (normalized.includes("pediatr") && has("pediatria")) return "pediatria";
  if (normalized.includes("ucep") && has("evolucion_ucep")) return "evolucion_ucep";
  if (normalized.includes("urgencia")) return has("urgencias") ? "urgencias" : "urgencias_general";
  if (normalized.includes("observacion")) return has("evolucion_observacion") ? "evolucion_observacion" : "evolucion_general";
  if (normalized.includes("consulta") && has("consulta_externa")) return "consulta_externa";
  if (has("nota_completa")) return "nota_completa";
  return "nota_completa";
}

export function getVisibleVoiceNoteStyles(options = {}) {
  const usuario = options.usuario || options.userProfile || null;
  const permisos = options.permisos || {};
  return getAllVoiceNoteStyles().filter((style) => {
    if (style.id === "formato_fray_narrativo" || style.aliasOf === "institucional_psiquiatrico_detallado") {
      return usuarioPuedeUsarFormato("evolucion_observacion", permisos, usuario?.rol || options.rol || "", usuario);
    }
    return true;
  });
}

export function getCompatibleVoiceStyles(typeId = "", options = {}) {
  const styles = getVisibleVoiceNoteStyles(options);
  const matches = styles.filter((style) =>
    style.compatibleTypes.includes("*") || style.compatibleTypes.includes(typeId)
  );
  return matches.length ? matches : styles;
}

export function getDefaultVoiceStyle(typeId = "", options = {}) {
  const compatible = getCompatibleVoiceStyles(typeId, options);
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
  return getAllVoiceNoteStyles().find((item) => item.id === styleId || item.legacyIds?.includes(styleId)) || null;
}

export function resolveVoiceNoteConfiguration({ noteType = "", styleId = "", userProfile = null, service = "" } = {}) {
  const permisos = userProfile ? undefined : {};
  const typeId = noteType || getDefaultVoiceNoteType(service, { usuario: userProfile, permisos });
  const style = getVoiceNoteStyle(styleId) || getVoiceNoteStyle(getDefaultVoiceStyle(typeId, { usuario: userProfile, permisos }));
  return {
    specialty: style?.specialty || "psychiatry",
    careSetting: style?.careSetting || "institutional_outpatient",
    modality: style?.modality || "not_applicable",
    writingStyle: style?.writingStyle || style?.id || "detailed_clinical",
    templateId: getVoiceNoteType(typeId)?.templateId || "",
    institutionalFormatId: resolverFormatoClinico(typeId).institutional ? typeId : "",
    noteType: typeId,
    styleId: style?.id || styleId || ""
  };
}

export { FRAY_FORMAT_IDS, NAVARRO_FORMAT_IDS, FORMAT_PERMISSION_FRAY, FORMAT_PERMISSION_NAVARRO };
