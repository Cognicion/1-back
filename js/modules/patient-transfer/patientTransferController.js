import { getAuthenticatedUserOnce, getUserProfileOnce } from "../../services/authContextService.js";
import { TRANSFER_STATUS, resetPatientTransferState, setPatientTransferExecutionState, setPatientTransferFiles, setPatientTransferGroups, setPatientTransferResults, setPatientTransferStatus } from "./patientTransferState.js";
import { validateTransferDocxFile } from "./docx/docxValidator.js";
import { calculateDocxHash, calculateNormalizedTextHash } from "./docx/docxHashService.js";
import { extractDocx } from "./docx/docxExtractor.js";
import { normalizeDocxBlocks, normalizedBlocksToText } from "./docx/docxBlockNormalizer.js";
import { parsePatientFields, fieldValues } from "./parsing/patientFieldParser.js?v=v168-institution-hpfba-v1";
import { resolvePatientIdentity } from "./parsing/patientIdentityResolver.js";
import { parseClinicalSections } from "./parsing/clinicalSectionParser.js?v=v172-diagnostic-entity-boundaries-v1";
import { extractClinicalCandidates } from "./parsing/clinicalCandidateParser.js?v=v167-enedina-name-diagnosis-boundaries-v1";
import { detectMultipleClinicalNotes, expandSegmentedDocumentsForPersistence, mergeClinicalSegments, segmentClinicalNotes, splitClinicalSegment } from "./parsing/clinicalNoteSegmenter.js?v=20260810-imported-notes-v1";
import { extractVitalSignsCandidates } from "./parsing/vitalSignsParser.js";
import { parseNoteMetadata } from "./parsing/noteMetadataParser.js";
import { preserveManualSubjectiveEdits, updateSubjectiveSegmentValue } from "./state/subjectiveSegmentState.js";
import { initializeFileMultipleNotesMode, MULTIPLE_NOTES_MODES, normalizeMultipleNotesMode, updateFileMultipleNotesMode } from "./state/multipleNotesModeState.js";
import { groupDocumentsByPatient } from "./parsing/documentGroupingService.js";
import { analyzeDocumentClinically } from "./integration/clinicalAnalysisAdapter.js";
import { adaptTreatmentPlan } from "../clinical-document-engine/adapters/treatmentPlanAdapter.js";
import { resolveMedicationCandidatesAgainstCatalog } from "../clinical-document-engine/resolvers/medicationCatalogResolver.js";
import { findDuplicateImport, findExistingPatientCandidates, saveTransferredGroups } from "./patientTransferRepository.js?v=v166-imported-notes-v1";
import {
  DUPLICATE_DETECTION_STATUS,
  DUPLICATE_RESOLUTION,
  isDocumentEligibleForPersistence,
  normalizeDuplicateDetectionStatus
} from "./persistence/documentPersistenceEligibility.js";
import {
  closePatientTransferView,
  applyBulkCandidateSelection,
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
  medicationCatalogCompactState,
  resizeTransferIndicationTextarea,
  syncBulkSelectionControls,
  syncPatientNameInputs,
  updateMedicationScheduleUnitVisibility
} from "./ui/patientTransferView.js?v=v179-medication-presentation-concentration-ui-v1";

let initialized = false;
let selectedFiles = [];
let analyzedGroups = [];

function vitalSignsPresence(candidates = []) {
  const vitalTypes = new Set(candidates.flatMap((candidate) => Object.keys(candidate?.vitalSigns || {})));
  return {
    candidateCount: candidates.length,
    hasPA: vitalTypes.has("bloodPressure"),
    hasFC: vitalTypes.has("heartRate"),
    hasFR: vitalTypes.has("respiratoryRate"),
    hasTemperature: vitalTypes.has("temperature"),
    hasSpO2: vitalTypes.has("oxygenSaturation")
  };
}

function resolveReviewedMedicationCandidates(groups = []) {
  const resolveCandidate = (candidate) => candidate.catalogMatchMethod === "manual-none" && !candidate.catalogMedicationId
    ? candidate
    : resolveMedicationCandidatesAgainstCatalog([candidate])[0];
  return groups.map((group) => ({
    ...group,
    documents: (group.documents || []).map((document) => {
      const noteSegments = (document.noteSegments || []).map((segment) => ({
        ...segment,
        treatmentCandidates: (segment.treatmentCandidates || []).map(resolveCandidate)
      }));
      const primary = noteSegments[0];
      return {
        ...document,
        noteSegments,
        treatmentCandidates: primary?.treatmentCandidates || (document.treatmentCandidates || []).map(resolveCandidate)
      };
    })
  }));
}

function enrichNoteSegments(document, segments = []) {
  const enriched = segments.map((segment) => {
    const metadata = parseNoteMetadata({ text: segment.rawText, sections: segment.sections, fields: document.fields || {} });
    const candidates = extractClinicalCandidates({
      id: document.id,
      sourceNoteId: segment.id,
      sections: segment.sections,
      blocks: segment.blocks,
      fullText: segment.rawText,
      date: segment.date || segment.metadata?.documentDate || ""
    }, { includeTreatments: false });
    const planText = [segment.sections?.plan, segment.sections?.tratamiento, segment.sections?.medicamentos]
      .filter(Boolean).join("\n");
    const treatmentPlan = adaptTreatmentPlan({
      text: planText,
      documentId: document.id,
      noteId: segment.id,
      date: segment.date || segment.metadata?.documentDate || "",
      time: segment.time || segment.metadata?.documentHour || "",
      sourceHeading: "PLAN TERAPÉUTICO"
    });
    console.info("[patient-transfer] medicationAdapter:output-count", JSON.stringify({
      noteId: segment.id,
      count: treatmentPlan.medicationCandidates.length
    }));
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
      treatmentCandidates: treatmentPlan.medicationCandidates,
      treatmentPlanCandidates: treatmentPlan.instructions,
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
    treatmentCandidates: primary.treatmentCandidates || [],
    treatmentPlanCandidates: primary.treatmentPlanCandidates || []
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

function persistenceEligibilityForDocument(group = {}, document = {}) {
  return isDocumentEligibleForPersistence(document, {
    action: group.action,
    selectedResolution: group.selectedResolution,
    matchedPatientId: group.selectedPatientId || group.selectedExistingPatientId || group.duplicateResolution?.matchedPatientId || "",
    omitted: group.omitted
  });
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
  console.info("[patient-transfer] patient-identity:start", JSON.stringify({ documentId: item.id }));
  const patientIdentity = resolvePatientIdentity(fields);
  console.info("[patient-transfer] patient-identity:field", JSON.stringify({
    documentId: item.id,
    hasName: Boolean(patientIdentity.nombreCompleto),
    hasBirthDate: Boolean(patientIdentity.fechaNacimiento),
    hasRecordNumber: Boolean(patientIdentity.expediente),
    sourceFields: patientIdentity.sourceFields
  }));
  if (patientIdentity.identifiable) {
    console.info("[patient-transfer] patient-identity:resolved", JSON.stringify({
      documentId: item.id,
      hasName: true,
      hasBirthDate: Boolean(patientIdentity.fechaNacimiento),
      hasRecordNumber: Boolean(patientIdentity.expediente),
      identityConfidence: patientIdentity.identityConfidence,
      sourceFields: patientIdentity.sourceFields
    }));
  } else {
    console.info("[patient-transfer] patient-identity:failed", JSON.stringify({
      documentId: item.id,
      hasName: Boolean(patientIdentity.nombreCompleto),
      hasBirthDate: Boolean(patientIdentity.fechaNacimiento),
      hasRecordNumber: Boolean(patientIdentity.expediente),
      identityConfidence: patientIdentity.identityConfidence,
      sourceFields: patientIdentity.sourceFields
    }));
  }
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
    fullText,
    date: metadata.documentDate || ""
  }, { includeTreatments: false });
  console.info("[patient-transfer] diagnoses:detected", { fileId: item.id, count: clinicalCandidates.diagnoses.length });
  console.info("[patient-transfer] treatments:detected", { fileId: item.id, count: 0, delegatedToTreatmentPlan: true });
  console.info("[patient-transfer] diagnosis-parser:candidates", { fileId: item.id, count: clinicalCandidates.diagnoses.length, rules: [...new Set(clinicalCandidates.diagnoses.map((item) => item.detectionRule))] });
  console.info("[patient-transfer] treatment-parser:candidates", { fileId: item.id, count: 0, delegatedToTreatmentPlan: true });
  const vitalSignsCandidates = extractVitalSignsCandidates(blocks);
  console.info("patient-transfer:vitals-parser-result", vitalSignsPresence(vitalSignsCandidates));
  const multipleNotesDetection = detectMultipleClinicalNotes({
    blocks,
    fullText,
    headings: sectionsResult.encabezados
  });
  const multipleNotesMode = normalizeMultipleNotesMode(item.multipleNotesMode);
  const duplicateDetectionStatus = normalizeDuplicateDetectionStatus(
    duplicate?.duplicateStatus || (sameBatch ? "duplicate_in_batch" : "none")
  );
  const duplicateResolution = duplicateDetectionStatus === DUPLICATE_DETECTION_STATUS.NONE
    ? DUPLICATE_RESOLUTION.CREATE_NEW
    : DUPLICATE_RESOLUTION.UNRESOLVED;
  const duplicateStatus = duplicateDetectionStatus === DUPLICATE_DETECTION_STATUS.NONE
    ? "nuevo"
    : duplicateDetectionStatus;

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
    treatmentCandidates: [],
    treatmentPlanCandidates: [],
    multipleNotesMode,
    containsMultipleNotes: multipleNotesMode === MULTIPLE_NOTES_MODES.MULTIPLE,
    segmentationNeedsReanalysis: false,
    probableMultipleNotes: multipleNotesDetection.probableMultipleNotes,
    multipleNotesReasons: multipleNotesDetection.reasons,
    proposedNoteBoundaries: multipleNotesDetection.proposedNoteBoundaries,
    noteSegments: [],
    duplicate,
    duplicateStatus,
    duplicateDetectionStatus,
    duplicateResolution,
    matchedPatientId: duplicate?.patientId || duplicate?.pacienteId || "",
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
  if (!user) throw new Error("No se pudo identificar al usuario autenticado.");

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
    const strongest = candidates.find((match) => match.showAlert) || candidates[0] || null;
    return {
      ...group,
      candidates,
      possibleMatches: candidates,
      highestMatch: strongest,
      recommendedResolution: strongest?.level === "muy_alta"
        ? DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING
        : strongest?.level === "alta" ? "review" : null,
      selectedResolution: strongest ? DUPLICATE_RESOLUTION.UNRESOLVED : DUPLICATE_RESOLUTION.CREATE_NEW,
      selectedExistingPatientId: null,
      duplicateResolution: strongest ? {
        action: null,
        matchedPatientId: strongest.patientId || strongest.id || "",
        score: strongest.score,
        level: strongest.level,
        matchedFields: strongest.matchedFields,
        conflictingFields: strongest.conflictingFields
      } : null,
      action: group.action === "omit"
        ? "omit"
        : group.documents.some((document) => document.duplicateResolution === DUPLICATE_RESOLUTION.UNRESOLVED)
          ? "unresolved"
          : "create",
      selectedPatientId: ""
    };
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
  console.info("patient-transfer:save-reviewed-enter", {
    groupsCount: analyzedGroups.length,
    reuseReviewedGroups: Boolean(reuseReviewedGroups),
    saving: isTransferSaving()
  });
  console.info("patient-transfer:confirm-start", { groupsCount: analyzedGroups.length });
  if (isTransferSaving()) {
    showPatientTransferError("El traspaso ya se está guardando. Espere a que termine.");
    console.info("patient-transfer:save-reviewed-return", { reason: "saving-already-active" });
    return;
  }
  if (!analyzedGroups.length) {
    showPatientTransferError("Analiza los documentos antes de confirmar.");
    console.info("patient-transfer:save-reviewed-return", { reason: "no-groups" });
    return;
  }
  const pendingSegmentation = analyzedGroups.some((group) => (group.documents || [])
    .some((document) => document.segmentationNeedsReanalysis));
  if (pendingSegmentation) {
    showPatientTransferError("La forma de segmentación cambió. Vuelva a analizar el documento antes de confirmar.");
    console.info("patient-transfer:save-reviewed-return", { reason: "segmentation-needs-reanalysis" });
    return;
  }
  const user = await getAuthenticatedUserOnce();
  const profile = user ? await getUserProfileOnce(user.uid) : null;
  if (!user) throw new Error("No se pudo identificar al usuario autenticado.");

  const syncSummary = syncReviewedGroupsFromView();
  console.info("patient-transfer:sync-reviewed-complete", syncSummary);
  const reviewedGroups = analyzedGroups;
  console.info("patient-transfer:decision-final", {
    createNewCount: reviewedGroups.filter((group) => group.selectedResolution === DUPLICATE_RESOLUTION.CREATE_NEW).length,
    associateExistingCount: reviewedGroups.filter((group) => group.selectedResolution === DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING).length,
    omitCount: reviewedGroups.filter((group) => group.selectedResolution === DUPLICATE_RESOLUTION.OMIT).length,
    unresolvedCount: reviewedGroups.filter((group) => group.selectedResolution === DUPLICATE_RESOLUTION.UNRESOLVED).length
  });
  const reviewedSegments = reviewedGroups.flatMap((group) => (group.documents || [])
    .flatMap((document) => document.noteSegments?.length ? document.noteSegments : [document]));
  console.info("patient-transfer:review-state", {
    demographics: reviewedGroups.some((group) => Object.values(group.confirmedFields || {}).some(Boolean)),
    vitalSigns: reviewedSegments.reduce((count, segment) => count + (segment.vitalSignsCandidates || []).filter((candidate) => candidate.include).length, 0),
    anthropometry: reviewedSegments.some((segment) => (segment.vitalSignsCandidates || []).some((candidate) => {
      const vital = candidate.vitalSigns || {};
      return [vital.weight?.value, vital.height?.value, vital.bmi?.value, vital.bmiCalculated?.value].some((value) => Number.isFinite(Number(value)));
    })),
    diagnoses: reviewedSegments.reduce((count, segment) => count + (segment.diagnosisCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    treatments: reviewedSegments.reduce((count, segment) => count + (segment.treatmentCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    indications: reviewedSegments.reduce((count, segment) => count + (segment.treatmentPlanCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    notes: reviewedSegments.filter((segment) => !segment.omitted).length
  });
  reviewedGroups.forEach((group) => (group.documents || []).forEach((document) => {
    const eligibility = persistenceEligibilityForDocument(group, document);
    console.info("[patient-transfer] duplicate-resolution:decision", {
      detectionStatus: eligibility.detectionStatus,
      resolution: eligibility.resolution,
      eligible: eligibility.eligible,
      reason: eligibility.reason
    });
  }));
  const reviewedDocuments = reviewedGroups.flatMap((group) => group.documents || []);
  console.info("[patient-transfer] persistence-audit:analyzed-groups", {
    groups: reviewedGroups.length,
    documents: reviewedDocuments.length,
    noteSegments: reviewedDocuments.reduce((total, document) => total + (document.noteSegments || []).length, 0),
    omittedDocuments: reviewedDocuments.filter((document) => document.omitted).length,
    duplicateStatuses: [...new Set(reviewedDocuments.map((document) => document.duplicateStatus ?? null))]
  });
  const persistenceGroups = expandSegmentedGroupsForSave(reviewedGroups);
  const expandedDocuments = persistenceGroups.flatMap((group) => group.documents || []);
  console.info("patient-transfer:payload-built", {
    patientFields: [...new Set(persistenceGroups.flatMap((group) => Object.keys(group.confirmedFields || {}).filter((key) => Boolean(group.confirmedFields?.[key]))))],
    vitalSignsCount: expandedDocuments.reduce((count, document) => count + (document.vitalSignsCandidates || []).filter((candidate) => candidate.include).length, 0),
    diagnosesCount: expandedDocuments.reduce((count, document) => count + (document.diagnosisCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    treatmentsCount: expandedDocuments.reduce((count, document) => count + (document.treatmentCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    indicationsCount: expandedDocuments.reduce((count, document) => count + (document.treatmentPlanCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0),
    notesCount: expandedDocuments.length
  });
  console.info("[patient-transfer] persistence-audit:expanded-documents", {
    sourceDocuments: reviewedDocuments.length,
    expandedDocuments: expandedDocuments.length,
    expandedNotes: expandedDocuments.filter((document) => document.sourceNoteSegmentId).length,
    fieldComparison: reviewedGroups.flatMap((group) => (group.documents || []).map((document, documentIndex) => ({
      documentIndex,
      original: {
        duplicateStatus: document.duplicateStatus ?? null,
        omitted: Boolean(document.omitted),
        action: document.action ?? group.action ?? null,
        include: document.include ?? null
      },
      expanded: (persistenceGroups.find((item) => item.id === group.id)?.documents || [])
        .filter((expanded) => expanded.id === document.id || expanded.id.startsWith(`${document.id}:`))
        .map((expanded) => ({
          duplicateStatus: expanded.duplicateStatus ?? null,
          omitted: Boolean(expanded.omitted),
          action: expanded.action ?? group.action ?? null,
          include: expanded.include ?? null
        }))
    })))
  });
  console.info("[patient-transfer] persistence-audit:before-save", {
    groupsReceived: persistenceGroups.length,
    documentsReceived: expandedDocuments.length,
    documentsWithNotes: expandedDocuments.filter((document) => Boolean(document.sourceNoteSegmentId)).length,
    notesReceived: expandedDocuments.length
  });
  const unresolvedPersistence = persistenceGroups.flatMap((group) => (group.documents || []).map((document) =>
    persistenceEligibilityForDocument(group, document)
  )).find((item) => ["duplicate-resolution-required", "missing-existing-patient", "invalid-resolution"].includes(item.reason));
  if (unresolvedPersistence) {
    showPatientTransferError("Resuelva el documento duplicado: crear un paciente nuevo, asociar a uno existente u omitir.");
    console.info("patient-transfer:save-reviewed-return", {
      reason: unresolvedPersistence.reason === "duplicate-resolution-required"
        ? "unresolved-duplicate"
        : unresolvedPersistence.reason === "missing-existing-patient"
          ? "missing-patient"
          : "invalid-state"
    });
    const unresolvedGroup = reviewedGroups.find((group) => (group.documents || []).some((document) =>
      persistenceEligibilityForDocument(group, document).resolution === DUPLICATE_RESOLUTION.UNRESOLVED
    ));
    const resolutionControl = unresolvedGroup
      ? getPatientTransferRoot().querySelector(`[data-transfer-duplicate-resolution="${unresolvedGroup.id}"]`)
      : null;
    resolutionControl?.scrollIntoView({ behavior: "smooth", block: "center" });
    resolutionControl?.focus({ preventScroll: true });
    return;
  }
  const treatmentCounts = persistenceGroups.reduce((total, group) => group.documents.reduce((count, document) => ({
    detected: count.detected + (document.treatmentCandidates || []).length,
    selected: count.selected + (document.treatmentCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length
  }), total), { detected: 0, selected: 0 });
  console.info("[patient-transfer] persist:selected-count", JSON.stringify(treatmentCounts));
  if (treatmentCounts.detected && !treatmentCounts.selected) {
    showPatientTransferError("Se detectaron medicamentos, pero ninguno fue seleccionado para importar.");
    console.info("patient-transfer:save-reviewed-return", { reason: "no-clinical-selection" });
    return;
  }
  const blocking = reviewedGroups.find((group) =>
    !group.omitted
      && group.action === "associate"
      && !group.selectedPatientId
      && !group.selectedExistingPatientId
      && !(group.documents || []).some((document) => document.matchedPatientId)
  );
  if (blocking) {
    showPatientTransferError("Selecciona el paciente existente antes de asociar notas.");
    console.info("patient-transfer:save-reviewed-return", { reason: "missing-patient" });
    return;
  }
  const duplicatePending = reviewedGroups.find((group) => {
    if (group.omitted) return false;
    const strongest = (group.possibleMatches || group.candidates || [])[0];
    return strongest && ["muy_alta", "alta"].includes(strongest.level)
      && ![
        DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING,
        DUPLICATE_RESOLUTION.CREATE_NEW,
        DUPLICATE_RESOLUTION.OMIT
      ].includes(group.selectedResolution);
  });
  if (duplicatePending) {
    showPatientTransferError("Resuelve la posible coincidencia del paciente: asociar, crear de todas formas u omitir.");
    console.info("patient-transfer:save-reviewed-return", { reason: "duplicate-resolution-required" });
    return;
  }
  const createDespiteMatch = reviewedGroups.find((group) => (
    group.selectedResolution === DUPLICATE_RESOLUTION.CREATE_NEW
    && !group.omitted
    && (group.possibleMatches || group.candidates || []).some((match) => ["muy_alta", "alta"].includes(match.level))
  ));
  if (createDespiteMatch) {
    console.info("patient-transfer:confirmation-request", { confirmation: 1 });
    const duplicateConfirmed = window.confirm("Se detectó un posible duplicado. ¿Desea crear otro expediente de todas formas?");
    console.info("patient-transfer:confirmation-result", { confirmation: 1, accepted: duplicateConfirmed });
    if (!duplicateConfirmed) {
      console.info("patient-transfer:save-reviewed-return", { reason: "duplicate-confirmation-cancelled" });
      return;
    }
  }
  console.info("[patient-transfer] duplicate-resolution", JSON.stringify(reviewedGroups.map((group) => ({
    groupId: group.id,
    action: group.selectedResolution || "none",
    matchedPatientIdPresent: Boolean(group.selectedExistingPatientId),
    score: group.highestMatch?.score || group.duplicateResolution?.score || 0
  }))));

  const summary = {
    newPatients: persistenceGroups.filter((group) => !group.omitted && group.action === "create").length,
    existingPatients: persistenceGroups.filter((group) => !group.omitted && group.action === "associate").length,
    notes: persistenceGroups.reduce((total, group) => total + group.documents.filter((document) => persistenceEligibilityForDocument(group, document).eligible).length, 0),
    omittedFiles: persistenceGroups.reduce((total, group) => total + group.documents.filter((document) => persistenceEligibilityForDocument(group, document).reason === "omitted").length, 0),
    possibleDuplicates: persistenceGroups.reduce((total, group) => total + group.documents.filter((document) => normalizeDuplicateDetectionStatus(document.duplicateDetectionStatus ?? document.duplicateStatus) !== DUPLICATE_DETECTION_STATUS.NONE).length, 0),
    pendingFields: reviewedGroups.reduce((total, group) => total + Object.values(group.confirmedFields || {}).filter((value) => !value).length, 0)
  };
  console.info("patient-transfer:confirmation-request", { confirmation: 2 });
  const confirmed = window.confirm(`Resumen del traspaso\n\nPacientes nuevos: ${summary.newPatients}\nPacientes existentes: ${summary.existingPatients}\nNotas que se crearan: ${summary.notes}\nArchivos omitidos: ${summary.omittedFiles}\nPosibles duplicados: ${summary.possibleDuplicates}\nCampos pendientes: ${summary.pendingFields}\n\n¿Confirmar traspaso?`);
  console.info("patient-transfer:confirmation-result", { confirmation: 2, accepted: confirmed });
  if (!confirmed) {
    console.info("patient-transfer:save-reviewed-return", { reason: "confirmation-cancelled" });
    return;
  }

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
    console.info("patient-transfer:persistence-start", {
      groupsCount: persistenceGroups.length,
      documentsCount: expandedDocuments.length,
      eligibleDocuments: persistenceGroups.reduce((total, group) => total + (group.documents || [])
        .filter((document) => persistenceEligibilityForDocument(group, document).eligible).length, 0),
      createNewCount: syncSummary?.createNewCount || 0,
      associateExistingCount: syncSummary?.associateExistingCount || 0
    });
    const results = await saveTransferredGroups({
      groups: persistenceGroups,
      user: { ...profile, uid: user.uid, email: user.email },
      onProgress: ({ stage, message, progress }) => {
        setPatientTransferExecutionState({ lastCompletedStage: stage || "saving" });
        setPatientTransferMessage(message, progress);
      }
    });
    persistenceGroups.forEach((group) => {
      const result = results.find((item) => item.groupId === group.id);
      const documents = group.documents || [];
      const eligibility = documents.map((document) => persistenceEligibilityForDocument(group, document));
      console.info("[patient-transfer] save-result", {
        groupId: group.id,
        documentsReceived: documents.length,
        eligibleDocuments: eligibility.filter((item) => item.eligible).length,
        omittedDocuments: eligibility.filter((item) => item.reason === "omitted").length,
        duplicateExcludedDocuments: eligibility.filter((item) => !item.eligible && item.reason !== "omitted").length,
        duplicateStatuses: [...new Set(documents.map((item) => item.duplicateStatus || "missing"))],
        patientCreated: Boolean(result?.patientCreated),
        patientIdPresent: Boolean(result?.patientId)
      });
    });
    setPatientTransferResults(results);
    const noPersistenceResult = results.length > 0 && results.every((item) =>
      !item.patientCreated && !item.patientId && Number(item.notesCreated || 0) === 0
    );
    const hasFailures = noPersistenceResult || results.some((item) => item.status === "failed" || item.status === "partially_completed");
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
    setPatientTransferMessage(
      noPersistenceResult
        ? "No se creó ningún paciente ni ninguna nota. Revise la resolución de duplicados."
        : hasFailures ? "Traspaso no completado." : "Traspaso completado.",
      hasFailures ? 85 : 100
    );
    console.info("[patient-transfer] render-result:start", { results: results.length });
    renderTransferResults(noPersistenceResult
      ? results.map((item) => ({
          ...item,
          status: "failed",
          error: "No se creó ningún paciente ni ninguna nota. Revise la resolución de duplicados."
        }))
      : results);
    console.info("[patient-transfer] render-result:success", { results: results.length });
    console.info("[patient-transfer] completed-event", {
      patientIdsCount: results.filter((item) => item.patientId).length,
      createdCount: results.filter((item) => item.patientCreated).length,
      associatedCount: results.filter((item) => item.patientId && !item.patientCreated).length,
      operationIdPresent: Boolean(firstResult.transferOperationId || reviewedGroups[0]?.documents?.[0]?.transferOperationId)
    });
    console.info("patient-transfer:confirm-complete", {
      groups: results.length,
      notes: results.reduce((count, result) => count + Number(result.notesCreated || 0), 0),
      diagnoses: results.reduce((count, result) => count + Number(result.diagnosesCreated || 0), 0),
      treatments: results.reduce((count, result) => count + Number(result.treatmentsCreated || 0), 0)
    });
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

async function handleConfirmTransferClick(event) {
  const button = event?.currentTarget?.matches?.("[data-transfer-save]")
    ? event.currentTarget
    : globalThis.document?.querySelector?.(".patient-transfer-modal [data-transfer-save]") || null;
  console.info("patient-transfer:confirm-native-click", {
    eventType: event?.type || "programmatic",
    targetIsSaveControl: Boolean(event?.target?.closest?.("[data-transfer-save]")),
    connected: Boolean(button?.isConnected),
    disabled: Boolean(button?.disabled),
    ariaDisabled: button?.getAttribute("aria-disabled"),
    saving: button?.closest?.(".patient-transfer-modal")?.dataset?.saving === "true"
  });
  const visible = Boolean(button?.isConnected && !button.hidden && button.getClientRects().length);
  console.info("patient-transfer:confirm-button-state", {
    connected: Boolean(button?.isConnected),
    disabled: Boolean(button?.disabled),
    type: button?.type || "",
    visible,
    saving: button?.closest?.(".patient-transfer-modal")?.dataset?.saving === "true",
    target: {
      tagName: event?.target?.tagName || "",
      id: event?.target?.id || "",
      className: typeof event?.target?.className === "string" ? event.target.className : ""
    },
    currentTarget: {
      tagName: event?.currentTarget?.tagName || "",
      id: event?.currentTarget?.id || "",
      className: typeof event?.currentTarget?.className === "string" ? event.currentTarget.className : ""
    }
  });
  console.info("patient-transfer:confirm-handler-enter", { groupsCount: analyzedGroups.length });
  try {
    console.info("patient-transfer:confirm-before-save", { saving: isTransferSaving() });
    await saveReviewedTransfer();
  } catch (error) {
    console.error("patient-transfer:confirm-error", {
      name: error?.name || "Error",
      message: error?.message || String(error),
      stack: error?.stack || ""
    });
    setTransferSavingState(false);
    setPatientTransferExecutionState({ isSaving: false, lastCompletedStage: error?.stage || "failed" });
    setPatientTransferStatus(TRANSFER_STATUS.FAILED);
    setPatientTransferVisualStatus(TRANSFER_STATUS.FAILED);
    showPatientTransferError(error?.message || String(error));
  }
}

function resetAndOpen() {
  resetPatientTransferState();
  setTransferSavingState(false);
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
  analyzedGroups = resolveReviewedMedicationCandidates(readTransferReview(analyzedGroups));
  setPatientTransferGroups(analyzedGroups);
  syncBulkSelectionControls(analyzedGroups);

  const counts = analyzedGroups.reduce((total, group) => group.documents.reduce((documentTotal, doc) => {
    const owners = doc.noteSegments?.length ? doc.noteSegments : [doc];
    const diagnoses = owners.reduce((count, owner) => count + (owner.diagnosisCandidates || []).length, 0);
    const treatments = owners.reduce((count, owner) => count + (owner.treatmentCandidates || []).length, 0);
    const diagnosesSelected = owners.reduce((count, owner) => count
      + (owner.diagnosisCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0);
    const treatmentsSelected = owners.reduce((count, owner) => count
      + (owner.treatmentCandidates || []).filter((candidate) => candidate.include || candidate.selectedForImport).length, 0);
    const eligibility = persistenceEligibilityForDocument(group, doc);
    return {
      groupsCount: documentTotal.groupsCount,
      documentsCount: documentTotal.documentsCount + 1,
      createNewCount: documentTotal.createNewCount + (eligibility.resolution === DUPLICATE_RESOLUTION.CREATE_NEW ? 1 : 0),
      associateExistingCount: documentTotal.associateExistingCount + (eligibility.resolution === DUPLICATE_RESOLUTION.ASSOCIATE_EXISTING ? 1 : 0),
      unresolvedCount: documentTotal.unresolvedCount + (eligibility.resolution === DUPLICATE_RESOLUTION.UNRESOLVED ? 1 : 0),
      omittedCount: documentTotal.omittedCount + (eligibility.resolution === DUPLICATE_RESOLUTION.OMIT ? 1 : 0),
      diagnosesSelected: documentTotal.diagnosesSelected + diagnosesSelected,
      treatmentsSelected: documentTotal.treatmentsSelected + treatmentsSelected,
      diagnosisCandidatesDetected: documentTotal.diagnosisCandidatesDetected + diagnoses,
      diagnosisCandidatesRendered: documentTotal.diagnosisCandidatesRendered + diagnoses,
      treatmentCandidatesDetected: documentTotal.treatmentCandidatesDetected + treatments,
      treatmentCandidatesRendered: documentTotal.treatmentCandidatesRendered + treatments
    };
  }, total), {
    groupsCount: analyzedGroups.length,
    documentsCount: 0,
    createNewCount: 0,
    associateExistingCount: 0,
    unresolvedCount: 0,
    omittedCount: 0,
    diagnosesSelected: 0,
    treatmentsSelected: 0,
    diagnosisCandidatesDetected: 0,
    diagnosisCandidatesRendered: 0,
    treatmentCandidatesDetected: 0,
    treatmentCandidatesRendered: 0
  });

  console.info("[patient-transfer] review-state:updated", counts);
  return counts;
}

function toggleAllCandidates(control) {
  const selected = Boolean(control.checked);
  syncReviewedGroupsFromView();
  const candidateType = control.dataset.candidateType || "";
  const result = applyBulkCandidateSelection(analyzedGroups, {
    documentId: control.dataset.documentId || "",
    noteId: control.dataset.noteId || "",
    candidateType,
    selected
  });
  analyzedGroups = result.groups;
  setPatientTransferGroups(analyzedGroups);
  renderDetectedGroups(analyzedGroups);
  const trace = {
    documentId: control.dataset.documentId || "",
    noteId: control.dataset.noteId || "",
    candidateType,
    selected,
    candidateCount: result.candidateCount,
    affectedCount: result.affectedCount
  };
  console.info("[patient-transfer] select-all-click", trace);
  console.info("[patient-transfer] select-all-state", trace);
  console.info(`[patient-transfer] ${candidateType === "diagnosis" ? "select-all-diagnoses" : "select-all-treatments"}`, trace);
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
  root.querySelector("[data-transfer-save]")?.addEventListener("click", handleConfirmTransferClick);

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
    const addAdministration = event.target.closest("[data-transfer-tx-schedule-add]");
    if (addAdministration) {
      const list = root.querySelector(`[data-transfer-tx-schedule-list="${addAdministration.dataset.transferTxScheduleAdd}"]`);
      const first = list?.querySelector("[data-transfer-tx-administration-row]");
      if (list && first) {
        const row = first.cloneNode(true);
        const index = list.querySelectorAll("[data-transfer-tx-administration-row]").length;
        row.querySelectorAll("[data-transfer-tx-schedule-time],[data-transfer-tx-schedule-dose],[data-transfer-tx-schedule-unit]").forEach((control) => {
          const preserveEquivalentUnit = control.matches("[data-transfer-tx-schedule-unit]")
            && control.hidden
            && control.value.trim();
          if (!preserveEquivalentUnit) control.value = "";
          const attribute = control.getAttributeNames().find((name) => name.startsWith("data-transfer-tx-schedule-"));
          if (attribute) control.setAttribute(attribute, `${addAdministration.dataset.transferTxScheduleAdd}:${index}`);
        });
        const unitControl = row.querySelector("[data-transfer-tx-schedule-unit]");
        if (unitControl && !unitControl.value.trim()) {
          unitControl.hidden = false;
          row.classList.remove("patient-transfer-medication-pauta-unit-hidden");
        }
        const remove = row.querySelector("[data-transfer-tx-schedule-remove]");
        if (remove) remove.setAttribute("data-transfer-tx-schedule-remove", `${addAdministration.dataset.transferTxScheduleAdd}:${index}`);
        list.appendChild(row);
        syncReviewedGroupsFromView();
      }
      return;
    }
    const removeAdministration = event.target.closest("[data-transfer-tx-schedule-remove]");
    if (removeAdministration) {
      const row = removeAdministration.closest("[data-transfer-tx-administration-row]");
      const list = removeAdministration.closest("[data-transfer-tx-schedule-list]");
      if (row && list && list.querySelectorAll("[data-transfer-tx-administration-row]").length > 1) row.remove();
      else {
        row?.querySelectorAll("input").forEach((control) => { control.value = ""; });
        const unitControl = row?.querySelector("[data-transfer-tx-schedule-unit]");
        if (unitControl) unitControl.hidden = false;
        row?.classList.remove("patient-transfer-medication-pauta-unit-hidden");
      }
      syncReviewedGroupsFromView();
      return;
    }
    const toggleCatalog = event.target.closest("[data-transfer-tx-catalog-toggle]");
    if (toggleCatalog) {
      const select = root.querySelector(`[data-transfer-tx-catalog="${toggleCatalog.dataset.transferTxCatalogToggle}"]`);
      if (select) {
        const shouldOpen = select.hidden;
        const catalogState = medicationCatalogCompactState(select.value, shouldOpen);
        select.hidden = !shouldOpen;
        toggleCatalog.textContent = catalogState.action;
        toggleCatalog.setAttribute("aria-expanded", String(catalogState.expanded));
        if (shouldOpen) select.focus();
      }
      return;
    }
    const removeButton = event.target.closest("[data-transfer-remove-file]");
    if (!removeButton) return;
    selectedFiles = selectedFiles.filter((item) => item.id !== removeButton.dataset.transferRemoveFile);
    setPatientTransferFiles(selectedFiles);
    renderTransferFiles(selectedFiles);
  });

  root.addEventListener("change", (event) => {
    const selectAll = event.target.closest("[data-action='toggle-all-candidates']");
    if (selectAll) {
      console.info("[patient-transfer] select-all-debug", {
        eventType: event.type,
        checked: Boolean(event.target.checked),
        dataset: {
          documentId: selectAll.dataset.documentId || "",
          noteId: selectAll.dataset.noteId || "",
          candidateType: selectAll.dataset.candidateType || ""
        },
        candidateType: selectAll.dataset.candidateType || "",
        noteId: selectAll.dataset.noteId || "",
        documentId: selectAll.dataset.documentId || ""
      });
      toggleAllCandidates(selectAll);
      return;
    }
    const catalogSelect = event.target.closest("[data-transfer-tx-catalog-compact]");
    if (catalogSelect) {
      const identity = catalogSelect.closest(".patient-transfer-medication-identity");
      const catalogMeta = identity?.querySelector(".patient-transfer-medication-catalog-meta");
      const toggle = identity?.querySelector("[data-transfer-tx-catalog-toggle]");
      const catalogState = medicationCatalogCompactState(catalogSelect.value);
      catalogSelect.hidden = true;
      if (catalogMeta) {
        catalogMeta.textContent = catalogState.label;
        catalogMeta.title = catalogState.linked
          ? `Medicamento vinculado: ${catalogSelect.selectedOptions?.[0]?.textContent?.trim() || "catálogo"}`
          : "Medicamento pendiente de vincular al catálogo";
      }
      if (toggle) {
        toggle.textContent = catalogState.action;
        toggle.setAttribute("aria-expanded", String(catalogState.expanded));
      }
      syncReviewedGroupsFromView();
      return;
    }
    if (event.target.matches("[data-transfer-tx-presentation], [data-transfer-tx-schedule-unit]")) {
      updateMedicationScheduleUnitVisibility(root, event.target);
    }
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
    const duplicateDecision = event.target.closest("[data-transfer-duplicate-resolution]");
    if (duplicateDecision) {
      syncReviewedGroupsFromView();
      const group = analyzedGroups.find((item) => item.id === duplicateDecision.dataset.transferDuplicateResolution);
      console.info("patient-transfer:decision-changed", {
        decision: group?.selectedResolution || DUPLICATE_RESOLUTION.UNRESOLVED,
        hasTarget: Boolean(group?.selectedPatientId)
      });
      renderDetectedGroups(analyzedGroups);
      return;
    }
    const existingPatientSelect = event.target.closest("[data-transfer-existing]");
    if (existingPatientSelect) {
      syncReviewedGroupsFromView();
      const group = analyzedGroups.find((item) => item.id === existingPatientSelect.dataset.transferExisting);
      console.info("patient-transfer:association-target-selected", {
        decision: group?.selectedResolution || DUPLICATE_RESOLUTION.UNRESOLVED,
        hasTarget: Boolean(group?.selectedPatientId)
      });
      return;
    }
    syncReviewedGroupsFromView();
  });

  root.addEventListener("input", (event) => {
    if (event.target.closest("[data-action='toggle-all-candidates']")) return;
    if (event.target.matches("[data-transfer-plan-text]")) resizeTransferIndicationTextarea(event.target);
    syncPatientNameInputs(event);
    if (updateSubjectiveFromInput(event)) return;
    syncReviewedGroupsFromView();
  });

  return { openPatientTransfer: resetAndOpen };
}
