/**
 * Contratos documentales de la Fase 1.
 * Son JSDoc y validadores no invasivos: la forma persistida existente no cambia.
 */

/** @typedef {{pageIndex?: number|null, blockIndex?: number|null, startOffset?: number|null, endOffset?: number|null, sourceHeading?: string, rawEvidence?: string}} ClinicalEvidence */
/** @typedef {{value: string, rawText: string, normalizedText: string, sourceBlocks: Array, sourceSection: string, evidence: ClinicalEvidence, confidence: "high"|"medium"|"low"|"not-detected", requiresReview: boolean, parserName: string, parserVersion: string}} ClinicalParserResult */
/** @typedef {{id: string, startBlockIndex: number, endBlockIndex: number, rawText: string, date: string, time: string, sections: Object, diagnosisCandidates: Array, treatmentCandidates: Array}} ClinicalNoteSegment */
/** @typedef {{id?: string, patient?: Object, fields?: Object, noteSegments: Array, diagnosisCandidates?: Array, treatmentCandidates?: Array, vitalSignsCandidates?: Array}} DocumentCandidate */
/** @typedef {{id?: string, nombreCompleto?: string, nombres?: string, apellidoPaterno?: string, apellidoMaterno?: string, expediente?: string, fechaNacimiento?: string}} PatientCandidate */
/** @typedef {{id: string, diagnosisName: string, code: string|null, system: string, status: string, sourceSection: string, evidence: ClinicalEvidence, requiresReview: boolean}} DiagnosisCandidate */
/** @typedef {{id: string, medicationName: string, strengthValue?: number|null, strengthUnit?: string, route?: string, frequency?: string, schedule?: Array, action?: string, sourceSection?: string, evidence?: ClinicalEvidence}} MedicationCandidate */
/** @typedef {{id?: string, date?: string, time?: string, bloodPressure?: string, temperature?: string, heartRate?: string, respiratoryRate?: string, oxygenSaturation?: string}} VitalSignsCandidate */
/** @typedef {{patientId: string, score: number, level: string, matchedFields: Array, conflictingFields: Array}} DuplicatePatientMatch */
/** @typedef {{success: boolean, operationId: string, patientId?: string, notesCreated: number, diagnosesCreated?: number, treatmentsCreated?: number, errors: Array}} TransferPersistenceResult */

export const CONFIDENCE_LEVELS = Object.freeze(["high", "medium", "low", "not-detected"]);

export function isConfidence(value = "") {
  return CONFIDENCE_LEVELS.includes(value);
}

export function assertArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} debe ser un arreglo.`);
  return true;
}

export function assertClinicalParserResult(result = {}) {
  if (typeof result.value !== "string") throw new TypeError("ClinicalParserResult.value debe ser texto.");
  if (!isConfidence(result.confidence)) throw new TypeError("ClinicalParserResult.confidence no es válido.");
  if (!Array.isArray(result.sourceBlocks)) throw new TypeError("ClinicalParserResult.sourceBlocks debe ser arreglo.");
  if (typeof result.requiresReview !== "boolean") throw new TypeError("ClinicalParserResult.requiresReview debe ser booleano.");
  return true;
}

export function assertIndependentNoteSegments(segments = []) {
  assertArray(segments, "noteSegments");
  const sections = new Set(segments.map((segment) => segment.sections));
  const blocks = new Set(segments.map((segment) => segment.blocks));
  if (sections.size !== segments.length || blocks.size !== segments.length) throw new Error("Los segmentos comparten referencias mutables.");
  return true;
}
