import { ClinicalIdentity } from "./ClinicalIdentity.js";
import { ClinicalVersion } from "./ClinicalVersion.js";

export const ENTITY_TYPES = Object.freeze([
  "diagnosis", "medication", "vitalSign", "laboratory", "study", "patient",
  "treatment", "allergy", "scale", "clinicalEvent", "procedure", "consultation"
]);

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

/** Entidad clínica común, independiente de origen y persistencia. */
export class ClinicalEntity {
  constructor({ id = "", entityType = "", value = null, normalizedValue = "", status = "", confidence = "UNKNOWN", evidence = [], relationships = [], metadata = {}, identity = null, version = null, createdAt = null, updatedAt = null, parserVersion = "" } = {}) {
    const now = new Date().toISOString();
    this.id = id || `${entityType || "entity"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.entityType = entityType;
    this.value = copy(value);
    this.normalizedValue = normalizedValue;
    this.status = status;
    this.confidence = confidence;
    this.evidence = copy(evidence || []);
    this.relationships = copy(relationships || []);
    this.metadata = copy(metadata || {});
    this.createdAt = createdAt || now;
    this.updatedAt = updatedAt || now;
    this.version = version || new ClinicalVersion({ parserVersion });
    this.identity = identity ? copy(identity) : ClinicalIdentity.fromEntity(this);
    if (parserVersion && !this.version.parserVersion) this.version.parserVersion = parserVersion;
  }

  touch(change = "update") {
    this.updatedAt = new Date().toISOString();
    this.version = this.version.next(change);
    return this;
  }

  addRelationship(relationship) {
    this.relationships = [...this.relationships, copy(relationship)];
    return this.touch("relationship");
  }

  toJSON() { return copy(this); }
}
