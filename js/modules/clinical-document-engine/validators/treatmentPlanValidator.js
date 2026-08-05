const TYPES = new Set([
  "diet", "nursingCare", "monitoring", "suicideRiskPrecautions", "selfHarmPrecautions", "fallRisk", "allergies", "medications", "laboratoryOrders", "imagingOrders", "consultations", "procedures", "activity", "hydration", "isolation", "restraints", "psychotherapy", "psychoeducation", "dischargePlanning", "followUp", "otherInstruction"
]);
const PRIORITIES = new Set(["urgent", "immediate", "continuous", "perShift", "daily", "asNeeded", "discharge", ""]);

export function validateTreatmentPlanInstruction(value = {}) {
  const errors = [];
  if (!String(value.text || value.value || "").trim()) errors.push("empty-instruction");
  if (!TYPES.has(value.instructionType)) errors.push("unknown-instruction-type");
  if (!PRIORITIES.has(value.priority || "")) errors.push("invalid-priority");
  if (value.instructionType === "medications" && value.medicationCandidates && !Array.isArray(value.medicationCandidates)) errors.push("invalid-medication-candidates");
  if (value.instructionType === "laboratoryOrders" && !String(value.value || value.text || "").trim()) errors.push("laboratory-without-study");
  if (["suicideRiskPrecautions", "selfHarmPrecautions", "fallRisk"].includes(value.instructionType) && !String(value.value || value.text || "").trim()) errors.push("risk-without-value");
  return { valid: errors.length === 0, errors };
}

export function validateTreatmentPlanCandidates(values = []) {
  const results = values.map(validateTreatmentPlanInstruction);
  const orders = values.map((value) => value.order).filter((order) => order != null);
  const duplicatedOrder = orders.find((order, index) => orders.indexOf(order) !== index);
  if (duplicatedOrder != null) results.push({ valid: false, errors: [`duplicated-order:${duplicatedOrder}`] });
  return { valid: results.every((result) => result.valid), errors: results.flatMap((result) => result.errors) };
}
