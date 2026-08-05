import { EntityMatcher } from "./EntityMatcher.js";

export class EntityDeduplicator {
  constructor(matcher = new EntityMatcher()) { this.matcher = matcher; }
  deduplicate(entities = []) {
    const result = [];
    const duplicates = [];
    entities.forEach((entity) => {
      const existing = result.find((candidate) => this.matcher.match(candidate, entity).matched);
      if (existing) duplicates.push({ entity, existing, match: this.matcher.match(existing, entity) });
      else result.push(entity);
    });
    return { entities: result, duplicates };
  }
}
