"use strict";

const ACCOUNT_DELETION_TOMBSTONES_COLLECTION = "accountDeletionTombstones";

class AccountDeletionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccountDeletionError";
    this.code = code;
  }
}

function accountDeletionTombstonePath(uid) {
  return `${ACCOUNT_DELETION_TOMBSTONES_COLLECTION}/${uid}`;
}

async function accountDeletionTombstoneExists({ db, uid }) {
  if (!uid) return false;
  const snapshot = await db.doc(accountDeletionTombstonePath(uid)).get();
  return snapshot.exists;
}

function accountDeletionTombstoneData({ adminUid, now = new Date(), type, uid }) {
  return {
    accountUid: uid,
    accountType: String(type || "cuenta"),
    deletedByAdminUid: adminUid,
    deletionState: "in_progress",
    deletionStartedAt: now.toISOString()
  };
}

function deletionTimestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function beginAccountDeletionPreflight({
  adminUid,
  attemptId,
  db,
  guardAccountRef = null,
  leaseMs = 10 * 60 * 1000,
  now = () => new Date(),
  type,
  uid
}) {
  const reference = db.doc(accountDeletionTombstonePath(uid));
  const currentDate = now();
  const normalizedAttemptId = String(attemptId || "").trim();
  if (!normalizedAttemptId) {
    throw new AccountDeletionError("invalid-argument", "No se pudo identificar el intento de eliminación.");
  }

  return db.runTransaction(async (transaction) => {
    const [existingTombstone, accountSnapshot] = await Promise.all([
      transaction.get(reference),
      guardAccountRef ? transaction.get(guardAccountRef) : Promise.resolve(null)
    ]);
    const existing = existingTombstone.exists ? existingTombstone.data() || {} : null;
    if (existing) {
      if (existing.accountUid !== uid || existing.accountType !== type) {
        throw new AccountDeletionError("failed-precondition", "La cuenta tiene una eliminación incompatible en curso.");
      }
      if (existing.deletionState === "completed") {
        return { acquired: false, completed: true, reference };
      }
      if (!existing.deletionPhase || existing.deletionPhase === "destructive") {
        return { acquired: false, destructive: true, reference };
      }
      const startedAt = deletionTimestampMillis(existing.deletionStartedAt);
      const leaseIsActive = existing.deletionPhase === "preflight"
        && startedAt > 0
        && currentDate.getTime() - startedAt < leaseMs;
      if (leaseIsActive) {
        throw new AccountDeletionError("already-exists", "Ya hay una validación de eliminación en curso para esta cuenta.");
      }
    } else {
      const account = accountSnapshot?.exists ? accountSnapshot.data() || {} : {};
      if (account.vinculacionReservaEstado === "reservado") {
        throw new AccountDeletionError(
          "failed-precondition",
          "La cuenta está participando en una vinculación. Intenta eliminarla nuevamente cuando finalice."
        );
      }
    }

    transaction.set(reference, {
      ...accountDeletionTombstoneData({ adminUid, now: currentDate, type, uid }),
      deletionAttemptId: normalizedAttemptId,
      deletionPhase: "preflight"
    }, { merge: true });
    return { acquired: true, attemptId: normalizedAttemptId, reference };
  });
}

async function cancelAccountDeletionPreflight({ attemptId, db, uid }) {
  const reference = db.doc(accountDeletionTombstonePath(uid));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const ownsPreflight = data.deletionState === "in_progress"
      && data.deletionPhase === "preflight"
      && data.deletionAttemptId === attemptId;
    if (!ownsPreflight) return false;
    transaction.delete(reference);
    return true;
  });
}

async function promoteAccountDeletionPreflight({ attemptId, db, uid }) {
  const reference = db.doc(accountDeletionTombstonePath(uid));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const ownsPreflight = data.deletionState === "in_progress"
      && data.deletionPhase === "preflight"
      && data.deletionAttemptId === attemptId;
    if (!ownsPreflight) {
      throw new AccountDeletionError("aborted", "La validación de eliminación perdió su reserva; vuelve a intentarlo.");
    }
    transaction.update(reference, {
      deletionPhase: "destructive"
    });
    return true;
  });
}

async function markAccountDeletion({ adminUid, db, guardAccountRef = null, now = () => new Date(), type, uid }) {
  const reference = db.doc(accountDeletionTombstonePath(uid));
  const data = accountDeletionTombstoneData({
    adminUid,
    now: now(),
    type,
    uid
  });
  if (guardAccountRef) {
    await db.runTransaction(async (transaction) => {
      const [existingTombstone, accountSnapshot] = await Promise.all([
        transaction.get(reference),
        transaction.get(guardAccountRef)
      ]);
      const account = accountSnapshot.exists ? accountSnapshot.data() || {} : {};
      if (!existingTombstone.exists && account.vinculacionReservaEstado === "reservado") {
        throw new AccountDeletionError(
          "failed-precondition",
          "La cuenta está participando en una vinculación. Intenta eliminarla nuevamente cuando finalice."
        );
      }
      transaction.set(reference, data, { merge: true });
    });
  } else {
    await reference.set(data, { merge: true });
  }
  return reference;
}

module.exports = {
  ACCOUNT_DELETION_TOMBSTONES_COLLECTION,
  AccountDeletionError,
  accountDeletionTombstoneData,
  accountDeletionTombstoneExists,
  accountDeletionTombstonePath,
  beginAccountDeletionPreflight,
  cancelAccountDeletionPreflight,
  deletionTimestampMillis,
  markAccountDeletion,
  promoteAccountDeletionPreflight
};
