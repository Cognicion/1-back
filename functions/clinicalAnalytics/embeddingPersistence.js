const { FieldValue } = require("firebase-admin/firestore");
const {
  ANALYTICS_COLLECTIONS,
  CLINICAL_ANALYTICS_SCHEMA_VERSION,
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_EMBEDDING_ENGINE_VERSION,
  CLINICAL_RECORD_SOURCE_CATALOG
} = require("./config");
const { analyticsPatientId } = require("./deidentification");
const { createEmbeddingVectors } = require("./embeddingService");
const {
  buildDeidentifiedSemanticDocument,
  sha256
} = require("./semanticDocumentBuilder");
const {
  aggregateSemanticRelations,
  buildSemanticRelation
} = require("./semanticRelationshipEngine");

function embeddingId(sourceRecordHash, fragment) {
  return sha256(`${sourceRecordHash}:${fragment.fragmentIndex}:${fragment.contentHash}:${CLINICAL_EMBEDDING_ENGINE_VERSION}`);
}

function sourceRecordHashFor(patientId, sourceCollection, sourceRecordId) {
  return sha256(`${analyticsPatientId(patientId)}:${sourceCollection}:${sourceRecordId}`);
}

function safeErrorCode(error) {
  return String(error?.code || error?.status || error?.name || "unknown").replace(/[^a-zA-Z0-9/_-]/g, "_").slice(0, 80);
}

function assertSafeEmbeddingMetadata(payload = {}) {
  const serialized = JSON.stringify(payload);
  if (/"(?:content|text|texto|rawText|patientId|pacienteId|nombre|email|correo|telefono|curp|rfc|path|ruta|url)"\s*:/iu.test(serialized)) {
    throw new TypeError("Los metadatos del embedding contienen un campo no permitido.");
  }
  if (payload.directIdentifiersIncluded !== false || payload.rawClinicalTextIncluded !== false) {
    throw new TypeError("Los metadatos del embedding no acreditan desidentificación.");
  }
}

function embeddingMetadata(semanticDocument, fragment, model) {
  const payload = {
    analyticsPatientId: semanticDocument.analyticsPatientId,
    sourceRecordHash: semanticDocument.sourceRecordHash,
    sourceCollection: semanticDocument.sourceCollection,
    sourceLabel: semanticDocument.sourceLabel,
    sourceDomain: semanticDocument.sourceDomain,
    observedMonth: semanticDocument.observedMonth,
    fragmentIndex: fragment.fragmentIndex,
    contentHash: fragment.contentHash,
    sourceType: "cognicion_empirical",
    embeddingModel: model,
    embeddingDimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false,
    updatedAt: new Date().toISOString()
  };
  assertSafeEmbeddingMetadata(payload);
  return payload;
}

async function commitOperations(db, operations, batchSize = 350) {
  for (let start = 0; start < operations.length; start += batchSize) {
    const batch = db.batch();
    operations.slice(start, start + batchSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function manifestPayload(semanticDocument, status, extra = {}) {
  return {
    analyticsPatientId: semanticDocument.analyticsPatientId,
    sourceRecordHash: semanticDocument.sourceRecordHash,
    sourceCollection: semanticDocument.sourceCollection,
    sourceLabel: semanticDocument.sourceLabel,
    sourceDomain: semanticDocument.sourceDomain,
    observedMonth: semanticDocument.observedMonth,
    contentFingerprint: semanticDocument.contentFingerprint,
    status,
    fragmentCount: 0,
    fragmentIds: [],
    relationIds: [],
    embeddingModel: CLINICAL_EMBEDDING_CONFIG.model,
    embeddingDimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
    directIdentifiersIncluded: false,
    rawClinicalTextPersisted: false,
    updatedAt: new Date().toISOString(),
    ...extra
  };
}

async function reserveManifest({ db, semanticDocument }) {
  const ref = db.collection(ANALYTICS_COLLECTIONS.embeddingManifests).doc(semanticDocument.sourceRecordHash);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() || {} : null;
    const sameVersion = previous?.embeddingModel === CLINICAL_EMBEDDING_CONFIG.model
      && Number(previous?.embeddingDimensions) === CLINICAL_EMBEDDING_CONFIG.dimensions
      && previous?.embeddingEngineVersion === CLINICAL_EMBEDDING_ENGINE_VERSION;
    if (previous?.status === "ready" && sameVersion && previous.contentFingerprint === semanticDocument.contentFingerprint) {
      return { acquired: false, duplicate: true, previous, ref };
    }
    const processingAge = Date.now() - Date.parse(previous?.processingStartedAt || 0);
    if (previous?.status === "processing" && sameVersion
      && previous.contentFingerprint === semanticDocument.contentFingerprint
      && Number.isFinite(processingAge) && processingAge < CLINICAL_EMBEDDING_CONFIG.processingLeaseMs) {
      return { acquired: false, inProgress: true, previous, ref };
    }
    transaction.set(ref, manifestPayload(semanticDocument, "processing", {
      processingStartedAt: new Date().toISOString(),
      previousFragmentIds: previous?.fragmentIds || previous?.previousFragmentIds || [],
      previousRelationIds: previous?.relationIds || previous?.previousRelationIds || []
    }), { merge: false });
    return { acquired: true, previous, ref };
  });
}

async function deleteRelationsForEmbeddingIds(db, ids = []) {
  const relationIds = new Set();
  for (const id of ids) {
    try {
      const snapshot = await db.collection(ANALYTICS_COLLECTIONS.semanticRelations)
        .where("embeddingIds", "array-contains", id)
        .get();
      snapshot.docs.forEach((doc) => relationIds.add(doc.id));
    } catch (error) {
      console.warn("[SOFIA Embeddings] No se pudieron localizar relaciones anteriores", { code: safeErrorCode(error) });
    }
  }
  await commitOperations(db, [...relationIds].map((id) => (batch) => (
    batch.delete(db.collection(ANALYTICS_COLLECTIONS.semanticRelations).doc(id))
  )));
}

async function removeArtifacts({ db, fragmentIds = [], relationIds = [] }) {
  await deleteRelationsForEmbeddingIds(db, fragmentIds);
  const operations = [
    ...fragmentIds.map((id) => (batch) => batch.delete(db.collection(ANALYTICS_COLLECTIONS.embeddings).doc(id))),
    ...relationIds.map((id) => (batch) => batch.delete(db.collection(ANALYTICS_COLLECTIONS.semanticRelations).doc(id)))
  ];
  await commitOperations(db, operations);
}

async function updateEmbeddingCounters({ db, sourceCollection, previous = null, nextStatus, nextFragmentCount = 0 }) {
  const previousReady = previous?.status === "ready" ? 1 : 0;
  const nextReady = nextStatus === "ready" ? 1 : 0;
  const previousFailed = previous?.status === "failed" ? 1 : 0;
  const nextFailed = nextStatus === "failed" ? 1 : 0;
  const recordDelta = nextReady - previousReady;
  const fragmentDelta = nextFragmentCount - (previousReady ? Number(previous.fragmentCount) || 0 : 0);
  const failureDelta = nextFailed - previousFailed;
  const now = new Date().toISOString();
  const source = CLINICAL_RECORD_SOURCE_CATALOG[sourceCollection] || { label: sourceCollection, domain: "otro" };
  const statusRef = db.collection(ANALYTICS_COLLECTIONS.embeddingStatus).doc("current");
  const sourceRef = db.collection(ANALYTICS_COLLECTIONS.embeddingSources).doc(sourceCollection);
  await db.runTransaction(async (transaction) => {
    transaction.set(statusRef, {
      status: nextStatus === "failed" ? "degraded" : "ready",
      indexedRecords: FieldValue.increment(recordDelta),
      indexedFragments: FieldValue.increment(fragmentDelta),
      failedRecords: FieldValue.increment(failureDelta),
      processedOperations: FieldValue.increment(1),
      lastProcessedAt: now,
      embeddingModel: CLINICAL_EMBEDDING_CONFIG.model,
      embeddingDimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
      embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
      schemaVersion: CLINICAL_ANALYTICS_SCHEMA_VERSION,
      directIdentifiersIncluded: false,
      rawClinicalTextPersisted: false
    }, { merge: true });
    transaction.set(sourceRef, {
      sourceCollection,
      sourceLabel: source.label,
      sourceDomain: source.domain,
      indexedRecords: FieldValue.increment(recordDelta),
      indexedFragments: FieldValue.increment(fragmentDelta),
      failedRecords: FieldValue.increment(failureDelta),
      lastProcessedAt: now,
      embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION
    }, { merge: true });
  });
}

async function persistRelationsForEmbedding({ db, embeddingDocument, vector }) {
  const collection = db.collection(ANALYTICS_COLLECTIONS.embeddings);
  const query = collection
    .select(
      "analyticsPatientId",
      "sourceCollection",
      "sourceLabel",
      "sourceDomain",
      "observedMonth",
      "embeddingModel",
      "embeddingDimensions",
      "embeddingEngineVersion",
      "vectorDistance"
    )
    .findNearest({
      vectorField: "embedding",
      queryVector: vector,
      limit: CLINICAL_EMBEDDING_CONFIG.nearestNeighbors,
      distanceMeasure: "COSINE",
      distanceResultField: "vectorDistance"
    });
  const snapshot = await query.get();
  const relations = snapshot.docs.map((doc) => buildSemanticRelation({
    source: embeddingDocument,
    target: { id: doc.id, ...doc.data() },
    distance: doc.get("vectorDistance")
  })).filter((relation) => relation?.crossPatient === true);
  await commitOperations(db, relations.map((relation) => (batch) => batch.set(
    db.collection(ANALYTICS_COLLECTIONS.semanticRelations).doc(relation.relationId),
    relation,
    { merge: false }
  )));
  return relations.map((relation) => relation.relationId);
}

async function persistAllRelations({ db, embeddingDocuments }) {
  const relationIds = new Set();
  for (const embeddingDocument of embeddingDocuments) {
    try {
      const ids = await persistRelationsForEmbedding({
        db,
        embeddingDocument: embeddingDocument.metadata,
        vector: embeddingDocument.vector
      });
      ids.forEach((id) => relationIds.add(id));
      await db.collection(ANALYTICS_COLLECTIONS.embeddingStatus).doc("current").set({
        relationIndexStatus: "ready",
        lastRelationScanAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      const code = safeErrorCode(error);
      console.warn("[SOFIA Embeddings] Relación semántica pendiente", { code });
      await db.collection(ANALYTICS_COLLECTIONS.embeddingStatus).doc("current").set({
        relationIndexStatus: code.includes("precondition") || code === "9" ? "pending_vector_index" : "degraded",
        lastRelationErrorCode: code,
        lastRelationScanAt: new Date().toISOString()
      }, { merge: true });
      break;
    }
  }
  return [...relationIds];
}

async function indexClinicalRecordEmbeddings({
  db,
  apiKey,
  OpenAIClass,
  patientId,
  patient,
  sourceCollection,
  sourceRecordId,
  record
}) {
  const semanticDocument = buildDeidentifiedSemanticDocument({
    patientId,
    patient,
    sourceCollection,
    sourceRecordId,
    record
  });
  if (!semanticDocument) return { skipped: true, reason: "unsupported_source" };
  const reservation = await reserveManifest({ db, semanticDocument });
  if (!reservation.acquired) return {
    skipped: true,
    duplicate: reservation.duplicate === true,
    inProgress: reservation.inProgress === true,
    sourceRecordHash: semanticDocument.sourceRecordHash
  };
  const previous = reservation.previous;
  try {
    if (!semanticDocument.fragments.length) {
      await removeArtifacts({
        db,
        fragmentIds: previous?.fragmentIds || previous?.previousFragmentIds || [],
        relationIds: previous?.relationIds || previous?.previousRelationIds || []
      });
      await reservation.ref.set(manifestPayload(semanticDocument, "skipped", { skipReason: "no_semantic_content" }), { merge: false });
      await updateEmbeddingCounters({ db, sourceCollection, previous, nextStatus: "skipped", nextFragmentCount: 0 });
      return { skipped: true, reason: "no_semantic_content", sourceRecordHash: semanticDocument.sourceRecordHash };
    }
    const generated = await createEmbeddingVectors({
      apiKey,
      OpenAIClass,
      fragments: semanticDocument.fragments,
      analyticsUserId: semanticDocument.analyticsPatientId
    });
    const embeddingDocuments = semanticDocument.fragments.map((fragment, index) => {
      const id = embeddingId(semanticDocument.sourceRecordHash, fragment);
      const metadata = { id, ...embeddingMetadata(semanticDocument, fragment, generated.model) };
      return { id, metadata, vector: generated.vectors[index] };
    });
    await commitOperations(db, embeddingDocuments.map((item) => (batch) => {
      const { id: omittedId, ...metadata } = item.metadata;
      void omittedId;
      return batch.set(
        db.collection(ANALYTICS_COLLECTIONS.embeddings).doc(item.id),
        { ...metadata, embedding: FieldValue.vector(item.vector) },
        { merge: false }
      );
    }));
    await removeArtifacts({
      db,
      fragmentIds: (previous?.fragmentIds || previous?.previousFragmentIds || []).filter((id) => !embeddingDocuments.some((item) => item.id === id)),
      relationIds: previous?.relationIds || previous?.previousRelationIds || []
    });
    const relationIds = await persistAllRelations({ db, embeddingDocuments });
    const readyManifest = manifestPayload(semanticDocument, "ready", {
      fragmentCount: embeddingDocuments.length,
      fragmentIds: embeddingDocuments.map((item) => item.id),
      relationIds,
      promptTokens: generated.promptTokens,
      totalTokens: generated.totalTokens,
      indexedAt: new Date().toISOString()
    });
    await reservation.ref.set(readyManifest, { merge: false });
    await updateEmbeddingCounters({
      db,
      sourceCollection,
      previous,
      nextStatus: "ready",
      nextFragmentCount: embeddingDocuments.length
    });
    console.debug("[SOFIA Embeddings] Registro indexado", {
      sourceCollection,
      fragmentCount: embeddingDocuments.length,
      relationCount: relationIds.length,
      directIdentifiersIncluded: false,
      rawClinicalTextPersisted: false
    });
    return {
      indexed: true,
      sourceRecordHash: semanticDocument.sourceRecordHash,
      fragmentCount: embeddingDocuments.length,
      relationCount: relationIds.length,
      embeddingModel: generated.model,
      embeddingDimensions: generated.dimensions,
      directIdentifiersIncluded: false,
      rawClinicalTextPersisted: false
    };
  } catch (error) {
    const code = safeErrorCode(error);
    await reservation.ref.set(manifestPayload(semanticDocument, "failed", {
      failureCode: code,
      failedAt: new Date().toISOString()
    }), { merge: false });
    await updateEmbeddingCounters({ db, sourceCollection, previous, nextStatus: "failed", nextFragmentCount: 0 });
    console.error("[SOFIA Embeddings] Falló la indexación desidentificada", { sourceCollection, code });
    throw error;
  }
}

async function removeClinicalRecordEmbeddings({ db, patientId, sourceCollection, sourceRecordId }) {
  const hash = sourceRecordHashFor(patientId, sourceCollection, sourceRecordId);
  const ref = db.collection(ANALYTICS_COLLECTIONS.embeddingManifests).doc(hash);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { removed: false };
  const manifest = snapshot.data() || {};
  await removeArtifacts({
    db,
    fragmentIds: manifest.fragmentIds || manifest.previousFragmentIds || [],
    relationIds: manifest.relationIds || manifest.previousRelationIds || []
  });
  await ref.delete();
  await updateEmbeddingCounters({
    db,
    sourceCollection,
    previous: manifest,
    nextStatus: "removed",
    nextFragmentCount: 0
  });
  return { removed: true };
}

async function removePatientEmbeddings({ db, patientId }) {
  const analyticsId = analyticsPatientId(patientId);
  const snapshot = await db.collection(ANALYTICS_COLLECTIONS.embeddingManifests)
    .where("analyticsPatientId", "==", analyticsId)
    .get();
  for (const doc of snapshot.docs) {
    const manifest = doc.data() || {};
    await removeArtifacts({
      db,
      fragmentIds: manifest.fragmentIds || manifest.previousFragmentIds || [],
      relationIds: manifest.relationIds || manifest.previousRelationIds || []
    });
    await doc.ref.delete();
    await updateEmbeddingCounters({
      db,
      sourceCollection: manifest.sourceCollection,
      previous: manifest,
      nextStatus: "removed",
      nextFragmentCount: 0
    });
  }
  return { removedRecords: snapshot.size };
}

function safeEmbeddingStatus(status = {}) {
  const versionOutdated = Boolean(status.embeddingEngineVersion && status.embeddingEngineVersion !== CLINICAL_EMBEDDING_ENGINE_VERSION);
  return {
    status: status.status || "not_initialized",
    relationIndexStatus: status.relationIndexStatus || "not_initialized",
    indexedRecords: Math.max(0, Number(status.indexedRecords) || 0),
    indexedFragments: Math.max(0, Number(status.indexedFragments) || 0),
    failedRecords: Math.max(0, Number(status.failedRecords) || 0),
    processedOperations: Math.max(0, Number(status.processedOperations) || 0),
    lastProcessedAt: status.lastProcessedAt || null,
    lastRelationScanAt: status.lastRelationScanAt || null,
    rebuildStatus: status.rebuildStatus || "not_started",
    rebuildProcessedRecords: Math.max(0, Number(status.rebuildProcessedRecords) || 0),
    embeddingModel: CLINICAL_EMBEDDING_CONFIG.model,
    embeddingDimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION,
    versionOutdated,
    directIdentifiersIncluded: false,
    rawClinicalTextPersisted: false,
    vectorsExposedToClient: false
  };
}

async function readClinicalEmbeddingKnowledge({ db }) {
  const [statusSnapshot, sourcesSnapshot, relationsSnapshot] = await Promise.all([
    db.collection(ANALYTICS_COLLECTIONS.embeddingStatus).doc("current").get(),
    db.collection(ANALYTICS_COLLECTIONS.embeddingSources).get(),
    db.collection(ANALYTICS_COLLECTIONS.semanticRelations)
      .orderBy("similarity", "desc")
      .limit(CLINICAL_EMBEDDING_CONFIG.maxRelationsRead)
      .get()
  ]);
  const status = safeEmbeddingStatus(statusSnapshot.exists ? statusSnapshot.data() || {} : {});
  const sources = sourcesSnapshot.docs.map((doc) => {
    const data = doc.data() || {};
    const configured = CLINICAL_RECORD_SOURCE_CATALOG[data.sourceCollection || doc.id] || {};
    return {
      sourceCollection: data.sourceCollection || doc.id,
      sourceLabel: data.sourceLabel || configured.label || doc.id,
      sourceDomain: data.sourceDomain || configured.domain || "otro",
      indexedRecords: Math.max(0, Number(data.indexedRecords) || 0),
      indexedFragments: Math.max(0, Number(data.indexedFragments) || 0),
      failedRecords: Math.max(0, Number(data.failedRecords) || 0),
      lastProcessedAt: data.lastProcessedAt || null
    };
  }).sort((a, b) => b.indexedRecords - a.indexedRecords || a.sourceLabel.localeCompare(b.sourceLabel, "es"));
  const aggregation = aggregateSemanticRelations(relationsSnapshot.docs.map((doc) => doc.data() || {}));
  return {
    status,
    sources,
    relations: aggregation.relations,
    privacy: {
      minimumCrossPatientPairs: aggregation.minimumCrossPatientPairs,
      privacySuppressedGroups: aggregation.privacySuppressedGroups,
      directIdentifiersIncluded: false,
      rawClinicalTextIncluded: false,
      vectorsIncluded: false
    }
  };
}

module.exports = {
  assertSafeEmbeddingMetadata,
  embeddingId,
  indexClinicalRecordEmbeddings,
  readClinicalEmbeddingKnowledge,
  removeClinicalRecordEmbeddings,
  removePatientEmbeddings,
  safeEmbeddingStatus,
  sourceRecordHashFor
};
