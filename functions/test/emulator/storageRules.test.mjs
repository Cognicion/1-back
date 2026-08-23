import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  Timestamp
} from "firebase/firestore";
import {
  deleteObject,
  getBytes,
  getMetadata,
  listAll,
  ref,
  uploadBytes
} from "firebase/storage";

import {
  createRulesTestEnvironment,
  STORAGE_BUCKET_URL,
  UID_OTHER,
  UID_OWNER,
  uniqueRequestId
} from "./environment.mjs";

let environment;
let ownerStorage;
let otherStorage;
let anonymousStorage;

const encoder = new TextEncoder();
const validPdf = encoder.encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

function uploadMetadata({ fileId, ownerId = UID_OWNER, reservationId = fileId } = {}) {
  return {
    contentType: "application/pdf",
    customMetadata: { fileId, ownerId, reservationId }
  };
}

async function seedReservation({
  environmentUid = UID_OWNER,
  expiresAt = Date.now() + 10 * 60 * 1000,
  fileId = uniqueRequestId("file").replaceAll("-", "_"),
  filename = "memoria.pdf",
  mimeType = "application/pdf",
  ownerId = environmentUid,
  sizeBytes = validPdf.byteLength,
  status = "reserved",
  storagePath = null
} = {}) {
  const exactPath = storagePath || `mi-nube/${environmentUid}/files/${fileId}/${filename}`;
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "usuarios", environmentUid, "cloudUploadReservations", fileId), {
      expectedSizeBytes: sizeBytes,
      expiresAt: Timestamp.fromMillis(expiresAt),
      fileId,
      filename,
      id: fileId,
      mimeType,
      ownerId,
      sizeBytes,
      status,
      storageName: filename,
      storagePath: exactPath
    });
  });
  return { fileId, filename, mimeType, ownerId, sizeBytes, storagePath: exactPath };
}

before(async () => {
  environment = await createRulesTestEnvironment();
  ownerStorage = environment.authenticatedContext(UID_OWNER).storage(STORAGE_BUCKET_URL);
  otherStorage = environment.authenticatedContext(UID_OTHER).storage(STORAGE_BUCKET_URL);
  anonymousStorage = environment.unauthenticatedContext().storage(STORAGE_BUCKET_URL);
});

beforeEach(async () => {
  await environment.clearStorage();
  await environment.clearFirestore();
});

after(async () => {
  await environment?.cleanup();
});

test("Storage permite al propietario cargar, enumerar, leer y descargar el objeto reservado exacto", async () => {
  const reservation = await seedReservation();
  const objectRef = ref(ownerStorage, reservation.storagePath);
  await assertSucceeds(uploadBytes(objectRef, validPdf, uploadMetadata(reservation)));

  const bytes = await assertSucceeds(getBytes(objectRef));
  assert.deepEqual(new Uint8Array(bytes), validPdf);
  assert.equal((await assertSucceeds(getMetadata(objectRef))).contentType, "application/pdf");

  const listed = await assertSucceeds(listAll(ref(
    ownerStorage,
    `mi-nube/${UID_OWNER}/files/${reservation.fileId}`
  )));
  assert.deepEqual(listed.items.map((item) => item.fullPath), [reservation.storagePath]);
});

test("Storage deniega lectura, descarga y enumeración al otro UID y al contexto anónimo", async () => {
  const reservation = await seedReservation();
  await assertSucceeds(uploadBytes(ref(ownerStorage, reservation.storagePath), validPdf, uploadMetadata(reservation)));

  for (const storage of [otherStorage, anonymousStorage]) {
    await assertFails(getBytes(ref(storage, reservation.storagePath)));
    await assertFails(getMetadata(ref(storage, reservation.storagePath)));
    await assertFails(listAll(ref(storage, `mi-nube/${UID_OWNER}/files/${reservation.fileId}`)));
  }
});

test("otro UID y contexto anónimo no pueden usar una reserva válida del propietario", async () => {
  const reservation = await seedReservation();
  for (const storage of [otherStorage, anonymousStorage]) {
    await assertFails(uploadBytes(
      ref(storage, reservation.storagePath),
      validPdf,
      uploadMetadata(reservation)
    ));
  }
});

test("una reserva no permite sobrescritura, modificación ni eliminación directa por el cliente", async () => {
  const reservation = await seedReservation();
  const objectRef = ref(ownerStorage, reservation.storagePath);
  await assertSucceeds(uploadBytes(objectRef, validPdf, uploadMetadata(reservation)));

  await assertFails(uploadBytes(objectRef, validPdf, uploadMetadata(reservation)));
  await assertFails(deleteObject(objectRef));
  assert.equal((await assertSucceeds(getMetadata(objectRef))).size, validPdf.byteLength);
});

test("Storage rechaza metadatos privados, tamaño, MIME, ruta y estado de reserva manipulados", async () => {
  const metadataOwner = await seedReservation();
  await assertFails(uploadBytes(
    ref(ownerStorage, metadataOwner.storagePath),
    validPdf,
    uploadMetadata({ ...metadataOwner, ownerId: UID_OTHER })
  ));

  const metadataFile = await seedReservation();
  await assertFails(uploadBytes(
    ref(ownerStorage, metadataFile.storagePath),
    validPdf,
    uploadMetadata({ ...metadataFile, fileId: "file_ajeno" })
  ));

  const metadataReservation = await seedReservation();
  await assertFails(uploadBytes(
    ref(ownerStorage, metadataReservation.storagePath),
    validPdf,
    uploadMetadata({ ...metadataReservation, reservationId: "reservation_reused" })
  ));

  const wrongSize = await seedReservation({ sizeBytes: validPdf.byteLength + 1 });
  await assertFails(uploadBytes(ref(ownerStorage, wrongSize.storagePath), validPdf, uploadMetadata(wrongSize)));

  const wrongMime = await seedReservation();
  await assertFails(uploadBytes(ref(ownerStorage, wrongMime.storagePath), validPdf, {
    ...uploadMetadata(wrongMime),
    contentType: "text/plain"
  }));

  const forbiddenMime = await seedReservation({
    filename: "script.js",
    mimeType: "application/javascript",
    sizeBytes: 3
  });
  await assertFails(uploadBytes(ref(ownerStorage, forbiddenMime.storagePath), encoder.encode("abc"), {
    contentType: "application/javascript",
    customMetadata: {
      fileId: forbiddenMime.fileId,
      ownerId: UID_OWNER,
      reservationId: forbiddenMime.fileId
    }
  }));

  const wrongFilename = await seedReservation();
  await assertFails(uploadBytes(
    ref(ownerStorage, `mi-nube/${UID_OWNER}/files/${wrongFilename.fileId}/otro.pdf`),
    validPdf,
    uploadMetadata(wrongFilename)
  ));

  const wrongFileId = await seedReservation();
  await assertFails(uploadBytes(
    ref(ownerStorage, `mi-nube/${UID_OWNER}/files/file_otro/${wrongFileId.filename}`),
    validPdf,
    uploadMetadata({ ...wrongFileId, fileId: "file_otro" })
  ));

  const committed = await seedReservation({ status: "committed" });
  await assertFails(uploadBytes(ref(ownerStorage, committed.storagePath), validPdf, uploadMetadata(committed)));

  const expired = await seedReservation({ expiresAt: Date.now() - 1000 });
  await assertFails(uploadBytes(ref(ownerStorage, expired.storagePath), validPdf, uploadMetadata(expired)));
});

test("Storage rechaza rutas de otro UID, objetos sin reserva y archivos vacíos", async () => {
  const otherReservation = await seedReservation({ environmentUid: UID_OTHER });
  await assertFails(uploadBytes(
    ref(ownerStorage, otherReservation.storagePath),
    validPdf,
    uploadMetadata({ ...otherReservation, ownerId: UID_OTHER })
  ));

  const noReservationId = "file_without_reservation";
  await assertFails(uploadBytes(
    ref(ownerStorage, `mi-nube/${UID_OWNER}/files/${noReservationId}/memoria.pdf`),
    validPdf,
    uploadMetadata({ fileId: noReservationId })
  ));

  const empty = await seedReservation({ sizeBytes: 0 });
  await assertFails(uploadBytes(
    ref(ownerStorage, empty.storagePath),
    new Uint8Array(),
    uploadMetadata(empty)
  ));
});

