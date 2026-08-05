export class ClinicalHistory {
  constructor(entries = []) { this.entries = [...entries]; }
  record(type, entityId, details = {}) {
    this.entries.push({ id: `${entityId}-${this.entries.length + 1}`, type, entityId, details: { ...details }, at: new Date().toISOString() });
    return this.entries.at(-1);
  }
  list(entityId = "") { return entityId ? this.entries.filter((entry) => entry.entityId === entityId) : [...this.entries]; }
}
