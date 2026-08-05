export class ClinicalRelationship {
  constructor({ id = "", type = "", fromId = "", fromType = "", toId = "", toType = "", confidence = "UNKNOWN", evidence = [], metadata = {} } = {}) {
    this.id = id || `${fromId}-${type}-${toId}`;
    this.type = type;
    this.fromId = fromId;
    this.fromType = fromType;
    this.toId = toId;
    this.toType = toType;
    this.confidence = confidence;
    this.evidence = [...(evidence || [])];
    this.metadata = { ...(metadata || {}) };
  }
}
