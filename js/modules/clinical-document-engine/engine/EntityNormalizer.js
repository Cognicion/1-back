import { normalizeClinicalComparisonText } from "../normalizers/textNormalizer.js";
import { normalizeDiagnosticCode } from "../normalizers/diagnosisNormalizer.js";
import { normalizeMedicationName } from "../normalizers/medicationNormalizer.js";
import { clinicalImportLogger } from "../utils/logger.js";

export class EntityNormalizer {
  normalize(entity) {
    const value = entity.value || {};
    if (entity.entityType === "diagnosis") entity.normalizedValue = normalizeClinicalComparisonText(value.normalizedDiagnosis || value.diagnosisName || entity.normalizedValue || "");
    else if (entity.entityType === "medication") entity.normalizedValue = normalizeMedicationName(value.normalizedMedicationName || value.medicationName || entity.normalizedValue || "");
    else if (entity.entityType === "vitalSign") {
      if (value.vitalType === "bloodPressure") value.value = { systolic: Number(value.value?.systolic), diastolic: Number(value.value?.diastolic) };
      else if (value.value !== "" && value.value != null) value.value = Number(value.value);
      entity.normalizedValue = `${value.vitalType || "vitalSign"}:${JSON.stringify(value.value)}`;
    }
    else if (typeof value === "string") entity.normalizedValue = normalizeClinicalComparisonText(value);
    else if (!entity.normalizedValue) entity.normalizedValue = normalizeClinicalComparisonText(JSON.stringify(value));
    if (value.code) value.code = normalizeDiagnosticCode(value.code);
    entity.metadata = { ...entity.metadata, normalizedBy: "EntityNormalizer" };
    clinicalImportLogger.info("entity:normalize", JSON.stringify({ entityId: entity.id, entityType: entity.entityType }));
    entity.touch("normalize");
    return entity;
  }
}
