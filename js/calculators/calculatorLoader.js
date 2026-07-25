import { CALCULATORS_BY_ID } from "./calculatorCatalog.js";
const loadedModules = new Map();
export function loadCalculatorModule(id) {
  if (loadedModules.has(id)) return loadedModules.get(id);
  const item = CALCULATORS_BY_ID.get(id);
  if (!item) return Promise.reject(new Error(`Calculadora no registrada: ${id}`));
  const promise = (item.id === "convencional" ? import("./modules/conventional.js") : import("./legacyCalculatorAdapter.js")).catch((error) => { loadedModules.delete(id); throw error; });
  loadedModules.set(id, promise);
  return promise;
}
export function clearCalculatorModuleCache() { loadedModules.clear(); }
