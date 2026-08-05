import { ClinicalMetadata } from "./ClinicalMetadata.js";
import { ClinicalNote } from "./ClinicalNote.js";

export class ClinicalDocument {
  constructor({ id = "", rawText = "", blocks = [], metadata = {}, notes = [], evidence = [] } = {}) {
    this.id = id;
    this.rawText = rawText;
    this.blocks = [...blocks];
    this.metadata = metadata instanceof ClinicalMetadata ? metadata : new ClinicalMetadata({ ...metadata, documentId: id });
    this.notes = notes.map((note) => note instanceof ClinicalNote ? note : new ClinicalNote(note));
    this.evidence = [...evidence];
  }
}
