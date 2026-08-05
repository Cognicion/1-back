import { ClinicalHistory } from "../entities/ClinicalHistory.js";
import { EntityFactory } from "./EntityFactory.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { EntityNormalizer } from "./EntityNormalizer.js";
import { EntityValidationEngine } from "./EntityValidationEngine.js";
import { EntityRelationshipEngine } from "./EntityRelationshipEngine.js";
import { EntityMatcher } from "./EntityMatcher.js";
import { EntityDeduplicator } from "./EntityDeduplicator.js";
import { EntityLifecycle } from "./EntityLifecycle.js";
import { clinicalImportLogger } from "../utils/logger.js";

export class ClinicalEntityEngine {
  constructor({ registry = new EntityRegistry(), normalizer = new EntityNormalizer(), validator = new EntityValidationEngine(), history = new ClinicalHistory() } = {}) {
    this.registry = registry;
    this.history = history;
    this.normalizer = normalizer;
    this.validator = validator;
    this.relationships = new EntityRelationshipEngine();
    this.matcher = new EntityMatcher();
    this.deduplicator = new EntityDeduplicator(this.matcher);
    this.lifecycle = new EntityLifecycle({ normalizer, validator, history });
  }
  create(candidate) {
    const entity = EntityFactory.fromCandidate(candidate);
    clinicalImportLogger.info("entity:create", JSON.stringify({ entityId: entity.id, entityType: entity.entityType }));
    const result = this.lifecycle.create(entity);
    this.registry.register(entity);
    clinicalImportLogger.info("entity:validate", JSON.stringify({ entityId: entity.id, valid: result.validation.valid }));
    return result;
  }
  createMany(candidates = []) { return candidates.map((candidate) => this.create(candidate)); }
  relate(args) { const relationship = this.relationships.attach(args); clinicalImportLogger.info("entity:relationship", JSON.stringify({ relationshipId: relationship.id, type: relationship.type })); return relationship; }
  deduplicate(entities = []) { const result = this.deduplicator.deduplicate(entities); clinicalImportLogger.info("entity:merge", JSON.stringify({ entityCount: entities.length, duplicateCount: result.duplicates.length })); return result; }
}
