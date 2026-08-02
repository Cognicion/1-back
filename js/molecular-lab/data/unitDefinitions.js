/** Unidades internas únicas del laboratorio. Las funciones son puras y estrictas. */
export const UNIT_SYSTEM = Object.freeze({
  distance: "nm", mass: "Da", energy: "kJ/mol", time: "ps", charge: "e", angle: "rad", temperature: "K"
});

const FACTORS = Object.freeze({ pmToNm: 0.001, angstromToNm: 0.1, kcalMolToKJMol: 4.184 });
const assertFiniteNumber = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} debe ser un número finito`);
};
export const pmToNm = value => { assertFiniteNumber(value, "pm"); return value * FACTORS.pmToNm; };
export const angstromToNm = value => { assertFiniteNumber(value, "Å"); return value * FACTORS.angstromToNm; };
export const nmToPm = value => { assertFiniteNumber(value, "nm"); return value / FACTORS.pmToNm; };
export const nmToAngstrom = value => { assertFiniteNumber(value, "nm"); return value / FACTORS.angstromToNm; };
export const degreesToRadians = value => { assertFiniteNumber(value, "grados"); return value * Math.PI / 180; };
export const radiansToDegrees = value => { assertFiniteNumber(value, "radianes"); return value * 180 / Math.PI; };
export const kcalMolToKJMol = value => { assertFiniteNumber(value, "kcal/mol"); return value * FACTORS.kcalMolToKJMol; };
export const kJMolToKcalMol = value => { assertFiniteNumber(value, "kJ/mol"); return value / FACTORS.kcalMolToKJMol; };
export const assertFinite = assertFiniteNumber;
