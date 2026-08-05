export const BOUNDARY_ALIASES = Object.freeze({
  note: ["nota de evolución", "nota de ingreso", "nota de egreso", "nota de urgencias", "interconsulta", "historia clínica"],
  subjective: ["subjetivo", "evolución", "padecimiento actual", "motivo de atención", "interrogatorio"],
  physicalExam: ["exploración física", "exploración neurológica", "exploración física y neurológica"],
  mentalExam: ["examen mental", "estado mental", "exploración psicopatológica"],
  diagnosis: ["diagnóstico", "diagnósticos", "diagnósticos de acuerdo a cie-10", "impresión diagnóstica"],
  plan: ["plan terapéutico", "indicaciones", "manejo", "tratamiento farmacológico"],
  medication: ["medicamentos", "medicación", "esquema farmacológico"],
  analysis: ["análisis", "comentario", "comentario clínico", "fundamentación diagnóstica y terapéutica"],
  prognosis: ["pronóstico"],
  destination: ["destino"]
});

export const MENTAL_EXAM_BOUNDARIES = Object.freeze([
  ...BOUNDARY_ALIASES.diagnosis,
  ...BOUNDARY_ALIASES.plan,
  ...BOUNDARY_ALIASES.medication,
  ...BOUNDARY_ALIASES.analysis,
  ...BOUNDARY_ALIASES.prognosis,
  ...BOUNDARY_ALIASES.destination,
  ...BOUNDARY_ALIASES.note
]);
