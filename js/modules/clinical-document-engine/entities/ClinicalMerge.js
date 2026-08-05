export class ClinicalMerge {
  static merge(primary, secondary, { history = null } = {}) {
    if (!primary) return secondary;
    if (!secondary) return primary;
    primary.evidence = [...(primary.evidence || []), ...(secondary.evidence || [])];
    primary.relationships = [...(primary.relationships || []), ...(secondary.relationships || [])];
    primary.metadata = { ...secondary.metadata, ...primary.metadata };
    primary.touch("merge");
    history?.record("merge", primary.id, { mergedEntityId: secondary.id });
    return primary;
  }
}
