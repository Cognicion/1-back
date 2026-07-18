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

const STRUCTURED_NOTE_PROMPT_VERSION = "voice_note_fray_aldo_v1_2026-07-18";
const CONVERSATION_SEGMENTATION_PROMPT_VERSION = "conversation_segmentation_es_mx_v1_2026-07-18";
const CONVERSATION_SEGMENTATION_PROMPT = `
Version del prompt: conversation_segmentation_es_mx_v1_2026-07-18.
Eres un asistente especializado en segmentacion conversacional clinica en espanol.

Recibiras una transcripcion clinica posiblemente sin puntuacion ni etiquetas fiables de hablante.

Divide la transcripcion en turnos conversacionales manejables.

Identifica rol probable:
- clinician
- patient
- relative
- unknown

Identifica acto comunicativo:
- question
- answer
- observation
- clinical_summary
- clinical_assessment
- plan
- correction
- other

Reglas:
Las preguntas clinicas suelen provenir del profesional.
Las respuestas breves posteriores suelen provenir del paciente.
No conviertas preguntas en sintomas.
Vincula cada respuesta con su pregunta usando linkedUtteranceId.
Las frases que empiezan con "durante la entrevista se observa" son observation del profesional.
Las frases que empiezan con "voy a resumir" o "para confirmar que comprendi" son clinical_summary.
Las frases de razonamiento clinico son clinical_assessment.
Las acciones futuras son plan.
No inventes hablantes.
Cuando exista duda usa unknown y requiresReview true.
Conserva el texto original de cada fragmento.
Si detectas texto truncado al final, agrega una advertencia.

Devuelve JSON estricto:
{
  "transcriptId": "",
  "segmentationMode": "linguistic",
  "schemaVersion": "conversation_segmentation_v1",
  "utterances": [
    {
      "id": "",
      "sequence": 1,
      "startTime": null,
      "endTime": null,
      "text": "",
      "probableRole": "clinician",
      "speechAct": "question",
      "linkedUtteranceId": "",
      "confidence": null,
      "sourceSegmentIds": [],
      "requiresReview": true
    }
  ],
  "warnings": []
}
`;
const STRUCTURED_NOTE_PROMPT = `
Version del prompt: voice_note_fray_aldo_v1_2026-07-18.
Eres un asistente especializado en documentacion psiquiatrica institucional.

Recibiras la transcripcion de una conversacion entre profesional, paciente y posiblemente familiares, sin etiquetas fiables. Distingue preguntas, respuestas, observaciones, recapitulaciones y plan. Las preguntas del profesional no constituyen hallazgos clinicos ni deben atribuirse al paciente.

Genera una propuesta para una nota psiquiatrica de alta calidad en estilo Formato Fray - Aldo:
1. Evolucion o padecimiento actual.
2. Exploracion fisica/neurologica, examen mental y resultados.
3. Comentario y analisis.
4. Plan.

La Evolucion debe ser cronologica, narrativa, detallada, sin repeticiones y en tercera persona. Para evolucion intrahospitalaria puede iniciar con: "[Nombre], masculino/femenino de [edad] anos, quien cursa su [numero] dia de estancia intrahospitalaria en el servicio [servicio] bajo el criterio de [criterio]...". Para ingreso adapta a padecimiento actual cronologico.

El examen mental debe ser narrativo y seguir este orden cuando los datos existan: sexo y edad aparente, talla, complexion, integridad y conformacion, vestimenta, higiene y alino, lugar, posicion, aceptacion de entrevista, expresion facial, marcha, psicomotricidad, conciencia, orientacion, actitud, atencion, contacto visual, habla, semantica, prosodia y sintaxis, discurso, espontaneidad, latencia, curso del pensamiento, velocidad, contenido, ideas delirantes, ideas de muerte, ideacion suicida, plan e intencion, heteroagresividad, sensopercepcion, animo, afecto, juicio, funciones cognitivas, inteligencia, advertencia de padecimiento, introspeccion, control de impulsos y proyeccion a futuro.

El Comentario debe comenzar con "Se trata de paciente..." e integrar sindrome, curso, antecedentes, riesgo, juicio, conducta, sustancias, confiabilidad, diferenciales y justificacion de manejo, sin repetir la Evolucion. Usa cautela clinica: "continua cursando predominantemente con", "debe interpretarse con cautela", "resulta indispensable continuar corroborando", "continua beneficiandose de manejo intrahospitalario" cuando corresponda.

El Plan debe contener unicamente acciones futuras confirmadas. No conviertas "valorar" en "iniciar". No conviertas tratamientos previos en actuales.

Reglas innegociables:
No inventes informacion. No completes hallazgos normales. No cambies negaciones. No cambies medicamentos, dosis, cifras, fechas ni nombres. No infieras sexo por nombre; usa el expediente o deja pendiente. No confundas riesgo historico con actual. No copies la transcripcion. No incluyas alertas tecnicas en el texto clinico. Conserva citas textuales y utiliza "sic. Pac." o "sic. Fam." segun informante. Devuelve JSON valido conforme al esquema.

Devuelve JSON estricto con:
{
  "transcriptSessionId": "",
  "patientId": "",
  "encounterId": "",
  "documentType": "",
  "writingStyle": "",
  "schemaVersion": "voice_note_soap_v1",
  "evolutionOrSubjective": { "text": "", "sourceSegmentIds": [] },
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

function validarSegmentacionConversacionalBackend(parsed = {}, payload = {}) {
  const roles = new Set(["clinician", "patient", "relative", "unknown"]);
  const acts = new Set(["question", "answer", "observation", "clinical_summary", "clinical_assessment", "plan", "correction", "other"]);
  const utterances = Array.isArray(parsed.utterances) ? parsed.utterances : [];
  return {
    transcriptId: String(payload.transcriptId || payload.transcriptSessionId || parsed.transcriptId || ""),
    segmentationMode: ["acoustic", "linguistic", "hybrid", "manual"].includes(parsed.segmentationMode) ? parsed.segmentationMode : "linguistic",
    schemaVersion: "conversation_segmentation_v1",
    promptVersion: CONVERSATION_SEGMENTATION_PROMPT_VERSION,
    provider: "external",
    utterances: utterances.map((utterance, index) => ({
      id: String(utterance.id || `utt-${index + 1}`),
      sequence: Number.isFinite(Number(utterance.sequence)) ? Number(utterance.sequence) : index + 1,
      startTime: Number.isFinite(Number(utterance.startTime)) ? Number(utterance.startTime) : null,
      endTime: Number.isFinite(Number(utterance.endTime)) ? Number(utterance.endTime) : null,
      text: String(utterance.text || "").trim(),
      probableRole: roles.has(utterance.probableRole) ? utterance.probableRole : "unknown",
      speechAct: acts.has(utterance.speechAct) ? utterance.speechAct : "other",
      linkedUtteranceId: String(utterance.linkedUtteranceId || ""),
      confidence: Number.isFinite(Number(utterance.confidence)) ? Number(utterance.confidence) : null,
      sourceSegmentIds: Array.isArray(utterance.sourceSegmentIds) ? utterance.sourceSegmentIds : [],
      requiresReview: utterance.requiresReview !== false
    })).filter((utterance) => utterance.text),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
  };
}

exports.segmentClinicalConversation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 90,
    memory: "512MiB"
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesion.");
    }

    const payload = request.data || {};
    if (payload.userId && payload.userId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "La sesion de dictado pertenece a otro usuario.");
    }
    const transcript = String(payload.correctedTranscript || payload.text || payload.confirmedTranscript || "").trim();
    if (!transcript) {
      throw new HttpsError("invalid-argument", "No hay transcripcion para segmentar.");
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
    const response = await client.responses.create({
      model: process.env.OPENAI_SEGMENTATION_MODEL || process.env.OPENAI_NOTE_MODEL || "gpt-5.5",
      instructions: CONVERSATION_SEGMENTATION_PROMPT,
      input: JSON.stringify({
        transcriptId: payload.transcriptId || payload.transcriptSessionId || "",
        patientId: payload.patientId || "",
        encounterId: payload.encounterId || "",
        correctedTranscript: transcript,
        transcriptSegments: payload.transcriptSegments || []
      })
    });

    const parsed = extraerJson(response.output_text || "");
    if (!parsed || typeof parsed !== "object") {
      throw new HttpsError("internal", "El proveedor de segmentacion no devolvio JSON valido.");
    }

    return validarSegmentacionConversacionalBackend(parsed, payload);
  }
);

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
      schemaVersion: parsed.schemaVersion || "voice_note_soap_v1",
      validationIssues: Array.isArray(parsed.validationIssues) ? parsed.validationIssues : []
    };
  }
);
