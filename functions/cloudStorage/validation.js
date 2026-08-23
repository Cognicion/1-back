"use strict";

const crypto = require("node:crypto");
const { ALLOWED_FILE_TYPES, CLOUD_STORAGE_CONFIG } = require("./config");
const { assertDomain, fail } = require("./errors");

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const FORBIDDEN_PATH_CHARACTERS = /[\\/]/g;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DOCUMENT_ID_PATTERN = /^[^/]{1,160}$/u;

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function validateRequestId(value) {
  const requestId = cleanText(value);
  assertDomain(requestId.length >= 8, "invalid-argument", "requestId es obligatorio y debe tener al menos 8 caracteres.");
  assertDomain(requestId.length <= CLOUD_STORAGE_CONFIG.maxRequestIdLength, "invalid-argument", "requestId es demasiado largo.");
  assertDomain(REQUEST_ID_PATTERN.test(requestId), "invalid-argument", "requestId contiene caracteres no permitidos.");
  return requestId;
}

function optionalRequestId(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return validateRequestId(value);
}

function validateDocumentId(value, fieldName = "id", options = {}) {
  if ((value === null || value === undefined || value === "") && options.nullable) return null;
  const id = cleanText(value);
  assertDomain(DOCUMENT_ID_PATTERN.test(id) && id !== "." && id !== "..", "invalid-argument", `${fieldName} no es válido.`);
  return id;
}

function normalizeParentFolderId(value) {
  return validateDocumentId(value, "parentFolderId", { nullable: true });
}

function sanitizeDisplayName(value, type = "file") {
  const raw = cleanText(value);
  assertDomain(raw.length > 0, "invalid-argument", `El nombre del ${type === "folder" ? "directorio" : "archivo"} es obligatorio.`);
  const name = raw.replace(CONTROL_CHARACTERS, "").replace(FORBIDDEN_PATH_CHARACTERS, "_").trim();
  assertDomain(name.length > 0 && name !== "." && name !== "..", "invalid-argument", "El nombre no es válido.");
  assertDomain(name.length <= CLOUD_STORAGE_CONFIG.maxNameLength, "invalid-argument", "El nombre es demasiado largo.");
  assertDomain(Buffer.byteLength(name, "utf8") <= 512, "invalid-argument", "El nombre ocupa demasiados bytes.");
  return name;
}

function extractExtension(name) {
  const normalized = cleanText(name);
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === normalized.length - 1) return "";
  return normalized.slice(lastDot + 1).toLowerCase();
}

function normalizeMimeType(value) {
  return cleanText(value).split(";", 1)[0].toLowerCase();
}

function normalizeNameForIndex(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function validateFileDescriptor(input = {}) {
  const originalRaw = cleanText(input.originalName || input.name);
  assertDomain(originalRaw.length > 0, "invalid-argument", "El nombre original del archivo es obligatorio.");
  assertDomain(originalRaw.length <= CLOUD_STORAGE_CONFIG.maxOriginalNameLength, "invalid-argument", "El nombre original es demasiado largo.");

  const extension = extractExtension(originalRaw);
  const mimeType = normalizeMimeType(input.mimeType);
  const allowedMimes = ALLOWED_FILE_TYPES[extension];
  assertDomain(Boolean(allowedMimes), "invalid-argument", "La extensión del archivo no está permitida.", { extension });
  assertDomain(allowedMimes.includes(mimeType), "invalid-argument", "El tipo MIME no coincide con una extensión permitida.", { extension, mimeType });

  const sizeBytes = Number(input.sizeBytes);
  assertDomain(Number.isSafeInteger(sizeBytes) && sizeBytes > 0, "invalid-argument", "El tamaño del archivo no es válido.");
  assertDomain(sizeBytes <= CLOUD_STORAGE_CONFIG.maxStorageBytes, "resource-exhausted", "El archivo supera el límite total de Mi nube.", {
    maxBytes: CLOUD_STORAGE_CONFIG.maxStorageBytes,
    sizeBytes
  });

  const originalName = originalRaw.replace(CONTROL_CHARACTERS, "").trim();
  const name = sanitizeDisplayName(input.name || originalName, "file");
  assertDomain(extractExtension(name) === extension, "invalid-argument", "El nombre visible debe conservar la extensión original.");

  return {
    extension,
    mimeType,
    name,
    originalName,
    sizeBytes
  };
}

function validateFolderName(value) {
  return sanitizeDisplayName(value, "folder");
}

function deriveStableId(uid, requestId, namespace) {
  const validUid = validateDocumentId(uid, "uid");
  const validRequestId = validateRequestId(requestId);
  const digest = crypto.createHash("sha256")
    .update(`${namespace}\u0000${validUid}\u0000${validRequestId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  const prefix = namespace === "folder" ? "folder" : "file";
  return `${prefix}_${digest}`;
}

function buildStoragePath(uid, fileId, filename) {
  const validUid = validateDocumentId(uid, "uid");
  const validFileId = validateDocumentId(fileId, "fileId");
  const validFilename = sanitizeDisplayName(filename, "file");
  return `${CLOUD_STORAGE_CONFIG.storageRoot}/${validUid}/${CLOUD_STORAGE_CONFIG.filesSegment}/${validFileId}/${validFilename}`;
}

function assertCanonicalStorageBinding(input = {}) {
  let uid;
  let fileId;
  let storageName;
  let expectedStoragePath;
  try {
    uid = validateDocumentId(input.uid, "uid");
    fileId = validateDocumentId(input.fileId, "fileId");
    storageName = sanitizeDisplayName(input.storageName, "file");
    expectedStoragePath = buildStoragePath(uid, fileId, storageName);
  } catch (_) {
    fail("data-loss", "El registro interno contiene una vinculación de Storage no válida.", {
      securityReason: "invalid-storage-binding"
    });
  }

  const persistedStorageName = String(input.storageName ?? "");
  const persistedStoragePath = String(input.storagePath ?? "");
  assertDomain(
    persistedStorageName === storageName && persistedStoragePath === expectedStoragePath,
    "data-loss",
    "El registro interno no apunta a una ruta canónica de Mi nube.",
    { securityReason: "invalid-storage-binding" }
  );

  return {
    fileId,
    filename: storageName,
    storageName,
    storagePath: expectedStoragePath,
    uid
  };
}

function parseStoragePath(storagePath) {
  const value = cleanText(storagePath);
  const parts = value.split("/");
  if (parts.length !== 5 || parts[0] !== CLOUD_STORAGE_CONFIG.storageRoot || parts[2] !== CLOUD_STORAGE_CONFIG.filesSegment) return null;
  try {
    const uid = validateDocumentId(parts[1], "uid");
    const fileId = validateDocumentId(parts[3], "fileId");
    const filename = sanitizeDisplayName(parts[4], "file");
    if (buildStoragePath(uid, fileId, filename) !== value) return null;
    return { fileId, filename, storagePath: value, uid };
  } catch (_) {
    return null;
  }
}

function validateRenameForItem(item, requestedName) {
  const type = item?.type === "folder" ? "folder" : "file";
  const name = sanitizeDisplayName(requestedName, type);
  if (type === "file" && extractExtension(name) !== String(item.extension || "").toLowerCase()) {
    fail("invalid-argument", "No se puede cambiar la extensión del archivo al renombrarlo.");
  }
  return name;
}

function allowedMimeForExtension(extension, mimeType) {
  return Boolean(ALLOWED_FILE_TYPES[String(extension || "").toLowerCase()]?.includes(normalizeMimeType(mimeType)));
}

module.exports = {
  allowedMimeForExtension,
  assertCanonicalStorageBinding,
  buildStoragePath,
  cleanText,
  deriveStableId,
  extractExtension,
  normalizeMimeType,
  normalizeNameForIndex,
  normalizeParentFolderId,
  optionalRequestId,
  parseStoragePath,
  sanitizeDisplayName,
  validateDocumentId,
  validateFileDescriptor,
  validateFolderName,
  validateRenameForItem,
  validateRequestId
};
