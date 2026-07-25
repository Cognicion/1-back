const MAX_RECENTS = 6;
function uidFrom(context = {}) { return context.uid || window.getCognicionCalculatorUid?.() || "sin_usuario"; }
function key(context) { return `cognicion:calculator-recents:${uidFrom(context)}`; }
export function readRecentCalculators(catalog, context) {
  try { const saved = JSON.parse(localStorage.getItem(key(context)) || "[]"); return saved.sort((a, b) => b.lastUsedAt - a.lastUsedAt).map((entry) => catalog.find((item) => item.id === entry.id)).filter(Boolean).slice(0, MAX_RECENTS); } catch { return []; }
}
export function registerRecentCalculator(id, context) {
  try { const current = JSON.parse(localStorage.getItem(key(context)) || "[]").filter((item) => item.id !== id); current.unshift({ id, lastUsedAt: Date.now() }); localStorage.setItem(key(context), JSON.stringify(current.slice(0, MAX_RECENTS))); } catch (error) { console.warn("No se pudo guardar el historial de calculadoras", error); }
}
