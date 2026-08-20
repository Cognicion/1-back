const FUNCTION_WORDS = new Set([
  "a", "al", "algo", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante", "e", "el", "ella",
  "ellas", "ellos", "en", "entre", "ese", "esa", "esos", "esas", "este", "esta", "estos", "estas", "hacia",
  "hasta", "la", "las", "lo", "los", "mas", "menos", "ni", "o", "para", "pero", "por", "que", "se", "segun",
  "sin", "sobre", "su", "sus", "tras", "un", "una", "unos", "unas", "y"
]);
const LOW_INFORMATION_WORDS = new Set([
  "mg", "mcg", "ml", "via", "oral", "tableta", "tabletas", "capsula", "capsulas", "vez", "veces", "dia", "dias",
  "cada", "dosis", "tomar", "administrar", "administracion", "paciente", "persona", "dato", "omitido", "nota", "medica", "medico", "consulta"
]);
const CLINICAL_SIGNAL = /^(ansiedad|depresion|insomnio|suicid|autolesion|agitacion|irritabilidad|psicosis|alucinacion|delirio|mania|hipomania|recaida|mejoria|hospitalizacion|reingreso|adherencia|suspension|efecto|adverso|diagnostico|tratamiento|medicamento|laboratorio|glucosa|hemoglobina|plaquetas|imc|peso|presion|frecuencia|saturacion|phq|gad|hamilton|ymrs|moca|mmse)/;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function phraseTokens(value = "") {
  return String(value).split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function isPotentiallyUsefulLexicalPhrase(value = "") {
  const tokens = phraseTokens(value);
  const contentTokens = tokens.filter((token) => !FUNCTION_WORDS.has(token) && !LOW_INFORMATION_WORDS.has(token));
  return contentTokens.some((token) => token.length >= 4 || CLINICAL_SIGNAL.test(token));
}

function sameSet(first = new Set(), second = new Set()) {
  return first.size === second.size && [...first].every((value) => second.has(value));
}

function containsPhrase(container = "", candidate = "") {
  return ` ${container} `.includes(` ${candidate} `);
}

function utilityTier(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "moderate";
  if (score >= 0.4) return "exploratory";
  return "low";
}

function assessLexicalPattern(row = {}, { threshold = 3 } = {}) {
  const tokens = phraseTokens(row.clave);
  const contentTokens = tokens.filter((token) => !FUNCTION_WORDS.has(token) && !LOW_INFORMATION_WORDS.has(token));
  const hasClinicalSignal = contentTokens.some((token) => CLINICAL_SIGNAL.test(token));
  const hasSpecificContent = isPotentiallyUsefulLexicalPhrase(row.clave);
  const noteCount = row.notas?.size || Number(row.noteCount) || 0;
  const patientCount = row.pacientes?.size || Number(row.patientCount) || 0;
  const physicianCount = row.medicos?.size || Number(row.physicianCount) || 0;
  const frequency = Number(row.frecuencia ?? row.frequency) || 0;
  const specificity = tokens.length ? contentTokens.length / tokens.length : 0;
  const components = {
    patientSupport: clamp(Math.log1p(patientCount) / Math.log1p(10)),
    noteSupport: clamp(Math.log1p(noteCount) / Math.log1p(20)),
    lexicalSpecificity: clamp(specificity),
    clinicalSignal: hasClinicalSignal ? 1 : hasSpecificContent ? 0.6 : 0
  };
  const relevanceScore = clamp(
    components.patientSupport * 0.4
    + components.noteSupport * 0.25
    + components.lexicalSpecificity * 0.25
    + components.clinicalSignal * 0.1
  );
  let rejectionReason = null;
  if (frequency < threshold) rejectionReason = "below_frequency_threshold";
  else if (tokens.length < 2 || tokens.length > 8) rejectionReason = "unsupported_phrase_length";
  else if (!hasSpecificContent) rejectionReason = "low_information_phrase";
  else if (noteCount < 2) rejectionReason = "insufficient_note_support";
  else if (patientCount < 2) rejectionReason = "insufficient_patient_support";
  else if (relevanceScore < 0.4) rejectionReason = "low_relevance_score";
  return {
    eligible: rejectionReason === null,
    rejectionReason,
    relevanceScore: Number(relevanceScore.toFixed(4)),
    utilityTier: utilityTier(relevanceScore),
    contentTokenCount: contentTokens.length,
    patientCount,
    noteCount,
    physicianCount,
    frequency,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(4))]))
  };
}

function selectUsefulLexicalPatterns(rows = [], options = {}) {
  const assessed = rows.map((row) => ({ row, assessment: assessLexicalPattern(row, options) }));
  const rejectionCounts = assessed.reduce((result, item) => {
    if (!item.assessment.rejectionReason) return result;
    result[item.assessment.rejectionReason] = (result[item.assessment.rejectionReason] || 0) + 1;
    return result;
  }, {});
  const eligible = assessed
    .filter((item) => item.assessment.eligible)
    .sort((a, b) => b.row.n - a.row.n || b.assessment.relevanceScore - a.assessment.relevanceScore || a.row.clave.localeCompare(b.row.clave));
  const closed = [];
  let redundantPatterns = 0;
  for (const candidate of eligible) {
    const redundant = closed.some((kept) => (
      kept.row.n > candidate.row.n
      && containsPhrase(kept.row.clave, candidate.row.clave)
      && kept.row.frecuencia === candidate.row.frecuencia
      && sameSet(kept.row.notas, candidate.row.notas)
      && sameSet(kept.row.pacientes, candidate.row.pacientes)
    ));
    if (redundant) {
      redundantPatterns += 1;
      continue;
    }
    closed.push(candidate);
  }
  const patterns = closed
    .sort((a, b) => b.assessment.relevanceScore - a.assessment.relevanceScore
      || b.assessment.patientCount - a.assessment.patientCount
      || b.assessment.noteCount - a.assessment.noteCount
      || b.assessment.frequency - a.assessment.frequency
      || a.row.clave.localeCompare(b.row.clave))
    .slice(0, options.maxResults || 250)
    .map(({ row, assessment }) => ({
      phrase: row.clave,
      normalizedPhrase: row.clave,
      frequency: assessment.frequency,
      noteCount: assessment.noteCount,
      patientCount: assessment.patientCount,
      physicianCount: assessment.physicianCount,
      firstSeenAt: row.primeraAparicion || null,
      lastSeenAt: row.ultimaAparicion || null,
      tokenCount: row.n,
      relevanceScore: assessment.relevanceScore,
      utilityTier: assessment.utilityTier,
      contentTokenCount: assessment.contentTokenCount,
      qualityMethod: "closed_cross_patient_lexical_pattern",
      evidenceIds: ["closed-patterns-1999"],
      nonCausal: true
    }));
  return {
    patterns,
    stats: {
      candidatesAssessed: assessed.length,
      eligibleBeforeRedundancy: eligible.length,
      redundantPatterns,
      rejected: rejectionCounts,
      retainedUsefulPatterns: patterns.length
    }
  };
}

module.exports = {
  assessLexicalPattern,
  containsPhrase,
  isPotentiallyUsefulLexicalPhrase,
  selectUsefulLexicalPatterns
};
