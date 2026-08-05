import { ClinicalMetadata } from "./ClinicalMetadata.js";
import { ClinicalSection } from "./ClinicalSection.js";

export class ClinicalNote {
  constructor({ id = "", metadata = {}, rawText = "", sections = [], candidates = [], evidence = [] } = {}) {
    this.id = id;
    this.metadata = metadata instanceof ClinicalMetadata ? metadata : new ClinicalMetadata({ ...metadata, noteId: id });
    this.rawText = rawText;
    this.sections = sections.map((section) => section instanceof ClinicalSection ? section : new ClinicalSection(section));
    this.candidates = [...candidates];
    this.evidence = [...evidence];
  }
}
