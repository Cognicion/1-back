import { db } from "../../firebase.js";
import { obtenerStorage } from "../../services/firebaseAppService.js";
import { registrarEventoAuditoria, resumenError } from "../../services/auditoria.js";
import { obtenerNombrePacienteParaMostrar, normalizarTextoBusquedaPaciente } from "../../utils/nombresPacientes.js";
import { DOCX_IMPORT_CONFIG } from "../importacionDocx/docxImportConfig.js";
import { createTransferredPatient } from "./integration/patientCreationAdapter.js";
import { buildImportedNotePayload, createTransferredNote } from "./integration/noteCreationAdapter.js";
import { createImportedDiagnoses, createImportedTreatments } from "./integration/clinicalDataImportAdapter.js";
import { vitalSignsToNotePayload } from "./parsing/vitalSignsParser.js";
import { construirActualizacionSignosVitalesDesdeNota } from "../../services/signosVitalesNotas.js";
import { withPatientTransferTimeout } from "./patientTransferTimeout.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const TRANSFER_COLLECTION = "traspasosPacientes";
const TIMEOUTS = Object.freeze({
  query: 15000,
  createPatient: 25000,
  firestoreWrite: 20000,
  storage: 45000,
  createNote: 25000,
  createClinicalData: 25000,
  createVitals: 20000,
  audit: 15000,
  lock: 15000
});

const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

function traceTransfer(stage, data = {}) {
  console.info("[PATIENT TRANSFER]", {
    module: "patient-transfer",
    stage,
    ...data
  });
}

async function timed(stage, promiseFactory, milliseconds) {
  traceTransfer(`${stage}:start`, {});
  try {
    const result = await withPatientTransferTimeout(Promise.resolve().then(promiseFactory), milliseconds, stage);
    traceTransfer(`${stage}:success`, {});
    return result;
  } catch (error) {
    traceTransfer(`${stage}:error`, {
      errorCode: error?.code || error?.name || "unknown",
      message: error?.message || String(error)
    });
    error.stage = error.stage || stage;
    throw error;
  }
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

function normalizeRecordNumber(value = "") {
  return normalizarTextoBusquedaPaciente(value).replace(/[^a-z0-9]+/g, "");
}

function transferOperationIdForGroup(group = {}) {
  const firstDocument = group.documents?.find((item) => item.hash || item.textHash);
  return firstDocument?.transferOperationId || (firstDocument?.hash ? `docx_${firstDocument.hash}` : `docx_${firstDocument?.textHash || group.id}`);
}

function transferOperationRef(userUid, operationId) {
  return doc(db, "usuarios", userUid, TRANSFER_COLLECTION, operationId);
}

function lockRef(userUid, operationId) {
  return doc(db, "usuarios", userUid, "patientTransferLocks", operationId);
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
        fields.expediente && normalizeRecordNumber(fields.expediente) === normalizeRecordNumber(candidate.expediente),
        fields.nombre && valueMatches(fields.nombre, candidate.name),
        fields.fechaNacimiento && fields.fechaNacimiento === candidate.fechaNacimiento
      ].filter(Boolean).length;
      candidates.set(docSnap.id, { ...candidate, score });
    });
  });
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));
}

async function acquireTransferOperation({ user, group, operationId }) {
  const opRef = transferOperationRef(user.uid, operationId);
  const lkRef = lockRef(user.uid, operationId);
  const sourceFileHash = group.documents?.[0]?.hash || "";
  const nowIso = new Date().toISOString();
  traceTransfer("operation-created", { operation: "runTransaction", path: `usuarios/${user.uid}/${TRANSFER_COLLECTION}/${operationId}`, authUid: user.uid, sourceFileHash });

  const result = await timed("acquire-transfer-operation", () => runTransaction(db, async (transaction) => {
    const opSnap = await transaction.get(opRef);
    const lockSnap = await transaction.get(lkRef);
    const opData = opSnap.exists() ? opSnap.data() : null;
    const lockData = lockSnap.exists() ? lockSnap.data() : null;
    const lockAge = lockData?.updatedAtMs ? Date.now() - Number(lockData.updatedAtMs) : Infinity;

    if (lockData?.status === "processing" && lockAge < LOCK_MAX_AGE_MS && !opData?.patientId) {
      throw new Error("Este documento ya tiene una operacion de traspaso asociada en proceso.");
    }

    const base = {
      ownerUid: user.uid,
      usuarioUid: user.uid,
      transferOperationId: operationId,
      sourceFileHash,
      status: opData?.status === "completed" ? "completed" : "processing",
      lastCompletedStage: opData?.lastCompletedStage || "reviewed",
      patientId: opData?.patientId || "",
      noteIds: opData?.noteIds || [],
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      updatedAtMs: Date.now()
    };

    transaction.set(opRef, {
      ...base,
      groupId: group.id,
      fields: group.confirmedFields,
      documentCount: group.documents?.length || 0,
      createdAt: opData?.createdAt || serverTimestamp(),
      createdAtIso: opData?.createdAtIso || nowIso
    }, { merge: true });
    transaction.set(lkRef, {
      ownerUid: user.uid,
      transferOperationId: operationId,
      sourceFileHash,
      status: "processing",
      patientId: opData?.patientId || "",
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
      updatedAtMs: Date.now()
    }, { merge: true });

    return { ref: opRef, data: { ...opData, ...base }, existed: Boolean(opData) };
  }), TIMEOUTS.lock);

  traceTransfer("operation-created", {
    operation: "runTransaction",
    authUid: user.uid,
    transferOperationId: operationId,
    patientId: result.data?.patientId || "",
    status: result.data?.status || "processing"
  });
  return result;
}

export async function findDuplicateImport({ hash = "", textHash = "", userUid = "" } = {}) {
  if (!userUid) return null;
  if (hash) {
    const opId = `docx_${hash}`;
    const opPath = `usuarios/${userUid}/${TRANSFER_COLLECTION}/${opId}`;
    traceTransfer("duplicate-check", { operation: "getDoc", path: opPath, authUid: userUid });
    const operation = await timed("duplicate-operation-query", () => getDoc(transferOperationRef(userUid, opId)), TIMEOUTS.query);
    if (operation.exists()) {
      return { id: operation.id, ...operation.data(), duplicateStatus: "operacion_asociada" };
    }
    const exactPath = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${hash}`;
    traceTransfer("duplicate-check", { operation: "getDoc", path: exactPath, authUid: userUid });
    const exact = await timed("duplicate-exact-query", () => getDoc(doc(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, hash)), TIMEOUTS.query);
    if (exact.exists()) return { id: exact.id, ...exact.data(), duplicateStatus: "duplicado_exacto" };
  }
  if (textHash) {
    const path = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}`;
    traceTransfer("duplicate-check", { operation: "getDocs", path, authUid: userUid, query: { ownerUid: userUid, textHash } });
    const snap = await timed("duplicate-text-query", () => getDocs(query(
      collection(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection),
      where("ownerUid", "==", userUid),
      where("textHash", "==", textHash),
      limit(1)
    )), TIMEOUTS.query);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...docSnap.data(), duplicateStatus: "posible_duplicado" };
    }
  }
  return null;
}

async function uploadOriginalDocx({ file, hash, userUid, patientId }) {
  const storage = await timed("storage-instance", () => obtenerStorage(), TIMEOUTS.storage);
  const path = `${DOCX_IMPORT_CONFIG.storageRoot}/${userUid}/patient-transfer/${patientId}/${hash}/${safeFileName(file.name)}`;
  traceTransfer("upload-source-document", { operation: "uploadBytes", path, authUid: userUid, patientId });
  const storageRef = ref(storage, path);
  await timed("upload-source", () => uploadBytes(storageRef, file, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    customMetadata: { hash, origen: "docx-patient-transfer" }
  }), TIMEOUTS.storage);
  return { path, url: await timed("download-url", () => getDownloadURL(storageRef), TIMEOUTS.storage) };
}

async function updateTransferImportRecord({ transferRef, user, group, patientId, documentResults, status, lastCompletedStage = "" }) {
  traceTransfer("create-transfer-record", { operation: "setDoc", path: transferRef.path, authUid: user.uid, role: user.rol || "", patientId, status });
  return timed("create-transfer-record", () => setDoc(transferRef, {
    ownerUid: user.uid,
    usuarioUid: user.uid,
    usuarioNombre: user.nombre || user.email || "",
    status,
    lastCompletedStage,
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
    updatedAt: serverTimestamp(),
    updatedAtIso: new Date().toISOString()
  }, { merge: true }), TIMEOUTS.firestoreWrite);
}

export async function saveTransferredGroups({ groups = [], user, onProgress = null }) {
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
    let diagnosesCreated = 0;
    let diagnosesOmitted = 0;
    let treatmentsCreated = 0;
    let treatmentsOmitted = 0;
    let vitalSignsCreated = 0;
    let anthropometryCreated = 0;
    const diagnosisIds = [];
    const treatmentIds = [];
    const vitalSignRecordIds = [];
    const anthropometryRecordIds = [];
    let sourceSaved = false;
    let auditRegistered = false;
    const operationId = transferOperationIdForGroup(group);
    let transferRef = transferOperationRef(user.uid, operationId);
    try {
      const documentsToSave = group.documents.filter((item) => !item.omitted && item.duplicateStatus === "nuevo");
      if (!documentsToSave.length) {
        results.push({ groupId: group.id, status: "completed", patientId: "", patientName: group.confirmedFields?.nombre || "", patientCreated: false, notesCreated: 0, notesExisting: 0, duplicatesAvoided: group.documents.length, documents: [] });
        continue;
      }

      const operation = await acquireTransferOperation({ user, group, operationId });
      transferRef = operation.ref;
      if (operation.data?.status === "completed") {
        results.push({
          groupId: group.id,
          status: "completed",
          patientId: operation.data.patientId || "",
          patientName: group.confirmedFields?.nombre || "",
          patientCreated: false,
          patientReused: true,
          notesCreated: 0,
          notesExisting: operation.data.noteIds?.length || 0,
          vitalSignsCreated: operation.data.vitalSignCount || 0,
          anthropometryCreated: operation.data.anthropometryCount || 0,
          diagnosesCreated: operation.data.diagnosisCount || 0,
          diagnosesOmitted: 0,
          treatmentsCreated: operation.data.treatmentCount || 0,
          treatmentsOmitted: 0,
          sourceSaved: operation.data.sourceSaved !== false,
          auditRegistered: true,
          duplicatesAvoided: documentsToSave.length,
          documents: []
        });
        continue;
      }
      if (operation.data?.patientId) {
        patientId = operation.data.patientId;
        traceTransfer("reuse-patient", { authUid: user.uid, transferOperationId: operationId, patientId });
      }

      if (group.action === "create") {
        if (!patientId) {
          stage = "patient_check_existing";
          traceTransfer("patient-check-existing", { authUid: user.uid, transferOperationId: operationId, patientName: group.confirmedFields?.nombre || "", expediente: group.confirmedFields?.expediente || "" });
          const candidates = await timed("patient-existing-query", () => findExistingPatientCandidates(group.confirmedFields, user.uid), TIMEOUTS.query);
          const strong = candidates.find((candidate) => candidate.score >= 2);
          if (strong) {
            patientId = strong.id;
            traceTransfer("patient-existing-found", { authUid: user.uid, patientId, score: strong.score });
            await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults, status: "patient_created", lastCompletedStage: "patient_reused" });
          }
        }
        if (!patientId) {
          stage = "creating_patient";
          onProgress?.({ stage, message: "Creando paciente...", progress: 30 });
          traceTransfer("create-patient-start", { operation: "crearPacienteProvisional", authUid: user.uid, role: user.rol || "", patientName: group.confirmedFields?.nombre || "", transferOperationId: operationId });
          const patientRef = await timed("create-patient", () => createTransferredPatient({ ...group.confirmedFields, transferOperationId }, user), TIMEOUTS.createPatient);
          patientId = patientRef.id;
          patientCreated = true;
          traceTransfer("create-patient-success", { operation: "crearPacienteProvisional", authUid: user.uid, patientId, transferOperationId: operationId });
          await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults, status: "patient_created", lastCompletedStage: "patient_created" });
        }
      }
      if (!patientId) throw new Error("Selecciona un paciente existente o confirma crear uno nuevo.");

      stage = "creating_transfer_record";
      onProgress?.({ stage, message: "Preparando registro de traspaso...", progress: 35 });
      await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults: [], status: "processing", lastCompletedStage: patientCreated ? "patient_created" : "patient_reused" });
      for (const document of documentsToSave) {
        stage = "creating_note";
        const noteImportKey = `${operationId}_${documentResults.length}_${patientId}`;
        const noteRef = doc(db, "usuarios", patientId, "notasMedicas", noteImportKey);
        const existingNote = await timed(`check-note-${documentResults.length + 1}`, () => getDoc(noteRef), TIMEOUTS.query);
        if (existingNote.exists()) {
          const imported = existingNote.data()?.importacionDocx || {};
          documentResults.push({
            fileId: document.id,
            fileName: document.file.name,
            hash: document.hash,
            textHash: document.textHash,
            storagePath: imported.sourceDocumentPath || "",
            storageUrl: imported.sourceDocumentUrl || "",
            noteId: noteRef.id,
            duplicateStatus: "note_existing"
          });
          sourceSaved = sourceSaved || Boolean(imported.sourceDocumentPath);
          continue;
        }
        onProgress?.({ stage, message: `Creando nota ${documentResults.length + 1}...`, progress: 50 });
        traceTransfer(stage, { operation: "guardarBorradorNotaClinica", path: `usuarios/${patientId}/notasMedicas`, authUid: user.uid, patientId });
        const selectedVitals = (document.vitalSignsCandidates || []).find((candidate) => candidate.include === true);
        const vitalSignsPayload = selectedVitals ? vitalSignsToNotePayload(selectedVitals, group.confirmedFields || {}) : {};
        const notePayload = buildImportedNotePayload({
          document: { ...document, vitalSignsPayload },
          confirmedType: document.confirmedType,
          sourceFile: { name: document.file.name, hash: document.hash },
          importId: operationId,
          user
        });
        traceTransfer("create-note-start", { authUid: user.uid, transferOperationId: operationId, patientId, noteId: noteImportKey });
        const note = await timed(`create-note-${documentResults.length + 1}`, () => createTransferredNote(patientId, {
          ...notePayload,
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          sourceDocumentIndex: documentResults.length,
          noteImportKey,
          importacionDocx: {
            ...(notePayload.importacionDocx || {}),
            transferOperationId: operationId,
            sourceDocumentIndex: documentResults.length
          }
        }, noteImportKey), TIMEOUTS.createNote);
        traceTransfer("create-note-success", { authUid: user.uid, transferOperationId: operationId, patientId, noteId: note.notaId || note.id });
        if (Object.keys(vitalSignsPayload).length) {
          stage = "creating_vital_signs";
          onProgress?.({ stage, message: "Registrando signos vitales...", progress: 54 });
          await timed(`create-vitals-${documentResults.length + 1}`, async () => {
            const patientSnap = await getDoc(doc(db, "usuarios", patientId));
            const update = construirActualizacionSignosVitalesDesdeNota({
              paciente: patientSnap.exists() ? patientSnap.data() : {},
              nota: { ...notePayload, observacionFray: notePayload.observacionFray || {}, signosVitales: vitalSignsPayload },
              sourceNoteId: note.notaId || note.id || noteImportKey,
              createdBy: user.uid
            });
            if (!update) return null;
            await setDoc(doc(db, "usuarios", patientId), update, { merge: true });
            return update;
          }, TIMEOUTS.createVitals);
          vitalSignsCreated += 1;
          vitalSignRecordIds.push(`${note.notaId || note.id || noteImportKey}:signos`);
          if (vitalSignsPayload.peso || vitalSignsPayload.talla || vitalSignsPayload.imc) {
            anthropometryCreated += 1;
            anthropometryRecordIds.push(`${note.notaId || note.id || noteImportKey}:somatometria`);
          }
        }

        stage = "creating_diagnoses";
        onProgress?.({ stage, message: "Registrando diagnosticos confirmados...", progress: 58 });
        const diagnosisResult = await timed(`create-diagnoses-${documentResults.length + 1}`, () => createImportedDiagnoses(patientId, document.diagnosisCandidates || [], {
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          noteId: note.notaId || note.id || noteImportKey,
          fileName: document.file.name,
          date: document.metadata?.documentDate || "",
          user
        }), TIMEOUTS.createClinicalData);
        diagnosesCreated += diagnosisResult.created.length;
        diagnosesOmitted += diagnosisResult.omitted;
        diagnosisIds.push(...diagnosisResult.created.map((item) => item.id).filter(Boolean));

        stage = "creating_treatments";
        onProgress?.({ stage, message: "Registrando tratamientos confirmados...", progress: 64 });
        const treatmentResult = await timed(`create-treatments-${documentResults.length + 1}`, () => createImportedTreatments(patientId, document.treatmentCandidates || [], {
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          noteId: note.notaId || note.id || noteImportKey,
          fileName: document.file.name,
          date: document.metadata?.documentDate || "",
          user
        }), TIMEOUTS.createClinicalData);
        treatmentsCreated += treatmentResult.created.length;
        treatmentsOmitted += treatmentResult.omitted;
        treatmentIds.push(...treatmentResult.created.map((item) => item.id).filter(Boolean));

        stage = "uploading_source";
        onProgress?.({ stage, message: `Guardando documento original ${documentResults.length + 1}...`, progress: 70 });
        const uploaded = await timed(`upload-document-${documentResults.length + 1}`, () => uploadOriginalDocx({ file: document.file, hash: document.hash, userUid: user.uid, patientId }), TIMEOUTS.storage);
        sourceSaved = true;
        await timed(`update-note-source-${documentResults.length + 1}`, () => setDoc(noteRef, {
          importacionDocx: {
            transferOperationId: operationId,
            sourceDocumentPath: uploaded.path,
            sourceDocumentUrl: uploaded.url,
            sourceDocumentIndex: documentResults.length
          }
        }, { merge: true }), TIMEOUTS.firestoreWrite);
        const record = {
          fileId: document.id,
          fileName: document.file.name,
          hash: document.hash,
          textHash: document.textHash,
          storagePath: uploaded.path,
          storageUrl: uploaded.url,
          noteId: note.notaId || note.id || noteImportKey,
          duplicateStatus: document.duplicateStatus || "nuevo"
        };
        documentResults.push(record);

        stage = "creating_patient_document_record";
        onProgress?.({ stage, message: "Registrando documento importado...", progress: 75 });
        traceTransfer(stage, { operation: "addDoc", path: `usuarios/${patientId}/documentosImportados`, authUid: user.uid, patientId, noteId: record.noteId });
        await timed(`create-document-record-${documentResults.length}`, () => addDoc(collection(db, "usuarios", patientId, "documentosImportados"), {
          importacionId: operationId,
          transferOperationId: operationId,
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
        }), TIMEOUTS.firestoreWrite);

        stage = "creating_duplicate_record";
        onProgress?.({ stage, message: "Registrando control de duplicados...", progress: 80 });
        const duplicateRef = doc(db, "usuarios", user.uid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, document.hash);
        traceTransfer(stage, { operation: "setDoc", path: `usuarios/${user.uid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${document.hash}`, authUid: user.uid, patientId, noteId: record.noteId });
        await timed(`create-duplicate-record-${documentResults.length}`, () => setDoc(duplicateRef, {
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
          transferOperationId: operationId,
          transferImportId: operationId,
          notaId: record.noteId,
          creadoEn: serverTimestamp(),
          fechaISO: new Date().toISOString()
        }, { merge: true }), TIMEOUTS.firestoreWrite);
      }

      stage = "creating_audit";
      onProgress?.({ stage, message: "Registrando auditoria...", progress: 85 });
      traceTransfer(stage, { operation: "registrarEventoAuditoria", authUid: user.uid, role: user.rol || "", patientId });
      await timed("audit-success", () => registrarEventoAuditoria({
        accion: "traspasar_pacientes_docx",
        modulo: "Traspasar pacientes",
        descripcion: "El usuario traspaso pacientes desde notas DOCX sin IA.",
        usuarioUid: user.uid,
        usuarioNombre: user.nombre || user.email || "",
        usuarioRol: user.rol || "",
        pacienteUid: patientId,
        pacienteNombre: group.confirmedFields?.nombre || "",
        exito: true,
        detalles: { groupId: group.id, transferOperationId: operationId, patientCreated, documents: documentResults.length, diagnosesCreated, treatmentsCreated }
      }), TIMEOUTS.audit);
      auditRegistered = true;

      stage = "updating_transfer_record";
      onProgress?.({ stage, message: "Finalizando traspaso...", progress: 92 });
      traceTransfer(stage, { operation: "setDoc", path: transferRef.path, authUid: user.uid, patientId, notesCreated: documentResults.length });
      await timed("update-transfer-record", () => setDoc(transferRef, {
        status: "completed",
        lastCompletedStage: "completed",
        completedAt: serverTimestamp(),
        completedAtIso: new Date().toISOString(),
        documentCount: documentResults.length,
        noteIds: documentResults.map((doc) => doc.noteId).filter(Boolean),
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosisIds,
        treatmentIds,
        vitalSignCount: vitalSignsCreated,
        anthropometryCount: anthropometryCreated,
        diagnosisCount: diagnosesCreated,
        treatmentCount: treatmentsCreated,
        sourceSaved,
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
      }, { merge: true }), TIMEOUTS.firestoreWrite);
      await timed("release-transfer-lock", () => setDoc(lockRef(user.uid, operationId), {
        status: "completed",
        patientId,
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now()
      }, { merge: true }), TIMEOUTS.firestoreWrite);

      traceTransfer("operation-completed", { authUid: user.uid, transferOperationId: operationId, patientId, notesCreated: documentResults.filter((item) => item.duplicateStatus !== "note_existing").length });
      results.push({
        groupId: group.id,
        status: "completed",
        patientId,
        patientName: group.confirmedFields?.nombre || "",
        patientCreated,
        patientReused: !patientCreated,
        transferOperationId: operationId,
        notesCreated: documentResults.filter((item) => item.duplicateStatus !== "note_existing").length,
        notesExisting: documentResults.filter((item) => item.duplicateStatus === "note_existing").length,
        vitalSignsCreated,
        anthropometryCreated,
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosesCreated,
        diagnosesOmitted,
        diagnosisIds,
        treatmentsCreated,
        treatmentsOmitted,
        treatmentIds,
        sourceSaved,
        auditRegistered,
        duplicatesAvoided: 0,
        documents: documentResults
      });
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
      await timed("mark-transfer-failed", () => setDoc(transferRef, {
        status: patientId ? "partially_completed" : "failed",
        lastCompletedStage: patientId ? "patient_created" : "reviewed",
        failureStage: stage,
        patientId,
        noteIds: documentResults.map((doc) => doc.noteId).filter(Boolean),
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosisIds,
        treatmentIds,
        vitalSignCount: vitalSignsCreated,
        anthropometryCount: anthropometryCreated,
        diagnosisCount: diagnosesCreated,
        treatmentCount: treatmentsCreated,
        sourceSaved,
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now()
      }, { merge: true }), TIMEOUTS.firestoreWrite).catch(() => {});
      await timed("release-transfer-lock-after-failure", () => setDoc(lockRef(user.uid, operationId), {
        status: patientId ? "partially_completed" : "failed",
        patientId,
        failureStage: stage,
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now()
      }, { merge: true }), TIMEOUTS.firestoreWrite).catch(() => {});
      await timed("audit-failure", () => registrarEventoAuditoria({
        accion: "traspasar_pacientes_docx",
        modulo: "Traspasar pacientes",
        descripcion: "Fallo el traspaso de pacientes desde DOCX.",
        usuarioUid: user.uid,
        usuarioNombre: user.nombre || user.email || "",
        usuarioRol: user.rol || "",
        pacienteUid: patientId,
        pacienteNombre: group.confirmedFields?.nombre || "",
        exito: false,
        detalles: { groupId: group.id, transferOperationId: operationId, error: resumenError(error) }
      }), TIMEOUTS.audit).catch(() => {});
      results.push({
        groupId: group.id,
        status: patientId ? "partially_completed" : "failed",
        patientId,
        patientName: group.confirmedFields?.nombre || "",
        transferOperationId: operationId,
        stage,
        error: error.message || String(error),
        notesCreated: documentResults.filter((item) => item.duplicateStatus !== "note_existing").length,
        notesExisting: documentResults.filter((item) => item.duplicateStatus === "note_existing").length,
        vitalSignsCreated,
        anthropometryCreated,
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosesCreated,
        diagnosesOmitted,
        diagnosisIds,
        treatmentsCreated,
        treatmentsOmitted,
        treatmentIds,
        sourceSaved,
        auditRegistered
      });
    }
  }
  return results;
}
