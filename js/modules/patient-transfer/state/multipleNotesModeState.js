export const MULTIPLE_NOTES_MODES = Object.freeze({
  AUTO: "auto",
  SINGLE: "single",
  MULTIPLE: "multiple"
});

export function normalizeMultipleNotesMode(value = "auto") {
  return Object.values(MULTIPLE_NOTES_MODES).includes(value)
    ? value
    : MULTIPLE_NOTES_MODES.AUTO;
}

export function initializeFileMultipleNotesMode(fileCandidate = {}) {
  const multipleNotesMode = normalizeMultipleNotesMode(fileCandidate.multipleNotesMode);
  return {
    ...fileCandidate,
    multipleNotesMode,
    containsMultipleNotes: multipleNotesMode === MULTIPLE_NOTES_MODES.MULTIPLE
  };
}

export function updateFileMultipleNotesMode(files = [], documentId = "", value = "auto") {
  const multipleNotesMode = normalizeMultipleNotesMode(value);
  return files.map((item) => item.id === documentId
    ? {
        ...item,
        multipleNotesMode,
        containsMultipleNotes: multipleNotesMode === MULTIPLE_NOTES_MODES.MULTIPLE
      }
    : item);
}
