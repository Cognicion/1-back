import { db } from "../../../firebase.js";
import { finalizarNotaClinica } from "../../../services/notas.js?v=20260716-2";
import { sanitizeFirestorePayload } from "../persistence/firestorePayloadSanitizer.js?v=20260813-notes-canonical-text-v1";
import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function sectionValue(sections = {}, key = "") {
  return sections[key] || "";
}

function sourceTextForImportedNote(document = {}) {
  return [document.fullText, document.rawText, document.text]
    .map((value) => String(value || "").replace(/<[^>]*>/g, "").trim())
    .find(Boolean) || "";
}

function normalizeClinicalDate(value = "") {
  const text = String(value || "").trim();
  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return ymd ? text : "";
}

function clinicalDateTime(date = "", time = "") {
  const normalizedDate = normalizeClinicalDate(date);
  if (!normalizedDate) return "";
  const normalizedTime = /^\d{1,2}:[0-5]\d$/.test(String(time || ""))
    ? String(time).padStart(5, "0")
    : "00:00";
  return `${normalizedDate}T${normalizedTime}:00`;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function importedNoteId({ targetPatientId = "", sourceFileHash = "", sourceNoteSegmentId = "", sourceDocumentIndex = 0 } = {}) {
  return `ptn-${stableHash([targetPatientId, sourceFileHash, sourceNoteSegmentId || sourceDocumentIndex].join("|"))}`;
}

export function importedNoteHasClinicalContent(document = {}) {
  const sections = document.sections || {};
  return [
    sections.subjetivo,
    sections.physicalNeurologicalExam,
    sections.examenMental,
    sections.resultadosEstudios,
    sections.analisis,
    sections.plan,
    sections.tratamiento,
    sections.pronostico,
    sections.destino,
    sourceTextForImportedNote(document)
  ].some((value) => String(value || "").replace(/<[^>]*>/g, "").trim());
}

export function buildImportedNotePayload({ document, confirmedType, sourceFile, importId, user, service = "" }) {
  const sections = document.sections || {};
  const metadata = document.metadata || {};
  const type = confirmedType || metadata.suggestedType || {};
  const date = normalizeClinicalDate(document.sourceNoteDate || metadata.documentDate || document.date);
  const hour = document.sourceNoteTime || metadata.documentHour || document.time || "";
  const fechaNota = clinicalDateTime(date, hour);
  const vitalSigns = document.vitalSignsPayload || {};
  const sourceText = sourceTextForImportedNote(document);
  const observacionFray = {
    tipoNota: "nota_externa",
    tipoNotaOriginal: type.key || document.noteType || "evolucion",
    fechaNota,
    horaNota: hour,
    servicio: service,
    exploracionFisicaNeurologica: sectionValue(sections, "physicalNeurologicalExam"),
    resultadosEstudios: sectionValue(sections, "resultadosEstudios"),
    pronostico: sectionValue(sections, "pronostico"),
    destino: sectionValue(sections, "destino"),
    ...(Object.keys(vitalSigns).length ? vitalSigns : {})
  };
  return {
    tipoNota: "Nota externa",
    tipoNotaOriginal: type.label || document.noteType || "Nota clinica importada",
    tipoNotaClave: `nota_externa:${type.key || document.noteType || "tipo_no_reconocido"}`,
    formato: "docx_patient_transfer",
    estadoNota: "definitiva",
    esBorrador: false,
    bloqueada: true,
    origen: "nota_externa",
    notaRapida: type.key === "rapida" ? document.fullText || "" : "",
    subjetivo: sectionValue(sections, "subjetivo") || sourceText,
    objetivo: sectionValue(sections, "examenMental"),
    analisis: sectionValue(sections, "analisis"),
    plan: [sectionValue(sections, "plan"), sectionValue(sections, "tratamiento")].filter(Boolean).join("\n\n"),
    tratamiento: sectionValue(sections, "tratamiento") || sectionValue(sections, "plan"),
    servicio: service,
    fechaNotaInput: date,
    fechaNota,
    esNotaPrevia: Boolean(fechaNota),
    horaNotaInput: hour,
    observacionFray,
    signosVitales: Object.keys(vitalSigns).length ? vitalSigns : null,
    importacionDocx: {
      imported: true,
      importMethod: "docx-patient-transfer",
      sourceFileName: sourceFile.name,
      sourceFileHash: sourceFile.hash,
      importedBy: user?.uid || "",
      importedAt: new Date().toISOString(),
      originalDocumentDate: date,
      parserVersion: "patient-transfer-docx-v1",
      transferImportId: importId
    }
  };
}

export async function createTransferredNote(patientId, payload, noteId = "", user = {}) {
  const ref = doc(db, "usuarios", patientId, "notasMedicas", noteId);
  const before = await getDocFromServer(ref);
  if (before.exists()) {
    const existingData = before.data() || {};
    const isDefinitive = existingData.bloqueada === true
      || ["definitiva", "definitivo", "firmada", "firmado", "cerrada", "cerrado", "final"].includes(String(existingData.estadoNota || existingData.estado || "").toLowerCase());
    if (isDefinitive) return { id: ref.id, notaId: ref.id, existing: true, data: existingData, observed: true };
  }

  const author = user?.nombre || user?.nombreCompleto || user?.email || "";
  const canonicalPayload = sanitizeFirestorePayload({
    ...payload,
    pacienteId: patientId,
    usuarioId: user?.uid || "",
    usuarioNombre: author,
    autor: author,
    medicoResponsable: author
  });
  await finalizarNotaClinica(patientId, ref.id, canonicalPayload, {
    usuarioId: user?.uid || "",
    usuarioNombre: author
  });
  const after = await getDocFromServer(ref);
  if (!after.exists()) {
    const error = new Error("La nota importada no fue observada después de escribirla.");
    error.code = "notes-write-not-observed";
    throw error;
  }
  return { id: ref.id, notaId: ref.id, existing: false, data: after.data(), observed: true };
}
