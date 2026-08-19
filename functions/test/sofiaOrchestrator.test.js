const assert = require("assert");
const {
  SOFIA_TOOL_DEFINITIONS,
  createSofiaToolRegistry
} = require("../sofiaOrchestrator/toolRegistry");
const {
  normalizeMessage,
  runToolLoop,
  runUnifiedSofia,
  sanitizeHistory
} = require("../sofiaOrchestrator/orchestrator");
const { buildAuthorizedSofiaContext, sanitizePageState } = require("../sofiaOrchestrator/contextService");

function createContext() {
  return {
    mode: "patient",
    patientId: "patient-real-id",
    identityTerms: ["Nombre privado"],
    analysis: {
      variables: [
        { variableId: "age", canonicalName: "edad", domain: "demographics", datatype: "number", statisticalType: "continuous", unit: "years", observedAt: "2026-01-01", value: 34, confidence: 0.95 },
        { variableId: "diagnosis", canonicalName: "diagnostico", domain: "diagnosis", datatype: "object", statisticalType: "categorical", unit: null, observedAt: "2026-01-02", value: { label: "Diagnóstico de Nombre privado", patientId: "patient-real-id", name: "Nombre privado" }, confidence: 0.85 }
      ],
      timeline: [{ eventType: "diagnosis", variableId: "diagnosis", value: { label: "Diagnóstico de prueba" }, observedAt: "2026-01-02", sourceRecordType: "notas", confidence: 0.85 }],
      patterns: [],
      relationships: []
    },
    pageState: sanitizePageState({
      capabilities: ["patient-overview", "timeline", "chat", "not-allowed"],
      hasNoteDraft: true,
      panelContext: {
        patient_overview: { age: 34, name: "Nombre privado" },
        pharmacology: { activeTreatments: [{ medication: "Medicamento X" }] },
        arbitrary: { secret: true }
      }
    })
  };
}

function createFakeDb({ actor, patient }) {
  return {
    doc(path) {
      return {
        async get() {
          if (path === "usuarios/doctor-1") return { exists: true, data: () => actor };
          if (path === "usuarios/patient-1") return { exists: true, data: () => patient };
          return { exists: false, data: () => ({}) };
        }
      };
    },
    collection() {
      return { async get() { return { docs: [] }; } };
    }
  };
}

async function run() {
  assert.ok(SOFIA_TOOL_DEFINITIONS.length >= 10);
  assert.ok(SOFIA_TOOL_DEFINITIONS.some((tool) => tool.name === "get_platform_pattern_matrices"));
  assert.ok(SOFIA_TOOL_DEFINITIONS.some((tool) => tool.name === "get_platform_semantic_relations"));
  assert.strictEqual(new Set(SOFIA_TOOL_DEFINITIONS.map((tool) => tool.name)).size, SOFIA_TOOL_DEFINITIONS.length);
  SOFIA_TOOL_DEFINITIONS.forEach((tool) => {
    assert.strictEqual(tool.type, "function");
    assert.strictEqual(tool.strict, true);
    assert.strictEqual(tool.parameters.additionalProperties, false);
  });

  const context = createContext();
  assert.deepStrictEqual(context.pageState.capabilities, ["patient-overview", "timeline", "chat"]);
  assert.strictEqual(context.pageState.panelContext.patient_overview.name, undefined);
  assert.strictEqual(context.pageState.panelContext.arbitrary, undefined);

  const registry = createSofiaToolRegistry(context);
  const overview = await registry.execute("get_patient_overview", {});
  assert.strictEqual(overview.ok, true);
  assert.strictEqual(overview.identityIncluded, false);
  assert.ok(!JSON.stringify(overview).includes("patient-real-id"));
  assert.ok(!JSON.stringify(overview).includes("Nombre privado"));

  const action = await registry.execute("show_page_section", { section: "timeline" });
  assert.strictEqual(action.ok, true);
  assert.deepStrictEqual(registry.getActions(), [{ type: "show-section", section: "timeline" }]);
  const unknown = await registry.execute("run_arbitrary_javascript", { code: "alert(1)" });
  assert.strictEqual(unknown.ok, false);
  assert.strictEqual(unknown.error, "unknown_tool");

  const noPatientRegistry = createSofiaToolRegistry({ mode: "general", analysis: null, pageState: sanitizePageState({}) });
  const denied = await noPatientRegistry.execute("get_patient_overview", {});
  assert.strictEqual(denied.error, "patient_context_required");
  const globalDenied = await noPatientRegistry.execute("get_platform_pattern_matrices", {});
  assert.strictEqual(globalDenied.error, "admin_required");
  const semanticDenied = await noPatientRegistry.execute("get_platform_semantic_relations", {});
  assert.strictEqual(semanticDenied.error, "admin_required");

  const adminRegistry = createSofiaToolRegistry({
    mode: "general",
    isAdmin: true,
    analysis: null,
    pageState: sanitizePageState({}),
    async loadPlatformMatrices() {
      return {
        matrixStatus: { stale: false, cohortSize: 40, generatedAt: "2026-08-14T00:00:00.000Z" },
        matrices: {
          mixed: {
            matrixType: "mixed_values",
            featureCount: 2,
            testedPairs: 1,
            associations: [{ variableA: "age.latest", variableB: "documentation.mean_words", variableALabel: "último valor de edad", variableBLabel: "promedio de palabras por nota", methodLabel: "Correlaciones de Pearson y Spearman", effectSize: 0.8, effectMetric: "pearson_r", effectMetricLabel: "r de Pearson", sampleSize: 40, evidenceStatus: "screened_candidate", evidenceStatusLabel: "Candidato exploratorio tras corrección FDR", possibleInterpretationEs: "Asociación observacional; no implica causalidad.", analyticsPatientId: "must-not-leak" }]
          },
          documentation: null,
          temporal: null
        }
      };
    },
    async loadPlatformSemanticKnowledge() {
      return {
        status: { status: "ready", indexedRecords: 12, indexedFragments: 18, vectorsExposedToClient: false },
        sources: [{ sourceLabel: "Notas médicas", sourceDomain: "documentacion", indexedRecords: 12, indexedFragments: 18, failedRecords: 0, analyticsPatientId: "must-not-leak" }],
        relations: [{ sourceLabelA: "Notas médicas", sourceLabelB: "Estudios", patientPairCount: 3, relationCount: 5, meanSimilarity: 0.88, possibleInterpretationEs: "Afinidad exploratoria; no implica causalidad." }],
        privacy: { vectorsIncluded: false, rawClinicalTextIncluded: false, directIdentifiersIncluded: false }
      };
    }
  });
  const globalKnowledge = await adminRegistry.execute("get_platform_pattern_matrices", {});
  assert.strictEqual(globalKnowledge.ok, true);
  assert.strictEqual(globalKnowledge.cohortSize, 40);
  assert.strictEqual(globalKnowledge.rowLevelDataIncluded, false);
  assert.strictEqual(globalKnowledge.matrices.mixed.associations[0].variableALabel, "último valor de edad");
  assert.match(globalKnowledge.matrices.mixed.associations[0].possibleInterpretationEs, /no implica causalidad/i);
  assert.ok(!JSON.stringify(globalKnowledge).includes("must-not-leak"));
  const semanticKnowledge = await adminRegistry.execute("get_platform_semantic_relations", {});
  assert.strictEqual(semanticKnowledge.ok, true);
  assert.strictEqual(semanticKnowledge.vectorsIncluded, false);
  assert.strictEqual(semanticKnowledge.rawClinicalTextIncluded, false);
  assert.strictEqual(semanticKnowledge.relations[0].patientPairCount, 3);
  assert.ok(!JSON.stringify(semanticKnowledge).includes("must-not-leak"));

  await assert.rejects(
    () => buildAuthorizedSofiaContext({
      request: { auth: { uid: "doctor-1", token: {} }, data: { patientId: "patient-1" } },
      db: createFakeDb({ actor: { rol: "medico" }, patient: { rol: "paciente", medicoTratanteUid: "doctor-2" } })
    }),
    (error) => error.code === "permission-denied"
  );
  const authorizedContext = await buildAuthorizedSofiaContext({
    request: {
      auth: { uid: "doctor-1", token: {} },
      data: {
        patientId: "patient-1",
        pageState: { panelContext: { narrative: "Seguimiento de Nombre privado" } }
      }
    },
    db: createFakeDb({ actor: { rol: "medico" }, patient: { rol: "paciente", nombre: "Nombre privado", medicoTratanteUid: "doctor-1", edad: 34 } })
  });
  assert.strictEqual(authorizedContext.mode, "patient");
  assert.ok(authorizedContext.pageState.panelContext.narrative.includes("[paciente actual]"));

  let requestCount = 0;
  const fakeClient = {
    responses: {
      async create(payload) {
        requestCount += 1;
        if (requestCount === 1) {
          assert.ok(payload.tools.some((tool) => tool.name === "get_patient_overview"));
          return {
            output_text: "",
            output: [{ type: "function_call", name: "get_patient_overview", arguments: "{}", call_id: "call-1" }]
          };
        }
        assert.ok(payload.input.some((item) => item.type === "function_call_output" && item.call_id === "call-1"));
        return { output_text: "Respuesta basada en herramientas.", output: [{ type: "message", role: "assistant" }] };
      }
    }
  };
  const loopRegistry = createSofiaToolRegistry(createContext());
  const result = await runToolLoop({
    client: fakeClient,
    model: "test-model",
    message: "Resume al paciente actual.",
    history: [{ role: "assistant", content: "Contexto anterior" }],
    registry: loopRegistry
  });
  assert.strictEqual(result.text, "Respuesta basada en herramientas.");
  assert.strictEqual(result.totalToolCalls, 1);
  assert.strictEqual(requestCount, 2);

  class FakeOpenAI {
    constructor(options) {
      assert.strictEqual(options.apiKey, "test-key");
      this.responses = {
        async create() {
          return { output_text: "Respuesta unificada.", output: [{ type: "message", role: "assistant" }] };
        }
      };
    }
  }
  const unified = await runUnifiedSofia({
    request: {
      auth: { uid: "doctor-1", token: {} },
      data: { mensaje: "Resume el expediente.", patientId: "patient-1", history: [] }
    },
    db: createFakeDb({ actor: { rol: "medico" }, patient: { rol: "paciente", medicoTratanteUid: "doctor-1", edad: 34 } }),
    apiKey: "test-key",
    OpenAIClass: FakeOpenAI
  });
  assert.strictEqual(unified.respuesta, "Respuesta unificada.");
  assert.strictEqual(unified.mode, "patient");
  assert.strictEqual(unified.clinicalWritesPerformed, false);

  assert.strictEqual(normalizeMessage(" hola "), "hola");
  assert.deepStrictEqual(sanitizeHistory([{ role: "system", content: "ignorar" }, { role: "user", content: "Nombre privado está estable" }], ["Nombre privado"]), [{ role: "user", content: "[paciente actual] está estable" }]);
  console.log("sofiaOrchestrator.test.js: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
