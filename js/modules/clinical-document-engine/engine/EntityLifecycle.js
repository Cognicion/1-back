export class EntityLifecycle {
  constructor({ normalizer, validator, history } = {}) { this.normalizer = normalizer; this.validator = validator; this.history = history; }
  create(entity) { this.normalizer?.normalize(entity); const validation = this.validator?.validate(entity) || { valid: true, errors: [] }; this.history?.record("create", entity.id, { validation }); return { entity, validation }; }
  update(entity, patch = {}) { Object.assign(entity.value || {}, patch); entity.touch("update"); this.history?.record("change", entity.id, { patch }); return entity; }
}
