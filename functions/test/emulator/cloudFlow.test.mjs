import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import admin from "firebase-admin";
import { assertFails } from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes
} from "firebase/storage";

import {
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError,
  pollUntil,
  PROJECT_ID,
  STORAGE_BUCKET,
  uniqueRequestId
} from "./environment.mjs";

let rulesEnvironment;
let adminApp;
const clients = new Set();

const encoder = new TextEncoder();
const fixtures = Object.freeze([
  Object.freeze({
    bytes: encoder.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
    mimeType: "application/pdf",
    name: "memoria.pdf"
  }),
  Object.freeze({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: "image/png",
    name: "esquema.png"
  }),
  Object.freeze({
    bytes: encoder.encode("Contenido privado UTF-8 de Mi nube.\n"),
    mimeType: "text/plain",
    name: "lectura.txt"
  })
]);

async function client(label, options) {
  const value = await createFlowClient(label, options);
  clients.add(value);
  return value;
}

async function reserveUploadAndConfirm(owner, fixture, parentFolderId = null) {
  const reservation = await owner.call("reserveCloudUpload", {
    mimeType: fixture.mimeType,
    name: fixture.name,
    originalName: fixture.name,
    ownerId: "forged-owner",
    ownerUid: "forged-owner",
    parentFolderId,
    requestId: uniqueRequestId("upload"),
    sizeBytes: fixture.bytes.byteLength,
    uid: "forged-owner"
  });
  assert.equal(reservation.ownerId, owner.uid);
  assert.match(reservation.storagePath, new RegExp(`^mi-nube/${owner.uid}/files/`, "u"));

  await uploadBytes(ref(owner.storage, reservation.storagePath), fixture.bytes, {
    contentType: reservation.mimeType,
    customMetadata: {
      fileId: reservation.fileId,
      ownerId: reservation.ownerId,
      reservationId: reservation.reservationId || reservation.fileId
    }
  });

  await owner.call("confirmCloudUpload", { fileId: reservation.fileId });
  const item = await pollUntil(async () => {
    const snapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", reservation.fileId));
    return snapshot.exists() && snapshot.data().uploadStatus === "ready"
      ? { id: snapshot.id, ...snapshot.data() }
      : null;
  }, { description: `confirmación de ${fixture.name}` });
  return { item, reservation };
}

before(async () => {
  rulesEnvironment = await createRulesTestEnvironment();
  adminApp = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
  }, `cloud-flow-${process.pid}`);
});

after(async () => {
  await Promise.allSettled([...clients].map((value) => value.destroy()));
  await adminApp?.delete();
  await rulesEnvironment?.cleanup();
});

test("callables crean, renombran, mueven, restauran y eliminan carpetas sin aceptar UID del payload", {
  timeout: 120000
}, async () => {
  const owner = await client("folder-owner");
  const other = await client("folder-other");
  const anonymous = await client("folder-anonymous", { authenticated: false });

  const rootResult = await owner.call("createCloudFolder", {
    name: "Artículos",
    ownerId: other.uid,
    requestId: uniqueRequestId("folder")
  });
  const root = rootResult.folder;
  assert.equal(root.ownerId, owner.uid, "El backend debe ignorar ownerId enviado por el navegador.");

  const childResult = await owner.call("createCloudFolder", {
    name: "Neurociencias",
    parentFolderId: root.id,
    requestId: uniqueRequestId("folder")
  });
  const child = childResult.folder;
  assert.equal(child.parentFolderId, root.id);

  await owner.call("renameCloudItem", { itemId: child.id, name: "Neurociencias clínicas" });
  await owner.call("moveCloudItem", { itemId: child.id, parentFolderId: null });
  let childSnapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", child.id));
  assert.equal(childSnapshot.data().name, "Neurociencias clínicas");
  assert.equal(childSnapshot.data().parentFolderId, null);

  await expectFirebaseError(
    other.call("renameCloudItem", { itemId: root.id, name: "Intrusión" }),
    ["not-found", "permission-denied"]
  );
  assert.equal((await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", root.id))).data().name,
    "Artículos");

  await expectFirebaseError(
    anonymous.call("createCloudFolder", { name: "Anónima", requestId: uniqueRequestId("folder") }),
    "unauthenticated"
  );

  await owner.call("trashCloudItem", { itemId: child.id });
  childSnapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", child.id));
  assert.equal(childSnapshot.data().deleted, true);
  await owner.call("restoreCloudItem", { itemId: child.id });
  assert.equal((await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", child.id))).data().deleted,
    false);

  await owner.call("trashCloudItem", { itemId: child.id });
  await owner.call("permanentlyDeleteCloudItem", { itemId: child.id });
  assert.equal((await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", child.id))).exists(), false);
});

test("flujo reserva → Storage → confirmación → contador funciona para PDF, imagen y texto privados", {
  timeout: 180000
}, async () => {
  const owner = await client("files-owner");
  const other = await client("files-other");
  const folder = (await owner.call("createCloudFolder", {
    name: "Pruebas",
    requestId: uniqueRequestId("folder")
  })).folder;

  const uploads = [];
  for (const fixture of fixtures) {
    uploads.push(await reserveUploadAndConfirm(owner, fixture, folder.id));
  }

  const expectedBytes = fixtures.reduce((total, fixture) => total + fixture.bytes.byteLength, 0);
  let usageSnapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudStorageUsage", "current"));
  assert.equal(usageSnapshot.data().usedBytes, expectedBytes);
  assert.equal(usageSnapshot.data().reservedBytes, 0);

  for (let index = 0; index < uploads.length; index += 1) {
    const { item, reservation } = uploads[index];
    const downloaded = await getBytes(ref(owner.storage, item.storagePath));
    assert.deepEqual(new Uint8Array(downloaded), fixtures[index].bytes);

    await expectFirebaseError(
      getBytes(ref(other.storage, item.storagePath)),
      ["storage/unauthorized", "unauthorized"]
    );
    await assertFails(getDoc(doc(other.firestore, "usuarios", owner.uid, "cloudFiles", item.id)));
    await expectFirebaseError(
      deleteObject(ref(owner.storage, reservation.storagePath)),
      ["storage/unauthorized", "unauthorized"]
    );
  }

  const first = uploads[0].item;
  await owner.call("renameCloudItem", { itemId: first.id, name: "memoria-renombrada.pdf" });
  await owner.call("moveCloudItem", { itemId: first.id, parentFolderId: null });
  const renamed = (await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudFiles", first.id))).data();
  assert.equal(renamed.name, "memoria-renombrada.pdf");
  assert.equal(renamed.parentFolderId, null);
  assert.equal(renamed.storagePath, first.storagePath, "Renombrar metadata no debe fabricar otra ruta física.");

  for (const { item } of uploads) {
    await owner.call("trashCloudItem", { itemId: item.id });
    usageSnapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudStorageUsage", "current"));
    assert.ok(usageSnapshot.data().usedBytes > 0, "La papelera sigue consumiendo cuota.");
    await owner.call("permanentlyDeleteCloudItem", { itemId: item.id });
  }

  usageSnapshot = await pollUntil(async () => {
    const snapshot = await getDoc(doc(owner.firestore, "usuarios", owner.uid, "cloudStorageUsage", "current"));
    return snapshot.data()?.usedBytes === 0 ? snapshot : null;
  }, { description: "liberación de cuota tras borrado definitivo" });
  assert.equal(usageSnapshot.data().reservedBytes, 0);
});

test("las callables Mi nube rechazan un token residual tras marcar la cuenta para eliminación", {
  timeout: 60000
}, async () => {
  const owner = await client("deleted-cloud-owner");
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "accountDeletionTombstones", owner.uid), {
      accountType: "paciente",
      accountUid: owner.uid,
      deletionState: "in_progress"
    });
  });

  await expectFirebaseError(
    owner.call("reserveCloudUpload", {
      mimeType: "application/pdf",
      name: "residual.pdf",
      originalName: "residual.pdf",
      requestId: uniqueRequestId("residual"),
      sizeBytes: fixtures[0].bytes.byteLength
    }),
    "failed-precondition"
  );
  await expectFirebaseError(
    owner.call("createCloudFolder", {
      name: "Residual",
      requestId: uniqueRequestId("residual-folder")
    }),
    "failed-precondition"
  );
});

test("el preflight profesional bloquea Mi nube sin borrar el perfil", {
  timeout: 60000
}, async () => {
  const owner = await client("preflight-cloud-owner");
  await Promise.all([
    admin.firestore(adminApp).doc(`usuarios/${owner.uid}`).set({
      nombre: "Profesional en validación",
      rol: "medico"
    }),
    admin.firestore(adminApp).doc(`accountDeletionTombstones/${owner.uid}`).set({
      accountType: "profesional",
      accountUid: owner.uid,
      deletionAttemptId: "preflight-cloud-test",
      deletionPhase: "preflight",
      deletionState: "in_progress"
    })
  ]);

  await expectFirebaseError(
    owner.call("createCloudFolder", {
      name: "No debe crearse",
      requestId: uniqueRequestId("preflight-folder")
    }),
    "failed-precondition"
  );
  const profile = await admin.firestore(adminApp).doc(`usuarios/${owner.uid}`).get();
  assert.equal(profile.exists, true);
  assert.equal(profile.data()?.rol, "medico");
});

test("un upload ya reservado que finaliza durante preflight se conserva", {
  timeout: 60000
}, async () => {
  const owner = await client("preflight-upload-owner");
  const reservation = await owner.call("reserveCloudUpload", {
    mimeType: fixtures[0].mimeType,
    name: fixtures[0].name,
    originalName: fixtures[0].name,
    requestId: uniqueRequestId("preflight-upload"),
    sizeBytes: fixtures[0].bytes.byteLength
  });
  await Promise.all([
    admin.firestore(adminApp).doc(`usuarios/${owner.uid}`).set({
      nombre: "Profesional con upload en curso",
      rol: "medico"
    }, { merge: true }),
    admin.firestore(adminApp).doc(`accountDeletionTombstones/${owner.uid}`).set({
      accountType: "profesional",
      accountUid: owner.uid,
      deletionAttemptId: "preflight-upload-test",
      deletionPhase: "preflight",
      deletionState: "in_progress"
    })
  ]);

  const object = admin.storage(adminApp).bucket(STORAGE_BUCKET).file(reservation.storagePath);
  await object.save(Buffer.from(fixtures[0].bytes), {
    metadata: {
      contentType: reservation.mimeType,
      metadata: {
        fileId: reservation.fileId,
        ownerId: reservation.ownerId,
        reservationId: reservation.reservationId || reservation.fileId
      }
    }
  });
  const item = await pollUntil(async () => {
    const snapshot = await admin.firestore(adminApp)
      .doc(`usuarios/${owner.uid}/cloudFiles/${reservation.fileId}`)
      .get();
    return snapshot.data()?.uploadStatus === "ready" ? snapshot : null;
  }, { description: "confirmación del upload durante preflight" });
  assert.equal(item.data()?.quotaAccounted, true);
  assert.equal((await object.exists())[0], true);
  await admin.firestore(adminApp).doc(`accountDeletionTombstones/${owner.uid}`).delete();
});
