const crypto = require("crypto");
const {
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_EMBEDDING_ENGINE_VERSION,
  CLINICAL_RECORD_SOURCE_CATALOG
} = require("./config");
const { analyticsPatientId } = require("./deidentification");

const DIRECT_IDENTIFIER_KEYS = /^(?:id|uid|uuid|name|nombre|nombres|nombrepaciente|pacientenombre|patientname|nombrecompleto|displayname|apellido|apellidos|apellidopaterno|apellidomaterno|paciente|patient|telefono|tel|phone|celular|email|correo|domicilio|direccion|curp|rfc|patientid|pacienteid|pacienteuid|uidpaciente|expediente|numeroexpediente|fotografia|foto|documento|archivo|filename|nombrearchivo|archivonombre|archivourl|archivostoragepath|storagepath|storageurl|downloadurl|url|path|ruta|creadopor|actualizadopor|medico|doctor|profesional|informante|responsable|acompanante|tutor|contacto|medicouid|uidmedico|usuarioid|owneruid|firma|cedula)$/i;
const OPERATIONAL_KEYS = /^(?:rol|roles|role|admin|esadmin|isadmin|password|contrasena|token|claims|permisos|permisosmedicos|preferencias|apariencia|legalconsents|session|sesion|lastlogin|ultimoacceso|paquetesformatosasignados|formatosmanualesasignados|transferoperationid|importacionid|hash|texthash|sourcefilehash|importmethod|duplicatestatus|base64|blob|bytes|binary|mimetype|contenttype|filesize|tamanoarchivo)$/i;
const PROFILE_ALLOWED_KEYS = /^(?:edad|sexo|sexoregistrado|genero|escolaridad|ocupacion|estadocivil|convivencia|redapoyo|antecedentes|antecedentespsiquiatricos|antecedentesmedicos|antecedentesquirurgicos|antecedentesfamiliares|hospitalizaciones|intentosuicida|autolesiones|violencia|consumosustancias|diagnostico|diagnosticos|historialdiagnosticos|tratamientos|alergias|peso|talla|imc|fechanacimiento)$/i;
const DATE_KEYS = /(?:fecha|date|time|timestamp|created|updated|at$)/i;
const CLINICAL_ENTITY_NAME_SOURCES = new Set([
  "tratamientos",
  "indicaciones",
  "recetas",
  "prescripcionesPediatricas",
  "estudios",
  "solicitudesEstudios",
  "laboratorios",
  "escalasAplicadas",
  "resultadosEscalas"
]);
const CLINICAL_ENTITY_PATH = /(?:diagnostic|tratamiento|medicamento|farmaco|principio_activo|escala|laboratorio|analito|estudio|procedimiento|intervencion|sintoma|alergia)/i;
const CLINICAL_ENTITY_LEAF = /^(?:nombre|name|diagnostico|medicamento|farmaco|principio_activo|escala|analito|estudio|procedimiento|intervencion|sintoma|alergia)$/i;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patientIdentityTerms(patient = {}) {
  const fullName = [patient.nombres, patient.apellidoPaterno, patient.apellidoMaterno]
    .filter(Boolean)
    .join(" ");
  return [
    patient.nombre,
    patient.nombres,
    patient.nombreCompleto,
    patient.displayName,
    patient.apellidos,
    patient.apellidoPaterno,
    patient.apellidoMaterno,
    fullName,
    patient.telefono,
    patient.phone,
    patient.email,
    patient.correo,
    patient.curp,
    patient.rfc,
    patient.numeroExpediente,
    patient.expediente,
    patient.domicilio,
    patient.direccion
  ].map((item) => String(item || "").trim()).filter((item) => item.length >= 3);
}

function replaceIdentityTerms(text, identityTerms) {
  return [...new Set(identityTerms)]
    .sort((a, b) => b.length - a.length)
    .reduce((result, term) => result.replace(new RegExp(escapeRegExp(term), "giu"), "[dato desidentificado]"), text);
}

function redactSemanticText(value, identityTerms = [], { preserveClinicalEntity = false } = {}) {
  let text = replaceIdentityTerms(String(value ?? ""), identityTerms);
  text = text
    .replace(/https?:\/\/\S+|www\.\S+/giu, "[enlace omitido]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[correo omitido]")
    .replace(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/giu, "[identificador omitido]")
    .replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/giu, "[identificador omitido]")
    .replace(/\b(?:expediente|registro|folio)\s*(?:n(?:ú|u)m(?:ero)?\.?|#|:)?\s*[A-Z0-9-]{4,}\b/giu, "[expediente omitido]")
    .replace(/\b(?:\+?\d[\s().-]*){8,}\b/gu, "[teléfono omitido]")
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gu, "[fecha omitida]")
    .replace(/\b(?:calle|avenida|av\.?|domicilio|direcci[oó]n|colonia)\b[^.;\n]{0,120}/giu, "[domicilio omitido]")
    .replace(/\b(?:paciente|nombre|familiar|madre|padre|herman[oa]|hij[oa]|responsable|acompa[nñ]ante)\s*(?::|-|es)?\s*[A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+){1,3}\b/giu, "[persona omitida]")
    .replace(/\b(?:dr|dra|doctor|doctora|lic|licenciada|licenciado)\.?\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+){1,3}\b/gu, "[profesional omitido]")
    .replace(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü'’-]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü'’-]{2,}){0,3}(?=\s+(?:refiere|comenta|indica|menciona|señala|acude|acompaña|informa)\b)/gu, "[persona omitida]")
    .replace(/\b[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,3}\b/gu, "[persona omitida]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, "[red omitida]")
    .replace(/\s+/gu, " ")
    .trim();
  if (!preserveClinicalEntity) {
    text = text.replace(
      /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü'’-]{2,}(?:(?:\s+(?:de|del|la|las|los|y))?\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü'’-]{2,}){1,3}\b/gu,
      "[persona o entidad omitida]"
    );
  }
  return text;
}

function monthBucket(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 7);
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString().slice(0, 7);
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 7);
}

function observedMonth(record = {}) {
  const candidates = [
    record.observedAt,
    record.fecha,
    record.fechaISO,
    record.fechaCreacion,
    record.fechaActualizacion,
    record.createdAt,
    record.updatedAt
  ];
  return candidates.map(monthBucket).find(Boolean) || null;
}

function safePathSegment(value) {
  return String(value || "campo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "campo";
}

function preservesClinicalEntity(path, options) {
  const parts = String(path || "").split(".");
  const leaf = parts.at(-1) || "";
  const parentPath = parts.slice(0, -1).join(".");
  if (!CLINICAL_ENTITY_LEAF.test(leaf)) return false;
  return CLINICAL_ENTITY_PATH.test(parentPath)
    || (parts.length === 2 && CLINICAL_ENTITY_NAME_SOURCES.has(options.sourceCollection));
}

function primitiveFact(path, value, options) {
  if (typeof value === "boolean") return `${path}: ${value ? "sí" : "no"}`;
  if (typeof value === "number") return Number.isFinite(value) ? `${path}: ${value}` : null;
  if (typeof value !== "string") return null;
  const redacted = redactSemanticText(value, options.identityTerms, {
    preserveClinicalEntity: preservesClinicalEntity(path, options)
  });
  if (!redacted || /^\[(?:dato desidentificado|enlace omitido|correo omitido|identificador omitido|teléfono omitido|fecha omitida|domicilio omitido|profesional omitido|persona omitida)\]$/u.test(redacted)) return null;
  return `${path}: ${redacted}`;
}

function collectSemanticFacts(value, options, path = "registro", depth = 0, facts = []) {
  if (depth > 8 || value === null || value === undefined || facts.length >= 5000) return facts;
  if (typeof value !== "object" || value instanceof Date) {
    const fact = primitiveFact(path, value instanceof Date ? value.toISOString().slice(0, 7) : value, options);
    if (fact) facts.push(fact);
    return facts;
  }
  if (typeof value.toDate === "function" || typeof value.seconds === "number") {
    const dateValue = monthBucket(value);
    if (dateValue) facts.push(`${path}: ${dateValue}`);
    return facts;
  }
  if (Array.isArray(value)) {
    value.slice(0, 250).forEach((item) => collectSemanticFacts(item, options, path, depth + 1, facts));
    return facts;
  }
  Object.entries(value).forEach(([key, item]) => {
    const normalizedKey = safePathSegment(key);
    const safeClinicalName = /^(?:nombre|name)$/i.test(normalizedKey)
      && (CLINICAL_ENTITY_PATH.test(path)
        || (depth === 0 && CLINICAL_ENTITY_NAME_SOURCES.has(options.sourceCollection)));
    if ((DIRECT_IDENTIFIER_KEYS.test(normalizedKey) && !safeClinicalName) || OPERATIONAL_KEYS.test(normalizedKey)) return;
    const identifierKey = /(?:id|uid)$/i.test(String(key)) || /^(?:id|uid)(?:[A-Z_]|$)/.test(String(key));
    if (identifierKey && !/^(?:codigo|cie10|cie11|dsm)$/i.test(normalizedKey)) return;
    if (options.profileOnly && depth === 0 && !PROFILE_ALLOWED_KEYS.test(normalizedKey)) return;
    const redactedKey = redactSemanticText(key, options.identityTerms);
    const nextPath = `${path}.${redactedKey.includes("[") ? "campo_desidentificado" : safePathSegment(redactedKey)}`;
    if (DATE_KEYS.test(key)) {
      const bucket = monthBucket(item);
      if (bucket) facts.push(`${nextPath}: ${bucket}`);
      return;
    }
    collectSemanticFacts(item, options, nextPath, depth + 1, facts);
  });
  return facts;
}

function splitLongFact(fact, maxLength) {
  if (fact.length <= maxLength) return [fact];
  const parts = [];
  let rest = fact;
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf(" ", maxLength);
    if (cut < Math.floor(maxLength * 0.6)) cut = maxLength;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function chunkFacts(facts, header) {
  const maxLength = CLINICAL_EMBEDDING_CONFIG.maxFragmentCharacters;
  const maxBodyLength = Math.max(500, maxLength - header.length - 2);
  const lines = facts.flatMap((fact) => splitLongFact(fact, maxBodyLength));
  const chunks = [];
  let current = header;
  for (const line of lines) {
    const candidate = `${current}\n${line}`;
    if (candidate.length > maxLength && current !== header) {
      chunks.push(current);
      current = `${header}\n${line}`;
    } else {
      current = candidate;
    }
    if (chunks.length >= CLINICAL_EMBEDDING_CONFIG.maxFragmentsPerRecord) break;
  }
  if (current !== header && chunks.length < CLINICAL_EMBEDDING_CONFIG.maxFragmentsPerRecord) chunks.push(current);
  return chunks.slice(0, CLINICAL_EMBEDDING_CONFIG.maxFragmentsPerRecord);
}

function assertDeidentifiedSemanticText(text, identityTerms = []) {
  const lower = String(text || "").toLocaleLowerCase("es-MX");
  const leakedTerm = identityTerms.find((term) => term.length >= 3 && lower.includes(term.toLocaleLowerCase("es-MX")));
  const leakedPattern = /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b|\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b|\b(?:\+?\d[\s().-]*){8,}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/iu.test(text);
  if (leakedTerm || leakedPattern) {
    throw new TypeError("El fragmento semántico contiene un identificador directo no permitido.");
  }
}

function buildDeidentifiedSemanticDocument({ patientId, patient = {}, sourceCollection, sourceRecordId, record = {} }) {
  const source = CLINICAL_RECORD_SOURCE_CATALOG[sourceCollection];
  if (!source) return null;
  const identityTerms = patientIdentityTerms(patient);
  const facts = [...new Set(collectSemanticFacts(record, {
    identityTerms,
    profileOnly: source.rootDocument === true,
    sourceCollection
  }))];
  const header = `Fuente clínica: ${source.label}. Dominio: ${source.domain}.`;
  const chunks = chunkFacts(facts, header);
  chunks.forEach((chunk) => assertDeidentifiedSemanticText(chunk, identityTerms));
  const analyticsId = analyticsPatientId(patientId);
  const sourceRecordHash = sha256(`${analyticsId}:${sourceCollection}:${sourceRecordId}`);
  const fragments = chunks.map((content, fragmentIndex) => ({
    fragmentIndex,
    content,
    contentHash: sha256(content)
  }));
  return {
    analyticsPatientId: analyticsId,
    sourceCollection,
    sourceLabel: source.label,
    sourceDomain: source.domain,
    sourceRecordHash,
    observedMonth: observedMonth(record),
    contentFingerprint: sha256(fragments.map((fragment) => fragment.contentHash).join(":")),
    fragments,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    directIdentifiersIncluded: false,
    rawClinicalTextPersisted: false
  };
}

module.exports = {
  assertDeidentifiedSemanticText,
  buildDeidentifiedSemanticDocument,
  collectSemanticFacts,
  patientIdentityTerms,
  redactSemanticText,
  sha256
};
