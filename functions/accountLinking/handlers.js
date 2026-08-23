"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { AccountLinkingError } = require("./errors");
const { ACCOUNT_LINKING_ACTIONS } = require("./config");
const { createAccountLinkingService } = require("./service");

if (!admin.apps.length) admin.initializeApp();

let serviceInstance = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createAccountLinkingService({ db: admin.firestore() });
  }
  return serviceInstance;
}

const VALID_HTTPS_CODES = new Set([
  "aborted",
  "already-exists",
  "deadline-exceeded",
  "failed-precondition",
  "internal",
  "invalid-argument",
  "not-found",
  "permission-denied",
  "resource-exhausted",
  "unauthenticated",
  "unavailable"
]);

function toHttpsError(error, action = "unknown") {
  if (error instanceof HttpsError) return error;
  if (error instanceof AccountLinkingError) {
    return new HttpsError(
      VALID_HTTPS_CODES.has(error.code) ? error.code : "failed-precondition",
      error.message,
      error.details || {}
    );
  }
  const safeAction = Object.values(ACCOUNT_LINKING_ACTIONS).includes(action) ? action : "invalid";
  logger.error("[ACCOUNT_LINKING] Error interno", { action: safeAction });
  return new HttpsError("internal", "No fue posible completar la vinculación de la cuenta.");
}

async function handleAccountLinking(request) {
  const action = request.data?.accion;
  try {
    return await getService().execute(request.auth || null, request.data || {});
  } catch (error) {
    throw toHttpsError(error, action);
  }
}

const manageAccountLinking = onCall({
  memory: "1GiB",
  region: "us-central1",
  timeoutSeconds: 540
}, handleAccountLinking);

module.exports = {
  handleAccountLinking,
  manageAccountLinking,
  toHttpsError
};
