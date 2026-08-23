"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { CLOUD_STORAGE_CONFIG } = require("../cloudStorage/config");
const { CloudStorageDomainError } = require("../cloudStorage/errors");
const { createFirebaseAdminCloudRepository } = require("./firebaseRepository");
const { createCloudAdminModerationService } = require("./service");

if (!admin.apps.length) admin.initializeApp();

const CALLABLE_OPTIONS = Object.freeze({
  memory: "512MiB",
  region: CLOUD_STORAGE_CONFIG.region,
  timeoutSeconds: 120
});

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    const db = admin.firestore();
    const bucket = admin.storage().bucket(CLOUD_STORAGE_CONFIG.bucket);
    serviceInstance = createCloudAdminModerationService({
      logger,
      repository: createFirebaseAdminCloudRepository({ admin, db, bucket })
    });
  }
  return serviceInstance;
}

function authenticatedUid(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  return request.auth.uid;
}

function toHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof CloudStorageDomainError) {
    return new HttpsError(error.code || "failed-precondition", error.message, error.details || {});
  }
  logger.error("[MiNube][AdminModeration]", {
    operation: "unknown",
    result: "error",
    errorCode: error?.code || error?.name || "internal"
  });
  return new HttpsError("internal", "No fue posible completar la operación administrativa.");
}

function wrap(operation) {
  return async (request) => {
    try {
      return await operation(authenticatedUid(request), request.data || {});
    } catch (error) {
      throw toHttpsError(error);
    }
  };
}

const listAdminCloudFiles = onCall(CALLABLE_OPTIONS,
  wrap((adminUid, data) => getService().listFiles(adminUid, data)));
const requestAdminCloudFileAccess = onCall(CALLABLE_OPTIONS,
  wrap((adminUid, data) => getService().requestAccess(adminUid, data)));

module.exports = { listAdminCloudFiles, requestAdminCloudFileAccess };
