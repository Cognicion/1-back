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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const TRANSFER_COLLECTION = "traspasosPacientes";

function traceTransfer(stage, data = {}) {
  console.info("[PATIENT TRANSFER]", {
    module: "patient-transfer",
    stage,
    ...data
  });
}

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
  if (hash) {
    const exactPath = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${hash}`;
    traceTransfer("duplicate-check", { operation: "getDoc", path: exactPath, authUid: userUid });
    const exact = await getDoc(doc(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, hash));
    if (exact.exists()) return { id: exact.id, ...exact.data(), duplicateStatus: "duplicado_exacto" };
  }
  if (textHash) {
    const path = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}`;
    traceTransfer("duplicate-check", { operation: "getDocs", path, authUid: userUid, query: { ownerUid: userUid, textHash } });
    const snap = await getDocs(query(
      collection(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection),
      where("ownerUid", "==", userUid),
      where("textHash", "==", textHash),
      limit(1)
    ));
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...docSnap.data(), duplicateStatus: "posible_duplicado" };
    }
  }
  return null;
}

async function uploadOriginalDocx({ file, hash, userUid, patientId }) {
  const storage = await obtenerStorage();
  const path = `${DOCX_IMPORT_CONFIG.storageRoot}/${userUid}/patient-transfer/${patientId}/${hash}/${safeFileName(file.name)}`;
  traceTransfer("upload-source-document", { operation: "uploadBytes", path, authUid: userUid, patientId });
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    customMetadata: { hash, origen: "docx-patient-transfer" }
  });
  return { path, url: await getDownloadURL(storageRef) };
}

async function createTransferImportRecord({ user, group, patientId, documentResults, status }) {
  const path = `usuarios/${user.uid}/${TRANSFER_COLLECTION}`;
  traceTransfer("create-transfer-record", { operation: "addDoc", path, authUid: user.uid, role: user.rol || "", patientId, status });
  return addDoc(collection(db, "usuarios", user.uid, TRANSFER_COLLECTION), {
    ownerUid: user.uid,
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
    let stage = "pending";
    const documentResults = [];
    try {
      if (group.action === "create") {
        stage = "creating_patient";
        traceTransfer(stage, { operation: "crearPacienteProvisional", authUid: user.uid, role: user.rol || "", patientName: group.confirmedFields?.nombre || "" });
        const patientRef = await createTransferredPatient(group.confirmedFields, user);
        patientId = patientRef.id;
        patientCreated = true;
        traceTransfer(stage, { operation: "crearPacienteProvisional", authUid: user.uid, patientId, result: "created" });
      }
      if (!patientId) throw new Error("Selecciona un paciente existente o confirma crear uno nuevo.");

      stage = "creating_transfer_record";
      const transferRef = await createTransferImportRecord({ user, group, patientId, documentResults: [], status: "saving" });
      for (const document of group.documents.filter((item) => !item.omitted && item.duplicateStatus === "nuevo")) {
        stage = "uploading_source";
        const uploaded = await uploadOriginalDocx({ file: document.file, hash: document.hash, userUid: user.uid, patientId });
        stage = "creating_note";
        traceTransfer(stage, { operation: "guardarBorradorNotaClinica", path: `usuarios/${patientId}/notasMedicas`, authUid: user.uid, patientId });
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

        stage = "creating_patient_document_record";
        traceTransfer(stage, { operation: "addDoc", path: `usuarios/${patientId}/documentosImportados`, authUid: user.uid, patientId, noteId: record.noteId });
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

        stage = "creating_duplicate_record";
        const duplicateRef = doc(db, "usuarios", user.uid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, document.hash);
        traceTransfer(stage, { operation: "setDoc", path: `usuarios/${user.uid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${document.hash}`, authUid: user.uid, patientId, noteId: record.noteId });
        await setDoc(duplicateRef, {
          ownerUid: user.uid,
          usuarioUid: user.uid,
          pacienteId,
          sourceFileHash: document.hash,
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
        }, { merge: true });
      }

      stage = "updating_transfer_record";
      traceTransfer(stage, { operation: "updateDoc", path: `usuarios/${user.uid}/${TRANSFER_COLLECTION}/${transferRef.id}`, authUid: user.uid, patientId, notesCreated: documentResults.length });
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

      stage = "creating_audit";
      traceTransfer(stage, { operation: "registrarEventoAuditoria", authUid: user.uid, role: user.rol || "", patientId });
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

      results.push({ groupId: group.id, status: "completed", patientId, patientName: group.confirmedFields?.nombre || "", patientCreated, notesCreated: documentResults.length, documents: documentResults });
    } catch (error) {
      traceTransfer(stage || "failed", {
        operation: "firebase-write",
        authUid: user.uid,
        role: user.rol || "",
        patientId,
        errorCode: error?.code || error?.name || "unknown",
        message: error?.message || String(error),
        partialState: { patientCreated, notesCreated: documentResults.length }
      });
      if (patientCreated && !documentResults.length && patientId) {
        await deleteDoc(doc(db, "usuarios", patientId)).catch((rollbackError) => {
          traceTransfer("rollback_patient_failed", {
            operation: "deleteDoc",
            path: `usuarios/${patientId}`,
            authUid: user.uid,
            patientId,
            errorCode: rollbackError?.code || rollbackError?.name || "unknown"
          });
        });
      }
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
      results.push({
        groupId: group.id,
        status: documentResults.length ? "partially_completed" : "failed",
        patientId: documentResults.length ? patientId : "",
        patientName: group.confirmedFields?.nombre || "",
        stage,
        error: error.message || String(error),
        notesCreated: documentResults.length
      });
    }
  }
  return results;
}
