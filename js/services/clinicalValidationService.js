import { normalizarComparacion } from "./clinicalTextNormalizer.js";

const REGLAS_NEGACION = [
  {
    concepto: "ideación suicida",
    afirmaciones: ["ideación suicida", "ideas suicidas", "plan suicida", "tomarme las pastillas", "hacerme daño"],
    negaciones: ["niega ideación suicida", "sin ideación suicida", "no presenta ideación suicida", "no se exploró ideación suicida"]
  },
  {
    concepto: "alteraciones sensoperceptivas",
    afirmaciones: ["escucha voces", "alucinaciones", "voces", "ve cosas", "alteraciones sensoperceptivas"],
    negaciones: ["niega alucinaciones", "niega voces", "no escucha voces", "no ve cosas", "sin alteraciones sensoperceptivas"]
  },
  {
    concepto: "consumo de sustancias",
    afirmaciones: ["consume drogas", "cristal", "cocaína", "cannabis", "marihuana", "alcohol diario"],
    negaciones: ["niega consumo", "no drogas", "sin consumo", "alcohol casi nada", "alcohol ocasional"]
  },
  {
    concepto: "síntomas maniformes",
    afirmaciones: ["mucha energía", "sin dormir", "gasto excesivo", "verborrea", "grandiosidad"],
    negaciones: ["niega episodios de mucha energía", "no ha tenido días de mucha energía", "no gasta mucho dinero", "no manía"]
  }
];

function aparece(textoNormalizado, frases = []) {
  return frases.filter((frase) => textoNormalizado.includes(normalizarComparacion(frase)));
}

export function validarTextoClinico(textoOriginal = "", datosClinicos = {}) {
  const texto = normalizarComparacion(textoOriginal);
  const issues = [];

  REGLAS_NEGACION.forEach((regla) => {
    const afirmadas = aparece(texto, regla.afirmaciones);
    const negadas = aparece(texto, regla.negaciones);
    if (afirmadas.length && negadas.length) {
      issues.push({
        type: "contradiccion",
        severity: "alta",
        concept: regla.concepto,
        message: `Se detectaron afirmaciones y negaciones para ${regla.concepto}. Revise el contexto antes de guardar.`,
        evidence: [...afirmadas, ...negadas]
      });
    } else if (negadas.length) {
      issues.push({
        type: "negacion_preservada",
        severity: "informativa",
        concept: regla.concepto,
        message: `${regla.concepto}: negación detectada y preservada.`,
        evidence: negadas
      });
    }
  });

  const medicamentosCriticos = texto.match(/\b\d+(?:[.,]\d+)?\s*(mg|mcg|g)\b/gi) || [];
  medicamentosCriticos.forEach((dosis) => {
    if (/\b(15|50|0.5|5)\s*(mg|mcg|g)\b/i.test(dosis)) {
      issues.push({
        type: "dato_por_confirmar",
        severity: "media",
        concept: "dosis",
        message: `Confirmar dosis dictada: ${dosis}.`,
        evidence: [dosis]
      });
    }
  });

  if (datosClinicos?.identificacion?.nombreCompleto && texto.includes("me llamo")) {
    issues.push({
      type: "procedencia",
      severity: "informativa",
      concept: "identificación",
      message: "La identificación del expediente tiene prioridad sobre datos demográficos mencionados en el dictado.",
      evidence: [datosClinicos.identificacion.nombreCompleto]
    });
  }

  return issues;
}

export function crearProvenanceRecord({
  concept = "",
  originalText = "",
  sourceType = "dictado",
  speaker = "hablante_no_identificado",
  status = "pending_confirmation",
  confidence = "media"
} = {}) {
  return {
    id: crypto.randomUUID?.() || `prov-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    concept,
    originalText,
    sourceType,
    speaker,
    status,
    confidence,
    createdAt: new Date().toISOString()
  };
}
