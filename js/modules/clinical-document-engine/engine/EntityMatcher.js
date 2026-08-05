import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeDiagnosticCode } from "../normalizers/diagnosisNormalizer.js";

export class EntityMatcher {
  match(left = {}, right = {}) {
    const a = left.value || left;
    const b = right.value || right;
    const fields = [];
    if (a.code && b.code && normalizeDiagnosticCode(a.code) === normalizeDiagnosticCode(b.code)) fields.push("code");
    const leftName = normalizeClinicalComparisonText(a.normalizedDiagnosis || a.normalizedMedicationName || a.diagnosisName || a.medicationName || left.normalizedValue || "");
    const rightName = normalizeClinicalComparisonText(b.normalizedDiagnosis || b.normalizedMedicationName || b.diagnosisName || b.medicationName || right.normalizedValue || "");
    if (leftName && leftName === rightName) fields.push("name");
    if (a.status && b.status && a.status === b.status) fields.push("status");
    const score = fields.includes("code") ? 100 : fields.includes("name") ? 80 : fields.length ? 20 : 0;
    return { matched: score > 0, score, level: score >= 100 ? "high" : score >= 80 ? "medium" : score ? "low" : "none", matchedFields: fields, conflictingFields: [] };
  }
}
