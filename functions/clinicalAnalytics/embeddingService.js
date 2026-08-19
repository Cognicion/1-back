const {
  CLINICAL_EMBEDDING_CONFIG,
  CLINICAL_EMBEDDING_ENGINE_VERSION
} = require("./config");

function assertEmbeddingVector(vector) {
  if (!Array.isArray(vector) || vector.length !== CLINICAL_EMBEDDING_CONFIG.dimensions) {
    throw new TypeError("La API devolvió un vector con dimensiones inesperadas.");
  }
  if (vector.some((value) => !Number.isFinite(Number(value)))) {
    throw new TypeError("La API devolvió un vector no numérico.");
  }
}

async function requestEmbeddingBatch({ client, inputs, analyticsUserId }) {
  const response = await client.embeddings.create({
    model: CLINICAL_EMBEDDING_CONFIG.model,
    input: inputs,
    dimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    encoding_format: "float",
    user: analyticsUserId
  });
  const ordered = [...(response.data || [])].sort((a, b) => Number(a.index) - Number(b.index));
  if (ordered.length !== inputs.length) throw new TypeError("La API no devolvió un vector por fragmento.");
  const vectors = ordered.map((item) => {
    assertEmbeddingVector(item.embedding);
    return item.embedding.map(Number);
  });
  return {
    vectors,
    promptTokens: Number(response.usage?.prompt_tokens) || 0,
    totalTokens: Number(response.usage?.total_tokens) || 0,
    model: response.model || CLINICAL_EMBEDDING_CONFIG.model
  };
}

async function createEmbeddingVectors({ apiKey, OpenAIClass, fragments, analyticsUserId }) {
  if (!apiKey) throw new TypeError("OPENAI_API_KEY no está disponible para generar embeddings.");
  if (typeof OpenAIClass !== "function") throw new TypeError("El cliente de OpenAI no está disponible.");
  const inputs = (fragments || []).map((fragment) => String(fragment.content || "").trim()).filter(Boolean);
  if (!inputs.length) return { vectors: [], promptTokens: 0, totalTokens: 0, model: CLINICAL_EMBEDDING_CONFIG.model };
  const client = new OpenAIClass({ apiKey });
  const vectors = [];
  let promptTokens = 0;
  let totalTokens = 0;
  let model = CLINICAL_EMBEDDING_CONFIG.model;
  for (let start = 0; start < inputs.length; start += CLINICAL_EMBEDDING_CONFIG.requestBatchSize) {
    const batch = await requestEmbeddingBatch({
      client,
      inputs: inputs.slice(start, start + CLINICAL_EMBEDDING_CONFIG.requestBatchSize),
      analyticsUserId
    });
    vectors.push(...batch.vectors);
    promptTokens += batch.promptTokens;
    totalTokens += batch.totalTokens;
    model = batch.model;
  }
  return {
    vectors,
    promptTokens,
    totalTokens,
    model,
    dimensions: CLINICAL_EMBEDDING_CONFIG.dimensions,
    embeddingEngineVersion: CLINICAL_EMBEDDING_ENGINE_VERSION
  };
}

function cosineSimilarity(vectorA = [], vectorB = []) {
  if (!vectorA.length || vectorA.length !== vectorB.length) return null;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < vectorA.length; index += 1) {
    const a = Number(vectorA[index]);
    const b = Number(vectorB[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    dot += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }
  if (!magnitudeA || !magnitudeB) return null;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

module.exports = {
  assertEmbeddingVector,
  cosineSimilarity,
  createEmbeddingVectors,
  requestEmbeddingBatch
};
