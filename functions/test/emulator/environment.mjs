import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable
} from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage
} from "firebase/storage";

export const PROJECT_ID = "cognicion-57052";
export const STORAGE_BUCKET = "cognicion-57052.firebasestorage.app";
export const STORAGE_BUCKET_URL = `gs://${STORAGE_BUCKET}`;
export const FUNCTIONS_REGION = "us-central1";
export const UID_OWNER = "uidOwner";
export const UID_OTHER = "uidOther";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(currentDirectory, "../../..");

function normalizeEndpoint(rawValue, variableName) {
  const value = String(rawValue || "").trim();
  assert.ok(value, `${variableName} es obligatorio; la prueba no puede usar Firebase real.`);
  assert.doesNotMatch(value, /[/?#]/, `${variableName} debe usar el formato host:puerto sin protocolo.`);

  let host = "";
  let portText = "";
  if (value.startsWith("[")) {
    const match = value.match(/^\[([^\]]+)\]:(\d+)$/u);
    assert.ok(match, `${variableName} no tiene un endpoint IPv6 válido.`);
    [, host, portText] = match;
  } else {
    const separator = value.lastIndexOf(":");
    assert.ok(separator > 0, `${variableName} debe incluir un puerto.`);
    host = value.slice(0, separator);
    portText = value.slice(separator + 1);
  }

  host = host.toLowerCase();
  const port = Number(portText);
  assert.ok(LOOPBACK_HOSTS.has(host), `${variableName} apunta fuera de loopback (${host}). Prueba abortada.`);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, `${variableName} contiene un puerto inválido.`);
  return Object.freeze({ host, port, value });
}

export function emulatorEndpoint(variableName) {
  return normalizeEndpoint(process.env[variableName], variableName);
}

export function assertEmulatorProject() {
  const candidates = [
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.FIREBASE_PROJECT_ID
  ].filter(Boolean);
  for (const candidate of candidates) {
    assert.equal(candidate, PROJECT_ID, `Project ID inesperado (${candidate}); prueba abortada.`);
  }
}

export function requireRulesEmulators() {
  assertEmulatorProject();
  return Object.freeze({
    firestore: emulatorEndpoint("FIRESTORE_EMULATOR_HOST"),
    storage: emulatorEndpoint("FIREBASE_STORAGE_EMULATOR_HOST")
  });
}

export function requireFlowEmulators() {
  const rules = requireRulesEmulators();
  return Object.freeze({
    ...rules,
    auth: emulatorEndpoint("FIREBASE_AUTH_EMULATOR_HOST"),
    functions: emulatorEndpoint("COGNICION_FUNCTIONS_EMULATOR_HOST")
  });
}

export async function createRulesTestEnvironment() {
  const endpoints = requireRulesEmulators();
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(resolve(REPOSITORY_ROOT, "firestore.rules"), "utf8"),
    readFile(resolve(REPOSITORY_ROOT, "storage.rules"), "utf8")
  ]);
  assert.match(firestoreRules, /service\s+cloud\.firestore/u, "No se cargaron las reglas Firestore canónicas.");
  assert.match(storageRules, /service\s+firebase\.storage/u, "No se cargaron las reglas Storage canónicas.");

  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: endpoints.firestore.host,
      port: endpoints.firestore.port,
      rules: firestoreRules
    },
    storage: {
      host: endpoints.storage.host,
      port: endpoints.storage.port,
      rules: storageRules
    }
  });
}

const firebaseConfig = Object.freeze({
  apiKey: "emulator-only-not-a-real-key",
  appId: "1:1037684177162:web:emulator-only",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  messagingSenderId: "1037684177162",
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET
});

export async function createFlowClient(label, { authenticated = true } = {}) {
  const endpoints = requireFlowEmulators();
  const app = initializeApp(firebaseConfig, `emulator-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${endpoints.auth.host}:${endpoints.auth.port}`, { disableWarnings: true });

  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, endpoints.firestore.host, endpoints.firestore.port);

  const storage = getStorage(app, STORAGE_BUCKET_URL);
  connectStorageEmulator(storage, endpoints.storage.host, endpoints.storage.port);

  const functions = getFunctions(app, FUNCTIONS_REGION);
  connectFunctionsEmulator(functions, endpoints.functions.host, endpoints.functions.port);

  if (authenticated) await signInAnonymously(auth);

  return Object.freeze({
    app,
    auth,
    call(name, payload = {}) {
      return httpsCallable(functions, name)(payload).then((result) => result.data);
    },
    destroy: () => deleteApp(app),
    firestore,
    functions,
    storage,
    uid: auth.currentUser?.uid || null
  });
}

export async function expectFirebaseError(promise, expectedCodes) {
  const codes = new Set((Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes]).map(String));
  await assert.rejects(promise, (error) => {
    const code = String(error?.code || "");
    const compact = code.replace(/^(?:firestore|functions|storage)\//u, "");
    assert.ok(codes.has(code) || codes.has(compact), `Código inesperado: ${code || error?.message || "sin código"}`);
    return true;
  });
}

export async function pollUntil(operation, {
  description = "condición del emulador",
  intervalMs = 100,
  timeoutMs = 20000
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  const suffix = lastError ? ` Último error: ${lastError.message}` : "";
  throw new Error(`Tiempo agotado esperando ${description}.${suffix}`);
}

export function uniqueRequestId(prefix = "request") {
  return `${prefix}-${randomUUID()}`;
}
