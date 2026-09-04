const { CLINICAL_RECORD_COLLECTIONS } = require("./config");

const COLLECTIONS = CLINICAL_RECORD_COLLECTIONS;
const NOTE_COLLECTIONS = new Set(["notasMedicas", "notas", "notasClinicas"]);
const NOTE_SOURCE_PRIORITY = Object.freeze({ usuarios: 0, pacientes: 1 });
const NOTE_COLLECTION_PRIORITY = Object.freeze({ notasMedicas: 0, notasClinicas: 1, notas: 2 });
const LABORATORY_COLLECTIONS = new Set(["laboratorios"]);

function valueToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function readCollectionAtRoot(db, patientId, collectionName, sourceRoot) {
  try {
    const snap = await db.collection(`${sourceRoot}/${patientId}/${collectionName}`).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), _recordType: collectionName, _sourceRoot: sourceRoot }));
  } catch {
    return [];
  }
}

async function readCollection(db, patientId, collectionName) {
  const records = (await Promise.all([
    readCollectionAtRoot(db, patientId, collectionName, "usuarios"),
    readCollectionAtRoot(db, patientId, collectionName, "pacientes")
  ])).flat();
  const unique = new Map();
  records.forEach((record) => unique.set(`${record._sourceRoot}:${record.id}`, record));
  const uniqueRecords = [...unique.values()];
  const deduplicated = NOTE_COLLECTIONS.has(collectionName)
    ? deduplicateClinicalNotes(uniqueRecords)
    : LABORATORY_COLLECTIONS.has(collectionName)
      ? deduplicateLaboratoryRecords(uniqueRecords)
      : uniqueRecords;
  return deduplicated.sort((a, b) => String(valueToIso(b.updatedAt || b.fecha || b.createdAt) || "").localeCompare(String(valueToIso(a.updatedAt || a.fecha || a.createdAt) || "")));
}

function noteContentKey(record = {}) {
  const externalId = record.notaId || record.idNota || record.documentId || record.sourceDocumentId;
  if (externalId) return `external:${externalId}`;
  const content = [record.subjetivo, record.objetivo, record.analisis, record.plan, record.padecimientoActual, record.texto, record.nota]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  const date = valueToIso(record.fechaNota || record.fecha || record.createdAt || record.updatedAt) || "";
  return content ? `content:${date}:${content}` : `physical:${record._sourceRoot}:${record.id}`;
}

function deduplicateClinicalNotes(records = []) {
  const unique = new Map();
  records.forEach((record) => {
    const key = noteContentKey(record);
    const current = unique.get(key);
    const currentPriority = `${String(NOTE_COLLECTION_PRIORITY[current?._recordType] ?? 99).padStart(2, "0")}:${String(NOTE_SOURCE_PRIORITY[current?._sourceRoot] ?? 99).padStart(2, "0")}`;
    const nextPriority = `${String(NOTE_COLLECTION_PRIORITY[record._recordType] ?? 99).padStart(2, "0")}:${String(NOTE_SOURCE_PRIORITY[record._sourceRoot] ?? 99).padStart(2, "0")}`;
    if (!current || nextPriority < currentPriority) unique.set(key, record);
  });
  return [...unique.values()];
}

function normalizedLaboratoryPart(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function laboratoryContentKey(record = {}) {
  const analyte = record.analyteId || record.analito || record.analyte || record.nombreAnalito || record.parametro;
  const value = record.valor ?? record.value ?? record.valorLaboratorio ?? record.resultadoLaboratorio;
  if (!analyte || value === null || value === undefined || value === "") {
    return `physical:${record._sourceRoot || "usuarios"}:${record.id || "sin-id"}`;
  }
  return [
    "laboratory",
    normalizedLaboratoryPart(analyte),
    normalizedLaboratoryPart(record.muestra || record.specimen),
    normalizedLaboratoryPart(value),
    normalizedLaboratoryPart(record.unidad || record.unit),
    valueToIso(record.fecha || record.measuredAt || record.fechaResultado || record.createdAt || record.updatedAt) || ""
  ].join(":");
}

function deduplicateLaboratoryRecords(records = []) {
  const unique = new Map();
  records.forEach((record) => {
    const key = laboratoryContentKey(record);
    const current = unique.get(key);
    const currentPriority = NOTE_SOURCE_PRIORITY[current?._sourceRoot] ?? 99;
    const nextPriority = NOTE_SOURCE_PRIORITY[record._sourceRoot] ?? 99;
    if (!current || nextPriority < currentPriority) unique.set(key, record);
  });
  return [...unique.values()];
}

function rootClinicalParameterRecords(patient = {}) {
  const values = patient?.parametrosClinicos?.valores;
  if (!values || typeof values !== "object" || Array.isArray(values)) return [];
  return Object.entries(values).flatMap(([analyteId, entry]) => {
    const record = entry && typeof entry === "object" ? entry : { valor: entry };
    const value = record.valor ?? record.value;
    if (value === null || value === undefined || value === "") return [];
    return [{
      id: `parametro-clinico-${analyteId}`,
      ...record,
      analyteId,
      analito: record.analito || analyteId,
      fecha: record.fecha || patient.parametrosClinicos.fechaMuestra || patient.parametrosClinicos.actualizadoEn || null,
      _recordType: "laboratorios",
      _sourceRoot: "usuarios",
      _sourceContainer: "patientProfile.parametrosClinicos"
    }];
  });
}

async function buildPatientClinicalContext({ db, patientId, patient }) {
  const records = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (collectionName) => [collectionName, await readCollection(db, patientId, collectionName)])));
  records.laboratorios = deduplicateLaboratoryRecords([
    ...rootClinicalParameterRecords(patient),
    ...(records.laboratorios || [])
  ]);
  const noteRecords = Object.values(records).flat().filter((record) => NOTE_COLLECTIONS.has(record._recordType));
  const retainedNoteIds = new Set(deduplicateClinicalNotes(noteRecords).map((record) => `${record._sourceRoot}:${record._recordType}:${record.id}`));
  Object.keys(records).forEach((collectionName) => {
    if (!NOTE_COLLECTIONS.has(collectionName)) return;
    records[collectionName] = records[collectionName].filter((record) => retainedNoteIds.has(`${record._sourceRoot}:${record._recordType}:${record.id}`));
  });
  return {
    patientId,
    patient: { ...patient, _recordType: "patientProfile" },
    records,
    builtAt: new Date().toISOString(),
    sourceModule: "clinicalAnalytics.contextBuilder"
  };
}

module.exports = {
  buildPatientClinicalContext,
  valueToIso,
  COLLECTIONS,
  readCollection,
  readCollectionAtRoot,
  deduplicateClinicalNotes,
  noteContentKey,
  deduplicateLaboratoryRecords,
  laboratoryContentKey,
  rootClinicalParameterRecords
};
