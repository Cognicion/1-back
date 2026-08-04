function valueOf(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export function normalizePatientName(value = "") {
  return String(valueOf(value) || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeRecordNumber(value = "") {
  return String(valueOf(value) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeCurp(value = "") {
  return normalizeRecordNumber(value);
}

export function normalizeBirthDate(value = "") {
  const raw = String(valueOf(value) || "").trim().replace(/\u00a0/g, " ");
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return normalizePatientName(raw).replace(/ /g, "");
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function readField(source = {}, ...keys) {
  for (const key of keys) {
    const value = valueOf(source?.[key]);
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function same(a, b, normalizer) {
  const left = normalizer(a);
  const right = normalizer(b);
  return Boolean(left && right && left === right);
}

function addMatch(list, label, candidateValue, existingValue, score) {
  list.push({ label, candidateValue: String(candidateValue || ""), existingValue: String(existingValue || ""), score });
}

export function buildPatientMatchExplanation(match = {}) {
  const levelLabels = { muy_alta: "Muy alta", alta: "Alta", media: "Media", baja: "Baja" };
  const matchedFields = (match.matchedFields || []).map((field) => ({
    field: field.label,
    label: field.label,
    candidateValue: field.candidateValue,
    existingValue: field.existingValue
  }));
  const conflictingFields = (match.conflictingFields || []).map((field) => ({
    field: field.label,
    label: field.label,
    candidateValue: field.candidateValue,
    existingValue: field.existingValue
  }));
  const summary = matchedFields.length
    ? `Coinciden ${matchedFields.map((field) => field.label.toLowerCase()).join(" y ")}.`
    : "Revise los datos antes de decidir.";
  return {
    title: "Posible paciente ya registrado",
    level: match.level || "baja",
    levelLabel: levelLabels[match.level] || "Baja",
    summary,
    matchedFields,
    conflictingFields,
    recommendedAction: ["muy_alta", "alta"].includes(match.level) ? "link-existing" : null
  };
}

export function findPossiblePatientMatches(candidate = {}, existingPatients = []) {
  const candidateData = candidate.values || candidate;
  const candidateName = readField(candidateData, "nombreCompleto", "nombre", "name");
  const candidateNombres = readField(candidateData, "nombres");
  const candidatePaterno = readField(candidateData, "apellidoPaterno");
  const candidateMaterno = readField(candidateData, "apellidoMaterno");
  const candidateCurp = readField(candidateData, "curp");
  const candidateRecord = readField(candidateData, "expediente", "numeroExpediente");
  const candidateBirth = readField(candidateData, "fechaNacimiento");
  const candidateAge = readField(candidateData, "edad");
  const candidateSex = readField(candidateData, "sexo");
  const candidateGender = readField(candidateData, "genero", "identidadGenero");
  const candidateInstitution = readField(candidateData, "institucion", "institucionPaciente");
  const candidateService = readField(candidateData, "servicio", "servicioInstitucional");
  const candidateBed = readField(candidateData, "cama");

  return existingPatients.map((existing) => {
    const data = existing.patient || existing;
    const existingName = readField(data, "nombreCompleto", "nombre", "name");
    const existingNombres = readField(data, "nombres");
    const existingPaterno = readField(data, "apellidoPaterno");
    const existingMaterno = readField(data, "apellidoMaterno");
    const existingCurp = readField(data, "curp");
    const existingRecord = readField(data, "expediente", "numeroExpediente");
    const existingBirth = readField(data, "fechaNacimiento");
    const existingAge = readField(data, "edad");
    const existingSex = readField(data, "sexo");
    const existingGender = readField(data, "genero", "identidadGenero");
    const existingInstitution = readField(data, "institucion", "institucionPaciente");
    const existingService = readField(data, "servicio", "servicioInstitucional");
    const existingBed = readField(data, "cama");
    const matchedFields = [];
    const conflictingFields = [];
    let score = 0;

    if (same(candidateCurp, existingCurp, normalizeCurp)) { score += 100; addMatch(matchedFields, "CURP", candidateCurp, existingCurp, 100); }
    else if (candidateCurp && existingCurp) { score -= 100; conflictingFields.push({ label: "CURP", candidateValue: candidateCurp, existingValue: existingCurp, penalty: -100 }); }
    const recordSame = same(candidateRecord, existingRecord, normalizeRecordNumber);
    const institutionSame = same(candidateInstitution, existingInstitution, normalizePatientName);
    if (recordSame) {
      score += 80;
      addMatch(matchedFields, "Expediente", candidateRecord, existingRecord, 80);
    } else if (candidateRecord && existingRecord && institutionSame) {
      score -= 30;
      conflictingFields.push({ label: "Expediente", candidateValue: candidateRecord, existingValue: existingRecord, penalty: -30 });
    }
    if (same(candidateBirth, existingBirth, normalizeBirthDate)) { score += 50; addMatch(matchedFields, "Fecha de nacimiento", candidateBirth, existingBirth, 50); }
    else if (candidateBirth && existingBirth) { score -= 60; conflictingFields.push({ label: "Fecha de nacimiento", candidateValue: candidateBirth, existingValue: existingBirth, penalty: -60 }); }
    if (same(candidateName, existingName, normalizePatientName)) { score += 50; addMatch(matchedFields, "Nombre completo", candidateName, existingName, 50); }
    if (same(candidatePaterno, existingPaterno, normalizePatientName)) { score += 20; addMatch(matchedFields, "Apellido paterno", candidatePaterno, existingPaterno, 20); }
    if (same(candidateMaterno, existingMaterno, normalizePatientName)) { score += 20; addMatch(matchedFields, "Apellido materno", candidateMaterno, existingMaterno, 20); }
    if (same(candidateNombres, existingNombres, normalizePatientName)) { score += 20; addMatch(matchedFields, "Nombres", candidateNombres, existingNombres, 20); }
    if (same(candidateSex, existingSex, normalizePatientName)) { score += 5; addMatch(matchedFields, "Sexo", candidateSex, existingSex, 5); }
    if (same(candidateGender, existingGender, normalizePatientName)) { score += 5; addMatch(matchedFields, "Género", candidateGender, existingGender, 5); }
    if (candidateAge && existingAge && Number(candidateAge) === Number(existingAge)) { score += 5; addMatch(matchedFields, "Edad", candidateAge, existingAge, 5); }
    if (candidateInstitution && existingInstitution && institutionSame) addMatch(matchedFields, "Institución", candidateInstitution, existingInstitution, 0);
    if (same(candidateService, existingService, normalizePatientName)) addMatch(matchedFields, "Servicio", candidateService, existingService, 0);
    if (same(candidateBed, existingBed, normalizeRecordNumber)) addMatch(matchedFields, "Cama", candidateBed, existingBed, 0);

    const veryHigh = Boolean((candidateCurp && same(candidateCurp, existingCurp, normalizeCurp)) || (recordSame && institutionSame) || (same(candidateName, existingName, normalizePatientName) && same(candidateBirth, existingBirth, normalizeBirthDate)));
    const high = veryHigh || Boolean((recordSame && !candidateInstitution) || (same(candidateName, existingName, normalizePatientName) && candidateAge && existingAge && Number(candidateAge) === Number(existingAge)) || (same(candidateNombres, existingNombres, normalizePatientName) && same(candidatePaterno, existingPaterno, normalizePatientName) && same(candidateMaterno, existingMaterno, normalizePatientName)));
    const level = veryHigh ? "muy_alta" : high ? "alta" : score >= 40 ? "media" : matchedFields.length ? "baja" : "ninguna";
    return {
      id: existing.id || existing.patientId || "",
      patientId: existing.id || existing.patientId || "",
      patient: data,
      name: existing.name || existingName,
      expediente: existingRecord,
      score,
      level,
      matchedFields,
      conflictingFields
    };
  }).filter((match) => match.patientId && match.matchedFields.length).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));
}
