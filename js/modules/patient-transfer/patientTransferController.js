import { getAuthenticatedUserOnce, getUserProfileOnce } from "../../services/authContextService.js";
import { TRANSFER_STATUS, resetPatientTransferState, setPatientTransferExecutionState, setPatientTransferFiles, setPatientTransferGroups, setPatientTransferResults, setPatientTransferStatus } from "./patientTransferState.js";
import { validateTransferDocxFile } from "./docx/docxValidator.js";
import { calculateDocxHash, calculateNormalizedTextHash } from "./docx/docxHashService.js";
import { extractDocx } from "./docx/docxExtractor.js";
import { normalizeDocxBlocks, normalizedBlocksToText } from "./docx/docxBlockNormalizer.js";
import { parsePatientFields, fieldValues } from "./parsing/patientFieldParser.js";
import { parseClinicalSections } from "./parsing/clinicalSectionParser.js";
import { extractClinicalCandidates } from "./parsing/clinicalCandidateParser.js";
import { detectMultipleClinicalNotes, expandSegmentedDocumentsForPersistence, mergeClinicalSegments, segmentClinicalNotes, splitClinicalSegment } from "./parsing/clinicalNoteSegmenter.js?v=20260804-segmentation-debug-v1";
import { extractVitalSignsCandidates } from "./parsing/vitalSignsParser.js";
import { parseNoteMetadata } from "./parsing/noteMetadataParser.js";
import { preserveManualSubjectiveEdits, updateSubjectiveSegmentValue } from "./state/subjectiveSegmentState.js";
import { initializeFileMultipleNotesMode, MULTIPLE_NOTES_MODES, normalizeMultipleNotesMode, updateFileMultipleNotesMode } from "./state/multipleNotesModeState.js";
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

function enrichNoteSegments(document, segments = []) {
  const enriched = segments.map((segment) => {
    const metadata = parseNoteMetadata({ text: segment.rawText, sections: segment.sections, fields: document.fields || {} });
    const candidates = extractClinicalCandidates({
      id: document.id,
      sourceNoteId: segment.id,
      sections: segment.sections,
      blocks: segment.blocks,
      fullText: segment.rawText
    });
    const sections = { ...(segment.sections || {}) };
    if (!sections.diagnosticos && candidates.diagnoses.length) {
      sections.diagnosticos = [...new Set(candidates.diagnoses.map((candidate) => candidate.rawText).filter(Boolean))].join("\n");
    }
    if (!sections.tratamiento && !sections.medicamentos && candidates.treatments.length) {
      sections.medicamentos = [...new Set(candidates.treatments.map((candidate) => candidate.sourceText).filter(Boolean))].join("\n");
    }
    const vitalSignsCandidates = (document.vitalSignsCandidates || []).filter((candidate) => {
      const sourceIndex = candidate.sourceLocation?.blockIndex;
      return Number.isInteger(sourceIndex) && sourceIndex >= segment.startBlockIndex && sourceIndex < segment.endBlockIndex;
    });
    const enrichedSegment = {
      ...segment,
      sections,
      metadata: {
        ...metadata,
        documentDate: segment.date || metadata.documentDate,
        documentHour: segment.time || metadata.documentHour
      },
      confirmedType: segment.confirmedType || metadata.suggestedType,
      diagnosisCandidates: candidates.diagnoses,
      treatmentCandidates: candidates.treatments,
      vitalSignsCandidates
    };
    console.info("[patient-transfer] note-segment:enriched", {
      noteId: enrichedSegment.id,
      date: enrichedSegment.metadata.documentDate,
      time: enrichedSegment.metadata.documentHour,
      vitalSigns: vitalSignsCandidates.length,
      diagnoses: candidates.diagnoses.length,
      treatments: candidates.treatments.length,
      sections: Object.keys(sections).filter((key) => Boolean(sections[key]))
    });
    return enrichedSegment;
  });

  if (enriched.length && !enriched.some((segment) => segment.vitalSignsCandidates.length)) {
    enriched[0] = { ...enriched[0], vitalSignsCandidates: document.vitalSignsCandidates || [] };
  }
  return enriched;
}

function applySegmentsToDocument(document, rawSegments = []) {
  const noteSegments = preserveManualSubjectiveEdits(
    enrichNoteSegments(document, rawSegments),
    document.noteSegments || []
  );
  const primary = noteSegments[0] || {};
  return {
    ...document,
    noteSegments,
    sections: primary.sections || document.sections || {},
    diagnosisCandidates: primary.diagnosisCandidates || [],
    treatmentCandidates: primary.treatmentCandidates || []
  };
}

function previousDocumentsByHash() {
  return new Map(analyzedGroups.flatMap((group) => group.documents || [])
    .filter((document) => document.hash)
    .map((document) => [document.hash, document]));
}

function preserveReviewedSubjectives(nextDocument, previousDocument) {
  if (!previousDocument) return nextDocument;
  const noteSegments = preserveManualSubjectiveEdits(nextDocument.noteSegments || [], previousDocument.noteSegments || []);
  const primary = noteSegments[0];
  return {
    ...nextDocument,
    noteSegments,
    sections: primary?.sections || nextDocument.sections
  };
}

function updateSubjectiveFromInput(event) {
  const input = event.target.closest?.('[data-section-key="subjetivo"][data-note-id][data-transfer-document-id]');
  if (!input) return false;
  const noteId = input.dataset.noteId;
  const documentId = input.dataset.transferDocumentId;
  analyzedGroups = analyzedGroups.map((group) => ({
    ...group,
    documents: group.documents.map((document) => {
      if (document.id !== documentId) return document;
      const noteSegments = updateSubjectiveSegmentValue(document.noteSegments || [], noteId, input.value);
      const updatedSegment = noteSegments.find((segment) => segment.id === noteId);
      if (updatedSegment) {
        console.info("[patient-transfer] subjective:state-assigned", {
          noteId,
          date: updatedSegment.metadata?.documentDate || updatedSegment.date || "",
          time: updatedSegment.metadata?.documentHour || updatedSegment.time || "",
          segmentStartBlock: updatedSegment.startBlockIndex ?? null,
          segmentEndBlock: updatedSegment.endBlockIndex ?? null,
          segmentBlockCount: (updatedSegment.blocks || []).length,
          segmentRawTextLength: String(updatedSegment.rawText || "").length,
          subjectiveStartBlock: updatedSegment.subjectiveExtraction?.startBlockIndex ?? null,
          subjectiveEndBlock: updatedSegment.subjectiveExtraction?.endBlockIndex ?? null,
          subjectiveLength: updatedSegment.sections?.subjetivo?.length || 0,
          manuallyEdited: updatedSegment.subjectiveManuallyEdited
        });
      }
      return { ...document, noteSegments };
    })
  }));
  setPatientTransferGroups(analyzedGroups);
  return true;
}

function updateDocumentById(documentId, updater) {
  analyzedGroups = analyzedGroups.map((group) => ({
    ...group,
    documents: group.documents.map((document) => document.id === documentId ? updater(document) : document)
  }));
  setPatientTransferGroups(analyzedGroups);
  renderDetectedGroups(analyzedGroups);
}

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

function expandSegmentedGroupsForSave(groups = []) {
  return groups.map((group) => ({
    ...group,
    documents: expandSegmentedDocumentsForPersistence(group.documents)
  }));
}

function addFiles(files = []) {
  const existingNames = new Set(selectedFiles.map((item) => `${item.file.name}:${item.file.size}`));
  const next = [...selectedFiles];
  [...files].forEach((file, index) => {
    const key = `${file.name}:${file.size}`;
    if (existingNames.has(key)) return;
    existingNames.add(key);
    next.push(initializeFileMultipleNotesMode({
      id: fileId(file, index),
      file,
      status: "pending",
      statusLabel: "Pendiente"
    }));
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
  const multipleNotesDetection = detectMultipleClinicalNotes({
    blocks,
    fullText,
    headings: sectionsResult.encabezados
  });
  const multipleNotesMode = normalizeMultipleNotesMode(item.multipleNotesMode);
  const duplicateStatus = duplicate ? "exact_duplicate" : sameBatch ? "duplicate_in_batch" : "nuevo";

  item.status = duplicate ? "warning" : "ok";
  item.statusLabel = duplicate ? "Ya importado" : "Procesado correctamente";
  item.error = "";
  item.needsReanalysis = false;

  let documentCandidate = {
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
    multipleNotesMode,
    containsMultipleNotes: multipleNotesMode === MULTIPLE_NOTES_MODES.MULTIPLE,
    segmentationNeedsReanalysis: false,
    probableMultipleNotes: multipleNotesDetection.probableMultipleNotes,
    multipleNotesReasons: multipleNotesDetection.reasons,
    proposedNoteBoundaries: multipleNotesDetection.proposedNoteBoundaries,
    noteSegments: [],
    duplicate,
    duplicateStatus,
    duplicateStatusLabel: duplicate ? "Ya importado" : sameBatch ? "Duplicado en esta carga" : "Nuevo"
  };
  const selectedSegments = segmentClinicalNotes({
    blocks,
    fullText,
    multipleNotesMode,
    proposedBoundaries: multipleNotesDetection.proposedNoteBoundaries,
    documentId: item.id
  });
  const automaticallyDetectedSegments = multipleNotesMode === MULTIPLE_NOTES_MODES.SINGLE
    ? segmentClinicalNotes({
        blocks,
        fullText,
        multipleNotesMode: MULTIPLE_NOTES_MODES.AUTO,
        proposedBoundaries: multipleNotesDetection.proposedNoteBoundaries,
        documentId: item.id
      })
    : selectedSegments;
  documentCandidate = applySegmentsToDocument({
    ...documentCandidate,
    detectedNoteSummaries: automaticallyDetectedSegments.map((segment) => ({
      id: segment.id,
      date: segment.date || "",
      time: segment.time || "",
      noteType: segment.noteType || "Nota clínica"
    }))
  }, selectedSegments);
  documentCandidate.containsMultipleNotes = documentCandidate.noteSegments.length > 1;
  console.info(
    "[patient-transfer] note-segments:stored",
    JSON.stringify({
      documentId: documentCandidate.id,
      count: documentCandidate.noteSegments.length,
      ids: documentCandidate.noteSegments.map((segment) => segment.id),
      dates: documentCandidate.noteSegments.map((segment) => segment.date),
      times: documentCandidate.noteSegments.map((segment) => segment.time)
    }, null, 2)
  );
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
  const previousDocuments = previousDocumentsByHash();
  const documents = [];
  for (let index = 0; index < selectedFiles.length; index += 1) {
    setPatientTransferMessage(`Procesando ${index + 1} de ${selectedFiles.length}`, Math.round((index / selectedFiles.length) * 90));
    const document = await analyzeOneFile(selectedFiles[index], user);
    if (document) documents.push(preserveReviewedSubjectives(document, previousDocuments.get(document.hash)));
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
    diagnoses: analyzedGroups.reduce((total, group) => total + group.documents.reduce((count, doc) => count + (doc.noteSegments || [doc]).reduce((segmentCount, segment) => segmentCount + (segment.diagnosisCandidates || []).length, 0), 0), 0),
    treatments: analyzedGroups.reduce((total, group) => total + group.documents.reduce((count, doc) => count + (doc.noteSegments || [doc]).reduce((segmentCount, segment) => segmentCount + (segment.treatmentCandidates || []).length, 0), 0), 0)
  });
  setPatientTransferMessage("Revision lista. Confirme antes de guardar.", 100);
}

async function saveReviewedTransfer({ reuseReviewedGroups = false } = {}) {
  if (isTransferSaving()) return;
  if (!analyzedGroups.length) {
    showPatientTransferError("Analiza los documentos antes de confirmar.");
    return;
  }
  const pendingSegmentation = analyzedGroups.some((group) => (group.documents || [])
    .some((document) => document.segmentationNeedsReanalysis));
  if (pendingSegmentation) {
    showPatientTransferError("La forma de segmentación cambió. Vuelva a analizar el documento antes de confirmar.");
    return;
  }
  const user = await getAuthenticatedUserOnce();
  const profile = user ? await getUserProfileOnce(user.uid) : null;
  if (!user) throw new Error("No se pudo identificar al usuario.");

  // La revisión se sincroniza en cada interacción; al confirmar no se vuelve a
  // reconstruir desde el DOM para evitar perder selecciones durante un render.
  const reviewedGroups = analyzedGroups;
  const persistenceGroups = expandSegmentedGroupsForSave(reviewedGroups);
  const blocking = reviewedGroups.find((group) =>
    !group.omitted && group.action === "associate" && !group.selectedPatientId
  );
  if (blocking) {
    showPatientTransferError("Selecciona el paciente existente antes de asociar notas.");
    return;
  }

  const summary = {
    newPatients: persistenceGroups.filter((group) => !group.omitted && group.action === "create").length,
    existingPatients: persistenceGroups.filter((group) => !group.omitted && group.action === "associate").length,
    notes: persistenceGroups.reduce((total, group) => total + (group.omitted ? 0 : group.documents.filter((doc) => !doc.omitted && doc.duplicateStatus === "nuevo").length), 0),
    omittedFiles: persistenceGroups.reduce((total, group) => total + group.documents.filter((doc) => doc.omitted || doc.duplicateStatus !== "nuevo").length, 0),
    possibleDuplicates: persistenceGroups.reduce((total, group) => total + group.documents.filter((doc) => doc.duplicateStatus !== "nuevo").length, 0),
    pendingFields: reviewedGroups.reduce((total, group) => total + Object.values(group.confirmedFields || {}).filter((value) => !value).length, 0)
  };
  const confirmed = window.confirm(`Resumen del traspaso\n\nPacientes nuevos: ${summary.newPatients}\nPacientes existentes: ${summary.existingPatients}\nNotas que se crearan: ${summary.notes}\nArchivos omitidos: ${summary.omittedFiles}\nPosibles duplicados: ${summary.possibleDuplicates}\nCampos pendientes: ${summary.pendingFields}\n\n¿Confirmar traspaso?`);
  if (!confirmed) return;

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
      groups: persistenceGroups,
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

function syncReviewedGroupsFromView() {
  if (!analyzedGroups.length) return;
  analyzedGroups = readTransferReview(analyzedGroups);
  setPatientTransferGroups(analyzedGroups);

  const counts = analyzedGroups.reduce((total, group) => group.documents.reduce((documentTotal, doc) => {
    const owners = doc.noteSegments?.length ? doc.noteSegments : [doc];
    const diagnoses = owners.reduce((count, owner) => count + (owner.diagnosisCandidates || []).length, 0);
    const treatments = owners.reduce((count, owner) => count + (owner.treatmentCandidates || []).length, 0);
    return {
      diagnosisCandidatesDetected: documentTotal.diagnosisCandidatesDetected + diagnoses,
      diagnosisCandidatesRendered: documentTotal.diagnosisCandidatesRendered + diagnoses,
      treatmentCandidatesDetected: documentTotal.treatmentCandidatesDetected + treatments,
      treatmentCandidatesRendered: documentTotal.treatmentCandidatesRendered + treatments
    };
  }, total), {
    diagnosisCandidatesDetected: 0,
    diagnosisCandidatesRendered: 0,
    treatmentCandidatesDetected: 0,
    treatmentCandidatesRendered: 0
  });

  console.info("[patient-transfer] review-state:updated", counts);
}

function setFileMultipleNotesMode(documentId, value, { afterAnalysis = false } = {}) {
  const multipleNotesMode = normalizeMultipleNotesMode(value);
  selectedFiles = updateFileMultipleNotesMode(selectedFiles, documentId, multipleNotesMode)
    .map((item) => item.id === documentId && afterAnalysis
      ? { ...item, needsReanalysis: true, status: "pending", statusLabel: "Pendiente de reanálisis" }
      : item);
  setPatientTransferFiles(selectedFiles);
  renderTransferFiles(selectedFiles);

  if (!afterAnalysis) return;
  updateDocumentById(documentId, (document) => ({
    ...document,
    multipleNotesMode,
    segmentationNeedsReanalysis: true
  }));
  setPatientTransferMessage("La forma de segmentación cambió. Vuelva a analizar el documento.", 100);
  showPatientTransferError("La forma de segmentación cambió. Vuelva a analizar el documento.");
}

function splitDocumentSegment(documentId, segmentId) {
  updateDocumentById(documentId, (document) => applySegmentsToDocument(
    { ...document, containsMultipleNotes: true },
    splitClinicalSegment(document.noteSegments || [], segmentId)
  ));
}

function mergeDocumentSegment(documentId, segmentId) {
  updateDocumentById(documentId, (document) => {
    const segments = mergeClinicalSegments(document.noteSegments || [], segmentId);
    return applySegmentsToDocument({ ...document, containsMultipleNotes: segments.length > 1 }, segments);
  });
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
    const keepSingleButton = event.target.closest("[data-transfer-keep-single]");
    if (keepSingleButton) {
      syncReviewedGroupsFromView();
      setFileMultipleNotesMode(keepSingleButton.dataset.transferKeepSingle, MULTIPLE_NOTES_MODES.SINGLE, { afterAnalysis: true });
      return;
    }
    const reviewDivisionsButton = event.target.closest("[data-transfer-review-divisions]");
    if (reviewDivisionsButton) {
      document.getElementById(`transfer-note-segments-${reviewDivisionsButton.dataset.transferReviewDivisions}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const splitButton = event.target.closest("[data-transfer-split-segment]");
    if (splitButton) {
      syncReviewedGroupsFromView();
      splitDocumentSegment(splitButton.dataset.transferDocumentId, splitButton.dataset.transferSplitSegment);
      return;
    }
    const mergeButton = event.target.closest("[data-transfer-merge-segment]");
    if (mergeButton) {
      syncReviewedGroupsFromView();
      mergeDocumentSegment(mergeButton.dataset.transferDocumentId, mergeButton.dataset.transferMergeSegment);
      return;
    }
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
    const fileMode = event.target.closest("[data-transfer-file-multiple-mode]");
    if (fileMode) {
      const documentId = fileMode.dataset.transferFileMultipleMode;
      const alreadyAnalyzed = analyzedGroups.some((group) => (group.documents || [])
        .some((document) => document.id === documentId));
      if (alreadyAnalyzed) syncReviewedGroupsFromView();
      setFileMultipleNotesMode(documentId, fileMode.value, { afterAnalysis: alreadyAnalyzed });
      return;
    }
    const reviewMode = event.target.closest("[data-transfer-review-multiple-mode]");
    if (reviewMode) {
      syncReviewedGroupsFromView();
      setFileMultipleNotesMode(reviewMode.dataset.transferReviewMultipleMode, reviewMode.value, { afterAnalysis: true });
      return;
    }
    const targetSelect = event.target.closest("[data-transfer-document-target]");
    if (targetSelect) {
      moveDocumentToGroup(targetSelect.dataset.transferDocumentTarget, targetSelect.value);
      return;
    }
    syncReviewedGroupsFromView();
  });

  root.addEventListener("input", (event) => {
    syncPatientNameInputs(event);
    if (updateSubjectiveFromInput(event)) return;
    syncReviewedGroupsFromView();
  });

  return { openPatientTransfer: resetAndOpen };
}
