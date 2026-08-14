  import { normalizedBlocksToText } from "../docx/docxBlockNormalizer.js?v=20260814-note-sections-runtime-v1";
  import { NOTE_START_ALIASES } from "./clinicalSectionConfig.js?v=20260814-note-sections-runtime-v1";
  import { normalizeClinicalHeading, parseClinicalSections } from "./clinicalSectionParser.js?v=20260814-note-sections-runtime-v1";
  import { assignParsedSubjective } from "../state/subjectiveSegmentState.js";


console.info("[patient-transfer] clinical-note-segmenter:loaded", {
  moduleUrl: import.meta.url,
  buildMarker: "20260814-note-sections-runtime-v1"
});

  const DATE_PATTERN =  /\b(?:[0-3]?\d[\/-][01]?\d[\/-](?:19|20)?\d{2}|(?:19|20)\d{2}-[01]\d-[0-3]\d)\b/;
  const TIME_PATTERN = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
  const NOTE_BOUNDARY_SCORE_THRESHOLD = 80;

  function blockText(block = {}) {
    return block.type === "table" ? (block.rows || []).map((row) => row.join(" | ")).join("\n") : String(block.text || "");
  }

  function blockIndex(block = {}, fallback = 0) {
    return Number.isInteger(block.source?.blockIndex) ? block.source.blockIndex : fallback;
  }

  function noteTitle(text = "") {
    const aliases = NOTE_START_ALIASES
      .map((alias) => ({ alias, normalized: normalizeClinicalHeading(alias) }))
      .sort((a, b) => b.normalized.length - a.normalized.length);
    const candidates = String(text || "")
      .replace(/\u00a0/g, " ")
      .split(/[\n|]/)
      .map((value) => normalizeClinicalHeading(value))
      .filter(Boolean);

    for (const candidate of candidates) {
      const match = aliases.find(({ normalized }) => candidate === normalized || candidate.startsWith(normalized));
      if (match) return match.alias;
    }
    return "";
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

  function scoreNoteBoundaryCandidate(text = "", title = "") {
    const raw = String(text || "");
    const normalized = normalizeClinicalHeading(raw);
    const signals = [];
    let score = 0;
    const add = (label, value) => {
      score += value;
      signals.push({ label, value });
    };

    if (title) add("note-title", 100);
    if (DATE_PATTERN.test(raw)) add("date", 20);
    if (/\bhora\s*:\s*(?:[01]?\d|2[0-3]):[0-5]\d\b/i.test(raw)) add("time", 10);
    if (/\bexpediente\s*:/i.test(raw)) add("record-number", 20);
    if (/\bnombre(?:\s+del\s+paciente)?\s*:/i.test(raw)) add("patient-name", 10);
    if (/\bservicio\s*:/i.test(raw)) add("service", 10);
    if (/\bcama\s*:/i.test(raw)) add("bed", 10);
    if (/\b(?:subjetivo|motivo\s+de\s+atencion|motivo\s+de\s+ingreso|padecimiento\s+actual)\b/i.test(normalized)) add("subjective", 10);

    if (/\bfecha\s+de\s+nacimiento\b|\bnacimiento\b/i.test(raw)) add("birth-date", -100);
    if (/(?:^|\s)(?:ultimo|\u00faltimo)\s+(?:internamiento|ingreso)\b|\binternamiento\s+previo\b|\bingreso\s+previo\b/i.test(raw)) add("previous-admission", -80);
    if (/\begreso\s+previo\b|\begreso\s+voluntario\b/i.test(raw)) add("previous-discharge", -80);
    if (/\bhistoria\s+clinica\b/i.test(normalized) && /\b(?:refiere|presenta|cuenta\s+con|se\s+trata\s+de)\b/i.test(normalized)) add("narrative-history", -60);

    return { score, signals };
  }

  export function detectMultipleClinicalNotes({ blocks = [], fullText = "", headings = [], dates = [] } = {}) {
    const reasons = new Set();
    const boundaries = [];
    const dateValues = new Set(dates.filter(Boolean));
    let explicitNoteCount = 0;

    blocks.forEach((block, index) => {
      const text = blockText(block);
      const title = noteTitle(text);
      const datesInBlock = [...String(text || "").matchAll(new RegExp(DATE_PATTERN.source, "g"))]
        .map((match) => clinicalDate(match[0]))
        .filter(Boolean);
      const { score, signals } = scoreNoteBoundaryCandidate(text, title);
      const isCandidate = Boolean(title) || datesInBlock.length > 0;
      const accepted = isCandidate && score >= NOTE_BOUNDARY_SCORE_THRESHOLD;
      if (/nota de (?:ingreso|evolucion)/.test(normalizeClinicalHeading(text))) {
        console.info(
          "[patient-transfer] note-title-check",
          JSON.stringify({
            index,
            blockIndex: blockIndex(block, index),
            preview: text.slice(0, 150),
            detectedTitle: title
          }, null, 2)
        );
      }
      datesInBlock.forEach((date) => dateValues.add(date));
      if (isCandidate) {
        console.info(
          "[patient-transfer] segmentation:boundary-score",
          JSON.stringify({
            blockIndex: blockIndex(block, index),
            score,
            threshold: NOTE_BOUNDARY_SCORE_THRESHOLD,
            accepted,
            hasNoteTitle: Boolean(title),
            dates: datesInBlock,
            signals
          }, null, 2)
        );
      }
      if (title && accepted) {
        explicitNoteCount += 1;
        boundaries.push({ blockIndex: blockIndex(block, index), reason: "repeated-note-heading", label: title });
      }
    });

    if (dateValues.size > 1 && explicitNoteCount > 1) reasons.add("multiple-clinical-dates");
    if (boundaries.length > 1) reasons.add("repeated-note-heading");

    // Una fecha sin estructura de nota nunca propone por sí sola una división.
    const sortedBoundaries = [...new Map(boundaries
      .filter((boundary) => boundary.blockIndex >= 0)
      .map((boundary) => [boundary.blockIndex, boundary])).values()]
      .sort((a, b) => a.blockIndex - b.blockIndex);
    const uniqueBoundaries = sortedBoundaries;
    return {
      probableMultipleNotes: uniqueBoundaries.length > 1,
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

  function isolateSegmentBlocks(blocks = []) {
    return blocks.map((block) => ({
      ...block,
      source: { ...(block.source || {}) },
      rawRuns: Array.isArray(block.rawRuns) ? [...block.rawRuns] : block.rawRuns,
      rows: Array.isArray(block.rows) ? block.rows.map((row) => [...row]) : block.rows
    }));
  }

  function createSegment(documentId, blocks, index) {
    const segmentBlocks = isolateSegmentBlocks(blocks);
    const rawText = normalizedBlocksToText(segmentBlocks);
    const first = segmentBlocks[0];
    const last = segmentBlocks.at(-1);
    const metadata = metadataForSegment(rawText);
    const id = `${documentId}-note-${index + 1}`;
    const startBlockIndex = blockIndex(first, 0);
    const endBlockIndex = blockIndex(last, blocks.length - 1) + 1;


    console.info("[patient-transfer] segment:blocks-sliced", {
      noteId: id,
      date: metadata.date,
      time: metadata.time,
      segmentStartBlock: startBlockIndex,
      segmentEndBlock: endBlockIndex,
      segmentBlockCount: segmentBlocks.length,
      segmentRawTextLength: rawText.length
    });
    const parsedSections = parseClinicalSections(segmentBlocks, {
      noteSegment: {
        id,
        segmentIndex: index,
        date: metadata.date,
        time: metadata.time,
        startBlockIndex,
        endBlockIndex,
        rawText
      }
    });
    const baseSegment = {
      id,
      startBlockIndex,
      endBlockIndex,
      rawText,
      date: metadata.date,
      time: metadata.time,
      noteType: metadata.noteType,
      sourcePages: [...new Set(blocks.map((block) => block.source?.pageIndex).filter(Number.isInteger))],
      blocks: segmentBlocks,
      sections: { ...parsedSections.secciones },
      diagnosisCandidates: [],
      treatmentCandidates: [],
      treatmentPlanCandidates: [],
      omitted: false
    };
    const segment = assignParsedSubjective(baseSegment, parsedSections.subjectiveExtraction);
    console.info("[patient-transfer] segment:created", {
      noteId: id,
      date: metadata.date,
      time: metadata.time,
      segmentStartBlock: startBlockIndex,
      segmentEndBlock: endBlockIndex,
      segmentBlockCount: segmentBlocks.length,
      segmentRawTextLength: rawText.length
    });
    console.info("[patient-transfer] subjective:state-assigned", {
      noteId: id,
      date: metadata.date,
      time: metadata.time,
      segmentStartBlock: startBlockIndex,
      segmentEndBlock: endBlockIndex,
      segmentBlockCount: segmentBlocks.length,
      segmentRawTextLength: rawText.length,
      subjectiveStartBlock: segment.subjectiveExtraction?.startBlockIndex ?? null,
      subjectiveEndBlock: segment.subjectiveExtraction?.endBlockIndex ?? null,
      subjectiveLength: segment.sections.subjetivo.length
    });
    return segment;
  }

  export function segmentClinicalNotes({
    blocks = [],
    fullText = "",
    manualMultipleNotes = false,
    multipleNotesMode,
    proposedBoundaries = [],
    documentId = "doc"
  } = {}) {
    const mode = ["auto", "single", "multiple"].includes(multipleNotesMode)
      ? multipleNotesMode
      : manualMultipleNotes === true ? "multiple" : "auto";
    const detectedBoundaries = proposedBoundaries.length
      ? proposedBoundaries
      : detectMultipleClinicalNotes({ blocks, fullText }).proposedNoteBoundaries;
    let boundaries = mode === "single"
      ? []
      : [...new Set(detectedBoundaries
          .map((item) => Number(item.blockIndex ?? item))
          .filter((value) => Number.isInteger(value) && value >= 0))]
          .sort((a, b) => a - b);

    const firstTitleBlock = blocks.find((block) => noteTitle(blockText(block)));
    const firstTitleBlockIndex = firstTitleBlock
      ? blockIndex(firstTitleBlock, blocks.indexOf(firstTitleBlock))
      : null;
    if (Number.isInteger(firstTitleBlockIndex) && boundaries[0] === firstTitleBlockIndex) {
      boundaries = boundaries.slice(1);
    }

    console.info(
      "[patient-transfer] segmentation:boundaries",
      JSON.stringify({
        documentId,
        multipleNotesMode: mode,
        receivedBoundaries: proposedBoundaries,
        detectedBoundaries,
        boundariesUsed: boundaries,
        blockCount: blocks.length
      }, null, 2)
    );

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

    const nonEmptyGroups = groups.filter((group) => group.length);
    console.info(
      "[patient-transfer] segmentation:completed",
      JSON.stringify({
        documentId,
        multipleNotesMode: mode,
        segmentCount: nonEmptyGroups.length,
        segmentSizes: nonEmptyGroups.map((group) => group.length),
        segmentStarts: nonEmptyGroups.map((group, index) => blockIndex(group[0], index))
      }, null, 2)
    );

    return nonEmptyGroups.map((group, index) => createSegment(documentId, group, index));
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
        sourceNoteDate: segment.date || "",
        sourceNoteTime: segment.time || "",
        sourceNoteType: segment.noteType || "",
        metadata: {
          ...(document.metadata || {}),
          ...(segment.metadata || {}),
          documentDate: segment.date || document.metadata?.documentDate || "",
          documentHour: segment.time || document.metadata?.documentHour || ""
        },
        confirmedType: segment.confirmedType,
        diagnosisCandidates: segment.diagnosisCandidates,
        treatmentCandidates: segment.treatmentCandidates,
        treatmentPlanCandidates: segment.treatmentPlanCandidates,
        vitalSignsCandidates: segment.vitalSignsCandidates,
        sourceDocumentIndex: index,
        sourceNoteSegmentId: segment.id
      }));
    });
  }
