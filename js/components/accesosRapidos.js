const PREFIJO_CLAVE_ACCESOS = "cognicion.accesosRapidos.lista";
const CLAVE_DESTINO_LEGADO = "cognicion.accesosRapidos.destino";
const LIMITE_RESULTADOS = 8;
const PAGINAS_SIN_ACCESOS_RAPIDOS = new Set([
  "index.html",
  "login.html",
  "registro.html",
  "recuperar.html"
]);
let eventosGlobalesConfigurados = false;
let inicializacionProgramada = false;

export const OPCIONES_ACCESOS_RAPIDOS = Object.freeze([
  { value: "dashboard.html", label: "Dashboard", keywords: "inicio panel principal" },
  { value: "medico.html", label: "Panel médico", keywords: "pacientes médico hospital" },
  { value: "paciente.html", label: "Expediente de paciente", keywords: "paciente expediente datos generales" },
  { value: "pacientes.html", label: "Pacientes", keywords: "lista pacientes" },
  { value: "nuevo-paciente.html", label: "Nuevo paciente", keywords: "registro crear paciente" },
  { value: "nota.html", label: "Nota clínica", keywords: "notas dictado evolución" },
  { value: "historia.html", label: "Historia clínica", keywords: "antecedentes ficha exploración" },
  { value: "agenda.html", label: "Agenda médica", keywords: "citas calendario" },
  { value: "apuntes.html", label: "Mis apuntes", keywords: "apuntes notas personales" },
  { value: "mi-nube.html", label: "Mi nube", keywords: "archivos carpetas pdf imagenes texto almacenamiento personal" },
  { value: "mi-salud.html", label: "Mi Salud", keywords: "paciente salud tratamiento" },
  { value: "escalas.html", label: "Escalas clínicas", keywords: "tamizajes phq gad ciwa cognitivo" },
  { value: "calculadoras-medicas.html", label: "Calculadoras y escalas clínicas", keywords: "calculadoras medicina riesgo dosis" },
  { value: "calculadora-benzodiacepinas.html", label: "Calculadora de benzodiacepinas", keywords: "benzodiacepinas equivalencias diazepam" },
  { value: "calculadoras-pediatricas.html", label: "Calculadoras pediátricas", keywords: "pediatría dosis niños percentiles" },
  { value: "pediatria.html", label: "Centro pediátrico", keywords: "pediatría niño menor edad" },
  { value: "laboratorio-farmacologia.html", label: "Laboratorio de farmacología", keywords: "interacciones medicamentos farmacología" },
  { value: "laboratorio-neurofisiologia.html", label: "Laboratorio de neurofisiología", keywords: "neuronas sinapsis membrana iones" },
  { value: "rehabilitacion-cognitiva.html", label: "Rehabilitación cognitiva", keywords: "cognición memoria atención ejercicios" },
  { value: "nback.html", label: "1-Back", keywords: "memoria trabajo atención" },
  { value: "stroop.html", label: "Stroop", keywords: "inhibición atención" },
  { value: "go-nogo.html", label: "Go / No-Go", keywords: "impulsividad inhibición" },
  { value: "busqueda-visual.html", label: "Búsqueda visual", keywords: "atención visual" },
  { value: "reconocimiento-emociones.html", label: "Reconocimiento de emociones", keywords: "emociones cognición social" },
  { value: "respiracion.html", label: "Asistente de respiración", keywords: "mindfulness respiración" },
  { value: "biblioteca.html", label: "Biblioteca médica", keywords: "biblioteca recursos lectura medicina" },
  { value: "foro.html", label: "Foro Cognición", keywords: "foro comunidad mensajes" },
  { value: "sofia.html", label: "SOFÍA", keywords: "asistente inteligencia artificial" },
  { value: "detector-patrones.html", label: "Detector de Patrones Clínicos", keywords: "paciente patrones evidencia BSS Beck trayectoria" },
  { value: "perfil-profesional.html", label: "Perfil profesional", keywords: "perfil cédula especialidad" },
  { value: "configuracion.html", label: "Configuración", keywords: "apariencia tema cuenta" },
  { value: "admin.html", label: "Centro de Control", keywords: "admin administración reportes usuarios" }
]);

function asegurarEstilos() {
  if (!document.querySelector('style[data-estilos-criticos-accesos-rapidos]')) {
    const style = document.createElement("style");
    style.dataset.estilosCriticosAccesosRapidos = "true";
    style.textContent = `
      [data-accesos-rapidos] .accesos-rapidos-panel {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(-8px);
      }
      [data-accesos-rapidos].abierto .accesos-rapidos-panel {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  if (document.querySelector('link[data-estilos-accesos-rapidos]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/accesos-rapidos.css?v=1.899";
  link.dataset.estilosAccesosRapidos = "true";
  document.head.appendChild(link);
}

function escaparHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paginaActual() {
  const nombre = window.location.pathname.split("/").pop() || "index.html";
  return nombre.toLowerCase();
}

function esTareaAdhdEmbebidaAutenticada() {
  if (document.documentElement.dataset.cognicionEmbed === "adhd-task") return true;
  const parameters = new URLSearchParams(window.location.search);
  const bootstrapName = String(window.name || "");
  let sameOriginParent = false;
  try {
    sameOriginParent = window.self !== window.top && window.parent.location.origin === window.location.origin;
  } catch (_) {
    sameOriginParent = false;
  }
  return parameters.get("adhd") === "1"
    && parameters.get("embed") === "1"
    && sameOriginParent
    && /^cognicion-adhd-bridge:[a-zA-Z0-9_-]{8,160}$/u.test(bootstrapName);
}

function debeOmitirAccesosRapidos() {
  const tareaAdhdEmbebida = esTareaAdhdEmbebidaAutenticada();
  const bibliotecaPublica = paginaActual() === "biblioteca.html"
    && new URLSearchParams(window.location.search).get("modo") === "publico";
  return tareaAdhdEmbebida || bibliotecaPublica || PAGINAS_SIN_ACCESOS_RAPIDOS.has(paginaActual());
}

function obtenerUidFirebaseLocal() {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || "";
      if (!key.startsWith("firebase:authUser:")) continue;
      const datos = JSON.parse(localStorage.getItem(key) || "null");
      if (datos?.uid) return datos.uid;
    }
  } catch {
    // Si no se puede leer el usuario local, se usa una clave anónima aislada.
  }
  return "";
}

function claveAccesosUsuario() {
  const uid = obtenerUidFirebaseLocal();
  return `${PREFIJO_CLAVE_ACCESOS}.${uid || "anonimo"}`;
}

function normalizarLista(lista = []) {
  const permitidos = new Set(OPCIONES_ACCESOS_RAPIDOS.map((opcion) => opcion.value));
  const unicos = [];
  lista.forEach((value) => {
    if (
      permitidos.has(value) &&
      !unicos.includes(value)
    ) {
      unicos.push(value);
    }
  });
  return unicos;
}

function leerAccesos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(claveAccesosUsuario()) || "null");
    if (Array.isArray(guardado)) return normalizarLista(guardado);

    const legado = obtenerUidFirebaseLocal() ? "" : localStorage.getItem(CLAVE_DESTINO_LEGADO);
    if (legado) return normalizarLista([legado]);
  } catch {
    // Si el almacenamiento falla, se muestra la lista vacia.
  }
  return [];
}

function guardarAccesos(lista) {
  try {
    localStorage.setItem(claveAccesosUsuario(), JSON.stringify(normalizarLista(lista)));
  } catch {
    // La navegación sigue funcionando aunque el navegador bloquee localStorage.
  }
}

function obtenerOpcion(value) {
  return OPCIONES_ACCESOS_RAPIDOS.find((opcion) => opcion.value === value);
}

function cerrarPanel(contenedor) {
  contenedor.classList.remove("abierto");
  contenedor.querySelector("[data-acceso-toggle]")?.setAttribute("aria-expanded", "false");
  contenedor.querySelector("[data-acceso-panel]")?.setAttribute("aria-hidden", "true");
}

function cerrarOtros(actual) {
  document.querySelectorAll("[data-accesos-rapidos].abierto").forEach((contenedor) => {
    if (contenedor !== actual) cerrarPanel(contenedor);
  });
}

function coincideBusqueda(opcion, texto) {
  if (!texto) return true;
  const base = `${opcion.label} ${opcion.value} ${opcion.keywords || ""}`.toLowerCase();
  return base.includes(texto.toLowerCase());
}

function agregarAcceso(contenedor, value) {
  if (!value) return;
  const buscador = contenedor.querySelector("[data-acceso-busqueda]");
  const lista = normalizarLista([value, ...leerAccesos()]);
  guardarAccesos(lista);
  renderizarResultados(contenedor, buscador?.value || "");
  renderizarGuardados(contenedor, lista);
}

function renderizarGuardados(contenedor, lista) {
  const guardados = contenedor.querySelector("[data-acceso-guardados]");
  if (!guardados) return;

  guardados.innerHTML = lista.map((value) => {
    const opcion = obtenerOpcion(value);
    if (!opcion) return "";
    return `
      <li>
        <button type="button" data-acceso-abrir="${escaparHTML(opcion.value)}">${escaparHTML(opcion.label)}</button>
        <button type="button" class="quitar" data-acceso-quitar="${escaparHTML(opcion.value)}" aria-label="Quitar ${escaparHTML(opcion.label)}">×</button>
      </li>
    `;
  }).join("");
}

function renderizarResultados(contenedor, texto = "") {
  const resultados = contenedor.querySelector("[data-acceso-resultados]");
  if (!resultados) return;

  if (!String(texto || "").trim()) {
    resultados.innerHTML = "";
    return;
  }

  const encontrados = OPCIONES_ACCESOS_RAPIDOS
    .filter((opcion) => coincideBusqueda(opcion, texto))
    .slice(0, LIMITE_RESULTADOS);

  resultados.innerHTML = encontrados.length
    ? encontrados.map((opcion) => {
      return `
        <div class="accesos-rapidos-resultado-item">
          <span>${escaparHTML(opcion.label)}</span>
          <span class="accesos-rapidos-resultado-acciones">
            <button type="button" data-acceso-abrir="${escaparHTML(opcion.value)}" aria-label="Ir a ${escaparHTML(opcion.label)}">Ir</button>
            <button type="button" data-acceso-agregar="${escaparHTML(opcion.value)}" aria-label="Agregar ${escaparHTML(opcion.label)} a accesos rápidos">+</button>
          </span>
        </div>
      `;
    }).join("")
    : `<p class="sin-resultados">No se encontraron páginas.</p>`;
}

function crearContenedorAutomatico() {
  const contenedorExistente = document.querySelector("[data-accesos-rapidos]");
  if (contenedorExistente) {
    contenedorExistente.dataset.accesosGlobal = "true";
    return;
  }

  let barra = document.querySelector("[data-accesos-rapidos-global]");
  if (!barra) {
    barra = document.createElement("div");
    barra.className = "accesos-rapidos-global";
    barra.dataset.accesosRapidosGlobal = "true";
    document.body.prepend(barra);
  }

  const contenedor = document.createElement("div");
  contenedor.dataset.accesosRapidos = "";
  contenedor.dataset.accesosAuto = "true";

  contenedor.dataset.accesosGlobal = "true";
  barra.appendChild(contenedor);
}

function asegurarCampanaVisualGlobal() {
  if (document.querySelector('[data-global-app-header]') || document.querySelector('[aria-label*="notific" i], [data-global-notifications-link]')) return;
  const barra = document.querySelector("[data-accesos-rapidos-global]");
  if (!barra) return;
  const enlace = document.createElement("a");
  enlace.className = "accion-global-medico accion-global-icono global-notifications-link";
  enlace.href = "dashboard.html#avisosDashboardModulo";
  enlace.dataset.globalNotificationsLink = "true";
  enlace.setAttribute("aria-label", "Abrir notificaciones");
  enlace.innerHTML = `<span class="icono-lineal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg></span>`;
  barra.prepend(enlace);
}

function renderizar(contenedor) {
  if (contenedor.dataset.accesosInicializados === "true") return;
  contenedor.parentElement?.classList.add("nav-accesos-rapidos");
  contenedor.classList.add("accesos-rapidos");
  contenedor.innerHTML = `
    <button class="accesos-rapidos-toggle" type="button" data-acceso-toggle aria-expanded="false">
      <span aria-hidden="true">⚡</span> Accesos rápidos
    </button>
    <div class="accesos-rapidos-panel" data-acceso-panel aria-hidden="true">
      <strong class="titulo-secundario">Mis accesos</strong>
      <ul class="accesos-rapidos-guardados" data-acceso-guardados></ul>
      <label>
        Buscar página
        <input type="search" data-acceso-busqueda placeholder="Ej. notas, farmacia, panel, escalas">
      </label>
      <div class="accesos-rapidos-resultados" data-acceso-resultados></div>
      <div class="accesos-rapidos-separador"></div>
      <button class="accesos-rapidos-actual" type="button" data-acceso-agregar-actual>
        <span aria-hidden="true">+</span> Agregar página actual
      </button>
    </div>`;

  contenedor.dataset.accesosInicializados = "true";
  renderizarResultados(contenedor);
  renderizarGuardados(contenedor, leerAccesos());

  const toggle = contenedor.querySelector("[data-acceso-toggle]");
  const panel = contenedor.querySelector("[data-acceso-panel]");
  const buscador = contenedor.querySelector("[data-acceso-busqueda]");

  toggle.addEventListener("click", () => {
    const abrir = !contenedor.classList.contains("abierto");
    cerrarOtros(contenedor);
    contenedor.classList.toggle("abierto", abrir);
    toggle.setAttribute("aria-expanded", String(abrir));
    panel.setAttribute("aria-hidden", String(!abrir));
    if (abrir) {
      renderizarResultados(contenedor, buscador.value);
      renderizarGuardados(contenedor, leerAccesos());
      window.setTimeout(() => buscador.focus(), 40);
    }
  });

  buscador.addEventListener("input", () => renderizarResultados(contenedor, buscador.value));

  contenedor.addEventListener("click", (event) => {
    const agregar = event.target.closest("[data-acceso-agregar]");
    const agregarActual = event.target.closest("[data-acceso-agregar-actual]");
    const abrir = event.target.closest("[data-acceso-abrir]");
    const quitar = event.target.closest("[data-acceso-quitar]");

    if (agregar) {
      agregarAcceso(contenedor, agregar.dataset.accesoAgregar);
      return;
    }

    if (agregarActual) {
      agregarAcceso(contenedor, paginaActual());
      return;
    }

    if (abrir) {
      window.open(abrir.dataset.accesoAbrir, "_blank", "noopener");
      cerrarPanel(contenedor);
      return;
    }

    if (quitar) {
      const lista = leerAccesos().filter((value) => value !== quitar.dataset.accesoQuitar);
      const item = quitar.closest("li");
      item?.classList.add("quitando");
      window.setTimeout(() => {
        guardarAccesos(lista);
        renderizarResultados(contenedor, buscador.value);
        renderizarGuardados(contenedor, lista);
      }, 120);
    }
  });
}

export function inicializarAccesosRapidos(root = document) {
  if (debeOmitirAccesosRapidos()) return;
  configurarEventosGlobalesAccesos();
  asegurarEstilos();
  crearContenedorAutomatico();
  asegurarCampanaVisualGlobal();
  root.querySelectorAll("[data-accesos-rapidos]").forEach(renderizar);
}

function configurarEventosGlobalesAccesos() {
  if (eventosGlobalesConfigurados) return;
  eventosGlobalesConfigurados = true;

  document.addEventListener("click", (event) => {
    document.querySelectorAll("[data-accesos-rapidos].abierto").forEach((contenedor) => {
      if (!contenedor.contains(event.target)) cerrarPanel(contenedor);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-accesos-rapidos].abierto").forEach(cerrarPanel);
  });
}

function ejecutarCuandoEsteDisponible(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1800 });
    return;
  }
  window.setTimeout(callback, 650);
}

function programarInicializacionAccesosRapidos() {
  if (inicializacionProgramada) return;
  inicializacionProgramada = true;
  ejecutarCuandoEsteDisponible(() => inicializarAccesosRapidos());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", programarInicializacionAccesosRapidos, { once: true });
} else {
  programarInicializacionAccesosRapidos();
}
