import { validateDiagnosis } from "../validators/diagnosisValidator.js";
import { validateMedication } from "../validators/medicationValidator.js";
import { validateVitalSign } from "../validators/vitalSignValidator.js";
import { validateTreatmentPlanInstruction } from "../validators/treatmentPlanValidator.js";
import { clinicalImportLogger } from "../utils/logger.js";

export class EntityValidationEngine {
  constructor(validators = {}) { this.validators = { diagnosis: validateDiagnosis, medication: validateMedication, vitalSign: validateVitalSign, treatmentPlanInstruction: validateTreatmentPlanInstruction, ...validators }; }
  validate(entity) {
    const validator = this.validators[entity.entityType];
    if (!validator) return { valid: true, errors: [] };
    const result = validator({ ...(entity.value || {}), id: entity.id, entityType: entity.entityType });
    entity.metadata = { ...entity.metadata, validation: result };
    clinicalImportLogger.info("entity:validate", JSON.stringify({ entityId: entity.id, entityType: entity.entityType, valid: result.valid }));
    return result;
  }
}
