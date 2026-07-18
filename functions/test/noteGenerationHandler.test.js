const assert = require("node:assert/strict");
const {
  NOTE_PROMPT_VERSION,
  NOTE_SCHEMA_VERSION,
  validateEvolutionText,
  runGenerateStructuredNoteFromDictation
} = require("../noteGenerationHandler");

class TestHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const auth = { uid: "clinico-1" };
const baseUtterances = [
  { id: "utt-1", sequence: 1, text: "Durante la valoracion fue abordado en cama, acepta entrevista y se muestra cooperador.", probableRole: "clinician", speechAct: "observation" },
  { id: "utt-2", sequence: 2, text: "Refiere sentirse mas tranquilo y ya no estar tan seguro de que lo persigan.", probableRole: "patient", speechAct: "answer" },
  { id: "utt-3", sequence: 3, text: "Niega ideas suicidas y niega intencion de agredir a su hermano actualmente.", probableRole: "patient", speechAct: "answer" },
  { id: "utt-4", sequence: 4, text: "Identifica a su madre como principal red de apoyo.", probableRole: "patient", speechAct: "answer" },
  { id: "utt-5", sequence: 5, text: "Durmio siete horas, apetito conservado, diuresis y evacuaciones sin alteraciones.", probableRole: "patient", speechAct: "answer" }
];

function basePayload(overrides = {}) {
  return {
    clientRequestId: "note-test-1",
    patientContext: {
      patientId: "paciente-1",
      encounterId: "enc-1",
      name: "Paciente Prueba",
      age: 34,
      sex: "hombre",
      service: "OBSERVACION",
      hospitalizationDay: 21,
      admissionCriterion: "sintomatologia psicotica y riesgo de conducta heteroagresiva"
    },
    noteConfiguration: {
      noteType: "evolucion_observacion",
      styleId: "evolucion_narrativa_institucional",
      templateId: "evolucion",
      promptVersion: NOTE_PROMPT_VERSION
    },
    transcript: {
      transcriptId: "tx-1",
      originalTextHash: "hash-fixture",
      segmentationMode: "hybrid",
      utterances: baseUtterances
    },
    ...overrides
  };
}

function fakeOpenAIWithOutput(outputText) {
  return {
    responses: {
      create: async () => ({ output_text: outputText })
    }
  };
}

function fakeOpenAIRejects(error) {
  return {
    responses: {
      create: async () => {
        throw error;
      }
    }
  };
}

function fakeOpenAISlow() {
  return {
    responses: {
      create: () => new Promise((resolve) => setTimeout(() => resolve({ output_text: "{}" }), 100))
    }
  };
}

async function runWithOutput(outputText, data = basePayload()) {
  return runGenerateStructuredNoteFromDictation({
    data,
    auth,
    apiKey: "test-key",
    OpenAIClass: class {},
    HttpsErrorClass: TestHttpsError,
    openaiClient: fakeOpenAIWithOutput(outputText),
    logger: { info() {}, error() {} },
    timeoutMs: 500
  });
}

const validEvolution = [
  "Paciente Prueba, hombre de 34 anos, quien cursa su 21.er dia de estancia intrahospitalaria en el servicio especial de OBSERVACION, bajo seguimiento por sintomatologia psicotica y riesgo de conducta heteroagresiva. Durante la valoracion fue abordado en cama correspondiente, aceptando la entrevista y mostrando adecuada cooperacion.",
  "Al interrogatorio dirigido refiere encontrarse mas tranquilo, con disminucion de las ideas de persecucion que motivaron su ingreso, mencionando que actualmente ya no se encuentra completamente convencido de dichas experiencias. Niega ideas suicidas y niega intencion heteroagresiva actual hacia su hermano.",
  "Identifica a su madre como principal red de apoyo. Desde el punto de vista medico, refiere sueno de aproximadamente siete horas, apetito conservado, diuresis y evacuaciones sin alteraciones."
].join("\n\n");

async function main() {
const result = await runWithOutput(JSON.stringify({
  sections: {
    evolution: {
      text: validEvolution,
      sourceUtteranceIds: ["utt-1", "utt-2", "utt-3", "utt-4", "utt-5"],
      confidence: 0.86,
      requiresReview: true,
      warnings: []
    }
  },
  globalWarnings: []
}));

assert.equal(result.provider, "external");
assert.equal(result.promptVersion, NOTE_PROMPT_VERSION);
assert.equal(result.schemaVersion, NOTE_SCHEMA_VERSION);
assert.equal(result.sections.evolution.text, validEvolution);
assert.deepEqual(result.sections.evolution.sourceUtteranceIds, ["utt-1", "utt-2", "utt-3", "utt-4", "utt-5"]);

await assert.rejects(
  () => runGenerateStructuredNoteFromDictation({
    data: basePayload(),
    auth: null,
    apiKey: "test-key",
    OpenAIClass: class {},
    HttpsErrorClass: TestHttpsError,
    openaiClient: fakeOpenAIWithOutput("{}"),
    logger: { info() {}, error() {} }
  }),
  (error) => error.code === "unauthenticated"
);

await assert.rejects(
  () => runWithOutput("{}", basePayload({ transcript: { transcriptId: "tx-empty", utterances: [] } })),
  (error) => error.code === "invalid-argument" && /segmentacion/i.test(error.message)
);

  await assert.rejects(
    () => runWithOutput("no-json"),
    (error) => error.code === "data-loss"
  );

  await assert.rejects(
    () => runWithOutput(""),
    (error) => error.code === "data-loss"
  );

  await assert.rejects(
    () => runWithOutput(JSON.stringify({
      sections: {
        evolution: {
          text: "Quiero preguntarle si escucha voces? Durante la entrevista se observa contacto visual. Se mantendra vigilancia y solicitar biometria.",
          sourceUtteranceIds: ["utt-1"],
          requiresReview: true
        }
    }
  })),
  (error) => error.code === "data-loss"
);

await assert.rejects(
  () => runWithOutput(JSON.stringify({
    sections: {
      evolution: { text: validEvolution, sourceUtteranceIds: ["utt-1"] },
      plan: { text: "Solicitar estudios." }
    }
  })),
  (error) => error.code === "data-loss"
);

  await assert.rejects(
    () => runWithOutput(JSON.stringify({
      sections: {
        evolution: { text: validEvolution, sourceUtteranceIds: ["utt-1"] }
    }
  }), basePayload({ transcript: { patientId: "otro-paciente", utterances: baseUtterances } })),
    (error) => error.code === "permission-denied"
  );

  await assert.rejects(
    () => runGenerateStructuredNoteFromDictation({
      data: basePayload(),
      auth,
      apiKey: "test-key",
      OpenAIClass: class {},
      HttpsErrorClass: TestHttpsError,
      openaiClient: fakeOpenAIRejects({ status: 401, message: "401" }),
      logger: { info() {}, error() {} },
      timeoutMs: 500
    }),
    (error) => error.code === "failed-precondition"
  );

  await assert.rejects(
    () => runGenerateStructuredNoteFromDictation({
      data: basePayload(),
      auth,
      apiKey: "test-key",
      OpenAIClass: class {},
      HttpsErrorClass: TestHttpsError,
      openaiClient: fakeOpenAIRejects({ status: 429, message: "429" }),
      logger: { info() {}, error() {} },
      timeoutMs: 500
    }),
    (error) => error.code === "resource-exhausted"
  );

  await assert.rejects(
    () => runGenerateStructuredNoteFromDictation({
      data: basePayload(),
      auth,
      apiKey: "test-key",
      OpenAIClass: class {},
      HttpsErrorClass: TestHttpsError,
      openaiClient: fakeOpenAISlow(),
      logger: { info() {}, error() {} },
      timeoutMs: 10
    }),
    (error) => error.code === "deadline-exceeded"
  );

assert.ok(validateEvolutionText("Durante la entrevista se observa contacto visual y curso del pensamiento lineal.").some((issue) => issue.severity === "high"));
assert.ok(validateEvolutionText(validEvolution).length === 0);

console.log("noteGenerationHandler.test.js OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
