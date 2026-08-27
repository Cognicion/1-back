#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_ID = "cognicion-57052";
export const EXPECTED_REGION = "us-central1";
export const EXPECTED_ORIGIN = "https://cognicionlabs.com";
export const PROFESSIONAL_RELEASE_MARKER = "2026-08-26-cuenta-profesional-gratuita-v1";
export const MINIMUM_FUNCTION_UPDATE_TIME = "2026-08-26T12:15:21.000Z";

export const PROFESSIONAL_FUNCTION_GROUPS = Object.freeze({
  panel: Object.freeze([
    "listAuthorizedPatientIds"
  ]),
  core: Object.freeze([
    "registerProfessional",
    "registerProfessionalWithCode",
    "discardUnregisteredAccount",
    "createProvisionalPatient",
    "registerPatientProfile",
    "manageAccountLinking",
    "managePatientPermission",
    "listAuthorizedPatientIds",
    "eliminarPacienteDefinitivamente",
    "eliminarProfesionalDefinitivamente"
  ]),
  collaboration: Object.freeze([
    "listProfessionalDirectory"
  ]),
  policy: Object.freeze([
    "analyzePatientClinicalContext",
    "listAuthorizedSofiaPatients",
    "searchAuthorizedPatternPatients",
    "getPatientPatternProfile",
    "refreshPatientPatternProfile",
    "reviewPatientPatternResult",
    "chatSofiaUnified",
    "generateStructuredNoteFromDictation"
  ])
});

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const localFunctionsIndex = resolve(repositoryRoot, "functions", "index.js");
const validScopes = new Set(["panel", "core", "full"]);

function safeError(message, safeCode) {
  return Object.assign(new Error(message), { safeCode });
}

export function parseArguments(args = []) {
  const options = { help: false, json: false, scope: "full" };
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
    if (argument.startsWith("--scope=")) {
      const scope = argument.slice("--scope=".length);
      if (!validScopes.has(scope)) throw safeError("Alcance de verificación desconocido.", "invalid-scope");
      options.scope = scope;
      continue;
    }
    if (/^--(?:apply|deploy|fix|force|project|region)(?:=|$)/u.test(argument)) {
      throw safeError("Este verificador es de solo lectura y no admite operaciones mutables ni otros destinos.", "unsafe-argument");
    }
    throw safeError("Argumento no reconocido.", "unknown-argument");
  }
  return Object.freeze(options);
}

export function requiredFunctionIds(scope = "full") {
  if (!validScopes.has(scope)) throw safeError("Alcance de verificación desconocido.", "invalid-scope");
  if (scope === "panel") return [...PROFESSIONAL_FUNCTION_GROUPS.panel];
  if (scope === "core") return [...PROFESSIONAL_FUNCTION_GROUPS.core];
  return [...new Set([
    ...PROFESSIONAL_FUNCTION_GROUPS.core,
    ...PROFESSIONAL_FUNCTION_GROUPS.collaboration,
    ...PROFESSIONAL_FUNCTION_GROUPS.policy
  ])];
}

export function assertReadOnlyProductionContext(environment = process.env) {
  const emulatorVariables = [
    "COGNICION_FUNCTIONS_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
    "STORAGE_EMULATOR_HOST"
  ];
  if (emulatorVariables.some((name) => String(environment[name] || "").trim())) {
    throw safeError("Hay endpoints Emulator activos; se canceló la verificación remota.", "emulator-environment");
  }
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID"]) {
    const configured = String(environment[name] || "").trim();
    if (configured && configured !== EXPECTED_PROJECT_ID) {
      throw safeError("El entorno apunta a un proyecto distinto del proyecto canónico.", "unexpected-project-environment");
    }
  }
}

export function parseFirebaseFunctionsList(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (parsed?.status !== "success" || !Array.isArray(parsed?.result)) {
    throw safeError("Firebase devolvió un inventario de Functions inválido.", "invalid-functions-inventory");
  }
  return parsed.result;
}

function normalizedRegion(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function evaluateFunctionInventory(inventory = [], requiredIds = requiredFunctionIds()) {
  const byId = new Map(inventory.map((entry) => [String(entry?.id || ""), entry]));
  const minimumUpdateMs = Date.parse(MINIMUM_FUNCTION_UPDATE_TIME);
  const issues = [];

  for (const id of requiredIds) {
    const entry = byId.get(id);
    if (!entry) {
      issues.push({ functionId: id, issue: "missing" });
      continue;
    }
    if (String(entry.project || "") !== EXPECTED_PROJECT_ID) {
      issues.push({ functionId: id, issue: "wrong-project" });
    }
    if (normalizedRegion(entry.region) !== EXPECTED_REGION) {
      issues.push({ functionId: id, issue: "wrong-region" });
    }
    if (String(entry.state || "").toUpperCase() !== "ACTIVE") {
      issues.push({ functionId: id, issue: "not-active" });
    }
    const updateMs = Date.parse(String(entry.updateTime || ""));
    if (!Number.isFinite(updateMs) || updateMs < minimumUpdateMs) {
      issues.push({ functionId: id, issue: "stale" });
    }
  }

  return issues;
}

export function evaluateLocalExports(source, requiredIds = requiredFunctionIds()) {
  return requiredIds
    .filter((id) => !new RegExp(`exports\\.${id}\\s*=`).test(source))
    .map((functionId) => ({ functionId, issue: "missing-local-export" }));
}

export function expectedFunctionUrl(functionId) {
  return `https://${EXPECTED_REGION}-${EXPECTED_PROJECT_ID}.cloudfunctions.net/${functionId}`;
}

export async function smokeFunctionEndpoint(functionId, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw safeError("Fetch no está disponible.", "missing-fetch");
  const response = await fetchImpl(expectedFunctionUrl(functionId), {
    method: "OPTIONS",
    headers: {
      Origin: EXPECTED_ORIGIN,
      "Access-Control-Request-Headers": "content-type",
      "Access-Control-Request-Method": "POST"
    },
    signal: AbortSignal.timeout(10000)
  });
  const allowedOrigin = String(response.headers?.get?.("access-control-allow-origin") || "");
  const allowedMethods = String(response.headers?.get?.("access-control-allow-methods") || "").toUpperCase();
  if (!response.ok) return { functionId, issue: `http-${response.status}` };
  if (![EXPECTED_ORIGIN, "*"].includes(allowedOrigin)) return { functionId, issue: "cors-origin" };
  if (!allowedMethods.includes("POST")) return { functionId, issue: "cors-method" };
  return null;
}

function firebaseInvocation(environment = process.env) {
  const cliRelativePath = ["node_modules", "firebase-tools", "lib", "bin", "firebase.js"];
  const cliCandidates = [
    resolve(repositoryRoot, "functions", ...cliRelativePath),
    resolve(repositoryRoot, ...cliRelativePath),
    ...String(environment.PATH || "")
      .split(delimiter)
      .filter(Boolean)
      .map((pathDirectory) => resolve(pathDirectory, ...cliRelativePath))
  ];
  const cliEntrypoint = cliCandidates.find((candidate) => existsSync(candidate));
  if (cliEntrypoint) {
    return { command: process.execPath, argumentsPrefix: [cliEntrypoint], shell: false };
  }
  return {
    command: process.platform === "win32" ? "firebase.cmd" : "firebase",
    argumentsPrefix: [],
    shell: process.platform === "win32"
  };
}

export function loadRemoteFunctionInventory() {
  const invocation = firebaseInvocation();
  const result = spawnSync(
    invocation.command,
    [
      ...invocation.argumentsPrefix,
      "functions:list",
      "--project",
      EXPECTED_PROJECT_ID,
      "--json"
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      shell: invocation.shell,
      windowsHide: true
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw safeError("No se pudo consultar el inventario remoto de Firebase.", "functions-list-failed");
  }
  return parseFirebaseFunctionsList(result.stdout);
}

export function formatVerificationReport(report, { json = false } = {}) {
  if (json) return JSON.stringify(report);
  const lines = [
    "Verificación prepublicación del backend profesional (solo lectura)",
    `Proyecto: ${report.projectId}`,
    `Región: ${report.region}`,
    `Entrega mínima: ${report.releaseMarker}`,
    `Alcance: ${report.scope}`,
    `Funciones requeridas: ${report.requiredCount}`,
    `Estado: ${report.status}`
  ];
  if (report.issues.length) {
    lines.push("Problemas:");
    report.issues.forEach(({ functionId, issue }) => lines.push(`- ${functionId}: ${issue}`));
  } else {
    lines.push("Todas las Functions requeridas están activas, actualizadas y responden correctamente al preflight.");
  }
  return lines.join("\n");
}

function usage() {
  return [
    "Uso: node scripts/verificar-backend-profesional.mjs [--scope=panel|core|full] [--json]",
    "",
    "Consulta únicamente el proyecto fijo cognicion-57052.",
    "Valida export local, presencia remota, región, estado, antigüedad y preflight CORS.",
    "No despliega, modifica ni elimina Functions o datos."
  ].join("\n");
}

function failureCode(error) {
  return String(error?.safeCode || error?.code || error?.name || "verification-failed")
    .replace(/[^a-zA-Z0-9_-]/gu, "-")
    .slice(0, 80);
}

export async function runVerificationCli({
  args = process.argv.slice(2),
  environment = process.env,
  inventoryLoader = loadRemoteFunctionInventory,
  fetchImpl = globalThis.fetch
} = {}) {
  try {
    const options = parseArguments(args);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    assertReadOnlyProductionContext(environment);
    const requiredIds = requiredFunctionIds(options.scope);
    const localSource = readFileSync(localFunctionsIndex, "utf8");
    const inventory = inventoryLoader();
    const inventoryById = new Map(inventory.map((entry) => [String(entry?.id || ""), entry]));
    const localIssues = evaluateLocalExports(localSource, requiredIds);
    const inventoryIssues = evaluateFunctionInventory(inventory, requiredIds);
    const smokeCandidates = requiredIds.filter((id) => {
      const entry = inventoryById.get(id);
      return entry
        && String(entry.project || "") === EXPECTED_PROJECT_ID
        && normalizedRegion(entry.region) === EXPECTED_REGION
        && String(entry.state || "").toUpperCase() === "ACTIVE";
    });
    const smokeResults = await Promise.all(smokeCandidates.map(async (id) => {
      try {
        return await smokeFunctionEndpoint(id, { fetchImpl });
      } catch {
        return { functionId: id, issue: "preflight-failed" };
      }
    }));
    const issues = [...localIssues, ...inventoryIssues, ...smokeResults.filter(Boolean)];
    const report = Object.freeze({
      mode: "read-only",
      projectId: EXPECTED_PROJECT_ID,
      region: EXPECTED_REGION,
      releaseMarker: PROFESSIONAL_RELEASE_MARKER,
      scope: options.scope,
      requiredCount: requiredIds.length,
      status: issues.length ? "blocked" : "ready",
      issues
    });
    process.stdout.write(`${formatVerificationReport(report, options)}\n`);
    return issues.length ? 2 : 0;
  } catch (error) {
    process.stderr.write(`Verificación cancelada de forma segura. code=${failureCode(error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await runVerificationCli();
}
