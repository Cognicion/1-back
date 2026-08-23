import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import {
  doc,
  getDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import {
  getBytes,
  ref,
  uploadBytes
} from "firebase/storage";

import {
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError,
  pollUntil,
  uniqueRequestId
} from "./environment.mjs";

const require = createRequire(import.meta.url);
const { MAX_STORAGE_BYTES } = require("../../cloudStorage/config.js");
const {
  availableBytes,
  commitReservedBytes,
  reserveBytes
} = require("../../cloudStorage/quotaTransitions.js");

const MIB = 1024 * 1024;
const clients = new Set();
let rulesEnvironment;

async function client(label) {
  const value = await createFlowClient(label);
  clients.add(value);
  return value;
}

function reservationPayload(sizeBytes, prefix = "quota") {
  return {
    mimeType: "application/pdf",
    name: `${prefix}.pdf`,
    originalName: `${prefix}.pdf`,
    requestId: uniqueRequestId(prefix),
    sizeBytes
  };
}

async function readUsage(owner) {
  const snapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudStorageUsage", "current"));
  return snapshot.exists()
    ? snapshot.data()
    : { maxBytes: MAX_STORAGE_BYTES, reservedBytes: 0, usedBytes: 0 };
}

async function readInternal(path) {
  let snapshot = null;
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    snapshot = await getDoc(doc(context.firestore(), path));
  });
  return snapshot;
}

before(async () => {
  rulesEnvironment = await createRulesTestEnvironment();
});

after(async () => {
  await Promise.allSettled([...clients].map((value) => value.destroy()));
  await rulesEnvironment?.cleanup();
});

test("backend puro fija 250 MiB, acepta el borde exacto y rechaza un byte adicional", () => {
  assert.equal(MAX_STORAGE_BYTES, 250 * MIB);
  assert.equal(availableBytes({ usedBytes: 0, reservedBytes: 0 }), MAX_STORAGE_BYTES);
  assert.throws(() => reserveBytes({}, 0), (error) => error.code === "invalid-argument");

  const atLimit = reserveBytes({}, MAX_STORAGE_BYTES);
  assert.equal(atLimit.reservedBytes, MAX_STORAGE_BYTES);
  assert.equal(availableBytes(atLimit), 0);
  assert.throws(() => reserveBytes(atLimit, 1), (error) => error.code === "resource-exhausted");

  const committed = commitReservedBytes(atLimit, MAX_STORAGE_BYTES, MAX_STORAGE_BYTES);
  assert.equal(committed.usedBytes, MAX_STORAGE_BYTES);
  assert.equal(committed.reservedBytes, 0);
});

test("callables mantienen los límites 0, 249 MiB, 250 MiB y over-limit sin transferencias gigantes", {
  timeout: 180000
}, async () => {
  const owner = await client("quota-boundaries");
  assert.deepEqual(await readUsage(owner), {
    maxBytes: MAX_STORAGE_BYTES,
    reservedBytes: 0,
    usedBytes: 0
  });

  await expectFirebaseError(owner.call("reserveCloudUpload", reservationPayload(0, "zero")), "invalid-argument");
  await expectFirebaseError(
    owner.call("reserveCloudUpload", reservationPayload(MAX_STORAGE_BYTES + 1, "over")),
    "resource-exhausted"
  );

  const first = await owner.call("reserveCloudUpload", reservationPayload(249 * MIB, "two-forty-nine"));
  let usage = await readUsage(owner);
  assert.equal(usage.usedBytes, 0);
  assert.equal(usage.reservedBytes, 249 * MIB);

  const finalMib = await owner.call("reserveCloudUpload", reservationPayload(MIB, "last-megabyte"));
  usage = await readUsage(owner);
  assert.equal(usage.reservedBytes, MAX_STORAGE_BYTES);
  await expectFirebaseError(owner.call("reserveCloudUpload", reservationPayload(1, "one-byte-over")),
    "resource-exhausted");

  await owner.call("cancelCloudUpload", { fileId: first.fileId });
  await owner.call("cancelCloudUpload", { fileId: finalMib.fileId });
  assert.equal((await readUsage(owner)).reservedBytes, 0);

  const exact = await owner.call("reserveCloudUpload", reservationPayload(MAX_STORAGE_BYTES, "exact-limit"));
  assert.equal((await readUsage(owner)).reservedBytes, MAX_STORAGE_BYTES);
  await owner.call("cancelCloudUpload", { fileId: exact.fileId });
  assert.equal((await readUsage(owner)).reservedBytes, 0);
});

test("transacciones serializan reservas concurrentes cercanas al límite", {
  timeout: 180000
}, async () => {
  const exactOwner = await client("quota-concurrent-exact");
  const exactResults = await Promise.all([
    exactOwner.call("reserveCloudUpload", reservationPayload(125 * MIB, "exact-a")),
    exactOwner.call("reserveCloudUpload", reservationPayload(125 * MIB, "exact-b"))
  ]);
  assert.equal((await readUsage(exactOwner)).reservedBytes, MAX_STORAGE_BYTES);
  await Promise.all(exactResults.map((reservation) => exactOwner.call("cancelCloudUpload", {
    fileId: reservation.fileId
  })));
  assert.equal((await readUsage(exactOwner)).reservedBytes, 0);

  const overOwner = await client("quota-concurrent-over");
  const eachSize = 125 * MIB + 1;
  const overResults = await Promise.allSettled([
    overOwner.call("reserveCloudUpload", reservationPayload(eachSize, "over-a")),
    overOwner.call("reserveCloudUpload", reservationPayload(eachSize, "over-b"))
  ]);
  assert.equal(overResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(overResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await readUsage(overOwner)).reservedBytes, eachSize);
  const accepted = overResults.find((result) => result.status === "fulfilled").value;
  await overOwner.call("cancelCloudUpload", { fileId: accepted.fileId });
  assert.equal((await readUsage(overOwner)).reservedBytes, 0);
});

test("un upload con tamaño distinto no entra a Storage y la cancelación evita cuota fantasma", {
  timeout: 120000
}, async () => {
  const owner = await client("quota-size-mismatch");
  const actual = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
  const reservation = await owner.call("reserveCloudUpload", reservationPayload(actual.byteLength + 1, "mismatch"));

  await expectFirebaseError(uploadBytes(ref(owner.storage, reservation.storagePath), actual, {
    contentType: reservation.mimeType,
    customMetadata: {
      fileId: reservation.fileId,
      ownerId: reservation.ownerId,
      reservationId: reservation.reservationId
    }
  }), ["storage/unauthorized", "unauthorized"]);
  assert.equal((await readUsage(owner)).reservedBytes, actual.byteLength + 1);

  await owner.call("cancelCloudUpload", { fileId: reservation.fileId });
  const usage = await readUsage(owner);
  assert.equal(usage.reservedBytes, 0);
  assert.equal(usage.usedBytes, 0);
});

test("contenido inválido del tamaño reservado se rechaza, elimina y libera de forma idempotente", {
  timeout: 180000
}, async () => {
  const owner = await client("quota-invalid-content");
  const invalidPdf = new TextEncoder().encode("MZ-NO-ES-PDF");
  const reservation = await owner.call("reserveCloudUpload", reservationPayload(invalidPdf.byteLength, "invalid"));
  await uploadBytes(ref(owner.storage, reservation.storagePath), invalidPdf, {
    contentType: reservation.mimeType,
    customMetadata: {
      fileId: reservation.fileId,
      ownerId: reservation.ownerId,
      reservationId: reservation.reservationId
    }
  });

  await expectFirebaseError(
    owner.call("confirmCloudUpload", { fileId: reservation.fileId }),
    ["failed-precondition", "not-found"]
  );

  await pollUntil(async () => {
    const reservationSnapshot = await readInternal(
      `usuarios/${owner.uid}/cloudUploadReservations/${reservation.fileId}`
    );
    const usage = await readUsage(owner);
    return reservationSnapshot.data()?.status === "rejected"
      && usage.reservedBytes === 0
      && usage.usedBytes === 0;
  }, { description: "rechazo y liberación del contenido inválido" });

  await expectFirebaseError(getBytes(ref(owner.storage, reservation.storagePath)), [
    "storage/object-not-found",
    "object-not-found"
  ]);
  await expectFirebaseError(owner.call("confirmCloudUpload", { fileId: reservation.fileId }),
    "failed-precondition");
});

test("reconciliación expira una reserva vencida y libera reservedBytes", {
  timeout: 180000
}, async () => {
  const owner = await client("quota-expired");
  const reservation = await owner.call("reserveCloudUpload", reservationPayload(4096, "expired"));
  assert.equal((await readUsage(owner)).reservedBytes, 4096);

  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(
      context.firestore(),
      "usuarios",
      owner.uid,
      "cloudUploadReservations",
      reservation.fileId
    ), {
      expiresAt: Timestamp.fromMillis(Date.now() - 1000)
    });
  });

  await owner.call("reconcileCloudStorageUsage");
  const internal = await readInternal(`usuarios/${owner.uid}/cloudUploadReservations/${reservation.fileId}`);
  assert.equal(internal.data().status, "expired");
  const usage = await readUsage(owner);
  assert.equal(usage.reservedBytes, 0);
  assert.equal(usage.usedBytes, 0);
});
