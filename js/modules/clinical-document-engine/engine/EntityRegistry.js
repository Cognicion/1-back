export class EntityRegistry {
  constructor() { this.entities = new Map(); }
  register(entity) { this.entities.set(entity.id, entity); return entity; }
  get(id) { return this.entities.get(id) || null; }
  remove(id) { return this.entities.delete(id); }
  list(entityType = "") { return [...this.entities.values()].filter((entity) => !entityType || entity.entityType === entityType); }
  clear() { this.entities.clear(); }
}
