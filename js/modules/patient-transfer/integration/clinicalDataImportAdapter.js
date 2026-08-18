import { db } from "../../../firebase.js";
import { actualizarUsuario, obtenerUsuario } from "../../../services/usuarios.js?v=20260816-expedientes-cognicion-v1";
import { crearTratamiento, listarTratamientos } from "../../../services/tratamientos.js";
import { crearEstudio, listarEstudios } from "../../../services/estudios.js";
import { normalizarTextoBusquedaPaciente } from "../../../utils/nombresPacientes.js";
import { isSuspendedTreatmentAction } from "./treatmentTimelineReconciler.js?v=20260818-treatment-timeline-v1";
import { buildImportedStudyPayload, studyImportKey } from "./importedStudyContract.js?v=20260818-diagnoses-studies-v1";
import {
  construirActualizacionHistorialDiagnosticos,
  fusionarDiagnosticosImportados
} from "../../../services/diagnosticosPaciente.js?v=v160-imported-diagnoses-v1";
import { collection, doc, getDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function normalizeKey(value = "") {
  return normalizarTextoBusquedaPaciente(value).replace(/[^a-z0-9]+/g, "");
}

function treatmentKey(candidate = {}, context = {}) {
  return [
    normalizeKey(candidate.catalogMedicationId || candidate.medicationId || candidate.normalizedMedicationName || candidate.medicationName || candidate.medicamento || candidate.nombreMedicamento),
    normalizeKey(candidate.action || candidate.accionFarmacologica || candidate.statusSuggestion || candidate.estado),
    normalizeKey(candidate.date || candidate.fechaInicio || context.date),
    normalizeKey(candidate.sourceSection),
    normalizeKey(candidate.strengthValue ?? candidate.dosisValor ?? candidate.dose),
    normalizeKey(candidate.strengthUnit || candidate.dosisUnidad || candidate.doseUnit),
    normalizeKey(candidate.frequencyRaw || candidate.frecuencia),
    normalizeKey(candidate.scheduleText || candidate.horario || JSON.stringify(candidate.schedule || candidate.horarios || []))
  ].filter(Boolean).join(":");
}

function treatmentPayload(candidate = {}, context = {}) {
  const action = candidate.action || candidate.statusSuggestion || "Continúa";
  const suspended = isSuspendedTreatmentAction(action);
  const estado = suspended ? "suspendido" : action;
  const strengthValue = candidate.strengthValue ?? candidate.dose ?? "";
  const strengthUnit = candidate.strengthUnit || candidate.doseUnit || "";
  const schedule = Array.isArray(candidate.schedule) ? candidate.schedule : [];
  return {
    medicationId: candidate.catalogMedicationId || candidate.medicationId || "",
    catalogMedicationId: candidate.catalogMedicationId || null,
    catalogMatchStatus: candidate.catalogMatchStatus || "none",
    catalogMatchScore: candidate.catalogMatchScore ?? 0,
    catalogMatchMethod: candidate.catalogMatchMethod || "none",
    catalogPresentationMatch: candidate.catalogPresentationMatch ?? null,
    requiresCatalogReview: Boolean(candidate.requiresCatalogReview),
    medicamento: candidate.medicationName || "",
    nombreMedicamento: candidate.medicationName || "",
    genericName: candidate.genericName || candidate.medicationName || "",
    presentacion: candidate.presentation || "",
    dosis: [strengthValue, strengthUnit].filter(Boolean).join(" "),
    dosisValor: strengthValue,
    dosisUnidad: strengthUnit,
    concentracionValor: strengthValue,
    concentracionUnidad: strengthUnit,
    concentracionPorValor: candidate.strengthPerValue ?? null,
    concentracionPorUnidad: candidate.strengthPerUnit || "",
    cantidadPorToma: candidate.administrationQuantity ?? null,
    unidadAdministracion: candidate.administrationUnit || "",
    via: candidate.route || "",
    frecuencia: candidate.frequencyRaw || "",
    horarios: schedule,
    horario: candidate.scheduleText || "",
    accionFarmacologica: action,
    estado,
    fechaInicio: candidate.date || context.date || new Date().toISOString().slice(0, 10),
    ...(suspended ? {
      cambioIndicacion: "se_suspende",
      fechaSuspension: candidate.suspensionDate || context.date || new Date().toISOString().slice(0, 10),
      motivoSuspension: "Ausente del tratamiento indicado en la nota mas reciente"
    } : {}),
    indicacion: "",
    observaciones: candidate.sourceText || "",
    origenImportacionDocx: true,
    imported: true,
    transferOperationId: context.transferOperationId,
    sourceFileHash: context.sourceFileHash,
    sourceNoteId: context.noteId,
    sourceDocumentName: context.fileName || "",
    importCandidateKey: treatmentKey(candidate, context),
    sourceSection: candidate.sourceSection || "",
    sourceLocation: candidate.sourceLocation || null,
    evidence: candidate.evidence || null,
    _auditoria: {
      usuarioUid: context.user?.uid || "",
      usuarioNombre: context.user?.nombre || context.user?.email || "",
      usuarioRol: context.user?.rol || ""
    }
  };
}

export async function createImportedDiagnoses(patientId, candidates = [], context = {}) {
  const patient = context.patient || await obtenerUsuario(patientId, { forzar: true }).catch(() => null) || {};
  const current = Array.isArray(patient.historialDiagnosticos) ? patient.historialDiagnosticos : [];
  const merge = fusionarDiagnosticosImportados(current, candidates, {
    ...context,
    sourceNoteId: context.sourceNoteId || context.noteId || ""
  });
  console.info("[patient-transfer] diagnoses:selected", {
    detected: candidates.length,
    selected: merge.selected.length,
    coded: merge.selected.filter((candidate) => Boolean(candidate.code || candidate.codes?.length)).length
  });
  console.info("[patient-transfer] diagnoses:persist-start", { selected: merge.selected.length });

  if (merge.created.length) {
    await actualizarUsuario(patientId, construirActualizacionHistorialDiagnosticos(patient, merge.historial));
  }

  console.info("[patient-transfer] diagnoses:persist-success", {
    created: merge.created.length,
    existing: merge.existing.length,
    omitted: merge.omitted
  });
  return merge;
}

export async function createImportedTreatments(patientId, candidates = [], context = {}) {
  const selected = candidates.filter((candidate) => candidate.selectedForImport === true || candidate.include === true);
  console.info("patient-transfer:medications-source-real", {
    candidateCount: candidates.length,
    includedCount: selected.length,
    catalogResolvedCount: selected.filter((candidate) => Boolean(candidate.catalogMedicationId)).length,
    unresolvedCount: selected.filter((candidate) => !candidate.catalogMedicationId).length
  });
  console.info("patient-transfer:medications-target", {
    mode: context.effectiveAction === "associate" ? "associate_existing" : "create_new",
    hasTarget: Boolean(patientId)
  });
  if (!selected.length) {
    return { created: [], existing: [], omitted: candidates.length, detected: candidates.length, included: 0 };
  }

  const current = await listarTratamientos(patientId);
  console.info("patient-transfer:medications-history-before-real", { total: current.length });
  const seen = new Set(current.map((item) => item.importCandidateKey || treatmentKey(item, { date: item.fechaInicio })).filter(Boolean));
  const created = [];
  const existing = [];
  console.info("patient-transfer:medications-write-start", { selected: selected.length, hasTarget: Boolean(patientId) });

  for (let index = 0; index < selected.length; index += 1) {
    const candidate = selected[index];
    const key = treatmentKey(candidate, context);
    if (seen.has(key)) {
      existing.push({ candidateId: candidate.id, key });
      continue;
    }
    const payload = treatmentPayload(candidate, { ...context, index });
    const ref = await crearTratamiento(patientId, payload);
    seen.add(key);
    created.push({ id: ref.id, ...payload });
    console.info("[patient-transfer] persist:firestore-write", {
      domain: "medications",
      catalogLinked: Boolean(payload.catalogMedicationId),
      created: true
    });
  }

  const after = await listarTratamientos(patientId);
  const expectedKeys = selected.map((candidate) => treatmentKey(candidate, context));
  const observedKeys = new Set(after.map((item) => item.importCandidateKey || treatmentKey(item, { date: item.fechaInicio })).filter(Boolean));
  const writeNotObserved = expectedKeys.some((key) => !observedKeys.has(key));
  console.info("patient-transfer:medications-history-after-real", {
    total: after.length,
    inserted: created.length,
    idempotent: existing.length
  });
  if (writeNotObserved) {
    console.warn("patient-transfer:medications-write-not-observed", { writeResolved: true, expectedFound: false });
    const error = new Error("La persistencia de medicamentos no pudo verificarse.");
    error.code = "medications-write-not-observed";
    throw error;
  }
  console.info("patient-transfer:medications-write-result", {
    inserted: created.length,
    idempotent: existing.length,
    observed: true
  });
  return { created, existing, omitted: candidates.length - selected.length, detected: candidates.length, included: selected.length };
}

function instructionText(candidate = {}) {
  return String(candidate.text || candidate.value || candidate.rawText || "").trim();
}

function indicationKey(candidate = {}) {
  return normalizeKey(`${candidate.instructionType || "otherInstruction"}:${instructionText(candidate)}`);
}

function importedIndicationsPayload(candidates = [], context = {}) {
  const selected = candidates
    .filter((candidate) => candidate.selectedForImport === true || candidate.include === true)
    .map((candidate) => ({
      instructionType: candidate.instructionType || "otherInstruction",
      text: instructionText(candidate),
      key: indicationKey(candidate)
    }))
    .filter((candidate) => candidate.text);
  const byType = (type) => selected.filter((candidate) => candidate.instructionType === type).map((candidate) => candidate.text).join("\n");
  return {
    formato: "cognicion",
    servicio: context.service || "",
    fecha: context.date || new Date().toISOString().slice(0, 10),
    hora: context.time || "",
    dieta: byType("diet"),
    cuidados: byType("nursingCare"),
    alergiasIndicaciones: byType("allergies"),
    riesgoCaida: byType("fallRisk"),
    vigilancia: ["monitoring", "suicideRiskPrecautions", "selfHarmPrecautions"]
      .flatMap((type) => selected.filter((candidate) => candidate.instructionType === type).map((candidate) => candidate.text))
      .join("\n"),
    eventualidades: byType("otherInstruction"),
    indicaciones: selected.map((candidate) => candidate.text).join("\n"),
    items: selected,
    origenImportacionDocx: true,
    imported: true,
    transferOperationId: context.transferOperationId || "",
    sourceFileHash: context.sourceFileHash || "",
    sourceNoteId: context.noteId || "",
    importCandidateKeys: selected.map((candidate) => candidate.key)
  };
}

export async function createImportedIndications(patientId, candidates = [], context = {}) {
  const payload = importedIndicationsPayload(candidates, context);
  if (!payload.items.length) return { created: false, omitted: candidates.length };
  const indicationId = `imported-${context.transferOperationId || "transfer"}-${context.noteId || "note"}`
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  const indicationsCollection = collection(db, "usuarios", patientId, "indicaciones");
  const before = await getDocs(indicationsCollection);
  console.info("patient-transfer:indications-target", {
    mode: context.effectiveAction === "associate" ? "associate_existing" : "create_new",
    hasTarget: Boolean(patientId)
  });
  console.info("patient-transfer:indications-history-before-real", { total: before.size });
  console.info("patient-transfer:indications-write-start", { selected: payload.items.length, hasTarget: Boolean(patientId) });
  const indicationRef = doc(indicationsCollection, indicationId);
  const current = await getDoc(indicationRef);
  const existingKeys = new Set(current.exists() ? (current.data()?.importCandidateKeys || []) : []);
  const inserted = payload.importCandidateKeys.filter((key) => !existingKeys.has(key)).length;
  await setDoc(indicationRef, {
    ...(current.exists() ? current.data() : {}),
    ...payload,
    fechaCreacion: current.exists() ? current.data().fechaCreacion || new Date().toISOString() : new Date().toISOString()
  }, { merge: true });
  const after = await getDocs(indicationsCollection);
  const saved = await getDoc(indicationRef);
  const savedKeys = new Set(saved.exists() ? (saved.data()?.importCandidateKeys || []) : []);
  const expectedFound = payload.importCandidateKeys.every((key) => savedKeys.has(key));
  console.info("patient-transfer:indications-history-after-real", {
    total: after.size,
    inserted,
    idempotent: payload.items.length - inserted
  });
  if (!expectedFound) {
    console.warn("patient-transfer:indications-write-not-observed", { writeResolved: true, expectedFound: false });
    const error = new Error("La persistencia de indicaciones no pudo verificarse.");
    error.code = "indications-write-not-observed";
    throw error;
  }
  console.info("patient-transfer:indications-write-result", {
    inserted,
    idempotent: payload.items.length - inserted,
    observed: true
  });
  return { created: inserted > 0, existing: inserted === 0, inserted, idempotent: payload.items.length - inserted, omitted: candidates.length - payload.items.length, id: indicationId };
}

export async function createImportedStudies(patientId, candidates = [], context = {}) {
  const selected = candidates.filter((candidate) => candidate.include === true || candidate.selectedForImport === true);
  console.info("patient-transfer:studies-source-real", {
    candidateCount: candidates.length,
    includedCount: selected.length,
    laboratoryCount: selected.filter((candidate) => candidate.type === "Laboratorio").length,
    imagingCount: selected.filter((candidate) => candidate.type === "Gabinete").length
  });
  console.info("patient-transfer:studies-target", {
    mode: context.effectiveAction === "associate" ? "associate_existing" : "create_new",
    hasTarget: Boolean(patientId)
  });
  if (!selected.length) {
    return { created: [], existing: [], omitted: candidates.length, detected: candidates.length, included: 0 };
  }

  const before = await listarEstudios(patientId);
  console.info("patient-transfer:studies-history-before-real", { total: before.length });
  const seen = new Set(before.map((study) => study.importCandidateKey).filter(Boolean));
  const created = [];
  const existing = [];
  console.info("patient-transfer:studies-write-start", { selected: selected.length, hasTarget: Boolean(patientId) });

  for (const candidate of selected) {
    const key = studyImportKey(candidate, context);
    if (seen.has(key)) {
      existing.push({ candidateId: candidate.id, key });
      continue;
    }
    const payload = buildImportedStudyPayload(candidate, context);
    const ref = await crearEstudio(patientId, payload);
    seen.add(key);
    created.push({ id: ref.id, ...payload });
  }

  const after = await listarEstudios(patientId);
  const observed = new Set(after.map((study) => study.importCandidateKey).filter(Boolean));
  const expectedFound = selected.every((candidate) => observed.has(studyImportKey(candidate, context)));
  console.info("patient-transfer:studies-history-after-real", {
    total: after.length,
    inserted: created.length,
    idempotent: existing.length
  });
  if (!expectedFound) {
    console.warn("patient-transfer:studies-write-not-observed", { writeResolved: true, expectedFound: false });
    const error = new Error("La persistencia de estudios no pudo verificarse.");
    error.code = "studies-write-not-observed";
    throw error;
  }
  console.info("patient-transfer:studies-write-result", {
    inserted: created.length,
    idempotent: existing.length,
    observed: true
  });
  return {
    created,
    existing,
    omitted: candidates.length - selected.length,
    detected: candidates.length,
    included: selected.length
  };
}
