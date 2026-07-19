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

const carlosShortUtterances = [
  { id: "car-1", sequence: 1, text: "Me siento mas tranquilo que ayer, aunque todavia quiero irme.", probableRole: "patient", speechAct: "answer" },
  { id: "car-2", sequence: 2, text: "Dormi como seis horas, desperte una vez y volvi a dormirme.", probableRole: "patient", speechAct: "answer" },
  { id: "car-3", sequence: 3, text: "Las voces ya no las escucho desde hace dos dias.", probableRole: "patient", speechAct: "answer" },
  { id: "car-4", sequence: 4, text: "Ya no estoy tan seguro de que me persiguieran o me quisieran hacer dano.", probableRole: "patient", speechAct: "answer" },
  { id: "car-5", sequence: 5, text: "Creo que la falta de sueno y la metanfetamina pudieron influir.", probableRole: "patient", speechAct: "answer" },
  { id: "car-6", sequence: 6, text: "No tengo ideas suicidas y no quiero danar a mi hermano ni a otras personas.", probableRole: "patient", speechAct: "answer" },
  { id: "car-7", sequence: 7, text: "He aceptado los medicamentos, me dan risperidona, pero siento somnolencia en la manana y boca seca.", probableRole: "patient", speechAct: "answer" },
  { id: "car-8", sequence: 8, text: "No he tenido rigidez, temblor, mareo ni caidas.", probableRole: "patient", speechAct: "answer" },
  { id: "car-9", sequence: 9, text: "Mi mama es mi apoyo y puede ayudarme con los medicamentos.", probableRole: "patient", speechAct: "answer" },
  { id: "car-10", sequence: 10, text: "Quiero continuar tratamiento y evitar consumir metanfetamina y cannabis.", probableRole: "patient", speechAct: "answer" },
  { id: "car-11", sequence: 11, text: "Buenas tardes.", probableRole: "unknown", speechAct: "other" }
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

function carlosPayload(overrides = {}) {
  return basePayload({
    clientRequestId: "note-carlos-short",
    patientContext: {
      patientId: "carlos-1",
      encounterId: "enc-carlos",
      name: "Carlos Kaju Quintero",
      age: 34,
      sex: "hombre",
      service: "OBSERVACION",
      hospitalizationDay: 0,
      admissionCriterion: null
    },
    transcript: {
      transcriptId: "tx-carlos-short",
      originalTextHash: "hash-carlos-short",
      segmentationMode: "hybrid",
      utterances: carlosShortUtterances
    },
    ...overrides
  });
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

const correctedCarlosEvolution = [
  "Carlos Kaju Quintero, hombre de 34 anos, quien permanece en estancia intrahospitalaria en el servicio especial de OBSERVACION. Durante la valoracion refiere sentirse mas tranquilo en comparacion con el dia previo, aunque persiste con deseos de egreso.",
  "Refiere ausencia de alucinaciones auditivas durante los ultimos dos dias y disminucion de la conviccion respecto a las ideas de persecucion previamente referidas, mencionando que ya no se encuentra tan seguro de que lo persiguieran o quisieran hacerle dano. Atribuye de manera posible la aparicion de dichas experiencias a la falta de sueno y al consumo de metanfetamina.",
  "Niega ideacion suicida actual y niega intencion de danar a su hermano o a otras personas. Identifica a su madre como red de apoyo, con posibilidad de ayudarle con los medicamentos, y manifiesta disposicion para continuar tratamiento y evitar el consumo de metanfetamina y cannabis.",
  "Desde el punto de vista medico, refiere sueno aproximado de seis horas, con un despertar nocturno y recuperacion posterior del sueno. Refiere aceptacion de medicamentos e identifica risperidona dentro del esquema; como efectos adversos menciona somnolencia matutina y xerostomia. Niega rigidez, temblor, mareo y caidas."
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

await assert.rejects(
  () => runWithOutput(JSON.stringify({
    sections: {
      evolution: {
        text: "Carlos Kaju Quintero, hombre de 34 anos, se encuentra en el dia 0 de estancia en el servicio de OBSERVACION. Durante la valoracion realizo la entrevista sentado y mostro buena cooperacion, con conducta tranquila y orientada. Refiere sentirse mas tranquilo.",
        sourceUtteranceIds: ["car-1"],
        requiresReview: true
      }
    },
    globalWarnings: []
  }), carlosPayload()),
  (error) => error.code === "data-loss"
);

await assert.rejects(
  () => runWithOutput(JSON.stringify({
    sections: {
      evolution: {
        text: "Carlos Kaju Quintero, hombre de 34 anos, quien permanece en estancia intrahospitalaria en el servicio especial de OBSERVACION. Refiere sentirse mas tranquilo, niega ideacion suicida actual y niega intencion de danar a terceros.",
        sourceUtteranceIds: ["car-1", "car-6"],
        requiresReview: true
      }
    },
    globalWarnings: []
  }), carlosPayload()),
  (error) => error.code === "data-loss"
);

const carlosAccepted = await runWithOutput(JSON.stringify({
  sections: {
    evolution: {
      text: correctedCarlosEvolution,
      sourceUtteranceIds: carlosShortUtterances.map((utterance) => utterance.id),
      confidence: 0.82,
      requiresReview: true,
      warnings: []
    }
  },
  globalWarnings: []
}), carlosPayload());
assert.equal(carlosAccepted.sections.evolution.text.includes("dia 0"), false);
assert.ok(carlosAccepted.sections.evolution.warnings.some((warning) => warning.code === "minor_unknown_speaker"));
assert.match(carlosAccepted.sections.evolution.text, /risperidona/i);
assert.match(carlosAccepted.sections.evolution.text, /somnolencia/i);
assert.match(carlosAccepted.sections.evolution.text, /xerostomia/i);
assert.match(carlosAccepted.sections.evolution.text, /madre/i);
assert.match(carlosAccepted.sections.evolution.text, /evitar el consumo/i);
assert.deepEqual(carlosAccepted.sections.evolution.sourceUtteranceIds, carlosShortUtterances.map((utterance) => utterance.id));

const nullDayAccepted = await runWithOutput(JSON.stringify({
  sections: {
    evolution: {
      text: correctedCarlosEvolution,
      sourceUtteranceIds: carlosShortUtterances.map((utterance) => utterance.id),
      requiresReview: true,
      warnings: []
    }
  },
  globalWarnings: []
}), carlosPayload({ patientContext: { ...carlosPayload().patientContext, hospitalizationDay: null } }));
assert.equal(nullDayAccepted.sections.evolution.text.includes("dia 0"), false);

await assert.rejects(
  () => runWithOutput(JSON.stringify({
    sections: {
      evolution: {
        text: correctedCarlosEvolution,
        sourceUtteranceIds: carlosShortUtterances.map((utterance) => utterance.id),
        requiresReview: true
      }
    },
    globalWarnings: []
  }), carlosPayload({
    transcript: {
      transcriptId: "tx-carlos-critical-unknown",
      originalTextHash: "hash-carlos-critical-unknown",
      segmentationMode: "hybrid",
      utterances: [
        ...carlosShortUtterances.filter((utterance) => utterance.id !== "car-11"),
        { id: "car-x", sequence: 11, text: "No se si debo tomar risperidona 2 mg o si quiero salir hoy.", probableRole: "unknown", speechAct: "other" }
      ]
    }
  })),
  (error) => error.code === "data-loss"
);

console.log("noteGenerationHandler.test.js OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
