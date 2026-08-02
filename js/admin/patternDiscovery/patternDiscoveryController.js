import { obtenerFunctions } from "../../firebase.js";
import { renderizarPatrones } from "./patternRenderer.js";
import { PATTERN_CONFIG } from "./patternConfig.js";
import { exportarPatronesCsv, exportarPatronesExcel } from "./patternExporters.js";

function asegurarAdmin({ authUser, userRole } = {}) { if (!authUser || String(userRole || "").toLowerCase() !== "admin") throw new Error("PATTERN_DISCOVERY_FORBIDDEN"); }
function obtenerFiltros() { return { busqueda: document.getElementById("filtroPatronBusqueda")?.value || "", medico: document.getElementById("filtroPatronMedico")?.value || "", paciente: document.getElementById("filtroPatronPaciente")?.value || "", institucion: document.getElementById("filtroPatronInstitucion")?.value || "", servicio: document.getElementById("filtroPatronServicio")?.value || "", desde: document.getElementById("filtroPatronDesde")?.value || "", hasta: document.getElementById("filtroPatronHasta")?.value || "" }; }
function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }

export async function inicializarMotorDescubrimientoPatrones(contexto) {
  asegurarAdmin(contexto);
  let destruido = false; let callablePromise = null; let resultados = [];
  const listeners = [];
  const pintar = () => renderizarPatrones({ filas: resultados, filtros: obtenerFiltros() });
  const setError = (etapa, error) => { console.error(`[PATTERNS] ${etapa}`, error?.stack || error); setText("estadoPatronesTexto", `Error durante ${etapa}: ${error?.message || "error desconocido"}`); };
  const analizar = async () => {
    asegurarAdmin(contexto); if (destruido) return;
    const inicio = performance.now(); const boton = document.getElementById("btnAnalizarPatronesTexto");
    boton && (boton.disabled = true); setText("estadoPatronesTexto", "Analizando textos por lotes…"); setText("tiempoPatronesTexto", "en curso");
    try {
      if (!callablePromise) { const [functions, { httpsCallable }] = await Promise.all([obtenerFunctions(), import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")]); callablePromise = httpsCallable(functions, "discoverTextPatterns", { timeout: 120000 }); }
      const respuesta = await callablePromise({ filtros: obtenerFiltros(), threshold: PATTERN_CONFIG.minimumOccurrences, batchSize: PATTERN_CONFIG.batchSize, pageSize: PATTERN_CONFIG.pageSize });
      if (destruido) return;
      resultados = Array.isArray(respuesta.data?.patterns) ? respuesta.data.patterns : [];
      const stats = respuesta.data?.stats || {};
      setText("documentosPatronesTexto", stats.documentsProcessed || 0); setText("lotesPatronesTexto", stats.batchesProcessed || 0); setText("candidatasPatronesTexto", stats.temporaryCandidates || 0); setText("confirmadosPatronesTexto", resultados.length); setText("tiempoPatronesTexto", `${Math.round(performance.now() - inicio)} ms`); setText("estadoPatronesTexto", `Análisis terminado: ${resultados.length} patrones confirmados.`); pintar();
      document.getElementById("btnExportarPatronesExcel")?.removeAttribute("disabled"); document.getElementById("btnExportarPatronesCsv")?.removeAttribute("disabled");
    } catch (error) { setError("lectura", error); setText("tiempoPatronesTexto", `${Math.round(performance.now() - inicio)} ms`); } finally { boton && (boton.disabled = false); }
  };
  const limpiar = () => { resultados = []; renderizarPatrones({ filas: [], filtros: {} }); ["documentosPatronesTexto", "lotesPatronesTexto", "candidatasPatronesTexto", "confirmadosPatronesTexto"].forEach((id) => setText(id, "0")); setText("tiempoPatronesTexto", "0 ms"); setText("estadoPatronesTexto", "Resultados temporales eliminados. No se han leído textos clínicos."); document.getElementById("btnExportarPatronesExcel")?.setAttribute("disabled", ""); document.getElementById("btnExportarPatronesCsv")?.setAttribute("disabled", ""); };
  const analizarButton = document.getElementById("btnAnalizarPatronesTexto"); const excelButton = document.getElementById("btnExportarPatronesExcel"); const csvButton = document.getElementById("btnExportarPatronesCsv"); const limpiarButton = document.getElementById("btnLimpiarPatronesTexto");
  analizarButton?.addEventListener("click", analizar); excelButton?.addEventListener("click", () => { try { exportarPatronesExcel(resultados); } catch (error) { setError("exportación", error); } }); csvButton?.addEventListener("click", () => { try { exportarPatronesCsv(resultados); } catch (error) { setError("exportación", error); } }); limpiarButton?.addEventListener("click", limpiar);
  [analizarButton, excelButton, csvButton, limpiarButton].forEach((element, index) => { if (!element) return; const handlers = [analizar, () => exportarPatronesExcel(resultados), () => exportarPatronesCsv(resultados), limpiar]; listeners.push(() => element.removeEventListener("click", handlers[index])); });
  ["filtroPatronBusqueda", "filtroPatronMedico", "filtroPatronPaciente", "filtroPatronInstitucion", "filtroPatronServicio", "filtroPatronDesde", "filtroPatronHasta"].forEach((id) => { const element = document.getElementById(id); if (!element) return; element.addEventListener("input", pintar); listeners.push(() => element.removeEventListener("input", pintar)); });
  console.log("[PATTERNS] Interfaz inicializada; análisis detenido hasta clic explícito");
  return { destruirMotorDescubrimientoPatrones() { if (destruido) return; destruido = true; listeners.splice(0).forEach((remove) => remove()); resultados = []; callablePromise = null; console.log("[PATTERNS] Resultados temporales liberados"); } };
}
