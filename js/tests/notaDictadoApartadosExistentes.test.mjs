import assert from "node:assert/strict";
import { RuleBasedNoteGenerationProvider } from "../services/noteGenerationProviders.js";

const provider = new RuleBasedNoteGenerationProvider();

const existingNoteFields = {
  subjetivo: { id: "subjetivo", label: "Padecimiento actual / evolucion", value: "" },
  objetivo: { id: "objetivo", label: "Examen mental", value: "" },
  analisis: { id: "analisis", label: "Comentario clinico", value: "" },
  plan: { id: "plan", label: "Plan", value: "" },
  tratamiento: { id: "tratamiento", label: "Tratamiento e indicaciones", value: "" },
  obsExploracionFisicaNeurologica: { id: "obsExploracionFisicaNeurologica", label: "Exploracion fisica", value: "" },
  obsResultadosEstudios: { id: "obsResultadosEstudios", label: "Resultados", value: "" },
  obsPronostico: { id: "obsPronostico", label: "Pronostico", value: "" },
  obsDestino: { id: "obsDestino", label: "Destino", value: "" }
};

const basePayload = {
  transcriptSessionId: "dictado-test-1",
  userId: "clinico-1",
  patientId: "paciente-1",
  encounterId: "encuentro-1",
  pendingTranscript: "",
  transcriptSegments: [],
  speakers: ["paciente"],
  provenance: { source: "dictado_por_voz" },
  selectedWritingStyle: "formato_fray_narrativo",
  existingNoteFields,
  authorizedPatientContext: {
    source: "expediente",
    id: "paciente-1",
    edad: 34,
    sexo: "masculino",
    diagnosticosActivos: [],
    medicamentosActivos: []
  }
};

const casos = [
  ["ingreso_observacion", "Paciente masculino de 34 años acude referido por urgencias por insomnio de cinco dias, irritabilidad y verborrea. Madre refiere consumo de alcohol previo. Niega ideacion suicida actual. En examen mental se observa alerta, cooperador, lenguaje aumentado y afecto irritable. Plan: vigilancia estrecha y solicitar biometria hematica."],
  ["evolucion_observacion", "Paciente masculino de 34 años cursa segundo dia en observacion. Durante la noche durmio cuatro horas, sin incidencias. Niega ideas suicidas actuales. Se observa orientado, con lenguaje normoproductivo. Plan: continuar vigilancia y valorar egreso si mantiene estabilidad."],
  ["egreso_traslado_observacion", "Tras 48 horas en observacion presenta mejoria conductual, sin agitacion, niega ideacion suicida actual. Se indica egreso con seguimiento por consulta externa y red de apoyo familiar."],
  ["ingreso_ucep", "Ingresa a UCEP procedente de Hospital General el 12 de marzo posterior a intento autolitico por ingesta de tabletas, con lavado gastrico previo. Actualmente somnoliento, sin datos de agitacion. Plan: vigilancia de riesgo y seguimiento por psiquiatria."],
  ["urgencias", "Acude a urgencias por agitacion psicomotriz y alucinaciones auditivas referidas por familiar. Niega consumo reciente. Se observa inquieto, suspicaz. Plan: valorar criterio de hospitalizacion."],
  ["referencia_navarro", "Unidad de origen centro de salud. Se refiere a hospital Navarro por riesgo suicida, con antecedente de intento hace dos meses y tristeza persistente. Actualmente niega plan, cuenta con madre como apoyo."],
  ["contrarreferencia", "Contrarreferencia a unidad de origen tras estabilizacion. Se recomienda continuar seguimiento, psicoterapia y vigilancia de adherencia."],
  ["pediatria", "Paciente escolar de 10 años, madre refiere irritabilidad, bajo rendimiento y sueno disminuido. Niega autolesiones. Plan: valoracion por paidopsiquiatria y orientacion familiar."],
  ["paidopsiquiatria", "Adolescente femenina de 15 años, padre refiere autolesiones previas. Actualmente niega intencion suicida. Se observa alerta, cooperadora, afecto ansioso. Plan: plan de seguridad y seguimiento familiar."],
  ["dictado_libre_apartados", "Padecimiento actual: inicia hace tres semanas con ansiedad. Examen mental: alerta y orientado. Comentario: sintomas ansiosos con deterioro escolar. Plan: seguimiento por consulta externa."]
];

for (const [selectedDocumentType, transcript] of casos) {
  const result = provider.generate({
    ...basePayload,
    selectedDocumentType,
    confirmedTranscript: transcript,
    correctedTranscript: transcript
  });
  assert.equal(result.patientId, "paciente-1");
  assert.equal(result.transcriptSessionId, "dictado-test-1");
  assert.equal(result.provenance.source, "dictado_por_voz");
  assert.equal(result.insertionAllowed, false);
  assert.ok(result.sections && typeof result.sections === "object");
  assert.ok(Array.isArray(result.generatedSections));
  assert.ok(result.generatedSections.every((section) => section.accepted === false));
  assert.ok(result.generatedSections.every((section) => section.section !== "diagnosticos"));
  assert.ok(result.structuredExtraction.timeline.length >= 1);
}

const clase = provider.generate({
  ...basePayload,
  selectedDocumentType: "clase_academica",
  confirmedTranscript: "Clase academica sobre depresion mayor, criterios diagnosticos y tratamiento.",
  correctedTranscript: "Clase academica sobre depresion mayor, criterios diagnosticos y tratamiento."
});
assert.equal(clase.generatedSections.length, 0);
assert.equal(clase.insertionAllowed, false);
assert.ok(clase.validationIssues.some((issue) => issue.id === "clase_academica_no_nota"));

console.log("notaDictadoApartadosExistentes.test.mjs OK");
