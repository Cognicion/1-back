import { distance } from "./vector3.js";
import { MINIMUM_INTERATOMIC_DISTANCE_NM } from "../data/physicalConstants.js";
export function calculateInteratomicDistance(atomA, atomB) {
  const warnings = [], errors = []; let value = null;
  try { value = distance(atomA.position_nm, atomB.position_nm); } catch (error) { errors.push(error.message); }
  const valid = errors.length === 0; const overlapDetected = valid && value < MINIMUM_INTERATOMIC_DISTANCE_NM;
  if (overlapDetected) warnings.push(`Solapamiento o distancia menor que ${MINIMUM_INTERATOMIC_DISTANCE_NM} nm`);
  return { value, unit: "nm", valid, overlapDetected, warnings, errors };
}
