import { db } from "../../../firebase.js";
import { actualizarUsuario, obtenerUsuario } from "../../../services/usuarios.js";
import { crearTratamiento, listarTratamientos } from "../../../services/tratamientos.js";
import { normalizarTextoBusquedaPaciente } from "../../../utils/nombresPacientes.js";
import { collection, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

function diagnosisPayload(candidate = {}, context = {}) {
  const id = `imported-${context.transferOperationId}-${context.index}`;
  const estadoClinico = candidate.statusSuggestion || "Confirmado";
  const codes = [...new Set((Array.isArray(candidate.codes) ? candidate.codes : [candidate.code])
    .map((code) => String(code || "").trim())
    .filter(Boolean))];
  return {
    id,
    codigo: candidate.code || codes[0] || "",
    codes,
    catalogo: candidate.codingSystem || "",
    nombre: candidate.normalizedLabel || candidate.rawText || "Diagnóstico importado",
    texto: candidate.rawText || "",
    estadoClinico,
    estado: estadoClinico === "Descartado" ? "descartado" : "activo",
    principal: Boolean(candidate.principal),
    fecha: context.date || new Date().toISOString().slice(0, 10),
    notas: `Importado desde DOCX: ${context.fileName || ""}`.trim(),
    fuenteImportacionDocx: true,
    imported: true,
    transferOperationId: context.transferOperationId,
    sourceFileHash: context.sourceFileHash,
    sourceNoteId: context.noteId,
    sourceDocumentName: context.fileName || "",
    importCandidateKey: diagnosisKey(candidate),
    sourceSection: candidate.sourceSection || "",
    sourceLocation: candidate.sourceLocation || null,
    confirmedByDoctor: true
  };
}

function treatmentPayload(candidate = {}, context = {}) {
  const estado = candidate.action || candidate.statusSuggestion || "Continúa";
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
    accionFarmacologica: candidate.action || estado,
    estado,
    fechaInicio: context.date || new Date().toISOString().slice(0, 10),
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
  const selected = candidates.filter((candidate) => candidate.selectedForImport === true || candidate.include === true);
  console.info("[patient-transfer] diagnoses:selected", { detected: candidates.length, selected: selected.length });
  console.info("[patient-transfer] diagnoses:persist-start", { patientId, selected: selected.length });
  if (!selected.length) {
    console.info("[patient-transfer] diagnoses:persist-success", { patientId, created: 0, existing: 0 });
    return { created: [], existing: [], omitted: candidates.length };
  }

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

  console.info("[patient-transfer] diagnoses:persist-success", { patientId, created: created.length, existing: existing.length });
  return { created, existing, omitted: candidates.length - selected.length };
}

export async function createImportedTreatments(patientId, candidates = [], context = {}) {
  const selected = candidates.filter((candidate) => candidate.selectedForImport === true || candidate.include === true);
  console.info("[patient-transfer] treatments:selected", { detected: candidates.length, selected: selected.length });
  console.info("[patient-transfer] treatments:persist-start", { patientId, selected: selected.length });
  if (!selected.length) {
    console.info("[patient-transfer] treatments:persist-success", { patientId, created: 0, existing: 0 });
    return { created: [], existing: [], omitted: candidates.length };
  }

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
    console.info("[patient-transfer] persist:firestore-write", JSON.stringify({
      candidateId: candidate.id || "",
      catalogLinked: Boolean(payload.catalogMedicationId),
      created: true
    }));
  }

  console.info("[patient-transfer] treatments:persist-success", { patientId, created: created.length, existing: existing.length });
  return { created, existing, omitted: candidates.length - selected.length };
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
  const indicationRef = doc(collection(db, "usuarios", patientId, "indicaciones"), indicationId);
  const current = await getDoc(indicationRef);
  await setDoc(indicationRef, {
    ...(current.exists() ? current.data() : {}),
    ...payload,
    fechaCreacion: current.exists() ? current.data().fechaCreacion || new Date().toISOString() : new Date().toISOString()
  }, { merge: true });
  return { created: !current.exists(), existing: current.exists(), omitted: candidates.length - payload.items.length, id: indicationId };
}
