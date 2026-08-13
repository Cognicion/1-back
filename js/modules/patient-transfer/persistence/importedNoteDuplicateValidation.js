function normalizedTechnicalId(value = "") {
  return String(value || "").trim();
}

export function canonicalImportedNoteReferences(record = {}) {
  const patientId = normalizedTechnicalId(record.patientId || record.pacienteId);
  const documentNoteIds = Array.isArray(record.documents)
    ? record.documents.map((document) => document?.noteId)
    : [];
  const noteIds = [...new Set([
    ...(Array.isArray(record.noteIds) ? record.noteIds : []),
    record.notaId,
    ...documentNoteIds
  ].map(normalizedTechnicalId).filter(Boolean))];

  return { patientId, noteIds };
}

export function canVerifyCanonicalImportedNotes(record = {}, { requireCompletedStatus = false } = {}) {
  if (requireCompletedStatus && normalizedTechnicalId(record.status).toLowerCase() !== "completed") {
    return false;
  }
  const { patientId, noteIds } = canonicalImportedNoteReferences(record);
  return Boolean(patientId && noteIds.length);
}
