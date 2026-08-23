import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from "firebase/firestore";

import {
  createRulesTestEnvironment,
  UID_OTHER,
  UID_OWNER
} from "./environment.mjs";

let environment;
let ownerDb;
let otherDb;
let anonymousDb;

const ownerFilePath = `usuarios/${UID_OWNER}/cloudFiles/file_existing`;
const usagePath = `usuarios/${UID_OWNER}/cloudStorageUsage/current`;
const reservationPath = `usuarios/${UID_OWNER}/cloudUploadReservations/file_existing`;

async function seedInternalCloudDocuments() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, ownerFilePath), {
        deleted: false,
        id: "file_existing",
        mimeType: "application/pdf",
        name: "memoria.pdf",
        ownerId: UID_OWNER,
        parentFolderId: null,
        quotaAccounted: true,
        sizeBytes: 128,
        storagePath: `mi-nube/${UID_OWNER}/files/file_existing/memoria.pdf`,
        type: "file"
      }),
      setDoc(doc(db, usagePath), {
        maxBytes: 250 * 1024 * 1024,
        reservedBytes: 0,
        revision: 1,
        usedBytes: 128
      }),
      setDoc(doc(db, reservationPath), {
        expectedSizeBytes: 128,
        fileId: "file_existing",
        ownerId: UID_OWNER,
        status: "committed"
      })
    ]);
  });
}

before(async () => {
  environment = await createRulesTestEnvironment();
  ownerDb = environment.authenticatedContext(UID_OWNER).firestore();
  otherDb = environment.authenticatedContext(UID_OTHER).firestore();
  anonymousDb = environment.unauthenticatedContext().firestore();
});

beforeEach(async () => {
  await environment.clearStorage();
  await environment.clearFirestore();
  await seedInternalCloudDocuments();
});

after(async () => {
  await environment?.cleanup();
});

test("Firestore permite al propietario consultar metadata y cuota, sin exponer reservas", async () => {
  const fileSnapshot = await assertSucceeds(getDoc(doc(ownerDb, ownerFilePath)));
  assert.equal(fileSnapshot.data().ownerId, UID_OWNER);

  const listSnapshot = await assertSucceeds(getDocs(collection(ownerDb, "usuarios", UID_OWNER, "cloudFiles")));
  assert.deepEqual(listSnapshot.docs.map((item) => item.id), ["file_existing"]);

  const usageSnapshot = await assertSucceeds(getDoc(doc(ownerDb, usagePath)));
  assert.equal(usageSnapshot.data().usedBytes, 128);

  await assertFails(getDoc(doc(ownerDb, reservationPath)));
  await assertFails(getDoc(doc(ownerDb, "usuarios", UID_OWNER, "cloudStorageUsage", "forged")));
});

test("Firestore deniega lectura y enumeración Mi nube a otro UID y a contexto anónimo", async () => {
  for (const db of [otherDb, anonymousDb]) {
    await assertFails(getDoc(doc(db, ownerFilePath)));
    await assertFails(getDocs(collection(db, "usuarios", UID_OWNER, "cloudFiles")));
    await assertFails(getDoc(doc(db, usagePath)));
    await assertFails(getDoc(doc(db, reservationPath)));
  }
});

test("ni siquiera el propietario puede fabricar metadata, carpetas o referencias físicas", async () => {
  const maliciousDocuments = [
    {
      path: `usuarios/${UID_OWNER}/cloudFiles/folder_forged`,
      data: {
        id: "folder_forged",
        name: "Carpeta falsa",
        ownerId: UID_OWNER,
        parentFolderId: null,
        type: "folder"
      }
    },
    {
      path: `usuarios/${UID_OWNER}/cloudFiles/file_forged`,
      data: {
        id: "file_forged",
        mimeType: "application/pdf",
        name: "falso.pdf",
        ownerId: UID_OWNER,
        sizeBytes: 1,
        storagePath: `mi-nube/${UID_OTHER}/files/file_forged/falso.pdf`,
        type: "file"
      }
    }
  ];

  for (const entry of maliciousDocuments) {
    await assertFails(setDoc(doc(ownerDb, entry.path), entry.data));
  }

  await assertFails(updateDoc(doc(ownerDb, ownerFilePath), {
    ownerId: UID_OTHER,
    storagePath: `mi-nube/${UID_OTHER}/files/file_existing/memoria.pdf`
  }));
  await assertFails(deleteDoc(doc(ownerDb, ownerFilePath)));
});

test("los contadores y reservas solo pueden ser modificados por backend/Admin SDK", async () => {
  for (const db of [ownerDb, otherDb, anonymousDb]) {
    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/cloudStorageUsage/forged`), {
      maxBytes: Number.MAX_SAFE_INTEGER,
      reservedBytes: 0,
      usedBytes: 0
    }));
    await assertFails(updateDoc(doc(db, usagePath), {
      maxBytes: Number.MAX_SAFE_INTEGER,
      reservedBytes: 0,
      usedBytes: 0
    }));
    await assertFails(deleteDoc(doc(db, usagePath)));

    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/cloudUploadReservations/manual`), {
      expectedSizeBytes: 1,
      expiresAt: new Date(Date.now() + 60_000),
      fileId: "manual",
      mimeType: "application/pdf",
      ownerId: UID_OWNER,
      status: "reserved",
      storagePath: `mi-nube/${UID_OWNER}/files/manual/manual.pdf`
    }));
    await assertFails(updateDoc(doc(db, reservationPath), { status: "reserved" }));
    await assertFails(deleteDoc(doc(db, reservationPath)));
  }
});

test("las exclusiones Mi nube no bloquean una subcolección heredada autorizada del propietario", async () => {
  const noteRef = doc(ownerDb, "usuarios", UID_OWNER, "apuntesMedico", "note_regression_probe");
  await assertSucceeds(setDoc(noteRef, {
    contenido: "Contenido de regresión",
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    titulo: "Apunte de regresión"
  }));
  assert.equal((await assertSucceeds(getDoc(noteRef))).data().titulo, "Apunte de regresión");
});

