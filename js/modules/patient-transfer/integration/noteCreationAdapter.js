import { db } from "../../../firebase.js";
import { guardarBorradorNotaClinica } from "../../../services/notas.js?v=20260716-2";
import { collection, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function sectionValue(sections = {}, key = "") {
  return sections[key] || "";
}

export function buildImportedNotePayload({ document, confirmedType, sourceFile, importId, user }) {
  const sections = document.sections || {};
  const metadata = document.metadata || {};
  const type = confirmedType || metadata.suggestedType || {};
  const date = metadata.documentDate || "";
  const hour = metadata.documentHour || "";
  const vitalCandidate = (document.vitalSignsCandidates || []).find((candidate) => candidate.include === true);
  const vitalSigns = document.vitalSignsPayload || {};
  return {
    tipoNota: type.label || "Nota clinica importada",
    tipoNotaClave: `traspaso_docx:${type.key || "tipo_no_reconocido"}`,
    formato: "docx_patient_transfer",
    estadoNota: "borrador",
    esBorrador: true,
    origen: "docx_patient_transfer",
    notaRapida: document.fullText || "",
    subjetivo: sectionValue(sections, "subjetivo"),
    objetivo: [sectionValue(sections, "objetivo"), sectionValue(sections, "examenMental")].filter(Boolean).join("\n\n"),
    analisis: sectionValue(sections, "analisis"),
    plan: [sectionValue(sections, "plan"), sectionValue(sections, "tratamiento")].filter(Boolean).join("\n\n"),
    tratamiento: sectionValue(sections, "tratamiento") || sectionValue(sections, "plan"),
    fechaNotaInput: date,
    horaNotaInput: hour,
    signosVitales: Object.keys(vitalSigns).length ? vitalSigns : null,
    observacionFray: Object.keys(vitalSigns).length ? {
      fechaNota: date,
      horaNota: hour,
      ...vitalSigns,
      vitalSignsSourceId: vitalCandidate?.id || ""
    } : null,
    importacionDocx: {
      imported: true,
      importMethod: "docx-patient-transfer",
      sourceFileName: sourceFile.name,
      sourceFileHash: sourceFile.hash,
      importedBy: user.uid || "",
      importedAt: new Date().toISOString(),
      originalDocumentDate: date,
      parserVersion: "patient-transfer-docx-v1",
      transferImportId: importId,
      structuredBlocks: document.blocks || [],
      sections,
      clinicalAnalysis: document.clinicalAnalysis || null
    }
  };
}

export async function createTransferredNote(patientId, payload, noteId = "") {
  const ref = noteId
    ? doc(db, "usuarios", patientId, "notasMedicas", noteId)
    : doc(collection(db, "usuarios", patientId, "notasMedicas"));
  return guardarBorradorNotaClinica(patientId, ref.id, payload);
}
