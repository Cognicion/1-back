"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACCESS_URL_TTL_MS,
  createCloudAdminModerationService
} = require("../cloudAdminModeration/service");

const ADMIN_UID = "uidAdmin";
const OWNER_UID = "uidOwner";
const OTHER_UID = "uidOther";
const FILE_ID = "file_001";
const STORAGE_NAME = "reporte.pdf";
const STORAGE_PATH = `mi-nube/${OWNER_UID}/files/${FILE_ID}/${STORAGE_NAME}`;
const NOW = new Date("2026-08-22T18:00:00.000Z");

function baseFile(overrides = {}) {
  return {
    id: FILE_ID,
    ownerId: OWNER_UID,
    name: "Informe.pdf",
    originalName: "Informe.pdf",
    nameNormalized: "informe.pdf",
    storageName: STORAGE_NAME,
    storagePath: STORAGE_PATH,
    extension: "pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    type: "file",
    parentFolderId: null,
    deleted: false,
    ...overrides
  };
}

function baseFolder(overrides = {}) {
  return {
    id: "folder_001",
    ownerId: OWNER_UID,
    name: "Documentos",
    nameNormalized: "documentos",
    type: "folder",
    parentFolderId: null,
    deleted: false,
    ...overrides
  };
}

function fixture(options = {}) {
  const events = [];
  const sequence = [];
  let signed = 0;
  const item = options.item || baseFile();
  const profiles = {
    [ADMIN_UID]: { rol: "admin" },
    [OWNER_UID]: { rol: "paciente" },
    [OTHER_UID]: { rol: "medico", isAdmin: true }
  };
  const repository = {
    async getUser(uid) { return profiles[uid] || null; },
    async getUsage() { return { usedBytes: 4096, reservedBytes: 512, maxBytes: 262144000 }; },
    async getCounts() { return { activeFiles: 1, activeFolders: 1, trashItems: 0 }; },
    async listItems() {
      return {
        items: [{ id: "folder_001", data: baseFolder() }, { id: FILE_ID, data: item }],
        nextCursor: { id: FILE_ID, nameNormalized: "informe.pdf" }
      };
    },
    async getItem() { return item; },
    async getObjectMetadata(binding) {
      sequence.push(["metadata", binding.storagePath]);
      return { size: "2048", contentType: "application/pdf" };
    },
    async writeAudit(event) {
      sequence.push(["audit", event.action]);
      if (options.auditFails) throw new Error("audit unavailable");
      events.push(event);
    },
    async createReadUrl(binding, settings) {
      signed += 1;
      sequence.push(["sign", binding.storagePath]);
      return `https://storage.invalid/private?expires=${settings.expiresAt.getTime()}`;
    }
  };
  return {
    events,
    repository,
    sequence,
    service: createCloudAdminModerationService({ repository, logger: { info() {} }, now: () => NOW }),
    signedCount: () => signed
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test("solo el perfil con rol canónico admin puede usar endpoints administrativos", async () => {
  const { service, signedCount } = fixture();
  await rejectsCode(service.listFiles(OWNER_UID, { ownerUid: OWNER_UID }), "permission-denied");
  await rejectsCode(service.requestAccess(OTHER_UID, {
    ownerUid: OWNER_UID, fileId: FILE_ID, operation: "preview", isAdmin: true
  }), "permission-denied");
  await rejectsCode(service.requestAccess("uidAnonymous", {
    ownerUid: OWNER_UID, fileId: FILE_ID, operation: "download"
  }), "permission-denied");
  assert.equal(signedCount(), 0);
});

test("admin lista una página segura, cuota agregada y carpetas sin exponer rutas", async () => {
  const { service, events } = fixture();
  const result = await service.listFiles(ADMIN_UID, { ownerUid: OWNER_UID, pageSize: 40 });
  assert.equal(result.items.length, 2);
  assert.equal(result.usage.usedBytes, 4096);
  assert.equal(result.counts.activeFolders, 1);
  assert.deepEqual(result.nextCursor, { id: FILE_ID, nameNormalized: "informe.pdf" });
  assert.equal("storagePath" in result.items[1], false);
  assert.equal("storageName" in result.items[1], false);
  assert.equal(events[0].action, "cloud_file_admin_list");
  assert.equal(events[0].source, "control-center");
  assert.equal(JSON.stringify(events[0]).includes("Informe.pdf"), false);
});

test("preview y descarga auditan antes de firmar la ruta canónica", async () => {
  const { service, events, sequence, signedCount } = fixture();
  const preview = await service.requestAccess(ADMIN_UID, {
    ownerUid: OWNER_UID, fileId: FILE_ID, operation: "preview"
  });
  assert.equal(preview.operation, "preview");
  assert.equal(new Date(preview.expiresAt).getTime() - NOW.getTime(), ACCESS_URL_TTL_MS);
  assert.deepEqual(sequence.map(([step]) => step), ["metadata", "audit", "sign"]);
  assert.equal(sequence[0][1], STORAGE_PATH);
  assert.equal(events[0].action, "cloud_file_admin_preview");
  assert.equal(events[0].fileId, FILE_ID);
  assert.equal(JSON.stringify(events[0]).includes(preview.url), false);

  await service.requestAccess(ADMIN_UID, {
    ownerUid: OWNER_UID, fileId: FILE_ID, operation: "download"
  });
  assert.equal(events[1].action, "cloud_file_admin_download");
  assert.equal(signedCount(), 2);
});

test("si falla auditoría no se crea ni entrega acceso temporal", async () => {
  const { service, sequence, signedCount } = fixture({ auditFails: true });
  await assert.rejects(service.requestAccess(ADMIN_UID, {
    ownerUid: OWNER_UID, fileId: FILE_ID, operation: "preview"
  }), /audit unavailable/u);
  assert.deepEqual(sequence.map(([step]) => step), ["metadata", "audit"]);
  assert.equal(signedCount(), 0);
});

test("metadata manipulada nunca toca una ruta ajena ni se firma", async () => {
  for (const item of [
    baseFile({ ownerId: OTHER_UID }),
    baseFile({ storagePath: `mi-nube/${OTHER_UID}/files/${FILE_ID}/${STORAGE_NAME}` }),
    baseFile({ storageName: "otro.pdf" }),
    baseFile({ id: "file_otro" })
  ]) {
    const { service, events, sequence, signedCount } = fixture({ item });
    await rejectsCode(service.requestAccess(ADMIN_UID, {
      ownerUid: OWNER_UID, fileId: FILE_ID, operation: "download"
    }), "data-loss");
    assert.deepEqual(sequence.map(([step]) => step), ["audit"]);
    assert.equal(events[0].action, "cloud_file_admin_security_denied");
    assert.equal(JSON.stringify(events[0]).includes(item.storagePath), false);
    assert.equal(signedCount(), 0);
  }
});

test("listado deniega bindings manipulados y registra incidente técnico", async () => {
  const { service, events, signedCount } = fixture({ item: baseFile({ storagePath: "usuarios/victima/foto" }) });
  await rejectsCode(service.listFiles(ADMIN_UID, { ownerUid: OWNER_UID }), "data-loss");
  assert.equal(events[0].action, "cloud_file_admin_security_denied");
  assert.equal(events[0].detalles.reason, "invalid-storage-binding");
  assert.equal(signedCount(), 0);
});

test("payloads intentan isAdmin, filename o storagePath se rechazan para un admin real", async () => {
  const { service, signedCount } = fixture();
  for (const injected of [{ isAdmin: true }, { filename: STORAGE_NAME }, { storagePath: STORAGE_PATH }]) {
    await rejectsCode(service.requestAccess(ADMIN_UID, {
      ownerUid: OWNER_UID, fileId: FILE_ID, operation: "preview", ...injected
    }), "invalid-argument");
  }
  assert.equal(signedCount(), 0);
});
