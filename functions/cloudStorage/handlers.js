"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onObjectDeleted, onObjectFinalized } = require("firebase-functions/storage");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { CLOUD_STORAGE_CONFIG } = require("./config");
const { CloudStorageDomainError } = require("./errors");
const { createCloudStorageService } = require("./service");

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
    try {
      const result = await operation(authenticatedUid(request), request.data || {}, request);
      return callableValue(result);
    } catch (error) {
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
  const result = await getService().handleFinalizedObject(event.data || {}, event.id || "");
  if (result?.ignored !== true) logger.info("[MI_NUBE] Evento de archivo finalizado procesado", {
    rejected: result?.rejected === true
  });
});

const cloudFileDeleted = onObjectDeleted(EVENT_OPTIONS, async (event) => {
  const result = await getService().handleDeletedObject(event.data?.name || "", event.id || "");
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
