const assert = require("assert");
const {
  MAX_TRANSCRIPT_CHARS,
  extractJsonFromText,
  runSegmentClinicalConversation
} = require("../segmentationHandler");

class TestHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "HttpsError";
    this.code = code;
    this.details = details;
  }
}

function silentLogger() {
  return {
    info() {},
    error() {}
  };
}

function createClient(responseFactory) {
  return {
    responses: {
      create: responseFactory
    }
  };
}

async function expectCode(label, code, fn) {
  try {
    await fn();
  } catch (error) {
    assert.strictEqual(error.code, code, label);
    assert.ok(error.details.requestId, `${label}: requestId faltante`);
    assert.ok(error.details.stage, `${label}: stage faltante`);
    return error;
  }
  assert.fail(`${label}: se esperaba error ${code}`);
}

async function callWithClient(client, data = {}) {
  return runSegmentClinicalConversation({
    data: {
      transcript: "Buenas tardes Carlos me escucha si doctor me puede decir su nombre completo Carlos Eduardo.",
      transcriptId: "tx-test",
      ...data
    },
    auth: { uid: "user-1" },
    apiKey: "test-key",
    env: { OPENAI_SEGMENTATION_MODEL: "test-model" },
    HttpsErrorClass: TestHttpsError,
    logger: silentLogger(),
    openaiClient: client,
    timeoutMs: 25
  });
}

(async () => {
  assert.deepStrictEqual(extractJsonFromText("```json\n{\"ok\":true}\n```"), { ok: true });

  await expectCode("usuario no autenticado", "unauthenticated", () => runSegmentClinicalConversation({
    data: { transcript: "hola" },
    auth: null,
    apiKey: "test-key",
    HttpsErrorClass: TestHttpsError,
    logger: silentLogger(),
    openaiClient: createClient(async () => ({ output_text: "{}" }))
  }));

  await expectCode("transcripcion vacia", "invalid-argument", () => runSegmentClinicalConversation({
    data: { transcript: "" },
    auth: { uid: "user-1" },
    apiKey: "test-key",
    HttpsErrorClass: TestHttpsError,
    logger: silentLogger(),
    openaiClient: createClient(async () => ({ output_text: "{}" }))
  }));

  await expectCode("secreto ausente", "failed-precondition", () => runSegmentClinicalConversation({
    data: { transcript: "hola" },
    auth: { uid: "user-1" },
    apiKey: "",
    HttpsErrorClass: TestHttpsError,
    logger: silentLogger(),
    openaiClient: createClient(async () => ({ output_text: "{}" }))
  }));

  await expectCode("transcripcion extensa", "resource-exhausted", () => runSegmentClinicalConversation({
    data: { transcript: "a".repeat(MAX_TRANSCRIPT_CHARS + 1) },
    auth: { uid: "user-1" },
    apiKey: "test-key",
    HttpsErrorClass: TestHttpsError,
    logger: silentLogger(),
    openaiClient: createClient(async () => ({ output_text: "{}" }))
  }));

  const valid = await callWithClient(createClient(async () => ({
    output_text: JSON.stringify({
      transcriptId: "tx-test",
      segmentationMode: "linguistic",
      utterances: [
        {
          id: "q1",
          sequence: 1,
          text: "Buenas tardes, Carlos, me escucha?",
          probableRole: "clinician",
          speechAct: "question",
          confidence: 0.95,
          requiresReview: false
        },
        {
          id: "a1",
          sequence: 2,
          text: "Si, doctor.",
          probableRole: "patient",
          speechAct: "answer/correction",
          linkedUtteranceId: "q1",
          confidence: 1.2
        }
      ],
      warnings: []
    })
  })));
  assert.strictEqual(valid.provider, "external");
  assert.strictEqual(valid.mode, "linguistic");
  assert.strictEqual(valid.utterances.length, 2);
  assert.strictEqual(valid.utterances[1].speechAct, "correction");
  assert.strictEqual(valid.utterances[1].confidence, 1);
  assert.ok(valid.warnings.some((warning) => warning.code === "normalized_speech_act"));

  const markdown = await callWithClient(createClient(async () => ({
    output_text: "```json\n{\"utterances\":[{\"text\":\"No.\",\"probableRole\":\"patient\",\"speechAct\":\"answer\"}],\"warnings\":[]}\n```"
  })));
  assert.strictEqual(markdown.utterances[0].text, "No.");

  await expectCode("respuesta vacia", "data-loss", () => callWithClient(createClient(async () => ({ output_text: "" }))));
  await expectCode("json invalido", "data-loss", () => callWithClient(createClient(async () => ({ output_text: "{no json" }))));
  await expectCode("sin turnos", "data-loss", () => callWithClient(createClient(async () => ({ output_text: "{\"utterances\":[]}" }))));

  await expectCode("proveedor 401", "failed-precondition", () => callWithClient(createClient(async () => {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  })));
  await expectCode("proveedor 429", "resource-exhausted", () => callWithClient(createClient(async () => {
    const error = new Error("Rate limit");
    error.status = 429;
    throw error;
  })));
  await expectCode("proveedor 500", "unavailable", () => callWithClient(createClient(async () => {
    const error = new Error("Server error");
    error.status = 500;
    throw error;
  })));
  await expectCode("timeout proveedor", "deadline-exceeded", () => callWithClient(createClient(() => new Promise(() => {}))));

  let providerOptions = null;
  const optioned = await callWithClient(createClient(async (_payload, options) => {
    providerOptions = options;
    return {
      output_text: JSON.stringify({
        utterances: [{ text: "Mejor, doctor.", probableRole: "patient", speechAct: "answer" }],
        warnings: []
      })
    };
  }));
  assert.strictEqual(optioned.provider, "external");
  assert.strictEqual(providerOptions?.timeout, 25);
  assert.strictEqual(providerOptions?.maxRetries, 0);
  assert.ok(providerOptions?.signal, "signal abortable faltante");

  let aborted = false;
  const slowClient = createClient((_payload, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("AbortError"));
    });
  }));
  await expectCode("timeout aborta proveedor", "deadline-exceeded", () => callWithClient(slowClient));
  assert.strictEqual(aborted, true);

  console.log("segmentationHandler tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
