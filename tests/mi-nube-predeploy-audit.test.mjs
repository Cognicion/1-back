import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CLOUD_STORAGE_PREFIX,
  COLLECTION_GROUPS,
  EXPECTED_BUCKET,
  EXPECTED_PROJECT_ID,
  EXPECTED_PROJECT_NUMBER,
  assertProductionReadContext,
  auditExitCode,
  auditExistingCloudArtifacts,
  countStorageObjects,
  formatAuditReport,
  parseArguments
} from "../scripts/audit-mi-nube-predeploy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(repositoryRoot, "scripts/audit-mi-nube-predeploy.mjs");

function fakeFirestore(counts) {
  const calls = [];
  return {
    calls,
    collectionGroup(collectionId) {
      calls.push(collectionId);
      return {
        count() {
          return {
            async get() {
              return { data: () => ({ count: counts[collectionId] }) };
            }
          };
        }
      };
    }
  };
}

function fakeBucket(pages, metadata = {}) {
  const calls = [];
  return {
    calls,
    async getMetadata() {
      return [{
        name: EXPECTED_BUCKET,
        projectNumber: EXPECTED_PROJECT_NUMBER,
        ...metadata
      }];
    },
    async getFiles(query) {
      calls.push({ ...query });
      const pageIndex = query.pageToken ? Number(query.pageToken) : 0;
      const names = pages[pageIndex] || [];
      const hasNext = pageIndex + 1 < pages.length;
      return [
        names.map((name) => ({ name })),
        hasNext ? { pageToken: String(pageIndex + 1) } : null
      ];
    }
  };
}

test("el auditor fija proyecto, bucket, prefijo y las tres collectionGroup", async () => {
  const firestore = fakeFirestore({
    cloudUploadReservations: 2,
    cloudStorageUsage: 1,
    cloudFiles: 4
  });
  const bucket = fakeBucket([
    ["mi-nube/uid-redacted/files/file-redacted/a.pdf"],
    ["mi-nube/uid-redacted/files/file-redacted/b.txt"]
  ]);

  const report = await auditExistingCloudArtifacts({ bucket, firestore });
  assert.deepEqual(firestore.calls.sort(), [...COLLECTION_GROUPS].sort());
  assert.equal(report.projectId, EXPECTED_PROJECT_ID);
  assert.equal(report.bucket, EXPECTED_BUCKET);
  assert.equal(report.prefix, CLOUD_STORAGE_PREFIX);
  assert.equal(report.storageObjectCount, 2);
  assert.equal(report.totalArtifacts, 9);
  assert.equal(report.status, "blocked-existing-artifacts");
  assert.equal(auditExitCode(report), 2);
  assert.deepEqual(bucket.calls.map((call) => ({
    autoPaginate: call.autoPaginate,
    maxResults: call.maxResults,
    prefix: call.prefix
  })), [
    { autoPaginate: false, maxResults: 1000, prefix: CLOUD_STORAGE_PREFIX },
    { autoPaginate: false, maxResults: 1000, prefix: CLOUD_STORAGE_PREFIX }
  ]);
});

test("cero hallazgos produce clean; cualquier conteo produce bloqueo sin detallar documentos", async () => {
  const clean = await auditExistingCloudArtifacts({
    bucket: fakeBucket([[]]),
    firestore: fakeFirestore(Object.fromEntries(COLLECTION_GROUPS.map((name) => [name, 0])))
  });
  assert.equal(clean.status, "clean");
  assert.equal(clean.totalArtifacts, 0);
  assert.equal(auditExitCode(clean), 0);

  const report = formatAuditReport(clean);
  assert.match(report, /solo lectura/u);
  assert.match(report, /Estado: clean/u);
  assert.doesNotMatch(report, /uid-redacted|file-redacted|a\.pdf/u);
  const json = JSON.parse(formatAuditReport(clean, { json: true }));
  assert.deepEqual(Object.keys(json.firestore).sort(), [...COLLECTION_GROUPS].sort());
});

test("Storage solo acepta el prefijo canónico y detecta paginación o respuestas anómalas", async () => {
  await assert.rejects(
    countStorageObjects(fakeBucket([[]]), { prefix: "usuarios/" }),
    (error) => error.safeCode === "unexpected-storage-prefix"
  );
  await assert.rejects(
    countStorageObjects(fakeBucket([["otro-modulo/archivo.pdf"]])),
    (error) => error.safeCode === "storage-prefix-mismatch"
  );

  const repeatedTokenBucket = {
    async getFiles() {
      return [[], { pageToken: "same-token" }];
    }
  };
  await assert.rejects(
    countStorageObjects(repeatedTokenBucket),
    (error) => error.safeCode === "repeated-page-token"
  );
});

test("un bucket o número de proyecto inesperado aborta antes de contar", async () => {
  await assert.rejects(
    auditExistingCloudArtifacts({
      bucket: fakeBucket([[]], { name: "otro-bucket" }),
      firestore: fakeFirestore({})
    }),
    (error) => error.safeCode === "unexpected-bucket"
  );
  await assert.rejects(
    auditExistingCloudArtifacts({
      bucket: fakeBucket([[]], { projectNumber: "999" }),
      firestore: fakeFirestore({})
    }),
    (error) => error.safeCode === "unexpected-bucket-project"
  );
});

test("los argumentos no ofrecen apply, limpieza, borrado ni cambio de destino", () => {
  assert.deepEqual(parseArguments([]), { help: false, json: false });
  assert.deepEqual(parseArguments(["--dry-run", "--json"]), { help: false, json: true });
  for (const argument of [
    "--apply",
    "--cleanup",
    "--delete",
    "--fix",
    "--migrate",
    "--project=otro",
    "--bucket=otro"
  ]) {
    assert.throws(() => parseArguments([argument]), (error) => error.safeCode === "unsafe-argument");
  }
});

test("rechaza emuladores y variables de proyecto distintas", () => {
  assert.doesNotThrow(() => assertProductionReadContext({}));
  assert.doesNotThrow(() => assertProductionReadContext({ GCLOUD_PROJECT: EXPECTED_PROJECT_ID }));
  assert.throws(
    () => assertProductionReadContext({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }),
    (error) => error.safeCode === "emulator-environment"
  );
  assert.throws(
    () => assertProductionReadContext({ GOOGLE_CLOUD_PROJECT: "otro-proyecto" }),
    (error) => error.safeCode === "unexpected-project-environment"
  );
});

test("--help no carga ADC ni realiza consultas", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No existe modo apply/u);
  assert.equal(result.stderr, "");
});

test("la implementación usa ADC de functions y no contiene mutaciones de datos", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /createRequire\(\s*new URL\("\.\.\/functions\/package\.json"/u);
  assert.match(source, /credential\.applicationDefault\(\)/u);
  assert.match(source, /\.collectionGroup\(collectionId\)\.count\(\)\.get\(\)/u);
  assert.match(source, /bucket\.getFiles\(/u);
  assert.doesNotMatch(source, /\.(?:set|create|update|save|upload|deleteFiles)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:writeBatch|bulkWriter|runTransaction)\s*\(/u);
  assert.doesNotMatch(source, /(?:firestore|bucket|collection|document|reference)\s*\.\s*add\s*\(/u);
  assert.doesNotMatch(source, /access[_-]?token|refresh[_-]?token|private[_-]?key/iu);
});
