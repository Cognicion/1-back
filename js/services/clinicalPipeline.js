import { normalizarComparacion, normalizarTextoClinicoConservador } from "./clinicalTextNormalizer.js";

export const ESTADOS_AFIRMACION = Object.freeze({
  AFIRMADO: "afirmado",
  NEGADO: "negado",
  NO_EXPLORADO: "no_explorado",
  INCIERTO: "incierto",
  HISTORICO: "historico",
  RESUELTO: "resuelto",
  SUSPENDIDO: "suspendido",
  REFERIDO_TERCERO: "referido_por_tercero",
  OBSERVADO: "observado_durante_entrevista"
});

export const SECCIONES_NOTA = Object.freeze([
  "ficha_identificacion", "fuente_confiabilidad", "motivo_consulta", "padecimiento_actual",
  "antecedentes_heredofamiliares", "antecedentes_personales_patologicos",
  "antecedentes_personales_no_patologicos", "antecedentes_psiquiatricos", "medicamentos",
  "adherencia", "alergias", "consumo_sustancias", "signos_vitales", "exploracion_fisica",
  "examen_mental", "evaluacion_riesgo", "resultados_auxiliares", "impresion_clinica",
  "diagnosticos", "comentario_clinico", "plan", "indicaciones", "pronostico", "destino"
]);

const RIESGOS = [
  ["ideas_muerte", /\bideas? de muerte\b/i],
  ["ideacion_suicida", /\bideaci[oó]n suicida|ideas? suicidas?\b/i],
  ["plan_suicida", /\bplan suicida|plan para (?:morir|suicidarse)|tomarme las pastillas\b/i],
  ["intencion_suicida", /\bintenci[oó]n suicida|intenci[oó]n de morir\b/i],
  ["medios_disponibles", /\bmedios? disponibles?|arma|pastillas disponibles\b/i],
  ["intento_suicida", /\bintento (?:de )?suicid|intento autol[ií]tico\b/i],
  ["autolesiones", /\bautolesi[oó]n|se corta|cutting\b/i],
  ["heteroagresividad", /\bheteroagres|agredir a (?:otros|terceros)\b/i],
  ["violencia", /\bviolencia|golpe[oó]|amenaz[oó]\b/i],
  ["intoxicacion", /\bintoxicaci[oó]n\b/i],
  ["abstinencia", /\babstinencia\b/i],
  ["agitacion", /\bagitaci[oó]n|agitado\b/i],
  ["delirium", /\bdelirium|estado confusional\b/i],
  ["catatonia", /\bcataton[ií]a|catat[oó]nico\b/i],
  ["psicosis", /\bpsicosis|alucinaci[oó]n|delirio|soliloquios?\b/i],
  ["abuso", /\babuso (?:f[ií]sico|sexual|emocional)|maltrato\b/i],
  ["embarazo", /\bembarazad[ao]|embarazo\b/i],
  ["alergias", /\balergia|al[eé]rgic[ao]\b/i]
];

const DOMINIOS_MENTALES = [
  ["apariencia", /apariencia|ali[nñ]o|vestimenta/i], ["actitud", /actitud|cooperador|hostil/i],
  ["conducta", /conducta/i], ["conciencia", /alerta|somnoliento|conciencia/i],
  ["orientacion", /orientad|desorientad/i], ["atencion", /atenci[oó]n|distra[ií]d/i],
  ["contacto_visual", /contacto visual|mirada/i], ["psicomotricidad", /psicomotric|agitado|retardo/i],
  ["lenguaje", /lenguaje|verborrea|mutismo/i], ["animo", /[aá]nimo|triste|euf[oó]ric/i],
  ["afecto", /afecto|aplanado|l[aá]bil/i], ["pensamiento", /pensamiento/i],
  ["curso", /curso del pensamiento|fuga de ideas|disgrega/i], ["contenido", /delirio|obsesi[oó]n|ideaci[oó]n/i],
  ["sensopercepcion", /alucinaci[oó]n|sensopercep|voces/i], ["memoria", /memoria|recuerdo/i],
  ["cognicion", /cognici[oó]n|cognitiv/i], ["juicio", /juicio/i],
  ["introspeccion", /introspecci[oó]n|insight/i], ["control_impulsos", /impulsos|impulsividad/i],
  ["riesgo_suicida", /suicid|ideas? de muerte/i], ["riesgo_heteroagresivo", /heteroagres|agredir/i]
];

function id(prefix = "item") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function textoPlano(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectarInformante(texto = "") {
  const t = normalizarComparacion(texto);
  if (/\b(?:la )?madre\b/.test(t)) return "madre";
  if (/\b(?:el )?padre\b/.test(t)) return "padre";
  if (/\bpareja\b/.test(t)) return "pareja";
  if (/\bfamiliar\b/.test(t)) return "familiar";
  if (/\bexpediente|registro previo\b/.test(t)) return "expediente";
  if (/\bprofesional|medico|enfermer[ao]|psicolog[ao]\b/.test(t)) return "profesional";
  if (/\bpaciente|refiere|niega\b/.test(t)) return "paciente";
  return "informante_no_identificado";
}

function detectarTemporalidad(texto = "") {
  const t = normalizarComparacion(texto);
  const expresion = t.match(/\b(actualmente|previamente|ayer|hace (?:tres|\d+) dias?|hace varios anos|desde hace [^,.;]+|a los \d+ anos|ultimo consumo|en remision|pendiente|suspendid[oa]|reiniciad[oa])\b/)?.[0] || "";
  if (/previamente|hace varios anos|a los \d+ anos/.test(t)) return { state: "historico", expression: expresion };
  if (/en remision/.test(t)) return { state: "resuelto", expression: expresion };
  if (/suspendid/.test(t)) return { state: "suspendido", expression: expresion };
  if (/pendiente/.test(t)) return { state: "pendiente", expression: expresion };
  return { state: "actual", expression: expresion };
}

function detectarEstado(texto = "", informante = "") {
  const t = normalizarComparacion(texto);
  if (/\bno se exploro|sin explorar|no fue explorad/.test(t)) return ESTADOS_AFIRMACION.NO_EXPLORADO;
  if (/\bno se descarta|no recuerda si|posible|probable|por descartar|pendiente de confirmar/.test(t)) return ESTADOS_AFIRMACION.INCIERTO;
  if (/\bno niega\b/.test(t)) return ESTADOS_AFIRMACION.INCIERTO;
  if (/\bno suspendio\b/.test(t)) return ESTADOS_AFIRMACION.NEGADO;
  if (/\bsuspendio|fue suspendid|se suspendio\b/.test(t)) return ESTADOS_AFIRMACION.SUSPENDIDO;
  if (/\bactualmente (?:lo |la )?niega|niega|sin datos de|sin evidencia de|no presenta\b/.test(t)) return ESTADOS_AFIRMACION.NEGADO;
  if (/\bpreviamente|hace varios anos|a los \d+ anos\b/.test(t)) return ESTADOS_AFIRMACION.HISTORICO;
  if (/\ben remision|resuelto\b/.test(t)) return ESTADOS_AFIRMACION.RESUELTO;
  if (informante !== "paciente" && informante !== "informante_no_identificado") return ESTADOS_AFIRMACION.REFERIDO_TERCERO;
  if (/\bse observa|durante la entrevista|a la exploracion\b/.test(t)) return ESTADOS_AFIRMACION.OBSERVADO;
  return ESTADOS_AFIRMACION.AFIRMADO;
}

function conceptoClinico(texto = "") {
  const riesgo = RIESGOS.find(([, regex]) => regex.test(texto));
  if (riesgo) return riesgo[0];
  if (/alerg/i.test(texto)) return "alergias";
  const medicamento = texto.match(/\b(clonazepam|sertralina|fluoxetina|risperidona|olanzapina|quetiapina|litio|valproato|metilfenidato|atomoxetina)\b/i)?.[1];
  if (medicamento) return `medicamento:${normalizarComparacion(medicamento)}`;
  return normalizarComparacion(texto).split(" ").slice(0, 7).join(" ");
}

function clasificarSeccion(texto = "") {
  if (/alerg/i.test(texto)) return "alergias";
  if (/suicid|autoles|heteroagres|violencia|intoxic|abstinencia|agitaci|delirium|cataton|abuso/i.test(texto)) return "evaluacion_riesgo";
  if (/clonazepam|sertralina|fluoxetina|risperidona|olanzapina|quetiapina|litio|valproato|metilfenidato|atomoxetina|\bmg\b|\bmcg\b/i.test(texto)) return /suspend|adheren|abandono|no toma/i.test(texto) ? "adherencia" : "medicamentos";
  if (/alcohol|cannabis|marihuana|cocaina|cristal|metanfetamina|tabaco|consumo/i.test(texto)) return "consumo_sustancias";
  if (/madre|padre|pareja|familiar|informante|expediente/i.test(texto)) return "fuente_confiabilidad";
  if (DOMINIOS_MENTALES.some(([, regex]) => regex.test(texto))) return "examen_mental";
  if (/diagnostico|impresion/i.test(texto)) return "impresion_clinica";
  if (/plan|indica|solicitar|laboratorio|interconsulta|cita|vigilancia|dieta|actividad|destino/i.test(texto)) return "plan";
  if (/antecedente|previamente|hace varios anos/i.test(texto)) return "antecedentes_psiquiatricos";
  return "padecimiento_actual";
}

export function segmentarTranscripcion(transcripcion, contexto = {}) {
  const entrada = Array.isArray(transcripcion) ? transcripcion : [{ originalText: transcripcion }];
  const segmentos = [];
  entrada.forEach((origen, sourceIndex) => {
    const original = textoPlano(origen.originalText ?? origen.text ?? origen.normalizedText ?? "");
    original.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean).forEach((parte, sentenceIndex) => {
      const normalizado = normalizarTextoClinicoConservador(parte);
      segmentos.push({
        id: origen.id || id("segmento"), sessionId: origen.sessionId || contexto.sessionId || "",
        patientId: origen.patientId || contexto.patientId || "", encounterId: origen.encounterId || contexto.encounterId || "",
        originalText: parte.trim(), normalizedText: normalizado.normalizedText, sourceIndex, sentenceIndex,
        startTime: origen.startTime ?? null, endTime: origen.endTime ?? null, speaker: origen.speaker || "hablante_no_identificado",
        confidence: origen.confidence ?? null, provider: origen.provider || "entrada_manual", transformations: normalizado.transformations || []
      });
    });
  });
  return segmentos;
}

export function extraerAfirmacionesClinicas(segmentos = [], contexto = {}) {
  const statements = [];
  segmentos.forEach((segmento) => {
    const clausulas = segmento.originalText.split(/\s*(?:,|;|\baunque\b|\bpero\b)\s*/iu).filter(textoPlano);
    clausulas.forEach((originalText, clauseIndex) => {
      const normalizado = normalizarTextoClinicoConservador(originalText).normalizedText;
      const informant = detectarInformante(originalText) !== "informante_no_identificado"
        ? detectarInformante(originalText) : detectarInformante(segmento.originalText);
      const temporal = detectarTemporalidad(originalText);
      const assertionStatus = detectarEstado(originalText, informant);
      const section = clasificarSeccion(originalText);
      statements.push({
        id: id("afirmacion"), concept: conceptoClinico(originalText), originalText: originalText.trim(), normalizedText: normalizado,
        sourceSegmentId: segmento.id, sourceIndex: segmento.sourceIndex, clauseIndex, timestamp: segmento.startTime,
        speaker: segmento.speaker, informant, subject: /\bmadre|padre|pareja|familiar\b/i.test(originalText) ? "paciente" : "paciente",
        temporality: temporal.state, temporalExpression: temporal.expression, assertionStatus,
        negation: assertionStatus === ESTADOS_AFIRMACION.NEGADO, certainty: assertionStatus === ESTADOS_AFIRMACION.INCIERTO ? "incierta" : "explicita",
        confidence: segmento.confidence ?? 0.7, proposedSection: section, reviewStatus: "pendiente",
        provenance: { sourceType: segmento.provider === "entrada_manual" ? "transcripcion_manual" : "dictado_por_voz", segmentId: segmento.id, patientId: segmento.patientId, sessionId: segmento.sessionId }
      });
    });
  });
  return statements;
}

export function extraerMedicamentos(statements = []) {
  const items = [];
  const medicamento = /\b(clonazepam|sertralina|fluoxetina|risperidona|olanzapina|quetiapina|litio|valproato|metilfenidato|atomoxetina)\b/i;
  statements.forEach((s) => {
    const match = s.originalText.match(medicamento);
    if (!match) return;
    const dosis = s.originalText.match(/(?:^|\s)(¼|½|¾|1½|\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml)?\b/i);
    const via = s.originalText.match(/\b(oral|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/i)?.[1] || "";
    const frecuencia = s.originalText.match(/\b(cada \d+ horas|una vez al d[ií]a|dos veces al d[ií]a|por la noche|por la ma[nñ]ana|PRN|si es necesario)\b/i)?.[1] || "";
    items.push({ id: id("medicamento"), statementId: s.id, activeIngredient: normalizarComparacion(match[1]), presentation: "", concentration: "",
      dose: dosis?.[1] || "", unit: dosis?.[2] || "", fraction: /¼|½|¾|1½/.test(dosis?.[1] || "") ? dosis[1] : "", route: via,
      frequency: frecuencia, schedules: [], duration: "", prn: /\bPRN|si es necesario\b/i.test(s.originalText), maximumDose: "", observations: s.originalText,
      assertionStatus: s.assertionStatus, provenance: s.provenance, reviewStatus: "pendiente" });
  });
  return items;
}

export function extraerHallazgosMentales(statements = []) {
  return statements.flatMap((s) => DOMINIOS_MENTALES
    .filter(([, regex]) => regex.test(s.originalText))
    .map(([domain]) => ({ id: id("mental"), domain, statementId: s.id, text: s.originalText, status: s.assertionStatus,
      evidenceType: s.assertionStatus === ESTADOS_AFIRMACION.OBSERVADO ? "observado" : s.assertionStatus === ESTADOS_AFIRMACION.NEGADO ? "negado" : "referido",
      provenance: s.provenance, reviewStatus: "pendiente" })));
}

export function detectarContradicciones(statements = []) {
  const grupos = new Map();
  statements.forEach((s) => {
    if (!grupos.has(s.concept)) grupos.set(s.concept, []);
    grupos.get(s.concept).push(s);
  });
  return Array.from(grupos.entries()).flatMap(([concept, items]) => {
    const estados = new Set(items.map((i) => i.assertionStatus));
    const conflicto = estados.has("negado") && Array.from(estados).some((e) => ["afirmado", "referido_por_tercero", "historico", "observado_durante_entrevista"].includes(e));
    if (!conflicto) return [];
    return [{ id: id("contradiccion"), type: "contradiccion", severity: "alta", concept,
      message: `Existen versiones diferentes sobre ${concept}; deben conservarse y revisarse.`, statementIds: items.map((i) => i.id), evidence: items.map((i) => i.originalText), requiresExplicitReview: true }];
  });
}

export function detectarRiesgosEstructurados(statements = []) {
  return statements.flatMap((s) => RIESGOS.filter(([, regex]) => regex.test(s.originalText)).map(([type]) => ({
    id: id("riesgo"), type, statementId: s.id, text: s.originalText, status: s.assertionStatus,
    informant: s.informant, confidence: s.confidence, provenance: s.provenance,
    critical: ["ideacion_suicida", "plan_suicida", "intencion_suicida", "medios_disponibles", "intento_suicida", "heteroagresividad", "intoxicacion", "delirium", "catatonia", "abuso", "embarazo", "alergias"].includes(type),
    requiresExplicitReview: true, reviewStatus: "pendiente"
  })));
}

export function crearPropuestasIndicaciones(statements = [], medications = []) {
  const proposals = medications.map((m) => ({ id: id("orden"), type: "medicamento", data: m, statementId: m.statementId,
    provenance: m.provenance, validationStatus: "pendiente_validadores_clinicos", confirmed: false }));
  statements.filter((s) => s.proposedSection === "plan").forEach((s) => {
    const type = /laboratorio|biometr[ií]a|qu[ií]mica|perfil/i.test(s.originalText) ? "laboratorio"
      : /interconsulta/i.test(s.originalText) ? "interconsulta" : /cita/i.test(s.originalText) ? "cita"
      : /dieta/i.test(s.originalText) ? "dieta" : /actividad/i.test(s.originalText) ? "actividad"
      : /destino|referencia/i.test(s.originalText) ? "destino" : "cuidado_vigilancia";
    proposals.push({ id: id("orden"), type, data: { text: s.originalText }, statementId: s.id, provenance: s.provenance,
      validationStatus: "pendiente_validadores_clinicos", confirmed: false });
  });
  return proposals;
}

function narrativa(statement) {
  const prefijo = statement.informant !== "paciente" && statement.informant !== "informante_no_identificado"
    ? `${statement.informant}: ` : "";
  return `${prefijo}${statement.originalText}`.trim();
}

export function generarSecciones(statements = [], { noteType = "evolucion", detailLevel = "medio", format = "mixto" } = {}) {
  const permitidas = noteType === "nota_rapida"
    ? new Set(["motivo_consulta", "padecimiento_actual", "examen_mental", "evaluacion_riesgo", "impresion_clinica", "plan"])
    : new Set(SECCIONES_NOTA);
  return SECCIONES_NOTA.flatMap((section) => {
    if (!permitidas.has(section)) return [];
    const source = statements.filter((s) => s.proposedSection === section);
    if (!source.length) return [];
    return [{ id: id("seccion"), section, title: section.replaceAll("_", " "), content: source.map(narrativa).join(detailLevel === "breve" ? "; " : ". "),
      format, sourceStatementIds: source.map((s) => s.id), confidence: Math.min(...source.map((s) => Number(s.confidence) || 0.5)),
      reviewStatus: "pendiente", accepted: false, version: 1 }];
  });
}

export function ejecutarPipelineClinico(transcripcion, contexto = {}, options = {}) {
  const segments = segmentarTranscripcion(transcripcion, contexto);
  const statements = extraerAfirmacionesClinicas(segments, contexto);
  const medicationStatements = extraerMedicamentos(statements);
  const mentalStatusFindings = extraerHallazgosMentales(statements);
  const riskStatements = detectarRiesgosEstructurados(statements);
  const contradictions = detectarContradicciones(statements);
  const orderProposals = crearPropuestasIndicaciones(statements, medicationStatements);
  const sections = generarSecciones(statements, options);
  const validationIssues = [
    ...contradictions,
    ...riskStatements.filter((r) => r.critical || r.confidence < 0.65).map((r) => ({ id: id("validacion"), type: "riesgo_critico", severity: "alta", concept: r.type,
      message: `Confirmar individualmente ${r.type.replaceAll("_", " ")} y revisar su fuente.`, statementIds: [r.statementId], evidence: [r.text], requiresExplicitReview: true }))
  ];
  const provenanceRecords = statements.map((s) => ({ id: id("procedencia"), concept: s.concept, originalText: s.originalText,
    sourceType: s.provenance.sourceType, sourceSegmentId: s.sourceSegmentId, patientId: s.provenance.patientId,
    sessionId: s.provenance.sessionId, speaker: s.speaker, informant: s.informant, confidence: s.confidence, status: "pendiente_revision" }));
  return { segments, statements, medicationStatements, substanceUseStatements: statements.filter((s) => s.proposedSection === "consumo_sustancias"),
    mentalStatusFindings, riskStatements, diagnosisStatements: statements.filter((s) => s.proposedSection === "diagnosticos" || s.proposedSection === "impresion_clinica"),
    planItems: statements.filter((s) => s.proposedSection === "plan"), orderProposals, sections, contradictions, validationIssues, provenanceRecords };
}

export function validarAislamientoContexto(item, contexto = {}) {
  return (!contexto.patientId || item.patientId === contexto.patientId || item.provenance?.patientId === contexto.patientId)
    && (!contexto.sessionId || item.sessionId === contexto.sessionId || item.provenance?.sessionId === contexto.sessionId);
}
