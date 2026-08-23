#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const EXPECTED_PROJECT_ID = "cognicion-57052";
export const EXPECTED_PROJECT_NUMBER = "1037684177162";
export const EXPECTED_BUCKET = "cognicion-57052.firebasestorage.app";
export const CLOUD_STORAGE_PREFIX = "mi-nube/";
export const COLLECTION_GROUPS = Object.freeze([
  "cloudUploadReservations",
  "cloudStorageUsage",
  "cloudFiles"
]);

const requireFromFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);

function safeNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw Object.assign(new Error(`Conteo agregado inválido: ${label}.`), {
      safeCode: "invalid-aggregate-count"
    });
  }
  return number;
}

export function parseArguments(args = []) {
  const options = { help: false, json: false };
  for (const rawArgument of args) {
    const argument = String(rawArgument || "").trim();
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--dry-run") continue;
    if (/^--(?:apply|cleanup|delete|fix|migrate|project|bucket)(?:=|$)/u.test(argument)) {
      throw Object.assign(new Error("Este auditor no admite operaciones mutables ni destinos configurables."), {
        safeCode: "unsafe-argument"
      });
    }
    throw Object.assign(new Error("Argumento no reconocido."), { safeCode: "unknown-argument" });
  }
  return Object.freeze(options);
}

export function assertProductionReadContext(environment = process.env) {
  const emulatorVariables = [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
    "STORAGE_EMULATOR_HOST"
  ];
  if (emulatorVariables.some((name) => String(environment[name] || "").trim())) {
    throw Object.assign(new Error("Hay endpoints Emulator activos; la auditoría de producción fue cancelada."), {
      safeCode: "emulator-environment"
    });
  }

  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID"]) {
    const configured = String(environment[name] || "").trim();
    if (configured && configured !== EXPECTED_PROJECT_ID) {
      throw Object.assign(new Error("El entorno declara un proyecto distinto al proyecto canónico."), {
        safeCode: "unexpected-project-environment"
      });
    }
  }
}

async function countCollectionGroup(firestore, collectionId) {
  const snapshot = await firestore.collectionGroup(collectionId).count().get();
  return safeNonNegativeInteger(snapshot.data()?.count, collectionId);
}

export async function countStorageObjects(bucket, {
  pageSize = 1000,
  prefix = CLOUD_STORAGE_PREFIX
} = {}) {
  if (prefix !== CLOUD_STORAGE_PREFIX) {
    throw Object.assign(new Error("Prefijo Storage no permitido."), { safeCode: "unexpected-storage-prefix" });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw Object.assign(new Error("Tamaño de página Storage inválido."), { safeCode: "invalid-page-size" });
  }

  let count = 0;
  let pageToken;
  const seenPageTokens = new Set();
  do {
    const [files, nextQuery] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: pageSize,
      pageToken,
      prefix
    });
    if (!Array.isArray(files)) {
      throw Object.assign(new Error("Respuesta Storage inválida."), { safeCode: "invalid-storage-response" });
    }
    for (const file of files) {
      if (!String(file?.name || "").startsWith(prefix)) {
        throw Object.assign(new Error("Storage devolvió un objeto fuera del prefijo permitido."), {
          safeCode: "storage-prefix-mismatch"
        });
      }
    }
    count = safeNonNegativeInteger(count + files.length, "storageObjects");
    const nextToken = String(nextQuery?.pageToken || "");
    if (nextToken && seenPageTokens.has(nextToken)) {
      throw Object.assign(new Error("Storage repitió un token de paginación."), {
        safeCode: "repeated-page-token"
      });
    }
    if (nextToken) seenPageTokens.add(nextToken);
    pageToken = nextToken || undefined;
  } while (pageToken);

  return count;
}

export async function auditExistingCloudArtifacts({ bucket, firestore }) {
  if (!bucket || !firestore) throw new TypeError("Firestore y Storage son obligatorios.");

  const [bucketMetadata] = await bucket.getMetadata();
  if (String(bucketMetadata?.name || "") !== EXPECTED_BUCKET) {
    throw Object.assign(new Error("El bucket resuelto no coincide con el bucket canónico."), {
      safeCode: "unexpected-bucket"
    });
  }
  const projectNumber = String(bucketMetadata?.projectNumber || "");
  if (projectNumber !== EXPECTED_PROJECT_NUMBER) {
    throw Object.assign(new Error("El bucket pertenece a otro proyecto."), {
      safeCode: "unexpected-bucket-project"
    });
  }

  const collectionCountsEntries = await Promise.all(
    COLLECTION_GROUPS.map(async (collectionId) => [
      collectionId,
      await countCollectionGroup(firestore, collectionId)
    ])
  );
  const storageObjectCount = await countStorageObjects(bucket);
  const collectionCounts = Object.fromEntries(collectionCountsEntries);
  const totalArtifacts = safeNonNegativeInteger(
    Object.values(collectionCounts).reduce((sum, value) => sum + value, 0) + storageObjectCount,
    "totalArtifacts"
  );

  return Object.freeze({
    bucket: EXPECTED_BUCKET,
    collectionCounts: Object.freeze(collectionCounts),
    mode: "read-only",
    prefix: CLOUD_STORAGE_PREFIX,
    projectId: EXPECTED_PROJECT_ID,
    status: totalArtifacts > 0 ? "blocked-existing-artifacts" : "clean",
    storageObjectCount,
    totalArtifacts
  });
}

export function formatAuditReport(report, { json = false } = {}) {
  const safeReport = {
    mode: report.mode,
    projectId: report.projectId,
    bucket: report.bucket,
    prefix: report.prefix,
    firestore: {
      cloudUploadReservations: report.collectionCounts.cloudUploadReservations,
      cloudStorageUsage: report.collectionCounts.cloudStorageUsage,
      cloudFiles: report.collectionCounts.cloudFiles
    },
    storageObjects: report.storageObjectCount,
    totalArtifacts: report.totalArtifacts,
    status: report.status
  };
  if (json) return JSON.stringify(safeReport);
  return [
    "Auditoría predeploy de Mi nube (solo lectura)",
    `Proyecto fijo: ${safeReport.projectId}`,
    `Bucket fijo: ${safeReport.bucket}`,
    `Prefijo fijo: ${safeReport.prefix}`,
    `Firestore cloudUploadReservations: ${safeReport.firestore.cloudUploadReservations}`,
    `Firestore cloudStorageUsage: ${safeReport.firestore.cloudStorageUsage}`,
    `Firestore cloudFiles: ${safeReport.firestore.cloudFiles}`,
    `Storage objetos: ${safeReport.storageObjects}`,
    `Total artefactos: ${safeReport.totalArtifacts}`,
    `Estado: ${safeReport.status}`,
    safeReport.status === "clean"
      ? "No se detectaron artefactos preexistentes de Mi nube."
      : "DESPLIEGUE BLOQUEADO: cualquier hallazgo requiere un procedimiento controlado separado; este script no modifica ni elimina datos."
  ].join("\n");
}

export function auditExitCode(report) {
  return report?.status === "clean" ? 0 : 2;
}

function usage() {
  return [
    "Uso: node scripts/audit-mi-nube-predeploy.mjs [--dry-run] [--json]",
    "",
    "Audita exclusivamente mediante lecturas el proyecto y bucket canónicos.",
    "No existe modo apply, cleanup, delete ni selección de otro destino.",
    "Cualquier artefacto encontrado bloquea el despliegue y produce código de salida 2."
  ].join("\n");
}

function safeFailureCode(error) {
  const candidate = String(error?.safeCode || error?.code || error?.name || "audit-failed");
  return candidate.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80) || "audit-failed";
}

export async function runAuditCli({ args = process.argv.slice(2), environment = process.env } = {}) {
  let admin;
  try {
    const options = parseArguments(args);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    assertProductionReadContext(environment);

    admin = requireFromFunctions("firebase-admin");
    const app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: EXPECTED_PROJECT_ID,
      storageBucket: EXPECTED_BUCKET
    }, `mi-nube-predeploy-audit-${process.pid}`);
    const report = await auditExistingCloudArtifacts({
      bucket: admin.storage(app).bucket(EXPECTED_BUCKET),
      firestore: admin.firestore(app)
    });
    process.stdout.write(`${formatAuditReport(report, options)}\n`);
    return auditExitCode(report);
  } catch (error) {
    process.stderr.write(`Auditoría cancelada de forma segura. code=${safeFailureCode(error)}\n`);
    return 1;
  } finally {
    if (admin) {
      const auditApp = admin.apps.find((app) => app?.name === `mi-nube-predeploy-audit-${process.pid}`);
      if (auditApp) await auditApp.delete().catch(() => undefined);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runAuditCli();
}
