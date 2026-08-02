import { obtenerFunctions } from "../../firebase.js";
import { renderizarPatrones } from "./patternRenderer.js";

function asegurarAdmin({ authUser, userRole } = {}) {
  if (!authUser || String(userRole || "").toLowerCase() !== "admin") {
    throw new Error("PATTERN_DISCOVERY_FORBIDDEN");
  }
}

function obtenerFiltros() {
  return {
    busqueda: document.getElementById("filtroPatronBusqueda")?.value || "",
    medico: document.getElementById("filtroPatronMedico")?.value || "",
    paciente: document.getElementById("filtroPatronPaciente")?.value || "",
    institucion: document.getElementById("filtroPatronInstitucion")?.value || "",
    servicio: document.getElementById("filtroPatronServicio")?.value || "",
    desde: document.getElementById("filtroPatronDesde")?.value || "",
    hasta: document.getElementById("filtroPatronHasta")?.value || ""
  };
}

export async function inicializarMotorDescubrimientoPatrones(contexto) {
  asegurarAdmin(contexto);
  const idsFiltros = ["filtroPatronBusqueda", "filtroPatronMedico", "filtroPatronPaciente", "filtroPatronInstitucion", "filtroPatronServicio", "filtroPatronDesde", "filtroPatronHasta"];
  const listeners = [];
  let destruido = false;
  let callablePromise = null;
  let filas = [];
  let totalNotas = 0;

  const pintar = () => renderizarPatrones({ filas, totalNotas, filtros: obtenerFiltros() });
  const cargarDatos = async () => {
    asegurarAdmin(contexto);
    if (destruido) return;
    const estado = document.getElementById("estadoPatronesTexto");
    estado.textContent = "Solicitando resultados agregados al servicio administrativo…";
    if (!callablePromise) {
      const [functions, { httpsCallable }] = await Promise.all([
        obtenerFunctions(),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js")
      ]);
      callablePromise = httpsCallable(functions, "discoverTextPatterns", { timeout: 120000 });
    }
    const respuesta = await callablePromise({ filtros: obtenerFiltros(), limite: 500 });
    if (destruido) return;
    filas = Array.isArray(respuesta.data?.filas) ? respuesta.data.filas : [];
    totalNotas = Number(respuesta.data?.totalNotas || 0);
    estado.textContent = `Resultados agregados: ${filas.length} patrones · ${totalNotas} notas consideradas.`;
    pintar();
  };

  idsFiltros.forEach((id) => {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    const handler = pintar;
    elemento.addEventListener("input", handler);
    listeners.push(() => elemento.removeEventListener("input", handler));
  });
  const actualizar = document.getElementById("btnActualizarPatronesTexto");
  actualizar?.addEventListener("click", cargarDatos);
  listeners.push(() => actualizar?.removeEventListener("click", cargarDatos));

  console.log("[PATTERNS] Interfaz inicializada; sin consultas hasta acción explícita");
  return {
    cargarDatos,
    destruirMotorDescubrimientoPatrones() {
      if (destruido) return;
      destruido = true;
      listeners.splice(0).forEach((remover) => remover());
      callablePromise = null;
      filas = [];
      totalNotas = 0;
      console.log("[PATTERNS] Instancia destruida");
    }
  };
}
