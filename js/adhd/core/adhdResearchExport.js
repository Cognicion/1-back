import { ADHD_PROTOCOL_ID, ADHD_PROTOCOL_VERSION } from "../config/adhdProtocol.js";

export const ADHD_RESEARCH_EXPORT_VERSION = "1.0.0";

const SAFE_IDENTIFIER_KEYS = new Set([
  "protocolid", "taskid", "domainid", "moduleid", "phase", "type"
]);

const SAFE_IDENTIFIER_LIST_KEYS = new Set([
  "taskids", "sourcetaskids", "domainids", "moduleids"
]);

const DIRECT_IDENTIFIER_KEYS = new Set([
  "name", "nombre", "fullname", "nombrecompleto", "firstname", "lastname", "surname",
  "apellido", "apellidos", "curp", "rfc", "email", "correo", "phone", "telefono",
  "mobile", "celular", "address", "direccion", "postalcode", "codigopostal",
  "birthdate", "dateofbirth", "fechanacimiento", "medicalrecord", "medicalrecordid",
  "expediente", "expedienteid", "patientid", "pacienteid", "userid", "usuarioid", "uid",
  "clinicianid", "medicoid", "teacherid", "caregiverid", "contact", "contacto", "username",
  "ip", "ipaddress", "deviceid", "hardwareid", "browserfingerprint", "firebaseauthuid",
  "accountid", "insurancenumber", "socialsecuritynumber", "geolocation", "latitude", "longitude"
]);

const LINKABLE_SOURCE_KEYS = new Set([
  "sessionid", "assessmentid", "profileid", "programid", "recordid", "documentid",
  "sourceid", "firebaseid", "firestorepath", "path", "ruta", "collectionpath", "subjectcode"
]);

const FREE_TEXT_KEYS = new Set([
  "note", "notes", "nota", "notas", "comment", "comments", "comentario", "comentarios",
  "observation", "observations", "observacion", "observaciones", "freetext", "textolibre",
  "technicalnotes", "reasontext", "description", "prompt", "prompts", "prompttext",
  "systemprompt", "userprompt", "assistantprompt", "taskprompt", "clinicalprompt",
  "interruption", "interruptions", "interruptionreason", "interruptiondetails",
  "message", "messages", "transcript", "transcripts", "speechtranscript", "voicetranscript",
  "rawresponse", "rawresponses", "patientresponse", "patientresponses", "verbatimresponse",
  "narrative", "narratives", "clinicalnarrative",
  "strategy", "strategies", "estrategia", "estrategias",
  "application", "applications", "aplicacion", "aplicaciones",
  "applicationprompt", "strategyprompt", "goalaction", "goalcontext", "goaltarget",
  "goalfrequency", "goalapplication", "progressnote"
]);

const CONDITIONAL_FREE_TEXT_KEYS = new Set([
  "action", "accion", "context", "contexto", "target", "meta", "frequency", "frecuencia"
]);

const SAFE_RESEARCH_STRING_KEYS = new Set([
  "protocolid", "taskid", "domainid", "moduleid", "phase", "type", "kind", "status",
  "source", "unit", "mode", "method", "channel", "condition", "band", "decision",
  "adjusteddimension", "directionalinterpretation", "valuetype", "schema", "scoretype",
  "payloadtype", "algorithm", "deviceclass", "inputmode", "browser", "laterality", "ageband",
  "orientation", "activityid", "templateid", "metricid", "measureid"
]);

const EXACT_TIME_KEYS = new Set([
  "createdat", "updatedat", "startedat", "completedat", "pausedat", "interruptedat",
  "createdatiso", "updatedatiso", "startedatiso", "completedatiso", "pausedatiso", "interruptedatiso",
  "timestamp", "datetime", "date", "fecha", "reviewdate", "assessmenttime", "duedate", "dueatiso"
]);

const EXACT_TIME_KEY_PATTERN = /^(?:created|creation|updated|modified|started|completed|completion|ended|finished|paused|interrupted|occurred|recorded|submitted|generated|archived|scheduled|due|review|assessment|session|visit|evaluation|exported|imported|lastmodified|lastupdated|lastseen)(?:at(?:iso)?|date(?:iso)?|time|timestamp)$/u;
const FREE_TEXT_KEY_PATTERN = /^(?:(?:system|user|assistant|task|clinical)?prompts?(?:text|template|content|body|value)?|(?:interruption|interrupted)(?:s|reason|details?|notes?|events?|summary|context|description)?|messages?|(?:speech|voice)?transcripts?|(?:raw|patient|verbatim)responses?|(?:clinical)?narratives?)$/u;

export function buildAdhdResearchDataset(input = {}, options = {}) {
  const subjectCode = String(options.subjectCode || input.subjectCode || "").trim();
  validateSubjectCode(subjectCode);
  const sensitiveTerms = collectSensitiveTerms(input);
  if (sensitiveTerms.some((term) => equalsInsensitive(term, subjectCode))) {
    throw new TypeError("El código seudónimo no puede reutilizar un identificador directo conocido.");
  }
  const audit = { removedFields: [], redactedValues: [], datePolicy: options.datePolicy || "remove" };
  const source = { ...input };
  delete source.subjectCode;
  const data = sanitizeValue(source, [], {
    audit,
    sensitiveTerms,
    datePolicy: options.datePolicy || "remove",
    keepFreeText: false,
    redactTerms: Array.isArray(options.redactTerms) ? options.redactTerms.map(String) : []
  });
  const dataset = {
    researchExportVersion: ADHD_RESEARCH_EXPORT_VERSION,
    schema: "cognicion_adhd_research_longitudinal",
    protocolId: String(input.protocolId || ADHD_PROTOCOL_ID),
    protocolVersion: String(input.protocolVersion || ADHD_PROTOCOL_VERSION),
    subjectCode,
    pseudonymization: {
      pseudonymized: true,
      mappingIncluded: false,
      directIdentifiersIncluded: false,
      sourceRecordIdentifiersIncluded: false,
      codeAssignedOutsideExport: true,
      notice: "La tabla de correspondencia debe conservarse por separado con controles de acceso del estudio. Seudonimizado no equivale a anonimizado."
    },
    data,
    exportAudit: {
      removedFieldCount: audit.removedFields.length,
      redactedValueCount: audit.redactedValues.length,
      removedFieldCategories: summarizeRemoved(audit.removedFields),
      datePolicy: audit.datePolicy
    }
  };
  const validation = validateAdhdResearchDataset(dataset);
  if (!validation.valid) throw new TypeError(`El conjunto de investigación no superó la validación: ${validation.errors.join(", ")}.`);
  return dataset;
}

export function validateAdhdResearchDataset(dataset = {}) {
  const errors = [];
  const warnings = [];
  try {
    validateSubjectCode(String(dataset.subjectCode || ""));
  } catch (error) {
    errors.push("invalid_subject_code");
  }
  if (dataset.pseudonymization?.directIdentifiersIncluded !== false) errors.push("direct_identifier_flag_must_be_false");
  if (dataset.pseudonymization?.mappingIncluded !== false) errors.push("pseudonym_mapping_must_not_be_included");
  scanKeys(dataset.data, [], ({ key, value, path }) => {
    const normalized = normalizeKey(key);
    if (isForbiddenKey(normalized)) errors.push(`forbidden_key:${path}`);
    if (isFreeTextKey(normalized) || isConditionalFreeText(normalized, value)) errors.push(`free_text_key:${path}`);
    if ((dataset.exportAudit?.datePolicy || "remove") === "remove" && isExactTimeKey(normalized)) {
      errors.push(`exact_time_key:${path}`);
    }
  });
  if (!dataset.data || typeof dataset.data !== "object") warnings.push("research_data_empty");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    checkedWithExportVersion: ADHD_RESEARCH_EXPORT_VERSION
  };
}

export function exportAdhdResearchJson(datasetOrInput, options = {}) {
  const dataset = isBuiltDataset(datasetOrInput)
    ? datasetOrInput
    : buildAdhdResearchDataset(datasetOrInput, options);
  const validation = validateAdhdResearchDataset(dataset);
  if (!validation.valid) throw new TypeError(`Exportación JSON rechazada: ${validation.errors.join(", ")}.`);
  return JSON.stringify(dataset, null, options.pretty === false ? 0 : 2);
}

export function exportAdhdResearchCsv(datasetOrInput, options = {}) {
  const dataset = isBuiltDataset(datasetOrInput)
    ? datasetOrInput
    : buildAdhdResearchDataset(datasetOrInput, options);
  const validation = validateAdhdResearchDataset(dataset);
  if (!validation.valid) throw new TypeError(`Exportación CSV rechazada: ${validation.errors.join(", ")}.`);
  const rows = [];
  flattenForLongCsv(dataset.data, [], (path, value) => {
    rows.push({
      subjectCode: dataset.subjectCode,
      protocolId: dataset.protocolId,
      protocolVersion: dataset.protocolVersion,
      recordPath: path,
      value: serializeScalar(value),
      valueType: scalarType(value)
    });
  });
  if (!rows.length) {
    rows.push({
      subjectCode: dataset.subjectCode,
      protocolId: dataset.protocolId,
      protocolVersion: dataset.protocolVersion,
      recordPath: "data",
      value: "",
      valueType: "empty"
    });
  }
  const columns = ["subjectCode", "protocolId", "protocolVersion", "recordPath", "value", "valueType"];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ].join("\r\n");
}

export function stripAdhdDirectIdentifiers(value, options = {}) {
  const audit = { removedFields: [], redactedValues: [], datePolicy: options.datePolicy || "remove" };
  return {
    value: sanitizeValue(value, [], {
      audit,
      sensitiveTerms: [...collectSensitiveTerms(value), ...(options.redactTerms || []).map(String)],
      datePolicy: options.datePolicy || "remove",
      keepFreeText: false,
      redactTerms: []
    }),
    audit
  };
}

function sanitizeValue(value, path, policy) {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, [...path, String(index)], policy)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    if (!isSafeResearchStringPath(path)) {
      policy.audit.removedFields.push({ path: path.join("."), category: "free_text" });
      return undefined;
    }
    return redactSensitiveTerms(value, path, policy);
  }
  const output = {};
  Object.entries(value).forEach(([key, child]) => {
    const normalized = normalizeKey(key);
    const childPath = [...path, key];
    if (isForbiddenKey(normalized)) {
      policy.audit.removedFields.push({ path: childPath.join("."), category: DIRECT_IDENTIFIER_KEYS.has(normalized) ? "direct_identifier" : "source_linkage" });
      return;
    }
    if ((isFreeTextKey(normalized) || isConditionalFreeText(normalized, child)) && !policy.keepFreeText) {
      policy.audit.removedFields.push({ path: childPath.join("."), category: "free_text" });
      return;
    }
    if (isExactTimeKey(normalized)) {
      const transformed = transformDate(child, policy.datePolicy);
      if (transformed === undefined) {
        policy.audit.removedFields.push({ path: childPath.join("."), category: "exact_time" });
        return;
      }
      output[key] = transformed;
      return;
    }
    const sanitized = sanitizeValue(child, childPath, policy);
    if (sanitized !== undefined) output[key] = sanitized;
  });
  return output;
}

function isConditionalFreeText(normalizedKey, value) {
  return CONDITIONAL_FREE_TEXT_KEYS.has(normalizedKey)
    && (typeof value === "string" || Array.isArray(value) && value.some((item) => typeof item === "string"));
}

function isSafeResearchStringPath(path = []) {
  const field = [...path].reverse().find((part) => !/^\d+$|^\[\d+\]$/u.test(String(part))) || "";
  const normalized = normalizeKey(field);
  return SAFE_RESEARCH_STRING_KEYS.has(normalized)
    || SAFE_IDENTIFIER_LIST_KEYS.has(normalized)
    || normalized.endsWith("version")
    || normalized.endsWith("versionid");
}

function redactSensitiveTerms(value, path, policy) {
  let output = value;
  const terms = [...policy.sensitiveTerms, ...policy.redactTerms]
    .map((term) => String(term || "").trim())
    .filter((term) => term.length >= 3)
    .sort((left, right) => right.length - left.length);
  terms.forEach((term) => {
    const expression = new RegExp(escapeRegExp(term), "giu");
    if (expression.test(output)) {
      output = output.replace(expression, "[REDACTED]");
      policy.audit.redactedValues.push(path.join("."));
    }
  });
  return output;
}

function collectSensitiveTerms(value) {
  const terms = [];
  scanKeys(value, [], ({ key, value: child }) => {
    if (!DIRECT_IDENTIFIER_KEYS.has(normalizeKey(key))) return;
    if (typeof child === "string" || typeof child === "number") terms.push(String(child));
    if (Array.isArray(child)) child.filter((item) => typeof item === "string" || typeof item === "number").forEach((item) => terms.push(String(item)));
  });
  return [...new Set(terms)];
}

function scanKeys(value, path, visit) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanKeys(item, [...path, String(index)], visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = [...path, key];
    visit({ key, value: child, path: childPath.join(".") });
    scanKeys(child, childPath, visit);
  });
}

function flattenForLongCsv(value, path, visit) {
  if (Array.isArray(value)) {
    if (!value.length) visit(path.join("."), "[]");
    value.forEach((item, index) => flattenForLongCsv(item, [...path, `[${index}]`], visit));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) visit(path.join("."), "{}");
    entries.forEach(([key, child]) => flattenForLongCsv(child, [...path, key], visit));
    return;
  }
  visit(path.join(".") || "data", value);
}

function transformDate(value, policy) {
  if (policy === "date_only") {
    const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : undefined;
  }
  return undefined;
}

function isFreeTextKey(normalized) {
  return FREE_TEXT_KEYS.has(normalized) || FREE_TEXT_KEY_PATTERN.test(normalized);
}

function isExactTimeKey(normalized) {
  return EXACT_TIME_KEYS.has(normalized) || EXACT_TIME_KEY_PATTERN.test(normalized);
}

function isForbiddenKey(normalized) {
  if (DIRECT_IDENTIFIER_KEYS.has(normalized) || LINKABLE_SOURCE_KEYS.has(normalized)) return true;
  return (normalized.endsWith("id") && !SAFE_IDENTIFIER_KEYS.has(normalized))
    || (normalized.endsWith("ids") && !SAFE_IDENTIFIER_LIST_KEYS.has(normalized));
}

function validateSubjectCode(subjectCode) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/.test(subjectCode)) {
    throw new TypeError("Se requiere un código seudónimo externo de 6-64 caracteres (letras, números, guion o guion bajo), sin datos identificatorios.");
  }
}

function summarizeRemoved(removedFields) {
  return removedFields.reduce((summary, item) => {
    summary[item.category] = (summary[item.category] || 0) + 1;
    return summary;
  }, {});
}

function isBuiltDataset(value) {
  return value?.researchExportVersion && value?.pseudonymization && value?.data;
}

function serializeScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function scalarType(value) {
  if (value === null || value === undefined) return "null";
  return typeof value;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function equalsInsensitive(left, right) {
  return normalizeKey(left) === normalizeKey(right);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
