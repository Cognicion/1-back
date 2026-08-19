const crypto = require("crypto");
const { FieldPath } = require("firebase-admin/firestore");
const {
  ANALYTICS_COLLECTIONS,
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_EMBEDDING_ENGINE_VERSION,
  CLINICAL_RECORD_COLLECTIONS
} = require("./config");
const { normalized } = require("./access");
const { analyticsPatientId } = require("./deidentification");
const {
  indexClinicalRecordEmbeddings,
  safeEmbeddingStatus
} = require("./embeddingPersistence");

const SOURCES = Object.freeze(["patientProfile", ...CLINICAL_RECORD_COLLECTIONS]);

function isPatientProfile(profile = {}) {
  return [profile.rol, profile.role, profile.tipoUsuario, profile.perfil]
    .some((value) => normalized(value) === "paciente") || profile.esPaciente === true;
}

function cursorKey(apiKey) {
  return crypto.createHash("sha256").update(`cognicion-embedding-cursor:${apiKey}`).digest();
}

function encryptCursor(cursor, apiKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cursorKey(apiKey), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(cursor), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptCursor(encoded, apiKey) {
  if (!encoded) return { phase: "records", patientCursor: null, currentPatientId: null, sourceIndex: 0, recordCursor: null };
  const payload = Buffer.from(String(encoded), "base64url");
  if (payload.length < 29) throw new TypeError("Cursor de reconstrucción inválido.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", cursorKey(apiKey), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

function newJobId() {
  return crypto.randomBytes(18).toString("base64url");
}

function safeJobId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{20,80}$/.test(text) ? text : null;
}

async function findNextPatient(db, afterId) {
  let cursor = afterId || null;
  for (let page = 0; page < 100; page += 1) {
    let query = db.collection("usuarios").orderBy(FieldPath.documentId()).limit(50);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) return null;
    const patient = snapshot.docs.find((doc) => isPatientProfile(doc.data() || {}));
    if (patient) return patient;
    cursor = snapshot.docs.at(-1).id;
    if (snapshot.size < 50) return null;
  }
  throw new RangeError("No se pudo localizar el siguiente perfil de paciente dentro del límite operativo.");
}

async function processRecord({ db, apiKey, OpenAIClass, patientDoc, sourceCollection, sourceRecordId, record }) {
  return indexClinicalRecordEmbeddings({
    db,
    apiKey,
    OpenAIClass,
    patientId: patientDoc.id,
    patient: patientDoc.data() || {},
    sourceCollection,
    sourceRecordId,
    record
  });
}

async function processRecordPhase({ db, apiKey, OpenAIClass, cursor, limit }) {
  const counters = { processed: 0, indexed: 0, skipped: 0, failed: 0 };
  while (counters.processed < limit) {
    let patientDoc;
    if (!cursor.currentPatientId) {
      patientDoc = await findNextPatient(db, cursor.patientCursor);
      if (!patientDoc) {
        cursor.phase = "relations";
        cursor.embeddingCursor = null;
        break;
      }
      cursor.currentPatientId = patientDoc.id;
      cursor.sourceIndex = 0;
      cursor.recordCursor = null;
    } else {
      patientDoc = await db.collection("usuarios").doc(cursor.currentPatientId).get();
      if (!patientDoc.exists || !isPatientProfile(patientDoc.data() || {})) {
        cursor.patientCursor = cursor.currentPatientId;
        cursor.currentPatientId = null;
        continue;
      }
    }

    if (cursor.sourceIndex >= SOURCES.length) {
      cursor.patientCursor = cursor.currentPatientId;
      cursor.currentPatientId = null;
      cursor.sourceIndex = 0;
      cursor.recordCursor = null;
      continue;
    }

    const sourceCollection = SOURCES[cursor.sourceIndex];
    if (sourceCollection === "patientProfile") {
      counters.processed += 1;
      try {
        const result = await processRecord({
          db,
          apiKey,
          OpenAIClass,
          patientDoc,
          sourceCollection,
          sourceRecordId: "profile",
          record: patientDoc.data() || {}
        });
        if (result.indexed) counters.indexed += 1;
        else counters.skipped += 1;
      } catch {
        counters.failed += 1;
      }
      cursor.sourceIndex += 1;
      cursor.recordCursor = null;
      continue;
    }

    const remaining = limit - counters.processed;
    let query = db.collection(`usuarios/${patientDoc.id}/${sourceCollection}`)
      .orderBy(FieldPath.documentId())
      .limit(remaining);
    if (cursor.recordCursor) query = query.startAfter(cursor.recordCursor);
    const snapshot = await query.get();
    if (snapshot.empty) {
      cursor.sourceIndex += 1;
      cursor.recordCursor = null;
      continue;
    }
    for (const recordDoc of snapshot.docs) {
      counters.processed += 1;
      try {
        const result = await processRecord({
          db,
          apiKey,
          OpenAIClass,
          patientDoc,
          sourceCollection,
          sourceRecordId: recordDoc.id,
          record: recordDoc.data() || {}
        });
        if (result.indexed) counters.indexed += 1;
        else counters.skipped += 1;
      } catch {
        counters.failed += 1;
      }
      cursor.recordCursor = recordDoc.id;
    }
    if (snapshot.size < remaining) {
      cursor.sourceIndex += 1;
      cursor.recordCursor = null;
    }
  }
  return { cursor, counters };
}

async function createJob({ db, actorUid, apiKey }) {
  const jobId = newJobId();
  const ref = db.collection(ANALYTICS_COLLECTIONS.embeddingJobs).doc(jobId);
  const cursor = { phase: "records", patientCursor: null, currentPatientId: null, sourceIndex: 0, recordCursor: null };
  await ref.set({
    jobId,
    status: "running",
    phase: "records",
    cursor: encryptCursor(cursor, apiKey),
    actorAnalyticsId: analyticsPatientId(actorUid),
    processedRecords: 0,
    indexedRecords: 0,
    skippedRecords: 0,
    failedRecords: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false
  }, { merge: false });
  return { jobId, ref, cursor, data: { processedRecords: 0, indexedRecords: 0, skippedRecords: 0, failedRecords: 0 } };
}

async function loadJob({ db, jobId, apiKey }) {
  const ref = db.collection(ANALYTICS_COLLECTIONS.embeddingJobs).doc(jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new TypeError("Trabajo de embeddings no encontrado.");
  const data = snapshot.data() || {};
  if (data.embeddingEngineVersion !== CLINICAL_EMBEDDING_ENGINE_VERSION) throw new TypeError("El trabajo pertenece a otra versión del motor.");
  return { jobId, ref, data, cursor: decryptCursor(data.cursor, apiKey) };
}

async function rebuildClinicalEmbeddingIndexBatch({ db, apiKey, OpenAIClass, actorUid, jobId }) {
  const existingJobId = safeJobId(jobId);
  const job = existingJobId
    ? await loadJob({ db, jobId: existingJobId, apiKey })
    : await createJob({ db, actorUid, apiKey });
  if (job.data.status === "complete") {
    return { ok: true, jobId: job.jobId, status: "complete", hasMore: false, ...safeEmbeddingStatus(job.data) };
  }
  const result = await processRecordPhase({
    db,
    apiKey,
    OpenAIClass,
    cursor: job.cursor,
    limit: CLINICAL_EMBEDDING_CONFIG.rebuildBatchRecords
  });
  const totals = {
    processedRecords: (Number(job.data.processedRecords) || 0) + result.counters.processed,
    indexedRecords: (Number(job.data.indexedRecords) || 0) + result.counters.indexed,
    skippedRecords: (Number(job.data.skippedRecords) || 0) + result.counters.skipped,
    failedRecords: (Number(job.data.failedRecords) || 0) + result.counters.failed
  };
  const complete = result.cursor.phase === "relations";
  const status = complete ? "complete" : "running";
  const safeCursor = complete
    ? { phase: "complete", patientCursor: null, currentPatientId: null, sourceIndex: 0, recordCursor: null }
    : result.cursor;
  await job.ref.set({
    status,
    phase: complete ? "complete" : "records",
    cursor: encryptCursor(safeCursor, apiKey),
    ...totals,
    updatedAt: new Date().toISOString(),
    completedAt: complete ? new Date().toISOString() : null
  }, { merge: true });
  await db.collection(ANALYTICS_COLLECTIONS.embeddingStatus).doc("current").set({
    rebuildStatus: status,
    rebuildProcessedRecords: totals.processedRecords,
    rebuildIndexedRecords: totals.indexedRecords,
    rebuildSkippedRecords: totals.skippedRecords,
    rebuildFailedRecords: totals.failedRecords,
    rebuildUpdatedAt: new Date().toISOString(),
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION
  }, { merge: true });
  console.debug("[SOFIA Embeddings] Lote histórico procesado", {
    status,
    processedInBatch: result.counters.processed,
    indexedInBatch: result.counters.indexed,
    skippedInBatch: result.counters.skipped,
    failedInBatch: result.counters.failed,
    directIdentifiersIncluded: false
  });
  return {
    ok: true,
    jobId: job.jobId,
    status,
    hasMore: !complete,
    batch: result.counters,
    totals,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false
  };
}

module.exports = {
  decryptCursor,
  encryptCursor,
  isPatientProfile,
  rebuildClinicalEmbeddingIndexBatch,
  safeJobId
};
