"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCloudStorageService } = require("../cloudStorage/service");
const {
  assertCanonicalStorageBinding,
  buildStoragePath
} = require("../cloudStorage/validation");

const UID = "uid_owner";
const VICTIM_PATH = "usuarios/uid_victim/perfil/foto-perfil";

class FakeSnapshot {
  constructor(reference, value) {
    this.ref = reference;
    this.id = reference.id;
    this.exists = value !== undefined;
    this._value = value;
  }

  data() {
    return this._value === undefined ? undefined : { ...this._value };
  }
}

class FakeDocumentReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }

  collection(name) {
    return new FakeCollectionReference(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new FakeSnapshot(this, this.db.documents.get(this.path));
  }

  async set(value, options = {}) {
    const current = this.db.documents.get(this.path) || {};
    this.db.documents.set(this.path, options.merge ? { ...current, ...value } : { ...value });
  }

  async update(value) {
    if (!this.db.documents.has(this.path)) throw new Error(`Missing fake document ${this.path}`);
    this.db.documents.set(this.path, { ...this.db.documents.get(this.path), ...value });
  }
}

class FakeQuery {
  constructor(db, path, filters = [], maximum = Infinity) {
    this.db = db;
    this.path = path;
    this.filters = filters;
    this.maximum = maximum;
  }

  orderBy() { return this; }
  startAfter() { return this; }

  limit(maximum) {
    return new FakeQuery(this.db, this.path, this.filters, maximum);
  }

  where(field, operator, expected) {
    return new FakeQuery(this.db, this.path, [...this.filters, { expected, field, operator }], this.maximum);
  }

  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    const docs = [...this.db.documents.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments)
      .map(([path, value]) => new FakeSnapshot(new FakeDocumentReference(this.db, path), value))
      .filter((snapshot) => this.filters.every(({ expected, field, operator }) => {
        const actual = snapshot.data()?.[field];
        if (operator === "==") return actual === expected;
        throw new Error(`Unsupported fake query operator ${operator}`);
      }))
      .slice(0, this.maximum);
    return { docs, size: docs.length };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id) {
    return new FakeDocumentReference(this.db, `${this.path}/${id}`);
  }
}

class FakeTransaction {
  async get(reference) { return reference.get(); }
  set(reference, value, options) { return reference.set(value, options); }
  update(reference, value) { return reference.update(value); }
  create(reference, value) { return reference.set(value); }
  delete(reference) { reference.db.documents.delete(reference.path); }
}

class FakeDb {
  constructor(seed = {}) {
    this.documents = new Map(Object.entries(seed).map(([path, value]) => [path, { ...value }]));
  }

  collection(name) { return new FakeCollectionReference(this, name); }
  doc(path) { return new FakeDocumentReference(this, path); }
  async runTransaction(operation) { return operation(new FakeTransaction()); }
}

class GuardedBucket {
  constructor() {
    this.fileCalls = [];
    this.prefixes = [];
  }

  file(path) {
    this.fileCalls.push(path);
    throw new Error(`El test no debe alcanzar bucket.file(${path})`);
  }

  async getFiles({ prefix }) {
    this.prefixes.push(prefix);
    return [[]];
  }
}

function reservation(fileId = "file_malicious", overrides = {}) {
  return {
    expectedSizeBytes: 64,
    expiresAt: new Date(Date.now() + 60_000),
    extension: "pdf",
    fileId,
    filename: "memoria.pdf",
    id: fileId,
    mimeType: "application/pdf",
    ownerId: UID,
    sizeBytes: 64,
    status: "reserved",
    storageName: "memoria.pdf",
    storagePath: VICTIM_PATH,
    ...overrides
  };
}

function cloudFile(fileId = "file_malicious", overrides = {}) {
  return {
    deleted: true,
    extension: "pdf",
    id: fileId,
    mimeType: "application/pdf",
    ownerId: UID,
    quotaAccounted: true,
    sizeBytes: 64,
    storageName: "memoria.pdf",
    storagePath: VICTIM_PATH,
    type: "file",
    uploadStatus: "ready",
    ...overrides
  };
}

function createHarness(seed = {}, now = () => Date.now()) {
  const db = new FakeDb(seed);
  const bucket = new GuardedBucket();
  const service = createCloudStorageService({ admin: {}, bucket, db, logger: { error() {} }, now });
  return { bucket, db, service };
}

function expectUnsafeStorageBinding(promise) {
  return assert.rejects(promise, (error) => (
    error?.code === "data-loss"
      && error?.details?.securityReason === "invalid-storage-binding"
  ));
}

test("el validador acepta solo la vinculación canónica exacta", () => {
  const fileId = "file_safe";
  const canonical = buildStoragePath(UID, fileId, "memoria.pdf");
  assert.deepEqual(assertCanonicalStorageBinding({
    fileId,
    storageName: "memoria.pdf",
    storagePath: canonical,
    uid: UID
  }), {
    fileId,
    filename: "memoria.pdf",
    storageName: "memoria.pdf",
    storagePath: canonical,
    uid: UID
  });

  for (const storagePath of [
    VICTIM_PATH,
    `mi-nube/uid_other/files/${fileId}/memoria.pdf`,
    `mi-nube/${UID}/files/file_other/memoria.pdf`,
    `mi-nube/${UID}/files/${fileId}/otro.pdf`
  ]) {
    assert.throws(() => assertCanonicalStorageBinding({
      fileId,
      storageName: "memoria.pdf",
      storagePath,
      uid: UID
    }), (error) => error.code === "data-loss");
  }
});

test("cancel y reject fallan antes de tocar Storage o liberar cuota ante una reserva manipulada", async () => {
  for (const operation of [
    (service, fileId) => service.cancelUpload(UID, { fileId }),
    (service, fileId) => service.rejectReservedUpload(UID, fileId, "adversarial-test")
  ]) {
    const fileId = `file_${Math.random().toString(16).slice(2)}`;
    const reservationPath = `usuarios/${UID}/cloudUploadReservations/${fileId}`;
    const usagePath = `usuarios/${UID}/cloudStorageUsage/current`;
    const { bucket, db, service } = createHarness({
      [reservationPath]: reservation(fileId),
      [usagePath]: { maxBytes: 250 * 1024 * 1024, reservedBytes: 64, revision: 1, usedBytes: 0 }
    });

    await expectUnsafeStorageBinding(operation(service, fileId));
    assert.deepEqual(bucket.fileCalls, []);
    assert.equal(db.documents.get(reservationPath).status, "reserved");
    assert.equal(db.documents.get(usagePath).reservedBytes, 64);
  }
});

test("finalize/confirm rechaza una reserva manipulada sin leer ni borrar la ruta ajena", async () => {
  const fileId = "file_finalize_bad";
  const reservationPath = `usuarios/${UID}/cloudUploadReservations/${fileId}`;
  const { bucket, service } = createHarness({ [reservationPath]: reservation(fileId) });
  const canonicalEventPath = buildStoragePath(UID, fileId, "memoria.pdf");

  await expectUnsafeStorageBinding(service.handleFinalizedObject({
    contentType: "application/pdf",
    metadata: { fileId, ownerId: UID, reservationId: fileId },
    name: canonicalEventPath,
    size: "64"
  }, "event-adversarial"));
  assert.deepEqual(bucket.fileCalls, []);
});

test("expiry falla cerrado y conserva reservedBytes ante una ruta ajena", async () => {
  const fileId = "file_expiry_bad";
  const reservationPath = `usuarios/${UID}/cloudUploadReservations/${fileId}`;
  const usagePath = `usuarios/${UID}/cloudStorageUsage/current`;
  const { bucket, db, service } = createHarness({
    [reservationPath]: reservation(fileId, { expiresAt: new Date(0) }),
    [usagePath]: { maxBytes: 250 * 1024 * 1024, reservedBytes: 64, revision: 2, usedBytes: 0 }
  }, () => 1_000);

  await expectUnsafeStorageBinding(service.expireReservation(UID, fileId));
  assert.deepEqual(bucket.fileCalls, []);
  assert.equal(db.documents.get(reservationPath).status, "reserved");
  assert.equal(db.documents.get(usagePath).reservedBytes, 64);
});

test("borrado definitivo no puede usar metadata manipulada como primitive de borrado Admin", async () => {
  const fileId = "file_delete_bad";
  const itemPath = `usuarios/${UID}/cloudFiles/${fileId}`;
  const usagePath = `usuarios/${UID}/cloudStorageUsage/current`;
  const { bucket, db, service } = createHarness({
    [itemPath]: cloudFile(fileId),
    [usagePath]: { maxBytes: 250 * 1024 * 1024, reservedBytes: 0, revision: 3, usedBytes: 64 }
  });

  await expectUnsafeStorageBinding(service.permanentlyDeleteItem(UID, { itemId: fileId }));
  assert.deepEqual(bucket.fileCalls, []);
  assert.equal(db.documents.has(itemPath), true);
  assert.equal(db.documents.get(usagePath).usedBytes, 64);
});

test("trigger de borrado cuarentena metadata manipulada sin liberar cuota", async () => {
  for (const overrides of [
    { ownerId: "uid_attacker" },
    { storageName: "otro.pdf" }
  ]) {
    const fileId = `file_trigger_${Math.random().toString(16).slice(2)}`;
    const canonicalPath = buildStoragePath(UID, fileId, "memoria.pdf");
    const itemPath = `usuarios/${UID}/cloudFiles/${fileId}`;
    const usagePath = `usuarios/${UID}/cloudStorageUsage/current`;
    const { bucket, db, service } = createHarness({
      [itemPath]: cloudFile(fileId, { storagePath: canonicalPath, ...overrides }),
      [usagePath]: { maxBytes: 250 * 1024 * 1024, reservedBytes: 0, revision: 4, usedBytes: 64 }
    });

    const result = await service.handleDeletedObject(canonicalPath, "event-adversarial-delete");

    assert.deepEqual(result, { ignored: true, reason: "unsafe-record-quarantined" });
    assert.deepEqual(bucket.fileCalls, []);
    assert.equal(db.documents.get(itemPath).securityStatus, "quarantined");
    assert.equal(db.documents.get(usagePath).usedBytes, 64);
  }
});

test("reconcile pone registros ajenos en cuarentena sin tocar Storage ni cambiar sus bytes", async () => {
  const fileId = "file_reconcile_bad";
  const reservationId = "file_reservation_bad";
  const itemPath = `usuarios/${UID}/cloudFiles/${fileId}`;
  const reservationPath = `usuarios/${UID}/cloudUploadReservations/${reservationId}`;
  const usagePath = `usuarios/${UID}/cloudStorageUsage/current`;
  const { bucket, db, service } = createHarness({
    [itemPath]: cloudFile(fileId, { sizeBytes: 64 }),
    [reservationPath]: reservation(reservationId, { expiresAt: new Date(500), expectedSizeBytes: 32, sizeBytes: 32 }),
    [usagePath]: { maxBytes: 250 * 1024 * 1024, reservedBytes: 32, revision: 4, usedBytes: 64 }
  }, () => 1_000);

  const result = await service.reconcileUsage(UID);
  assert.equal(result.stats.unsafeRecords, 2);
  assert.deepEqual(bucket.fileCalls, []);
  assert.deepEqual(bucket.prefixes, [`mi-nube/${UID}/files/`]);
  assert.equal(db.documents.get(itemPath).securityStatus, "quarantined");
  assert.equal(db.documents.get(reservationPath).securityStatus, "quarantined");
  assert.equal(db.documents.get(usagePath).usedBytes, 64);
  assert.equal(db.documents.get(usagePath).reservedBytes, 32);
});
