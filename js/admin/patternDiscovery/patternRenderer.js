import { buildLexicalSignature } from "./language/lexicalSignature.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const fecha = (value) => value ? new Date(value).toLocaleDateString("es-MX") : "—";

export function filterPatterns(patterns = [], { threshold = 3, includeConnectors = false, includePrepositions = false } = {}) {
  const minimo = Number.isInteger(threshold) ? threshold : 3;
  return patterns.filter((pattern) => {
    const meetsThreshold = Number(pattern.frequency ?? pattern.occurrenceCount ?? 0) >= minimo;
    const passesConnectorFilter = includeConnectors || pattern.isFunctionWordPattern !== true;
    return meetsThreshold && passesConnectorFilter;
  });
}

export function renderizarPatrones({ filas = [], filtros = {}, threshold = 3, includeConnectors = false, includePrepositions = false }) {
  const tabla = document.getElementById("tablaPatronesTexto");
  if (!tabla) return;
  const query = String(filtros.busqueda || "").toLowerCase();
  const visibles = filterPatterns(filas, { threshold, includeConnectors, includePrepositions }).filter((fila) => !query || `${fila.displayPhrase || fila.phrase} ${fila.normalizedPhrase} ${buildLexicalSignature(fila.normalizedPhrase || fila.phrase, { removeConnectors: !includeConnectors, removePrepositions: !includePrepositions })}`.toLowerCase().includes(query)).slice(0, 50).map((fila) => ({ ...fila, lexicalSignature: buildLexicalSignature(fila.normalizedPhrase || fila.phrase, { removeConnectors: !includeConnectors, removePrepositions: !includePrepositions }) }));
  tabla.innerHTML = visibles.length ? visibles.map((fila) => `<tr><td>${esc(fila.displayPhrase || fila.phrase)}</td><td>${esc(fila.normalizedPhrase)}</td><td>${esc(fila.lexicalSignature)}</td><td>${fila.frequency}</td><td>${fila.noteCount}</td><td>${fila.patientCount}</td><td>${fila.physicianCount}</td><td>${fila.firstSeenAt ? fecha(fila.firstSeenAt) : "—"}</td><td>${fila.lastSeenAt ? fecha(fila.lastSeenAt) : "—"}</td><td>${fila.tokenCount}</td></tr>`).join("") : `<tr><td colspan="10">No hay patrones confirmados para los filtros actuales.</td></tr>`;
}
