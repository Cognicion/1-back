const { listClinicalEvidence } = require("../clinicalAnalytics/evidenceRegistry");
const { stripIdentifiers } = require("../clinicalAnalytics/deidentification");
const {
  SOFIA_ORCHESTRATOR_LIMITS,
  SOFIA_PAGE_ANALYSIS_SECTIONS,
  SOFIA_PAGE_SECTIONS
} = require("./config");
const { cleanText, sanitizeSupplementalValue } = require("./contextService");

const CLINICAL_DOMAINS = Object.freeze([
  "demographics",
  "history",
  "diagnosis",
  "treatment",
  "symptoms",
  "mental_exam",
  "scales",
  "laboratories",
  "vitals",
  "events"
]);

function noArgsTool(name, description) {
  return {
    type: "function",
    name,
    description,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true
  };
}

const SOFIA_TOOL_DEFINITIONS = Object.freeze([
  noArgsTool("get_patient_overview", "Obtiene un resumen clínico estructurado y desidentificado del paciente actualmente autorizado."),
  {
    type: "function",
    name: "get_clinical_domain",
    description: "Consulta variables estructuradas del expediente autorizado en un dominio clínico concreto.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", enum: CLINICAL_DOMAINS } },
      required: ["domain"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_longitudinal_timeline",
    description: "Consulta la línea temporal estructurada del paciente; no devuelve texto libre de notas.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: SOFIA_ORCHESTRATOR_LIMITS.maxTimelineEvents },
        eventType: { type: "string", description: "Tipo de evento o cadena vacía para incluir todos." }
      },
      required: ["limit", "eventType"],
      additionalProperties: false
    },
    strict: true
  },
  noArgsTool("get_detected_patterns", "Obtiene patrones temporales observacionales detectados en el paciente autorizado."),
  noArgsTool("get_observational_associations", "Obtiene asociaciones y probabilidades empíricas con numerador, denominador e incertidumbre."),
  noArgsTool("get_platform_pattern_matrices", "Consulta hallazgos agregados y desidentificados ya filtrados por utilidad, redundancia, soporte y estabilidad. Requiere rol administrador y nunca devuelve filas individuales."),
  noArgsTool("get_platform_semantic_relations", "Consulta relaciones semánticas agregadas del índice de embeddings priorizadas por similitud, recurrencia, soporte entre pacientes y consistencia. Requiere rol administrador; no devuelve texto, vectores ni identidad."),
  {
    type: "function",
    name: "get_methodological_evidence",
    description: "Consulta el registro bibliográfico metodológico. Las referencias no validan automáticamente el producto.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", description: "Dominio metodológico o cadena vacía para todos." } },
      required: ["domain"],
      additionalProperties: false
    },
    strict: true
  },
  noArgsTool("get_page_capabilities", "Enumera las secciones y acciones disponibles en la página actual de SOFÍA."),
  {
    type: "function",
    name: "get_page_analysis",
    description: "Consulta resultados derivados que ya calcula la página, como alertas, farmacología o revisión de nota. Son datos suplementarios del cliente y no sustituyen el contexto backend.",
    parameters: {
      type: "object",
      properties: { section: { type: "string", enum: SOFIA_PAGE_ANALYSIS_SECTIONS } },
      required: ["section"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "show_page_section",
    description: "Lleva la interfaz a una sección permitida de la página sin modificar datos clínicos.",
    parameters: {
      type: "object",
      properties: { section: { type: "string", enum: SOFIA_PAGE_SECTIONS } },
      required: ["section"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "filter_patient_timeline",
    description: "Aplica un filtro visual al buscador de la línea temporal del paciente actual.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", maxLength: 120 } },
      required: ["query"],
      additionalProperties: false
    },
    strict: true
  },
  noArgsTool("refresh_patient_analysis", "Solicita volver a cargar el análisis del paciente actual. Es una operación de solo lectura."),
  noArgsTool("analyze_current_note_draft", "Ejecuta y muestra la revisión local por reglas de la nota escrita en el editor, sin guardarla."),
  noArgsTool("focus_note_editor", "Lleva el foco al editor de crítica de nota sin cambiar su contenido.")
]);

function patientRequired(context) {
  if (context.analysis) return null;
  return { ok: false, error: "patient_context_required", message: "Selecciona un paciente autorizado para usar esta herramienta." };
}

function safeVariable(variable, identityTerms = []) {
  return stripIdentifiers({
    variableId: variable.variableId,
    canonicalName: variable.canonicalName,
    domain: variable.domain,
    datatype: variable.datatype,
    statisticalType: variable.statisticalType,
    unit: variable.unit,
    observedAt: variable.observedAt,
    value: sanitizeSupplementalValue(variable.value, 0, identityTerms),
    confidence: variable.confidence
  });
}

function compactPattern(pattern) {
  return {
    patternId: cleanText(pattern.patternId, 240),
    scope: pattern.scope,
    patternType: pattern.patternType,
    variables: pattern.variables,
    events: pattern.events,
    supportCount: pattern.supportCount,
    firstObservedAt: pattern.firstObservedAt,
    lastObservedAt: pattern.lastObservedAt,
    confidence: pattern.confidence,
    algorithmVersion: pattern.algorithmVersion,
    sourceType: "cognicion_empirical"
  };
}

function compactPlatformAssociation(association = {}) {
  return {
    matrixType: association.matrixType,
    patternType: association.patternType || null,
    variableA: association.variableA,
    variableB: association.variableB,
    variableALabel: association.variableALabel || null,
    variableBLabel: association.variableBLabel || null,
    canonicalNameA: association.canonicalNameA || null,
    canonicalNameB: association.canonicalNameB || null,
    domainA: association.domainA || null,
    domainB: association.domainB || null,
    domainALabel: association.domainALabel || null,
    domainBLabel: association.domainBLabel || null,
    patternCategory: association.patternCategory || null,
    patternCategoryLabel: association.patternCategoryLabel || null,
    method: association.method || null,
    methodLabel: association.methodLabel || null,
    effectSize: association.effectSize ?? null,
    effectMetric: association.effectMetric || null,
    effectMetricLabel: association.effectMetricLabel || null,
    effectMagnitudeLabel: association.effectMagnitudeLabel || null,
    secondaryEffectSize: association.secondaryEffectSize ?? null,
    direction: association.direction || null,
    directionLabel: association.directionLabel || null,
    sampleSize: association.sampleSize ?? association.denominator ?? null,
    cohortSize: association.cohortSize ?? null,
    coverageRate: association.coverageRate ?? null,
    numerator: association.numerator ?? null,
    denominator: association.denominator ?? null,
    probability: association.probability ?? null,
    baselineProbability: association.baselineProbability ?? null,
    lift: association.lift ?? null,
    ciLower: association.ciLower ?? null,
    ciUpper: association.ciUpper ?? null,
    confidenceLevel: association.confidenceLevel ?? null,
    adjustedPValue: association.adjustedPValue ?? null,
    utilityScore: association.utilityScore ?? null,
    utilityTier: association.utilityTier || null,
    utilityTierLabel: association.utilityTierLabel || null,
    robustnessScore: association.robustnessScore ?? null,
    robustnessStatus: association.robustnessStatus || null,
    robustnessLabel: association.robustnessLabel || null,
    medianLagDays: association.medianLagDays ?? null,
    lagIqrDays: association.lagIqrDays ?? null,
    qualityWarnings: Array.isArray(association.qualityWarnings) ? association.qualityWarnings.slice(0, 8) : [],
    qualityWarningLabels: Array.isArray(association.qualityWarningLabels) ? association.qualityWarningLabels.slice(0, 8) : [],
    evidenceStatus: association.evidenceStatus,
    evidenceStatusLabel: association.evidenceStatusLabel || null,
    possibleInterpretationEs: association.possibleInterpretationEs || null,
    presentationLanguage: association.presentationLanguage || "es-MX",
    sourceType: "cognicion_empirical",
    nonCausal: true
  };
}

function compactSemanticRelation(relation = {}) {
  return {
    sourceCollectionA: relation.sourceCollectionA || null,
    sourceCollectionB: relation.sourceCollectionB || null,
    sourceLabelA: relation.sourceLabelA || null,
    sourceLabelB: relation.sourceLabelB || null,
    sourceDomainA: relation.sourceDomainA || null,
    sourceDomainB: relation.sourceDomainB || null,
    relationCount: relation.relationCount ?? 0,
    patientPairCount: relation.patientPairCount ?? 0,
    meanSimilarity: relation.meanSimilarity ?? null,
    minimumSimilarity: relation.minimumSimilarity ?? null,
    maximumSimilarity: relation.maximumSimilarity ?? null,
    similarityStandardDeviation: relation.similarityStandardDeviation ?? null,
    utilityScore: relation.utilityScore ?? null,
    utilityTier: relation.utilityTier || null,
    qualityWarnings: Array.isArray(relation.qualityWarnings) ? relation.qualityWarnings.slice(0, 8) : [],
    evidenceStatus: relation.evidenceStatus || null,
    possibleInterpretationEs: relation.possibleInterpretationEs || null,
    semanticRelationVersion: relation.semanticRelationVersion || null,
    sourceType: "cognicion_empirical",
    nonCausal: true
  };
}

function uniqueActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createSofiaToolRegistry(context) {
  const actions = [];
  const trace = [];

  function addAction(action) {
    actions.push(action);
    return { ok: true, scheduled: true, action };
  }

  async function execute(name, args = {}) {
    const startedAt = Date.now();
    let result;
    try {
      switch (name) {
        case "get_patient_overview": {
          result = patientRequired(context);
          if (result) break;
          const variables = context.analysis.variables;
          const selected = variables.filter((item) => ["demographics", "diagnosis", "treatment", "symptoms", "history"].includes(item.domain));
          result = {
            ok: true,
            source: "authorized_backend_context",
            summary: {
              variables: variables.length,
              timelineEvents: context.analysis.timeline.length,
              patterns: context.analysis.patterns.length,
              associations: context.analysis.relationships.length
            },
            variables: selected.slice(0, SOFIA_ORCHESTRATOR_LIMITS.maxVariablesPerTool).map((item) => safeVariable(item, context.identityTerms)),
            identityIncluded: false
          };
          break;
        }
        case "get_clinical_domain": {
          result = patientRequired(context);
          if (result) break;
          const domain = CLINICAL_DOMAINS.includes(args.domain) ? args.domain : "";
          result = {
            ok: true,
            source: "authorized_backend_context",
            domain,
            variables: context.analysis.variables
              .filter((item) => item.domain === domain)
              .slice(0, SOFIA_ORCHESTRATOR_LIMITS.maxVariablesPerTool)
              .map((item) => safeVariable(item, context.identityTerms))
          };
          break;
        }
        case "get_longitudinal_timeline": {
          result = patientRequired(context);
          if (result) break;
          const limit = Math.min(Math.max(Number(args.limit) || 12, 1), SOFIA_ORCHESTRATOR_LIMITS.maxTimelineEvents);
          const eventType = cleanText(args.eventType || "", 80).toLowerCase();
          const timeline = context.analysis.timeline.filter((item) => !eventType || String(item.eventType).toLowerCase().includes(eventType));
          result = {
            ok: true,
            source: "authorized_backend_context",
            events: timeline.slice(-limit).map((item) => ({
              eventType: item.eventType,
              variableId: item.variableId,
              value: sanitizeSupplementalValue(item.value, 0, context.identityTerms),
              observedAt: item.observedAt,
              sourceRecordType: item.sourceRecordType,
              confidence: item.confidence
            })),
            rawClinicalTextIncluded: false
          };
          break;
        }
        case "get_detected_patterns": {
          result = patientRequired(context);
          if (result) break;
          result = { ok: true, source: "cognicion_empirical", patterns: context.analysis.patterns.map(compactPattern) };
          break;
        }
        case "get_observational_associations": {
          result = patientRequired(context);
          if (result) break;
          result = {
            ok: true,
            source: "cognicion_empirical",
            causalClaimsAllowed: false,
            associations: context.analysis.relationships.map((item) => ({
              condition: item.condition,
              outcome: item.outcome,
              relationshipType: item.relationshipType,
              numerator: item.numerator,
              denominator: item.denominator,
              probability: item.probability
            }))
          };
          break;
        }
        case "get_platform_pattern_matrices": {
          if (!context.isAdmin || typeof context.loadPlatformMatrices !== "function") {
            result = { ok: false, error: "admin_required", message: "Las matrices globales solo estan disponibles para administracion." };
            break;
          }
          const knowledge = await context.loadPlatformMatrices();
          result = {
            ok: true,
            source: "cognicion_empirical_aggregate",
            cohortSize: knowledge.matrixStatus?.cohortSize || 0,
            stale: knowledge.matrixStatus?.stale !== false,
            generatedAt: knowledge.matrixStatus?.generatedAt || null,
            matrices: Object.fromEntries(Object.entries(knowledge.matrices || {}).map(([name, matrix]) => [name, matrix ? {
              matrixType: matrix.matrixType,
              featureCount: matrix.featureCount || null,
              testedPairs: matrix.testedPairs || 0,
              associations: (matrix.associations || [])
                .filter((association) => association.privacySuppressed !== true)
                .slice(0, 30)
                .map(compactPlatformAssociation)
            } : null])),
            rowLevelDataIncluded: false,
            directIdentifiersIncluded: false,
            causalClaimsAllowed: false
          };
          break;
        }
        case "get_platform_semantic_relations": {
          if (!context.isAdmin || typeof context.loadPlatformSemanticKnowledge !== "function") {
            result = { ok: false, error: "admin_required", message: "Las relaciones semánticas globales solo están disponibles para administración." };
            break;
          }
          const knowledge = await context.loadPlatformSemanticKnowledge();
          result = {
            ok: true,
            source: "cognicion_empirical_aggregate",
            status: knowledge.status,
            sources: (knowledge.sources || []).slice(0, 40).map((item) => ({
              sourceLabel: item.sourceLabel,
              sourceDomain: item.sourceDomain,
              indexedRecords: item.indexedRecords,
              indexedFragments: item.indexedFragments,
              failedRecords: item.failedRecords
            })),
            relations: (knowledge.relations || []).slice(0, 30).map(compactSemanticRelation),
            privacy: knowledge.privacy,
            rowLevelDataIncluded: false,
            vectorsIncluded: false,
            rawClinicalTextIncluded: false,
            directIdentifiersIncluded: false,
            causalClaimsAllowed: false
          };
          break;
        }
        case "get_methodological_evidence": {
          const domain = cleanText(args.domain || "", 120).toLowerCase();
          const evidence = listClinicalEvidence().filter((item) => !domain || String(item.domain).toLowerCase().includes(domain));
          result = { ok: true, source: "external_evidence_registry", evidence, linkedToPatientResult: false };
          break;
        }
        case "get_page_capabilities":
          result = {
            ok: true,
            source: "authorized_client_state",
            sections: context.pageState.capabilities,
            hasPatientContext: Boolean(context.analysis),
            hasNoteDraft: context.pageState.hasNoteDraft,
            allowedEffects: ["read", "navigate", "filter", "refresh_read_only", "local_note_review"],
            clinicalWritesAllowed: false
          };
          break;
        case "get_page_analysis": {
          const section = SOFIA_PAGE_ANALYSIS_SECTIONS.includes(args.section) ? args.section : "";
          const value = context.pageState.panelContext[section];
          result = value === undefined
            ? { ok: false, error: "page_analysis_unavailable", section }
            : { ok: true, source: "authorized_client_derived", section, value };
          break;
        }
        case "show_page_section":
          result = addAction({ type: "show-section", section: args.section });
          break;
        case "filter_patient_timeline":
          result = addAction({ type: "filter-timeline", query: cleanText(args.query || "", 120) });
          break;
        case "refresh_patient_analysis":
          result = context.analysis
            ? addAction({ type: "refresh-analysis" })
            : patientRequired(context);
          break;
        case "analyze_current_note_draft":
          result = context.pageState.hasNoteDraft
            ? addAction({ type: "analyze-note-draft" })
            : { ok: false, error: "note_draft_unavailable" };
          break;
        case "focus_note_editor":
          result = addAction({ type: "focus-note-editor" });
          break;
        default:
          result = { ok: false, error: "unknown_tool", tool: cleanText(name, 100) };
      }
      trace.push({ name, status: result?.ok === false ? "rejected" : "completed", durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      trace.push({ name, status: "failed", durationMs: Date.now() - startedAt });
      return { ok: false, error: "tool_execution_failed", tool: cleanText(name, 100) };
    }
  }

  return {
    definitions: SOFIA_TOOL_DEFINITIONS,
    execute,
    getActions: () => uniqueActions(actions),
    getTrace: () => trace.map((item) => ({ ...item }))
  };
}

module.exports = {
  CLINICAL_DOMAINS,
  SOFIA_TOOL_DEFINITIONS,
  createSofiaToolRegistry,
  safeVariable
};
