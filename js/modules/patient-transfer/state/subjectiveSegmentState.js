function segmentIdentity(segment = {}) {
  return [
    segment.id || "",
    segment.date || segment.metadata?.documentDate || "",
    segment.time || segment.metadata?.documentHour || "",
    segment.startBlockIndex ?? "",
    segment.endBlockIndex ?? ""
  ].join("|");
}

export function assignParsedSubjective(segment = {}, parsedSubjective = {}) {
  const text = String(parsedSubjective.text || "");
  return {
    ...segment,
    sections: {
      ...(segment.sections || {}),
      subjetivo: text
    },
    subjectiveExtraction: { ...parsedSubjective },
    autoSubjectiveText: text,
    subjectiveManuallyEdited: false
  };
}

export function updateSubjectiveSegmentValue(segments = [], noteId = "", value = "") {
  return segments.map((segment) => {
    if (segment.id !== noteId) return segment;
    const text = String(value ?? "");
    return {
      ...segment,
      sections: {
        ...(segment.sections || {}),
        subjetivo: text
      },
      subjectiveManuallyEdited: text !== String(segment.autoSubjectiveText ?? segment.sections?.subjetivo ?? "")
    };
  });
}

export function preserveManualSubjectiveEdits(nextSegments = [], previousSegments = []) {
  const previousById = new Map(previousSegments.map((segment) => [segment.id, segment]));
  const previousByIdentity = new Map(previousSegments.map((segment) => [segmentIdentity(segment), segment]));
  return nextSegments.map((segment) => {
    const sameId = previousById.get(segment.id);
    const previous = sameId && segmentIdentity(sameId) === segmentIdentity(segment)
      ? sameId
      : previousByIdentity.get(segmentIdentity(segment));
    if (!previous?.subjectiveManuallyEdited) return segment;
    return {
      ...segment,
      sections: {
        ...(segment.sections || {}),
        subjetivo: String(previous.sections?.subjetivo || "")
      },
      subjectiveManuallyEdited: true
    };
  });
}
