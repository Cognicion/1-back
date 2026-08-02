import { pmToNm } from "./unitDefinitions.js";
const REQUIRED = ["id","atomicNumber","name","symbol","atomicMass_u","group","period","block","category","phaseAtSTP","electronConfiguration","valenceElectrons","commonValences","allowedCoordinationNumbers","commonOxidationStates","paulingElectronegativity","covalentRadiusSingle_pm","covalentRadiusDouble_pm","covalentRadiusTriple_pm","vanDerWaalsRadius_pm","defaultFormalCharge","visual","metadata"];
const clone = value => JSON.parse(JSON.stringify(value));
const freezeDeep = value => { if (value && typeof value === "object") { Object.values(value).forEach(freezeDeep); Object.freeze(value); } return value; };
export function validateElementCatalog(elements) {
  const ids = new Set(), atomicNumbers = new Set(), errors = [];
  elements.forEach((element, index) => {
    REQUIRED.forEach(key => { if (!(key in element)) errors.push(`Elemento ${index}: falta ${key}`); });
    if (ids.has(element.id)) errors.push(`ID duplicado: ${element.id}`); ids.add(element.id);
    if (atomicNumbers.has(element.atomicNumber)) errors.push(`Número atómico duplicado: ${element.atomicNumber}`); atomicNumbers.add(element.atomicNumber);
    if (!(element.atomicMass_u > 0)) errors.push(`${element.id}: masa no positiva`);
    if (!Number.isInteger(element.valenceElectrons)) errors.push(`${element.id}: electrones de valencia no enteros`);
    ["commonValences","allowedCoordinationNumbers","commonOxidationStates"].forEach(key => { const values = element[key]; if (new Set(values).size !== values.length) errors.push(`${element.id}: ${key} repetido`); });
    ["covalentRadiusSingle_pm","covalentRadiusDouble_pm","covalentRadiusTriple_pm","vanDerWaalsRadius_pm"].forEach(key => { if (element[key] !== null && !(element[key] > 0)) errors.push(`${element.id}: ${key} inválido`); });
  });
  return { valid: errors.length === 0, errors };
}
export function createElementRepository(elements) {
  const checked = validateElementCatalog(elements); if (!checked.valid) throw new Error(checked.errors.join("; "));
  const map = new Map(elements.map(element => [element.id, freezeDeep(clone(element))]));
  return Object.freeze({ get: id => map.get(id), has: id => map.has(id), all: () => [...map.values()], radiusNm: (id, order = 1) => { const e = map.get(id); if (!e) return null; const key = ["covalentRadiusSingle_pm","covalentRadiusDouble_pm","covalentRadiusTriple_pm"][order - 1]; return e[key] === null ? null : pmToNm(e[key]); } });
}
export async function loadElementRepository(baseUrl = new URL("./elements.json", import.meta.url)) { const response = await fetch(baseUrl); if (!response.ok) throw new Error(`No se pudo cargar el catálogo (${response.status})`); return createElementRepository(await response.json()); }
