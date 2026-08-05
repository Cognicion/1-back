export class ClinicalMetadata {
  constructor({ documentId = "", noteId = "", date = "", time = "", type = "", source = {} } = {}) {
    Object.assign(this, { documentId, noteId, date, time, type, source: { ...source } });
  }
}
