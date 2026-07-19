import assert from "node:assert/strict";
import {
  ExternalConversationSegmentationProvider,
  crearClaveCacheSegmentacion,
  seleccionarBloquesProblematicos
} from "../services/conversationSegmentationProviders.js";

function crearTurnosLocales(total = 79) {
  return Array.from({ length: total }, (_item, index) => {
    const sequence = index + 1;
    const id = `local-${sequence}`;
    const problematic = [8, 9, 10, 11, 12, 55, 56, 61, 62, 74, 75, 79].includes(sequence);
    return {
      id,
      utteranceId: id,
      sequence,
      text: problematic
        ? `turno ${sequence} con pregunta respuesta mezclada quiere revisar riesgo no actualmente se mantendra vigilancia`
        : `turno ${sequence} estable con contenido clinico breve suficiente para simular una entrevista extensa sin necesidad de usar datos reales`,
      probableRole: problematic ? "unknown" : (sequence % 2 ? "clinician" : "patient"),
      speechAct: problematic ? "other" : (sequence % 2 ? "question" : "answer"),
      linkedUtteranceId: sequence % 2 ? "" : `local-${sequence - 1}`,
      linkedQuestionId: sequence % 2 ? "" : `local-${sequence - 1}`,
      confidence: null,
      sourceSegmentIds: [],
      requiresReview: problematic
    };
  });
}

const bloques = seleccionarBloquesProblematicos(crearTurnosLocales());
assert.ok(bloques.length >= 3, "debe seleccionar bloques ambiguos prioritarios");
assert.ok(bloques.some((bloque) => bloque.start <= 7 && bloque.end >= 9), "debe incluir turnos 8-10");
assert.ok(bloques.some((bloque) => bloque.start <= 54 && bloque.end >= 59), "debe incluir turnos 55-60");
assert.ok(bloques.every((bloque) => bloque.end >= bloque.start), "los bloques deben ser rangos validos");

assert.equal(
  crearClaveCacheSegmentacion({ text: "Hola  mundo" }),
  crearClaveCacheSegmentacion({ correctedTranscript: "hola mundo" }),
  "el hash debe ser estable ante espacios y mayusculas"
);

let llamadasCache = 0;
const providerCache = new ExternalConversationSegmentationProvider({
  callable: async () => {
    llamadasCache += 1;
    return {
      data: {
        provider: "external",
        segmentationMode: "linguistic",
        utterances: [
          { text: "Pregunta externa.", probableRole: "clinician", speechAct: "question", requiresReview: false },
          { text: "Respuesta externa.", probableRole: "patient", speechAct: "answer", linkedUtteranceId: "utt-1", requiresReview: false }
        ],
        warnings: []
      }
    };
  }
});

const textoCorto = "me puede decir su nombre completo Carlos Eduardo cuantos anos tiene veintinueve";
const primera = await providerCache.segment({ text: textoCorto, transcriptId: "cache-1", clientRequestId: "cache-a" });
const segunda = await providerCache.segment({ text: textoCorto, transcriptId: "cache-1", clientRequestId: "cache-b" });
assert.equal(llamadasCache, 1, "la segunda llamada identica debe usar cache en memoria");
assert.equal(primera.provider, "external");
assert.equal(segunda.cacheHit, true);

let llamadasBloques = 0;
const providerParcial = new ExternalConversationSegmentationProvider({
  callable: async (payload) => {
    llamadasBloques += 1;
    if (payload.blockId.endsWith(":b2")) {
      const error = new Error("deadline");
      error.code = "functions/deadline-exceeded";
      error.details = {
        requestId: payload.clientRequestId,
        stage: "provider_request",
        retryable: true
      };
      throw error;
    }
    return {
      data: {
        provider: "external",
        segmentationMode: "linguistic",
        requestId: payload.clientRequestId,
        utterances: [
          {
            text: `Bloque externo ${payload.chunkIndex}.`,
            probableRole: "clinician",
            speechAct: "clinical_summary",
            sourceSegmentIds: payload.sourceSegments.map((segment) => segment.id),
            requiresReview: false
          }
        ],
        warnings: []
      }
    };
  }
});

providerParcial.local = {
  segment: () => ({
    transcriptId: "carlos-79",
    segmentationMode: "linguistic",
    schemaVersion: "conversation_segmentation_v1",
    promptVersion: "rule_based",
    provider: "rule_based",
    utterances: crearTurnosLocales(),
    warnings: []
  })
};

const parcial = await providerParcial.segment({
  text: "fixture largo unico para fallo parcial",
  transcriptId: "carlos-79",
  clientRequestId: "carlos-test"
});
assert.equal(parcial.provider, "hybrid");
assert.ok(parcial.failedBlocks.length >= 1, "debe conservar el bloque fallido");
assert.ok(parcial.utterances.length > 0, "no debe descartar la segmentacion completa");
assert.ok(parcial.metrics.externalBlockCount >= 1, "debe conservar bloques externos exitosos");
assert.ok(llamadasBloques >= 2, "debe procesar mas de un bloque");
assert.ok(parcial.warnings.some((warning) => warning.code === "partial_external_segmentation_failed"));
assert.ok(parcial.providerFailure.requestId.startsWith("carlos-test:b2"));

let llamadasRetry = 0;
const providerRetry = new ExternalConversationSegmentationProvider({
  callable: async (payload) => {
    llamadasRetry += 1;
    if (llamadasRetry === 1) {
      const error = new Error("deadline");
      error.code = "functions/deadline-exceeded";
      error.details = {
        requestId: payload.clientRequestId,
        stage: "provider_request",
        retryable: true
      };
      throw error;
    }
    return {
      data: {
        provider: "external",
        segmentationMode: "linguistic",
        requestId: payload.clientRequestId,
        utterances: [
          { text: "Buenas tardes, ¿cómo se encuentra?", probableRole: "clinician", speechAct: "question" },
          { text: "Mejor, doctor.", probableRole: "patient", speechAct: "answer" }
        ],
        warnings: []
      }
    };
  }
});

const textoMinimo = "Buenas tardes, como se encuentra. Mejor, doctor.";
const fallo = await providerRetry.segment({ text: textoMinimo, transcriptId: "mini", clientRequestId: "mini-a" });
assert.equal(fallo.provider, "rule_based");
assert.equal(fallo.metrics.externalBlockCount, 0);
assert.equal(fallo.metrics.failedBlockCount, 1);
const reintento = await providerRetry.segment({ text: textoMinimo, transcriptId: "mini", clientRequestId: "mini-b" });
assert.equal(reintento.provider, "external");
assert.equal(llamadasRetry, 2, "la promesa fallida debe limpiarse y permitir un segundo intento");

console.log("conversationSegmentationProviderBlocks.test.mjs OK");
