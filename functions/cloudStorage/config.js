"use strict";

const MAX_STORAGE_BYTES = 250 * 1024 * 1024;

const ALLOWED_FILE_TYPES = Object.freeze({
  jpg: Object.freeze(["image/jpeg"]),
  jpeg: Object.freeze(["image/jpeg"]),
  png: Object.freeze(["image/png"]),
  webp: Object.freeze(["image/webp"]),
  gif: Object.freeze(["image/gif"]),
  pdf: Object.freeze(["application/pdf"]),
  txt: Object.freeze(["text/plain"]),
  md: Object.freeze(["text/markdown"])
});

const CLOUD_STORAGE_CONFIG = Object.freeze({
  bucket: "cognicion-57052.firebasestorage.app",
  region: "us-central1",
  maxStorageBytes: MAX_STORAGE_BYTES,
  reservationTtlMs: 30 * 60 * 1000,
  reservationCleanupLimit: 200,
  reconciliationPageSize: 250,
  storageValidationConcurrency: 8,
  maxFolderTraversalItems: 10000,
  maxNameLength: 180,
  maxOriginalNameLength: 255,
  maxRequestIdLength: 128,
  storageRoot: "mi-nube",
  filesSegment: "files",
  usersCollection: "usuarios",
  filesCollection: "cloudFiles",
  usageCollection: "cloudStorageUsage",
  usageDocument: "current",
  reservationsCollection: "cloudUploadReservations",
  sourceType: "cloud-file"
});

module.exports = {
  ALLOWED_FILE_TYPES,
  CLOUD_STORAGE_CONFIG,
  MAX_STORAGE_BYTES
};
