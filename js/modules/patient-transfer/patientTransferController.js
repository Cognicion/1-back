import { getAuthenticatedUserOnce, getUserProfileOnce } from "../../services/authContextService.js";
import { TRANSFER_STATUS, resetPatientTransferState, setPatientTransferExecutionState, setPatientTransferFiles, setPatientTransferGroups, setPatientTransferResults, setPatientTransferStatus } from "./patientTransferState.js";
import { validateTransferDocxFile } from "./docx/docxValidator.js";
import { calculateDocxHash, calculateNormalizedTextHash } from "./docx/docxHashService.js";
import { extractDocx } from "./docx/docxExtractor.js";
import { normalizeDocxBlocks, normalizedBlocksToText } from "./docx/docxBlockNormalizer.js";
import { parsePatientFields, fieldValues } from "./parsing/patientFieldParser.js";
import { parseClinicalSections } from "./parsing/clinicalSectionParser.js";
import { extractClinicalCandidates } from "./parsing/clinicalCandidateParser.js";
import { extractVitalSignsCandidates } from "./parsing/vitalSignsParser.js";
import { parseNoteMetadata } from "./parsing/noteMetadataParser.js";
import { groupDocumentsByPatient } from "./parsing/documentGroupingService.js";
import { analyzeDocumentClinically } from "./integration/clinicalAnalysisAdapter.js";
import { findDuplicateImport, findExistingPatientCandidates, saveTransferredGroups } from "./patientTransferRepository.js";
import {
  closePatientTransferView,
  getPatientTransferRoot,
  openPatientTransferView,
  readTransferReview,
  renderDetectedGroups,
  renderTransferFiles,
  renderTransferFailure,
  renderTransferResults,
  setPatientTransferMessage,
  setPatientTransferVisualStatus,
  setTransferSavingState,
  showPatientTransferError,
  isTransferSaving,
  syncPatientNameInputs
} from "./ui/patientTransferView.js";

let initialized = false;
let selectedFiles = [];
let analyzedGroups = [];

function fileId(file, index) {
  return `file-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(resolve, { timeout: 80 });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function normalizeGroupAfterMove(group) {
  const fields = {};
  const conflicts = [];
  group.documents.forEach((document) => {
    Object.entries(document.fields || {}).forEach(([key, field]) => {
      if (!fields[key]) {
        fields[key] = field;
        return;
      }
      if (String(fields[key].value || "").trim().toLowerCase() !== String(field.value || "").trim().toLowerCase()) {
        conflicts.push({ key, current: fields[key], incoming: field });
      }
    });
    conflicts.push(...(document.conflicts || []));
  });
  return {
    ...group,
    fields,
    conflicts,
    ambiguous: conflicts.length > 0 || !fields.nombre?.value
  };
}

function moveDocumentToGroup(documentId = "", targetGroupId = "") {
  if (!documentId || !targetGroupId) return;
  let movingDocument = null;
  analyzedGroups = analyzedGroups.map((group) => {
    const remaining = group.documents.filter((document) => {
      if (document.id !== documentId) return true;
      movingDocument = document;
      return false;
    });
    return { ...group, documents: remaining };
  }).filter((group) => group.documents.length);

  if (!movingDocument) return;
  if (targetGroupId === "__new__") {
    analyzedGroups.push(normalizeGroupAfterMove({
      id: `group-${Date.now()}`,
      groupingKey: `manual:${movingDocument.id}`,
      fields: {},
      documents: [movingDocument],
      conflicts: [],
      candidates: [],
      action: "create",
      selectedPatientId: "",
      omitted: false
    }));
  } else {
    analyzedGroups = analyzedGroups.map((group) => group.id === targetGroupId
      ? normalizeGroupAfterMove({ ...group, documents: [...group.documents, movingDocument] })
      : group);
  }
  analyzedGroups = analyzedGroups.map(normalizeGroupAfterMove);
  setPatientTransferGroups(analyzedGroups);
  renderDetectedGroups(analyzedGroups);
}

function addFiles(files = []) {
  const existingNames = new Set(selectedFiles.map((item) => `${item.file.name}:${item.file.size}`));
  const next = [...selectedFiles];
  [...files].forEach((file, index) => {
    const key = `${file.name}:${file.size}`;
    if (existingNames.has(key)) return;
    existingNames.add(key);
    next.push({ id: fileId(file, index), file, status: "pending", statusLabel: "Pendiente" });
  });
  selectedFiles = next;
  setPatientTransferFiles(selectedFiles);
  renderTransferFiles(selectedFiles);
  showPatientTransferError("");
}

async function analyzeOneFile(item, user) {
  item.status = "validating";
  item.statusLabel = "Validando";
  renderTransferFiles(selectedFiles);

  const validation = await validateTransferDocxFile(item.file);
  if (!validation.valid) {
    item.status = "error";
    item.statusLabel = "Error";
    item.error = validation.errors.join(" ");
    return null;
  }

  const hash = await calculateDocxHash(item.file);
  item.hash = hash;
  const sameBatch = selectedFiles.filter((candidate) => candidate.hash === hash).length > 1;

  item.status = "extracting";
  item.statusLabel = "Extrayendo";
  renderTransferFiles(selectedFiles);

  const extracted = await extractDocx(item.file);
  const blocks = normalizeDocxBlocks(extracted.bloques);
  const fullText = normalizedBlocksToText(blocks);
  const textHash = await calculateNormalizedTextHash(fullText);
  const duplicate = await findDuplicateImport({ hash, textHash, userUid: user.uid });

  item.status = "analyzing";
  item.statusLabel = "Analizando";
  renderTransferFiles(selectedFiles);

  const { fields, conflicts } = parsePatientFields(blocks, item.id);
  console.info("[docx-import] patient-fields:parsed", {
    fileId: item.id,
    detectedFieldCount: Object.values(fields).filter((field) => String(field?.value || "").trim()).length,
    conflictCount: conflicts.length
  });
  console.info("[patient-transfer] clinical-sections:start", { fileId: item.id, blockCount: blocks.length });
  const sectionsResult = parseClinicalSections(blocks);
  console.info("[patient-transfer] clinical-sections:headings-found", {
    fileId: item.id,
    headings: sectionsResult.encabezados.map(({ key, position }) => ({ key, position }))
  });
  console.info("[patient-transfer] clinical-sections:result", {
    fileId: item.id,
    sections: Object.fromEntries(Object.entries(sectionsResult.secciones).map(([key, value]) => [key, Boolean(value)]))
  });
  const metadata = parseNoteMetadata({ text: fullText, sections: sectionsResult.secciones, fields });
  const clinicalAnalysis = analyzeDocumentClinically({ fullText, blocks });
  console.info("[patient-transfer] clinical-text:available", {
    fileId: item.id,
    hasText: Boolean(fullText.trim()),
    sectionKeys: Object.keys(sectionsResult.secciones).filter((key) => sectionsResult.secciones[key])
  });
  console.info("[patient-transfer] diagnosis-parser:start", { fileId: item.id });
  console.info("[patient-transfer] diagnosis-parser:sections", { fileId: item.id, sections: ["diagnosticos", "analisis", "subjetivo"].filter((key) => sectionsResult.secciones[key]) });
  console.info("[patient-transfer] treatment-parser:start", { fileId: item.id });
  console.info("[patient-transfer] treatment-parser:sections", { fileId: item.id, sections: ["tratamiento", "plan", "subjetivo"].filter((key) => sectionsResult.secciones[key]) });
  const clinicalCandidates = extractClinicalCandidates({
    id: item.id,
    sections: sectionsResult.secciones,
    blocks,
    fullText
  });
  console.info("[patient-transfer] diagnoses:detected", { fileId: item.id, count: clinicalCandidates.diagnoses.length });
  console.info("[patient-transfer] treatments:detected", { fileId: item.id, count: clinicalCandidates.treatments.length });
  console.info("[patient-transfer] diagnosis-parser:candidates", { fileId: item.id, count: clinicalCandidates.diagnoses.length, rules: [...new Set(clinicalCandidates.diagnoses.map((item) => item.detectionRule))] });
  console.info("[patient-transfer] treatment-parser:candidates", { fileId: item.id, count: clinicalCandidates.treatments.length, sections: [...new Set(clinicalCandidates.treatments.map((item) => item.sourceSection))] });
  const vitalSignsCandidates = extractVitalSignsCandidates(blocks);
  const duplicateStatus = duplicate ? "exact_duplicate" : sameBatch ? "duplicate_in_batch" : "nuevo";

  item.status = duplicate ? "warning" : "ok";
  item.statusLabel = duplicate ? "Ya importado" : "Procesado correctamente";
  item.error = "";

  const documentCandidate = {
    id: item.id,
    file: item.file,
    hash,
    transferOperationId: `docx_${hash}`,
    textHash,
    fields,
    fieldValues: fieldValues(fields),
    conflicts,
    blocks,
    fullText,
    sections: sectionsResult.secciones,
    sectionsFound: sectionsResult.encontradas,
    sectionHeadings: sectionsResult.encabezados,
    metadata,
    clinicalAnalysis,
    vitalSignsCandidates,
    diagnosisCandidates: clinicalCandidates.diagnoses,
    treatmentCandidates: clinicalCandidates.treatments,
    duplicate,
    duplicateStatus,
    duplicateStatusLabel: duplicate ? "Ya importado" : sameBatch ? "Duplicado en esta carga" : "Nuevo"
  };
  console.assert(Array.isArray(documentCandidate.diagnosisCandidates), "diagnosisCandidates must be an array");
  console.assert(Array.isArray(documentCandidate.treatmentCandidates), "treatmentCandidates must be an array");
  return documentCandidate;
}

async function analyzeSelectedFiles() {
  if (!selectedFiles.length) {
    showPatientTransferError("Agrega al menos un archivo DOCX.");
    return;
  }
  const user = await getAuthenticatedUserOnce();
  if (!user) throw new Error("No se pudo identificar al usuario.");

  setPatientTransferStatus(TRANSFER_STATUS.VALIDATING);
  showPatientTransferError("");
  const documents = [];
  for (let index = 0; index < selectedFiles.length; index += 1) {
    setPatientTransferMessage(`Procesando ${index + 1} de ${selectedFiles.length}`, Math.round((index / selectedFiles.length) * 90));
    const document = await analyzeOneFile(selectedFiles[index], user);
    if (document) documents.push(document);
    await yieldToBrowser();
  }

  setPatientTransferStatus(TRANSFER_STATUS.ANALYZING);
  let groups = groupDocumentsByPatient(documents);
  groups = await Promise.all(groups.map(async (group) => {
    const candidates = await findExistingPatientCandidates(fieldValues(group.fields), user.uid);
    const strongCandidate = candidates.find((candidate) => candidate.score >= 2);
    return strongCandidate
      ? { ...group, candidates, action: "associate", selectedPatientId: strongCandidate.id }
      : { ...group, candidates };
  }));
  analyzedGroups = setPatientTransferGroups(groups);
  console.info("[docx-import] patient-fields:state-updated", {
    groupCount: groups.length,
    documentCount: documents.length
  });
  console.info("[patient-transfer] review-state:updated", { groupCount: groups.length, documentCount: documents.length });
  setPatientTransferExecutionState({
    transferOperationId: groups[0]?.documents?.[0]?.transferOperationId || "",
    lastCompletedStage: "awaiting_review"
  });
  setPatientTransferStatus(TRANSFER_STATUS.AWAITING_REVIEW);
  setPatientTransferVisualStatus(TRANSFER_STATUS.AWAITING_REVIEW);
  renderTransferFiles(selectedFiles);
  renderDetectedGroups(analyzedGroups);
  console.info("[docx-import] patient-fields:rendered", { groupCount: analyzedGroups.length });
  console.info("[patient-transfer] review-ui:rendered", { groupCount: analyzedGroups.length });
  console.info("[patient-transfer] clinical-candidates:rendered", {
    diagnoses: analyzedGroups.reduce((total, group) => total + group.documents.reduce((count, doc) => count + doc.diagnosisCandidates.length, 0), 0),
    treatments: analyzedGroups.reduce((total, group) => total + group.documents.reduce((count, doc) => count + doc.treatmentCandidates.length, 0), 0)
  });
  setPatientTransferMessage("Revision lista. Confirme antes de guardar.", 100);
}

async function saveReviewedTransfer({ reuseReviewedGroups = false } = {}) {
  if (isTransferSaving()) return;
  if (!analyzedGroups.length) {
    showPatientTransferError("Analiza los documentos antes de confirmar.");
    return;
  }
  const user = await getAuthenticatedUserOnce();
  const profile = user ? await getUserProfileOnce(user.uid) : null;
  if (!user) throw new Error("No se pudo identificar al usuario.");

  const reviewedGroups = reuseReviewedGroups ? analyzedGroups : readTransferReview(analyzedGroups);
  const blocking = reviewedGroups.find((group) =>
    !group.omitted && group.action === "associate" && !group.selectedPatientId
  );
  if (blocking) {
    showPatientTransferError("Selecciona el paciente existente antes de asociar notas.");
    return;
  }

  const summary = {
    newPatients: reviewedGroups.filter((group) => !group.omitted && group.action === "create").length,
    existingPatients: reviewedGroups.filter((group) => !group.omitted && group.action === "associate").length,
    notes: reviewedGroups.reduce((total, group) => total + (group.omitted ? 0 : group.documents.filter((doc) => !doc.omitted && doc.duplicateStatus === "nuevo").length), 0),
    omittedFiles: reviewedGroups.reduce((total, group) => total + group.documents.filter((doc) => doc.omitted || doc.duplicateStatus !== "nuevo").length, 0),
    possibleDuplicates: reviewedGroups.reduce((total, group) => total + group.documents.filter((doc) => doc.duplicateStatus !== "nuevo").length, 0),
    pendingFields: reviewedGroups.reduce((total, group) => total + Object.values(group.confirmedFields || {}).filter((value) => !value).length, 0)
  };
  const confirmed = window.confirm(`Resumen del traspaso\n\nPacientes nuevos: ${summary.newPatients}\nPacientes existentes: ${summary.existingPatients}\nNotas que se crearan: ${summary.notes}\nArchivos omitidos: ${summary.omittedFiles}\nPosibles duplicados: ${summary.possibleDuplicates}\nCampos pendientes: ${summary.pendingFields}\n\n¿Confirmar traspaso?`);
  if (!confirmed) return;

  analyzedGroups = reviewedGroups;
  setPatientTransferGroups(analyzedGroups);
  setTransferSavingState(true);
  setPatientTransferStatus(TRANSFER_STATUS.SAVING);
  setPatientTransferVisualStatus(TRANSFER_STATUS.SAVING);
  setPatientTransferExecutionState({
    transferOperationId: reviewedGroups[0]?.documents?.[0]?.transferOperationId || "",
    isSaving: true,
    lastCompletedStage: "reviewed"
  });
  setPatientTransferMessage("Guardando traspaso...", 5);
  try {
    setPatientTransferMessage("Validacion completada. Creando paciente...", 15);
    const results = await saveTransferredGroups({
      groups: reviewedGroups,
      user: { ...profile, uid: user.uid, email: user.email },
      onProgress: ({ stage, message, progress }) => {
        setPatientTransferExecutionState({ lastCompletedStage: stage || "saving" });
        setPatientTransferMessage(message, progress);
      }
    });
    setPatientTransferResults(results);
    const hasFailures = results.some((item) => item.status === "failed" || item.status === "partially_completed");
    const finalStatus = hasFailures ? TRANSFER_STATUS.PARTIALLY_COMPLETED : TRANSFER_STATUS.COMPLETED;
    const firstResult = results[0] || {};
    setPatientTransferStatus(finalStatus);
    setPatientTransferVisualStatus(finalStatus);
    setPatientTransferExecutionState({
      transferOperationId: firstResult.transferOperationId || reviewedGroups[0]?.documents?.[0]?.transferOperationId || "",
      patientId: firstResult.patientId || "",
      noteIds: (firstResult.documents || []).map((item) => item.noteId).filter(Boolean),
      diagnosisIds: firstResult.diagnosisIds || [],
      treatmentIds: firstResult.treatmentIds || [],
      vitalSignIds: firstResult.vitalSignRecordIds || [],
      sourceDocumentPath: firstResult.documents?.find((item) => item.storagePath)?.storagePath || "",
      lastCompletedStage: finalStatus
    });
    setPatientTransferMessage(hasFailures ? "Traspaso no completado." : "Traspaso completado.", hasFailures ? 85 : 100);
    console.info("[patient-transfer] render-result:start", { results: results.length });
    renderTransferResults(results);
    console.info("[patient-transfer] render-result:success", { results: results.length });
    window.dispatchEvent(new CustomEvent("cognicion:patient-transfer-completed", { detail: { results } }));
  } catch (error) {
    console.error("[patient-transfer] save:failed", {
      stage: error?.stage || "save",
      code: error?.code || error?.name || "unknown",
      message: error?.message || String(error)
    });
    setPatientTransferStatus(TRANSFER_STATUS.FAILED);
    setPatientTransferVisualStatus(TRANSFER_STATUS.FAILED);
    setPatientTransferExecutionState({ isSaving: false, lastCompletedStage: error?.stage || "failed" });
    setPatientTransferMessage("Traspaso no completado.", 85);
    showPatientTransferError(error?.message || String(error));
    renderTransferFailure(error);
  } finally {
    setTransferSavingState(false);
    setPatientTransferExecutionState({ isSaving: false });
  }
}

function resetAndOpen() {
  resetPatientTransferState();
  selectedFiles = [];
  analyzedGroups = [];
  openPatientTransferView();
  renderTransferFiles(selectedFiles);
  renderDetectedGroups([]);
  setPatientTransferMessage("Esperando documentos...", 0);
  setPatientTransferVisualStatus(TRANSFER_STATUS.CREATED);
  showPatientTransferError("");
}

export function initializePatientTransfer() {
  if (initialized) return { openPatientTransfer: resetAndOpen };
  initialized = true;
  const root = getPatientTransferRoot();
  const input = root.querySelector("#patientTransferInput");
  const dropzone = root.querySelector("[data-transfer-dropzone]");

  root.querySelector("[data-transfer-close]")?.addEventListener("click", () => {
    if (isTransferSaving()) {
      showPatientTransferError("El traspaso se esta guardando. Espere a que termine.");
      return;
    }
    closePatientTransferView();
  });
  root.querySelector("[data-transfer-cancel]")?.addEventListener("click", () => {
    if (isTransferSaving()) {
      showPatientTransferError("El traspaso se esta guardando. Espere a que termine.");
      return;
    }
    setPatientTransferStatus(TRANSFER_STATUS.CANCELLED);
    closePatientTransferView();
  });
  root.querySelector("[data-transfer-select]")?.addEventListener("click", () => input?.click());
  root.querySelector("[data-transfer-analyze]")?.addEventListener("click", () => analyzeSelectedFiles().catch((error) => showPatientTransferError(error.message || String(error))));
  root.querySelector("[data-transfer-save]")?.addEventListener("click", () => saveReviewedTransfer().catch((error) => showPatientTransferError(error.message || String(error))));

  input?.addEventListener("change", (event) => addFiles(event.target.files || []));
  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("activo");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("activo"));
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("activo");
    addFiles(event.dataTransfer?.files || []);
  });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-transfer-retry]")) {
      saveReviewedTransfer({ reuseReviewedGroups: true }).catch((error) => showPatientTransferError(error.message || String(error)));
      return;
    }
    if (event.target.closest("[data-transfer-back-review]")) {
      setPatientTransferStatus(TRANSFER_STATUS.AWAITING_REVIEW);
      setPatientTransferVisualStatus(TRANSFER_STATUS.AWAITING_REVIEW);
      renderDetectedGroups(analyzedGroups);
      setPatientTransferMessage("Revisión lista. Confirme antes de guardar.", 100);
      return;
    }
    if (event.target.closest("[data-transfer-close-result]")) {
      closePatientTransferView();
      return;
    }
    if (event.target.closest("[data-transfer-import-another]")) {
      resetAndOpen();
      return;
    }
    const removeButton = event.target.closest("[data-transfer-remove-file]");
    if (!removeButton) return;
    selectedFiles = selectedFiles.filter((item) => item.id !== removeButton.dataset.transferRemoveFile);
    setPatientTransferFiles(selectedFiles);
    renderTransferFiles(selectedFiles);
  });

  root.addEventListener("change", (event) => {
    const targetSelect = event.target.closest("[data-transfer-document-target]");
    if (targetSelect) moveDocumentToGroup(targetSelect.dataset.transferDocumentTarget, targetSelect.value);
  });

  root.addEventListener("input", syncPatientNameInputs);

  return { openPatientTransfer: resetAndOpen };
}
