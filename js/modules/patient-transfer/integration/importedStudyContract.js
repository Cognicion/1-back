import { normalizeImportedStudyDate } from "../parsing/studyCandidateParser.js?v=20260818-diagnoses-studies-v1";

function normalizeKeyPart(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function firstStudyValue(candidate = {}, keys = []) {
  for (const key of keys) {
    const value = candidate?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function studyClinicalIdentity(candidate = {}, context = {}) {
  const date = normalizeImportedStudyDate(
    firstStudyValue(candidate, ["date", "fecha"]) || context.date
  );
  if (!date) return "";

  return [
    date,
    normalizeKeyPart(firstStudyValue(candidate, ["name", "nombre"]) || "Estudio diagnóstico"),
    normalizeKeyPart(firstStudyValue(candidate, ["type", "tipo"]) || "Otro"),
    normalizeKeyPart(firstStudyValue(candidate, ["result", "resultado", "value", "valor"])),
    normalizeKeyPart(firstStudyValue(candidate, ["observations", "observaciones"]))
  ].join("|");
}

export function studyImportKey(candidate = {}, context = {}) {
  const clinicalIdentity = studyClinicalIdentity(candidate, context);
  const identity = clinicalIdentity || [
    context.sourceFileHash,
    context.sourceDocumentIndex ?? "",
    context.sourceNoteId || context.noteId || "",
    candidate.sourceIndex ?? "",
    normalizeKeyPart(firstStudyValue(candidate, ["name", "nombre"]) || "Estudio diagnóstico"),
    normalizeKeyPart(firstStudyValue(candidate, ["type", "tipo"]) || "Otro"),
    normalizeKeyPart(firstStudyValue(candidate, ["result", "resultado", "value", "valor"])),
    normalizeKeyPart(firstStudyValue(candidate, ["observations", "observaciones"])),
    normalizeKeyPart(firstStudyValue(candidate, ["link", "enlace"]))
  ].map((value) => String(value ?? "").trim()).filter((value) => value !== "").join("|");
  return `patient-transfer-study-${stableHash(identity)}`;
}

export function studyIdentityKeys(candidate = {}, context = {}) {
  return [...new Set([
    String(candidate.importCandidateKey || "").trim(),
    studyImportKey(candidate, context)
  ].filter(Boolean))];
}

export function buildImportedStudyPayload(candidate = {}, context = {}) {
  const date = normalizeImportedStudyDate(candidate.date || context.date)
    || new Date().toISOString().slice(0, 10);
  return {
    nombre: String(candidate.name || "Estudio diagnóstico").trim(),
    tipo: String(candidate.type || "Otro").trim(),
    fecha: date,
    resultado: String(candidate.result || candidate.value || "").trim(),
    observaciones: String(candidate.observations || "").trim(),
    enlace: String(candidate.link || "").trim(),
    estado: "registrado",
    creadoPor: context.user?.uid || "",
    origenImportacionDocx: true,
    imported: true,
    transferOperationId: context.transferOperationId || "",
    sourceFileHash: context.sourceFileHash || "",
    sourceNoteId: context.sourceNoteId || context.noteId || "",
    sourceDocumentName: context.fileName || "",
    importCandidateKey: studyImportKey(candidate, context)
  };
}
