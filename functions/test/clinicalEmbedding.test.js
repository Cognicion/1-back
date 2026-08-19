const assert = require("assert");
const {
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_RECORD_COLLECTIONS,
  CLINICAL_RECORD_SOURCE_CATALOG
} = require("../clinicalAnalytics/config");
const {
  assertDeidentifiedSemanticText,
  buildDeidentifiedSemanticDocument,
  redactSemanticText
} = require("../clinicalAnalytics/semanticDocumentBuilder");
const {
  cosineSimilarity,
  createEmbeddingVectors
} = require("../clinicalAnalytics/embeddingService");
const {
  aggregateSemanticRelations,
  buildSemanticRelation
} = require("../clinicalAnalytics/semanticRelationshipEngine");
const {
  assertSafeEmbeddingMetadata,
  embeddingId
} = require("../clinicalAnalytics/embeddingPersistence");
const { decryptCursor, encryptCursor } = require("../clinicalAnalytics/embeddingRebuild");

async function run() {
  [
    "notasMedicas",
    "historiaClinica",
    "documentosImportados",
    "interconsultas",
    "tratamientos",
    "indicaciones",
    "recetas",
    "estudios",
    "laboratorios",
    "signosVitales",
    "escalasAplicadas",
    "rehabilitacionResultados"
  ].forEach((source) => assert.ok(CLINICAL_RECORD_COLLECTIONS.includes(source), `Falta la fuente clínica ${source}`));
  ["agenda", "mensajes", "preferencias", "permisosMedicos"].forEach((source) => {
    assert.strictEqual(CLINICAL_RECORD_SOURCE_CATALOG[source], undefined, `${source} no debe entrar al índice clínico`);
  });

  const patient = {
    nombreCompleto: "Ana Pérez Gómez",
    email: "ana@example.com",
    telefono: "5512345678",
    curp: "PEGA900101MDFRRN09",
    domicilio: "Calle Identificable 123"
  };
  const semantic = buildDeidentifiedSemanticDocument({
    patientId: "patient-real-id",
    patient,
    sourceCollection: "documentosImportados",
    sourceRecordId: "raw-document-id",
    record: {
      nombre: "Carlos Ramírez",
      archivoNombre: "Ana_Perez_expediente.docx",
      archivoStoragePath: "usuarios/patient-real-id/document.docx",
      textoExtraido: "Ana Pérez Gómez escribió desde ana@example.com y 55 1234 5678. Familiar: María López Torres. Juan Pérez acudió a consulta. Diagnóstico: ansiedad. Fecha 2026-08-19.",
      diagnostico: { nombre: "Trastorno de ansiedad" },
      medicamento: { nombre: "sertralina", dosis: "50 mg" },
      fechaISO: "2026-08-19T10:00:00.000Z"
    }
  });
  assert.ok(semantic);
  assert.ok(semantic.fragments.length > 0);
  assert.notStrictEqual(semantic.analyticsPatientId, "patient-real-id");
  assert.strictEqual(semantic.sourceRecordHash.includes("raw-document-id"), false);
  const serializedFragments = semantic.fragments.map((item) => item.content).join("\n");
  [
    "Ana Pérez Gómez",
    "ana@example.com",
    "5512345678",
    "patient-real-id",
    "Ana_Perez_expediente.docx",
    "usuarios/patient-real-id",
    "María López Torres",
    "Juan Pérez",
    "Carlos Ramírez",
    "2026-08-19"
  ].forEach((identifier) => assert.ok(!serializedFragments.includes(identifier), `Se filtró ${identifier}`));
  assert.ok(serializedFragments.includes("ansiedad"));
  assert.ok(serializedFragments.includes("sertralina"));
  assert.doesNotThrow(() => assertDeidentifiedSemanticText(serializedFragments, [patient.nombreCompleto, patient.email]));
  assert.throws(() => assertDeidentifiedSemanticText("Contacto ana@example.com", []));
  assert.ok(!redactSemanticText("Paciente Ana Pérez Gómez", ["Ana Pérez Gómez"]).includes("Ana Pérez Gómez"));

  const profile = buildDeidentifiedSemanticDocument({
    patientId: "patient-real-id",
    patient,
    sourceCollection: "patientProfile",
    sourceRecordId: "profile",
    record: {
      nombreCompleto: "Ana Pérez Gómez",
      email: "ana@example.com",
      rol: "paciente",
      preferencias: { theme: "dark" },
      edad: 36,
      diagnosticos: [{ nombre: "Trastorno Depresivo Mayor", codigo: "F32" }]
    }
  });
  const profileText = profile.fragments.map((item) => item.content).join("\n");
  assert.ok(profileText.includes("36"));
  assert.ok(profileText.includes("Trastorno Depresivo Mayor"));
  assert.ok(!profileText.includes("dark"));
  assert.ok(!profileText.includes("ana@example.com"));

  let capturedRequest;
  class FakeOpenAI {
    constructor(options) {
      assert.strictEqual(options.apiKey, "test-key");
      this.embeddings = {
        create: async (request) => {
          capturedRequest = request;
          return {
            model: request.model,
            data: request.input.map((unused, index) => ({ index, embedding: Array(request.dimensions).fill(index + 1) })),
            usage: { prompt_tokens: 12, total_tokens: 12 }
          };
        }
      };
    }
  }
  const generated = await createEmbeddingVectors({
    apiKey: "test-key",
    OpenAIClass: FakeOpenAI,
    fragments: semantic.fragments,
    analyticsUserId: semantic.analyticsPatientId
  });
  assert.strictEqual(capturedRequest.model, "text-embedding-3-small");
  assert.strictEqual(capturedRequest.dimensions, 512);
  assert.strictEqual(capturedRequest.user, semantic.analyticsPatientId);
  assert.strictEqual(generated.vectors[0].length, CLINICAL_EMBEDDING_CONFIG.dimensions);
  assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);

  const relations = [
    ["a1", "b1", "patient-a", "patient-b"],
    ["a2", "b2", "patient-c", "patient-d"],
    ["a3", "b3", "patient-e", "patient-f"]
  ].map(([sourceId, targetId, sourcePatient, targetPatient]) => buildSemanticRelation({
    source: { id: sourceId, analyticsPatientId: sourcePatient, sourceCollection: "notasMedicas" },
    target: { id: targetId, analyticsPatientId: targetPatient, sourceCollection: "estudios" },
    distance: 0.1
  }));
  relations.forEach((relation) => {
    assert.ok(relation);
    assert.strictEqual(relation.crossPatient, true);
    assert.strictEqual(relation.similarity, 0.9);
    assert.strictEqual(JSON.stringify(relation).includes("patient-a"), false);
  });
  const aggregated = aggregateSemanticRelations(relations);
  assert.strictEqual(aggregated.relations.length, 1);
  assert.strictEqual(aggregated.relations[0].patientPairCount, 3);
  assert.ok(aggregated.relations[0].possibleInterpretationEs.includes("no implica causalidad"));
  assert.strictEqual(aggregateSemanticRelations(relations.slice(0, 2)).relations.length, 0);
  assert.strictEqual(buildSemanticRelation({
    source: { id: "old", analyticsPatientId: "a", embeddingEngineVersion: "0.9.0" },
    target: { id: "new", analyticsPatientId: "b", embeddingEngineVersion: "1.0.0", embeddingModel: "text-embedding-3-small", embeddingDimensions: 512 },
    distance: 0.1
  }), null);

  const metadata = {
    analyticsPatientId: "hash",
    sourceRecordHash: "hash",
    sourceCollection: "notasMedicas",
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false
  };
  assert.doesNotThrow(() => assertSafeEmbeddingMetadata(metadata));
  assert.throws(() => assertSafeEmbeddingMetadata({ ...metadata, texto: "contenido clínico" }));
  assert.strictEqual(embeddingId("record", { fragmentIndex: 0, contentHash: "content" }).length, 64);

  const cursor = { phase: "records", patientCursor: "patient-real-id", currentPatientId: "another-real-id", sourceIndex: 4, recordCursor: "record-real-id" };
  const encryptedCursor = encryptCursor(cursor, "secret-api-key");
  assert.ok(!encryptedCursor.includes("patient-real-id"));
  assert.deepStrictEqual(decryptCursor(encryptedCursor, "secret-api-key"), cursor);

  console.log("clinicalEmbedding.test.js: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
