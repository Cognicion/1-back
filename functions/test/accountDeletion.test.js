"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AccountDeletionError,
  beginAccountDeletionPreflight,
  cancelAccountDeletionPreflight,
  markAccountDeletion,
  promoteAccountDeletionPreflight
} = require("../accountSecurity/accountDeletion");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class Snapshot {
  constructor(value) {
    this.exists = value !== undefined;
    this.value = clone(value);
  }

  data() {
    return clone(this.value);
  }
}

class Reference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  set(value, options = {}) {
    this.db.set(this.path, value, options);
    return Promise.resolve();
  }
}

class MemoryFirestore {
  constructor(initial = {}) {
    this.records = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
  }

  doc(path) {
    return new Reference(this, path);
  }

  set(path, value, options = {}) {
    const previous = options.merge === true ? this.records.get(path) || {} : {};
    this.records.set(path, { ...clone(previous), ...clone(value) });
  }

  runTransaction(callback) {
    return callback({
      delete: (reference) => this.records.delete(reference.path),
      get: async (reference) => new Snapshot(this.records.get(reference.path)),
      set: (reference, value, options = {}) => this.set(reference.path, value, options),
      update: (reference, value) => this.set(reference.path, value, { merge: true })
    });
  }
}

const NOW = new Date("2026-08-26T18:00:00.000Z");

test("el tombstone y la reserva de vinculación se serializan antes del borrado", async () => {
  const uid = "uidReservedPatient";
  const db = new MemoryFirestore({
    [`usuarios/${uid}`]: {
      rol: "paciente",
      vinculacionReservaEstado: "reservado"
    }
  });

  await assert.rejects(
    markAccountDeletion({
      adminUid: "uidAdmin",
      db,
      guardAccountRef: db.doc(`usuarios/${uid}`),
      now: () => new Date(NOW),
      type: "paciente",
      uid
    }),
    (error) => error instanceof AccountDeletionError && error.code === "failed-precondition"
  );
  assert.equal(db.records.has(`accountDeletionTombstones/${uid}`), false);
});

test("un borrado ya marcado puede reintentarse aunque haya quedado una reserva residual", async () => {
  const uid = "uidRetryPatient";
  const tombstonePath = `accountDeletionTombstones/${uid}`;
  const db = new MemoryFirestore({
    [`usuarios/${uid}`]: {
      rol: "paciente",
      vinculacionReservaEstado: "reservado"
    },
    [tombstonePath]: {
      accountType: "paciente",
      accountUid: uid,
      deletionState: "in_progress"
    }
  });

  await markAccountDeletion({
    adminUid: "uidAdmin",
    db,
    guardAccountRef: db.doc(`usuarios/${uid}`),
    now: () => new Date(NOW),
    type: "paciente",
    uid
  });

  assert.equal(db.records.get(tombstonePath).deletionState, "in_progress");
  assert.equal(db.records.get(tombstonePath).deletionStartedAt, NOW.toISOString());
});

test("el preflight profesional se libera solo por el intento propietario", async () => {
  const uid = "uidProfessionalPreflight";
  const tombstonePath = `accountDeletionTombstones/${uid}`;
  const db = new MemoryFirestore({
    [`usuarios/${uid}`]: { rol: "psicologo" }
  });

  const result = await beginAccountDeletionPreflight({
    adminUid: "uidAdmin",
    attemptId: "attempt-owner",
    db,
    guardAccountRef: db.doc(`usuarios/${uid}`),
    now: () => new Date(NOW),
    type: "profesional",
    uid
  });

  assert.equal(result.acquired, true);
  assert.equal(db.records.get(tombstonePath).deletionPhase, "preflight");
  assert.equal(
    await cancelAccountDeletionPreflight({ attemptId: "attempt-other", db, uid }),
    false
  );
  assert.equal(db.records.has(tombstonePath), true);
  assert.equal(
    await cancelAccountDeletionPreflight({ attemptId: "attempt-owner", db, uid }),
    true
  );
  assert.equal(db.records.has(tombstonePath), false);
});

test("el preflight profesional se promueve de forma condicional antes de borrar", async () => {
  const uid = "uidProfessionalPromote";
  const tombstonePath = `accountDeletionTombstones/${uid}`;
  const db = new MemoryFirestore({
    [`usuarios/${uid}`]: { rol: "medico" }
  });
  await beginAccountDeletionPreflight({
    adminUid: "uidAdmin",
    attemptId: "attempt-promote",
    db,
    guardAccountRef: db.doc(`usuarios/${uid}`),
    now: () => new Date(NOW),
    type: "profesional",
    uid
  });

  await assert.rejects(
    promoteAccountDeletionPreflight({ attemptId: "attempt-other", db, uid }),
    (error) => error instanceof AccountDeletionError && error.code === "aborted"
  );
  await promoteAccountDeletionPreflight({ attemptId: "attempt-promote", db, uid });
  assert.equal(db.records.get(tombstonePath).deletionPhase, "destructive");
  assert.equal(
    await cancelAccountDeletionPreflight({ attemptId: "attempt-promote", db, uid }),
    false
  );
});

test("un preflight activo bloquea otro intento y uno vencido puede recuperarse", async () => {
  const uid = "uidProfessionalLease";
  const tombstonePath = `accountDeletionTombstones/${uid}`;
  const db = new MemoryFirestore({
    [`usuarios/${uid}`]: { rol: "enfermeria_salud_mental" },
    [tombstonePath]: {
      accountType: "profesional",
      accountUid: uid,
      deletionAttemptId: "attempt-old",
      deletionPhase: "preflight",
      deletionStartedAt: NOW.toISOString(),
      deletionState: "in_progress"
    }
  });
  const input = {
    adminUid: "uidAdmin",
    attemptId: "attempt-new",
    db,
    guardAccountRef: db.doc(`usuarios/${uid}`),
    now: () => new Date(NOW),
    type: "profesional",
    uid
  };

  await assert.rejects(
    beginAccountDeletionPreflight(input),
    (error) => error instanceof AccountDeletionError && error.code === "already-exists"
  );
  const recovered = await beginAccountDeletionPreflight({
    ...input,
    now: () => new Date(NOW.getTime() + 11 * 60 * 1000)
  });
  assert.equal(recovered.acquired, true);
  assert.equal(db.records.get(tombstonePath).deletionAttemptId, "attempt-new");
});
