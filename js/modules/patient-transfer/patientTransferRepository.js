import { db } from "../../firebase.js";
import { obtenerStorage } from "../../services/firebaseAppService.js";
import { registrarEventoAuditoria, resumenError } from "../../services/auditoria.js";
import { obtenerNombrePacienteParaMostrar } from "../../utils/nombresPacientes.js";
import { DOCX_IMPORT_CONFIG } from "../importacionDocx/docxImportConfig.js";
import { createTransferredPatient, mergeTransferredPatientFields } from "./integration/patientCreationAdapter.js?v=20260808-persistence-domains-v1";
import { buildImportedNotePayload, createTransferredNote, importedNoteHasClinicalContent, importedNoteId } from "./integration/noteCreationAdapter.js?v=20260813-notes-canonical-text-v1";
import { createImportedDiagnoses, createImportedIndications, createImportedTreatments } from "./integration/clinicalDataImportAdapter.js?v=v163-medications-indications-v1";
import { runVitalSignsAndDiagnosesIndependently } from "./domainPersistenceIsolation.js?v=v161-imported-diagnoses-isolation-v1";
import { vitalSignsToNotePayload } from "./parsing/vitalSignsParser.js?v=20260808-imported-vitals-v1";
import { construirActualizacionSignosVitalesDesdeNota } from "../../services/signosVitalesNotas.js?v=v161-imported-diagnoses-isolation-v1";
import { claveDiagnosticoPaciente } from "../../services/diagnosticosPaciente.js?v=v160-imported-diagnoses-v1";
import { listarPacientes } from "../../services/usuarios.js";
import { withPatientTransferTimeout } from "./patientTransferTimeout.js";
import { findPossiblePatientMatches, normalizeRecordNumber } from "./parsing/patientDuplicateMatcher.js";
import {
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  resolveAssociationTargetPatientId
} from "./persistence/documentPersistenceEligibility.js?v=20260809-duplicate-decision-v1";
import {
  canonicalImportedNoteReferences,
  canVerifyCanonicalImportedNotes
} from "./persistence/importedNoteDuplicateValidation.js?v=20260813-notes-duplicate-validation-v1";
import { sanitizeFirestorePayload } from "./persistence/firestorePayloadSanitizer.js?v=20260813-notes-canonical-text-v1";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
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

const VITAL_SIGN_FIELDS = Object.freeze([
  "presionArterial",
  "frecuenciaCardiaca",
  "frecuenciaRespiratoria",
  "temperatura",
  "saturacionO2"
]);

function vitalSignsPresence(payload = {}) {
  return {
    hasPA: payload.presionArterial !== "" && payload.presionArterial !== null && payload.presionArterial !== undefined,
    hasFC: payload.frecuenciaCardiaca !== "" && payload.frecuenciaCardiaca !== null && payload.frecuenciaCardiaca !== undefined,
    hasFR: payload.frecuenciaRespiratoria !== "" && payload.frecuenciaRespiratoria !== null && payload.frecuenciaRespiratoria !== undefined,
    hasTemperature: payload.temperatura !== "" && payload.temperatura !== null && payload.temperatura !== undefined,
    hasSpO2: payload.saturacionO2 !== "" && payload.saturacionO2 !== null && payload.saturacionO2 !== undefined
  };
}

function technicalFingerprint(value = "") {
  const text = String(value || "");
  if (!text) return "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function firebaseRuntimeInfo() {
  return {
    projectId: String(db?.app?.options?.projectId || ""),
    appName: String(db?.app?.name || "")
  };
}

function patientVitalSignsPresence(patient = {}) {
  const current = patient.signosVitales || {};
  const institutional = patient.datosInstitucionales || {};
  return vitalSignsPresence({
    presionArterial: patient.presionArterial ?? current.presionArterial ?? institutional.presionArterial,
    frecuenciaCardiaca: patient.frecuenciaCardiaca ?? current.frecuenciaCardiaca ?? institutional.frecuenciaCardiaca,
    frecuenciaRespiratoria: patient.frecuenciaRespiratoria ?? current.frecuenciaRespiratoria ?? institutional.frecuenciaRespiratoria,
    temperatura: patient.temperatura ?? current.temperatura ?? institutional.temperatura,
    saturacionO2: patient.saturacionO2 ?? patient.saturacionOxigeno ?? current.saturacionO2 ?? current.saturacionOxigeno
  });
}

function patientVitalHistoryCount(patient = {}) {
  return VITAL_SIGN_FIELDS.reduce((count, field) => count + (Array.isArray(patient.historialSignosVitales?.[field]) ? patient.historialSignosVitales[field].length : 0), 0);
}

function patientVitalHistorySummary(patient = {}) {
  const entriesFor = (field) => Array.isArray(patient.historialSignosVitales?.[field])
    ? patient.historialSignosVitales[field].length
    : 0;
  return {
    totalEntries: patientVitalHistoryCount(patient),
    paEntries: entriesFor("presionArterial"),
    fcEntries: entriesFor("frecuenciaCardiaca"),
    frEntries: entriesFor("frecuenciaRespiratoria"),
    tempEntries: entriesFor("temperatura"),
    spo2Entries: entriesFor("saturacionO2")
  };
}

function vitalHistoryContainsSource(patient = {}, sourceNoteId = "", payload = {}) {
  const fieldsWithValues = VITAL_SIGN_FIELDS.filter((field) => (
    payload[field] !== "" && payload[field] !== null && payload[field] !== undefined
  ));
  return fieldsWithValues.length > 0 && fieldsWithValues.every((field) => (
    (patient.historialSignosVitales?.[field] || []).some((record) => String(record?.sourceNoteId || "") === sourceNoteId)
  ));
}

function currentVitalSignsObserved(payload = {}, patient = {}, expectedFields = VITAL_SIGN_FIELDS) {
  const current = patient.signosVitales || {};
  const institutional = patient.datosInstitucionales || {};
  return expectedFields.every((field) => {
    const expected = payload[field];
    if (expected === "" || expected === null || expected === undefined) return true;
    const actual = patient[field] ?? current[field] ?? institutional[field];
    return String(actual ?? "") === String(expected);
  });
}

function vitalSignsFieldsForDocument(document = {}, confirmedFields = {}) {
  return {
    ...confirmedFields,
    fecha: document.metadata?.documentDate || document.date || confirmedFields.fecha || "",
    hora: document.metadata?.documentHour || document.time || confirmedFields.hora || ""
  };
}

async function persistImportedVitalSignsForDocument({
  document,
  documentIndex,
  group,
  patientId,
  effectiveAction,
  user
}) {
  const candidates = document.vitalSignsCandidates || [];
  const selectedCandidates = candidates.filter((candidate) => candidate.include === true);
  const vitalSignsFields = vitalSignsFieldsForDocument(document, group.confirmedFields || {});
  const sourcePayload = selectedCandidates.reduce((combined, candidate) => ({
    ...combined,
    ...Object.fromEntries(Object.entries(vitalSignsToNotePayload(candidate, vitalSignsFields))
      .filter(([, value]) => value !== "" && value !== null && value !== undefined))
  }), {});
  console.info("patient-transfer:vitals-source-real", {
    candidateCount: candidates.length,
    includedCount: selectedCandidates.length,
    ...vitalSignsPresence(sourcePayload)
  });

  if (candidates.length && !selectedCandidates.length) {
    const error = new Error("Se detectaron signos vitales, pero ninguno fue seleccionado para importar.");
    error.code = "vitals-not-included";
    throw error;
  }
  if (!selectedCandidates.length) {
    return { created: 0, recordIds: [], anthropometryCreated: 0, anthropometryRecordIds: [] };
  }

  const patientRef = doc(db, "usuarios", patientId);
  let created = 0;
  let anthropometryCreated = 0;
  const recordIds = [];
  const anthropometryRecordIds = [];

  for (let vitalIndex = 0; vitalIndex < selectedCandidates.length; vitalIndex += 1) {
    const candidate = selectedCandidates[vitalIndex];
    const candidatePayload = vitalSignsToNotePayload(candidate, vitalSignsFields);
    const sourceIdentity = [
      document.hash || document.textHash || document.id || `document-${documentIndex}`,
      document.sourceNoteSegmentId || document.id || `segment-${documentIndex}`
    ].filter(Boolean).join(":");
    const sourceNoteId = `${sourceIdentity}:vital:${candidate.id || vitalIndex}`;
    console.info("patient-transfer:vitals-history-source", {
      ...vitalSignsPresence(candidatePayload),
      sourceAvailable: Boolean(sourceNoteId)
    });
    console.info("patient-transfer:vitals-history-target", {
      mode: effectiveAction === "associate" ? "associate_existing" : "create_new",
      hasTarget: Boolean(patientId)
    });
    console.info("patient-transfer:vitals-write-start", {
      candidateIndex: vitalIndex,
      hasClinicalDate: Boolean(vitalSignsFields.fecha),
      hasClinicalTime: Boolean(vitalSignsFields.hora),
      ...vitalSignsPresence(candidatePayload)
    });

    const result = await timed(`create-vitals-${documentIndex + 1}-${vitalIndex + 1}`, async () => {
      const beforeSnap = await getDocFromServer(patientRef);
      const patientBefore = beforeSnap.exists() ? beforeSnap.data() : {};
      const historyBefore = patientVitalHistorySummary(patientBefore);
      const sourcePresentBefore = vitalHistoryContainsSource(patientBefore, sourceNoteId, candidatePayload);
      console.info("patient-transfer:vitals-history-before-real", {
        exists: beforeSnap.exists(),
        ...historyBefore
      });
      const vitalAudit = {};
      const update = construirActualizacionSignosVitalesDesdeNota({
        paciente: patientBefore,
        nota: {
          fechaNota: vitalSignsFields.fecha || "",
          horaNota: vitalSignsFields.hora || "",
          observacionFray: candidatePayload,
          signosVitales: candidatePayload
        },
        sourceNoteId,
        createdBy: user.uid,
        audit: vitalAudit
      });
      if (!update) throw new Error("No se pudo construir el registro canónico de signos vitales.");

      const writesRootCurrent = VITAL_SIGN_FIELDS.some((field) => update[field] !== "" && update[field] !== null && update[field] !== undefined);
      const writesSignosVitales = VITAL_SIGN_FIELDS.some((field) => update.signosVitales?.[field] !== "" && update.signosVitales?.[field] !== null && update.signosVitales?.[field] !== undefined);
      const writesHistory = VITAL_SIGN_FIELDS.some((field) => Array.isArray(update.historialSignosVitales?.[field]) && update.historialSignosVitales[field].length > 0);
      console.info("patient-transfer:vitals-write-destination", {
        ...firebaseRuntimeInfo(),
        targetFingerprint: technicalFingerprint(patientId),
        writesRootCurrent,
        writesSignosVitales,
        writesHistory
      });

      await setDoc(patientRef, update, { merge: true });
      const afterSnap = await getDocFromServer(patientRef);
      const patientAfter = afterSnap.exists() ? afterSnap.data() : {};
      const historyAfter = patientVitalHistorySummary(patientAfter);
      const sourcePresentAfter = vitalHistoryContainsSource(patientAfter, sourceNoteId, candidatePayload);
      const historyChanged = historyAfter.totalEntries > historyBefore.totalEntries;
      const currentPresence = patientVitalSignsPresence(patientAfter);
      const currentObserved = !vitalAudit.becameCurrent || currentVitalSignsObserved(
        candidatePayload,
        patientAfter,
        vitalAudit.currentUpdatedFields || []
      );
      const writeObserved = sourcePresentAfter && (historyChanged || sourcePresentBefore) && currentObserved;

      console.info("patient-transfer:vitals-history-after-real", {
        exists: afterSnap.exists(),
        ...historyAfter,
        ...currentPresence
      });
      console.info("patient-transfer:vitals-history-insert", {
        inserted: historyChanged,
        idempotentExisting: sourcePresentBefore,
        historyAfter: historyAfter.totalEntries
      });
      console.info("patient-transfer:vitals-history-current-update", {
        becameCurrent: Boolean(vitalAudit.becameCurrent)
      });
      console.info("patient-transfer:vitals-history-after", {
        ...vitalSignsPresence(candidatePayload),
        historyAfter: historyAfter.totalEntries,
        inserted: historyChanged,
        becameCurrent: Boolean(vitalAudit.becameCurrent)
      });
      console.info("patient-transfer:vitals-write-result", {
        rootUpdateSucceeded: writesRootCurrent,
        historyUpdateSucceeded: writeObserved
      });
      console.info("patient-transfer:vitals-read-after-write", {
        exists: afterSnap.exists(),
        ...currentPresence,
        historyCount: historyAfter.totalEntries,
        readSucceeded: true
      });

      if (!writeObserved) {
        console.error("patient-transfer:vitals-history-write-not-observed", {
          writeResolved: true,
          historyChanged,
          currentObserved
        });
        const error = new Error("No se pudieron confirmar los signos vitales en el expediente.");
        error.code = "vitals-history-write-not-observed";
        throw error;
      }
      return { sourceNoteId, candidatePayload, update };
    }, TIMEOUTS.createVitals);

    created += 1;
    recordIds.push(result.sourceNoteId);
    if (result.candidatePayload.peso || result.candidatePayload.talla || result.candidatePayload.imc) {
      anthropometryCreated += 1;
      anthropometryRecordIds.push(`${result.sourceNoteId}:somatometria`);
    }
  }

  return { created, recordIds, anthropometryCreated, anthropometryRecordIds };
}

function diagnosisHistoryFromPatient(patient = {}) {
  return Array.isArray(patient.historialDiagnosticos) ? patient.historialDiagnosticos : [];
}

function diagnosisHistoryKeys(patient = {}) {
  return new Set(diagnosisHistoryFromPatient(patient)
    .map((item) => item?.importCandidateKey || claveDiagnosticoPaciente(item))
    .filter(Boolean));
}

async function persistImportedDiagnosesForDocument({
  document,
  documentIndex,
  patientId,
  operationId,
  effectiveAction,
  user
}) {
  const candidates = document.diagnosisCandidates || [];
  const selectedCandidates = candidates.filter((candidate) => candidate.include === true || candidate.selectedForImport === true);
  const patientRef = doc(db, "usuarios", patientId);
  console.info("patient-transfer:diagnoses-target", {
    mode: effectiveAction === "associate" ? "associate_existing" : "create_new",
    hasTarget: Boolean(patientId)
  });
  const beforeSnap = await getDocFromServer(patientRef);
  const patientBefore = beforeSnap.exists() ? beforeSnap.data() : {};
  const historyBefore = diagnosisHistoryFromPatient(patientBefore);

  console.info("patient-transfer:diagnoses-history-before-real", {
    total: historyBefore.length
  });
  console.info("patient-transfer:diagnoses-source-real", {
    candidateCount: candidates.length,
    includedCount: selectedCandidates.length,
    codedCount: selectedCandidates.filter((candidate) => Boolean(candidate.code || candidate.codes?.length)).length,
    uncodedCount: selectedCandidates.filter((candidate) => !candidate.code && !candidate.codes?.length).length
  });
  console.info("patient-transfer:diagnoses-write-start", {
    candidateCount: candidates.length,
    includedCount: selectedCandidates.length,
    writeNeeded: selectedCandidates.length > 0
  });

  if (!selectedCandidates.length) {
    console.info("patient-transfer:diagnoses-history-after-real", {
      total: historyBefore.length,
      inserted: 0,
      idempotent: 0
    });
    console.info("patient-transfer:diagnoses-write-result", {
      writeResolved: false,
      expectedFound: true,
      inserted: 0,
      idempotent: 0,
      skipped: true
    });
    return {
      created: [],
      existing: [],
      omitted: candidates.length,
      expectedKeys: [],
      detected: candidates.length,
      included: 0
    };
  }

  const sourceIdentity = [
    document.hash || document.textHash || document.id || `document-${documentIndex}`,
    document.sourceNoteSegmentId || document.id || `segment-${documentIndex}`
  ].filter(Boolean).join(":");
  let result;
  try {
    result = await timed(`create-diagnoses-${documentIndex + 1}`, () => createImportedDiagnoses(patientId, candidates, {
      transferOperationId: operationId,
      sourceFileHash: document.hash || document.textHash || "",
      sourceNoteId: sourceIdentity,
      fileName: document.file?.name || "",
      date: document.metadata?.documentDate || document.date || "",
      time: document.metadata?.documentHour || document.time || "",
      patient: patientBefore,
      user
    }), TIMEOUTS.createClinicalData);
  } catch (error) {
    console.error("patient-transfer:diagnoses-write-result", {
      writeResolved: false,
      expectedFound: false,
      errorCode: error?.code || error?.name || "unknown"
    });
    throw error;
  }

  const afterSnap = await getDocFromServer(patientRef);
  const patientAfter = afterSnap.exists() ? afterSnap.data() : {};
  const historyAfter = diagnosisHistoryFromPatient(patientAfter);
  const afterKeys = diagnosisHistoryKeys(patientAfter);
  const missingKeys = (result.expectedKeys || []).filter((key) => !afterKeys.has(key));

  console.info("patient-transfer:diagnoses-history-after-real", {
    total: historyAfter.length,
    inserted: result.created.length,
    idempotent: result.existing.length
  });

  if (missingKeys.length) {
    console.error("patient-transfer:diagnoses-write-result", {
      writeResolved: true,
      expectedFound: false,
      inserted: result.created.length,
      idempotent: result.existing.length
    });
    console.error("patient-transfer:diagnoses-write-not-observed", {
      writeResolved: true,
      expectedCount: result.expectedKeys.length,
      missingCount: missingKeys.length
    });
    const error = new Error("No se pudieron confirmar los diagnósticos en el expediente.");
    error.code = "diagnoses-write-not-observed";
    throw error;
  }

  console.info("patient-transfer:diagnoses-write-result", {
    writeResolved: true,
    expectedFound: true,
    inserted: result.created.length,
    idempotent: result.existing.length
  });
  return {
    ...result,
    detected: candidates.length,
    included: selectedCandidates.length
  };
}

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

  async function canonicalNotesExist(record = {}, { requireCompletedStatus = false, source = "unknown" } = {}) {
    const { patientId, noteIds } = canonicalImportedNoteReferences(record);
    if (!canVerifyCanonicalImportedNotes(record, { requireCompletedStatus })) {
      console.warn("patient-transfer:stale-duplicate-ignored", {
        source,
        completed: String(record.status || "").toLowerCase() === "completed",
        hasTarget: Boolean(patientId),
        noteReferenceCount: noteIds.length,
        canonicalNotesObserved: false
      });
      return false;
    }

    try {
      const notes = await Promise.all(noteIds.map((noteId) => timed(
        "duplicate-canonical-note-query",
        () => getDocFromServer(doc(db, "usuarios", patientId, "notasMedicas", noteId)),
        TIMEOUTS.query
      )));
      const observed = notes.length === noteIds.length && notes.every((note) => note.exists());
      if (!observed) {
        console.warn("patient-transfer:stale-duplicate-ignored", {
          source,
          completed: String(record.status || "").toLowerCase() === "completed",
          hasTarget: true,
          noteReferenceCount: noteIds.length,
          canonicalNotesObserved: false
        });
      }
      return observed;
    } catch (error) {
      console.warn("patient-transfer:duplicate-note-verification-unavailable", {
        source,
        errorCode: error?.code || error?.name || "unknown"
      });
      return false;
    }
  }

  if (hash) {
    const opId = `docx_${hash}`;
    const opPath = `usuarios/${userUid}/${TRANSFER_COLLECTION}/${opId}`;
    traceTransfer("duplicate-check", { operation: "getDoc", path: opPath, authUid: userUid });
    const operation = await timed("duplicate-operation-query", () => getDoc(transferOperationRef(userUid, opId)), TIMEOUTS.query);
    if (operation.exists()) {
      const operationRecord = { id: operation.id, ...operation.data() };
      if (await canonicalNotesExist(operationRecord, { requireCompletedStatus: true, source: "operation" })) {
        return { ...operationRecord, duplicateStatus: "operacion_asociada" };
      }
    }
    const exactPath = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${hash}`;
    traceTransfer("duplicate-check", { operation: "getDoc", path: exactPath, authUid: userUid });
    const exact = await timed("duplicate-exact-query", () => getDoc(doc(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, hash)), TIMEOUTS.query);
    if (exact.exists()) {
      const exactRecord = { id: exact.id, ...exact.data() };
      if (await canonicalNotesExist(exactRecord, { source: "exact-hash" })) {
        return { ...exactRecord, duplicateStatus: "duplicado_exacto" };
      }
    }
  }
  if (textHash) {
    const path = `usuarios/${userUid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}`;
    traceTransfer("duplicate-check", { operation: "getDocs", path, authUid: userUid, query: { ownerUid: userUid, textHash } });
    const snap = await timed("duplicate-text-query", () => getDocs(query(
      collection(db, "usuarios", userUid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection),
      where("ownerUid", "==", userUid),
      where("textHash", "==", textHash),
      limit(10)
    )), TIMEOUTS.query);
    for (const docSnap of snap.docs) {
      const textRecord = { id: docSnap.id, ...docSnap.data() };
      if (await canonicalNotesExist(textRecord, { source: "normalized-text" })) {
        return { ...textRecord, duplicateStatus: "posible_duplicado" };
      }
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
  console.info("patient-transfer:firebase-runtime", firebaseRuntimeInfo());
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
    let diagnosesDetected = 0;
    let diagnosesIncluded = 0;
    let diagnosesIdempotent = 0;
    let diagnosesAttempted = false;
    const diagnosisErrors = [];
    let treatmentsCreated = 0;
    let treatmentsOmitted = 0;
    let treatmentsIdempotent = 0;
    const treatmentErrors = [];
    let indicationsCreated = 0;
    let indicationsOmitted = 0;
    let indicationsIdempotent = 0;
    const indicationErrors = [];
    let notesDetected = eligibleDocuments.length;
    let notesIncluded = 0;
    let notesCreated = 0;
    let notesExisting = 0;
    let notesOmitted = 0;
    const noteErrors = [];
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
      console.info("patient-transfer:target-runtime", {
        mode: effectiveAction === "associate" ? "associate_existing" : "create_new",
        targetFingerprint: technicalFingerprint(patientId)
      });
      const notesWithDate = documentsToSave.filter((item) => Boolean(item.sourceNoteDate || item.metadata?.documentDate || item.date)).length;
      console.info("patient-transfer:notes-source-real", {
        segmentCount: documentsToSave.length,
        includedCount: documentsToSave.filter((item) => !item.omitted).length,
        withDateCount: notesWithDate,
        withoutDateCount: documentsToSave.length - notesWithDate
      });
      let notesBeforeTotal = 0;
      try {
        const notesBefore = await timed("notes-history-before", () => getDocs(collection(db, "usuarios", patientId, "notasMedicas")), TIMEOUTS.query);
        notesBeforeTotal = notesBefore.size;
      } catch (error) {
        console.warn("patient-transfer:notes-history-before-unavailable", { errorCode: error?.code || error?.name || "unknown" });
      }
      console.info("patient-transfer:notes-history-before-real", { total: notesBeforeTotal });

      console.info("patient-transfer:persist-demographics-start", { patientCreated, associated: effectiveAction === "associate" });
      if (effectiveAction === "associate") {
        await timed("merge-imported-patient-fields", () => mergeTransferredPatientFields(patientId, group.confirmedFields || {}, user), TIMEOUTS.firestoreWrite);
      }
      console.info("patient-transfer:persist-demographics-success", { patientCreated, associated: effectiveAction === "associate" });

      stage = "creating_transfer_record";
      onProgress?.({ stage, message: "Preparando registro de traspaso...", progress: 35 });
      await updateTransferImportRecord({ transferRef, user, group, patientId, documentResults: [], status: "processing", lastCompletedStage: patientCreated ? "patient_created" : "patient_reused" });
      console.info("patient-transfer:persist-notes-start", { documents: documentsToSave.length });
      for (let documentIndex = 0; documentIndex < documentsToSave.length; documentIndex += 1) {
        const document = documentsToSave[documentIndex];
        const domainOutcome = await runVitalSignsAndDiagnosesIndependently({
          persistVitalSigns: async () => {
            stage = "creating_vital_signs";
            onProgress?.({ stage, message: "Registrando signos vitales...", progress: 42 });
            const vitalResult = await persistImportedVitalSignsForDocument({
              document,
              documentIndex,
              group,
              patientId,
              effectiveAction,
              user
            });
            vitalSignsCreated += vitalResult.created;
            vitalSignRecordIds.push(...vitalResult.recordIds);
            anthropometryCreated += vitalResult.anthropometryCreated;
            anthropometryRecordIds.push(...vitalResult.anthropometryRecordIds);
            console.info("patient-transfer:persist-vitals-success", {
              created: vitalResult.created,
              anthropometry: vitalResult.anthropometryCreated
            });
            return vitalResult;
          },
          persistDiagnoses: async () => {
            stage = "creating_diagnoses";
            diagnosesAttempted = true;
            const documentDiagnoses = document.diagnosisCandidates || [];
            diagnosesDetected += documentDiagnoses.length;
            diagnosesIncluded += documentDiagnoses.filter((candidate) => (
              candidate.include === true || candidate.selectedForImport === true
            )).length;
            onProgress?.({ stage, message: "Registrando diagnosticos confirmados...", progress: 46 });
            const diagnosisResult = await persistImportedDiagnosesForDocument({
              document,
              documentIndex,
              patientId,
              operationId,
              effectiveAction,
              user
            });
            diagnosesCreated += diagnosisResult.created.length;
            diagnosesIdempotent += diagnosisResult.existing.length;
            diagnosesOmitted += diagnosisResult.omitted;
            diagnosisIds.push(...diagnosisResult.created.map((item) => item.id).filter(Boolean));
            console.info("patient-transfer:persist-diagnoses-success", {
              created: diagnosisResult.created.length,
              existing: diagnosisResult.existing.length
            });
            return diagnosisResult;
          },
          onDomainError: ({ domain, error }) => {
            const domainStage = domain === "diagnoses" ? "creating_diagnoses" : "creating_vital_signs";
            if (!error.stage) error.stage = domainStage;
            const errorCode = error?.code || error?.name || "unknown";
            if (domain === "diagnoses") diagnosisErrors.push({ code: errorCode });
            console.error("patient-transfer:domain-error", {
              domain,
              stage: domainStage,
              errorCode
            });
          }
        });
        if (domainOutcome.errors.length) {
          console.warn("patient-transfer:notes-after-domain-error", {
            domainErrorCount: domainOutcome.errors.length,
            noteWillStillBeAttempted: true
          });
        }

        const clinicalSourceNoteKey = `${operationId}_${documentResults.length}_${patientId}`;
        const noteImportKey = importedNoteId({
          targetPatientId: patientId,
          sourceFileHash: document.hash,
          sourceNoteSegmentId: document.sourceNoteSegmentId,
          sourceDocumentIndex: document.sourceDocumentIndex ?? documentResults.length
        });
        const clinicalContext = {
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          noteId: clinicalSourceNoteKey,
          fileName: document.file.name,
          date: document.metadata?.documentDate || "",
          time: document.metadata?.documentHour || "",
          service: group.confirmedFields?.servicio || "",
          effectiveAction,
          user
        };
        try {
          stage = "creating_treatments";
          onProgress?.({ stage, message: "Registrando tratamientos confirmados...", progress: 64 });
          console.info("patient-transfer:persist-treatments-start", {
            candidates: (document.treatmentCandidates || []).length,
            selected: (document.treatmentCandidates || []).filter((candidate) => candidate.include === true || candidate.selectedForImport === true).length
          });
          const treatmentResult = await timed(`create-treatments-${documentResults.length + 1}`, () => createImportedTreatments(patientId, document.treatmentCandidates || [], clinicalContext), TIMEOUTS.createClinicalData);
          treatmentsCreated += treatmentResult.created.length;
          treatmentsOmitted += treatmentResult.omitted;
          treatmentsIdempotent += treatmentResult.existing.length;
          treatmentIds.push(...treatmentResult.created.map((item) => item.id).filter(Boolean));
          console.info("patient-transfer:persist-treatments-success", { created: treatmentResult.created.length, existing: treatmentResult.existing.length });
        } catch (error) {
          error.stage ||= "creating_treatments";
          treatmentErrors.push({ code: error?.code || error?.name || "unknown" });
          console.error("patient-transfer:domain-error", { domain: "medications", stage: "creating_treatments", errorCode: error?.code || error?.name || "unknown" });
        }
        try {
          stage = "creating_indications";
          const indicationResult = await timed(`create-indications-${documentResults.length + 1}`, () => createImportedIndications(patientId, document.treatmentPlanCandidates || [], clinicalContext), TIMEOUTS.createClinicalData);
          indicationsCreated += Number(indicationResult.inserted ?? indicationResult.created ?? 0);
          indicationsIdempotent += Number(indicationResult.idempotent || (indicationResult.existing ? indicationResult.items || 0 : 0));
          indicationsOmitted += indicationResult.omitted || 0;
          console.info("patient-transfer:persist-indications-success", { created: Number(indicationResult.inserted ?? indicationResult.created ?? 0), existing: Number(indicationResult.idempotent || 0) });
        } catch (error) {
          error.stage ||= "creating_indications";
          indicationErrors.push({ code: error?.code || error?.name || "unknown" });
          console.error("patient-transfer:domain-error", { domain: "indications", stage: "creating_indications", errorCode: error?.code || error?.name || "unknown" });
        }

        try {
        stage = "creating_note";
        const noteRef = doc(db, "usuarios", patientId, "notasMedicas", noteImportKey);
        const noteSourceDocument = { ...document, sourceNoteDate: document.sourceNoteDate || document.metadata?.documentDate || document.date || "", sourceNoteTime: document.sourceNoteTime || document.metadata?.documentHour || document.time || "" };
        if (!importedNoteHasClinicalContent(noteSourceDocument)) {
          notesOmitted += 1;
          console.info("patient-transfer:notes-empty-segment-skipped", { emptySegmentSkipped: true });
          continue;
        }
        notesIncluded += 1;
        const selectedVitals = (document.vitalSignsCandidates || []).find((candidate) => candidate.include === true);
        const vitalSignsFields = vitalSignsFieldsForDocument(document, group.confirmedFields || {});
        const vitalSignsPayload = selectedVitals ? vitalSignsToNotePayload(selectedVitals, vitalSignsFields) : {};
        console.info("patient-transfer:vitals-payload", {
          selectedCandidates: selectedVitals ? 1 : 0,
          hasClinicalDate: Boolean(vitalSignsFields.fecha),
          hasClinicalTime: Boolean(vitalSignsFields.hora),
          ...vitalSignsPresence(vitalSignsPayload)
        });
        const notePayload = buildImportedNotePayload({
          document: { ...noteSourceDocument, vitalSignsPayload },
          confirmedType: document.confirmedType,
          sourceFile: { name: document.file.name, hash: document.hash },
          importId: operationId,
          user,
          service: group.confirmedFields?.servicio || ""
        });
        onProgress?.({ stage, message: `Creando nota ${documentResults.length + 1}...`, progress: 50 });
        traceTransfer("notes-write-start", { authUid: user.uid, transferOperationId: operationId, patientId, noteId: noteImportKey });
        const note = await timed(`create-note-${documentResults.length + 1}`, () => createTransferredNote(patientId, {
          ...notePayload,
          transferOperationId: operationId,
          sourceFileHash: document.hash,
          sourceDocumentIndex: document.sourceDocumentIndex ?? documentResults.length,
          noteImportKey,
          importacionDocx: {
            ...(notePayload.importacionDocx || {}),
            transferOperationId: operationId,
            sourceDocumentIndex: document.sourceDocumentIndex ?? documentResults.length,
            sourceNoteSegmentId: document.sourceNoteSegmentId || ""
          }
        }, noteImportKey, user), TIMEOUTS.createNote);
        const noteWasExisting = note.existing === true;
        if (noteWasExisting) notesExisting += 1;
        else notesCreated += 1;
        traceTransfer("notes-write-result", { inserted: !noteWasExisting, idempotent: noteWasExisting, observed: note.observed === true });
        console.info("patient-transfer:persist-notes-success", { created: !noteWasExisting, existing: noteWasExisting });

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
        await timed(`create-document-record-${documentResults.length}`, () => addDoc(collection(db, "usuarios", patientId, "documentosImportados"), sanitizeFirestorePayload({
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
        })), TIMEOUTS.firestoreWrite);

        stage = "creating_duplicate_record";
        onProgress?.({ stage, message: "Registrando control de duplicados...", progress: 80 });
        const duplicateRef = doc(db, "usuarios", user.uid, DOCX_IMPORT_CONFIG.duplicateUserSubcollection, document.hash);
        traceTransfer(stage, { operation: "setDoc", path: `usuarios/${user.uid}/${DOCX_IMPORT_CONFIG.duplicateUserSubcollection}/${document.hash}`, authUid: user.uid, patientId, noteId: record.noteId });
        await timed(`create-duplicate-record-${documentResults.length}`, () => setDoc(duplicateRef, {
          ownerUid: user.uid,
          usuarioUid: user.uid,
          pacienteId: patientId,
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
        } else {
          const imported = note.data?.importacionDocx || {};
          documentResults.push({
            fileId: document.id,
            fileName: document.file.name,
            hash: document.hash,
            textHash: document.textHash,
            storagePath: imported.sourceDocumentPath || "",
            storageUrl: imported.sourceDocumentUrl || "",
            noteId: note.notaId || note.id || noteImportKey,
            duplicateStatus: "note_existing"
          });
          sourceSaved = sourceSaved || Boolean(imported.sourceDocumentPath);
        }
        } catch (error) {
          noteErrors.push({ code: error?.code || error?.name || "unknown" });
          console.error("patient-transfer:domain-error", { domain: "notes", stage: "creating_note", errorCode: error?.code || error?.name || "unknown" });
          console.warn("patient-transfer:notes-write-not-observed", { observed: false });
        }
        if (domainOutcome.errors.length) {
          const firstDomainError = domainOutcome.errors[0].error;
          stage = firstDomainError.stage || stage;
          throw firstDomainError;
        }
      }

      let notesAfterTotal = 0;
      try {
        const notesAfter = await timed("notes-history-after", () => getDocs(collection(db, "usuarios", patientId, "notasMedicas")), TIMEOUTS.query);
        notesAfterTotal = notesAfter.size;
      } catch (error) {
        noteErrors.push({ code: error?.code || error?.name || "unknown" });
        console.warn("patient-transfer:notes-history-after-unavailable", { errorCode: error?.code || error?.name || "unknown" });
      }
      console.info("patient-transfer:notes-history-after-real", {
        total: notesAfterTotal,
        inserted: notesCreated,
        idempotent: notesExisting
      });
      console.info("patient-transfer:notes-write-result", {
        inserted: notesCreated,
        idempotent: notesExisting,
        observed: noteErrors.length === 0
      });

      const notesObserved = notesCreated + notesExisting;
      if (notesIncluded > 0 && (noteErrors.length > 0 || notesObserved !== notesIncluded)) {
        const error = new Error("No se pudieron guardar todas las notas externas en el historial del paciente.");
        error.code = "notes-persistence-incomplete";
        error.stage = "creating_note";
        throw error;
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
        detalles: { groupId: group.id, transferOperationId: operationId, patientCreated, documents: documentResults.length, notesCreated, notesExisting, notesOmitted, notesErrorCount: noteErrors.length, diagnosesCreated, treatmentsCreated, indicationsCreated }
      }), TIMEOUTS.audit);
      auditRegistered = true;

      stage = "updating_transfer_record";
      onProgress?.({ stage, message: "Finalizando traspaso...", progress: 92 });
      traceTransfer(stage, { operation: "setDoc", path: transferRef.path, authUid: user.uid, patientId, notesCreated });
      await timed("update-transfer-record", () => setDoc(transferRef, {
        status: "completed",
        lastCompletedStage: "completed",
        completedAt: serverTimestamp(),
        completedAtIso: new Date().toISOString(),
        documentCount: documentResults.length,
        noteIds: documentResults.map((doc) => doc.noteId).filter(Boolean),
        noteCount: notesCreated,
        noteIdempotentCount: notesExisting,
        noteOmittedCount: notesOmitted,
        noteErrorCount: noteErrors.length,
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosisIds,
        treatmentIds,
        vitalSignCount: vitalSignsCreated,
        anthropometryCount: anthropometryCreated,
        diagnosisCount: diagnosesCreated,
        diagnosisDetectedCount: diagnosesDetected,
        diagnosisIncludedCount: diagnosesIncluded,
        diagnosisIdempotentCount: diagnosesIdempotent,
        diagnosisOmittedCount: diagnosesOmitted,
        diagnosisErrorCount: diagnosisErrors.length,
        diagnosisAttempted: diagnosesAttempted,
        treatmentCount: treatmentsCreated,
        treatmentIdempotentCount: treatmentsIdempotent,
        treatmentErrorCount: treatmentErrors.length,
        indicationCount: indicationsCreated,
        indicationIdempotentCount: indicationsIdempotent,
        indicationErrorCount: indicationErrors.length,
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

      traceTransfer("operation-completed", { authUid: user.uid, transferOperationId: operationId, patientId, notesCreated });
      results.push({
        groupId: group.id,
        status: "completed",
        patientId,
        patientName: group.confirmedFields?.nombre || "",
        patientCreated,
        patientReused: !patientCreated,
        transferOperationId: operationId,
        notesDetected,
        notesIncluded,
        notesCreated,
        notesExisting,
        notesOmitted,
        notesError: noteErrors[0]?.code || "",
        vitalSignsCreated,
        anthropometryCreated,
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosesCreated,
        diagnosesOmitted,
        diagnosesDetected,
        diagnosesIncluded,
        diagnosesIdempotent,
        diagnosesAttempted,
        diagnosesError: diagnosisErrors[0]?.code || "",
        diagnosisIds,
        treatmentsCreated,
        treatmentsOmitted,
        treatmentsIdempotent,
        treatmentsError: treatmentErrors[0]?.code || "",
        treatmentIds,
        indicationsCreated,
        indicationsOmitted,
        indicationsIdempotent,
        indicationsError: indicationErrors[0]?.code || "",
        sourceSaved,
        auditRegistered,
        duplicatesAvoided: 0,
        documents: documentResults
      });
      console.info("[patient-transfer] persistence:completed", JSON.stringify({ operationId, patientIdPresent: Boolean(patientId), notesCreated }));
    } catch (error) {
      console.info("[patient-transfer] persistence:failed", JSON.stringify({
        operationId,
        stage: error?.stage || stage,
        patientIdPresent: Boolean(patientId),
        notesCreated
      }));
      traceTransfer(stage || "failed", {
        operation: "firebase-write",
        authUid: user.uid,
        role: user.rol || "",
        patientId,
        errorCode: error?.code || error?.name || "unknown",
        message: error?.message || String(error),
        partialState: { patientCreated, notesCreated, notesExisting, notesOmitted }
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
        diagnosisDetectedCount: diagnosesDetected,
        diagnosisIncludedCount: diagnosesIncluded,
        diagnosisIdempotentCount: diagnosesIdempotent,
        diagnosisOmittedCount: diagnosesOmitted,
        diagnosisErrorCount: diagnosisErrors.length,
        diagnosisAttempted: diagnosesAttempted,
        treatmentCount: treatmentsCreated,
        treatmentIdempotentCount: treatmentsIdempotent,
        treatmentErrorCount: treatmentErrors.length,
        indicationCount: indicationsCreated,
        indicationIdempotentCount: indicationsIdempotent,
        indicationErrorCount: indicationErrors.length,
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
        notesCreated,
        notesExisting,
        vitalSignsCreated,
        anthropometryCreated,
        vitalSignRecordIds,
        anthropometryRecordIds,
        diagnosesCreated,
        diagnosesOmitted,
        diagnosesDetected,
        diagnosesIncluded,
        diagnosesIdempotent,
        diagnosesAttempted,
        diagnosesError: diagnosisErrors[0]?.code || "",
        diagnosisIds,
        treatmentsCreated,
        treatmentsOmitted,
        treatmentsIdempotent,
        treatmentsError: treatmentErrors[0]?.code || "",
        treatmentIds,
        indicationsCreated,
        indicationsOmitted,
        indicationsIdempotent,
        indicationsError: indicationErrors[0]?.code || "",
        sourceSaved,
        auditRegistered
      });
    }
  }
  return results;
}
