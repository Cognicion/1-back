import { construirIndiceIncremental } from "./textPatternIndexer.js";
import { construirFrecuencias } from "./frequencyCounter.js";
import { renderizarPatrones } from "./patternRenderer.js";

let estado = { filas: [], totalNotas: 0 };
function filtros() { return { busqueda: document.getElementById("filtroPatronBusqueda")?.value, medico: document.getElementById("filtroPatronMedico")?.value, paciente: document.getElementById("filtroPatronPaciente")?.value, institucion: document.getElementById("filtroPatronInstitucion")?.value, servicio: document.getElementById("filtroPatronServicio")?.value, desde: document.getElementById("filtroPatronDesde")?.value, hasta: document.getElementById("filtroPatronHasta")?.value }; }
function pintar() { renderizarPatrones({ ...estado, filtros: filtros() }); }
export async function iniciarDescubrimientoPatrones() {
  const estadoEl = document.getElementById("estadoPatronesTexto");
  const cargar = async () => { estadoEl.textContent = "Leyendo notas clínicas en modo lectura…"; const indice = await construirIndiceIncremental({ onProgress: (p) => { estadoEl.textContent = `Procesadas ${p.procesadas} notas · cambios indexados ${p.modificadas}`; } }); estado = { filas: construirFrecuencias(Object.values(indice.notas)), totalNotas: indice.totalNotas || 0 }; estadoEl.textContent = `Índice actualizado: ${estado.totalNotas} notas · ${estado.filas.length} patrones`; pintar(); };
  ["filtroPatronBusqueda", "filtroPatronMedico", "filtroPatronPaciente", "filtroPatronInstitucion", "filtroPatronServicio", "filtroPatronDesde", "filtroPatronHasta"].forEach((id) => document.getElementById(id)?.addEventListener("input", pintar));
  document.getElementById("btnActualizarPatronesTexto")?.addEventListener("click", cargar);
  await cargar();
}
