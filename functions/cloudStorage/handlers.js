"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onObjectDeleted, onObjectFinalized } = require("firebase-functions/storage");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { CLOUD_STORAGE_CONFIG } = require("./config");
const { CloudStorageDomainError } = require("./errors");
const { createCloudStorageService } = require("./service");
const { parseStoragePath } = require("./validation");
const { accountDeletionTombstonePath } = require("../accountSecurity/accountDeletion");

if (!admin.apps.length) admin.initializeApp();

let serviceInstance = null;

function getService() {
  if (!serviceInstance) serviceInstance = createCloudStorageService({
    admin,
    bucket: admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket),
    db: admin.firestore(),
    logger
  });
  return serviceInstance;
}

const CALLABLE_OPTIONS = Object.freeze({
  memory: "512MiB",
  region: CLOUD_STORAGE_CONFIG.region,
  timeoutSeconds: 120
});

const LONG_CALLABLE_OPTIONS = Object.freeze({
  memory: "1GiB",
  region: CLOUD_STORAGE_CONFIG.region,
  timeoutSeconds: 540
});

const EVENT_OPTIONS = Object.freeze({
  bucket: CLOUD_STORAGE_CONFIG.bucket,
  memory: "512MiB",
  region: CLOUD_STORAGE_CONFIG.region,
  retry: true,
  timeoutSeconds: 540
});

const VALID_HTTPS_CODES = new Set([
  "aborted",
  "already-exists",
  "cancelled",
  "data-loss",
  "deadline-exceeded",
  "failed-precondition",
  "internal",
  "invalid-argument",
  "not-found",
  "out-of-range",
  "permission-denied",
  "resource-exhausted",
  "unauthenticated",
  "unavailable",
  "unimplemented",
  "unknown"
]);

function authenticatedUid(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión para usar Mi nube.");
  return request.auth.uid;
}

async function accountDeletionStatus(uid) {
  const tombstone = await admin.firestore().doc(accountDeletionTombstonePath(uid)).get();
  if (!tombstone.exists) return { active: true, cleanupAllowed: false };
  const data = tombstone.data() || {};
  const phase = String(data.deletionPhase || "").trim().toLowerCase();
  return {
    active: false,
    cleanupAllowed: phase !== "preflight"
  };
}

async function assertActiveAccount(uid) {
  if (!(await accountDeletionStatus(uid)).active) {
    throw new HttpsError("failed-precondition", "La cuenta está en proceso de eliminación.");
  }
}

async function cleanupCloudResidueAfterDeletion(uid) {
  const db = admin.firestore();
  const bucket = admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket);
  await db.recursiveDelete(db.doc(`usuarios/${uid}`));
  for (const prefix of [`mi-nube/${uid}/`, `usuarios/${uid}/`]) {
    const [files] = await bucket.getFiles({ prefix });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  }
}

function storageEventTarget(storagePath) {
  const cloudPath = parseStoragePath(storagePath);
  if (cloudPath) return { ...cloudPath, cloudManaged: true };
  const profilePhotoMatch = String(storagePath || "")
    .match(/^usuarios\/([^/]+)\/perfil\/foto-perfil$/u);
  if (!profilePhotoMatch) return null;
  return {
    cloudManaged: false,
    storagePath: profilePhotoMatch[0],
    uid: profilePhotoMatch[1]
  };
}

function toHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof CloudStorageDomainError) {
    const code = VALID_HTTPS_CODES.has(error.code) ? error.code : "failed-precondition";
    return new HttpsError(code, error.message, error.details || {});
  }
  logger.error("[MI_NUBE] Error interno", {
    code: error?.code || error?.name || "error"
  });
  return new HttpsError("internal", "No fue posible completar la operación de Mi nube.");
}

function callableValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((item) => callableValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return null;
    if (/Transform$/u.test(value.constructor?.name || "") || value._methodName) return null;
    seen.add(value);
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item !== undefined) output[key] = callableValue(item, seen);
    });
    seen.delete(value);
    return output;
  }
  return null;
}

function wrapCallable(operation) {
  return async (request) => {
    let uid = "";
    let deletionCleanupCompleted = false;
    try {
      uid = authenticatedUid(request);
      await assertActiveAccount(uid);
      const result = await operation(uid, request.data || {}, request);
      const statusAfterOperation = await accountDeletionStatus(uid);
      if (!statusAfterOperation.active) {
        if (statusAfterOperation.cleanupAllowed) {
          await cleanupCloudResidueAfterDeletion(uid);
          deletionCleanupCompleted = true;
        }
        throw new HttpsError("failed-precondition", "La cuenta entró en eliminación durante la operación.");
      }
      return callableValue(result);
    } catch (error) {
      if (uid && !deletionCleanupCompleted) {
        try {
          const deletionStatus = await accountDeletionStatus(uid);
          if (!deletionStatus.active && deletionStatus.cleanupAllowed) {
            await cleanupCloudResidueAfterDeletion(uid);
            deletionCleanupCompleted = true;
          }
        } catch (cleanupError) {
          logger.error("[MI_NUBE] No fue posible completar la limpieza posterior a la eliminación", {
            code: cleanupError?.code || cleanupError?.name || "error"
          });
        }
      }
      throw toHttpsError(error);
    }
  };
}

const reserveCloudUpload = onCall(CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().reserveUpload(uid, data)));
const confirmCloudUpload = onCall(LONG_CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().confirmUpload(uid, data)));
const cancelCloudUpload = onCall(CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().cancelUpload(uid, data)));
const createCloudFolder = onCall(CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().createFolder(uid, data)));
const renameCloudItem = onCall(CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().renameItem(uid, data)));
const moveCloudItem = onCall(CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().moveItem(uid, data)));
const trashCloudItem = onCall(LONG_CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().trashItem(uid, data)));
const restoreCloudItem = onCall(LONG_CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().restoreItem(uid, data)));
const permanentlyDeleteCloudItem = onCall(LONG_CALLABLE_OPTIONS, wrapCallable((uid, data) => getService().permanentlyDeleteItem(uid, data)));
const reconcileCloudStorageUsage = onCall(LONG_CALLABLE_OPTIONS, wrapCallable((uid) => getService().reconcileUsage(uid)));

const cloudFileFinalized = onObjectFinalized(EVENT_OPTIONS, async (event) => {
  const object = event.data || {};
  const target = storageEventTarget(object.name);
  const statusBeforeEvent = target
    ? await accountDeletionStatus(target.uid)
    : { active: true, cleanupAllowed: false };
  if (!statusBeforeEvent.active && statusBeforeEvent.cleanupAllowed) {
    await admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket)
      .file(target.storagePath)
      .delete({ ignoreNotFound: true });
    logger.info("[MI_NUBE] Objeto descartado porque la cuenta está bloqueada para eliminación.");
    return;
  }
  if (target && !target.cloudManaged) {
    const statusAfterEvent = await accountDeletionStatus(target.uid);
    if (!statusAfterEvent.active && statusAfterEvent.cleanupAllowed) {
      await admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket)
        .file(target.storagePath)
        .delete({ ignoreNotFound: true });
    }
    return;
  }
  const result = await getService().handleFinalizedObject(object, event.id || "");
  if (target) {
    const statusAfterEvent = await accountDeletionStatus(target.uid);
    if (!statusAfterEvent.active && statusAfterEvent.cleanupAllowed) {
      await admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket)
        .file(target.storagePath)
        .delete({ ignoreNotFound: true });
      await cleanupCloudResidueAfterDeletion(target.uid);
      return;
    }
  }
  if (result?.ignored !== true) logger.info("[MI_NUBE] Evento de archivo finalizado procesado", {
    rejected: result?.rejected === true
  });
});

const cloudFileDeleted = onObjectDeleted(EVENT_OPTIONS, async (event) => {
  const storagePath = event.data?.name || "";
  const target = storageEventTarget(storagePath);
  const statusBeforeEvent = target
    ? await accountDeletionStatus(target.uid)
    : { active: true, cleanupAllowed: false };
  if (!statusBeforeEvent.active && statusBeforeEvent.cleanupAllowed) {
    logger.info("[MI_NUBE] Evento de borrado ignorado porque la cuenta está bloqueada para eliminación.");
    return;
  }
  if (target && !target.cloudManaged) return;
  const result = await getService().handleDeletedObject(storagePath, event.id || "");
  if (target) {
    const statusAfterEvent = await accountDeletionStatus(target.uid);
    if (!statusAfterEvent.active && statusAfterEvent.cleanupAllowed) {
      await cleanupCloudResidueAfterDeletion(target.uid);
      return;
    }
  }
  if (result?.ignored !== true) logger.info("[MI_NUBE] Evento de archivo eliminado procesado", {
    releasedBytes: Number(result?.releasedBytes) || 0
  });
});

const cleanupExpiredCloudReservations = onSchedule({
  memory: "512MiB",
  region: CLOUD_STORAGE_CONFIG.region,
  retryCount: 3,
  schedule: "every 60 minutes",
  timeoutSeconds: 540
}, async () => {
  const result = await getService().cleanupExpiredReservations();
  logger.info("[MI_NUBE] Limpieza de reservas completada", result);
});

module.exports = {
  cancelCloudUpload,
  cleanupExpiredCloudReservations,
  cloudFileDeleted,
  cloudFileFinalized,
  confirmCloudUpload,
  createCloudFolder,
  moveCloudItem,
  permanentlyDeleteCloudItem,
  reconcileCloudStorageUsage,
  renameCloudItem,
  reserveCloudUpload,
  restoreCloudItem,
  trashCloudItem
};
