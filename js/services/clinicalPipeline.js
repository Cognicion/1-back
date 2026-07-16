import { normalizarComparacion, normalizarTextoClinicoConservador } from "./clinicalTextNormalizer.js";
import { MEDICAMENTOS_MAESTROS } from "../data/medicamentos.js";

export const ESTADOS_AFIRMACION = Object.freeze({
  AFIRMADO: "afirmado", NEGADO: "negado", NO_EXPLORADO: "no_explorado", INCIERTO: "incierto",
  HISTORICO: "historico", RESUELTO: "resuelto", SUSPENDIDO: "suspendido",
  REFERIDO_TERCERO: "referido_por_tercero", OBSERVADO: "observado_durante_entrevista"
});

export const SECCIONES_NOTA = Object.freeze([
  "ficha_identificacion", "fuente_confiabilidad", "motivo_consulta", "padecimiento_actual",
  "antecedentes_heredofamiliares", "antecedentes_personales_patologicos", "antecedentes_personales_no_patologicos",
  "antecedentes_psiquiatricos", "medicamentos", "adherencia", "alergias", "consumo_sustancias",
  "signos_vitales", "exploracion_fisica", "examen_mental", "evaluacion_riesgo", "resultados_auxiliares",
  "impresion_clinica", "diagnosticos", "comentario_clinico", "plan", "indicaciones", "pronostico", "destino"
]);

const RIESGOS = [
  ["ideas_muerte", /\bideas? de muerte\b/i], ["ideacion_suicida", /\bideaci[oó]n suicida|ideas? suicidas?\b/i],
  ["plan_suicida", /\bplan suicida|plan para (?:morir|suicidarse)|tomarme las pastillas\b/i],
  ["intencion_suicida", /\bintenci[oó]n (?:suicida|de morir)\b/i], ["intento_suicida", /\bintento (?:de )?suicid|intento autol[ií]tico\b/i],
  ["autolesiones", /\bautolesi[oó]n|se corta|cutting\b/i], ["heteroagresividad", /\bheteroagres|agredir a (?:otros|terceros)\b/i],
  ["violencia", /\bviolencia|golpe[oó]|amenaz[oó]\b/i], ["agresion_sexual", /\bviolaci[oó]n|agresi[oó]n sexual|abuso sexual\b/i],
  ["intoxicacion", /\bintoxicaci[oó]n\b/i], ["abstinencia", /\babstinencia\b/i], ["agitacion", /\bagitaci[oó]n|agitad[oa]\b/i],
  ["delirium", /\bdelirium|estado confusional\b/i], ["catatonia", /\bcataton[ií]a|catat[oó]nic[oa]\b/i],
  ["psicosis", /\bpsicosis|alucinaci[oó]n|delirio|soliloquios?\b/i]
];

const DOMINIOS_MENTALES = [
  ["apariencia", /apariencia|ali[nñ]o|vestimenta/i], ["actitud", /actitud|cooperador|hostil/i],
  ["conducta", /conducta/i], ["conciencia", /alerta|somnoliento|conciencia/i], ["orientacion", /orientad|desorientad/i],
  ["atencion", /atenci[oó]n|distra[ií]d/i], ["psicomotricidad", /psicomotric|agitado|retardo/i],
  ["lenguaje", /lenguaje|verborrea|mutismo/i], ["animo", /[aá]nimo|triste|euf[oó]ric/i], ["afecto", /afecto|aplanado|l[aá]bil/i],
  ["pensamiento", /pensamiento|fuga de ideas|disgrega|desorganizad/i], ["sensopercepcion", /alucinaci[oó]n|sensopercep|voces/i],
  ["memoria", /memoria|recuerdo/i], ["juicio", /juicio/i], ["introspeccion", /introspecci[oó]n|insight/i],
  ["control_impulsos", /impulsos|impulsividad/i]
];

const NOMBRES_MEDICAMENTOS = Array.from(new Set(MEDICAMENTOS_MAESTROS
  .map((item) => item.nombreGenerico || item.nombre || item.nombreNormalizado || "").filter(Boolean)))
  .sort((a, b) => b.length - a.length);
const escaparRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REGEX_MEDICAMENTO = new RegExp(`\\b(${NOMBRES_MEDICAMENTOS.map(escaparRegex).join("|")})\\b`, "iu");

function id(prefix = "item") { return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function textoPlano(value = "") { return String(value || "").replace(/\s+/g, " ").trim(); }
function capitalizar(texto = "") { const t = textoPlano(texto); return t ? `${t[0].toUpperCase()}${t.slice(1)}` : ""; }

function detectarInformante(texto = "") {
  const t = normalizarComparacion(texto);
  if (/\b(?:la )?madre\b/.test(t)) return "madre";
  if (/\b(?:el )?padre\b/.test(t)) return "padre";
  if (/\bpareja\b/.test(t)) return "pareja";
  if (/\b(?:familiar|familiares)\b/.test(t)) return "familiar";
  if (/\bexpediente|registro previo|entrega de guardia\b/.test(t)) return "expediente";
  if (/\bprofesional|medico|enfermer[ao]|psicolog[ao]\b/.test(t)) return "profesional";
  if (/\bpaciente|refiere|niega\b/.test(t)) return "paciente";
  return "informante_no_identificado";
}

function detectarTemporalidad(texto = "") {
  const t = normalizarComparacion(texto);
  const expression = t.match(/\b(actualmente|previamente|ayer|hace [^,.;]+|desde hace [^,.;]+|en remision|suspendid[oa]|pendiente)\b/)?.[0] || "";
  if (/\bpreviamente|antecedente|hace \d+ (?:dias|meses|anos)\b/.test(t)) return { state: "historico", expression };
  if (/\ben remision|resuelto\b/.test(t)) return { state: "resuelto", expression };
  if (/\bsuspendid/.test(t)) return { state: "suspendido", expression };
  return { state: "actual", expression };
}

function detectarEstado(texto = "", informante = "") {
  const t = normalizarComparacion(texto);
  if (/\bno se exploro|sin explorar|no fue explorad/.test(t)) return ESTADOS_AFIRMACION.NO_EXPLORADO;
  if (/\bno se descarta|no recuerda si|posible|probable|por descartar|pendiente de confirmar|parece|al parecer/.test(t)) return ESTADOS_AFIRMACION.INCIERTO;
  if (/\bno niega\b/.test(t)) return ESTADOS_AFIRMACION.INCIERTO;
  if (/\bno suspendio\b/.test(t)) return ESTADOS_AFIRMACION.NEGADO;
  if (/\bsuspendio|fue suspendid|se suspendio\b/.test(t)) return ESTADOS_AFIRMACION.SUSPENDIDO;
  if (/\bactualmente (?:lo |la )?niega|\bniega|sin datos de|sin evidencia de|no presenta\b/.test(t)) return ESTADOS_AFIRMACION.NEGADO;
  if (/\bpreviamente|antecedente|hace \d+ (?:dias|meses|anos)\b/.test(t)) return ESTADOS_AFIRMACION.HISTORICO;
  if (/\ben remision|resuelto\b/.test(t)) return ESTADOS_AFIRMACION.RESUELTO;
  if (/\bse observa|durante la entrevista|a la exploracion\b/.test(t)) return ESTADOS_AFIRMACION.OBSERVADO;
  if (!["paciente", "informante_no_identificado"].includes(informante)) return ESTADOS_AFIRMACION.REFERIDO_TERCERO;
  return ESTADOS_AFIRMACION.AFIRMADO;
}

function esPlanExplicito(texto = "") {
  const t = normalizarComparacion(texto).replace(/^plan\s*:?\s*/, "");
  return /^(?:se\s+)?(?:indicar|iniciar|continuar|mantener|suspender|ajustar|solicitar|realizar|citar|agendar|referir|vigilar|monitorizar|administrar|canalizar)\b/.test(t)
    || /\b(?:se indica|se solicita|se agenda|se cita|debera|debe continuar|plan consiste en)\b/.test(t);
}

function clasificarSeccion(texto = "") {
  if (/alerg/i.test(texto)) return "alergias";
  if (RIESGOS.some(([, regex]) => regex.test(texto))) return "evaluacion_riesgo";
  if (esPlanExplicito(texto)) return "plan";
  if (REGEX_MEDICAMENTO.test(texto)) return /suspend|adheren|abandono|no toma|omite/i.test(texto) ? "adherencia" : "medicamentos";
  if (/alcohol|cannabis|marihuana|coca[ií]na|cristal|metanfetamina|tabaco|consumo/i.test(texto)) return "consumo_sustancias";
  if (DOMINIOS_MENTALES.some(([, regex]) => regex.test(texto))) return "examen_mental";
  if (/\bdiagn[oó]stico|impresi[oó]n cl[ií]nica\b/i.test(texto)) return "impresion_clinica";
  if (/\bantecedente|previamente|hace \d+ (?:dias|meses|a[nñ]os)\b/i.test(texto)) return "antecedentes_psiquiatricos";
  return "padecimiento_actual";
}

function conceptoClinico(texto = "") {
  const riesgo = RIESGOS.find(([, regex]) => regex.test(texto));
  if (riesgo) return riesgo[0];
  const medicamento = texto.match(REGEX_MEDICAMENTO)?.[1];
  if (medicamento) return `medicamento:${normalizarComparacion(medicamento)}`;
  return normalizarComparacion(texto).split(" ").slice(0, 8).join(" ");
}

function dividirClausulas(texto = "") {
  return textoPlano(texto).replace(/\bque si\b/giu, "; que si")
    .split(/\s*(?:;|,(?=\s)|\b(?:aunque|pero|adem[aá]s|posteriormente|sin embargo|por otra parte)\b)\s*/iu)
    .flatMap((parte) => parte.split(/\s+\by\b\s+(?=(?:niega|refiere|presenta|consume|tom[oó]|suspendi[oó]|se observa|se indica|solicitar|citar)\b)/iu))
    .map(textoPlano).filter((parte) => parte.split(" ").length >= 2);
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
        confidence: Number.isFinite(Number(origen.confidence)) && Number(origen.confidence) > 0 ? Number(origen.confidence) : null,
        provider: origen.provider || "entrada_manual", transformations: normalizado.transformations || []
      });
    });
  });
  return segmentos;
}

export function extraerAfirmacionesClinicas(segmentos = []) {
  const statements = [];
  segmentos.forEach((segmento) => {
    const informanteSegmento = detectarInformante(segmento.originalText);
    dividirClausulas(segmento.originalText).forEach((originalText, clauseIndex) => {
      const informant = detectarInformante(originalText) !== "informante_no_identificado" ? detectarInformante(originalText) : informanteSegmento;
      const temporal = detectarTemporalidad(originalText);
      const assertionStatus = detectarEstado(originalText, informant);
      const palabras = originalText.split(/\s+/).length;
      const uncertaintyReasons = [];
      if (segmento.confidence !== null && segmento.confidence < 0.65) uncertaintyReasons.push("confianza_baja_reportada_por_proveedor");
      if (/\b(?:eh|em|este|pues|o sea|como para|gracias|es que|que si)\b/i.test(originalText)) uncertaintyReasons.push("disfluencia_o_posible_error_reconocimiento");
      if (palabras > 30 && !/[.!?;]/.test(originalText)) uncertaintyReasons.push("fragmento_extenso_sin_puntuacion");
      statements.push({
        id: id("afirmacion"), concept: conceptoClinico(originalText), originalText: originalText.trim(),
        normalizedText: normalizarTextoClinicoConservador(originalText).normalizedText,
        sourceSegmentId: segmento.id, sourceIndex: segmento.sourceIndex, clauseIndex, timestamp: segmento.startTime,
        speaker: segmento.speaker, informant, subject: "paciente", temporality: temporal.state,
        temporalExpression: temporal.expression, assertionStatus, negation: assertionStatus === ESTADOS_AFIRMACION.NEGADO,
        certainty: assertionStatus === ESTADOS_AFIRMACION.INCIERTO ? "incierta" : "explicita",
        confidence: segmento.confidence, uncertaintyReasons, proposedSection: clasificarSeccion(originalText), reviewStatus: "pendiente",
        provenance: { sourceType: segmento.provider === "entrada_manual" ? "transcripcion_manual" : "dictado_por_voz",
          segmentId: segmento.id, patientId: segmento.patientId, sessionId: segmento.sessionId }
      });
    });
  });
  return statements;
}

export function extraerMedicamentos(statements = []) {
  return statements.flatMap((s) => {
    const match = s.originalText.match(REGEX_MEDICAMENTO);
    if (!match) return [];
    const dosis = s.originalText.match(/(?:^|\s)(¼|½|¾|1½|\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml|gotas?)\b/iu);
    const route = s.originalText.match(/\b(v[ií]a oral|oral|sublingual|intramuscular|intravenosa|t[oó]pica|inhalada)\b/iu)?.[1] || "";
    const frequency = s.originalText.match(/\b(cada \d+ horas|una vez al d[ií]a|dos veces al d[ií]a|por la noche|por la ma[nñ]ana|al acostarse|prn|si es necesario)\b/iu)?.[1] || "";
    const adherence = /\bno (?:la |lo )?toma|abandono|omite|sin adherencia\b/iu.test(s.originalText) ? "no_adherente"
      : /\badherencia adecuada|toma regular|sin omisiones\b/iu.test(s.originalText) ? "adherente" : "no_documentada";
    return [{
      id: id("medicamento"), statementId: s.id, activeIngredient: normalizarComparacion(match[1]), displayName: match[1],
      dose: dosis?.[1] || "", unit: dosis?.[2] || "", fraction: /¼|½|¾|1½/.test(dosis?.[1] || "") ? dosis[1] : "",
      route, frequency, duration: "", prn: /\bprn|si es necesario\b/iu.test(s.originalText), adherence,
      assertionStatus: s.assertionStatus, informant: s.informant, temporality: s.temporality,
      sourceUncertainty: s.uncertaintyReasons, provenance: s.provenance, reviewStatus: "pendiente"
    }];
  });
}

export function extraerHallazgosMentales(statements = []) {
  return statements.flatMap((s) => DOMINIOS_MENTALES.filter(([, regex]) => regex.test(s.originalText)).map(([domain]) => ({
    id: id("mental"), domain, statementId: s.id, text: s.originalText, status: s.assertionStatus,
    evidenceType: s.assertionStatus === ESTADOS_AFIRMACION.OBSERVADO ? "observado" : s.assertionStatus === ESTADOS_AFIRMACION.NEGADO ? "negado" : "referido",
    provenance: s.provenance, reviewStatus: "pendiente"
  })));
}

export function detectarContradicciones(statements = []) {
  const grupos = new Map();
  statements.forEach((s) => { if (!grupos.has(s.concept)) grupos.set(s.concept, []); grupos.get(s.concept).push(s); });
  return Array.from(grupos.entries()).flatMap(([concept, items]) => {
    const states = new Set(items.map((item) => item.assertionStatus));
    if (!(states.has("negado") && Array.from(states).some((state) => ["afirmado", "referido_por_tercero", "historico", "observado_durante_entrevista"].includes(state)))) return [];
    return [{ id: id("contradiccion"), type: "contradiccion", severity: "alta", concept,
      message: `Se identificaron versiones contradictorias sobre ${concept}; revisar ambas fuentes.`,
      statementIds: items.map((item) => item.id), evidence: items.map((item) => item.originalText), requiresExplicitReview: true }];
  });
}

export function detectarRiesgosEstructurados(statements = []) {
  return statements.flatMap((s) => RIESGOS.filter(([, regex]) => regex.test(s.originalText)).map(([type]) => ({
    id: id("riesgo"), type, statementId: s.id, text: s.originalText, status: s.assertionStatus,
    informant: s.informant, confidence: s.confidence, provenance: s.provenance,
    critical: ["ideacion_suicida", "plan_suicida", "intencion_suicida", "intento_suicida", "heteroagresividad", "intoxicacion", "delirium", "catatonia", "agresion_sexual"].includes(type),
    requiresExplicitReview: true, reviewStatus: "pendiente"
  })));
}

export function crearPropuestasIndicaciones(statements = [], medications = []) {
  const planStatements = statements.filter((s) => s.proposedSection === "plan" && esPlanExplicito(s.originalText));
  return planStatements.map((s) => {
    const medication = medications.find((item) => item.statementId === s.id);
    const type = medication ? "medicamento" : /laboratorio|biometr[ií]a|qu[ií]mica|perfil/i.test(s.originalText) ? "laboratorio"
      : /interconsulta|referir|canalizar/i.test(s.originalText) ? "interconsulta" : /cita|agendar/i.test(s.originalText) ? "cita" : "cuidado_vigilancia";
    return { id: id("orden"), type, data: medication || { text: s.originalText }, statementId: s.id,
      provenance: s.provenance, validationStatus: "pendiente_validadores_clinicos", confirmed: false };
  });
}

function redaccionClinica(statement) {
  let texto = statement.normalizedText.replace(/^(?:luego|entonces)\s+/iu, "").trim();
  texto = capitalizar(texto).replace(/[. ]+$/, "");
  if (statement.informant !== "informante_no_identificado" && statement.informant !== "paciente"
      && !new RegExp(`^${statement.informant}\\b`, "iu").test(texto)) {
    texto = `Según ${statement.informant === "expediente" ? "el expediente" : `la ${statement.informant}`}, ${texto[0]?.toLowerCase() || ""}${texto.slice(1)}`;
  }
  return `${texto}.`;
}

function contenidoMedicamento(item) {
  const estado = item.assertionStatus === "suspendido" ? "suspendido" : item.assertionStatus === "negado" ? "negado" : "referido";
  const revision = item.sourceUncertainty?.length ? "; origen con incertidumbre de reconocimiento, confirmar" : "";
  return `${capitalizar(item.displayName)} — ${item.dose ? `dosis ${item.dose}${item.unit ? ` ${item.unit}` : ""}` : "dosis no especificada"}; ${item.route ? `vía ${item.route}` : "vía no especificada"}; ${item.frequency ? `frecuencia ${item.frequency}` : "frecuencia no especificada"}; adherencia ${item.adherence.replaceAll("_", " ")}; estado ${estado}${revision}.`;
}

function redaccionRiesgo(statement) {
  if (!statement.uncertaintyReasons.length) return redaccionClinica(statement);
  const conceptos = RIESGOS.filter(([, regex]) => regex.test(statement.originalText)).map(([type]) => type.replaceAll("_", " "));
  const estado = statement.assertionStatus === ESTADOS_AFIRMACION.NEGADO ? "una negación" : statement.assertionStatus === ESTADOS_AFIRMACION.INCIERTO ? "una mención incierta" : "una mención";
  const fuente = statement.informant === "informante_no_identificado" ? "informante no identificado" : statement.informant;
  return `Se detectó ${estado} de ${conceptos.join(", ")} en un fragmento con posible error de reconocimiento; confirmar con ${fuente}.`;
}

export function generarSecciones(statements = [], { noteType = "evolucion", format = "mixto", medications = [] } = {}) {
  const permitidas = noteType === "nota_rapida" ? new Set(["motivo_consulta", "padecimiento_actual", "examen_mental", "evaluacion_riesgo", "impresion_clinica", "plan"]) : new Set(SECCIONES_NOTA);
  const sections = [];
  const informantes = Array.from(new Set(statements.map((s) => s.informant).filter((value) => !["paciente", "informante_no_identificado"].includes(value))));
  if (informantes.length && permitidas.has("fuente_confiabilidad")) {
    sections.push({ id: id("seccion"), section: "fuente_confiabilidad", title: "fuente y confiabilidad",
      content: `Información aportada por ${informantes.map((value) => value === "expediente" ? "el expediente" : `la ${value}`).join(", ")}. La confiabilidad no fue especificada en el dictado.`,
      format, sourceStatementIds: statements.filter((s) => informantes.includes(s.informant)).map((s) => s.id), confidence: null,
      reviewStatus: "pendiente", accepted: false, version: 1 });
  }
  if (medications.length && permitidas.has("medicamentos")) {
    sections.push({ id: id("seccion"), section: "medicamentos", title: "medicamentos",
      content: medications.map(contenidoMedicamento).join("\n"), format, sourceStatementIds: medications.map((m) => m.statementId),
      confidence: null, reviewStatus: "pendiente", accepted: false, version: 1 });
  }
  for (const section of SECCIONES_NOTA) {
    if (!permitidas.has(section) || ["fuente_confiabilidad", "medicamentos"].includes(section)) continue;
    const candidates = statements.filter((s) => s.proposedSection === section);
    const source = section === "evaluacion_riesgo" ? candidates : candidates.filter((s) => !s.uncertaintyReasons.length);
    if (!source.length) continue;
    sections.push({ id: id("seccion"), section, title: section.replaceAll("_", " "),
      content: source.map(section === "evaluacion_riesgo" ? redaccionRiesgo : redaccionClinica).join("\n"), format, sourceStatementIds: source.map((s) => s.id),
      confidence: null, reviewStatus: "pendiente", accepted: false, version: 1 });
  }
  return sections;
}

export function ejecutarPipelineClinico(transcripcion, contexto = {}, options = {}) {
  const segments = segmentarTranscripcion(transcripcion, contexto);
  const statements = extraerAfirmacionesClinicas(segments, contexto);
  const medicationStatements = extraerMedicamentos(statements);
  const mentalStatusFindings = extraerHallazgosMentales(statements);
  const riskStatements = detectarRiesgosEstructurados(statements);
  const contradictions = detectarContradicciones(statements);
  const orderProposals = crearPropuestasIndicaciones(statements, medicationStatements);
  const sections = generarSecciones(statements, { ...options, medications: medicationStatements });
  const uncertaintyIssues = statements.filter((s) => s.uncertaintyReasons.length).map((s) => ({
    id: id("validacion"), type: "incertidumbre_transcripcion", severity: "media",
    message: `Revisar una afirmación con posible error de reconocimiento (${s.uncertaintyReasons.join(", ")}).`,
    statementIds: [s.id], evidence: [s.originalText], requiresExplicitReview: true
  }));
  const validationIssues = [
    ...contradictions, ...uncertaintyIssues,
    ...riskStatements.filter((risk) => risk.critical).map((risk) => ({ id: id("validacion"), type: "riesgo_critico", severity: "alta",
      concept: risk.type, message: `Confirmar individualmente ${risk.type.replaceAll("_", " ")} y su informante.`,
      statementIds: [risk.statementId], evidence: [risk.text], requiresExplicitReview: true }))
  ];
  const provenanceRecords = statements.map((s) => ({ id: id("procedencia"), concept: s.concept, originalText: s.originalText,
    sourceType: s.provenance.sourceType, sourceSegmentId: s.sourceSegmentId, patientId: s.provenance.patientId,
    sessionId: s.provenance.sessionId, speaker: s.speaker, informant: s.informant, confidence: s.confidence, status: "pendiente_revision" }));
  return {
    segments, statements, medicationStatements,
    substanceUseStatements: statements.filter((s) => s.proposedSection === "consumo_sustancias"),
    mentalStatusFindings, riskStatements,
    diagnosisStatements: statements.filter((s) => ["diagnosticos", "impresion_clinica"].includes(s.proposedSection)),
    planItems: statements.filter((s) => s.proposedSection === "plan" && esPlanExplicito(s.originalText)),
    orderProposals, sections, contradictions, validationIssues, provenanceRecords
  };
}

export function validarAislamientoContexto(item, contexto = {}) {
  return (!contexto.patientId || item.patientId === contexto.patientId || item.provenance?.patientId === contexto.patientId)
    && (!contexto.sessionId || item.sessionId === contexto.sessionId || item.provenance?.sessionId === contexto.sessionId);
}
