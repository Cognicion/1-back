import { db } from "../../../firebase.js";
import { actualizarUsuario, obtenerUsuario } from "../../../services/usuarios.js?v=20260729-imc-payload-fix";
import { crearTratamiento, listarTratamientos } from "../../../services/tratamientos.js";
import { normalizarTextoBusquedaPaciente } from "../../../utils/nombresPacientes.js";

function normalizeKey(value = "") {
  return normalizarTextoBusquedaPaciente(value).replace(/[^a-z0-9]+/g, "");
}

function diagnosisKey(candidate = {}) {
  return [
    normalizeKey(candidate.codingSystem),
    normalizeKey(candidate.code),
    normalizeKey(candidate.normalizedLabel || candidate.rawText)
  ].filter(Boolean).join(":");
}

function treatmentKey(candidate = {}) {
  return [
    normalizeKey(candidate.medicationName),
    normalizeKey(candidate.dose),
    normalizeKey(candidate.doseUnit),
    normalizeKey(candidate.frequencyRaw),
    normalizeKey(candidate.statusSuggestion)
  ].filter(Boolean).join(":");
}

function diagnosisPayload(candidate = {}, context = {}) {
  const id = `imported-${context.transferOperationId}-${context.index}`;
  const estadoClinico = candidate.statusSuggestion || "Confirmado";
  return {
    id,
    codigo: candidate.code || "",
    catalogo: candidate.codingSystem || "",
    nombre: candidate.normalizedLabel || candidate.rawText || "Diagnóstico importado",
    texto: candidate.rawText || "",
    estadoClinico,
    estado: estadoClinico === "Descartado" ? "descartado" : "activo",
    principal: Boolean(candidate.principal),
    fecha: context.date || new Date().toISOString().slice(0, 10),
    notas: `Importado desde DOCX: ${context.fileName || ""}`.trim(),
    fuenteImportacionDocx: true,
    transferOperationId: context.transferOperationId,
    sourceFileHash: context.sourceFileHash,
    sourceNoteId: context.noteId,
    importCandidateKey: diagnosisKey(candidate),
    sourceSection: candidate.sourceSection || "",
    sourceLocation: candidate.sourceLocation || null,
    confirmedByDoctor: true
  };
}

function treatmentPayload(candidate = {}, context = {}) {
  const estado = candidate.statusSuggestion || "Continúa";
  return {
    medicamento: candidate.medicationName || "",
    nombreMedicamento: candidate.medicationName || "",
    dosis: [candidate.dose, candidate.doseUnit].filter(Boolean).join(" "),
    dosisValor: candidate.dose || "",
    dosisUnidad: candidate.doseUnit || "",
    via: candidate.route || "",
    frecuencia: candidate.frequencyRaw || "",
    estado,
    fechaInicio: context.date || new Date().toISOString().slice(0, 10),
    indicacion: "",
    observaciones: candidate.sourceText || "",
    origenImportacionDocx: true,
    transferOperationId: context.transferOperationId,
    sourceFileHash: context.sourceFileHash,
    sourceNoteId: context.noteId,
    importCandidateKey: treatmentKey(candidate),
    sourceSection: candidate.sourceSection || "",
    sourceLocation: candidate.sourceLocation || null,
    _auditoria: {
      usuarioUid: context.user?.uid || "",
      usuarioNombre: context.user?.nombre || context.user?.email || "",
      usuarioRol: context.user?.rol || ""
    }
  };
}

export async function createImportedDiagnoses(patientId, candidates = [], context = {}) {
  const selected = candidates.filter((candidate) => candidate.include === true);
  if (!selected.length) return { created: [], existing: [], omitted: candidates.length };

  const patient = await obtenerUsuario(patientId).catch(() => null);
  const current = Array.isArray(patient?.historialDiagnosticos) ? patient.historialDiagnosticos : [];
  const seen = new Set(current.map((item) => item.importCandidateKey || diagnosisKey({
    codingSystem: item.catalogo,
    code: item.codigo,
    normalizedLabel: item.nombre || item.texto
  })).filter(Boolean));
  const created = [];
  const existing = [];
  const next = [...current];

  selected.forEach((candidate, index) => {
    const key = diagnosisKey(candidate);
    if (seen.has(key)) {
      existing.push({ candidateId: candidate.id, key });
      return;
    }
    const payload = diagnosisPayload(candidate, { ...context, index });
    seen.add(key);
    created.push(payload);
    next.push(payload);
  });

  if (created.length) {
    const active = next.find((item) => item.estado !== "descartado" && item.estadoClinico !== "Descartado") || null;
    await actualizarUsuario(patientId, {
      diagnostico: active || null,
      historialDiagnosticos: next,
      datosClinicosResumen: {
        ...(patient?.datosClinicosResumen || {}),
        diagnostico: active || null,
        historialDiagnosticos: next,
        fechaActualizacionDiagnosticos: new Date().toISOString()
      }
    });
  }

  return { created, existing, omitted: candidates.length - selected.length };
}

export async function createImportedTreatments(patientId, candidates = [], context = {}) {
  const selected = candidates.filter((candidate) => candidate.include === true);
  if (!selected.length) return { created: [], existing: [], omitted: candidates.length };

  const current = await listarTratamientos(patientId).catch(() => []);
  const seen = new Set(current.map((item) => item.importCandidateKey || treatmentKey(item)).filter(Boolean));
  const created = [];
  const existing = [];

  for (let index = 0; index < selected.length; index += 1) {
    const candidate = selected[index];
    const key = treatmentKey(candidate);
    if (seen.has(key)) {
      existing.push({ candidateId: candidate.id, key });
      continue;
    }
    const payload = treatmentPayload(candidate, { ...context, index });
    const ref = await crearTratamiento(patientId, payload);
    seen.add(key);
    created.push({ id: ref.id, ...payload });
  }

  return { created, existing, omitted: candidates.length - selected.length };
}
