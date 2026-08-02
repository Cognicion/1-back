import { adaptarResultadoBusquedaPatrones, filtrarResultadosBusquedaPatrones } from "../../core/clinical-analysis-engine/adapters/patternSearchAdapter.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const fecha = (value) => value ? new Date(value).toLocaleDateString("es-MX") : "—";

export function renderizarPatrones({ filas = [], filtros = {}, threshold = 3, includeConnectors = false, includePrepositions = false }) {
  const tabla = document.getElementById("tablaPatronesTexto");
  if (!tabla) return;
  const query = String(filtros.busqueda || "").toLowerCase();
  const visibles = filtrarResultadosBusquedaPatrones(filas, { threshold, includeConnectors }).map((fila) => adaptarResultadoBusquedaPatrones(fila, { removeConnectors: !includeConnectors, removePrepositions: !includePrepositions })).filter((fila) => !query || `${fila.displayPhrase || fila.phrase} ${fila.normalizedPhrase} ${fila.lexicalSignature}`.toLowerCase().includes(query)).slice(0, 50);
  tabla.innerHTML = visibles.length ? visibles.map((fila) => `<tr><td>${esc(fila.displayPhrase || fila.phrase)}</td><td>${esc(fila.normalizedPhrase)}</td><td>${esc(fila.lexicalSignature)}</td><td>${fila.frequency}</td><td>${fila.noteCount}</td><td>${fila.patientCount}</td><td>${fila.physicianCount}</td><td>${fila.firstSeenAt ? fecha(fila.firstSeenAt) : "—"}</td><td>${fila.lastSeenAt ? fecha(fila.lastSeenAt) : "—"}</td><td>${fila.tokenCount}</td></tr>`).join("") : `<tr><td colspan="10">No hay patrones confirmados para los filtros actuales.</td></tr>`;
}
