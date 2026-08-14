function valueOf(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export function normalizePatientName(value = "") {
  return String(valueOf(value) || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00a0/g, " ")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeRecordNumber(value = "") {
  return String(valueOf(value) || "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-–—._/]+/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeCurp(value = "") { return normalizeRecordNumber(value); }

export function normalizeBirthDate(value = "") {
  const raw = String(valueOf(value) || "").trim().replace(/\u00a0/g, " ");
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return normalizePatientName(raw).replace(/ /g, "");
  const [, day, month, year] = match;
  return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function readField(source = {}, ...keys) {
  for (const key of keys) {
    const value = valueOf(source?.[key]);
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function patientFieldSources(source = {}) {
  const patient = source?.patient && typeof source.patient === "object" ? source.patient : null;
  return [
    source,
    patient,
    source?.datosInstitucionales,
    patient?.datosInstitucionales
  ].filter((item, index, sources) => item && typeof item === "object" && sources.indexOf(item) === index);
}

function readPatientField(source = {}, ...keys) {
  for (const fieldSource of patientFieldSources(source)) {
    const value = readField(fieldSource, ...keys);
    if (value) return value;
  }
  return "";
}

function containsWholeNamePart(fullName = "", namePart = "") {
  const normalizedFullName = normalizePatientName(fullName);
  const normalizedNamePart = normalizePatientName(namePart);
  return Boolean(
    normalizedFullName
    && normalizedNamePart
    && ` ${normalizedFullName} `.includes(` ${normalizedNamePart} `)
  );
}

function same(a, b, normalizer) {
  const left = normalizer(a); const right = normalizer(b);
  return Boolean(left && right && left === right);
}

function addMatch(list, label, candidateValue, existingValue, score) {
  list.push({ label, candidateValue: String(candidateValue || ""), existingValue: String(existingValue || ""), score });
}

export function buildPatientMatchExplanation(match = {}) {
  const levelLabels = { muy_alta: "Muy alta", alta: "Alta", media: "Media", baja: "Baja" };
  const matchedFields = (match.matchedFields || []).map((field) => ({ ...field, field: field.label }));
  const conflictingFields = (match.conflictingFields || []).map((field) => ({ ...field, field: field.label }));
  const summary = matchedFields.length
    ? `Coinciden ${matchedFields.map((field) => field.label.toLowerCase()).join(" y ")}.`
    : "Revise los datos antes de decidir.";
  return {
    title: "Posible paciente coincidente",
    level: match.level || "baja",
    levelLabel: levelLabels[match.level] || "Baja",
    summary,
    matchedFields,
    conflictingFields,
    recommendedAction: match.level === "muy_alta" ? "link-existing" : null
  };
}

export function findPossiblePatientMatches(candidate = {}, existingPatients = []) {
  const candidateData = candidate.values || candidate;
  const fields = (data) => ({
    name: readPatientField(data, "nombreCompleto", "nombrePaciente", "displayName", "nombre", "name"),
    nombres: readPatientField(data, "nombres", "nombreNombres", "primerNombre", "nombrePropio"),
    paterno: readPatientField(data, "apellidoPaterno", "primerApellido"),
    materno: readPatientField(data, "apellidoMaterno", "segundoApellido"),
    curp: readPatientField(data, "curp", "CURP"),
    record: readPatientField(data, "expediente", "numeroExpediente"),
    birth: readPatientField(data, "fechaNacimiento", "fecha_nacimiento", "birthDate"),
    age: readPatientField(data, "edad"),
    sex: readPatientField(data, "sexo"),
    gender: readPatientField(data, "genero", "identidadGenero"),
    institution: readPatientField(data, "institucion", "institucionPaciente"),
    service: readPatientField(data, "servicio", "servicioInstitucional"),
    bed: readPatientField(data, "cama")
  });
  const candidateFields = fields(candidateData);

  return existingPatients.map((existing) => {
    const data = existing.patient || existing;
    const current = fields(existing);
    const matchedFields = [];
    const conflictingFields = [];
    let score = 0;
    const curpSame = same(candidateFields.curp, current.curp, normalizeCurp);
    const recordSame = same(candidateFields.record, current.record, normalizeRecordNumber);
    const nameSame = same(candidateFields.name, current.name, normalizePatientName);
    const birthSame = same(candidateFields.birth, current.birth, normalizeBirthDate);
    if (nameSame && !current.paterno && containsWholeNamePart(current.name, candidateFields.paterno)) {
      current.paterno = candidateFields.paterno;
    }
    if (nameSame && !current.materno && containsWholeNamePart(current.name, candidateFields.materno)) {
      current.materno = candidateFields.materno;
    }
    const paternoSame = same(candidateFields.paterno, current.paterno, normalizePatientName);
    const maternoSame = same(candidateFields.materno, current.materno, normalizePatientName);
    const institutionSame = same(candidateFields.institution, current.institution, normalizePatientName);
    const qualifyingMatches = new Set();

    if (curpSame) { score += 100; qualifyingMatches.add("curp"); addMatch(matchedFields, "CURP", candidateFields.curp, current.curp, 100); }
    else if (candidateFields.curp && current.curp) { score -= 100; conflictingFields.push({ label: "CURP", candidateValue: candidateFields.curp, existingValue: current.curp, penalty: -100 }); }
    if (recordSame) { score += 90; qualifyingMatches.add("record"); addMatch(matchedFields, "Expediente", candidateFields.record, current.record, 90); }
    else if (candidateFields.record && current.record && institutionSame) { score -= 40; conflictingFields.push({ label: "Expediente", candidateValue: candidateFields.record, existingValue: current.record, penalty: -40 }); }
    if (nameSame && birthSame) {
      qualifyingMatches.add("name"); qualifyingMatches.add("birth");
      score += 80; addMatch(matchedFields, "Nombre completo", candidateFields.name, current.name, 60); addMatch(matchedFields, "Fecha de nacimiento", candidateFields.birth, current.birth, 40);
    } else {
      if (nameSame) { score += 60; qualifyingMatches.add("name"); addMatch(matchedFields, "Nombre completo", candidateFields.name, current.name, 60); }
      else if (candidateFields.name && current.name) { score -= 40; conflictingFields.push({ label: "Nombre completo", candidateValue: candidateFields.name, existingValue: current.name, penalty: -40 }); }
      if (birthSame) { score += 40; qualifyingMatches.add("birth"); addMatch(matchedFields, "Fecha de nacimiento", candidateFields.birth, current.birth, 40); }
      else if (candidateFields.birth && current.birth) { score -= 60; conflictingFields.push({ label: "Fecha de nacimiento", candidateValue: candidateFields.birth, existingValue: current.birth, penalty: -60 }); }
    }
    const simpleMatches = [
      ["Apellido paterno", candidateFields.paterno, current.paterno, normalizePatientName, 20],
      ["Apellido materno", candidateFields.materno, current.materno, normalizePatientName, 20],
      ["Nombres", candidateFields.nombres, current.nombres, normalizePatientName, 20],
      ["Género", candidateFields.gender, current.gender, normalizePatientName, 5],
      ["Servicio", candidateFields.service, current.service, normalizePatientName, 3],
      ["Institución", candidateFields.institution, current.institution, normalizePatientName, 3],
      ["Cama", candidateFields.bed, current.bed, normalizeRecordNumber, 1]
    ];
    for (const [label, left, right, normalizer, weight] of simpleMatches) {
      if (left && right && same(left, right, normalizer)) {
        const countsAsIdentityFactor = label !== "Sexo" && !label.toLowerCase().startsWith("g");
        if (countsAsIdentityFactor) {
          score += weight;
          if (label === "Apellido paterno") qualifyingMatches.add("paternalSurname");
          if (label === "Apellido materno") qualifyingMatches.add("maternalSurname");
          if (!["Apellido paterno", "Apellido materno"].includes(label)) qualifyingMatches.add(label);
          addMatch(matchedFields, label, left, right, weight);
        }
      }
      else if (left && right) conflictingFields.push({ label, candidateValue: left, existingValue: right });
    }
    if (candidateFields.age && current.age && Number(candidateFields.age) === Number(current.age)) { score += 5; qualifyingMatches.add("age"); addMatch(matchedFields, "Edad", candidateFields.age, current.age, 5); }
    else if (candidateFields.age && current.age) conflictingFields.push({ label: "Edad", candidateValue: candidateFields.age, existingValue: current.age });

    const duplicateEligible = Boolean(nameSame && (paternoSame || maternoSame) && qualifyingMatches.size >= 3);
    const strongEvidence = duplicateEligible;
    const veryHigh = Boolean(curpSame || (recordSame && institutionSame) || (nameSame && birthSame));
    const high = Boolean(!veryHigh && (recordSame || nameSame) && score >= 40);
    const level = !matchedFields.length ? "ninguna" : !strongEvidence ? "baja" : veryHigh ? "muy_alta" : high ? "alta" : "media";
    return {
      id: existing.id || existing.patientId || "", patientId: existing.id || existing.patientId || "", patient: data,
      name: existing.name || current.name, expediente: current.record, score, level, strongEvidence,
      showAlert: duplicateEligible && ["media", "alta", "muy_alta"].includes(level), duplicateEligible,
      qualifyingMatchesCount: qualifyingMatches.size, matchedFields, conflictingFields
    };
  }).filter((match) => match.patientId && match.duplicateEligible)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));
}
