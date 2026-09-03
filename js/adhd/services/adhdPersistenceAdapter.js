import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "../../firebase.js";
import {
  eliminarBorradorClinicoLocal,
  guardarBorradorClinicoLocal,
  listarBorradoresClinicosLocalesPorPrefijo,
  obtenerBorradorClinicoLocal
} from "../../services/clinicalLocalStore.js";
import {
  ADHD_PERSISTENCE_SCHEMA_VERSION,
  ADHD_PROTOCOL_ID,
  ADHD_PROTOCOL_VERSION
} from "../config/adhdProtocol.js";

export const ADHD_PROGRAM_COLLECTION = "rehabilitacionProgramas";
export const ADHD_RESULT_COLLECTION = "rehabilitacionResultados";
export const ADHD_TELEMETRY_COLLECTION = "telemetryBlocks";
export const ADHD_TELEMETRY_BLOCK_SIZE = 100;
export const ADHD_MAX_TELEMETRY_BLOCKS = 50;
export const ADHD_MAX_TELEMETRY_RECORDS = ADHD_TELEMETRY_BLOCK_SIZE * ADHD_MAX_TELEMETRY_BLOCKS;
export const ADHD_MAX_TELEMETRY_BLOCK_BYTES = 700 * 1024;
export const ADHD_MAX_TELEMETRY_RECORD_BYTES = 64 * 1024;

const ENTITY_COLLECTIONS = Object.freeze({
  evaluation: "evaluaciones",
  profile: "perfiles",
  plan: "planes",
  goal: "metas",
  session: "sesiones",
  challenge: "retos",
  audit: "auditoria"
});

const SUMMARY_OMISSIONS = new Set([
  "trialHistory",
  "trials",
  "rawTrials",
  "practiceTrials",
  "trialRecords",
  "trialData",
  "trialDetails",
  "trialResults",
  "practiceRecords",
  "mainRecords",
  "rawRecords",
  "puzzles",
  "practicePuzzles",
  "puzzleHistory",
  "puzzleRecords",
  "puzzleData",
  "puzzleDetails",
  "puzzleResults",
  "sequence",
  "sequences",
  "stimulusSequence",
  "responseSequence",
  "generatedSequence",
  "sequenceData",
  "sequenceHistory",
  "stimuli",
  "stimulusHistory",
  "events",
  "technicalEvents",
  "practiceEvents",
  "researchEvents",
  "eventHistory",
  "eventRecords",
  "eventLog",
  "interruptions",
  "interruptionEvents",
  "interruptionHistory",
  "breaks",
  "detailedResponses",
  "rawResponses",
  "responseHistory",
  "telemetry",
  "rawTelemetry",
  "telemetryBlocks",
  "telemetryRecords",
  "telemetryData",
  "browserInfo",
  "patientId",
  "userId",
  "uidProfesional",
  "patientName",
  "nombre",
  "email",
  "correo"
]);

const NORMALIZED_SUMMARY_OMISSIONS = new Set([...SUMMARY_OMISSIONS].map(normalizeSummaryKey));
const SUMMARY_DETAIL_KEY_PATTERNS = Object.freeze([
  /^(?:raw|practice|main|scored|unscored|detailed)?trials?(?:history|records?|data|details?|results?|logs?|list|items|stream)?$/u,
  /^(?:raw|practice|main|scored|unscored|detailed)?puzzles?(?:history|records?|data|details?|results?|logs?|list|items|stream)?$/u,
  /^(?:raw|practice|technical|research|audit|focus|visibility)?events?(?:history|records?|data|details?|logs?|list|items|stream|timeline)?$/u,
  /^(?:raw|practice|generated|stimulus|response|trial)?sequences?(?:history|records?|data|details?|logs?|list|items|stream)?$/u,
  /^(?:raw|detailed)?telemetry(?:blocks?|records?|data|details?|events?|trials?|stream)?$/u,
  /^(?:raw|practice|technical)?interruptions?(?:events?|history|records?|data|details?|logs?|list|items|stream)?$/u,
  /^(?:raw|detailed|trial)responses?(?:history|records?|data|details?|logs?|list|items|stream)?$/u
]);

const TELEMETRY_PII_KEY = /(?:patient|paciente|usuario|user|uid|email|correo|nombre|name|curp|expediente|diagnost|medic|nota|note|transcript|rawresponse|speech|browserinfo|deviceid|ipaddress)/iu;
const TELEMETRY_ALLOWED_KEYS = new Set([
  "trial", "trialid", "trialindex", "trialnumber", "attempt", "attemptindex",
  "block", "blockindex", "blocknumber", "phase", "condition", "modality", "difficulty", "level", "n",
  "timestamp", "at", "startedat", "endedat", "presentedat", "responseat", "durationms",
  "reactiontime", "reactiontimems", "responselatencyms", "rt",
  "stimulus", "stimulustype", "stimulusindex", "position", "letter", "word", "inkcolor",
  "leftword", "rightword", "correctanswer", "istarget", "iscongruent", "match",
  "responded", "respondio", "responsetype", "resultado", "outcome", "classification",
  "iscorrect", "correct", "correcta", "tipo", "confidence", "recognitionconfidence",
  "visualnoiselevel", "visualnoiseseed", "seed", "randomseed", "sequenceindex",
  "eventtype", "type", "reason", "visibilitystate", "interrupted", "technicalfailure"
]);

function assertDocumentId(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 160 || text === "." || text === ".." || text.includes("/")) {
    throw new TypeError(`${label} no es un identificador Firestore válido.`);
  }
  return text;
}

function fnv1a(value) {
  let hash = 0xcbf29ce484222325n;
  for (const character of String(value)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, "0");
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 36);
}

export function crearIdEstableAdhd(prefix, ...parts) {
  const safePrefix = slug(prefix) || "adhd";
  const stableParts = parts.flat().filter((part) => part !== null && part !== undefined && String(part).trim());
  if (!stableParts.length) {
    const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${safePrefix}_${slug(randomPart)}`.slice(0, 160);
  }
  const canonical = stableParts.map((part) => String(part).trim()).join("|");
  const hint = slug(stableParts.at(-1));
  return `${safePrefix}_${hint ? `${hint}_` : ""}${fnv1a(canonical)}`.slice(0, 160);
}

function normalizeSummaryKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function isSummaryOmittedKey(value, detailValue) {
  const normalized = normalizeSummaryKey(value);
  return NORMALIZED_SUMMARY_OMISSIONS.has(normalized)
    || SUMMARY_DETAIL_KEY_PATTERNS.some((pattern) => pattern.test(normalized))
    || ((Array.isArray(detailValue) || (detailValue && typeof detailValue === "object"))
      && /(?:trials?|puzzles?|events?|sequences?|telemetry|interruptions?|responses?|records|stimuli|attempts?|samples?|logs?|history)$/u.test(normalized));
}

function cleanValue(value, { telemetry = false, summary = false, depth = 0 } = {}) {
  if (depth > 10 || value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, telemetry ? 300 : 5000);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const values = telemetry && depth > 0 ? value.slice(0, 100) : value;
    return values
      .map((item) => cleanValue(item, { telemetry, summary, depth: depth + 1 }))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (telemetry && (TELEMETRY_PII_KEY.test(normalizedKey) || !TELEMETRY_ALLOWED_KEYS.has(normalizedKey))) continue;
      if (summary && isSummaryOmittedKey(normalizedKey, item)) continue;
      const cleaned = cleanValue(item, { telemetry, summary, depth: depth + 1 });
      if (cleaned !== undefined) output[key] = cleaned;
    }
    return output;
  }
  return undefined;
}

export function sanitizarTelemetriaAdhd(value) {
  return cleanValue(value, { telemetry: true });
}

export function sanitizarResumenAdhd(value) {
  return cleanValue(value, { summary: true });
}

function programRef(patientId, programId) {
  return doc(
    db,
    "usuarios",
    assertDocumentId(patientId, "patientId"),
    ADHD_PROGRAM_COLLECTION,
    assertDocumentId(programId, "programId")
  );
}

function entityRef(patientId, programId, entityType, entityId) {
  const collectionName = ENTITY_COLLECTIONS[entityType];
  if (!collectionName) throw new TypeError(`Tipo de entidad TDAH no compatible: ${entityType}`);
  return doc(programRef(patientId, programId), collectionName, assertDocumentId(entityId, `${entityType}Id`));
}

function resultRef(patientId, resultId) {
  return doc(
    db,
    "usuarios",
    assertDocumentId(patientId, "patientId"),
    ADHD_RESULT_COLLECTION,
    assertDocumentId(resultId, "resultId")
  );
}

function draftKey(patientId, programId, kind, id) {
  return ["adhd", ADHD_PERSISTENCE_SCHEMA_VERSION, patientId, programId, kind, id].map(encodeURIComponent).join(":");
}

function draftPrefix(patientId, programId) {
  return ["adhd", ADHD_PERSISTENCE_SCHEMA_VERSION, patientId, programId, ""].map(encodeURIComponent).join(":");
}

function parseDraftKey(key) {
  const parts = String(key || "").split(":").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch (_) {
      return part;
    }
  });
  if (parts.length < 6 || parts[0] !== "adhd") return null;
  return {
    schemaVersion: parts[1],
    patientId: parts[2],
    programId: parts[3],
    kind: parts[4],
    id: parts.slice(5).join(":")
  };
}

function normalizedErrorCode(error) {
  return String(error?.code || error?.name || "unknown").trim().toLowerCase();
}

const AUTHORIZATION_ERROR_CODES = new Set([
  "permission-denied",
  "unauthenticated",
  "unauthorized",
  "forbidden",
  "not-authorized",
  "authorization-denied",
  "access-denied",
  "auth/unauthenticated",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/invalid-user-token",
  "auth/user-token-expired",
  "auth/requires-recent-login"
]);

export function esErrorAutorizacionAdhd(error) {
  const rawCode = normalizedErrorCode(error).replace(/_/gu, "-");
  const code = rawCode.replace(/^(?:firestore|functions)\//u, "");
  const status = String(error?.status || "").trim().toLowerCase().replace(/_/gu, "-");
  return AUTHORIZATION_ERROR_CODES.has(code)
    || AUTHORIZATION_ERROR_CODES.has(rawCode)
    || /\/(?:permission-denied|unauthenticated|unauthorized|forbidden)$/u.test(rawCode)
    || AUTHORIZATION_ERROR_CODES.has(status)
    || Number(error?.status) === 401
    || Number(error?.status) === 403;
}

const RETRYABLE_ERROR_CODES = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "network-request-failed",
  "resource-exhausted",
  "unknown",
  "unavailable"
]);

export const ADHD_REMOTE_OPERATION_TIMEOUT_MS = 5_000;

export async function waitForAdhdRemoteOperation(operation, timeoutMs = ADHD_REMOTE_OPERATION_TIMEOUT_MS) {
  const safeTimeout = Math.max(250, Number(timeoutMs) || ADHD_REMOTE_OPERATION_TIMEOUT_MS);
  const remoteOperation = Promise.resolve().then(operation);
  let timeoutId = null;
  const deadline = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      const error = new Error("La operación remota no respondió dentro del tiempo esperado.");
      error.name = "AdhdRemoteOperationTimeoutError";
      error.code = "deadline-exceeded";
      reject(error);
    }, safeTimeout);
  });
  try {
    return await Promise.race([remoteOperation, deadline]);
  } finally {
    globalThis.clearTimeout(timeoutId);
    remoteOperation.catch(() => {});
  }
}

function esErrorTransitorioAdhd(error) {
  const code = normalizedErrorCode(error).replace(/^(?:firestore|functions|auth)\//u, "");
  return RETRYABLE_ERROR_CODES.has(code);
}

function persistenceMetadata() {
  return {
    persistenceSchemaVersion: ADHD_PERSISTENCE_SCHEMA_VERSION,
    protocolId: ADHD_PROTOCOL_ID,
    protocolVersion: ADHD_PROTOCOL_VERSION
  };
}

function pendingResult(id, error) {
  return {
    id,
    savedRemotely: false,
    pendingSync: true,
    errorCode: String(error?.code || error?.name || "unknown")
  };
}

function loadErrorCode(error) {
  return String(error?.code || error?.name || "unknown");
}

function timestampMillis(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value?.toMillis === "function") return Number(value.toMillis()) || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    return (Number(value.seconds) * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultTimestamp(result) {
  return Math.max(
    timestampMillis(result?.updatedAt),
    timestampMillis(result?.updatedAtIso),
    timestampMillis(result?.completedAtIso),
    timestampMillis(result?.occurredAtIso),
    timestampMillis(result?.createdAt),
    timestampMillis(result?.createdAtIso),
    timestampMillis(result?.archivedAtIso),
    timestampMillis(result?.localUpdatedAt),
    timestampMillis(result?.date)
  );
}

function compareRecordChronology(left, right) {
  const timestampDifference = resultTimestamp(left) - resultTimestamp(right);
  if (timestampDifference) return timestampDifference;
  const leftId = String(left?.id || left?.resultId || left?.idResultado || "");
  const rightId = String(right?.id || right?.resultId || right?.idResultado || "");
  return leftId.localeCompare(rightId);
}

function isCanonicalAdhdResultForProgram(record, programId) {
  if (!record || typeof record !== "object") return false;
  const recordId = String(record.id || record.resultId || record.idResultado || "");
  return record.protocolId === ADHD_PROTOCOL_ID
    && typeof record.protocolVersion === "string"
    && Boolean(record.protocolVersion)
    && typeof record.persistenceSchemaVersion === "string"
    && Boolean(record.persistenceSchemaVersion)
    && record.programId === programId
    && Boolean(recordId)
    && record.resultId === recordId
    && record.idResultado === recordId;
}

function resultsByTask(records) {
  return records.reduce((byTask, result) => {
    const taskId = String(result.taskId || result.activityId || "").trim();
    if (!taskId) return byTask;
    if (!byTask[taskId] || resultTimestamp(result) >= resultTimestamp(byTask[taskId])) byTask[taskId] = result;
    return byTask;
  }, {});
}

function latestRecord(records) {
  return records.reduce((latest, record) => (
    !latest || resultTimestamp(record) >= resultTimestamp(latest) ? record : latest
  ), null);
}

function localDraftRecord(registro) {
  const parsed = parseDraftKey(registro?.key);
  const envelope = registro?.payload;
  if (!parsed || !envelope || typeof envelope !== "object") return null;
  const id = String(envelope.id || parsed.id || "");
  const kind = String(envelope.kind || parsed.kind || "");
  if (!id || !kind) return null;
  return {
    key: registro.key,
    id,
    kind,
    patientId: String(envelope.patientId || parsed.patientId || ""),
    programId: String(envelope.programId || parsed.programId || ""),
    data: envelope.payload,
    envelope,
    localUpdatedAt: Number(registro.updatedAt) || timestampMillis(envelope.pendingSince),
    intentTimestamp: Math.max(
      Number(registro.updatedAt) || 0,
      timestampMillis(envelope.pendingSince),
      resultTimestamp(envelope.payload),
      resultTimestamp(envelope.payload?.summary)
    )
  };
}

async function loadLocalDraftRecords(patientId, programId) {
  const registros = await listarBorradoresClinicosLocalesPorPrefijo(draftPrefix(patientId, programId));
  return (Array.isArray(registros) ? registros : [])
    .map(localDraftRecord)
    .filter((record) => record && record.patientId === patientId && record.programId === programId);
}

function materializeLocalRecord(record) {
  const source = record.kind === "result" ? record.data?.summary : record.data;
  if (!source || typeof source !== "object") return null;
  return {
    ...source,
    id: source.id || source.resultId || source.idResultado || record.id,
    pendingSync: true,
    localUpdatedAt: record.localUpdatedAt
  };
}

function mergeRecordCollections(remoteRecords = [], localRecords = []) {
  const merged = new Map(remoteRecords.map((record) => [String(record.id || record.resultId || record.auditId), record]));
  for (const localRecord of localRecords) {
    const local = materializeLocalRecord(localRecord);
    if (!local) continue;
    const recordId = String(local.id || localRecord.id);
    const remote = merged.get(recordId);
    const remoteTimestamp = resultTimestamp(remote);
    if (!remote || !remoteTimestamp || localRecord.intentTimestamp >= remoteTimestamp) {
      merged.set(recordId, remote ? { ...remote, ...local } : local);
    }
  }
  return [...merged.values()];
}

const pendingSyncScopes = new Map();
const pendingSyncInFlight = new Map();
let onlineSyncInstalled = false;

function syncScopeKey(patientId, programId) {
  return `${encodeURIComponent(patientId)}:${encodeURIComponent(programId)}`;
}

function registerPendingSyncScope(patientId, programId) {
  const scope = {
    patientId: assertDocumentId(patientId, "patientId"),
    programId: assertDocumentId(programId, "programId")
  };
  pendingSyncScopes.set(syncScopeKey(scope.patientId, scope.programId), scope);
  if (onlineSyncInstalled || typeof globalThis.addEventListener !== "function") return;
  onlineSyncInstalled = true;
  globalThis.addEventListener("online", () => {
    for (const pendingScope of pendingSyncScopes.values()) {
      syncPendingAdhdWrites(pendingScope).catch(() => {
        // La API explícita propaga el error; el evento global no puede dejar
        // una promesa rechazada sin consumidor.
      });
    }
  });
}

async function persistWithDraft({ key, payload, id, patientId, programId, kind, operation, remoteTimeoutMs }) {
  const pendingEnvelope = {
    ...persistenceMetadata(),
    id,
    patientId,
    programId,
    kind,
    payload: cleanValue(payload),
    pendingSince: new Date().toISOString(),
    syncIntent: "remote-write",
    retryEligible: true,
    attemptCount: 0,
    lastErrorCode: "remote-write-pending"
  };
  const initialLocalRecord = await guardarBorradorClinicoLocal(key, pendingEnvelope);
  try {
    await waitForAdhdRemoteOperation(operation, remoteTimeoutMs);
    if (initialLocalRecord) await eliminarBorradorClinicoLocal(key);
    return { id, savedRemotely: true, pendingSync: false };
  } catch (error) {
    if (esErrorAutorizacionAdhd(error)) {
      await eliminarBorradorClinicoLocal(key).catch(() => {});
      pendingSyncScopes.delete(syncScopeKey(String(patientId || ""), String(programId || "")));
      throw error;
    }
    const retryEligible = esErrorTransitorioAdhd(error);
    if (!retryEligible) {
      await eliminarBorradorClinicoLocal(key).catch(() => {});
      throw error;
    }
    const localRecord = await guardarBorradorClinicoLocal(key, {
      ...pendingEnvelope,
      retryEligible,
      lastErrorCode: loadErrorCode(error)
    });
    requireLocalDraft(localRecord, error);
    if (retryEligible) registerPendingSyncScope(patientId, programId);
    return pendingResult(id, error);
  }
}

export async function createProgram({ patientId, programId, data = {}, remoteTimeoutMs }) {
  const id = assertDocumentId(
    programId || data.programId || data.id || crearIdEstableAdhd("program", patientId, data.createdAtIso || Date.now()),
    "programId"
  );
  const payload = {
    ...cleanValue(data),
    ...persistenceMetadata(),
    programId: id,
    status: data.status || "draft",
    createdAtIso: data.createdAtIso || new Date().toISOString()
  };
  const key = draftKey(patientId, id, "program", id);
  return persistWithDraft({
    key,
    payload,
    id,
    patientId,
    programId: id,
    kind: "program",
    remoteTimeoutMs,
    operation: () => setDoc(programRef(patientId, id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true })
  });
}

export async function loadProgram({ patientId, programId, remoteTimeoutMs }) {
  const id = assertDocumentId(programId, "programId");
  const key = draftKey(patientId, id, "program", id);
  let remoteErrorCode = null;
  let remote = null;
  try {
    const snapshot = await waitForAdhdRemoteOperation(() => getDoc(programRef(patientId, id)), remoteTimeoutMs);
    if (snapshot.exists()) remote = snapshot.data();
  } catch (error) {
    if (esErrorAutorizacionAdhd(error)) throw error;
    remoteErrorCode = loadErrorCode(error);
    // IndexedDB se consulta debajo como respaldo explícito de trabajo sin conexión.
  }
  const draft = await obtenerBorradorClinicoLocal(key);
  if (draft) {
    const localTimestamp = Math.max(timestampMillis(draft.pendingSince), resultTimestamp(draft.payload));
    const useLocal = !remote || !resultTimestamp(remote) || localTimestamp >= resultTimestamp(remote);
    if (!useLocal) return { id, source: "firestore", pendingSync: true, data: remote };
    return {
      id,
      source: remote ? "firestore+indexeddb" : "indexeddb",
      pendingSync: true,
      loadErrorCode: remoteErrorCode,
      data: remote ? { ...remote, ...draft.payload, pendingSync: true } : draft.payload
    };
  }
  if (remote) return { id, source: "firestore", pendingSync: false, data: remote };
  return remoteErrorCode
    ? { id, source: "unavailable", pendingSync: false, loadErrorCode: remoteErrorCode, data: null }
    : null;
}

export async function loadAdhdProgramBundle({ patientId, programId, remoteTimeoutMs }) {
  const id = assertDocumentId(programId, "programId");
  const rootReference = programRef(patientId, id);
  const safePatientId = assertDocumentId(patientId, "patientId");
  const entityEntries = Object.entries(ENTITY_COLLECTIONS);
  const remoteCollections = Object.fromEntries(entityEntries.map(([entityType]) => [entityType, []]));
  let remoteProgram = null;
  let remoteResults = [];
  let remoteErrorCode = null;
  try {
    const [programSnapshot, resultSnapshot, ...collectionSnapshots] = await waitForAdhdRemoteOperation(() => Promise.all([
      getDoc(rootReference),
      getDocs(query(
        collection(db, "usuarios", safePatientId, ADHD_RESULT_COLLECTION),
        where("programId", "==", id)
      )),
      ...entityEntries.map(([, collectionName]) => getDocs(collection(rootReference, collectionName)))
    ]), remoteTimeoutMs);
    if (programSnapshot.exists()) remoteProgram = { id, ...programSnapshot.data() };
    remoteResults = resultSnapshot.docs
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
      .filter((record) => isCanonicalAdhdResultForProgram(record, id));
    entityEntries.forEach(([entityType], index) => {
      remoteCollections[entityType] = collectionSnapshots[index].docs
        .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    });
  } catch (error) {
    if (esErrorAutorizacionAdhd(error)) throw error;
    remoteErrorCode = loadErrorCode(error);
    // IndexedDB se fusiona debajo para recuperar todas las entidades del programa.
  }

  const localDrafts = await loadLocalDraftRecords(safePatientId, id);
  const remotePendingDrafts = localDrafts.filter((record) => (
    record.envelope.syncIntent === "remote-write" && record.envelope.retryEligible !== false
  ));
  const byKind = (kind) => localDrafts.filter((record) => record.kind === kind);
  const localProgramDraft = byKind("program").reduce((latest, record) => (
    !latest || record.intentTimestamp >= latest.intentTimestamp ? record : latest
  ), null);
  const localProgram = localProgramDraft ? materializeLocalRecord(localProgramDraft) : null;
  const useLocalProgram = localProgram && (
    !remoteProgram
    || !resultTimestamp(remoteProgram)
    || localProgramDraft.intentTimestamp >= resultTimestamp(remoteProgram)
  );
  const program = useLocalProgram
    ? (remoteProgram ? { ...remoteProgram, ...localProgram } : localProgram)
    : remoteProgram;
  const evaluations = mergeRecordCollections(remoteCollections.evaluation, byKind("evaluation"));
  const profiles = mergeRecordCollections(remoteCollections.profile, byKind("profile"));
  const plans = mergeRecordCollections(remoteCollections.plan, byKind("plan"));
  const goals = mergeRecordCollections(remoteCollections.goal, byKind("goal"));
  const sessions = mergeRecordCollections(remoteCollections.session, byKind("session"));
  const challenges = mergeRecordCollections(remoteCollections.challenge, byKind("challenge"));
  const resultRecords = mergeRecordCollections(remoteResults, byKind("result"))
    .filter((record) => isCanonicalAdhdResultForProgram(record, id))
    .sort(compareRecordChronology);
  const audit = mergeRecordCollections(remoteCollections.audit, byKind("audit"));
  const hasRemote = Boolean(remoteProgram)
    || remoteResults.length > 0
    || Object.values(remoteCollections).some((records) => records.length > 0);
  if (!program && !localDrafts.length && !hasRemote && !remoteErrorCode) return null;
  if (remotePendingDrafts.length) {
    registerPendingSyncScope(safePatientId, id);
  }
  return {
    id,
    source: hasRemote && localDrafts.length ? "firestore+indexeddb" : hasRemote ? "firestore" : localDrafts.length ? "indexeddb" : "unavailable",
    pendingSync: remotePendingDrafts.length > 0,
    pendingRemoteWriteCount: remotePendingDrafts.length,
    localDraftCount: localDrafts.length,
    loadErrorCode: remoteErrorCode,
    program: program || (localDrafts.length ? { id, programId: id, pendingSync: true } : null),
    evaluations,
    profiles,
    profile: latestRecord(profiles),
    plans,
    plan: latestRecord(plans),
    goals,
    sessions,
    challenges,
    taskResults: resultsByTask(resultRecords),
    resultRecords,
    audit
  };
}

export async function saveProgram({ patientId, programId, data = {}, remoteTimeoutMs }) {
  const id = assertDocumentId(programId || data.programId || data.id, "programId");
  const payload = { ...cleanValue(data), ...persistenceMetadata(), programId: id };
  const key = draftKey(patientId, id, "program", id);
  return persistWithDraft({
    key,
    payload,
    id,
    patientId,
    programId: id,
    kind: "program",
    remoteTimeoutMs,
    operation: () => setDoc(programRef(patientId, id), { ...payload, updatedAt: serverTimestamp() }, { merge: true })
  });
}

async function saveEntity(entityType, { patientId, programId, id: requestedId, data = {}, remoteTimeoutMs }) {
  const seed = requestedId || data.id || data[`${entityType}Id`] || data.createdAtIso || Date.now();
  const id = assertDocumentId(requestedId || crearIdEstableAdhd(entityType, programId, seed), `${entityType}Id`);
  const payload = {
    ...cleanValue(data),
    ...persistenceMetadata(),
    id,
    programId: assertDocumentId(programId, "programId")
  };
  const key = draftKey(patientId, programId, entityType, id);
  return persistWithDraft({
    key,
    payload,
    id,
    patientId,
    programId,
    kind: entityType,
    remoteTimeoutMs,
    operation: () => setDoc(entityRef(patientId, programId, entityType, id), {
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true })
  });
}

export const saveEvaluation = (options) => saveEntity("evaluation", options);
export const saveProfile = (options) => saveEntity("profile", options);
export const savePlan = (options) => saveEntity("plan", options);
export const saveGoal = (options) => saveEntity("goal", options);
export const saveSession = (options) => saveEntity("session", options);
export const saveChallenge = (options) => saveEntity("challenge", options);

export async function saveProgramAudit({ patientId, programId, auditId, data = {} }) {
  const id = assertDocumentId(
    auditId || crearIdEstableAdhd("audit", programId, data.eventType || "event", data.occurredAtIso || Date.now()),
    "auditId"
  );
  const payload = {
    ...cleanValue(data),
    ...persistenceMetadata(),
    auditId: id,
    occurredAtIso: data.occurredAtIso || new Date().toISOString(),
    programId: assertDocumentId(programId, "programId")
  };
  const key = draftKey(patientId, programId, "audit", id);
  return persistWithDraft({
    key,
    payload,
    id,
    patientId,
    programId,
    kind: "audit",
    operation: async () => {
      const reference = entityRef(patientId, programId, "audit", id);
      if ((await getDoc(reference)).exists()) return;
      await setDoc(reference, { ...payload, createdAt: serverTimestamp() });
    }
  });
}

function summaryFromResult(result, references, resultId, programId) {
  const source = sanitizarResumenAdhd(result || {});
  const summary = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isSummaryOmittedKey(key, value)) summary[key] = value;
  }
  const metrics = sanitizarResumenAdhd(result?.metrics || result?.results || {});
  const taskId = String(result?.taskId || result?.activityId || result?.module || "unknown");
  return {
    ...summary,
    ...persistenceMetadata(),
    idResultado: resultId,
    resultId,
    programId,
    taskId,
    activityId: result?.activityId || taskId,
    metricsVersion: result?.metricsVersion || result?.metricsEngineVersion || null,
    metrics,
    results: metrics,
    status: result?.status || "completed",
    valid: result?.valid !== false && result?.quality?.valid !== false,
    quality: sanitizarResumenAdhd(result?.quality || {}),
    references: sanitizarResumenAdhd(references),
    completedAtIso: result?.completedAtIso || result?.completedAt || result?.date || new Date().toISOString()
  };
}

function telemetryChannels(result, explicitTelemetry) {
  const source = explicitTelemetry ?? result?.telemetry ?? {
    trials: result?.trialHistory || result?.trials || [],
    sequence: result?.sequence || [],
    events: result?.events || result?.researchEvents || []
  };
  if (Array.isArray(source)) return { trials: source };
  if (!source || typeof source !== "object") return {};
  return Object.fromEntries(Object.entries(source).filter(([, records]) => Array.isArray(records) && records.length));
}

export function construirBloquesTelemetriaAdhd(resultId, telemetry, { blockSize = ADHD_TELEMETRY_BLOCK_SIZE } = {}) {
  const safeResultId = assertDocumentId(resultId, "resultId");
  const size = Math.max(10, Math.min(ADHD_TELEMETRY_BLOCK_SIZE, Number(blockSize) || ADHD_TELEMETRY_BLOCK_SIZE));
  const blocks = [];
  let totalRecords = 0;
  for (const [channel, rawRecords] of Object.entries(telemetry || {})) {
    const records = sanitizarTelemetriaAdhd(rawRecords);
    if (!Array.isArray(records)) continue;
    totalRecords += records.length;
    if (totalRecords > ADHD_MAX_TELEMETRY_RECORDS) {
      throw new RangeError(`La telemetría excede ${ADHD_MAX_TELEMETRY_RECORDS} registros por resultado.`);
    }
    let pendingRecords = [];
    let pendingBytes = 0;
    let blockIndex = 0;
    const flush = () => {
      if (!pendingRecords.length) return;
      blocks.push({
        blockId: crearIdEstableAdhd("tb", safeResultId, channel, blockIndex),
        channel: slug(channel) || "events",
        blockIndex,
        records: pendingRecords
      });
      if (blocks.length > ADHD_MAX_TELEMETRY_BLOCKS) {
        throw new RangeError(`La telemetría excede ${ADHD_MAX_TELEMETRY_BLOCKS} bloques por resultado.`);
      }
      pendingRecords = [];
      pendingBytes = 0;
      blockIndex += 1;
    };
    for (const record of records) {
      // Multiplicar caracteres por tres es una cota conservadora para UTF-8 y
      // mantiene cada documento holgadamente por debajo del límite Firestore.
      const estimatedBytes = JSON.stringify(record).length * 3;
      if (estimatedBytes > ADHD_MAX_TELEMETRY_RECORD_BYTES) {
        throw new RangeError(`Un registro de telemetría excede ${ADHD_MAX_TELEMETRY_RECORD_BYTES} bytes estimados.`);
      }
      if (pendingRecords.length >= size || pendingBytes + estimatedBytes > ADHD_MAX_TELEMETRY_BLOCK_BYTES) flush();
      pendingRecords.push(record);
      pendingBytes += estimatedBytes;
    }
    flush();
  }
  return blocks.map((block) => ({ ...block, totalBlocks: blocks.length }));
}

async function writeTaskResultRemote({ patientId, programId, resultId, summary, blocks = [], telemetryEnabled = false }) {
  const auditId = crearIdEstableAdhd("audit", programId, "task_result_saved", resultId);
  const auditReference = entityRef(patientId, programId, "audit", auditId);
  const canonicalResultRef = resultRef(patientId, resultId);
  const [auditSnapshot, canonicalSnapshot] = await Promise.all([
    getDoc(auditReference),
    getDoc(canonicalResultRef)
  ]);
  const auditAlreadyExists = auditSnapshot.exists();
  const canonicalAlreadyExists = canonicalSnapshot.exists();
  const batch = writeBatch(db);
  batch.set(canonicalResultRef, {
    ...summary,
    telemetry: {
      enabled: Boolean(telemetryEnabled),
      blockCount: blocks.length,
      recordCount: blocks.reduce((total, block) => total + block.records.length, 0)
    },
    ...(!canonicalAlreadyExists ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp()
  }, { merge: true });

  for (const block of blocks) {
    batch.set(doc(canonicalResultRef, ADHD_TELEMETRY_COLLECTION, block.blockId), {
      ...persistenceMetadata(),
      resultId,
      programId,
      taskId: summary.taskId,
      channel: block.channel,
      blockIndex: block.blockIndex,
      totalBlocks: block.totalBlocks,
      recordCount: block.records.length,
      records: block.records,
      createdAt: serverTimestamp()
    });
  }

  batch.set(programRef(patientId, programId), {
    lastActivityAt: serverTimestamp(),
    lastResultId: resultId,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const references = summary.references || {};
  for (const [entityType, referenceKey] of [
    ["session", "sessionId"],
    ["evaluation", "evaluationId"],
    ["goal", "goalId"],
    ["challenge", "challengeId"]
  ]) {
    const entityId = references[referenceKey];
    if (!entityId) continue;
    const resultReferenceUpdate = entityType === "evaluation"
      ? { taskResultIds: arrayUnion(resultId), resultIds: arrayUnion(resultId) }
      : { resultIds: arrayUnion(resultId) };
    batch.set(entityRef(patientId, programId, entityType, entityId), {
      ...resultReferenceUpdate,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  if (!auditAlreadyExists) {
    batch.set(auditReference, {
      ...persistenceMetadata(),
      auditId,
      eventType: "task_result_saved",
      source: "adhd_persistence_adapter",
      programId,
      resultId,
      taskId: summary.taskId,
      occurredAtIso: summary.completedAtIso,
      createdAt: serverTimestamp()
    });
  }
  await batch.commit();
}

export async function saveTaskResult({
  patientId,
  programId,
  resultId: requestedResultId,
  sessionId = null,
  evaluationId = null,
  goalId = null,
  challengeId = null,
  attemptId = null,
  result = {},
  telemetry,
  telemetryEnabled = false
}) {
  const safeProgramId = assertDocumentId(programId, "programId");
  const taskId = result.taskId || result.activityId || result.module || "task";
  const stableAttempt = attemptId || result.attemptId || result.sessionId || result.startedAtIso || result.date || Date.now();
  const resultId = assertDocumentId(
    requestedResultId || crearIdEstableAdhd("result", safeProgramId, sessionId, evaluationId, taskId, stableAttempt),
    "resultId"
  );
  const references = { sessionId, evaluationId, goalId, challengeId };
  const summary = summaryFromResult(result, references, resultId, safeProgramId);
  const channels = telemetryEnabled ? telemetryChannels(result, telemetry) : {};
  const blocks = construirBloquesTelemetriaAdhd(resultId, channels);
  const payload = { summary, telemetryBlocks: blocks, telemetryEnabled: Boolean(telemetryEnabled) };
  const key = draftKey(patientId, safeProgramId, "result", resultId);

  const persistence = await persistWithDraft({
    key,
    payload,
    id: resultId,
    patientId,
    programId: safeProgramId,
    kind: "result",
    operation: () => writeTaskResultRemote({
      patientId,
      programId: safeProgramId,
      resultId,
      summary,
      blocks,
      telemetryEnabled
    })
  });

  return { ...persistence, resultId, telemetryBlockCount: blocks.length };
}

async function remoteSnapshotForDraft(record) {
  if (record.kind === "program") return getDoc(programRef(record.patientId, record.programId));
  if (record.kind === "result") return getDoc(resultRef(record.patientId, record.id));
  if (ENTITY_COLLECTIONS[record.kind]) {
    return getDoc(entityRef(record.patientId, record.programId, record.kind, record.id));
  }
  return null;
}

async function replayPendingDraft(record) {
  const snapshot = await remoteSnapshotForDraft(record);
  if (!snapshot) return { status: "unsupported" };
  const exists = snapshot.exists();
  const remote = exists ? snapshot.data() : null;
  const remoteTimestamp = resultTimestamp(remote);
  if (exists && record.kind === "audit") return { status: "already-synced" };
  if (exists && (!remoteTimestamp || remoteTimestamp > record.intentTimestamp)) {
    return { status: "remote-newer" };
  }

  if (record.kind === "program") {
    await setDoc(programRef(record.patientId, record.programId), {
      ...record.data,
      ...(!exists ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { status: "synced" };
  }
  if (record.kind === "result") {
    const summary = record.data?.summary;
    if (!summary || typeof summary !== "object") return { status: "unsupported" };
    await writeTaskResultRemote({
      patientId: record.patientId,
      programId: record.programId,
      resultId: record.id,
      summary,
      blocks: Array.isArray(record.data.telemetryBlocks) ? record.data.telemetryBlocks : [],
      telemetryEnabled: Boolean(record.data.telemetryEnabled)
    });
    return { status: "synced" };
  }
  if (ENTITY_COLLECTIONS[record.kind]) {
    const temporalField = record.kind === "audit" ? "createdAt" : "updatedAt";
    await setDoc(entityRef(record.patientId, record.programId, record.kind, record.id), {
      ...record.data,
      [temporalField]: serverTimestamp()
    }, { merge: record.kind !== "audit" });
    return { status: "synced" };
  }
  return { status: "unsupported" };
}

async function syncPendingAdhdWritesInternal({ patientId, programId, remoteTimeoutMs }) {
  const safePatientId = assertDocumentId(patientId, "patientId");
  const safeProgramId = assertDocumentId(programId, "programId");
  const records = await loadLocalDraftRecords(safePatientId, safeProgramId);
  const pending = records.filter((record) => (
    record.envelope.syncIntent === "remote-write" && record.envelope.retryEligible !== false
  ));
  const report = {
    patientId: safePatientId,
    programId: safeProgramId,
    total: pending.length,
    synced: 0,
    alreadySynced: 0,
    skippedRemoteNewer: 0,
    deferred: 0,
    ignored: records.length - pending.length
  };

  for (const record of pending) {
    try {
      const result = await waitForAdhdRemoteOperation(() => replayPendingDraft(record), remoteTimeoutMs);
      if (result.status === "unsupported") {
        report.ignored += 1;
        continue;
      }
      await eliminarBorradorClinicoLocal(record.key);
      if (result.status === "remote-newer") report.skippedRemoteNewer += 1;
      else if (result.status === "already-synced") report.alreadySynced += 1;
      else report.synced += 1;
    } catch (error) {
      if (esErrorAutorizacionAdhd(error)) {
        // No conservar ni volver a poner en cola datos que Firestore rechazó
        // por identidad o autorización.
        await eliminarBorradorClinicoLocal(record.key).catch(() => {});
        pendingSyncScopes.delete(syncScopeKey(safePatientId, safeProgramId));
        throw error;
      }
      const retryEligible = esErrorTransitorioAdhd(error);
      if (!retryEligible) {
        await eliminarBorradorClinicoLocal(record.key).catch(() => {});
        report.ignored += 1;
        continue;
      }
      const updatedLocalRecord = await guardarBorradorClinicoLocal(record.key, {
        ...record.envelope,
        retryEligible,
        attemptCount: (Number(record.envelope.attemptCount) || 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        lastErrorCode: loadErrorCode(error)
      });
      requireLocalDraft(updatedLocalRecord, error);
      report.deferred += 1;
    }
  }

  const remaining = await loadLocalDraftRecords(safePatientId, safeProgramId);
  report.remainingPending = remaining.filter((record) => (
    record.envelope.syncIntent === "remote-write" && record.envelope.retryEligible !== false
  )).length;
  report.localDraftCount = remaining.length;
  report.pendingSync = report.remainingPending > 0;
  if (!report.pendingSync) pendingSyncScopes.delete(syncScopeKey(safePatientId, safeProgramId));
  return report;
}

export function syncPendingAdhdWrites({ patientId, programId, remoteTimeoutMs }) {
  const safePatientId = assertDocumentId(patientId, "patientId");
  const safeProgramId = assertDocumentId(programId, "programId");
  const key = syncScopeKey(safePatientId, safeProgramId);
  if (pendingSyncInFlight.has(key)) return pendingSyncInFlight.get(key);
  const operation = syncPendingAdhdWritesInternal({ patientId: safePatientId, programId: safeProgramId, remoteTimeoutMs })
    .finally(() => pendingSyncInFlight.delete(key));
  pendingSyncInFlight.set(key, operation);
  return operation;
}

export const sincronizarPendientesAdhd = syncPendingAdhdWrites;

export async function archiveProgram({ patientId, programId, reason = "completed", data = {} }) {
  return saveProgram({
    patientId,
    programId,
    data: {
      ...cleanValue(data),
      status: "archived",
      archiveReason: String(reason || "completed").slice(0, 160),
      archivedAtIso: new Date().toISOString()
    }
  });
}

export async function saveSessionDraft({ patientId, programId, sessionId, data = {} }) {
  const id = assertDocumentId(sessionId, "sessionId");
  const key = draftKey(patientId, programId, "session", id);
  const localRecord = await guardarBorradorClinicoLocal(key, {
    ...persistenceMetadata(),
    id,
    patientId,
    programId,
    kind: "session",
    payload: cleanValue(data),
    pendingSince: new Date().toISOString(),
    syncIntent: "manual-draft",
    retryEligible: false
  });
  requireLocalDraft(localRecord);
  return { id, savedLocally: true, savedRemotely: false, pendingSync: true };
}

export async function loadSessionDraft({ patientId, programId, sessionId }) {
  return obtenerBorradorClinicoLocal(draftKey(patientId, programId, "session", assertDocumentId(sessionId, "sessionId")));
}

export async function clearSessionDraft({ patientId, programId, sessionId }) {
  await eliminarBorradorClinicoLocal(draftKey(patientId, programId, "session", assertDocumentId(sessionId, "sessionId")));
}

export async function saveAdhdDraft({ patientId, programId, kind = "program", id = programId, data = {} }) {
  const safeId = assertDocumentId(id, "draftId");
  const key = draftKey(patientId, programId, kind, safeId);
  const localRecord = await guardarBorradorClinicoLocal(key, {
    ...persistenceMetadata(),
    id: safeId,
    kind,
    patientId,
    programId,
    payload: cleanValue(data),
    pendingSince: new Date().toISOString(),
    syncIntent: "manual-draft",
    retryEligible: false
  });
  requireLocalDraft(localRecord);
  return { id: safeId, kind, savedLocally: true, savedRemotely: false, pendingSync: true };
}

export async function loadAdhdDraft({ patientId, programId, kind = "program", id = programId }) {
  return obtenerBorradorClinicoLocal(draftKey(patientId, programId, kind, assertDocumentId(id, "draftId")));
}

export async function clearAdhdDraft({ patientId, programId, kind = "program", id = programId }) {
  await eliminarBorradorClinicoLocal(draftKey(patientId, programId, kind, assertDocumentId(id, "draftId")));
}

function requireLocalDraft(record, cause = null) {
  if (record) return record;
  const error = new Error("No fue posible conservar localmente la escritura pendiente.");
  error.name = "AdhdLocalPersistenceError";
  error.code = "adhd/local-draft-unavailable";
  if (cause) error.cause = cause;
  throw error;
}

function domainPayload(options, key) {
  const data = options?.data ?? options?.[key] ?? options?.record ?? {};
  return { ...options, programId: options?.programId ?? data?.programId, data };
}

// Contrato público del controlador del programa TDAH.
export const createAdhdProgramRecord = (options = {}) => createProgram(domainPayload(options, "program"));
export const saveAdhdProgramRecord = (options = {}) => saveProgram(domainPayload(options, "program"));
export const saveAdhdEvaluation = (options = {}) => saveEvaluation(domainPayload(options, "evaluation"));
export const saveAdhdProfile = (options = {}) => saveProfile(domainPayload(options, "profile"));
export const saveAdhdPlan = (options = {}) => savePlan(domainPayload(options, "plan"));
export const saveAdhdGoal = (options = {}) => saveGoal(domainPayload(options, "goal"));
export const saveAdhdSession = (options = {}) => saveSession(domainPayload(options, "session"));
export const saveAdhdTransferChallenge = (options = {}) => saveChallenge(domainPayload(options, "challenge"));
export const saveAdhdTaskResult = (options = {}) => {
  const result = options.result ?? options.taskResult ?? options.normalizedResult ?? {};
  const context = result.context || {};
  return saveTaskResult({
    ...options,
    result,
    programId: options.programId ?? context.programId,
    sessionId: options.sessionId ?? context.sessionId,
    evaluationId: options.evaluationId ?? context.evaluationId,
    goalId: options.goalId ?? context.goalId,
    challengeId: options.challengeId ?? context.challengeId,
    attemptId: options.attemptId ?? result.attemptId
  });
};
export const archiveAdhdProgram = archiveProgram;
export const createStableAdhdId = crearIdEstableAdhd;

// Alias en español para consumidores clínicos existentes.
export const crearPrograma = createProgram;
export const cargarPrograma = loadProgram;
export const guardarPrograma = saveProgram;
export const guardarEvaluacion = saveEvaluation;
export const guardarPerfil = saveProfile;
export const guardarPlan = savePlan;
export const guardarMeta = saveGoal;
export const guardarSesion = saveSession;
export const guardarReto = saveChallenge;
export const guardarResultadoTarea = saveTaskResult;
export const archivarPrograma = archiveProgram;
