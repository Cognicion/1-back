import {
  construirNombreCompletoPaciente,
  normalizarAliasPaciente,
  normalizarTextoBusquedaPaciente
} from "../../../utils/nombresPacientes.js?v=20260814-patient-alias-v1";

export const NAME_PARTICLES = Object.freeze([
  "de",
  "del",
  "de la",
  "de las",
  "de los",
  "la",
  "las",
  "los",
  "san",
  "santa"
]);

export const PATIENT_NAME_SOURCE_FORMATS = Object.freeze({
  HOSPITAL_SURNAMES_FIRST: "hospital_surnames_first",
  NAMES_FIRST: "names_first",
  ALREADY_STRUCTURED: "already_structured",
  UNKNOWN: "unknown"
});

const HONORIFIC_PREFIXES = /^(dr|dra|lic|sr|sra|paciente)\.?\s+/i;
const SUFFIXES = new Set(["jr", "jr.", "ii", "iii"]);
const COMMON_SECOND_GIVEN_NAMES = new Set([
  "antonio",
  "carlos",
  "cecilio",
  "fernanda",
  "fernando",
  "guadalupe",
  "jose",
  "josé",
  "juan",
  "luis",
  "maria",
  "maría"
]);
const COMMON_GIVEN_NAMES = new Set([
  "ana",
  "antonio",
  "brian",
  "carmen",
  "carlos",
  "cecilio",
  "efrain",
  "enedina",
  "fernanda",
  "fernando",
  "filemon",
  "guadalupe",
  "ismerai",
  "jose",
  "juan",
  "luis",
  "maria"
]);

const NAMES_FIRST_STRUCTURED_LABELS = new Set([
  "nombre completo del paciente",
  "nombre del paciente",
  "nombre completo",
  "paciente",
  "nombre del usuario",
  "nombre del derechohabiente"
]);

const NON_ALIAS_PARENTHETICAL_TERMS = /\b(?:casad[ao]|de\s+solter[ao]|viud[ao]|nacid[ao]|antes|expediente|edad|a(?:n|ñ)os?)\b/i;

function isLikelyPatientAlias(value = "") {
  const alias = normalizarAliasPaciente(value);
  const tokens = alias.split(/\s+/).filter(Boolean);
  return Boolean(
    alias
    && tokens.length <= 4
    && !NON_ALIAS_PARENTHETICAL_TERMS.test(alias)
    && !/\d/.test(alias)
    && /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)*$/u.test(alias)
  );
}

/**
 * Separa un alias explícito situado entre paréntesis al inicio o al final de
 * un campo estructurado de nombre. Los paréntesis internos se conservan para
 * no reinterpretar nombres libres sin evidencia suficiente.
 */
export function splitPatientNameAndAlias(value = "") {
  const originalValue = cleanName(value);
  const startMatch = originalValue.match(/^\(([^()]+)\)\s+(.+)$/u);
  const endMatch = originalValue.match(/^(.+?)\s+\(([^()]+)\)$/u);
  const aliasCandidate = startMatch?.[1] || endMatch?.[2] || "";
  const legalName = cleanName(startMatch?.[2] || endMatch?.[1] || originalValue);
  const alias = normalizarAliasPaciente(aliasCandidate);
  const legalTokenCount = legalName.split(/\s+/).filter(Boolean).length;

  if (!aliasCandidate || legalTokenCount < 2 || !isLikelyPatientAlias(alias)) {
    return { legalName: originalValue, alias: "", detected: false };
  }

  return {
    legalName,
    alias,
    detected: true,
    ruleApplied: "structured-parenthetical-alias"
  };
}

function cleanName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function stripPrefixForAnalysis(value = "") {
  return cleanName(value).replace(HONORIFIC_PREFIXES, "").trim();
}

function isSuffix(token = "") {
  return SUFFIXES.has(String(token || "").toLowerCase());
}

function tokenKey(token = "") {
  return normalizarTextoBusquedaPaciente(token);
}

function normalizeSourceFormat(options = {}) {
  const value = String(options.sourceFormat || options.nameOrder || "").trim().toLowerCase();
  if ([PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST, "paternal-maternal-given"].includes(value)) {
    return PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST;
  }
  if ([PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST, "given-paternal-maternal"].includes(value)) {
    return PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST;
  }
  if (value === PATIENT_NAME_SOURCE_FORMATS.ALREADY_STRUCTURED) return value;
  return PATIENT_NAME_SOURCE_FORMATS.UNKNOWN;
}

function consumeSurnameFromStart(tokens = [], startIndex = 0) {
  if (startIndex >= tokens.length) return { value: "", nextIndex: startIndex };
  const first = tokenKey(tokens[startIndex]);
  const second = tokenKey(tokens[startIndex + 1]);
  let nextIndex = startIndex + 1;

  if (first === "de" && ["la", "las", "los"].includes(second) && tokens[startIndex + 2]) {
    nextIndex = startIndex + 3;
  } else if (["de", "del", "la", "las", "los", "san", "santa"].includes(first) && tokens[startIndex + 1]) {
    nextIndex = startIndex + 2;
  }

  return {
    value: tokens.slice(startIndex, nextIndex).join(" "),
    nextIndex
  };
}

function hospitalNameParts(tokens = [], originalValue = "") {
  const commaParts = stripPrefixForAnalysis(originalValue).split(",").map(cleanName).filter(Boolean);
  let paternal;
  let maternal;
  let nombres;
  if (commaParts.length === 2) {
    const surnameTokens = commaParts[0].split(/\s+/).filter(Boolean);
    paternal = consumeSurnameFromStart(surnameTokens, 0);
    maternal = consumeSurnameFromStart(surnameTokens, paternal.nextIndex);
    nombres = commaParts[1];
    if (maternal.nextIndex !== surnameTokens.length) return null;
  } else {
    paternal = consumeSurnameFromStart(tokens, 0);
    maternal = consumeSurnameFromStart(tokens, paternal.nextIndex);
    nombres = tokens.slice(maternal.nextIndex).join(" ");
  }
  if (!paternal.value || !maternal.value || !nombres) return null;
  return {
    nombres,
    apellidoPaterno: paternal.value,
    apellidoMaterno: maternal.value,
    confidence: "medium",
    requiresReview: true,
    ruleApplied: "institutional-paternal-maternal-given",
    nameOrder: "paternal-maternal-given",
    sourceFormat: PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST,
    originalValue,
    normalizedForMatching: normalizarTextoBusquedaPaciente(originalValue)
  };
}

function hasStructuredNameEvidence(evidence = {}) {
  return ["paragraph-multi-label", "table-label-adjacent-cell", "table-multi-label"]
    .includes(String(evidence.detectionMethod || ""));
}

function hasNamesFirstStructuredLabel(evidence = {}) {
  return NAMES_FIRST_STRUCTURED_LABELS.has(tokenKey(evidence.sourceLabel));
}

export function inferStructuredPatientNameFormat(fullName = "", evidence = {}) {
  if (evidence.alreadyStructured) return PATIENT_NAME_SOURCE_FORMATS.ALREADY_STRUCTURED;
  if (!hasStructuredNameEvidence(evidence)) return PATIENT_NAME_SOURCE_FORMATS.UNKNOWN;

  const analysisValue = stripPrefixForAnalysis(fullName);
  if (analysisValue.includes(",")) return PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST;
  const tokens = analysisValue.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return PATIENT_NAME_SOURCE_FORMATS.UNKNOWN;
  if (COMMON_GIVEN_NAMES.has(tokenKey(tokens[0]))) return PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST;

  const hospitalParts = hospitalNameParts(tokens, analysisValue);
  const firstHospitalGivenName = hospitalParts?.nombres?.split(/\s+/)[0] || "";
  if (COMMON_GIVEN_NAMES.has(tokenKey(firstHospitalGivenName))) {
    return PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST;
  }
  // Un campo etiquetado como nombre completo aporta evidencia estructural de
  // orden de visualización. Cuando no hay coma ni señal léxica hospitalaria,
  // se interpreta como NOMBRE(S) + APELLIDOS y se conserva revisión manual.
  if (hasNamesFirstStructuredLabel(evidence)) {
    return PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST;
  }
  return PATIENT_NAME_SOURCE_FORMATS.UNKNOWN;
}

function takeCompoundPaternal(tokens = [], paternalStart) {
  if (paternalStart <= 0) return paternalStart;
  const beforeOne = tokenKey(tokens[paternalStart - 1]);
  const beforeTwo = paternalStart > 1 ? `${tokenKey(tokens[paternalStart - 2])} ${beforeOne}` : "";
  const beforeThree = paternalStart > 2 ? `${tokenKey(tokens[paternalStart - 3])} ${beforeTwo}` : "";
  if (["de la", "de las", "de los"].includes(beforeTwo)) return paternalStart - 2;
  if (["de la", "de las", "de los"].includes(beforeThree)) return paternalStart - 3;
  if (["de", "del", "la", "las", "los", "san", "santa"].includes(beforeOne)) return paternalStart - 1;
  return paternalStart;
}

export function buildFullPatientName(parts = {}) {
  return construirNombreCompletoPaciente(parts);
}

export function suggestPatientNameParts(fullName = "", options = {}) {
  const originalValue = cleanName(fullName);
  const analysisValue = stripPrefixForAnalysis(originalValue);
  let tokens = analysisValue.split(/\s+/).filter(Boolean);
  while (tokens.length && isSuffix(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  const sourceFormat = normalizeSourceFormat(options);

  if (!tokens.length) {
    return { nombres: "", apellidoPaterno: "", apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "ambiguous-name", originalValue };
  }
  if (tokens.length === 1) {
    return { nombres: tokens[0], apellidoPaterno: "", apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "single-name-only", originalValue };
  }
  if (tokens.length === 2) {
    return { nombres: tokens[0], apellidoPaterno: tokens[1], apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "single-surname-only", originalValue };
  }
  if (sourceFormat === PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST && tokens.length >= 3) {
    const hospitalParts = hospitalNameParts(tokens, originalValue);
    if (hospitalParts) return hospitalParts;
  }
  if (sourceFormat === PATIENT_NAME_SOURCE_FORMATS.UNKNOWN && options.preserveAmbiguous) {
    return {
      nombres: originalValue,
      apellidoPaterno: "",
      apellidoMaterno: "",
      confidence: "low",
      requiresReview: true,
      ruleApplied: "ambiguous-source-order",
      sourceFormat: PATIENT_NAME_SOURCE_FORMATS.UNKNOWN,
      originalValue,
      normalizedForMatching: normalizarTextoBusquedaPaciente(originalValue)
    };
  }
  if (tokens.length === 3 && COMMON_SECOND_GIVEN_NAMES.has(tokenKey(tokens[1]))) {
    return {
      nombres: tokens.slice(0, 2).join(" "),
      apellidoPaterno: tokens[2],
      apellidoMaterno: "",
      confidence: "low",
      requiresReview: true,
      ruleApplied: "single-surname-with-compound-given-name",
      originalValue,
      normalizedForMatching: normalizarTextoBusquedaPaciente(originalValue)
    };
  }

  const maternalStart = tokens.length - 1;
  const paternalEnd = maternalStart;
  const paternalStart = takeCompoundPaternal(tokens, paternalEnd - 1);
  const nombres = tokens.slice(0, paternalStart).join(" ");
  const apellidoPaterno = tokens.slice(paternalStart, paternalEnd).join(" ");
  const apellidoMaterno = tokens.slice(maternalStart).join(" ");
  const compound = paternalStart < paternalEnd - 1;

  return {
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    confidence: compound ? "medium" : "high",
    requiresReview: true,
    ruleApplied: compound ? "compound-paternal-surname" : "last-two-surnames",
    originalValue,
    normalizedForMatching: normalizarTextoBusquedaPaciente(originalValue)
  };
}

export function buildNameFieldsFromExplicitParts(fields = {}) {
  const nombres = fields.nombres?.value || "";
  const apellidoPaterno = fields.apellidoPaterno?.value || "";
  const apellidoMaterno = fields.apellidoMaterno?.value || "";
  const nombreCompleto = buildFullPatientName({ nombres, apellidoPaterno, apellidoMaterno });
  if (!nombreCompleto) return {};
  return {
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreCompleto,
    nombreSource: "explicit-separated-fields",
    sourceFormat: PATIENT_NAME_SOURCE_FORMATS.ALREADY_STRUCTURED
  };
}
