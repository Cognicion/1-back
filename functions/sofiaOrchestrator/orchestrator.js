const { HttpsError } = require("firebase-functions/v2/https");
const { analyticsPatientId } = require("../clinicalAnalytics/deidentification");
const {
  SOFIA_ORCHESTRATOR_LIMITS,
  SOFIA_ORCHESTRATOR_VERSION,
  SOFIA_UNIFIED_MODEL
} = require("./config");
const { buildAuthorizedSofiaContext, cleanText, redactKnownIdentifiers } = require("./contextService");
const { createSofiaToolRegistry } = require("./toolRegistry");

const SOFIA_UNIFIED_INSTRUCTIONS = `
Eres SOFÍA, el asistente clínico unificado de COGNICIÓN.

Puedes usar libremente las herramientas enumeradas para leer el contexto clínico autorizado y operar la interfaz dentro de sus permisos. Usa herramientas de lectura sin pedir confirmación cuando sean necesarias. Usa acciones de navegación, filtro, actualización de solo lectura y revisión local de nota cuando ayuden a cumplir la solicitud.

Reglas obligatorias:
- Las matrices entre pacientes son agregadas, desidentificadas y exclusivas de administracion. Nunca solicites ni reconstruyas filas individuales.
- Describe sus resultados como asociaciones exploratorias o coocurrencias, no como causalidad ni recomendacion automatica.
- Al resumir patrones globales, prioriza utilidad alta o moderada y estabilidad entre submuestras. Expón soporte, cobertura, incertidumbre y advertencias; no conviertas una puntuación de utilidad en importancia clínica.
- La similitud semántica solo indica afinidad entre fragmentos. Distingue temas compartidos de relaciones estadísticas y nunca la presentes como probabilidad clínica.
- Para cualquier afirmación específica del paciente actual, consulta primero una herramienta clínica o de análisis de página.
- Para preguntas sobre patrones, Beck/BSS, evidencia, parámetros, variables matemáticas o evolución, usa PatientPatternProfile mediante sus herramientas; no vuelvas a calcular ni reconstruyas resultados por tu cuenta.
- Explica un patrón únicamente con la evidencia almacenada. Nunca muestres razonamiento interno ni fabriques una explicación retrospectiva.
- Una confianza semántica mide extracción, no riesgo. BSS/38 es una normalización del instrumento, no una probabilidad de suicidio.
- Si BSS no tiene 19/19 reactivos, informa cobertura, suma parcial y faltantes, pero nunca presentes la suma parcial como resultado BSS definitivo.
- Los cambios longitudinales son descriptivos. No traduzcas una diferencia de BSS a un porcentaje de reducción de riesgo ni recomiendes alta, hospitalización o retiro de vigilancia por el detector.
- No inventes datos, diagnósticos, tratamientos, referencias ni resultados ausentes.
- No reveles ni solicites nombre, teléfono, correo, domicilio, CURP, RFC u otros identificadores.
- No afirmes causalidad a partir de asociaciones observacionales.
- Muestra numerador y denominador al mencionar probabilidades; respeta "evidencia insuficiente".
- Distingue datos backend autorizados de resultados suplementarios calculados en el navegador.
- No puedes guardar, editar, prescribir, eliminar ni enviar información clínica. No afirmes haberlo hecho.
- No emitas decisiones clínicas automáticas. Explica límites y conserva la revisión del profesional.
- Si no hay paciente seleccionado, responde en modo general y explica qué contexto falta.
- Responde en español claro, profesional y conciso.
`;

function normalizeMessage(value) {
  const message = String(value || "").trim();
  if (!message || message.length > SOFIA_ORCHESTRATOR_LIMITS.maxMessageLength) {
    throw new HttpsError("invalid-argument", "Mensaje inválido o demasiado extenso.");
  }
  return message;
}

function sanitizeHistory(history, identityTerms = []) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-SOFIA_ORCHESTRATOR_LIMITS.maxHistoryItems)
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .map((item) => ({
      role: item.role,
      content: cleanText(item.content, SOFIA_ORCHESTRATOR_LIMITS.maxHistoryItemLength, identityTerms)
    }))
    .filter((item) => item.content);
}

function parseToolArguments(argumentsValue) {
  try {
    const parsed = JSON.parse(argumentsValue || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function runToolLoop({ client, model, message, history, registry, identityTerms = [] }) {
  const input = [...sanitizeHistory(history, identityTerms), { role: "user", content: redactKnownIdentifiers(message, identityTerms) }];
  let totalToolCalls = 0;
  let response = null;

  for (let round = 0; round < SOFIA_ORCHESTRATOR_LIMITS.maxToolRounds; round += 1) {
    response = await client.responses.create({
      model,
      instructions: SOFIA_UNIFIED_INSTRUCTIONS,
      input,
      tools: registry.definitions,
      tool_choice: "auto",
      parallel_tool_calls: true,
      max_output_tokens: 2200,
      store: false
    });

    const output = Array.isArray(response.output) ? response.output : [];
    const calls = output.filter((item) => item.type === "function_call");
    if (!calls.length) {
      return {
        response,
        text: String(response.output_text || "").trim(),
        rounds: round + 1,
        totalToolCalls
      };
    }

    input.push(...output);
    for (const call of calls) {
      totalToolCalls += 1;
      if (totalToolCalls > SOFIA_ORCHESTRATOR_LIMITS.maxToolCalls) {
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: false, error: "tool_call_limit_reached" })
        });
        continue;
      }
      const result = await registry.execute(call.name, parseToolArguments(call.arguments));
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
  }

  return {
    response,
    text: String(response?.output_text || "No fue posible completar el análisis dentro del límite de herramientas.").trim(),
    rounds: SOFIA_ORCHESTRATOR_LIMITS.maxToolRounds,
    totalToolCalls
  };
}

async function runUnifiedSofia({ request, db, apiKey, OpenAIClass }) {
  const message = normalizeMessage(request.data?.mensaje);
  const context = await buildAuthorizedSofiaContext({ request, db });
  const registry = createSofiaToolRegistry(context);
  const client = new OpenAIClass({ apiKey });
  const result = await runToolLoop({
    client,
    model: SOFIA_UNIFIED_MODEL,
    message,
    history: request.data?.history,
    registry,
    identityTerms: context.identityTerms
  });
  const trace = registry.getTrace();

  console.info("[SOFÍA Unified] Solicitud completada", {
    mode: context.mode,
    actorAnalyticsId: analyticsPatientId(context.actorUid),
    patientAnalyticsId: context.patientId ? analyticsPatientId(context.patientId) : null,
    tools: trace.map((item) => item.name),
    toolCalls: result.totalToolCalls,
    rounds: result.rounds,
    orchestratorVersion: SOFIA_ORCHESTRATOR_VERSION
  });

  return {
    respuesta: result.text || "No pude generar una respuesta verificable.",
    mode: context.mode,
    toolsUsed: trace,
    actions: registry.getActions(),
    contextSummary: context.analysis ? {
      variables: context.analysis.variables.length,
      timelineEvents: context.analysis.timeline.length,
      patterns: context.analysis.patterns.length,
      associations: context.analysis.relationships.length,
      patientPatterns: context.patientPatternProfile?.patterns?.filter((item) => item.status !== "insufficient_data").length || 0,
      instruments: context.patientPatternProfile?.instruments?.length || 0
    } : null,
    orchestratorVersion: SOFIA_ORCHESTRATOR_VERSION,
    model: SOFIA_UNIFIED_MODEL,
    clinicalWritesPerformed: false
  };
}

module.exports = {
  SOFIA_UNIFIED_INSTRUCTIONS,
  normalizeMessage,
  parseToolArguments,
  runToolLoop,
  runUnifiedSofia,
  sanitizeHistory
};
