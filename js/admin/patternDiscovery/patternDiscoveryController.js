import { obtenerFunctions } from "../../firebase.js";
import { filterPatterns, renderizarPatrones } from "./patternRenderer.js";
import { PATTERN_CONFIG } from "./patternConfig.js";
import { exportarPatronesCsv, exportarPatronesExcel } from "./patternExporters.js";
import { isFunctionWordPattern } from "./patternFunctionWords.js";

function asegurarAdmin({ authUser, userRole } = {}) { if (!authUser || String(userRole || "").toLowerCase() !== "admin") throw new Error("PATTERN_DISCOVERY_FORBIDDEN"); }
function obtenerFiltros() { return { busqueda: document.getElementById("filtroPatronBusqueda")?.value || "", medico: document.getElementById("filtroPatronMedico")?.value || "", paciente: document.getElementById("filtroPatronPaciente")?.value || "", institucion: document.getElementById("filtroPatronInstitucion")?.value || "", servicio: document.getElementById("filtroPatronServicio")?.value || "", desde: document.getElementById("filtroPatronDesde")?.value || "", hasta: document.getElementById("filtroPatronHasta")?.value || "" }; }
function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
const THRESHOLD_STORAGE_KEY = "cognicion.patternDiscovery.threshold";
const FUNCTION_WORDS_STORAGE_KEY = "cognicion.patternDiscovery.includeFunctionWords";
function leerUmbral() { try { const value = Number.parseInt(localStorage.getItem(THRESHOLD_STORAGE_KEY) || "", 10); return Number.isInteger(value) && value >= PATTERN_CONFIG.minimumThreshold && value <= PATTERN_CONFIG.maximumThreshold ? value : PATTERN_CONFIG.defaultThreshold; } catch { return PATTERN_CONFIG.defaultThreshold; } }
function guardarUmbral(value) { try { localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value)); } catch (error) { console.warn("[PATTERNS] No se pudo guardar la preferencia de umbral", error); } }
function leerIncluirConectores() { try { return localStorage.getItem(FUNCTION_WORDS_STORAGE_KEY) === "true"; } catch { return PATTERN_CONFIG.defaultIncludeFunctionWords; } }
function guardarIncluirConectores(value) { try { localStorage.setItem(FUNCTION_WORDS_STORAGE_KEY, String(Boolean(value))); } catch (error) { console.warn("[PATTERNS] No se pudo guardar la preferencia de conectores", error); } }
function normalizarUmbral(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= PATTERN_CONFIG.minimumThreshold && parsed <= PATTERN_CONFIG.maximumThreshold ? parsed : fallback; }

export async function inicializarMotorDescubrimientoPatrones(contexto) {
  asegurarAdmin(contexto);
  let destruido = false; let callablePromise = null; let resultados = []; let threshold = leerUmbral(); let includeFunctionWords = leerIncluirConectores();
  const listeners = [];
  const actualizarResumen = () => { const funcionalesOcultos = includeFunctionWords ? 0 : resultados.filter((pattern) => pattern.isFunctionWordPattern === true).length; const candidatosSinConectores = resultados.length - funcionalesOcultos; const confirmados = filterPatterns(resultados, { threshold, includeFunctionWords }); const ocultosUmbral = candidatosSinConectores - confirmados.length; const frecuencias = confirmados.map((pattern) => Number(pattern.frequency) || 0); const maximo = frecuencias.length ? Math.max(...frecuencias) : 0; const media = frecuencias.length ? frecuencias.reduce((total, value) => total + value, 0) / frecuencias.length : 0; setText("umbralPatronesTexto", `${threshold} apariciones`); setText("patronesDisponiblesPatronesTexto", resultados.length); setText("patronesVisiblesPatronesTexto", confirmados.length); setText("patronesOcultosConectoresPatronesTexto", funcionalesOcultos); setText("patronesOcultosUmbralPatronesTexto", ocultosUmbral); setText("frecuenciaMaximaPatronesTexto", maximo); setText("frecuenciaMediaPatronesTexto", media ? media.toFixed(1) : "0"); };
  const pintar = () => { actualizarResumen(); renderizarPatrones({ filas: resultados, filtros: obtenerFiltros(), threshold, includeFunctionWords }); };
  const actualizarControlUmbral = () => { const input = document.getElementById("umbralPatronesInput"); if (input) input.value = String(threshold); actualizarResumen(); pintar(); };
  const actualizarControlConectores = () => { const excluir = document.getElementById("btnExcluirConectores"); const incluir = document.getElementById("btnIncluirConectores"); excluir?.classList.toggle("activo", !includeFunctionWords); incluir?.classList.toggle("activo", includeFunctionWords); excluir?.setAttribute("aria-pressed", String(!includeFunctionWords)); incluir?.setAttribute("aria-pressed", String(includeFunctionWords)); pintar(); };
  const setError = (etapa, error) => { console.error(`[PATTERNS] ${etapa}`, error?.stack || error); setText("estadoPatronesTexto", `Error durante ${etapa}: ${error?.message || "error desconocido"}`); };
  const analizar = async () => {
    asegurarAdmin(contexto); if (destruido) return;
    const inicio = performance.now(); const boton = document.getElementById("btnAnalizarPatronesTexto");
    boton && (boton.disabled = true); setText("estadoPatronesTexto", "Analizando textos por lotes…"); setText("tiempoPatronesTexto", "en curso");
    try {
      if (!callablePromise) { const [functions, { httpsCallable }] = await Promise.all([obtenerFunctions(), import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")]); callablePromise = httpsCallable(functions, "discoverTextPatterns", { timeout: 120000 }); }
      const respuesta = await callablePromise({ filtros: obtenerFiltros(), threshold: PATTERN_CONFIG.minimumThreshold, batchSize: PATTERN_CONFIG.batchSize, pageSize: PATTERN_CONFIG.pageSize });
      if (destruido) return;
      resultados = Array.isArray(respuesta.data?.patterns) ? respuesta.data.patterns.map((pattern) => ({ ...pattern, isFunctionWordPattern: isFunctionWordPattern(pattern.normalizedPhrase || pattern.phrase) })) : [];
      const stats = respuesta.data?.stats || {};
      setText("documentosPatronesTexto", stats.documentsProcessed || 0); setText("lotesPatronesTexto", stats.batchesProcessed || 0); setText("candidatasPatronesTexto", stats.temporaryCandidates || 0); setText("tiempoPatronesTexto", `${Math.round(performance.now() - inicio)} ms`); setText("estadoPatronesTexto", `Análisis terminado: ${resultados.length} patrones disponibles desde 2 apariciones.`); pintar();
      document.getElementById("btnExportarPatronesExcel")?.removeAttribute("disabled"); document.getElementById("btnExportarPatronesCsv")?.removeAttribute("disabled");
    } catch (error) { setError("lectura", error); setText("tiempoPatronesTexto", `${Math.round(performance.now() - inicio)} ms`); } finally { boton && (boton.disabled = false); }
  };
  const limpiar = () => { resultados = []; renderizarPatrones({ filas: [], filtros: {}, threshold, includeFunctionWords }); ["documentosPatronesTexto", "lotesPatronesTexto", "candidatasPatronesTexto", "confirmadosPatronesTexto", "patronesDisponiblesPatronesTexto", "patronesVisiblesPatronesTexto", "patronesOcultosConectoresPatronesTexto", "patronesOcultosUmbralPatronesTexto", "frecuenciaMaximaPatronesTexto", "frecuenciaMediaPatronesTexto"].forEach((id) => setText(id, "0")); setText("tiempoPatronesTexto", "0 ms"); setText("estadoPatronesTexto", "Resultados temporales eliminados. No se han leído textos clínicos."); document.getElementById("btnExportarPatronesExcel")?.setAttribute("disabled", ""); document.getElementById("btnExportarPatronesCsv")?.setAttribute("disabled", ""); };
  const cambiarUmbral = (value) => { const nuevo = normalizarUmbral(value, threshold); if (nuevo !== Number(value)) { actualizarControlUmbral(); setText("estadoPatronesTexto", `El umbral debe ser un entero entre ${PATTERN_CONFIG.minimumThreshold} y ${PATTERN_CONFIG.maximumThreshold}.`); return; } threshold = nuevo; guardarUmbral(threshold); actualizarControlUmbral(); };
  const analizarButton = document.getElementById("btnAnalizarPatronesTexto"); const excelButton = document.getElementById("btnExportarPatronesExcel"); const csvButton = document.getElementById("btnExportarPatronesCsv"); const limpiarButton = document.getElementById("btnLimpiarPatronesTexto"); const thresholdInput = document.getElementById("umbralPatronesInput"); const thresholdMinus = document.getElementById("btnUmbralPatronesMenos"); const thresholdPlus = document.getElementById("btnUmbralPatronesMas"); const excluirButton = document.getElementById("btnExcluirConectores"); const incluirButton = document.getElementById("btnIncluirConectores");
  if (thresholdInput) thresholdInput.value = String(threshold);
  const exportExcel = () => { try { exportarPatronesExcel(filterPatterns(resultados, { threshold, includeFunctionWords }), { threshold, includeFunctionWords }); } catch (error) { setError("exportación", error); } };
  const exportCsv = () => { try { exportarPatronesCsv(filterPatterns(resultados, { threshold, includeFunctionWords }), { threshold, includeFunctionWords }); } catch (error) { setError("exportación", error); } };
  const cambiarConectores = (value) => { includeFunctionWords = Boolean(value); guardarIncluirConectores(includeFunctionWords); actualizarControlConectores(); };
  const cambiarUmbralDesdeInput = () => cambiarUmbral(thresholdInput.value);
  const disminuirUmbral = () => cambiarUmbral(threshold - 1);
  const aumentarUmbral = () => cambiarUmbral(threshold + 1);
  const excluirConectores = () => cambiarConectores(false); const incluirConectores = () => cambiarConectores(true);
  analizarButton?.addEventListener("click", analizar); excelButton?.addEventListener("click", exportExcel); csvButton?.addEventListener("click", exportCsv); limpiarButton?.addEventListener("click", limpiar); thresholdInput?.addEventListener("change", cambiarUmbralDesdeInput); thresholdMinus?.addEventListener("click", disminuirUmbral); thresholdPlus?.addEventListener("click", aumentarUmbral); excluirButton?.addEventListener("click", excluirConectores); incluirButton?.addEventListener("click", incluirConectores);
  listeners.push(() => analizarButton?.removeEventListener("click", analizar), () => excelButton?.removeEventListener("click", exportExcel), () => csvButton?.removeEventListener("click", exportCsv), () => limpiarButton?.removeEventListener("click", limpiar), () => thresholdInput?.removeEventListener("change", cambiarUmbralDesdeInput), () => thresholdMinus?.removeEventListener("click", disminuirUmbral), () => thresholdPlus?.removeEventListener("click", aumentarUmbral), () => excluirButton?.removeEventListener("click", excluirConectores), () => incluirButton?.removeEventListener("click", incluirConectores));
  ["filtroPatronBusqueda", "filtroPatronMedico", "filtroPatronPaciente", "filtroPatronInstitucion", "filtroPatronServicio", "filtroPatronDesde", "filtroPatronHasta"].forEach((id) => { const element = document.getElementById(id); if (!element) return; element.addEventListener("input", pintar); listeners.push(() => element.removeEventListener("input", pintar)); });
  actualizarControlConectores();
  console.log("[PATTERNS] Interfaz inicializada; análisis detenido hasta clic explícito");
  return { destruirMotorDescubrimientoPatrones() { if (destruido) return; destruido = true; listeners.splice(0).forEach((remove) => remove()); resultados = []; callablePromise = null; console.log("[PATTERNS] Resultados temporales liberados"); } };
}
