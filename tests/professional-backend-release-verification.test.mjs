import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EXPECTED_ORIGIN,
  EXPECTED_PROJECT_ID,
  EXPECTED_REGION,
  MINIMUM_FUNCTION_UPDATE_TIME,
  PROFESSIONAL_FUNCTION_GROUPS,
  assertReadOnlyProductionContext,
  evaluateFunctionInventory,
  evaluateLocalExports,
  expectedFunctionUrl,
  parseArguments,
  parseFirebaseFunctionsList,
  requiredFunctionIds,
  smokeFunctionEndpoint
} from "../scripts/verificar-backend-profesional.mjs";

function activeFunction(id, overrides = {}) {
  return {
    id,
    project: EXPECTED_PROJECT_ID,
    region: EXPECTED_REGION,
    state: "ACTIVE",
    updateTime: MINIMUM_FUNCTION_UPDATE_TIME,
    ...overrides
  };
}

test("el manifiesto separa la restauración del panel del release profesional completo", () => {
  assert.deepEqual(requiredFunctionIds("panel"), ["listAuthorizedPatientIds"]);
  assert.deepEqual(requiredFunctionIds("core"), PROFESSIONAL_FUNCTION_GROUPS.core);

  const full = requiredFunctionIds("full");
  assert.equal(new Set(full).size, full.length);
  assert.ok(full.includes("registerProfessional"));
  assert.ok(full.includes("listProfessionalDirectory"));
  assert.ok(full.includes("chatSofiaUnified"));
});

test("el inventario listo no produce bloqueos", () => {
  const required = requiredFunctionIds("core");
  const inventory = required.map((id) => activeFunction(id));
  assert.deepEqual(evaluateFunctionInventory(inventory, required), []);
});

test("el inventario detecta Functions faltantes, antiguas o en destino incorrecto", () => {
  const required = ["missing", "stale", "wrongProject", "wrongRegion", "inactive"];
  const inventory = [
    activeFunction("stale", { updateTime: "2026-08-25T23:59:59.000Z" }),
    activeFunction("wrongProject", { project: "otro-proyecto" }),
    activeFunction("wrongRegion", { region: "europe-west1" }),
    activeFunction("inactive", { state: "FAILED" })
  ];
  assert.deepEqual(evaluateFunctionInventory(inventory, required), [
    { functionId: "missing", issue: "missing" },
    { functionId: "stale", issue: "stale" },
    { functionId: "wrongProject", issue: "wrong-project" },
    { functionId: "wrongRegion", issue: "wrong-region" },
    { functionId: "inactive", issue: "not-active" }
  ]);
});

test("la verificación local exige que cada Function del manifiesto esté exportada", () => {
  const source = "exports.listAuthorizedPatientIds = handler;";
  assert.deepEqual(evaluateLocalExports(source, ["listAuthorizedPatientIds", "registerProfessional"]), [
    { functionId: "registerProfessional", issue: "missing-local-export" }
  ]);
});

test("el parser acepta solo alcances conocidos y opciones de lectura", () => {
  assert.deepEqual(parseArguments(["--scope=panel", "--json"]), {
    help: false,
    json: true,
    scope: "panel"
  });
  assert.throws(() => parseArguments(["--scope=otro"]), /Alcance/);
  assert.throws(() => parseArguments(["--deploy"]), /solo lectura/);
  assert.throws(() => parseArguments(["--project=otro"]), /solo lectura/);
});

test("el contexto remoto se cancela si hay emuladores o un proyecto diferente", () => {
  assert.doesNotThrow(() => assertReadOnlyProductionContext({}));
  assert.throws(
    () => assertReadOnlyProductionContext({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }),
    /Emulator/
  );
  assert.throws(
    () => assertReadOnlyProductionContext({ GOOGLE_CLOUD_PROJECT: "otro-proyecto" }),
    /proyecto distinto/
  );
});

test("el parser de Firebase rechaza respuestas incompletas", () => {
  assert.deepEqual(parseFirebaseFunctionsList(JSON.stringify({ status: "success", result: [] })), []);
  assert.throws(() => parseFirebaseFunctionsList({ status: "error" }), /inventario/);
});

test("el smoke de preflight valida endpoint y encabezados CORS", async () => {
  let observedUrl = "";
  let observedOptions = null;
  const fetchReady = async (url, options) => {
    observedUrl = url;
    observedOptions = options;
    return {
      ok: true,
      status: 204,
      headers: {
        get(name) {
          return {
            "access-control-allow-origin": EXPECTED_ORIGIN,
            "access-control-allow-methods": "POST"
          }[name.toLowerCase()] || "";
        }
      }
    };
  };

  assert.equal(await smokeFunctionEndpoint("listAuthorizedPatientIds", { fetchImpl: fetchReady }), null);
  assert.equal(observedUrl, expectedFunctionUrl("listAuthorizedPatientIds"));
  assert.equal(observedOptions.method, "OPTIONS");
  assert.equal(observedOptions.headers.Origin, EXPECTED_ORIGIN);

  const blocked = await smokeFunctionEndpoint("listAuthorizedPatientIds", {
    fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => "" } })
  });
  assert.deepEqual(blocked, { functionId: "listAuthorizedPatientIds", issue: "http-404" });
});

test("el runner de emuladores amplía solo el timeout de descubrimiento local", async () => {
  const source = await readFile(new URL("../scripts/test-mi-nube-emulators.ps1", import.meta.url), "utf8");
  assert.match(source, /COGNICION_FUNCTIONS_EMULATOR_HOST\s*=\s*"127\.0\.0\.1:5001"/);
  assert.match(source, /FUNCTIONS_DISCOVERY_TIMEOUT\s*=\s*"30000"/);
});
