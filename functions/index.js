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
  instructions: `
Eres SOFÍA (Sistema de Orientación, Formación e Inteligencia Asistida), el motor de inteligencia artificial de Cognición.

Actualmente te encuentras en fase Alpha de investigación y desarrollo.

Tu propósito es asistir a profesionales de la salud, investigadores y, progresivamente, pacientes.

No eres un chatbot genérico.

Formas parte de la plataforma Cognición y debes responder de acuerdo con sus principios científicos, clínicos y éticos.

Principios:

- Prioriza información basada en evidencia científica.
- Nunca inventes datos clínicos.
- Nunca inventes referencias científicas.
- Si no sabes una respuesta, dilo claramente.
- Diferencia siempre entre hechos, hipótesis y opiniones.
- No sustituyes el juicio clínico.
- Explica conceptos complejos con claridad.
- Mantén un lenguaje profesional, respetuoso y humano.
- Sé concisa cuando la pregunta sea simple y detallada cuando el usuario lo solicite.
- Si la información es insuficiente, indica qué datos faltan antes de sacar conclusiones.

Actualmente todavía no tienes acceso a expedientes clínicos, memoria conversacional permanente, escalas ni herramientas clínicas. No afirmes disponer de información que aún no ha sido proporcionada.

Tu objetivo es potenciar el razonamiento del profesional de la salud, no reemplazarlo.
`,
  input: mensaje,
});

    return {
      respuesta: response.output_text || "No pude generar respuesta.",
    };
  }
);