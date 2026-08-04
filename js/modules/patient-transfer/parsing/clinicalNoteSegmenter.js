import { normalizedBlocksToText } from "../docx/docxBlockNormalizer.js";
import { NOTE_START_ALIASES } from "./clinicalSectionConfig.js";
import { normalizeClinicalHeading, parseClinicalSections } from "./clinicalSectionParser.js";

const DATE_PATTERN = /\b(?:[0-3]?\d[\/-][01]?\d[\/-](?:19|20)?\d{2}|(?:19|20)\d{2}-[01]\d-[0-3]\d)\b/;
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;

function blockText(block = {}) {
  return block.type === "table" ? (block.rows || []).map((row) => row.join(" | ")).join("\n") : String(block.text || "");
}

function blockIndex(block = {}, fallback = 0) {
  return Number.isInteger(block.source?.blockIndex) ? block.source.blockIndex : fallback;
}

function noteTitle(text = "") {
  const normalized = normalizeClinicalHeading(String(text).split(/[:\n]/)[0]);
  return NOTE_START_ALIASES.find((alias) => {
    const normalizedAlias = normalizeClinicalHeading(alias);
    return normalized === normalizedAlias || normalized.startsWith(`${normalizedAlias} `);
  }) || "";
}

function clinicalDate(text = "") {
  const raw = String(text || "");
  const labelled = raw.match(new RegExp(`\\bfecha\\s*:?\\s*(${DATE_PATTERN.source})`, "i"))?.[1];
  const value = labelled || raw.match(DATE_PATTERN)?.[0] || "";
  const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return match ? `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}` : value;
}

function clinicalTime(text = "") {
  return String(text || "").match(TIME_PATTERN)?.[0] || "";
}

export function detectMultipleClinicalNotes({ blocks = [], fullText = "", headings = [], dates = [] } = {}) {
  const reasons = new Set();
  const boundaries = [];
  const dateValues = new Set(dates.filter(Boolean));
  const headingCounts = new Map();
  let firstClinicalDate = "";
  let explicitNoteCount = 0;

  blocks.forEach((block, index) => {
    const text = blockText(block);
    const title = noteTitle(text);
    const date = clinicalDate(text);
    if (date) {
      dateValues.add(date);
      if (!firstClinicalDate) firstClinicalDate = date;
      else if (date !== firstClinicalDate && /\b(?:fecha|nota|evoluci[oó]n|ingreso)\b/i.test(text)) {
        boundaries.push({ blockIndex: blockIndex(block, index), reason: "multiple-clinical-dates", label: date });
      }
    }
    if (title) {
      explicitNoteCount += 1;
      boundaries.push({ blockIndex: blockIndex(block, index), reason: "repeated-note-heading", label: title });
    }
  });
  headings.forEach((heading) => headingCounts.set(heading.key, (headingCounts.get(heading.key) || 0) + 1));

  if (dateValues.size > 1) reasons.add("multiple-clinical-dates");
  if (boundaries.length > 1) reasons.add("repeated-note-heading");
  if (["subjetivo", "physicalNeurologicalExam", "analisis", "plan"].some((key) => (headingCounts.get(key) || 0) > 1)) {
    reasons.add("repeated-clinical-headings");
    if (boundaries.length <= 1) {
      const repeatedStarts = headings.filter((heading) => heading.key === "subjetivo").slice(1);
      repeatedStarts.forEach((heading) => boundaries.push({ blockIndex: heading.start, reason: "repeated-clinical-headings", label: heading.heading }));
    }
  }

  // Los títulos explícitos son límites más confiables que fechas narrativas, de nacimiento o de tratamientos.
  const boundaryPool = explicitNoteCount > 1
    ? boundaries.filter((boundary) => boundary.reason === "repeated-note-heading")
    : boundaries;
  const sortedBoundaries = [...new Map(boundaryPool
    .filter((boundary) => boundary.blockIndex >= 0)
    .map((boundary) => [boundary.blockIndex, boundary])).values()]
    .sort((a, b) => a.blockIndex - b.blockIndex);
  const uniqueBoundaries = sortedBoundaries.reduce((result, boundary) => {
    const previous = result.at(-1);
    if (previous && boundary.blockIndex - previous.blockIndex <= 2) return result;
    result.push(boundary);
    return result;
  }, []);
  return {
    probableMultipleNotes: reasons.size > 0 && (uniqueBoundaries.length > 0 || dateValues.size > 1),
    reasons: [...reasons],
    proposedNoteBoundaries: uniqueBoundaries,
    detectedDates: [...dateValues],
    explicitNoteCount
  };
}

function metadataForSegment(rawText = "") {
  const firstLine = String(rawText).split(/\n/).find(Boolean) || "";
  const title = noteTitle(firstLine);
  return {
    date: clinicalDate(rawText),
    time: clinicalTime(rawText),
    noteType: title || "Nota clínica"
  };
}

function createSegment(documentId, blocks, index) {
  const rawText = normalizedBlocksToText(blocks);
  const first = blocks[0];
  const last = blocks.at(-1);
  const metadata = metadataForSegment(rawText);
  const id = `${documentId}-note-${index + 1}`;
  const startBlockIndex = blockIndex(first, 0);
  const endBlockIndex = blockIndex(last, blocks.length - 1) + 1;
  const parsedSections = parseClinicalSections(blocks, {
    noteSegment: {
      id,
      date: metadata.date,
      time: metadata.time,
      startBlockIndex,
      endBlockIndex,
      rawText
    }
  });
  return {
    id,
    startBlockIndex,
    endBlockIndex,
    rawText,
    date: metadata.date,
    time: metadata.time,
    noteType: metadata.noteType,
    sourcePages: [...new Set(blocks.map((block) => block.source?.pageIndex).filter(Number.isInteger))],
    blocks,
    sections: parsedSections.secciones,
    subjectiveExtraction: parsedSections.subjectiveExtraction,
    diagnosisCandidates: [],
    treatmentCandidates: [],
    omitted: false
  };
}

export function segmentClinicalNotes({ blocks = [], fullText = "", manualMultipleNotes = false, proposedBoundaries = [], documentId = "doc" } = {}) {
  void fullText;
  let boundaries = manualMultipleNotes
    ? [...new Set(proposedBoundaries.map((item) => Number(item.blockIndex ?? item)).filter((value) => Number.isInteger(value) && value >= 0))].sort((a, b) => a - b)
    : [];
  // El primer título identifica la primera nota; no debe crear un segmento de preámbulo independiente.
  const firstTitleBlock = blocks.find((block) => noteTitle(blockText(block)))?.source?.blockIndex;
  if (Number.isInteger(firstTitleBlock) && boundaries[0] === firstTitleBlock) boundaries = boundaries.slice(1);
  if (!boundaries.length) return [createSegment(documentId, blocks, 0)];

  const groups = [];
  let current = [];
  blocks.forEach((block, index) => {
    const indexValue = blockIndex(block, index);
    if (current.length && boundaries.includes(indexValue)) {
      groups.push(current);
      current = [];
    }
    current.push(block);
  });
  if (current.length) groups.push(current);
  return groups.filter((group) => group.length).map((group, index) => createSegment(documentId, group, index));
}

export function splitClinicalSegment(segments = [], segmentId = "") {
  const output = [];
  segments.forEach((segment) => {
    if (segment.id !== segmentId || (segment.blocks || []).length < 2) {
      output.push(segment);
      return;
    }
    const headings = parseClinicalSections(segment.blocks).encabezados.filter((heading) => heading.start > segment.startBlockIndex);
    const preferred = headings[Math.floor(headings.length / 2)]?.start;
    const midpoint = preferred ?? blockIndex(segment.blocks[Math.floor(segment.blocks.length / 2)], Math.floor(segment.blocks.length / 2));
    const left = segment.blocks.filter((block, index) => blockIndex(block, index) < midpoint);
    const right = segment.blocks.filter((block, index) => blockIndex(block, index) >= midpoint);
    if (!left.length || !right.length) {
      output.push(segment);
      return;
    }
    output.push(createSegment(segment.id.replace(/-note-\d+$/, ""), left, output.length));
    output.push(createSegment(segment.id.replace(/-note-\d+$/, ""), right, output.length));
  });
  return output.map((segment, index) => ({ ...segment, id: `${segment.id.replace(/-note-\d+$/, "")}-note-${index + 1}` }));
}

export function mergeClinicalSegments(segments = [], segmentId = "") {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0 || index >= segments.length - 1) return segments;
  const documentId = segmentId.replace(/-note-\d+$/, "");
  const merged = createSegment(documentId, [...segments[index].blocks, ...segments[index + 1].blocks], index);
  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)]
    .map((segment, segmentIndex) => ({ ...segment, id: `${documentId}-note-${segmentIndex + 1}` }));
}

export function expandSegmentedDocumentsForPersistence(documents = []) {
  return documents.flatMap((document) => {
    const segments = (document.noteSegments || []).filter((segment) => !segment.omitted);
    if (!segments.length) return document.noteSegments?.length ? [] : [document];
    return segments.map((segment, index) => ({
      ...document,
      id: segments.length > 1 ? `${document.id}:${segment.id}` : document.id,
      textHash: segments.length > 1 ? `${document.textHash}:${segment.id}` : document.textHash,
      sections: segment.sections,
      fullText: segment.rawText,
      blocks: segment.blocks,
      metadata: segment.metadata,
      confirmedType: segment.confirmedType,
      diagnosisCandidates: segment.diagnosisCandidates,
      treatmentCandidates: segment.treatmentCandidates,
      vitalSignsCandidates: segment.vitalSignsCandidates,
      sourceDocumentIndex: index,
      sourceNoteSegmentId: segment.id
    }));
  });
}
