import { ClinicalRelationship } from "../entities/ClinicalRelationship.js";
import { clinicalImportLogger } from "../utils/logger.js";

export class EntityRelationshipEngine {
  create({ from, to, type, confidence = "UNKNOWN", evidence = [], metadata = {} } = {}) {
    return new ClinicalRelationship({ fromId: from.id, fromType: from.entityType, toId: to.id, toType: to.entityType, type, confidence, evidence, metadata });
  }
  attach({ from, to, type, confidence, evidence, metadata } = {}) {
    const relationship = this.create({ from, to, type, confidence, evidence, metadata });
    from.addRelationship(relationship);
    clinicalImportLogger.info("entity:relationship", JSON.stringify({ relationshipId: relationship.id, type }));
    return relationship;
  }
  find(entity, type = "") { return (entity.relationships || []).filter((relationship) => !type || relationship.type === type); }
}
