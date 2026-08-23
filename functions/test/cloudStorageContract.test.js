"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { normalizeNameForIndex, optionalRequestId } = require("../cloudStorage/validation");
const { isRetryableTransactionContention } = require("../cloudStorage/service");

test("requestId es compatible con el cliente actual y habilita idempotencia cuando se envía", () => {
  assert.equal(optionalRequestId(undefined), null);
  assert.equal(optionalRequestId("upload-123456"), "upload-123456");
});

test("el contrato de reserva contiene los aliases consumidos por Storage Rules y frontend", () => {
  const source = readFileSync(join(__dirname, "../cloudStorage/service.js"), "utf8");
  assert.match(source, /require\("firebase-admin\/firestore"\)/,
    "Los sentinels deben importarse desde la API modular; el runtime Emulator no garantiza el namespace compat.");
  assert.match(source, /ownerId: reservation\.ownerId/);
  assert.match(source, /originalName: reservation\.originalName/);
  assert.match(source, /reservationId: reservation\.id/);
  assert.match(source, /storageName: filename/);
  assert.match(source, /sizeBytes: descriptor\.sizeBytes/);
  assert.match(source, /expectedSizeBytes: descriptor\.sizeBytes/);
  assert.match(source, /!customMetadata\.reservationId \|\| customMetadata\.reservationId === reservation\.id/);
});

test("nameNormalized usa la misma normalizacion estable del cliente y se persiste en cada alta o renombre", () => {
  assert.equal(normalizeNameForIndex("  Neurobiología   de la Memoria.PDF  "), "neurobiologia de la memoria.pdf");

  const source = readFileSync(join(__dirname, "../cloudStorage/service.js"), "utf8");
  assert.match(source, /nameNormalized: normalizeNameForIndex\(reservation\.name\)/);
  assert.match(source, /nameNormalized: normalizeNameForIndex\(name\)/);
  assert.match(source, /const nameNormalized = normalizeNameForIndex\(name\);[\s\S]*transaction\.update\(reference, \{ name, nameNormalized,/);
});

test("la limpieza programada usa el indice compuesto status + expiresAt", () => {
  const source = readFileSync(join(__dirname, "../cloudStorage/service.js"), "utf8");
  assert.match(source, /\.where\("status", "in", \["reserved", "cancelling", "rejecting", "expiring"\]\)\s*\.where\("expiresAt", "<=", nowTimestamp\)/);
});

test("la confirmación reintenta únicamente errores nativos de contención transitoria", () => {
  assert.equal(isRetryableTransactionContention({ code: 10, message: "ABORTED" }), true);
  assert.equal(isRetryableTransactionContention({ code: 4, message: "deadline" }), true);
  assert.equal(isRetryableTransactionContention({
    code: 3,
    message: "3 INVALID_ARGUMENT: Transaction lock timeout."
  }), true);
  assert.equal(isRetryableTransactionContention({
    code: "invalid-argument",
    message: "Transaction is invalid or closed."
  }), true);
  assert.equal(isRetryableTransactionContention({ code: 3, message: "invalid document" }), false);
});

test("el trigger finalizado resuelve de forma idempotente una reserva que terminó durante la confirmación", () => {
  const source = readFileSync(join(__dirname, "../cloudStorage/service.js"), "utf8");
  assert.match(source, /latestStatus === "committed"[\s\S]*alreadyProcessed: true/);
  assert.match(source, /latestStatus !== "reserved"[\s\S]*reason: "reservation-state-changed"/);
});

test("se exportan las trece Functions públicas acordadas", () => {
  process.env.FIREBASE_CONFIG ||= JSON.stringify({
    projectId: "cognicion-57052",
    storageBucket: "cognicion-57052.firebasestorage.app"
  });
  const handlers = require("../cloudStorage/handlers");
  assert.deepEqual(Object.keys(handlers).sort(), [
    "cancelCloudUpload",
    "cleanupExpiredCloudReservations",
    "cloudFileDeleted",
    "cloudFileFinalized",
    "confirmCloudUpload",
    "createCloudFolder",
    "moveCloudItem",
    "permanentlyDeleteCloudItem",
    "reconcileCloudStorageUsage",
    "renameCloudItem",
    "reserveCloudUpload",
    "restoreCloudItem",
    "trashCloudItem"
  ]);
});
