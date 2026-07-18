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

const STRUCTURED_NOTE_PROMPT_VERSION = "soap_psiquiatria_v2_2026-07-18";
const STRUCTURED_NOTE_PROMPT = `
Version del prompt: ${"soap_psiquiatria_v2_2026-07-18"}.
Eres un asistente de documentacion psiquiatrica. Recibiras la transcripcion de una conversacion entre profesional, paciente y/o familiares, posiblemente sin etiquetas de hablante.

Distingue preguntas del profesional y respuestas del paciente. Las preguntas no constituyen hallazgos. La respuesta determina el dato clinico.

Redacta una propuesta SOAP psiquiatrica para los campos existentes:
SUBJETIVO: informacion referida por paciente o terceros, organizada cronologicamente.
OBJETIVO: signos vitales, exploracion fisica/neurologica, examen mental y resultados observados o documentados.
ANALISIS: comentario clinico integrado, iniciando con "Se trata de paciente...", sin repetir el Subjetivo.
PLAN: unicamente acciones futuras expresamente dictadas o confirmadas.

No inventes datos. No completes hallazgos normales. No cambies negaciones. No cambies cifras, fechas, medicamentos ni dosis. No conviertas preguntas en sintomas. No confundas riesgo historico con actual. Conserva informantes y temporalidad. No diagnostiques mediante palabras aisladas. No conviertas "valorar" en "iniciar". No incluyas alertas tecnicas en el texto clinico. Devuelve JSON valido conforme al esquema.

Devuelve JSON estricto con:
{
  "transcriptSessionId": "",
  "patientId": "",
  "encounterId": "",
  "documentType": "",
  "writingStyle": "",
  "subjective": { "text": "", "sourceSegmentIds": [] },
  "objective": {
    "vitalSigns": [],
    "physicalNeurologicalExam": "",
    "mentalStatusExam": "",
    "results": "",
    "sourceSegmentIds": []
  },
  "analysis": {
    "text": "",
    "riskAssessment": {
      "deathIdeation": {},
      "suicidalIdeation": {},
      "plan": {},
      "intent": {},
      "meansAccess": {},
      "attempts": {},
      "selfHarm": {},
      "protectiveFactors": {},
      "currentRiskUncertainty": {}
    },
    "diagnosticReasoning": "",
    "differentialDiagnoses": [],
    "medicalConditionsToRuleOut": [],
    "sourceSegmentIds": []
  },
  "plan": { "text": "", "items": [], "sourceSegmentIds": [] },
  "unresolvedItems": [],
  "validationIssues": [],
  "speakerAssignments": [],
  "diagnosisProposals": [],
  "indicationProposals": []
}
`;

function extraerJson(texto = "") {
  const limpio = String(texto || "").trim();
  if (!limpio) return null;
  try { return JSON.parse(limpio); } catch {}
  const match = limpio.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

exports.generateStructuredNoteFromDictation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesion.");
    }

    const payload = request.data || {};
    if (!payload.patientId || typeof payload.patientId !== "string") {
      throw new HttpsError("invalid-argument", "patientId invalido.");
    }
    if (payload.userId && payload.userId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "La sesion de dictado pertenece a otro usuario.");
    }
    const transcript = String(payload.correctedTranscript || payload.confirmedTranscript || "").trim();
    if (!transcript) {
      throw new HttpsError("invalid-argument", "No hay transcripcion confirmada para generar la nota.");
    }
    if (String(payload.selectedDocumentType || "") === "clase_academica") {
      return {
        transcriptSessionId: payload.transcriptSessionId || "",
        patientId: payload.patientId,
        encounterId: payload.encounterId || "",
        documentType: "clase_academica",
        writingStyle: payload.selectedWritingStyle || "",
        timeline: [],
        sections: {},
        medications: [],
        substances: [],
        diagnosisProposals: [],
        indicationProposals: [],
        unresolvedFragments: [transcript],
        contradictions: [],
        provenance: [{ source: "dictado_por_voz", status: "no_clinical_note_generated" }],
        validationIssues: [{ id: "clase_academica_no_nota", severity: "info", message: "Clase academica: no se genera nota clinica." }]
      };
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
    const response = await client.responses.create({
      model: process.env.OPENAI_NOTE_MODEL || "gpt-5.5",
      instructions: STRUCTURED_NOTE_PROMPT,
      input: JSON.stringify({
        transcriptSessionId: payload.transcriptSessionId,
        userId: request.auth.uid,
        patientId: payload.patientId,
        encounterId: payload.encounterId,
        confirmedTranscript: payload.confirmedTranscript,
        correctedTranscript: transcript,
        transcriptSegments: payload.transcriptSegments || [],
        speakers: payload.speakers || [],
        provenance: payload.provenance || {},
        selectedDocumentType: payload.selectedDocumentType,
        selectedWritingStyle: payload.selectedWritingStyle,
        existingNoteFields: payload.existingNoteFields || {},
        authorizedPatientContext: payload.authorizedPatientContext || {}
      })
    });

    const parsed = extraerJson(response.output_text || "");
    if (!parsed || typeof parsed !== "object") {
      throw new HttpsError("internal", "El proveedor generativo no devolvio JSON valido.");
    }
    if (parsed.patientId && parsed.patientId !== payload.patientId) {
      throw new HttpsError("internal", "El proveedor devolvio un patientId distinto.");
    }
    return {
      ...parsed,
      transcriptSessionId: payload.transcriptSessionId || parsed.transcriptSessionId || "",
      patientId: payload.patientId,
      encounterId: payload.encounterId || parsed.encounterId || "",
      documentType: payload.selectedDocumentType || parsed.documentType || "",
      writingStyle: payload.selectedWritingStyle || parsed.writingStyle || "",
      promptVersion: STRUCTURED_NOTE_PROMPT_VERSION,
      validationIssues: Array.isArray(parsed.validationIssues) ? parsed.validationIssues : []
    };
  }
);
