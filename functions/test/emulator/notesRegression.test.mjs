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

const noteId = "note_single_source";
const folderId = "notes_folder_single_source";
const notePath = `usuarios/${UID_OWNER}/apuntesMedico/${noteId}`;
const folderPath = `usuarios/${UID_OWNER}/carpetasApuntes/${folderId}`;
const usagePath = `usuarios/${UID_OWNER}/cloudStorageUsage/current`;

before(async () => {
  environment = await createRulesTestEnvironment();
  ownerDb = environment.authenticatedContext(UID_OWNER).firestore();
  otherDb = environment.authenticatedContext(UID_OTHER).firestore();
  anonymousDb = environment.unauthenticatedContext().firestore();
});

beforeEach(async () => {
  await environment.clearStorage();
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), usagePath), {
      maxBytes: 250 * 1024 * 1024,
      reservedBytes: 0,
      revision: 0,
      usedBytes: 0
    });
  });
});

after(async () => {
  await environment?.cleanup();
});

test("Mis apuntes y su árbol siguen siendo CRUD exclusivo del UID propietario", async () => {
  const noteRef = doc(ownerDb, notePath);
  const folderRef = doc(ownerDb, folderPath);

  await assertSucceeds(setDoc(folderRef, {
    carpetaPadreId: null,
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    nombre: "Neurociencias"
  }));
  await assertSucceeds(setDoc(noteRef, {
    carpetaId: folderId,
    contenido: "Versión creada desde el acceso tradicional de Mis apuntes.",
    fechaCreacion: "2026-08-22T00:00:00.000Z",
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    titulo: "Neurobiología de la memoria"
  }));

  assert.equal((await assertSucceeds(getDoc(folderRef))).data().nombre, "Neurociencias");
  assert.equal((await assertSucceeds(getDoc(noteRef))).data().carpetaId, folderId);

  await assertSucceeds(updateDoc(folderRef, { nombre: "Neurociencias clínicas" }));
  await assertSucceeds(updateDoc(noteRef, {
    contenido: "Versión editada desde el acceso alternativo de Mi nube.",
    fechaActualizacion: "2026-08-22T00:01:00.000Z"
  }));

  assert.equal((await assertSucceeds(getDoc(noteRef))).data().contenido,
    "Versión editada desde el acceso alternativo de Mi nube.");

  await assertSucceeds(deleteDoc(noteRef));
  await assertSucceeds(deleteDoc(folderRef));
  assert.equal((await assertSucceeds(getDoc(noteRef))).exists(), false);
});

test("la vista alternativa opera sobre el mismo documento y no crea copias ni consume cuota", async () => {
  const noteRef = doc(ownerDb, notePath);
  await assertSucceeds(setDoc(noteRef, {
    contenido: "Texto original",
    fechaCreacion: "2026-08-22T00:00:00.000Z",
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    titulo: "Fuente única"
  }));

  // Mi nube redirige al mismo editor y, por tanto, actualiza esta referencia exacta.
  await assertSucceeds(updateDoc(noteRef, {
    contenido: "Texto actualizado desde Mi nube",
    fechaActualizacion: "2026-08-22T00:02:00.000Z"
  }));

  const notes = await assertSucceeds(getDocs(collection(ownerDb, "usuarios", UID_OWNER, "apuntesMedico")));
  assert.equal(notes.size, 1);
  assert.equal(notes.docs[0].id, noteId);
  assert.equal(notes.docs[0].data().contenido, "Texto actualizado desde Mi nube");

  const cloudFiles = await assertSucceeds(getDocs(collection(ownerDb, "usuarios", UID_OWNER, "cloudFiles")));
  assert.equal(cloudFiles.empty, true, "Un apunte no debe duplicarse como cloud-file.");

  const usage = (await assertSucceeds(getDoc(doc(ownerDb, usagePath)))).data();
  assert.equal(usage.usedBytes, 0);
  assert.equal(usage.reservedBytes, 0);
});

test("otro UID y el contexto anónimo no pueden leer, crear, editar ni borrar apuntes o carpetas ajenos", async () => {
  await assertSucceeds(setDoc(doc(ownerDb, notePath), {
    contenido: "Privado",
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    titulo: "Privado"
  }));
  await assertSucceeds(setDoc(doc(ownerDb, folderPath), {
    carpetaPadreId: null,
    nombre: "Privada"
  }));

  for (const db of [otherDb, anonymousDb]) {
    await assertFails(getDoc(doc(db, notePath)));
    await assertFails(getDocs(collection(db, "usuarios", UID_OWNER, "apuntesMedico")));
    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/apuntesMedico/forged`), {
      contenido: "Intrusión",
      titulo: "Intrusión"
    }));
    await assertFails(updateDoc(doc(db, notePath), { contenido: "Intrusión" }));
    await assertFails(deleteDoc(doc(db, notePath)));

    await assertFails(getDoc(doc(db, folderPath)));
    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/carpetasApuntes/forged`), {
      nombre: "Intrusión"
    }));
    await assertFails(updateDoc(doc(db, folderPath), { nombre: "Intrusión" }));
    await assertFails(deleteDoc(doc(db, folderPath)));
  }
});

