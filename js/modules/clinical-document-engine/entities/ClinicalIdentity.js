import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeDiagnosticCode } from "../normalizers/diagnosisNormalizer.js";

export class ClinicalIdentity {
  constructor({ entityType = "", key = "", fields = {} } = {}) {
    this.entityType = entityType;
    this.key = key;
    this.fields = { ...fields };
  }

  static fromEntity(entity = {}) {
    const source = entity.value || {};
    const type = entity.entityType || "entity";
    if (type === "vitalSign") {
      const vitalKey = `${source.vitalType || "unknown"}:${JSON.stringify(source.value)}`;
      return new ClinicalIdentity({ entityType: type, key: `${type}:${vitalKey}`, fields: { vitalType: source.vitalType || "", value: source.value } });
    }
    const code = normalizeDiagnosticCode(source.code || entity.code || "");
    const name = normalizeClinicalComparisonText(source.normalizedDiagnosis || source.normalizedMedicationName || source.diagnosisName || source.medicationName || entity.normalizedValue || "");
    const key = code ? `${type}:code:${code}` : `${type}:name:${name}`;
    return new ClinicalIdentity({ entityType: type, key, fields: { code, name, status: source.status || entity.status || "" } });
  }
}
