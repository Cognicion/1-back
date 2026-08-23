import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
  createRulesTestEnvironment,
  expectFirebaseError,
  FUNCTIONS_REGION,
  PROJECT_ID,
  requireFlowEmulators,
  STORAGE_BUCKET
} from "./environment.mjs";

let rulesEnvironment;
let adminApp;
let adminDb;
const clients = new Set();

async function stage(label, operation) {
  try {
    return await operation();
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

async function client(label, options) {
  const endpoints = requireFlowEmulators();
  const app = initializeApp({
    apiKey: "emulator-only-not-a-real-key",
    appId: "1:1037684177162:web:admin-emulator-only",
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    messagingSenderId: "1037684177162",
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
  }, `admin-emulator-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${endpoints.auth.host}:${endpoints.auth.port}`, { disableWarnings: true });
  const functions = getFunctions(app, FUNCTIONS_REGION);
  connectFunctionsEmulator(functions, endpoints.functions.host, endpoints.functions.port);
  if (options?.authenticated !== false) await signInAnonymously(auth);
  const value = Object.freeze({
    app,
    auth,
    call(name, payload = {}) {
      return httpsCallable(functions, name)(payload).then((result) => result.data);
    },
    destroy: () => deleteApp(app),
    uid: auth.currentUser?.uid || null
  });
  clients.add(value);
  return value;
}

async function seed(records) {
  await Promise.all(Object.entries(records).map(([path, value]) => adminDb.doc(path).set(value)));
}

async function auditEvents(action) {
  const snapshot = await adminDb.collection("auditoria").where("action", "==", action).get();
  return snapshot.docs.map((item) => item.data());
}

before(async () => {
  rulesEnvironment = await createRulesTestEnvironment();
  adminApp = initializeAdminApp({ projectId: PROJECT_ID }, `admin-moderation-test-${randomUUID()}`);
  adminDb = getAdminFirestore(adminApp);
});

beforeEach(async () => {
  await rulesEnvironment.clearFirestore();
});

after(async () => {
  await Promise.allSettled([...clients].map((value) => value.destroy()));
  if (adminApp) await deleteAdminApp(adminApp);
  await rulesEnvironment?.cleanup();
});

test("callable administrativa lista solo después de validar rol y registra una auditoría única", {
  timeout: 120000
}, async () => {
  const admin = await stage("crear admin", () => client("cloud-admin-list"));
  const owner = await stage("crear owner", () => client("cloud-admin-owner"));
  await stage("seed", () => seed({
    [`usuarios/${admin.uid}`]: { rol: "admin" },
    [`usuarios/${owner.uid}`]: { rol: "paciente" },
    [`usuarios/${owner.uid}/cloudStorageUsage/current`]: {
      usedBytes: 2048,
      reservedBytes: 256,
      maxBytes: 262144000
    },
    [`usuarios/${owner.uid}/cloudFiles/folder_docs`]: {
      id: "folder_docs",
      ownerId: owner.uid,
      name: "Documentos",
      nameNormalized: "documentos",
      type: "folder",
      sourceType: "cloud-file",
      parentFolderId: null,
      deleted: false
    },
    [`usuarios/${owner.uid}/cloudFiles/file_pdf`]: {
      id: "file_pdf",
      ownerId: owner.uid,
      name: "reporte.pdf",
      nameNormalized: "reporte.pdf",
      originalName: "reporte.pdf",
      storageName: "reporte.pdf",
      storagePath: `mi-nube/${owner.uid}/files/file_pdf/reporte.pdf`,
      extension: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      type: "file",
      sourceType: "cloud-file",
      parentFolderId: null,
      deleted: false
    }
  }));

  const result = await stage("call list", () => admin.call("listAdminCloudFiles", {
    ownerUid: owner.uid,
    parentFolderId: null,
    deleted: false,
    pageSize: 40
  }));
  assert.equal(result.items.length, 2);
  assert.equal(result.usage.usedBytes, 2048);
  assert.equal(result.counts.activeFiles, 1);
  assert.equal(result.counts.activeFolders, 1);
  assert.equal(result.items.some((item) => "storagePath" in item || "storageName" in item), false);

  const events = await auditEvents("cloud_file_admin_list");
  assert.equal(events.length, 1);
  assert.equal(events[0].adminUid, admin.uid);
  assert.equal(events[0].ownerUid, owner.uid);
  assert.equal(events[0].source, "control-center");
  assert.equal(JSON.stringify(events[0]).includes("reporte.pdf"), false);
});

test("owner, otro UID, rol falso y anónimo no pueden invocar endpoints administrativos", {
  timeout: 120000
}, async () => {
  const owner = await client("cloud-admin-denied-owner");
  const other = await client("cloud-admin-denied-other");
  const anonymous = await client("cloud-admin-denied-anonymous", { authenticated: false });
  await seed({
    [`usuarios/${owner.uid}`]: { rol: "paciente" },
    [`usuarios/${other.uid}`]: { rol: "medico", isAdmin: true }
  });

  await expectFirebaseError(owner.call("listAdminCloudFiles", {
    ownerUid: owner.uid,
    isAdmin: true
  }), "permission-denied");
  await expectFirebaseError(other.call("requestAdminCloudFileAccess", {
    ownerUid: owner.uid,
    fileId: "file_known",
    operation: "preview",
    isAdmin: true
  }), "permission-denied");
  await expectFirebaseError(anonymous.call("requestAdminCloudFileAccess", {
    ownerUid: owner.uid,
    fileId: "file_known",
    operation: "download"
  }), "unauthenticated");
  assert.equal((await auditEvents("cloud_file_admin_list")).length, 0);
});
