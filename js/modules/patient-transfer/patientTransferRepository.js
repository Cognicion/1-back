import { db } from "../../firebase.js";
import { obtenerStorage } from "../../services/firebaseAppService.js";
import { registrarEventoAuditoria, resumenError } from "../../services/auditoria.js";
import { obtenerNombrePacienteParaMostrar, normalizarTextoBusquedaPaciente } from "../../utils/nombresPacientes.js";
import { DOCX_IMPORT_CONFIG } from "../importacionDocx/docxImportConfig.js";
import { createTransferredPatient } from "./integration/patientCreationAdapter.js";
import { buildImportedNotePayload, createTransferredNote } from "./integration/noteCreationAdapter.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const TRANSFER_COLLECTION = "traspasosPacientes";

function safeFileName(name = "documento.docx") {
  return String(name).replace(/[^\w.\-]+/g, "_").slice(0, 140) || "documento.docx";
}

function valueMatches(fieldValue = "", candidateValue = "") {
  return normalizarTextoBusquedaPaciente(fieldValue) === normalizarTextoBusquedaPaciente(candidateValue);
}

function patientSummary(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: obtenerNombrePacienteParaMostrar(data),
    expediente: data.expediente || data.numeroExpediente || data.datosInstitucionales?.expediente || "",
    curp: data.curp || data.datosInstitucionales?.curp || "",
    fechaNacimiento: data.fechaNacimiento || data.datosInstitucionales?.fechaNacimiento || ""
  };
}

export async function findExistingPatientCandidates(fields = {}, userUid = "") {
  const users = collection(db, "usuarios");
  const descriptors = [];
  if (fields.curp) descriptors.push(query(users, where("curp", "==", fields.curp), limit(5)));
  if (fields.expediente) {
    descriptors.push(query(users, where("expediente", "==", fields.expediente), limit(5)));
    descriptors.push(query(users, where("numeroExpediente", "==", fields.expediente), limit(5)));
  }
  if (fields.nombre) descriptors.push(query(users, where("nombreCompleto", "==", fields.nombre), limit(5)));
  if (!descriptors.length || !userUid) return [];

  const settled = await Promise.allSettled(descriptors.map((descriptor) => getDocs(descriptor)));
  const candidates = new Map();
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((docSnap) => {
      const data = docSnap.data();
      const authorized = data.ownerUid === userUid || data.medicoUid === userUid || data.medicoTratanteUid === userUid || data.medicosAutorizados?.includes?.(userUid);
      if (!authorized) return;
      const candidate = patientSummary(docSnap);
      const score = [
        fields.curp && valueMatches(fields.curp, candidate.curp),
        fields.expediente && valueMatches(fields.expediente, candidate.expediente),
        fields.nombre && valueMatches(fields.nombre, candidate.name),
        fields.fechaNacimiento && fields.fechaNacimiento === candidate.fechaNacimiento
      ].filter(Boolean).length;
      candidates.set(docSnap.id, { ...candidate, score });
    });
  });
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));
}

export async function findDuplicateImport({ hash = "", textHash = "", userUid = "" } = {}) {
  if (!userUid) return null;
  const checks = [];
  if (hash) checks.push(query(collection(db, DOCX_IMPORT_CONFIG.duplicateCollection), where("hash", "==", hash), where("usuarioUid", "==", userUid), limit(1)));
  if (textHash) checks.push(query(collection(db, DOCX_IMPORT_CONFIG.duplicateCollection), where("textHash", "==", textHash), where("usuarioUid", "==", userUid), limit(1)));
  if (!checks.length) return null;
  const settled = await Promise.allSettled(checks.map((check) => getDocs(check)));
  for (const result of settled) {
    if (result.status === "fulfilled" && !result.value.empty) {
      const docSnap = result.value.docs[0];
      return { id: docSnap.id, ...docSnap.data() };
    }
  }
  return null;
}

async function uploadOriginalDocx({ file, hash, userUid, patientId }) {
  const storage = await obtenerStorage();
  const path = `${DOCX_IMPORT_CONFIG.storageRoot}/${userUid}/patient-transfer/${patientId}/${hash}/${safeFileName(file.name)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    customMetadata: { hash, origen: "docx-patient-transfer" }
  });
  return { path, url: await getDownloadURL(storageRef) };
}

async function createTransferImportRecord({ user, group, patientId, documentResults, status }) {
  return addDoc(collection(db, TRANSFER_COLLECTION), {
    usuarioUid: user.uid,
    usuarioNombre: user.nombre || user.email || "",
    status,
    patientId,
    groupId: group.id,
    fields: group.confirmedFields,
    documentCount: documentResults.length,
    documents: documentResults.map((doc) => ({
      fileId: doc.fileId,
      fileName: doc.fileName,
      hash: doc.hash,
      textHash: doc.textHash,
      storagePath: doc.storagePath,
      storageUrl: doc.storageUrl,
      noteId: doc.noteId,
      duplicateStatus: doc.duplicateStatus
    })),
    createdAt: serverTimestamp(),
    createdAtIso: new Date().toISOString()
  });
}

export async function saveTransferredGroups({ groups = [], user }) {
  const results = [];
  for (const group of groups) {
    if (group.omitted || group.action === "omit") {
      results.push({ groupId: group.id, status: "omitted", patientId: "", notesCreated: 0 });
      continue;
    }

    let patientId = group.selectedPatientId || "";
    let patientCreated = false;
    const documentResults = [];
    try {
      if (group.action === "create") {
        const patientRef = await createTransferredPatient(group.confirmedFields, user);
        patientId = patientRef.id;
        patientCreated = true;
      }
      if (!patientId) throw new Error("Selecciona un paciente existente o confirma crear uno nuevo.");

      const transferRef = await createTransferImportRecord({ user, group, patientId, documentResults: [], status: "saving" });
      for (const document of group.documents.filter((item) => !item.omitted && item.duplicateStatus === "nuevo")) {
        const uploaded = await uploadOriginalDocx({ file: document.file, hash: document.hash, userUid: user.uid, patientId });
        const notePayload = buildImportedNotePayload({
          document,
          confirmedType: document.confirmedType,
          sourceFile: { name: document.file.name, hash: document.hash },
          importId: transferRef.id,
          user
        });
        const note = await createTransferredNote(patientId, notePayload);
        const record = {
          fileId: document.id,
          fileName: document.file.name,
          hash: document.hash,
          textHash: document.textHash,
          storagePath: uploaded.path,
          storageUrl: uploaded.url,
          noteId: note.notaId || note.id,
          duplicateStatus: document.duplicateStatus || "nuevo"
        };
        documentResults.push(record);

        await addDoc(collection(db, "usuarios", patientId, "documentosImportados"), {
          importacionId: transferRef.id,
          importMethod: "docx-patient-transfer",
          hash: document.hash,
          textHash: document.textHash,
          archivoNombre: document.file.name,
          archivoStoragePath: uploaded.path,
          archivoUrl: uploaded.url,
          textoExtraido: document.fullText,
          estructura: document.blocks,
          camposConfirmados: group.confirmedFields,
          secciones: document.sections,
          tipoNotaConfirmado: document.confirmedType || document.metadata?.suggestedType || null,
          analisisClinico: document.clinicalAnalysis || null,
          creadoPor: user.uid,
          creadoEn: serverTimestamp(),
          fechaISO: new Date().toISOString()
        });

        await addDoc(collection(db, DOCX_IMPORT_CONFIG.duplicateCollection), {
          usuarioUid: user.uid,
          pacienteId,
          hash: document.hash,
          textHash: document.textHash,
          archivoNombre: document.file.name,
          archivoTamano: document.file.size,
          archivoTipo: document.file.type || "",
          archivoStoragePath: uploaded.path,
          archivoUrl: uploaded.url,
          importMethod: "docx-patient-transfer",
          transferImportId: transferRef.id,
          notaId: record.noteId,
          creadoEn: serverTimestamp(),
          fechaISO: new Date().toISOString()
        });
      }

      await updateDoc(transferRef, {
        status: "completed",
        completedAt: serverTimestamp(),
        completedAtIso: new Date().toISOString(),
        documentCount: documentResults.length,
        documents: documentResults.map((doc) => ({
          fileId: doc.fileId,
          fileName: doc.fileName,
          hash: doc.hash,
          textHash: doc.textHash,
          storagePath: doc.storagePath,
          storageUrl: doc.storageUrl,
          noteId: doc.noteId,
          duplicateStatus: doc.duplicateStatus
        }))
      });

      await registrarEventoAuditoria({
        accion: "traspasar_pacientes_docx",
        modulo: "Traspasar pacientes",
        descripcion: "El usuario traspaso pacientes desde notas DOCX sin IA.",
        usuarioUid: user.uid,
        usuarioNombre: user.nombre || user.email || "",
        usuarioRol: user.rol || "",
        pacienteUid: patientId,
        pacienteNombre: group.confirmedFields?.nombre || "",
        exito: true,
        detalles: { groupId: group.id, patientCreated, documents: documentResults.length }
      });

      results.push({ groupId: group.id, status: "completed", patientId, patientCreated, notesCreated: documentResults.length, documents: documentResults });
    } catch (error) {
      await registrarEventoAuditoria({
        accion: "traspasar_pacientes_docx",
        modulo: "Traspasar pacientes",
        descripcion: "Fallo el traspaso de pacientes desde DOCX.",
        usuarioUid: user.uid,
        usuarioNombre: user.nombre || user.email || "",
        usuarioRol: user.rol || "",
        pacienteUid: patientId,
        pacienteNombre: group.confirmedFields?.nombre || "",
        exito: false,
        detalles: { groupId: group.id, error: resumenError(error) }
      }).catch(() => {});
      results.push({ groupId: group.id, status: "failed", patientId, error: error.message || String(error), notesCreated: documentResults.length });
    }
  }
  return results;
}
