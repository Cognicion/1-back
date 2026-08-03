import { construirNombreCompletoPaciente, normalizarTextoBusquedaPaciente } from "../../../utils/nombresPacientes.js";

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

  if (!tokens.length) {
    return { nombres: "", apellidoPaterno: "", apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "ambiguous-name", originalValue };
  }
  if (tokens.length === 1) {
    return { nombres: tokens[0], apellidoPaterno: "", apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "single-name-only", originalValue };
  }
  if (tokens.length === 2) {
    return { nombres: tokens[0], apellidoPaterno: tokens[1], apellidoMaterno: "", confidence: "low", requiresReview: true, ruleApplied: "single-surname-only", originalValue };
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
  return { nombres, apellidoPaterno, apellidoMaterno, nombreCompleto, nombreSource: "explicit-separated-fields" };
}
