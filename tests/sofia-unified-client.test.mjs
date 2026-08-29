import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rawSource = await readFile(new URL("../js/sofia/sofiaUnifiedClient.js", import.meta.url), "utf8");
const source = rawSource
  .replace(/import \{ obtenerFunctions \} from "\.\.\/firebase\.js";\s*/, "const obtenerFunctions = async () => ({});\n")
  .replace(/import \{ httpsCallable \} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-functions\.js";\s*/, "const httpsCallable = () => async () => ({ data: {} });\n");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { createSofiaUnifiedClient } = await import(moduleUrl);

test("el cliente conserva memoria solo en sesión y la reinicia al cambiar de paciente", async () => {
  const calls = [];
  const client = createSofiaUnifiedClient({
    functionsFactory: async () => ({ mocked: true }),
    callableFactory: (_functions, name) => async (payload) => {
      calls.push({ name, payload });
      return { data: { respuesta: `Respuesta ${calls.length}`, toolsUsed: [], actions: [] } };
    }
  });

  await client.ask({ message: "Primera", patientId: "patient-1" });
  await client.ask({ message: "Segunda", patientId: "patient-1" });
  assert.equal(calls[1].payload.history.length, 2);
  client.selectPatient("patient-2");
  await client.ask({ message: "Nueva sesión", patientId: "patient-2" });
  assert.deepEqual(calls[2].payload.history, []);
  assert.equal(client.getState().activePatientId, "patient-2");
});

test("solo usa el chat anterior cuando la función unificada no está desplegada", async () => {
  const calls = [];
  const client = createSofiaUnifiedClient({
    functionsFactory: async () => ({}),
    callableFactory: (_functions, name) => async () => {
      calls.push(name);
      if (name === "chatSofiaUnified") {
        const error = new Error("not found");
        error.code = "functions/not-found";
        throw error;
      }
      return { data: { respuesta: "Respuesta compatible" } };
    }
  });
  const result = await client.ask({ message: "Hola" });
  assert.deepEqual(calls, ["chatSofiaUnified", "chatSofia"]);
  assert.equal(result.legacyFallback, true);
  assert.equal(result.clinicalWritesPerformed, false);
  assert.equal(result.limitedMode, true);
});

test("no sustituye silenciosamente el contexto clínico por el chat legado", async () => {
  const calls = [];
  const client = createSofiaUnifiedClient({
    functionsFactory: async () => ({}),
    callableFactory: (_functions, name) => async () => {
      calls.push(name);
      const error = new Error("not found");
      error.code = "functions/not-found";
      throw error;
    }
  });
  await assert.rejects(
    () => client.ask({ message: "Resume el expediente", patientId: "patient-1" }),
    (error) => error.code === "functions/unavailable" && /contexto clínico autorizado/i.test(error.userMessage)
  );
  assert.deepEqual(calls, ["chatSofiaUnified"]);
});
