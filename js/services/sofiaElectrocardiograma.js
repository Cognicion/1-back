import {
  evaluarMedicamentosPaciente,
  extraerDiagnosticosEstructuradosPaciente
} from "./motorClinicoMedicamentos.js?v=20260811-pharmacology-files-consolidated-v1";
import { buildPatientEcgInterpretation } from "../clinical/ecg/ecgInterpretationCore.js";

function normalizedText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function activeTreatment(treatment = {}) {
  const status = normalizedText(treatment.estado || treatment.estatus || "activo");
  return !treatment.fechaSuspension && !/suspend|elimin|inactivo|finaliz/.test(status);
}

function noteDiagnoses(notes = []) {
  return (Array.isArray(notes) ? notes : []).flatMap((note) => {
    const values = note.diagnosticos || note.diagnosticosSeleccionados || note.observacionFray?.diagnosticos || [];
    return Array.isArray(values) ? values : [values];
  }).filter(Boolean);
}

function patientForMedicationEngine(expediente = {}) {
  const patient = expediente.paciente || {};
  const structuredDiagnoses = [
    ...(Array.isArray(patient.diagnosticos) ? patient.diagnosticos : []),
    ...(Array.isArray(patient.historialDiagnosticos) ? patient.historialDiagnosticos : []),
    ...noteDiagnoses(expediente.notas)
  ];
  if (patient.diagnostico) structuredDiagnoses.unshift(patient.diagnostico);
  return { ...patient, diagnosticos: structuredDiagnoses };
}

export function interpretPatientElectrocardiogram(expediente = {}) {
  const patientContext = patientForMedicationEngine(expediente);
  const medications = (expediente.tratamientos || []).filter(activeTreatment);
  let medicationAssessment;
  try {
    medicationAssessment = evaluarMedicamentosPaciente({
      paciente: patientContext,
      medicamentos: medications
    });
  } catch (error) {
    console.error("[SOFÍA ECG] No se pudo añadir el contexto farmacológico", {
      code: String(error?.code || error?.name || "unknown").slice(0, 80)
    });
    medicationAssessment = {
      alertas: [],
      medicamentosNormalizados: [],
      cobertura: { total: medications.length, fuenteVerificada: 0, fuentePendiente: medications.length, sinReglaIngrediente: medications.length }
    };
  }
  const structuredDiagnoses = extraerDiagnosticosEstructuradosPaciente(patientContext);
  const resolvedDiagnoses = (medicationAssessment.diagnosticosDetectados || []).map((diagnosis) => ({
    texto: diagnosis.nombre || diagnosis.evidenciaTexto || "",
    codigo: diagnosis.codigoRelacionado || "",
    estado: diagnosis.estado || "confirmado",
    origen: "motor_diagnostico_unificado"
  })).filter((diagnosis) => diagnosis.texto);
  const diagnoses = [...structuredDiagnoses, ...resolvedDiagnoses];
  return buildPatientEcgInterpretation({
    expediente,
    diagnoses,
    medicationAssessment
  });
}

export { activeTreatment as isActiveEcgTreatment, patientForMedicationEngine };
