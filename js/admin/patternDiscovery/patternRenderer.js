import { cumpleFiltros } from "./filters.js";
import { estadisticasFrecuencia } from "./statisticsBuilder.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
const fecha = (v) => v ? new Date(v).toLocaleDateString("es-MX") : "—";

export function renderizarPatrones({ filas, totalNotas, filtros }) {
  const tabla = document.getElementById("tablaPatronesTexto");
  const detalle = document.getElementById("detallePatronTexto");
  const visibles = estadisticasFrecuencia(filas.filter((f) => cumpleFiltros(f, filtros)), totalNotas).slice(0, 300);
  tabla.innerHTML = visibles.length ? visibles.map((f, i) => `<tr><td><button class="enlace-patron" data-patron="${i}">${esc(f.clave)}</button><small>${esc(f.tipo)}</small></td><td>${f.frecuencia}</td><td>${f.pacientes}</td><td>${f.medicos}</td><td>${f.notas}</td><td>${fecha(f.ultimaAparicion)}</td></tr>`).join("") : `<tr><td colspan="6">No hay patrones para los filtros actuales.</td></tr>`;
  tabla.querySelectorAll("[data-patron]").forEach((b) => b.addEventListener("click", () => {
    const f = visibles[Number(b.dataset.patron)];
    detalle.hidden = false;
    detalle.innerHTML = `<h3>${esc(f.clave)}</h3><p><strong>Frecuencia relativa:</strong> ${(f.frecuenciaRelativa * 100).toFixed(2)}% · <strong>Primer uso:</strong> ${fecha(f.primeraAparicion)} · <strong>Último uso:</strong> ${fecha(f.ultimaAparicion)}</p><h4>Ejemplos anonimizados</h4>${f.ejemplos.map((e) => `<blockquote>${esc(e.texto)}<small>Contexto: ${esc(e.contexto)}</small></blockquote>`).join("")}<p><strong>Por diagnóstico:</strong> ${esc(Object.entries(f.porDiagnostico).map(([k,v]) => `${k}: ${v}`).join(" · "))}</p><p><strong>Por año:</strong> ${esc(Object.entries(f.porAnio).map(([k,v]) => `${k}: ${v}`).join(" · "))}</p>`;
  }));
}
