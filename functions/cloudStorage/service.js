"use strict";

const crypto = require("node:crypto");
const {
  FieldPath: AdminFieldPath,
  FieldValue: AdminFieldValue,
  Timestamp: AdminTimestamp
} = require("firebase-admin/firestore");
const { CLOUD_STORAGE_CONFIG } = require("./config");
const { CloudStorageDomainError, assertDomain, fail } = require("./errors");
const {
  availableBytes,
  commitReservedBytes,
  normalizeUsage,
  reconcileBytes,
  releaseReservedBytes,
  releaseUsedBytes,
  reserveBytes
} = require("./quotaTransitions");
const {
  allowedMimeForExtension,
  assertCanonicalStorageBinding,
  buildStoragePath,
  deriveStableId,
  normalizeNameForIndex,
  normalizeMimeType,
  normalizeParentFolderId,
  optionalRequestId,
  parseStoragePath,
  validateDocumentId,
  validateFileDescriptor,
  validateFolderName,
  validateRenameForItem
} = require("./validation");
const { validateStoredContent } = require("./contentValidation");

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampToIso(value) {
  const milliseconds = timestampToMillis(value);
  return milliseconds ? new Date(milliseconds).toISOString() : null;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function isStorageNotFound(error) {
  return error?.code === 404 || error?.code === "404" || error?.code === "storage/object-not-found";
}

function isRetryableTransactionContention(error) {
  if (!error || error instanceof CloudStorageDomainError) return false;
  const code = String(error.code ?? "").trim().toLowerCase();
  if (["10", "aborted", "4", "deadline-exceeded"].includes(code)) return true;
  if (code !== "3" && code !== "invalid-argument") return false;
  return /transaction(?:\s+lock\s+timeout|\s+is\s+invalid\s+or\s+closed)/iu.test(String(error.message || ""));
}

function transactionRetryDelay(attempt) {
  const base = Math.min(800, 50 * (2 ** attempt));
  return new Promise((resolve) => setTimeout(resolve, base + Math.floor(Math.random() * 50)));
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, values.length)) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function createCloudStorageService({ admin, db, bucket, logger = console, now = () => Date.now() }) {
  assertDomain(admin && db && bucket, "failed-precondition", "Firebase Admin no está inicializado para Mi nube.");
  // El runtime del Emulator puede exponer admin.firestore() sin los helpers
  // estáticos del namespace compat. Los imports modulares son la API canónica.
  const FieldValue = AdminFieldValue;
  const Timestamp = AdminTimestamp;
  const FieldPath = AdminFieldPath;

  function filesCollection(uid) {
    return db.collection(CLOUD_STORAGE_CONFIG.usersCollection).doc(uid).collection(CLOUD_STORAGE_CONFIG.filesCollection);
  }

  function fileRef(uid, itemId) {
    return filesCollection(uid).doc(itemId);
  }

  function reservationsCollection(uid) {
    return db.collection(CLOUD_STORAGE_CONFIG.usersCollection).doc(uid).collection(CLOUD_STORAGE_CONFIG.reservationsCollection);
  }

  function reservationRef(uid, fileId) {
    return reservationsCollection(uid).doc(fileId);
  }

  function usageRef(uid) {
    return db.collection(CLOUD_STORAGE_CONFIG.usersCollection).doc(uid)
      .collection(CLOUD_STORAGE_CONFIG.usageCollection).doc(CLOUD_STORAGE_CONFIG.usageDocument);
  }

  function usageWrite(usage) {
    const normalized = normalizeUsage(usage);
    return {
      maxBytes: normalized.maxBytes,
      reservedBytes: normalized.reservedBytes,
      revision: normalized.revision,
      updatedAt: FieldValue.serverTimestamp(),
      usedBytes: normalized.usedBytes
    };
  }

  function usageResponse(usage) {
    const normalized = normalizeUsage(usage);
    return { ...normalized, availableBytes: availableBytes(normalized) };
  }

  function assertOwner(item, uid) {
    assertDomain(item && item.ownerId === uid, "permission-denied", "El elemento no pertenece al usuario autenticado.");
  }

  function reservationStorageBinding(reservation, uid, fileId) {
    assertDomain(
      reservation?.ownerId === uid,
      "data-loss",
      "La reserva contiene un propietario interno inconsistente.",
      { securityReason: "invalid-storage-binding" }
    );
    assertDomain(
      reservation?.id === fileId
        && reservation?.fileId === fileId
        && reservation?.filename === reservation?.storageName,
      "data-loss",
      "La reserva contiene identificadores internos inconsistentes.",
      { securityReason: "invalid-storage-binding" }
    );
    return assertCanonicalStorageBinding({
      fileId,
      storageName: reservation.storageName,
      storagePath: reservation.storagePath,
      uid
    });
  }

  function itemStorageBinding(item, uid, fileId) {
    assertDomain(
      item?.ownerId === uid,
      "data-loss",
      "El archivo contiene un propietario interno inconsistente.",
      { securityReason: "invalid-storage-binding" }
    );
    assertDomain(
      item?.id === fileId,
      "data-loss",
      "El archivo contiene identificadores internos inconsistentes.",
      { securityReason: "invalid-storage-binding" }
    );
    return assertCanonicalStorageBinding({
      fileId,
      storageName: item.storageName,
      storagePath: item.storagePath,
      uid
    });
  }

  function parsedStorageBinding(parsed) {
    return assertCanonicalStorageBinding({
      fileId: parsed?.fileId,
      storageName: parsed?.filename,
      storagePath: parsed?.storagePath,
      uid: parsed?.uid
    });
  }

  function isUnsafeStorageBindingError(error) {
    return error instanceof CloudStorageDomainError
      && error.code === "data-loss"
      && error.details?.securityReason === "invalid-storage-binding";
  }

  function storageFile(binding) {
    const canonical = assertCanonicalStorageBinding(binding);
    return bucket.file(canonical.storagePath);
  }

  async function assertParentFolderSnapshot(snapshot, uid, parentFolderId) {
    if (!parentFolderId) return null;
    assertDomain(snapshot?.exists, "not-found", "La carpeta de destino no existe.");
    const folder = snapshot.data() || {};
    assertOwner(folder, uid);
    assertDomain(folder.type === "folder", "failed-precondition", "El destino no es una carpeta.");
    assertDomain(folder.deleted !== true, "failed-precondition", "La carpeta de destino está en la papelera.");
    return folder;
  }

  async function deleteStorageObject(binding) {
    const canonical = assertCanonicalStorageBinding(binding);
    try {
      await storageFile(canonical).delete({ ignoreNotFound: true });
      return true;
    } catch (error) {
      if (isStorageNotFound(error)) return false;
      throw error;
    }
  }

  async function quarantineUnsafeRecord(reference, recordType) {
    await reference.set({
      securityQuarantinedAt: FieldValue.serverTimestamp(),
      securityReason: "invalid-storage-binding",
      securityStatus: "quarantined",
      securityRecordType: String(recordType || "record").slice(0, 40),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function reservationResponse(reservation, usage) {
    return {
      availableBytes: usageResponse(usage).availableBytes,
      expiresAt: timestampToIso(reservation.expiresAt),
      extension: reservation.extension,
      fileId: reservation.fileId,
      filename: reservation.filename,
      maxBytes: CLOUD_STORAGE_CONFIG.maxStorageBytes,
      mimeType: reservation.mimeType,
      originalName: reservation.originalName,
      ownerId: reservation.ownerId,
      requestId: reservation.requestId,
      reservationId: reservation.id,
      reservedBytes: normalizeUsage(usage).reservedBytes,
      sizeBytes: reservation.expectedSizeBytes,
      status: reservation.status,
      storageName: reservation.storageName || reservation.filename,
      storagePath: reservation.storagePath,
      usedBytes: normalizeUsage(usage).usedBytes
    };
  }

  async function reserveUpload(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const requestId = optionalRequestId(payload.requestId) || crypto.randomUUID();
    const descriptor = validateFileDescriptor(payload);
    const parentFolderId = normalizeParentFolderId(payload.parentFolderId);
    const fileId = deriveStableId(uid, requestId, "file");
    const filename = descriptor.name;
    const storagePath = buildStoragePath(uid, fileId, filename);
    const reservationId = fileId;
    const operationFingerprint = fingerprint({ descriptor, parentFolderId, requestId });
    const expiresAt = Timestamp.fromMillis(now() + CLOUD_STORAGE_CONFIG.reservationTtlMs);
    const reservationReference = reservationRef(uid, reservationId);
    const usageReference = usageRef(uid);
    const parentReference = parentFolderId ? fileRef(uid, parentFolderId) : null;

    return db.runTransaction(async (transaction) => {
      const usageSnapshot = await transaction.get(usageReference);
      const reservationSnapshot = await transaction.get(reservationReference);
      const parentSnapshot = parentReference ? await transaction.get(parentReference) : null;
      await assertParentFolderSnapshot(parentSnapshot, uid, parentFolderId);

      const currentUsage = normalizeUsage(usageSnapshot.exists ? usageSnapshot.data() : {});
      if (reservationSnapshot.exists) {
        const existing = { id: reservationSnapshot.id, ...reservationSnapshot.data() };
        reservationStorageBinding(existing, uid, fileId);
        assertDomain(existing.operationFingerprint === operationFingerprint, "already-exists", "requestId ya fue utilizado con otro archivo.");
        return reservationResponse(existing, currentUsage);
      }

      const nextUsage = reserveBytes(currentUsage, descriptor.sizeBytes);
      const reservation = {
        createdAt: FieldValue.serverTimestamp(),
        expectedSizeBytes: descriptor.sizeBytes,
        expiresAt,
        extension: descriptor.extension,
        fileId,
        filename,
        id: reservationId,
        mimeType: descriptor.mimeType,
        name: descriptor.name,
        operationFingerprint,
        originalName: descriptor.originalName,
        ownerId: uid,
        parentFolderId,
        requestId,
        status: "reserved",
        sizeBytes: descriptor.sizeBytes,
        storageName: filename,
        storagePath,
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      transaction.create(reservationReference, reservation);
      return reservationResponse({ ...reservation, expiresAt }, nextUsage);
    });
  }

  function validateObjectMetadata(reservation, metadata = {}) {
    const sizeBytes = Number(metadata.size);
    const mimeType = normalizeMimeType(metadata.contentType);
    const customMetadata = metadata.metadata || {};
    assertDomain(metadata.name === reservation.storagePath, "failed-precondition", "La ruta almacenada no coincide con la reserva.", { rejectUpload: true });
    assertDomain(Number.isSafeInteger(sizeBytes) && sizeBytes === reservation.expectedSizeBytes, "failed-precondition", "El tamaño almacenado no coincide con la reserva.", { rejectUpload: true });
    assertDomain(mimeType === reservation.mimeType && allowedMimeForExtension(reservation.extension, mimeType), "failed-precondition", "El tipo MIME almacenado no coincide con la reserva.", { rejectUpload: true });
    assertDomain(customMetadata.ownerId === reservation.ownerId
      && customMetadata.fileId === reservation.fileId
      && (!customMetadata.reservationId || customMetadata.reservationId === reservation.id),
    "failed-precondition", "Los metadatos privados de la carga no coinciden con la reserva.", { rejectUpload: true });
    return {
      contentType: mimeType,
      crc32c: metadata.crc32c || "",
      generation: String(metadata.generation || ""),
      md5Hash: metadata.md5Hash || "",
      sizeBytes
    };
  }

  async function rejectReservedUpload(uid, fileId, reason = "validation-failed") {
    const reference = reservationRef(uid, fileId);
    const reservation = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;
      const current = { id: snapshot.id, ...snapshot.data() };
      reservationStorageBinding(current, uid, fileId);
      if (current.status === "rejected") return { ...current, terminal: true };
      if (current.status === "rejecting") return current;
      if (current.status !== "reserved") return { ...current, terminal: true };
      transaction.update(reference, {
        rejectionReason: String(reason || "validation-failed").slice(0, 80),
        status: "rejecting",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { ...current, status: "rejecting" };
    });
    if (!reservation) {
      return { rejected: true, releasedBytes: 0 };
    }
    if (reservation.terminal) return { rejected: reservation.status === "rejected", releasedBytes: 0, status: reservation.status };

    await deleteStorageObject(reservationStorageBinding(reservation, uid, fileId));
    return db.runTransaction(async (transaction) => {
      const usageReference = usageRef(uid);
      const usageSnapshot = await transaction.get(usageReference);
      const currentSnapshot = await transaction.get(reference);
      if (!currentSnapshot.exists) return { rejected: true, releasedBytes: 0 };
      const current = { id: currentSnapshot.id, ...(currentSnapshot.data() || {}) };
      reservationStorageBinding(current, uid, fileId);
      if (current.status !== "rejecting") return { rejected: current.status === "rejected", releasedBytes: 0 };
      const currentUsage = normalizeUsage(usageSnapshot.exists ? usageSnapshot.data() : {});
      const nextUsage = releaseReservedBytes(currentUsage, current.expectedSizeBytes);
      transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      transaction.update(reference, {
        expiresAt: null,
        rejectedAt: FieldValue.serverTimestamp(),
        rejectionReason: String(reason || "validation-failed").slice(0, 80),
        status: "rejected",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { rejected: true, releasedBytes: current.expectedSizeBytes, usage: usageResponse(nextUsage) };
    });
  }

  async function getStorageMetadata(binding) {
    try {
      const [metadata] = await storageFile(binding).getMetadata();
      return metadata;
    } catch (error) {
      if (isStorageNotFound(error)) fail("failed-precondition", "La carga todavía no está disponible en Storage.");
      throw error;
    }
  }

  async function confirmUpload(uidInput, payload = {}, eventMetadata = null) {
    const uid = validateDocumentId(uidInput, "uid");
    const fileId = validateDocumentId(payload.fileId, "fileId");
    const reservationReference = reservationRef(uid, fileId);
    const initialReservationSnapshot = await reservationReference.get();
    if (!initialReservationSnapshot.exists) fail("not-found", "No existe una reserva para esta carga.", { discardObject: true });
    const initialReservation = { id: initialReservationSnapshot.id, ...initialReservationSnapshot.data() };
    const initialStorageBinding = reservationStorageBinding(initialReservation, uid, fileId);

    async function readCommittedResult() {
      const [itemSnapshot, usageSnapshot] = await Promise.all([fileRef(uid, fileId).get(), usageRef(uid).get()]);
      if (!itemSnapshot.exists || itemSnapshot.data()?.quotaAccounted !== true) return null;
      return {
        alreadyConfirmed: true,
        file: { id: itemSnapshot.id, ...itemSnapshot.data() },
        usage: usageResponse(usageSnapshot.exists ? usageSnapshot.data() : {})
      };
    }

    if (initialReservation.status === "committed") {
      const committed = await readCommittedResult();
      assertDomain(committed, "data-loss", "La reserva está confirmada, pero faltan los metadatos del archivo.");
      return committed;
    }
    assertDomain(initialReservation.status === "reserved", "failed-precondition", "La reserva ya no acepta confirmación.", { discardObject: true });

    const metadata = eventMetadata || await getStorageMetadata(initialStorageBinding);
    let stored;
    try {
      stored = validateObjectMetadata(initialReservation, metadata);
      await validateStoredContent(storageFile(initialStorageBinding), initialReservation);
    } catch (error) {
      if (error instanceof CloudStorageDomainError && error.details?.rejectUpload) {
        await rejectReservedUpload(uid, fileId, error.details?.reason || "validation-failed");
      }
      throw error;
    }

    const commit = () => db.runTransaction(async (transaction) => {
        const usageReference = usageRef(uid);
        const itemReference = fileRef(uid, fileId);
        const usageSnapshot = await transaction.get(usageReference);
        const reservationSnapshot = await transaction.get(reservationReference);
        const itemSnapshot = await transaction.get(itemReference);
        const currentUsage = normalizeUsage(usageSnapshot.exists ? usageSnapshot.data() : {});

        if (itemSnapshot.exists && itemSnapshot.data()?.quotaAccounted === true) {
          return { alreadyConfirmed: true, file: { id: itemSnapshot.id, ...itemSnapshot.data() }, usage: usageResponse(currentUsage) };
        }
        assertDomain(reservationSnapshot.exists, "not-found", "La reserva dejó de existir durante la confirmación.");
        const reservation = { id: reservationSnapshot.id, ...reservationSnapshot.data() };
        reservationStorageBinding(reservation, uid, fileId);
        assertDomain(reservation.status === "reserved", "failed-precondition", "La reserva cambió de estado durante la confirmación.");
        assertDomain(reservation.storagePath === initialReservation.storagePath
          && reservation.expectedSizeBytes === stored.sizeBytes
          && reservation.mimeType === stored.contentType,
        "failed-precondition", "La reserva cambió durante la confirmación.");

        const nextUsage = commitReservedBytes(currentUsage, reservation.expectedSizeBytes, stored.sizeBytes);
        const item = {
          createdAt: reservation.createdAt || FieldValue.serverTimestamp(),
          deleted: false,
          deletedAt: null,
          extension: reservation.extension,
          id: fileId,
          mimeType: reservation.mimeType,
          name: reservation.name,
          nameNormalized: normalizeNameForIndex(reservation.name),
          originalName: reservation.originalName,
          ownerId: uid,
          parentFolderId: reservation.parentFolderId || null,
          quotaAccounted: true,
          reservationId: reservation.id,
          sizeBytes: stored.sizeBytes,
          sourceType: CLOUD_STORAGE_CONFIG.sourceType,
          storageCrc32c: stored.crc32c,
          storageGeneration: stored.generation,
          storageMd5Hash: stored.md5Hash,
          storageName: reservation.storageName,
          storagePath: reservation.storagePath,
          status: "ready",
          type: "file",
          updatedAt: FieldValue.serverTimestamp(),
          uploadStatus: "ready",
          validatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(itemReference, item, { merge: false });
        transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
        transaction.update(reservationReference, {
          committedAt: FieldValue.serverTimestamp(),
          expiresAt: null,
          lastFinalizeEventId: String(payload.eventId || "").slice(0, 180),
          status: "committed",
          storageGeneration: stored.generation,
          updatedAt: FieldValue.serverTimestamp()
        });
        return { alreadyConfirmed: false, file: item, usage: usageResponse(nextUsage) };
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await commit();
      } catch (error) {
        if (!isRetryableTransactionContention(error) || attempt === 4) throw error;
        const committed = await readCommittedResult();
        if (committed) return committed;
        await transactionRetryDelay(attempt);
      }
    }
    fail("aborted", "No fue posible confirmar una carga por contención transitoria.");
  }

  async function cancelUpload(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const fileId = validateDocumentId(payload.fileId, "fileId");
    const reference = reservationRef(uid, fileId);
    const initial = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;
      const reservation = { id: snapshot.id, ...snapshot.data() };
      reservationStorageBinding(reservation, uid, fileId);
      if (["cancelled", "expired", "rejected"].includes(reservation.status)) return { ...reservation, terminal: true };
      assertDomain(reservation.status !== "committed" && reservation.status !== "deleted", "failed-precondition", "Una carga confirmada no puede cancelarse.");
      assertDomain(["reserved", "cancelling"].includes(reservation.status), "failed-precondition", "La reserva está siendo terminada por otra operación.");
      if (reservation.status === "reserved") transaction.update(reference, {
        status: "cancelling",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { ...reservation, status: "cancelling" };
    });
    if (!initial) return { alreadyCancelled: true, cancelled: true, fileId };
    if (initial.terminal) return { alreadyCancelled: true, cancelled: true, fileId };
    await deleteStorageObject(reservationStorageBinding(initial, uid, fileId));

    return db.runTransaction(async (transaction) => {
      const usageReference = usageRef(uid);
      const usageSnapshot = await transaction.get(usageReference);
      const reservationSnapshot = await transaction.get(reference);
      if (!reservationSnapshot.exists) return { alreadyCancelled: true, cancelled: true, fileId };
      const reservation = { id: reservationSnapshot.id, ...(reservationSnapshot.data() || {}) };
      reservationStorageBinding(reservation, uid, fileId);
      if (reservation.status !== "cancelling") {
        assertDomain(reservation.status !== "committed", "failed-precondition", "La carga se confirmó mientras se cancelaba.");
        return { alreadyCancelled: true, cancelled: true, fileId };
      }
      const nextUsage = releaseReservedBytes(usageSnapshot.exists ? usageSnapshot.data() : {}, reservation.expectedSizeBytes);
      transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      transaction.update(reference, {
        cancelledAt: FieldValue.serverTimestamp(),
        expiresAt: null,
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { alreadyCancelled: false, cancelled: true, fileId, usage: usageResponse(nextUsage) };
    });
  }

  async function createFolder(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const requestId = optionalRequestId(payload.requestId) || crypto.randomUUID();
    const name = validateFolderName(payload.name);
    const parentFolderId = normalizeParentFolderId(payload.parentFolderId);
    const folderId = deriveStableId(uid, requestId, "folder");
    const reference = fileRef(uid, folderId);
    const parentReference = parentFolderId ? fileRef(uid, parentFolderId) : null;
    const operationFingerprint = fingerprint({ name, parentFolderId, requestId });

    return db.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(reference);
      const parentSnapshot = parentReference ? await transaction.get(parentReference) : null;
      await assertParentFolderSnapshot(parentSnapshot, uid, parentFolderId);
      if (existingSnapshot.exists) {
        const existing = { id: existingSnapshot.id, ...existingSnapshot.data() };
        assertOwner(existing, uid);
        assertDomain(existing.type === "folder" && existing.operationFingerprint === operationFingerprint,
          "already-exists", "requestId ya fue utilizado para otra carpeta.");
        return { alreadyCreated: true, folder: existing };
      }
      const folder = {
        createdAt: FieldValue.serverTimestamp(),
        deleted: false,
        deletedAt: null,
        id: folderId,
        name,
        nameNormalized: normalizeNameForIndex(name),
        operationFingerprint,
        ownerId: uid,
        parentFolderId,
        sourceType: CLOUD_STORAGE_CONFIG.sourceType,
        type: "folder",
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.create(reference, folder);
      return { alreadyCreated: false, folder };
    });
  }

  async function renameItem(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const itemId = validateDocumentId(payload.itemId, "itemId");
    const reference = fileRef(uid, itemId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      assertDomain(snapshot.exists, "not-found", "El elemento no existe.");
      const item = { id: snapshot.id, ...snapshot.data() };
      assertOwner(item, uid);
      assertDomain(item.deleted !== true, "failed-precondition", "Restaura el elemento antes de renombrarlo.");
      const name = validateRenameForItem(item, payload.name);
      if (name === item.name) return { alreadyRenamed: true, item };
      const nameNormalized = normalizeNameForIndex(name);
      transaction.update(reference, { name, nameNormalized, updatedAt: FieldValue.serverTimestamp() });
      return { alreadyRenamed: false, item: { ...item, name, nameNormalized } };
    });
  }

  async function loadAncestorChain(uid, startFolderId) {
    const chain = [];
    const visited = new Set();
    let currentId = startFolderId;
    while (currentId) {
      assertDomain(!visited.has(currentId), "data-loss", "La jerarquía de carpetas contiene un ciclo.");
      assertDomain(chain.length < CLOUD_STORAGE_CONFIG.maxFolderTraversalItems, "resource-exhausted", "La jerarquía es demasiado extensa para procesarla en una sola operación.");
      visited.add(currentId);
      const snapshot = await fileRef(uid, currentId).get();
      assertDomain(snapshot.exists, "not-found", "Una carpeta de la ruta de destino ya no existe.");
      const folder = { id: snapshot.id, ...snapshot.data() };
      assertOwner(folder, uid);
      assertDomain(folder.type === "folder" && folder.deleted !== true, "failed-precondition", "La ruta de destino no es una carpeta activa.");
      chain.push(folder);
      currentId = folder.parentFolderId || null;
    }
    return chain;
  }

  async function moveItem(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const itemId = validateDocumentId(payload.itemId, "itemId");
    const parentFolderId = normalizeParentFolderId(payload.parentFolderId);
    assertDomain(itemId !== parentFolderId, "invalid-argument", "Una carpeta no puede contenerse a sí misma.");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const chain = parentFolderId ? await loadAncestorChain(uid, parentFolderId) : [];
      assertDomain(!chain.some((folder) => folder.id === itemId), "invalid-argument", "No se puede mover una carpeta dentro de uno de sus descendientes.");
      try {
        return await db.runTransaction(async (transaction) => {
          const itemReference = fileRef(uid, itemId);
          const itemSnapshot = await transaction.get(itemReference);
          const chainSnapshots = [];
          for (const folder of chain) chainSnapshots.push(await transaction.get(fileRef(uid, folder.id)));
          assertDomain(itemSnapshot.exists, "not-found", "El elemento no existe.");
          const item = { id: itemSnapshot.id, ...itemSnapshot.data() };
          assertOwner(item, uid);
          assertDomain(item.deleted !== true, "failed-precondition", "Restaura el elemento antes de moverlo.");
          for (let index = 0; index < chain.length; index += 1) {
            const current = chainSnapshots[index]?.data() || {};
            const expected = chain[index];
            if (current.parentFolderId !== expected.parentFolderId || current.deleted === true || current.type !== "folder") {
              fail("aborted", "La jerarquía cambió durante el movimiento; vuelve a intentarlo.");
            }
          }
          if ((item.parentFolderId || null) === parentFolderId) return { alreadyMoved: true, item };
          transaction.update(itemReference, { parentFolderId, updatedAt: FieldValue.serverTimestamp() });
          return { alreadyMoved: false, item: { ...item, parentFolderId } };
        });
      } catch (error) {
        if (!(error instanceof CloudStorageDomainError) || error.code !== "aborted" || attempt === 2) throw error;
      }
    }
    fail("aborted", "No fue posible estabilizar la jerarquía para mover el elemento.");
  }

  async function collectDescendants(uid, rootId) {
    const descendants = [];
    const queue = [{ id: rootId, depth: 0 }];
    const visited = new Set([rootId]);
    while (queue.length) {
      const parent = queue.shift();
      const snapshot = await filesCollection(uid).where("parentFolderId", "==", parent.id).get();
      for (const document of snapshot.docs) {
        if (visited.has(document.id)) fail("data-loss", "La jerarquía de carpetas contiene un ciclo.");
        visited.add(document.id);
        const item = { id: document.id, depth: parent.depth + 1, ...document.data() };
        assertOwner(item, uid);
        descendants.push(item);
        if (item.type === "folder") queue.push({ id: item.id, depth: item.depth });
        assertDomain(descendants.length <= CLOUD_STORAGE_CONFIG.maxFolderTraversalItems, "resource-exhausted", "La carpeta contiene demasiados elementos para una sola operación.");
      }
    }
    return descendants;
  }

  async function commitBatches(operations, applyOperation) {
    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = db.batch();
      operations.slice(offset, offset + 400).forEach((operation) => applyOperation(batch, operation));
      await batch.commit();
    }
  }

  async function trashItem(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const itemId = validateDocumentId(payload.itemId, "itemId");
    const rootSnapshot = await fileRef(uid, itemId).get();
    assertDomain(rootSnapshot.exists, "not-found", "El elemento no existe.");
    const root = { id: rootSnapshot.id, ...rootSnapshot.data() };
    assertOwner(root, uid);
    if (root.deleted === true && root.type !== "folder") return { alreadyTrashed: true, affectedItems: 0, itemId };
    const descendants = root.type === "folder" ? await collectDescendants(uid, itemId) : [];
    const targets = [root, ...descendants].filter((item) => item.deleted !== true);
    await commitBatches(targets, (batch, item) => batch.update(fileRef(uid, item.id), {
      deleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      trashRootId: itemId,
      updatedAt: FieldValue.serverTimestamp()
    }));
    return { alreadyTrashed: targets.length === 0, affectedItems: targets.length, itemId };
  }

  async function listAllDocuments(collectionReference) {
    const documents = [];
    let cursor = null;
    do {
      let query = collectionReference.orderBy(FieldPath.documentId()).limit(CLOUD_STORAGE_CONFIG.reconciliationPageSize);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      documents.push(...snapshot.docs);
      cursor = snapshot.size === CLOUD_STORAGE_CONFIG.reconciliationPageSize ? snapshot.docs[snapshot.docs.length - 1] : null;
    } while (cursor);
    return documents;
  }

  async function restoreItem(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const itemId = validateDocumentId(payload.itemId, "itemId");
    const rootReference = fileRef(uid, itemId);
    const rootSnapshot = await rootReference.get();
    assertDomain(rootSnapshot.exists, "not-found", "El elemento no existe.");
    const root = { id: rootSnapshot.id, ...rootSnapshot.data() };
    assertOwner(root, uid);
    if (root.deleted !== true && root.type !== "folder") return { alreadyRestored: true, affectedItems: 0, itemId };
    if (root.type === "file") {
      assertDomain(root.quotaAccounted === true && root.uploadStatus === "ready", "failed-precondition", "El archivo físico ya no está disponible para restaurarlo.");
    }

    let restoredParentFolderId = root.parentFolderId || null;
    if (restoredParentFolderId) {
      const parentSnapshot = await fileRef(uid, restoredParentFolderId).get();
      const parent = parentSnapshot.exists ? parentSnapshot.data() : null;
      if (!parent || parent.ownerId !== uid || parent.type !== "folder" || parent.deleted === true) restoredParentFolderId = null;
    }

    const querySnapshot = await filesCollection(uid).where("trashRootId", "==", itemId).get();
    const targets = querySnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    if (root.deleted === true && !targets.some((item) => item.id === itemId)) targets.push(root);
    if (!targets.length) return { alreadyRestored: true, affectedItems: 0, itemId };
    await commitBatches(targets, (batch, item) => {
      const update = {
        deleted: false,
        deletedAt: null,
        trashRootId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      };
      if (item.id === itemId) update.parentFolderId = restoredParentFolderId;
      batch.update(fileRef(uid, item.id), update);
    });
    return { alreadyRestored: false, affectedItems: targets.length, itemId, parentFolderId: restoredParentFolderId };
  }

  async function finalizeFileDeletion(uid, itemId) {
    const reference = fileRef(uid, itemId);
    const initialSnapshot = await reference.get();
    if (!initialSnapshot.exists) return { alreadyDeleted: true, releasedBytes: 0 };
    const initial = { id: initialSnapshot.id, ...initialSnapshot.data() };
    const initialStorageBinding = itemStorageBinding(initial, uid, itemId);
    assertDomain(initial.type === "file", "failed-precondition", "El elemento no es un archivo.");

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      itemStorageBinding({ id: snapshot.id, ...(snapshot.data() || {}) }, uid, itemId);
      transaction.update(reference, { deletionState: "pending", updatedAt: FieldValue.serverTimestamp() });
    });
    await deleteStorageObject(initialStorageBinding);

    return db.runTransaction(async (transaction) => {
      const usageReference = usageRef(uid);
      const reservationReference = reservationRef(uid, itemId);
      const usageSnapshot = await transaction.get(usageReference);
      const itemSnapshot = await transaction.get(reference);
      const reservationSnapshot = await transaction.get(reservationReference);
      if (!itemSnapshot.exists) return { alreadyDeleted: true, releasedBytes: 0 };
      const item = { id: itemSnapshot.id, ...(itemSnapshot.data() || {}) };
      itemStorageBinding(item, uid, itemId);
      let nextUsage = normalizeUsage(usageSnapshot.exists ? usageSnapshot.data() : {});
      let releasedBytes = 0;
      if (item.quotaAccounted === true) {
        releasedBytes = Number(item.sizeBytes) || 0;
        nextUsage = releaseUsedBytes(nextUsage, releasedBytes);
        transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      }
      transaction.delete(reference);
      if (reservationSnapshot.exists) transaction.update(reservationReference, {
        deletedAt: FieldValue.serverTimestamp(),
        expiresAt: null,
        status: "deleted",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { alreadyDeleted: false, releasedBytes, usage: usageResponse(nextUsage) };
    });
  }

  async function permanentlyDeleteItem(uidInput, payload = {}) {
    const uid = validateDocumentId(uidInput, "uid");
    const itemId = validateDocumentId(payload.itemId, "itemId");
    const rootSnapshot = await fileRef(uid, itemId).get();
    if (!rootSnapshot.exists) return { alreadyDeleted: true, deleted: true, itemId, releasedBytes: 0 };
    const root = { id: rootSnapshot.id, depth: 0, ...rootSnapshot.data() };
    assertOwner(root, uid);
    assertDomain(root.deleted === true, "failed-precondition", "El elemento debe estar en la papelera antes de eliminarlo definitivamente.");

    const descendants = root.type === "folder" ? await collectDescendants(uid, itemId) : [];
    const allItems = [root, ...descendants];
    const files = allItems.filter((item) => item.type === "file");
    const deletionResults = await mapLimit(files, 4, (item) => finalizeFileDeletion(uid, item.id));
    const releasedBytes = deletionResults.reduce((sum, result) => sum + (Number(result?.releasedBytes) || 0), 0);
    const remaining = allItems.filter((item) => item.type !== "file").sort((left, right) => right.depth - left.depth);
    await commitBatches(remaining, (batch, item) => batch.delete(fileRef(uid, item.id)));
    return { alreadyDeleted: false, deleted: true, deletedItems: allItems.length, itemId, releasedBytes };
  }

  async function expireReservation(uidInput, fileIdInput) {
    const uid = validateDocumentId(uidInput, "uid");
    const fileId = validateDocumentId(fileIdInput, "fileId");
    const reference = reservationRef(uid, fileId);
    const initial = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return null;
      const reservation = { id: snapshot.id, ...snapshot.data() };
      reservationStorageBinding(reservation, uid, fileId);
      if (reservation.status === "expiring") return reservation;
      if (reservation.status !== "reserved" || timestampToMillis(reservation.expiresAt) > now()) return { ...reservation, terminal: true };
      transaction.update(reference, { status: "expiring", updatedAt: FieldValue.serverTimestamp() });
      return { ...reservation, status: "expiring" };
    });
    if (!initial) return { expired: false, reason: "missing" };
    if (initial.terminal) return { expired: false, reason: "not-expired" };
    await deleteStorageObject(reservationStorageBinding(initial, uid, fileId));
    return db.runTransaction(async (transaction) => {
      const usageReference = usageRef(uid);
      const usageSnapshot = await transaction.get(usageReference);
      const reservationSnapshot = await transaction.get(reference);
      if (!reservationSnapshot.exists) return { expired: false, reason: "missing" };
      const reservation = { id: reservationSnapshot.id, ...(reservationSnapshot.data() || {}) };
      reservationStorageBinding(reservation, uid, fileId);
      if (reservation.status !== "expiring") return { expired: false, reason: "state-changed" };
      const nextUsage = releaseReservedBytes(usageSnapshot.exists ? usageSnapshot.data() : {}, reservation.expectedSizeBytes);
      transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      transaction.update(reference, {
        expiredAt: FieldValue.serverTimestamp(),
        expiresAt: null,
        status: "expired",
        updatedAt: FieldValue.serverTimestamp()
      });
      return { expired: true, fileId, releasedBytes: reservation.expectedSizeBytes };
    });
  }

  async function handleFinalizedObject(metadata = {}, eventId = "") {
    const parsed = parseStoragePath(metadata.name);
    if (!parsed) return { ignored: true };
    try {
      return await confirmUpload(parsed.uid, { eventId, fileId: parsed.fileId }, metadata);
    } catch (error) {
      if (error instanceof CloudStorageDomainError && error.code === "failed-precondition"
        && !error.details?.discardObject && !error.details?.rejectUpload) {
        const [latestReservation, latestItem] = await Promise.all([
          reservationRef(parsed.uid, parsed.fileId).get(),
          fileRef(parsed.uid, parsed.fileId).get()
        ]);
        const latestStatus = latestReservation.exists ? latestReservation.data()?.status : "missing";
        if (latestStatus === "committed" && latestItem.exists && latestItem.data()?.quotaAccounted === true) {
          return { alreadyProcessed: true, fileId: parsed.fileId };
        }
        if (latestStatus !== "reserved") {
          await deleteStorageObject(parsedStorageBinding(parsed));
          return { discarded: true, fileId: parsed.fileId, reason: "reservation-state-changed" };
        }
      }
      if (error instanceof CloudStorageDomainError && (error.details?.discardObject || error.details?.rejectUpload
        || ["not-found", "invalid-argument"].includes(error.code))) {
        await rejectReservedUpload(parsed.uid, parsed.fileId, error.details?.reason || error.code).catch(() => null);
        await deleteStorageObject(parsedStorageBinding(parsed));
        return { fileId: parsed.fileId, rejected: true, reason: error.code };
      }
      throw error;
    }
  }

  async function handleDeletedObject(storagePath, eventId = "") {
    const parsed = parseStoragePath(storagePath);
    if (!parsed) return { ignored: true };
    return db.runTransaction(async (transaction) => {
      const itemReference = fileRef(parsed.uid, parsed.fileId);
      const usageReference = usageRef(parsed.uid);
      const reservationReference = reservationRef(parsed.uid, parsed.fileId);
      const itemSnapshot = await transaction.get(itemReference);
      const usageSnapshot = await transaction.get(usageReference);
      const reservationSnapshot = await transaction.get(reservationReference);
      if (!itemSnapshot.exists) return { alreadyProcessed: true, fileId: parsed.fileId };
      const item = { id: itemSnapshot.id, ...(itemSnapshot.data() || {}) };
      if (item.storagePath !== parsed.storagePath) return { ignored: true, reason: "path-mismatch" };
      try {
        itemStorageBinding(item, parsed.uid, parsed.fileId);
      } catch (error) {
        if (!isUnsafeStorageBindingError(error)) throw error;
        transaction.set(itemReference, {
          securityQuarantinedAt: FieldValue.serverTimestamp(),
          securityReason: "invalid-storage-binding",
          securityStatus: "quarantined",
          securityRecordType: "cloud-file",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return { ignored: true, reason: "unsafe-record-quarantined" };
      }
      let nextUsage = normalizeUsage(usageSnapshot.exists ? usageSnapshot.data() : {});
      let releasedBytes = 0;
      if (item.quotaAccounted === true) {
        releasedBytes = Number(item.sizeBytes) || 0;
        nextUsage = releaseUsedBytes(nextUsage, releasedBytes);
        transaction.set(usageReference, usageWrite(nextUsage), { merge: true });
      }
      if (item.deleted === true || item.deletionState === "pending") {
        transaction.delete(itemReference);
        if (reservationSnapshot.exists) transaction.update(reservationReference, {
          deletedAt: FieldValue.serverTimestamp(),
          expiresAt: null,
          lastDeleteEventId: String(eventId || "").slice(0, 180),
          status: "deleted",
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        transaction.update(itemReference, {
          lastDeleteEventId: String(eventId || "").slice(0, 180),
          quotaAccounted: false,
          storageMissingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          uploadStatus: "missing"
        });
      }
      return { fileId: parsed.fileId, releasedBytes, usage: usageResponse(nextUsage) };
    });
  }

  async function reconcileUsage(uidInput) {
    const uid = validateDocumentId(uidInput, "uid");
    const stats = { expiredReservations: 0, missingFiles: 0, orphanObjects: 0, sizeMismatches: 0, unsafeRecords: 0 };
    const initialFiles = await listAllDocuments(filesCollection(uid));
    const initialReservations = await listAllDocuments(reservationsCollection(uid));
    const itemsById = new Map(initialFiles.map((document) => [document.id, { id: document.id, ...document.data() }]));
    const reservationsById = new Map(initialReservations.map((document) => [document.id, { id: document.id, ...document.data() }]));

    const accountedFiles = [...itemsById.values()].filter((item) => item.type === "file" && item.quotaAccounted === true);
    await mapLimit(accountedFiles, CLOUD_STORAGE_CONFIG.storageValidationConcurrency, async (item) => {
      let binding;
      try {
        binding = itemStorageBinding(item, uid, item.id);
      } catch (error) {
        if (!isUnsafeStorageBindingError(error)) throw error;
        stats.unsafeRecords += 1;
        await quarantineUnsafeRecord(fileRef(uid, item.id), "cloud-file");
        logger.error?.("[MI_NUBE] Registro de archivo puesto en cuarentena por ruta no canónica");
        return;
      }
      try {
        const [metadata] = await storageFile(binding).getMetadata();
        if (Number(metadata.size) !== Number(item.sizeBytes) || normalizeMimeType(metadata.contentType) !== item.mimeType) {
          stats.sizeMismatches += 1;
          await deleteStorageObject(binding);
          await handleDeletedObject(binding.storagePath, "reconciliation-size-mismatch");
        }
      } catch (error) {
        if (!isStorageNotFound(error)) throw error;
        stats.missingFiles += 1;
        await handleDeletedObject(binding.storagePath, "reconciliation-missing");
      }
    });

    const interruptedTerminations = [...reservationsById.values()].filter((reservation) => ["cancelling", "rejecting", "expiring"].includes(reservation.status));
    for (const reservation of interruptedTerminations) {
      try {
        if (reservation.status === "cancelling") await cancelUpload(uid, { fileId: reservation.id });
        else if (reservation.status === "rejecting") await rejectReservedUpload(uid, reservation.id, reservation.rejectionReason || "validation-failed");
        else await expireReservation(uid, reservation.id);
      } catch (error) {
        if (!isUnsafeStorageBindingError(error)) throw error;
        stats.unsafeRecords += 1;
        await quarantineUnsafeRecord(reservationRef(uid, reservation.id), "upload-reservation");
        logger.error?.("[MI_NUBE] Reserva puesta en cuarentena por ruta no canónica");
      }
    }

    const expired = [...reservationsById.values()].filter((reservation) => reservation.status === "reserved"
      && timestampToMillis(reservation.expiresAt) > 0 && timestampToMillis(reservation.expiresAt) <= now());
    for (const reservation of expired) {
      try {
        const result = await expireReservation(uid, reservation.id);
        if (result.expired) stats.expiredReservations += 1;
      } catch (error) {
        if (!isUnsafeStorageBindingError(error)) throw error;
        stats.unsafeRecords += 1;
        await quarantineUnsafeRecord(reservationRef(uid, reservation.id), "upload-reservation");
        logger.error?.("[MI_NUBE] Reserva expirada puesta en cuarentena por ruta no canónica");
      }
    }

    const prefix = `${CLOUD_STORAGE_CONFIG.storageRoot}/${uid}/${CLOUD_STORAGE_CONFIG.filesSegment}/`;
    const [objects] = await bucket.getFiles({ prefix });
    await mapLimit(objects, CLOUD_STORAGE_CONFIG.storageValidationConcurrency, async (object) => {
      const parsed = parseStoragePath(object.name);
      if (!parsed) return;
      const item = itemsById.get(parsed.fileId);
      const reservation = reservationsById.get(parsed.fileId);
      const objectIsExpected = item?.storagePath === object.name
        || (reservation?.storagePath === object.name && reservation.status === "reserved" && timestampToMillis(reservation.expiresAt) > now());
      if (!objectIsExpected) {
        const [liveItemSnapshot, liveReservationSnapshot] = await Promise.all([
          fileRef(uid, parsed.fileId).get(),
          reservationRef(uid, parsed.fileId).get()
        ]);
        const liveItem = liveItemSnapshot.exists ? liveItemSnapshot.data() : null;
        const liveReservation = liveReservationSnapshot.exists ? liveReservationSnapshot.data() : null;
        const stillOrphan = liveItem?.storagePath !== object.name
          && !(liveReservation?.storagePath === object.name
            && ["reserved", "cancelling", "rejecting", "expiring"].includes(liveReservation.status));
        if (stillOrphan) {
          stats.orphanObjects += 1;
          await deleteStorageObject(parsedStorageBinding(parsed));
        }
      }
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const baselineUsageSnapshot = await usageRef(uid).get();
      const baselineUsage = normalizeUsage(baselineUsageSnapshot.exists ? baselineUsageSnapshot.data() : {});
      const [freshFiles, freshReservations] = await Promise.all([
        listAllDocuments(filesCollection(uid)),
        listAllDocuments(reservationsCollection(uid))
      ]);
      const expectedUsedBytes = freshFiles.reduce((sum, document) => {
        const item = document.data() || {};
        return sum + (item.type === "file" && item.quotaAccounted === true ? Number(item.sizeBytes) || 0 : 0);
      }, 0);
      const expectedReservedBytes = freshReservations.reduce((sum, document) => {
        const reservation = document.data() || {};
        return sum + (["reserved", "cancelling", "rejecting", "expiring"].includes(reservation.status)
          ? Number(reservation.expectedSizeBytes) || 0 : 0);
      }, 0);
      try {
        const finalUsage = await db.runTransaction(async (transaction) => {
          const reference = usageRef(uid);
          const snapshot = await transaction.get(reference);
          const current = normalizeUsage(snapshot.exists ? snapshot.data() : {});
          if (current.revision !== baselineUsage.revision) fail("aborted", "La cuota cambió durante la reconciliación.");
          const reconciled = reconcileBytes(current, expectedUsedBytes, expectedReservedBytes);
          transaction.set(reference, {
            ...usageWrite(reconciled),
            lastReconciledAt: FieldValue.serverTimestamp()
          }, { merge: true });
          return reconciled;
        });
        return { stats, usage: usageResponse(finalUsage) };
      } catch (error) {
        if (!(error instanceof CloudStorageDomainError) || error.code !== "aborted" || attempt === 2) throw error;
      }
    }
    fail("aborted", "No se pudo reconciliar una cuota que cambia continuamente.");
  }

  async function cleanupExpiredReservations() {
    const nowTimestamp = Timestamp.fromMillis(now());
    const snapshot = await db.collectionGroup(CLOUD_STORAGE_CONFIG.reservationsCollection)
      .where("status", "in", ["reserved", "cancelling", "rejecting", "expiring"])
      .where("expiresAt", "<=", nowTimestamp)
      .limit(CLOUD_STORAGE_CONFIG.reservationCleanupLimit)
      .get();
    let expired = 0;
    let failed = 0;
    await mapLimit(snapshot.docs, 8, async (document) => {
      const segments = document.ref.path.split("/");
      if (segments.length !== 4 || segments[0] !== CLOUD_STORAGE_CONFIG.usersCollection
        || segments[2] !== CLOUD_STORAGE_CONFIG.reservationsCollection) return;
      try {
        const status = document.data()?.status;
        const result = status === "cancelling"
          ? await cancelUpload(segments[1], { fileId: document.id })
          : status === "rejecting"
            ? await rejectReservedUpload(segments[1], document.id, document.data()?.rejectionReason || "validation-failed")
            : await expireReservation(segments[1], document.id);
        if (result.expired) expired += 1;
      } catch (error) {
        failed += 1;
        if (isUnsafeStorageBindingError(error)) {
          await quarantineUnsafeRecord(document.ref, "upload-reservation").catch(() => null);
        }
        logger.error?.("[MI_NUBE] No se pudo vencer una reserva", { code: error?.code || error?.name || "error" });
      }
    });
    return { examined: snapshot.size, expired, failed };
  }

  return {
    cancelUpload,
    cleanupExpiredReservations,
    confirmUpload,
    createFolder,
    expireReservation,
    handleDeletedObject,
    handleFinalizedObject,
    moveItem,
    permanentlyDeleteItem,
    reconcileUsage,
    rejectReservedUpload,
    renameItem,
    reserveUpload,
    restoreItem,
    trashItem
  };
}

module.exports = {
  createCloudStorageService,
  isRetryableTransactionContention,
  isStorageNotFound,
  mapLimit,
  timestampToIso,
  timestampToMillis
};
