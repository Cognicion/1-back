"use strict";

const { CLOUD_STORAGE_CONFIG, MAX_STORAGE_BYTES } = require("../cloudStorage/config");
const { assertDomain } = require("../cloudStorage/errors");
const {
  assertCanonicalStorageBinding,
  normalizeMimeType,
  normalizeParentFolderId,
  validateDocumentId
} = require("../cloudStorage/validation");

const ADMIN_ROLE = "admin";
const ADMIN_SOURCE = "control-center";
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 50;
const ACCESS_URL_TTL_MS = 2 * 60 * 1000;
const ACCESS_OPERATIONS = new Set(["preview", "download"]);
const SAFE_LIST_KEYS = new Set(["cursor", "deleted", "includeSummary", "ownerUid", "pageSize", "parentFolderId"]);
const SAFE_ACCESS_KEYS = new Set(["fileId", "operation", "ownerUid"]);

function assertOnlyKeys(input, allowed) {
  assertDomain(input && typeof input === "object" && !Array.isArray(input), "invalid-argument", "La solicitud no es válida.");
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  assertDomain(unexpected.length === 0, "invalid-argument", "La solicitud contiene campos no permitidos.");
}

function validatePageSize(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PAGE_SIZE;
  const pageSize = Number(value);
  assertDomain(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= MAX_PAGE_SIZE,
    "invalid-argument", "El tamaño de página no es válido.");
  return pageSize;
}

function validateCursor(value) {
  if (value === undefined || value === null) return null;
  assertDomain(value && typeof value === "object" && !Array.isArray(value), "invalid-argument", "El cursor no es válido.");
  assertDomain(Object.keys(value).every((key) => key === "id" || key === "nameNormalized"),
    "invalid-argument", "El cursor contiene campos no permitidos.");
  return {
    id: validateDocumentId(value.id, "cursor.id"),
    nameNormalized: String(value.nameNormalized ?? "").slice(0, 512)
  };
}

function safeDateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000).toISOString();
  return null;
}

function projectCloudItem(item = {}, id = "") {
  const type = item.type === "folder" ? "folder" : "file";
  return {
    id,
    name: String(item.name || item.originalName || (type === "folder" ? "Carpeta" : "Archivo")),
    extension: type === "file" ? String(item.extension || "") : "",
    mimeType: type === "file" ? normalizeMimeType(item.mimeType) : "",
    sizeBytes: type === "file" ? Math.max(0, Number(item.sizeBytes) || 0) : 0,
    type,
    sourceType: "cloud-file",
    parentFolderId: item.parentFolderId || null,
    createdAt: safeDateValue(item.createdAt),
    updatedAt: safeDateValue(item.updatedAt),
    deleted: item.deleted === true,
    status: item.deleted === true ? "trash" : "active"
  };
}

function validateListedItem(item = {}, id, ownerUid) {
  assertDomain(item.ownerId === ownerUid && item.id === id, "data-loss",
    "La metadata de Mi nube contiene identificadores inconsistentes.", { securityReason: "invalid-storage-binding" });
  if (item.type === "folder") return;
  assertDomain(item.type === "file", "data-loss", "La metadata de Mi nube contiene un tipo no válido.", {
    securityReason: "invalid-storage-binding"
  });
  assertCanonicalStorageBinding({
    uid: ownerUid,
    fileId: id,
    storageName: item.storageName,
    storagePath: item.storagePath
  });
}

function createCloudAdminModerationService({ repository, logger = console, now = () => new Date() }) {
  assertDomain(repository, "internal", "No se configuró el repositorio administrativo.");

  async function authorize(adminUid) {
    const uid = validateDocumentId(adminUid, "adminUid");
    const profile = await repository.getUser(uid);
    assertDomain(profile && profile.rol === ADMIN_ROLE, "permission-denied", "No tienes permisos para esta operación.");
    return uid;
  }

  function trace(operation, result, startedAt, extra = {}) {
    const durationMs = Math.max(0, Date.now() - startedAt);
    logger.info?.("[MiNube][AdminModeration]", {
      operation,
      result,
      durationMs,
      ...extra
    });
  }

  async function writeAudit({ action, adminUid, ownerUid, fileId = "", operation, details = {} }) {
    await repository.writeAudit({
      accion: action,
      action,
      adminUid,
      ownerUid,
      ...(fileId ? { fileId } : {}),
      operation,
      source: ADMIN_SOURCE,
      modulo: "Panel administracion",
      descripcion: "Acceso administrativo de solo lectura a Mi nube.",
      usuarioUid: adminUid,
      usuarioRol: ADMIN_ROLE,
      exito: true,
      detalles: {
        ownerUid,
        ...(fileId ? { fileId } : {}),
        operation,
        source: ADMIN_SOURCE,
        soloLectura: true,
        ...details
      }
    });
  }

  async function listFiles(adminUid, input = {}) {
    const startedAt = Date.now();
    const authorizedUid = await authorize(adminUid);
    assertOnlyKeys(input, SAFE_LIST_KEYS);
    const ownerUid = validateDocumentId(input.ownerUid, "ownerUid");
    const parentFolderId = normalizeParentFolderId(input.parentFolderId);
    const deleted = input.deleted === true;
    const includeSummary = input.includeSummary !== false;
    const pageSize = validatePageSize(input.pageSize);
    const cursor = validateCursor(input.cursor);

    const owner = await repository.getUser(ownerUid);
    assertDomain(owner, "not-found", "No fue posible consultar el almacenamiento solicitado.");

    const [page, usage, counts] = await Promise.all([
      repository.listItems({ ownerUid, parentFolderId, deleted, pageSize, cursor }),
      includeSummary ? repository.getUsage(ownerUid) : Promise.resolve(null),
      includeSummary ? repository.getCounts(ownerUid) : Promise.resolve(null)
    ]);
    let items;
    try {
      page.items.forEach(({ id, data }) => validateListedItem(data, id, ownerUid));
      items = page.items.map(({ id, data }) => projectCloudItem(data, id));
    } catch (error) {
      await writeAudit({
        action: "cloud_file_admin_security_denied",
        adminUid: authorizedUid,
        ownerUid,
        operation: "list-denied",
        details: { reason: "invalid-storage-binding" }
      });
      trace("list", "denied", startedAt, { errorCode: "invalid-storage-binding" });
      throw error;
    }

    await writeAudit({
      action: "cloud_file_admin_list",
      adminUid: authorizedUid,
      ownerUid,
      operation: "list",
      details: {
        deleted,
        itemCount: items.length,
        parentFolder: Boolean(parentFolderId),
        pageSize
      }
    });

    trace("list", "success", startedAt, { itemCount: items.length });
    return {
      ownerUid,
      items,
      nextCursor: page.nextCursor || null,
      usage: usage ? {
        usedBytes: Math.max(0, Number(usage?.usedBytes) || 0),
        reservedBytes: Math.max(0, Number(usage?.reservedBytes) || 0),
        maxBytes: Math.max(0, Number(usage?.maxBytes) || MAX_STORAGE_BYTES)
      } : null,
      counts: counts ? {
        activeFiles: Math.max(0, Number(counts?.activeFiles) || 0),
        activeFolders: Math.max(0, Number(counts?.activeFolders) || 0),
        trashItems: Math.max(0, Number(counts?.trashItems) || 0)
      } : null
    };
  }

  async function requestAccess(adminUid, input = {}) {
    const startedAt = Date.now();
    const authorizedUid = await authorize(adminUid);
    assertOnlyKeys(input, SAFE_ACCESS_KEYS);
    const ownerUid = validateDocumentId(input.ownerUid, "ownerUid");
    const fileId = validateDocumentId(input.fileId, "fileId");
    const operation = String(input.operation || "").trim().toLowerCase();
    assertDomain(ACCESS_OPERATIONS.has(operation), "invalid-argument", "La operación solicitada no es válida.");

    const item = await repository.getItem(ownerUid, fileId);
    assertDomain(item, "not-found", "No fue posible consultar el archivo solicitado.");
    let binding;
    let mimeType;
    try {
      assertDomain(item.type === "file" && item.ownerId === ownerUid && item.id === fileId,
        "data-loss", "La metadata del archivo no es válida.", { securityReason: "invalid-storage-binding" });
      binding = assertCanonicalStorageBinding({
        uid: ownerUid,
        fileId,
        storageName: item.storageName,
        storagePath: item.storagePath
      });
      const objectMetadata = await repository.getObjectMetadata(binding);
      assertDomain(objectMetadata, "not-found", "No fue posible consultar el archivo solicitado.");
      assertDomain(Number(objectMetadata.size) === Number(item.sizeBytes), "data-loss",
        "El archivo no coincide con su metadata registrada.", { securityReason: "metadata-mismatch" });
      mimeType = normalizeMimeType(item.mimeType);
      assertDomain(!objectMetadata.contentType || normalizeMimeType(objectMetadata.contentType) === mimeType,
        "data-loss", "El archivo no coincide con su metadata registrada.", { securityReason: "metadata-mismatch" });
    } catch (error) {
      if (error?.code === "data-loss") {
        await writeAudit({
          action: "cloud_file_admin_security_denied",
          adminUid: authorizedUid,
          ownerUid,
          fileId,
          operation: `${operation}-denied`,
          details: { reason: error?.details?.securityReason || "metadata-mismatch" }
        });
        trace(operation, "denied", startedAt, { errorCode: error?.details?.securityReason || "data-loss" });
      }
      throw error;
    }

    // Audit-before-access: una falla aquí impide crear o entregar la URL temporal.
    await writeAudit({
      action: operation === "preview" ? "cloud_file_admin_preview" : "cloud_file_admin_download",
      adminUid: authorizedUid,
      ownerUid,
      fileId,
      operation,
      details: {
        deleted: item.deleted === true,
        mimeType,
        sizeBytes: Number(item.sizeBytes) || 0
      }
    });

    const expiresAt = new Date(now().getTime() + ACCESS_URL_TTL_MS);
    const url = await repository.createReadUrl(binding, {
      expiresAt,
      mimeType,
      name: String(item.name || item.originalName || item.storageName),
      operation
    });
    assertDomain(typeof url === "string" && url.startsWith("https://"), "internal", "No fue posible preparar el acceso temporal.");
    trace(operation, "success", startedAt);
    return {
      expiresAt: expiresAt.toISOString(),
      file: projectCloudItem(item, fileId),
      operation,
      url
    };
  }

  return { listFiles, requestAccess };
}

module.exports = {
  ACCESS_URL_TTL_MS,
  ADMIN_ROLE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createCloudAdminModerationService,
  projectCloudItem,
  validateListedItem,
  validateCursor
};
