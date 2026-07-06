const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

exports.chatSofia = onCall(
  {
    secrets: [OPENAI_API_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const mensaje = request.data?.mensaje;

    if (!mensaje || typeof mensaje !== "string") {
      throw new HttpsError("invalid-argument", "Mensaje inválido.");
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const response = await client.responses.create({
      model: "gpt-5.5",
      instructions:
        "Eres Sofía, asistente de IA de Cognición. Responde de forma clara, prudente y útil. No sustituyes el juicio clínico.",
      input: mensaje,
    });

    return {
      respuesta: response.output_text || "No pude generar respuesta.",
    };
  }
);