import { db } from "../../firebase.js";
import { obtenerStorage } from "../../services/firebaseAppService.js";
import { registrarEventoAuditoria, resumenError } from "../../services/auditoria.js";
import { obtenerNombrePacienteParaMostrar } from "../../utils/nombresPacientes.js";
import { DOCX_IMPORT_CONFIG } from "../importacionDocx/docxImportConfig.js";
import { createTransferredPatient, mergeTransferredPatientFields } from "./integration/patientCreationAdapter.js?v=20260808-persistence-domains-v1";
import { buildImportedNotePayload, createTransferredNote } from "./integration/noteCreationAdapter.js";
import { createImportedDiagnoses, createImportedIndications, createImportedTreatments } from "./integration/clinicalDataImportAdapter.js?v=20260808-persistence-domains-v1";
import { vitalSignsToNotePayload } from "./parsing/vitalSignsParser.js";
import { construirActualizacionSignosVitalesDesdeNota } from "../../services/signosVitalesNotas.js";
import { listarPacientes } from "../../services/usuarios.js";
import { withPatientTransferTimeout } from "./patientTransferTimeout.js";
import { findPossiblePatientMatches, normalizeRecordNumber } from "./parsing/patientDuplicateMatcher.js";
import {
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  resolveAssociationTargetPatientId
} from "./persistence/documentPersistenceEligibility.js?v=20260809-duplicate-decision-v1";
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

function patientSummary(docSnap) {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: obtenerNombrePacienteParaMostrar(data),
    patient: data,
    nombreCompleto: data.nombreCompleto || data.nombre || "",
    nombres: data.nombres || "",
    apellidoPaterno: data.apellidoPaterno || "",
    apellidoMaterno: data.apellidoMaterno || "",
    expediente: normalizeRecordNumber(data.expediente || data.numeroExpediente || data.datosInstitucionales?.expediente),
    curp: data.curp || data.datosInstitucionales?.curp || "",
    fechaNacimiento: data.fechaNacimiento || data.datosInstitucionales?.fechaNacimiento || "",
    edad: data.edad || "",
    sexo: data.sexo || "",
    genero: data.genero || data.identidadGenero || "",
    institucion: data.institucion || data.institucionPaciente || data.datosInstitucionales?.institucion || "",
    servicio: data.servicio || data.servicioInstitucional || "",
    cama: data.cama || ""
  };
}

function opaquePatientScope(patientId = "") {
  let hash = 2166136261;
  for (const character of String(patientId || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function transferOperationIdForGroup(group = {}, targetPatientId = "") {
  const firstDocument = group.documents?.find((item) => item.hash || item.textHash);
  const baseOperationId = firstDocument?.transferOperationId || (firstDocument?.hash ? `docx_${firstDocument.hash}` : `docx_${firstDocument?.textHash || group.id}`);
  return targetPatientId ? `${baseOperationId}_associate_${opaquePatientScope(targetPatientId)}` : baseOperationId;
}

function transferOperationRef(userUid, operationId) {
  return doc(db, "usuarios", userUid, TRANSFER_COLLECTION, operationId);
}

function lockRef(userUid, operationId) {
  return doc(db, "usuarios", userUid, "patientTransferLocks", operationId);
}

export async function findExistingPatientCandidates(fields = {}, userUid = "") {
  console.info("[patient-transfer] duplicate-search:start", JSON.stringify({
    userUidPresent: Boolean(userUid),
    hasName: Boolean(fields.nombre),
    hasRecord: Boolean(fields.expediente),
    hasBirthDate: Boolean(fields.fechaNacimiento),
    hasCurp: Boolean(fields.curp)
  }));
  if (!userUid) return [];
  const patientSnapshot = await listarPacientes(userUid);
  const candidates = new Map((patientSnapshot?.docs || []).map((docSnap) => [docSnap.id, patientSummary(docSnap)]));
  const matches = findPossiblePatientMatches(fields, [...candidates.values()]);
  console.info("[patient-transfer] duplicate-search:result", JSON.stringify({
    candidateCount: candidates.size,
    matchCount: matches.length,
    highestScore: matches[0]?.score || 0,
    levels: matches.map((match) => match.level)
  }));
  return matches;
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

    const documentEligibility = (group.documents || []).map((document, documentIndex) => ({
      document,
      documentIndex,
      ...isDocumentEligibleForPersistence(document, {
        action: group.action,
        selectedResolution: group.selectedResolution,
        matchedPatientId: group.selectedPatientId || group.selectedExistingPatientId || group.duplicateResolution?.matchedPatientId || "",
        omitted: group.omitted
      })
    }));
    documentEligibility.forEach((item) => {
      console.info("[patient-transfer] persistence:eligibility", {
        detectionStatus: item.detectionStatus,
        resolution: item.resolution,
        eligible: item.eligible,
        reason: item.reason
      });
    });
    const unresolvedDocument = documentEligibility.find((item) =>
      ["duplicate-resolution-required", "missing-existing-patient", "invalid-resolution"].includes(item.reason)
    );
    if (unresolvedDocument) {
      results.push({
        groupId: group.id,
        status: "blocked",
        reason: unresolvedDocument.reason,
        patientId: "",
        patientCreated: false,
        notesCreated: 0,
        documents: []
      });
      continue;
    }
    const eligibleDocuments = documentEligibility.filter((item) => item.eligible);
    const resolutions = [...new Set(eligibleDocuments.map((item) => item.resolution))];
    if (resolutions.length > 1) {
      results.push({
        groupId: group.id,
        status: "blocked",
        reason: "mixed-duplicate-resolutions",
        patientId: "",
        patientCreated: false,
        notesCreated: 0,
        documents: []
      });
      continue;
    }
    if (!eligibleDocuments.length) {
      results.push({
        groupId: group.id,
        status: "omitted",
        reason: "no-eligible-documents",
        patientId: "",
        patientCreated: false,
        notesCreated: 0,
        documents: []
      });
      continue;
    }
    const persistenceResolution = resolutions[0];
    const effectiveAction = persistenceResolution === DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING ? "associate" : "create";
    const targetPatientId = effectiveAction === "associate"
      ? resolveAssociationTargetPatientId({
        selectedPatientId: group.selectedPatientId,
        selectedExistingPatientId: group.selectedExistingPatientId,
        matchedPatientId: eligibleDocuments[0].document.matchedPatientId
      })
      : "";
    let patientId = targetPatientId;
    let patientCreated = false;
    let stage = "pending";
    const documentResults = [];
    let diagnosesCreated = 0;
    let diagnosesOmitted = 0;
    let treatmentsCreated = 0;
    let treatmentsOmitted = 0;
    let indicationsCreated = 0;
    let indicationsOmitted = 0;
    let vitalSignsCreated = 0;
    let anthropometryCreated = 0;
    const diagnosisIds = [];
    const treatmentIds = [];
    const vitalSignRecordIds = [];
    const anthropometryRecordIds = [];
    let sourceSaved = false;
    let auditRegistered = false;
    const operationId = transferOperationIdForGroup(group, targetPatientId);
    let transferRef = transferOperationRef(user.uid, operationId);
    try {
      console.info("[patient-transfer] persistence:start", JSON.stringify({
        operationId,
        groupId: group.id,
        notesExpected: eligibleDocuments.length
      }));
      console.info("[patient-transfer] persistence-audit:before-filter", {
        groupId: group.id,
        documentsBeforeFilter: group.documents.length,
        duplicateStatuses: group.documents.map((item) => item.duplicateStatus ?? null),
        omittedFlags: group.documents.map((item) => Boolean(item.omitted)),
        actions: group.documents.map((item) => item.action ?? group.action ?? null)
      });
      const documentsToSave = eligibleDocuments.map((item) => item.document);
      console.info("[patient-transfer] persistence-audit:after-filter", {
        groupId: group.id,
        documentsAfterFilter: documentsToSave.length
      });
      documentEligibility.filter((item) => !item.eligible).forEach((item) => {
        console.warn("[patient-transfer] persistence-audit:document-skipped", {
          groupId: group.id,
          documentIndex: item.documentIndex,
          omitted: Boolean(item.document.omitted),
          duplicateStatus: item.document.duplicateStatus ?? null,
          action: item.document.action ?? group.action ?? null,
          skipReason: item.reason
        });
      });

      const operation = await acquireTransferOperation({ user, group, operationId });
      transferRef = operation.ref;
      if (effectiveAction === "associate") {
        console.info("patient-transfer:association-selected", {
          mode: "associate_existing",
          hasTargetPatient: Boolean(targetPatientId),
          hasOperationPatient: Boolean(operation.data?.patientId),
          sameTargetAsOperation: Boolean(operation.data?.patientId) && operation.data.patientId === targetPatientId
        });
        console.info("patient-transfer:target-patient-resolved", {
          mode: "associate_existing",
          hasTargetPatient: Boolean(patientId)
        });
      }
      const resumingCompletedOperation = operation.data?.status === "completed";
      if (resumingCompletedOperation) {
        console.info("patient-transfer:persist-resume", {
          hasPatient: Boolean(operation.data?.patientId),
          expectedDocuments: documentsToSave.length,
          recordedNotes: operation.data?.noteIds?.length || 0
        });
      }
      if (operation.data?.patientId && effectiveAction !== "associate") {
        patientId = operation.data.patientId;
        traceTransfer("reuse-patient", { authUid: user.uid, transferOperationId: operationId, patientId });
      }

      if (effectiveAction === "create") {
        if (!patientId) {
          const resolution = {
            ...(group.duplicateResolution || {}),
            action: group.selectedResolution || group.duplicateResolution?.action || null,
            matchedPatientId: group.selectedExistingPatientId || group.duplicateResolution?.matchedPatientId || ""
          };
          if (resolution.action === DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING) {
            patientId = resolution.matchedPatientId || group.selectedPatientId || "";
            traceTransfer("duplicate-resolution", { authUid: user.uid, transferOperationId: operationId, resolution: "link-existing", patientId: Boolean(patientId) });
          } else if (resolution.action === DUPLICATE_RESOLUTION.OMIT) {
            results.push({ groupId: group.id, status: "omitted", patientId: "", notesCreated: 0, duplicateResolution: "omit" });
            continue;
          } else {
            const strongest = (group.possibleMatches || group.candidates || [])[0];
            if (strongest && ["muy_alta", "alta"].includes(strongest.level) && resolution.action !== DUPLICATE_RESOLUTION.CREATE_NEW) {
              const error = new Error("Resuelve la posible coincidencia antes de crear el paciente.");
              error.stage = "duplicate_resolution";
              throw error;
            }
          }
        }
        if (!patientId) {
          stage = "creating_patient";
          onProgress?.({ stage, message: "Creando paciente...", progress: 30 });
          console.info("[patient-transfer] patient:create:start", JSON.stringify({ operationId, groupId: group.id, patientCreated: false }));
          const patientRef = await timed("create-patient", () => createTransferredPatient({ ...group.confirmedFields, transferOperationId: operationId }, user), TIMEOUTS.createPatient);
          patientId = patientRef?.id || patientRef?.patientId || "";
          if (!patientId) throw new Error("El paciente no devolvió un identificador válido.");
          patientCreated = true;
          console.info("[patient-transfer] patient:create:success", JSON.stringify({ operationId, patientCreated: true, patientIdPresent: true }));
          const createdPatient = await timed("verify-patient", () => getDoc(doc(db, "usuarios", patientId)), TIMEOUTS.query);
          if (!createdPatient.exists()) throw new Error("El paciente fue creado pero no pudo verificarse en el expediente del médico.");
          console.info("[patient-transfer] patient:verify", JSON.stringify({ operationId, patientIdPresent: true, exists: true }));
          console.info("[patient-transfer] patient-created", {
            groupId: group.id,
            patientIdPresent: true
          });
          await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults, status: "patient_created", lastCompletedStage: "patient_created" });
        }
      }
      if (!patientId) throw new Error("Selecciona un paciente existente o confirma crear uno nuevo.");
      if (effectiveAction === "associate") {
        const existingPatient = await timed("verify-existing-patient", () => getDoc(doc(db, "usuarios", patientId)), TIMEOUTS.query);
        if (!existingPatient.exists()) throw new Error("El paciente existente seleccionado no pudo verificarse.");
        console.info("[patient-transfer] patient:verify", JSON.stringify({ operationId, patientIdPresent: true, exists: true, reused: true }));
      }
      console.info("patient-transfer:persistence-target", {
        mode: effectiveAction === "associate" ? "associate_existing" : "create_new",
        hasTargetPatient: Boolean(patientId),
        hasSourcePatient: Boolean(operation.data?.patientId),
        sameTargetAsSource: Boolean(operation.data?.patientId) && operation.data.patientId === patientId
      });

      console.info("patient-transfer:persist-demographics-start", { patientCreated, associated: effectiveAction === "associate" });
      if (effectiveAction === "associate") {
        await timed("merge-imported-patient-fields", () => mergeTransferredPatientFields(patientId, group.confirmedFields || {}, user), TIMEOUTS.firestoreWrite);
      }
      console.info("patient-transfer:persist-demographics-success", { patientCreated, associated: effectiveAction === "associate" });

      stage = "creating_transfer_record";
      onProgress?.({ stage, message: "Preparando registro de traspaso...", progress: 35 });
      await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults: [], status: "processing", lastCompletedStage: patientCreated ? "patient_created" : "patient_reused" });
      console.info("patient-transfer:persist-notes-start", { documents: documentsToSave.length });
      for (const document of documentsToSave) {
        stage = "creating_note";
        const noteImportKey = `${operationId}_${documentResults.length}_${patientId}`;
        const noteRef = doc(db, "usuarios", patientId, "notasMedicas", noteImportKey);
        const existingNote = await timed(`check-note-${documentResults.length + 1}`, () => getDoc(noteRef), TIMEOUTS.query);
        const noteWasExisting = existingNote.exists();
        const selectedVitals = (document.vitalSignsCandidates || []).find((candidate) => candidate.include === true);
        const vitalSignsPayload = selectedVitals ? vitalSignsToNotePayload(selectedVitals, group.confirmedFields || {}) : {};
        const notePayload = buildImportedNotePayload({
          document: { ...document, vitalSignsPayload },
          confirmedType: document.confirmedType,
          sourceFile: { name: document.file.name, hash: document.hash },
          importId: operationId,
          user
        });
        let note;
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
          note = { notaId: noteRef.id, id: noteRef.id };
        } else {
          onProgress?.({ stage, message: `Creando nota ${documentResults.length + 1}...`, progress: 50 });
          traceTransfer(stage, { operation: "guardarBorradorNotaClinica", path: `usuarios/${patientId}/notasMedicas`, authUid: user.uid, patientId });
          traceTransfer("create-note-start", { authUid: user.uid, transferOperationId: operationId, patientId, noteId: noteImportKey });
          console.info("[patient-transfer] note:create", JSON.stringify({ operationId, patientIdPresent: true, noteIndex: documentResults.length }));
          note = await timed(`create-note-${documentResults.length + 1}`, () => createTransferredNote(patientId, {
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
        }
        console.info("patient-transfer:persist-notes-success", { created: !noteWasExisting, existing: noteWasExisting });
        const selectedVitalCandidates = (document.vitalSignsCandidates || [])
          .filter((candidate) => candidate.include === true);
        if (selectedVitalCandidates.length) {
          stage = "creating_vital_signs";
          onProgress?.({ stage, message: "Registrando signos vitales...", progress: 54 });
          console.info("patient-transfer:persist-vitals-start", { candidates: selectedVitalCandidates.length, noteExisting: noteWasExisting });
          for (let vitalIndex = 0; vitalIndex < selectedVitalCandidates.length; vitalIndex += 1) {
            const vitalCandidate = selectedVitalCandidates[vitalIndex];
            const candidatePayload = vitalSignsToNotePayload(vitalCandidate, group.confirmedFields || {});
            const sourceNoteId = `${note.notaId || note.id || noteImportKey}:vital:${vitalCandidate.id || vitalIndex}`;
            const update = await timed(`create-vitals-${documentResults.length + 1}-${vitalIndex + 1}`, async () => {
              const patientSnap = await getDoc(doc(db, "usuarios", patientId));
              const next = construirActualizacionSignosVitalesDesdeNota({
                paciente: patientSnap.exists() ? patientSnap.data() : {},
                nota: {
                  ...notePayload,
                  observacionFray: { ...(notePayload.observacionFray || {}), ...candidatePayload },
                  signosVitales: candidatePayload
                },
                sourceNoteId,
                createdBy: user.uid
              });
              if (!next) return null;
              await setDoc(doc(db, "usuarios", patientId), next, { merge: true });
              return next;
            }, TIMEOUTS.createVitals);
            if (!update) continue;
            vitalSignsCreated += 1;
            vitalSignRecordIds.push(sourceNoteId);
            if (candidatePayload.peso || candidatePayload.talla || candidatePayload.imc) {
              anthropometryCreated += 1;
              anthropometryRecordIds.push(`${sourceNoteId}:somatometria`);
            }
          }
          console.info("patient-transfer:persist-vitals-success", { created: vitalSignsCreated, anthropometry: anthropometryCreated });
        }

        stage = "creating_diagnoses";
        onProgress?.({ stage, message: "Registrando diagnosticos confirmados...", progress: 58 });
        console.info("patient-transfer:persist-diagnoses-start", {
          candidates: (document.diagnosisCandidates || []).length,
          selected: (document.diagnosisCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length,
          noteExisting: noteWasExisting
        });
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
        console.info("patient-transfer:persist-diagnoses-success", { created: diagnosisResult.created.length, existing: diagnosisResult.existing.length });

        stage = "creating_treatments";
        onProgress?.({ stage, message: "Registrando tratamientos confirmados...", progress: 64 });
        console.info("patient-transfer:persist-treatments-start", {
          candidates: (document.treatmentCandidates || []).length,
          selected: (document.treatmentCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length,
          noteExisting: noteWasExisting
        });
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
        console.info("patient-transfer:persist-treatments-success", { created: treatmentResult.created.length, existing: treatmentResult.existing.length });

        const indicationResult = await timed(`create-indications-${documentResults.length + 1}`, () => createImportedIndications(patientId, document.treatmentPlanCandidates || [], {
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          noteId: note.notaId || note.id || noteImportKey,
          date: document.metadata?.documentDate || "",
          time: document.metadata?.documentHour || "",
          service: group.confirmedFields?.servicio || ""
        }), TIMEOUTS.createClinicalData);
        indicationsCreated += Number(indicationResult.created);
        indicationsOmitted += indicationResult.omitted;

        if (!noteWasExisting) {
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
        detalles: { groupId: group.id, transferOperationId: operationId, patientCreated, documents: documentResults.length, diagnosesCreated, treatmentsCreated, indicationsCreated }
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
        indicationCount: indicationsCreated,
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
        indicationsCreated,
        indicationsOmitted,
        sourceSaved,
        auditRegistered,
        duplicatesAvoided: 0,
        documents: documentResults
      });
      console.info("[patient-transfer] persistence:completed", JSON.stringify({ operationId, patientIdPresent: Boolean(patientId), notesCreated: documentResults.filter((item) => item.duplicateStatus !== "note_existing").length }));
    } catch (error) {
      console.info("[patient-transfer] persistence:failed", JSON.stringify({
        operationId,
        stage: error?.stage || stage,
        patientIdPresent: Boolean(patientId),
        notesCreated: documentResults.filter((item) => item.duplicateStatus !== "note_existing").length
      }));
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
        indicationCount: indicationsCreated,
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
        indicationsCreated,
        indicationsOmitted,
        sourceSaved,
        auditRegistered
      });
    }
  }
  return results;
}
