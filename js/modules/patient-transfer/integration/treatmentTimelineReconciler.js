function normalizeIdentityPart(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = String(value).trim().replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalizeIdentityPart(normalized);
}

function selectedForImport(candidate = {}) {
  return candidate.include === true || candidate.selectedForImport === true;
}

function documentClinicalDate(document = {}) {
  return String(
    document.sourceNoteDate
    || document.metadata?.documentDate
    || document.date
    || ""
  ).trim();
}

function documentClinicalTime(document = {}) {
  return String(
    document.sourceNoteTime
    || document.metadata?.documentHour
    || document.time
    || ""
  ).trim();
}

function clinicalTimestamp(document = {}) {
  const date = documentClinicalDate(document);
  const dmy = date.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const ymd = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dmy && !ymd) return null;
  const year = Number(dmy?.[3] || ymd?.[1]);
  const month = Number(dmy?.[2] || ymd?.[2]);
  const day = Number(dmy?.[1] || ymd?.[3]);
  const time = documentClinicalTime(document).match(/^(\d{1,2}):([0-5]\d)/);
  const hour = Number(time?.[1] || 0);
  const minute = Number(time?.[2] || 0);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return timestamp;
}

function chronologicalDocumentIndexes(documents = []) {
  const dated = documents.map((document, index) => ({ index, timestamp: clinicalTimestamp(document) }));
  if (!dated.length) return [];
  if (dated.some((item) => item.timestamp === null)) return dated.map((item) => item.index);
  return dated
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index)
    .map((item) => item.index);
}

export function importedTreatmentPresentationKey(candidate = {}) {
  const medication = normalizeIdentityPart(
    candidate.normalizedMedicationName
    || candidate.medicationName
    || candidate.genericName
    || candidate.medicamento
    || candidate.nombreMedicamento
    || candidate.catalogMedicationId
    || candidate.medicationId
  );
  if (!medication) return "";
  const concentration = candidate.concentration || {};
  const presentation = normalizeIdentityPart(candidate.presentation || candidate.presentacion);
  const strengthValue = normalizedNumber(
    candidate.strengthValue
    ?? candidate.dosisValor
    ?? candidate.dose
    ?? concentration.value
  );
  const strengthUnit = normalizeIdentityPart(
    candidate.strengthUnit
    || candidate.dosisUnidad
    || candidate.doseUnit
    || concentration.unit
  );
  const perValue = normalizedNumber(
    candidate.strengthPerValue
    ?? candidate.concentracionPorValor
    ?? concentration.perValue
  );
  const perUnit = normalizeIdentityPart(
    candidate.strengthPerUnit
    || candidate.concentracionPorUnidad
    || concentration.perUnit
  );
  return [medication, presentation, strengthValue, strengthUnit, perValue, perUnit].join("|");
}

export function isSuspendedTreatmentAction(value = "") {
  const action = normalizeIdentityPart(value);
  return action === "suspende" || action === "suspendido" || action === "se suspende";
}

function candidateWithDocumentDate(candidate = {}, document = {}) {
  return {
    ...candidate,
    date: candidate.date || documentClinicalDate(document)
  };
}

function suspendedCandidate(candidate = {}, document = {}, latestDocument = {}) {
  return {
    ...candidateWithDocumentDate(candidate, document),
    action: "Suspende",
    statusSuggestion: "Suspende",
    temporality: "historical",
    include: true,
    selectedForImport: true,
    suspensionDate: documentClinicalDate(latestDocument),
    timelineResolution: "absent-from-latest-note"
  };
}

export function reconcileImportedTreatmentTimeline(documents = []) {
  const sourceDocuments = Array.isArray(documents) ? documents : [];
  const chronologicalIndexes = chronologicalDocumentIndexes(sourceDocuments);
  if (!chronologicalIndexes.length) {
    return {
      documents: [],
      latestDocumentIndex: -1,
      selectedBefore: 0,
      selectedAfter: 0,
      suspended: 0,
      deduplicated: 0
    };
  }

  const latestDocumentIndex = chronologicalIndexes.at(-1);
  const latestDocument = sourceDocuments[latestDocumentIndex];
  const candidatesByDocument = sourceDocuments.map(() => []);
  const representedKeys = new Set();
  let selectedBefore = 0;
  let suspended = 0;

  const registerDocumentCandidates = (documentIndex, { suspend = false } = {}) => {
    const document = sourceDocuments[documentIndex] || {};
    const selected = (document.treatmentCandidates || []).filter(selectedForImport);
    selectedBefore += selected.length;
    selected.forEach((candidate, candidateIndex) => {
      const key = importedTreatmentPresentationKey(candidate) || `candidate:${documentIndex}:${candidate.id || candidateIndex}`;
      if (representedKeys.has(key)) return;
      representedKeys.add(key);
      const reconciled = suspend
        ? suspendedCandidate(candidate, document, latestDocument)
        : candidateWithDocumentDate(candidate, document);
      candidatesByDocument[documentIndex].push(reconciled);
      if (suspend) suspended += 1;
    });
  };

  registerDocumentCandidates(latestDocumentIndex);
  chronologicalIndexes
    .slice(0, -1)
    .reverse()
    .forEach((documentIndex) => registerDocumentCandidates(documentIndex, { suspend: true }));

  const selectedAfter = candidatesByDocument.reduce((total, candidates) => total + candidates.length, 0);
  return {
    documents: sourceDocuments.map((document, index) => ({
      ...document,
      treatmentCandidates: [
        ...candidatesByDocument[index],
        ...(document.treatmentCandidates || []).filter((candidate) => !selectedForImport(candidate))
      ]
    })),
    latestDocumentIndex,
    selectedBefore,
    selectedAfter,
    suspended,
    deduplicated: Math.max(0, selectedBefore - selectedAfter)
  };
}
