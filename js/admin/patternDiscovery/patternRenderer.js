const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const fecha = (value) => value ? new Date(value).toLocaleDateString("es-MX") : "—";

export function renderizarPatrones({ filas = [], filtros = {} }) {
  const tabla = document.getElementById("tablaPatronesTexto");
  if (!tabla) return;
  const query = String(filtros.busqueda || "").toLowerCase();
  const visibles = filas.filter((fila) => !query || `${fila.phrase} ${fila.normalizedPhrase}`.toLowerCase().includes(query)).slice(0, 50);
  tabla.innerHTML = visibles.length ? visibles.map((fila) => `<tr><td>${esc(fila.phrase)}</td><td>${esc(fila.normalizedPhrase)}</td><td>${fila.frequency}</td><td>${fila.noteCount}</td><td>${fila.patientCount}</td><td>${fila.physicianCount}</td><td>${fecha(fila.firstSeenAt)}</td><td>${fecha(fila.lastSeenAt)}</td><td>${fila.tokenCount}</td></tr>`).join("") : `<tr><td colspan="9">No hay patrones confirmados para los filtros actuales.</td></tr>`;
}
