export const BOUNDARY_ALIASES = Object.freeze({
  note: ["nota de evolución", "nota de ingreso", "nota de egreso", "nota de urgencias", "interconsulta", "historia clínica"],
  subjective: ["subjetivo", "evolución", "padecimiento actual", "motivo de atención", "interrogatorio"],
  physicalExam: ["exploración física", "exploración neurológica", "exploración física y neurológica"],
  mentalExam: ["examen mental", "estado mental", "exploración psicopatológica"],
  diagnosis: ["diagnóstico", "diagnósticos", "diagnósticos de acuerdo a cie-10", "impresión diagnóstica"],
  plan: ["medidas generales y tratamiento farmacológico", "tratamiento farmacológico", "plan terapéutico", "plan de manejo", "conducta terapéutica", "indicaciones", "manejo", "tratamiento", "plan"],
  medication: ["medicamentos", "medicación", "esquema farmacológico"],
  analysis: ["análisis", "comentario", "comentario clínico", "fundamentación diagnóstica y terapéutica"],
  prognosis: ["pronóstico"],
  destination: ["destino"]
});

export const TREATMENT_PLAN_ALIASES = Object.freeze([
  ...BOUNDARY_ALIASES.plan,
  "medidas generales",
  "fármacos"
]);

export const TREATMENT_PLAN_BOUNDARIES = Object.freeze([
  ...BOUNDARY_ALIASES.analysis,
  ...BOUNDARY_ALIASES.prognosis,
  ...BOUNDARY_ALIASES.destination,
  ...BOUNDARY_ALIASES.note,
  "fundamentación diagnóstica y terapéutica",
  "nombre, firma y cédula",
  "nombre firma y cedula"
]);

export const MENTAL_EXAM_BOUNDARIES = Object.freeze([
  ...BOUNDARY_ALIASES.diagnosis,
  ...BOUNDARY_ALIASES.plan,
  ...BOUNDARY_ALIASES.medication,
  ...BOUNDARY_ALIASES.analysis,
  ...BOUNDARY_ALIASES.prognosis,
  ...BOUNDARY_ALIASES.destination,
  ...BOUNDARY_ALIASES.note
]);
