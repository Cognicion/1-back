/** Constantes usadas en Fase 2. Fuentes: IUPAC Gold Book / NIST, revisiones indicadas. */
export const PHYSICAL_CONSTANTS = Object.freeze({
  pmToNm: Object.freeze({ value: 0.001, unit: "nm/pm", symbol: "10⁻³", source: "SI decimal prefix", revision: "2022" }),
  angstromToNm: Object.freeze({ value: 0.1, unit: "nm/Å", symbol: "Å", source: "IUPAC Gold Book", revision: "2022" }),
  kcalMolToKJMol: Object.freeze({ value: 4.184, unit: "kJ mol⁻¹ kcal⁻¹ mol", symbol: "4.184", source: "IUPAC Gold Book", revision: "2022" }),
  MINIMUM_INTERATOMIC_DISTANCE_NM: Object.freeze({ value: 0.025, unit: "nm", symbol: "r_min", source: "Aproximación numérica del laboratorio; no radio nuclear", revision: "phase-2" }),
  BOND_DISTANCE_LOWER_FACTOR: Object.freeze({ value: 0.72, unit: "1", symbol: "α", source: "Aproximación educativa configurable", revision: "phase-2" }),
  BOND_DISTANCE_UPPER_FACTOR: Object.freeze({ value: 1.28, unit: "1", symbol: "β", source: "Aproximación educativa configurable", revision: "phase-2" }),
  BOND_DISTANCE_SIGMA_FACTOR: Object.freeze({ value: 0.12, unit: "1", symbol: "σ/r₀", source: "Aproximación educativa configurable", revision: "phase-2" })
});
export const MINIMUM_INTERATOMIC_DISTANCE_NM = PHYSICAL_CONSTANTS.MINIMUM_INTERATOMIC_DISTANCE_NM.value;
export const BOND_DISTANCE_LOWER_FACTOR = PHYSICAL_CONSTANTS.BOND_DISTANCE_LOWER_FACTOR.value;
export const BOND_DISTANCE_UPPER_FACTOR = PHYSICAL_CONSTANTS.BOND_DISTANCE_UPPER_FACTOR.value;
export const BOND_DISTANCE_SIGMA_FACTOR = PHYSICAL_CONSTANTS.BOND_DISTANCE_SIGMA_FACTOR.value;
export const DEFAULT_NUMERICAL_GRADIENT_STEP_NM = 0.00001;
export const PHASE3_CONSTANTS = Object.freeze({
  DEFAULT_NUMERICAL_GRADIENT_STEP_NM: Object.freeze({ value: DEFAULT_NUMERICAL_GRADIENT_STEP_NM, unit: "nm", symbol: "h", source: "Central-difference educational setting", revision: "phase-3" })
});
